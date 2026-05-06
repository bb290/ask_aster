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
// v0.5 strategy: incremental ingest using a content_hash column. Each chunk's
// embed input is SHA-256 hashed; if the hash matches an existing row's hash
// at the same (file_path, chunk_index), we skip the embed/insert entirely.
// First run after the v0.5 migration re-embeds everything (existing rows
// have null hash); subsequent runs re-embed only files with actual changes.
// Files that disappear from the repo are cleaned up at the end of each run.

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

// --- Content hashing for incremental ingest ---
// Each chunk's embed input is hashed; we store the hash alongside the row
// and skip the embed/insert if the hash matches what's already in the DB.

async function hashContent(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function main() {
  // Confirm target table is reachable (and content_hash column exists)
  const { error: pingErr } = await supabase.from("sops").select("id, content_hash").limit(1);
  if (pingErr) {
    console.error(`Cannot read sops table or content_hash column: ${pingErr.message}`);
    console.error("Have you run sql/01_schema.sql, sql/02_match_sops.sql, and sql/03_content_hash.sql?");
    Deno.exit(1);
  }

  console.log("Incremental ingest — re-embeds only files whose chunks changed");
  const seenPaths = new Set<string>();
  let updatedFileCount = 0;
  let unchangedFileCount = 0;
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

      // Build new chunk descriptors with content hashes
      const candidates = await Promise.all(chunks.map(async (chunk) => {
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
        const content_hash = await hashContent(embedInput);
        return { chunk, embedInput, content_hash };
      }));

      seenPaths.add(relPath);

      // Compare candidate hashes against existing rows for this file_path.
      // If counts and hashes all match, skip the file entirely.
      const { data: existing, error: existingErr } = await supabase
        .from("sops")
        .select("chunk_index, content_hash")
        .eq("file_path", relPath);

      if (existingErr) {
        console.error(`  ✗ ${relPath} compare: ${existingErr.message}`);
        continue;
      }

      const existingMap = new Map(
        (existing ?? []).map((r) => [r.chunk_index as number, r.content_hash as string | null]),
      );

      const allMatch = candidates.length === existingMap.size &&
        candidates.every((c) => existingMap.get(c.chunk.index) === c.content_hash);

      if (allMatch) {
        unchangedFileCount++;
        if ((updatedFileCount + unchangedFileCount) % 100 === 0) {
          const elapsed = ((Date.now() - start) / 1000).toFixed(0);
          console.log(`  scanned ${updatedFileCount + unchangedFileCount} files (${updatedFileCount} updated, ${unchangedFileCount} unchanged), ${chunkCount} chunks embedded, ${elapsed}s`);
        }
        continue;
      }

      // File changed — delete existing chunks, then re-embed and re-insert.
      const { error: delErr } = await supabase.from("sops").delete().eq("file_path", relPath);
      if (delErr) {
        console.error(`  ✗ ${relPath} delete: ${delErr.message}`);
        continue;
      }

      updatedFileCount++;

      for (const { chunk, embedInput, content_hash } of candidates) {
        const embedding = await embed(embedInput);

        const { error } = await supabase.from("sops").insert({
          file_path: relPath,
          chunk_index: chunk.index,
          chunk_heading: chunk.heading,
          content: chunk.content,
          embedding,
          content_hash,
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

      if ((updatedFileCount + unchangedFileCount) % 25 === 0) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(0);
        console.log(`  scanned ${updatedFileCount + unchangedFileCount} files (${updatedFileCount} updated, ${unchangedFileCount} unchanged), ${chunkCount} chunks embedded, ${elapsed}s`);
      }
    }
  }

  // Cleanup: remove rows for files no longer present in repo (renamed,
  // deleted, or moved). file_path comparison is the only signal we use.
  console.log("Cleanup: scanning for orphan files in DB…");
  const { data: dbRows } = await supabase.from("sops").select("file_path").limit(20000);
  const dbPathSet = new Set((dbRows ?? []).map((r) => r.file_path as string));
  const orphanPaths = [...dbPathSet].filter((p) => !seenPaths.has(p));
  let orphanCount = 0;
  for (const p of orphanPaths) {
    const { error } = await supabase.from("sops").delete().eq("file_path", p);
    if (!error) {
      console.log(`  removed orphan: ${p}`);
      orphanCount++;
    } else {
      console.error(`  ✗ failed to remove orphan ${p}: ${error.message}`);
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(0);
  console.log("");
  console.log(
    `Done in ${elapsed}s. ` +
      `${updatedFileCount} files updated → ${chunkCount} chunks embedded. ` +
      `${unchangedFileCount} unchanged. ` +
      `${skipCount} invalid. ` +
      `${orphanCount} orphans removed.`,
  );
}

await main();
