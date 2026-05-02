# Ask Aster — context for Claude Code

## What this is

Ask Aster is Sagareus's custom MCP server. Internal team asks it operational questions ("how do we handle a tenant who hasn't paid by day 14?") through their AI client (Claude) and gets answers grounded in our SOPs.

This repo holds:

- `sops/` — 628 markdown SOPs across 22 service lines (source of truth for operational procedures)
- `docs/` — 121 reference docs (role profiles, templates, section indexes) — **not indexed in v0**
- `supabase/functions/ask-aster/` — the MCP server (Supabase Edge Function, Deno + Hono)
- `scripts/` — local ingestion script
- `sql/` — Supabase schema and RPC

## Current phase: v0

The single question v0 is built to answer: **does semantic retrieval over our SOPs return useful results often enough to be worth building on?**

Everything else is deferred. v0 specifically does NOT have:

- Write tools (no `capture_edge_case`, no `update_sop`)
- Auth beyond a shared access key (no SSO, no per-user roles)
- Visibility tier filtering
- Stale-SOP guardrail (just surfaces a flag)
- A dashboard
- Indexing of `docs/`

If you (Claude Code) find yourself wanting to add any of those, **stop and ask**. They're all v1+ work and adding them now muddies the v0 signal.

## Architecture (v0)

```
Claude (any client)
   │
   ▼
Supabase Edge Function: ask-aster
   │  - validates x-aster-key header
   │  - exposes one MCP tool: ask_aster(query, service_line?, limit?)
   │  - embeds query → calls match_sops RPC → returns ranked chunks
   ▼
Supabase Postgres + pgvector
   │  - sops table: one row per H2 chunk
   │  - frontmatter fields broken out as columns for filtering
   │  - hnsw index on embedding column
```

Source of truth flow: markdown files in `sops/` are the canonical SOPs. The Postgres table is a derived index, regenerable any time by re-running `scripts/ingest.ts`. If the two ever disagree, markdown wins.

## Stack decisions (do not change without asking)

- **Embedding model:** `openai/text-embedding-3-small` via OpenRouter (1536 dim). Same as OpenB. Schema is hard-coded to 1536; switching models means reindexing.
- **Chunking:** by H2 heading. Files with no H2 become single chunks. This was chosen after sampling the corpus; ~75% of files have 2+ H2 sections.
- **Threshold:** 0.3 in `match_sops`. Lower than OpenB's 0.5 because SOP queries trade precision for recall in v0.
- **Service line filter:** optional, on the column. No frontmatter changes needed to add new service lines — they're just new string values.
- **Auth:** single shared `ASTER_ACCESS_KEY`. v1 will replace this with Google Workspace SSO + role gating.

## Supabase project

- Project ref: `ahonotvcbmczrtnpajua`
- URL: `https://ahonotvcbmczrtnpajua.supabase.co`
- This is a **separate** project from OpenB. Don't tangle them.

## Workflow conventions

- **Before any destructive operation** (dropping tables, force-pushing, deleting files) — ask.
- **Before any architectural change** (new tables, new tools, swapping libraries) — ask.
- **Routine stuff** (running ingest, reading logs, deploying functions, editing code in scope) — go ahead.
- **Secrets stay out of chat.** If a secret is needed, ask the user to export it as an env var before running.

## Re-ingestion

Currently every ingest re-embeds every chunk. That's fine for v0 (~$0.04, ~15 min). If this becomes annoying, the v0.5 add is a content-fingerprint column to skip unchanged chunks — but that's an enhancement, not a v0 requirement.

## Out of scope right now

- ChatGPT MCP support — Claude-only for v0
- Multi-tenant (other Sagareus clients having their own Aster) — that's the long-term vision but not on the v0 roadmap
- The OpenB dashboard pattern — Aster has no UI in v0; Claude is the UI

## Reference

- Original spec and rollout plan: in OpenB under tags `Ask Aster`, `MCP server`, `rollout plan`
- Migration summary (how we got from GetOutline to 750 .md files): in chat history
- OB1 (the project this is forked from): https://github.com/NateBJones-Projects/OB1
