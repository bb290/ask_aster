# Ask Aster — context for Claude Code

## What this is

This repo holds Sagareus's Supabase project (`ahonotvcbmczrtnpajua`) and its edge functions. The headline function is **Ask Aster**, now a two-piece MCP server: `fetch_asana_attachment`, which reads Asana attachments server-side so claude.ai skills can consume PDFs, images, and other files attached to Asana tasks, and the applicant screening skill, served as an MCP prompt and a matching `screening` tool.

Aster used to also offer semantic search over the SOP corpus plus a catalog of leasing skills exposed as MCP prompts and tools. On 2026-09-19 it was stripped to the attachment tool and screening (Brittany's call: leave screening on Aster as is). The other skills now live in the Sagareus team Claude account (see `clients/sagareus/CLAUDE.md`, 2026-09-18 note, and `clients/sagareus/operations/skills-handoff-2026-09-18/`). The search tool, the other prompts, and the corpus ingest were deleted.

## Layout

- `supabase/functions/ask-aster/` — the Aster MCP server (Deno + Hono). Server name, slug, URL, and the claude.ai connector name all stay as they were.
- `supabase/functions/onboard-proxy/`, `rentcast-proxy/`, `screening-proxy/`, `site-visit-proxy/` — other edge functions in the same project, unrelated to Aster.
- `sops/`, `decisions/`, `incidents/`, `docs/` — the markdown corpus Aster used to index. No longer ingested anywhere. Kept as historical source material; the live SOP library is Outline.
- `skills/screening/` — source of truth for the screening prompt. `scripts/sync-prompts.ts` regenerates `supabase/functions/ask-aster/prompts/` from it; run it before every deploy that touches the skill.
- `sql/` — schema history. `01` to `03` are the old Aster corpus tables (still present in Postgres, no longer written to). `04` and `05` belong to the proxies.

## The attachment tool

`fetch_asana_attachment(attachment_gid)`: re-fetches attachment metadata with the Asana API token, downloads the bytes, and returns them as MCP content. PDFs go through a three-tier cascade (pdfjs text, MuPDF text, MuPDF page render to PNG for vision). Images return as image content, text/json/xml as text, everything else as a base64 resource. 25 MB cap.

Two-step pattern from a skill: Asana connector `get_attachments_for_object` for the GIDs, then this tool per GID.

## Secrets (Supabase function secrets)

- `ASANA_API_TOKEN` — Asana personal access token used for every read. Shared token, not per-person.
- `ASTER_ACCESS_KEY` — kept under its historical name. It is the HMAC secret behind every OAuth token already issued to staff connectors, so renaming it logs everyone out.
- `SUPABASE_URL` — injected by the platform, used to build the OAuth issuer URL.

`SUPABASE_SERVICE_ROLE_KEY` and `OPENROUTER_API_KEY` are no longer read by the function and can be removed from the project's secrets.

## Editing screening

```bash
$EDITOR skills/screening/SKILL.md
deno run --allow-read --allow-write scripts/sync-prompts.ts
supabase functions deploy ask-aster
```

Do not edit files under `supabase/functions/ask-aster/prompts/` by hand; they are regenerated. TEMPLATE.md and SCREENING_CRITERIA.md in the skill folder are bundled into the prompt at sync time.

## Deploy

```bash
supabase functions deploy ask-aster
```

`supabase/config.toml` sets `verify_jwt = false` for this function because it does its own auth (OAuth bearer token or the legacy `x-aster-key` header).

## Workflow conventions

- Before any destructive operation (dropping tables, force-pushing, deleting files), ask.
- Before adding tools or prompts to this server, ask. The point of the strip was to keep it small.
- Secrets stay out of chat. Ask the user to export env vars before running anything that needs them.

## Cleanup still open

- Drop the Aster corpus tables (`sops` and the `match_sops` RPC from `sql/01` to `03`) once nobody needs the index.
- Remove the unused `SUPABASE_SERVICE_ROLE_KEY` and `OPENROUTER_API_KEY` secrets from the project.
