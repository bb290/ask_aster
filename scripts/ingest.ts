// Ask Aster v0 — ingest script
//
// Walks ../sops/, parses YAML frontmatter, chunks bodies by H2 (## headings),
// embeds each chunk via OpenRouter, and upserts into the Supabase `sops` table.
//
// Run from repo root:
//   deno run --allow-read --allow-env --allow-net scripts/ingest.ts
//
// Required env vars:
//   SUPABASE_URL                   — e.g. https://ahonotvcbmczrtnpajua.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY      — service role key (NOT anon)
//   OPENROUTER_API_KEY             — OpenRouter API key
//
// v0 strategy: every run re-embeds every chunk (truncate + insert). Cheap
// (~$0.04, ~15 min) for ~750 files. v0.5 will add content-fingerprinting to
// skip unchanged chunks if this becomes annoying.

import { createClient } from "npm:@supabase/supabase-js@2.47.10";
import { walk } from "jsr:@std/fs@1.0.6/walk";
import { parse as parseYAML } from "jsr:@std/yaml@1.0.5";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENROUTER_API_KEY) {
  console.error("Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENROUTER_API_KEY");
  Deno.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

// --- Frontmatter parsing ---

type Frontmatter = {
  title: string;
  service_line: string;
  sop_owner?: string;
  status?: string;
  last_reviewed?: string;
  visibility_tier: "ic" | "director";
  version?: number;
  tags?: string[];
  created_but_never_updated?: boolean;
};

function parseFrontmatter(raw: string): { fm: Frontmatter | null; body: string } {
  if (!raw.startsWith("---")) return { fm: null, body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { fm: null, body: raw };
  const yamlText = raw.slice(3, end).trim();
  const body = raw.slice(end + 4).replace(/^\n/, "");
  try {
    const fm = parseYAML(yamlText) as Frontmatter;
    return { fm, body };
  } catch (e) {
    console.warn(`  ⚠ frontmatter parse error: ${(e as Error).message}`);
    return { fm: null, body };
  }
}

// --- H2 chunking ---
// Split body wherever a line starts with "## ". Text before the first H2
// (if any) is chunk_index 0 with chunk_heading = null. Files with no H2
// become a single chunk with chunk_heading = null.

type Chunk = { index: number; heading: string | null; content: string };

function chunkByH2(body: string): Chunk[] {
  const lines = body.split("\n");
  const chunks: Chunk[] = [];
  let currentHeading: string | null = null;
  let currentLines: string[] = [];
  let index = 0;

  const flush = () => {
    const text = currentLines.join("\n").trim();
    if (text.length > 0) {
      chunks.push({ index: index++, heading: currentHeading, content: text });
    }
  };

  for (const line of lines) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) {
      flush();
      currentHeading = m[1];
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }
  flush();

  return chunks;
}

// --- Embedding ---

async function embed(text: string, attempt = 1): Promise<number[]> {
  const r = await fetch(`${OPENROUTER_BASE}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/text-embedding-3-small",
      input: text,
    }),
  });
  if (!r.ok) {
    if (attempt < 3 && (r.status === 429 || r.status >= 500)) {
      const wait = attempt * 2000;
      console.warn(`  ⚠ embed retry ${attempt} after ${wait}ms (status ${r.status})`);
      await new Promise((res) => setTimeout(res, wait));
      return embed(text, attempt + 1);
    }
    const msg = await r.text().catch(() => "");
    throw new Error(`OpenRouter embeddings failed: ${r.status} ${msg}`);
  }
  const d = await r.json();
  return d.data[0].embedding;
}

// --- Main ---

const REPO_ROOT = new URL("../", import.meta.url).pathname;
const SOPS_DIR = `${REPO_ROOT}sops`;

async function main() {
  // Confirm target table is reachable
  const { error: pingErr } = await supabase.from("sops").select("id").limit(1);
  if (pingErr) {
    console.error(`Cannot read sops table: ${pingErr.message}`);
    console.error("Have you run sql/01_schema.sql and sql/02_match_sops.sql against the project?");
    Deno.exit(1);
  }

  // Truncate before reingest (v0 strategy)
  console.log("Truncating sops table…");
  const { error: truncErr } = await supabase.rpc("truncate_sops");
  if (truncErr) {
    // Fall back to delete-all if RPC not present
    const { error: delErr } = await supabase.from("sops").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (delErr) {
      console.error(`Truncate failed: ${delErr.message}`);
      Deno.exit(1);
    }
  }

  let fileCount = 0;
  let chunkCount = 0;
  let skipCount = 0;
  const start = Date.now();

  for await (const entry of walk(SOPS_DIR, { exts: [".md"], includeDirs: false })) {
    const relPath = entry.path.replace(REPO_ROOT, "");
    const raw = await Deno.readTextFile(entry.path);
    const { fm, body } = parseFrontmatter(raw);

    if (!fm || !fm.title || !fm.service_line || !fm.visibility_tier) {
      console.warn(`SKIP ${relPath} — missing required frontmatter`);
      skipCount++;
      continue;
    }

    const chunks = chunkByH2(body);
    if (chunks.length === 0) {
      console.warn(`SKIP ${relPath} — empty body`);
      skipCount++;
      continue;
    }

    fileCount++;

    for (const chunk of chunks) {
      // Prepend the title and (if present) heading to the chunk text before embedding.
      // This gives the embedding model topical context that titles/headings provide.
      const embedInput = [
        `Title: ${fm.title}`,
        fm.service_line ? `Service line: ${fm.service_line}` : null,
        chunk.heading ? `Section: ${chunk.heading}` : null,
        "",
        chunk.content,
      ].filter((x) => x !== null).join("\n");

      const embedding = await embed(embedInput);

      const { error } = await supabase.from("sops").insert({
        file_path: relPath,
        chunk_index: chunk.index,
        chunk_heading: chunk.heading,
        content: chunk.content,
        embedding,
        title: fm.title,
        service_line: fm.service_line,
        sop_owner: fm.sop_owner ?? null,
        status: fm.status ?? "active",
        last_reviewed: fm.last_reviewed ?? null,
        visibility_tier: fm.visibility_tier,
        version: fm.version ?? 1,
        tags: fm.tags ?? [],
        created_but_never_updated: fm.created_but_never_updated ?? false,
      });

      if (error) {
        console.error(`  ✗ ${relPath} chunk ${chunk.index}: ${error.message}`);
      } else {
        chunkCount++;
      }
    }

    if (fileCount % 25 === 0) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(0);
      console.log(`  ${fileCount} files, ${chunkCount} chunks (${elapsed}s elapsed)`);
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(0);
  console.log("");
  console.log(`Done. ${fileCount} files → ${chunkCount} chunks in ${elapsed}s. ${skipCount} skipped.`);
}

await main();
