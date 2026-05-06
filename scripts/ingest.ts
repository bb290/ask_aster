// Ask Aster v0 — ingest script
//
// Walks ../sops/, ../incidents/, ../decisions/, ../edge-cases/, parses YAML
// frontmatter, chunks bodies by H2 (## headings), embeds each chunk via
// OpenRouter, and upserts into the Supabase `sops` table.
//
// All four content types share one table for v0.5. Document type is recorded
// in the `tags` column and inferred from the top-level folder if not in
// frontmatter. file_path is preserved verbatim so retrieval can show provenance.
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
  // Common — title required for SOPs but derivable from H1 for captures
  title?: string;
  type?: string;                                // incident | decision | edge_case | sop (else inferred from path)
  service_line?: string;                        // optional for captures; defaults to "general"
  visibility_tier?: "ic" | "director";          // defaults to "ic"
  status?: string;
  tags?: string[];
  // SOP-shaped
  sop_owner?: string;
  last_reviewed?: string;
  version?: number;
  created_but_never_updated?: boolean;
  // Capture-shaped (decisions / incidents / edge cases). Accepted but most
  // are not indexed as columns — they live in the markdown body or in
  // the schema's tags column when useful.
  decision_owner?: string;
  date?: string;
  incident_date?: string;
  recorded_date?: string;
  prepared_by?: string;
  property?: string;
  severity?: string;
  involves?: string[];
  triggered_by?: string[];
  related_decisions?: string[];
  sops_to_update?: string[];
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

// --- Title fallback ---
// Capture files (incidents / decisions / edge cases) typically have an H1
// like "# Decision — ..." instead of a frontmatter title. Use that as a
// fallback so they don't get skipped.

function extractH1Title(body: string): string | null {
  for (const line of body.split("\n")) {
    const m = line.match(/^#\s+(.+?)\s*$/);
    if (m) return m[1].trim();
  }
  return null;
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
  if (text.length > 30000) {
    console.warn(`  ⚠ chunk is ${text.length} chars (~${Math.round(text.length / 4)} tokens) — may exceed embedding context window`);
  }
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
  const bodyText = await r.text();
  if (!r.ok) {
    if (attempt < 3 && (r.status === 429 || r.status >= 500)) {
      const wait = attempt * 2000;
      console.warn(`  ⚠ embed retry ${attempt} after ${wait}ms (status ${r.status})`);
      await new Promise((res) => setTimeout(res, wait));
      return embed(text, attempt + 1);
    }
    throw new Error(`OpenRouter embeddings failed: ${r.status} ${bodyText.slice(0, 300)}`);
  }
  let d: { data?: Array<{ embedding?: number[] }> };
  try {
    d = JSON.parse(bodyText);
  } catch {
    throw new Error(`OpenRouter returned non-JSON body (status ${r.status}): ${bodyText.slice(0, 300)}`);
  }
  if (!d?.data?.[0]?.embedding) {
    throw new Error(`OpenRouter response missing data[0].embedding (status ${r.status}): ${bodyText.slice(0, 500)}`);
  }
  return d.data[0].embedding;
}

// --- Main ---

const REPO_ROOT = new URL("../", import.meta.url).pathname;
const ROOTS = ["sops", "incidents", "decisions", "edge-cases"];

function inferTypeFromPath(relPath: string): string {
  if (relPath.startsWith("sops/")) return "sop";
  if (relPath.startsWith("incidents/")) return "incident";
  if (relPath.startsWith("decisions/")) return "decision";
  if (relPath.startsWith("edge-cases/")) return "edge_case";
  return "unknown";
}

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

  for (const rootName of ROOTS) {
    const rootPath = `${REPO_ROOT}${rootName}`;
    try {
      const stat = await Deno.stat(rootPath);
      if (!stat.isDirectory) continue;
    } catch {
      console.log(`Skipping ${rootName}/ — not present yet`);
      continue;
    }

    for await (const entry of walk(rootPath, { exts: [".md"], includeDirs: false })) {
      const relPath = entry.path.replace(REPO_ROOT, "");
      const raw = await Deno.readTextFile(entry.path);
      const { fm: rawFm, body } = parseFrontmatter(raw);
      const fm: Frontmatter = rawFm ?? {};

      // Resolve fields with fallbacks tolerant of capture frontmatter shapes
      const title = fm.title ?? extractH1Title(body);
      const serviceLine = fm.service_line ?? "general";
      const visTier = fm.visibility_tier ?? "ic";
      const docType = fm.type ?? inferTypeFromPath(relPath);
      const owner = fm.sop_owner ?? fm.decision_owner ?? fm.prepared_by ?? null;
      const reviewedDate = fm.last_reviewed ?? fm.date ?? fm.recorded_date ?? fm.incident_date ?? null;
      // Schema status CHECK only allows active|draft|deprecated (SOP-shaped).
      // Capture types use ongoing|resolved|open|etc. — preserve the real value
      // in the markdown body but coerce the DB column to a permitted value.
      const ALLOWED_DB_STATUSES = new Set(["active", "draft", "deprecated"]);
      const dbStatus = ALLOWED_DB_STATUSES.has(fm.status ?? "") ? fm.status! : "active";

      if (!title) {
        console.warn(`SKIP ${relPath} — no title in frontmatter and no H1 in body`);
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
        // Prepend title, type, and (if present) section heading to the chunk
        // text before embedding. Including type in the embed prompt biases
        // retrieval toward type-specific queries ("show me incidents at X").
        const embedInput = [
          `Title: ${title}`,
          `Type: ${docType}`,
          `Service line: ${serviceLine}`,
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
          title,
          service_line: serviceLine,
          sop_owner: owner,
          status: dbStatus,
          last_reviewed: reviewedDate,
          visibility_tier: visTier,
          version: fm.version ?? 1,
          // Inject docType into tags so retrieval can filter by type without
          // a schema migration. Existing tags preserved.
          tags: Array.from(new Set([...(fm.tags ?? []), docType])),
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
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(0);
  console.log("");
  console.log(`Done. ${fileCount} files → ${chunkCount} chunks in ${elapsed}s. ${skipCount} skipped.`);
}

await main();
