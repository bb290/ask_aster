---
name: drift-check
description: Audit the Ask Aster corpus against the live GetOutline SOPs so the two never silently drift apart. Finds every corpus file that declares an outline_url in its frontmatter, fetches the live Outline doc via the Outline MCP, compares the two on SUBSTANCE (rules, numbers, steps, templates), and reports a verdict per doc. Offers to sync whichever side is behind (Outline is the source of truth for SOP content; the corpus follows). Triggers on "/drift-check", "check for drift", "are Aster and Outline in sync". Scoped to clients/sagareus/ask-aster/.
---

# Drift Check — Ask Aster corpus vs live Outline SOPs

The corpus (`sops/`) is what Aster answers from. Outline is what the team edits. Every mirrored file declares its live doc in frontmatter as `outline_url:`. This skill compares the two and reports drift before it becomes wrong answers.

## Scope: leasing lines only

Per the 2026-05-09 scope decision (`decisions/2026-05-09-leasing-team-scope-and-routing.md`), Aster is the **leasing team's** assistant and answers only from the 8 leasing service lines: applicant screening, tenant placement, lease up, move in, premove out, move out, inspections, turn over. Questions in the other 17 lines get routed to an inbox, not answered, so drift there is harmless. Drift maintenance covers ONLY:

- `sops/` files in those 8 service-line folders (~118 files as of July 2026)
- The deliberately added staff-support docs (Sagareus Values, Bruce, getting-started)
- `decisions/` files that carry an `outline_url`

Do not audit, map, or sync the other service lines. If a mapping backfill is ever run, it runs against this scope, not the full corpus.

## Direction of truth

**Outline wins for SOP content.** The team edits SOPs in Outline; the corpus is the retrieval copy. When they disagree, update the corpus to match Outline, bump `version:` in the frontmatter, update `last_reviewed:`, commit, push, and run the ingest. The one exception: if the corpus contains a change Brittany made through Claude that clearly never got patched to Outline (check the git log), flag it as "Outline behind" instead of overwriting the corpus, and offer to patch Outline.

## Process

1. **Build the mapping.** `grep -rl "outline_url:" sops/ decisions/` from the repo root (`clients/sagareus/ask-aster/`). Each hit is one mirrored pair: corpus file + the `outline_url` value's doc ID (the trailing slug segment, e.g. `yjZFdeB9EC`).
2. **Fetch each live doc** with `mcp__outline__fetch` (resource: "document", id: the slug). If the Outline MCP is not connected, stop and say so; there is no offline mode.
3. **Compare substance, not formatting.** The corpus is often a deliberate light condensation of the Outline doc, and heading levels differ for chunking. That is NOT drift. Drift is: a rule that differs (thresholds, deadlines, who does what), a step added or removed, a template that changed, a number or date that disagrees, a link target that differs, or content in one that materially contradicts the other.
4. **Classify each pair:**
   - `IN SYNC` — same substance (condensation and formatting differences are fine).
   - `CORPUS BEHIND` — Outline has substance the corpus lacks. The common case; the team edited Outline.
   - `OUTLINE BEHIND` — the corpus has substance Outline lacks (check git log to confirm it was intentional).
   - `DIVERGED` — both changed incompatibly. Show both versions of the disputed part and ask Brittany which wins.
5. **Report** as a table: file, Outline doc title, revision + last-updated from the fetch, verdict, and a one-line description of any drift. Clean rows compressed, drift rows detailed.
6. **Offer to sync.** For each CORPUS BEHIND: propose the corpus edit (patch, bump `version:`, update `last_reviewed:`). For each OUTLINE BEHIND: propose an Outline patch via `mcp__outline__update_document` with editMode "patch" (fetch fresh immediately before patching; Brittany edits live and stale findText fails). Apply only what she approves, then commit, push, and run the ingest:
   `set -a && source .env && set +a && deno run --allow-read --allow-write --allow-net --allow-env scripts/ingest.ts`

## Also check (secondary)

- Corpus files that MENTION getoutline.com links but have no `outline_url:` frontmatter (`grep -rl "sagareus.getoutline.com" sops/ | xargs grep -L "outline_url:"`): list them as candidates to formalize; they may be new mirrors or just cross-references. Ask rather than assume.
- Dead links: if an `outline_url` fetch 404s, the doc was moved or deleted in Outline. Flag it; do not delete the corpus file without asking.

## Conventions for new mirrors

When a new SOP is written in both places (or split out of an existing one):

1. Corpus frontmatter gets `outline_url:` pointing at the live doc.
2. The corpus body keeps at least one visible "Source of truth: [Title in Outline](url)" or companion-doc link, so Aster's retrieved chunks can cite the live doc to staff.
3. Run `/drift-check` after any night of heavy SOP editing, and periodically (monthly is fine) otherwise.

## Out of scope

- Editing SOP substance on its own judgment. This skill syncs and reports; content decisions are Brittany's.
- The generated Aster prompts (`skills/*/SKILL.md` → `prompts/*.ts`); those are covered by `scripts/sync-prompts.ts`, not this skill.
- Docs that exist only in Outline and were never mirrored into the corpus. Finding candidates to ADD to the corpus is a different job (say "what SOPs are missing from Aster" for that).
