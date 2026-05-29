# Ask Aster

Source-of-truth Git repo for Ask Aster, Sagareus's custom MCP server. Holds SOPs, edge cases, and decisions as markdown files; synced to a Postgres + pgvector index that the MCP server queries.

See OpenB for the design doc, Claude-only scope decision, auth + admin spec, and content model + visibility spec (all captured May 2026).

## Layout

```
sops/{service_line}/{slug}.md        # procedural SOPs — versioned, owned, retrievable
docs/                                 # reference content (templates, role profiles, tool guides)
```

## Frontmatter schema (SOPs)

```yaml
---
title: <human title>
service_line: <one of 25 lines below>
sop_owner: <email>
status: active | draft | deprecated
last_reviewed: YYYY-MM-DD
visibility_tier: ic | director
version: <int, starts at 1>
tags: [<lowercase, hyphenated>]
created_but_never_updated: false   # set true at import if revision history shows initial-only
---
```

## Service lines (25)

resident relations, client relations, vendor relations, premove out, move out, lease up, applicant screening, move in, deposit return, maintenance, rent collection, utilities, client accounting, resident accounting, vendor accounting, property onboarding, property offboarding, inspections, kpi reporting, tenant placement, business development, staff support, turn over, multifamily playbook, renewal & rent increase

Service lines live as a Postgres column and can be added, renamed, or merged at any time without a schema migration.

## Visibility tiers (v1)

- `ic` — independent contributor; sees ic-tier content, read only
- `director` — sees everything, read + write + admin

v2 will add `team_lead` between ic and director. v3 adds `manager` with read+write but not admin.

## Content type note (v1 → v2)

Multifamily Playbook (per-property reference) and Utilities Playbook (per-provider reference) are imported as SOPs in v1 under the `multifamily playbook` and `utilities` service lines respectively. These docs are reference-shaped rather than procedural; v2 may carve out a separate `references` content type with its own table. For v1 they live in `sops/` for retrieval simplicity.

## Reading Asana Attachments

Claude's code-execution container has a network allowlist that does not include `asanausercontent.com`, so files surfaced by the Asana MCP's `get_attachments` (signed URLs that resolve to that host) can't be read from inside a Claude session. Aster's `fetch_asana_attachment` tool runs server-side, where no such allowlist applies, and returns the file in a format the model can read natively:

- **PDFs** are text-extracted server-side via [`unpdf`](https://github.com/unjs/unpdf) (handles credit reports, POI docs, ledgers, underwriting decisions, lease addenda). Page boundaries are preserved with `--- Page N of M ---` markers. Scanned PDFs with no text layer return a clear error so the caller knows to OCR or re-upload.
- **Raster images** (PNG/JPG/GIF/WEBP) return as MCP image content.
- **text/json/xml** decode and return as text content.
- **Anything else** (zip, xlsx, docx) returns as a base64 resource blob; the model can describe it but not parse it natively.

Use as a two-step pattern:

1. `mcp__asana__asana_get_attachments_for_object` with the parent task GID to list available attachments and their GIDs.
2. `mcp__claude_ai_Ask_Aster__fetch_asana_attachment` with each attachment GID you want to actually read.

Example chained call (in a Claude chat with both the Asana and Ask Aster connectors enabled):

```text
# 1. List what's on the task.
mcp__asana__asana_get_attachments_for_object(
  object_gid: "1215182714098623",
)
# => [{ gid: "1234567890", name: "credit_report.pdf", ... }, ...]

# 2. Read each one through Aster.
mcp__claude_ai_Ask_Aster__fetch_asana_attachment(
  attachment_gid: "1234567890",
)
# => MCP image content for PDFs and images,
#    MCP text content for txt/json/xml,
#    MCP resource content for everything else.
```

Requires `ASANA_API_TOKEN` set as a secret on the Supabase Edge Function (Asana Personal Access Token, generated at `app.asana.com/0/my-apps`). Files larger than 25 MB are rejected; upload those directly to chat instead.

## Migration provenance

Initial content imported from GetOutline on 2026-05-01:
- SOPs 2.0 collection → `visibility_tier: ic`
- Director SOPs collection → `visibility_tier: director`
- Utilities Playbook collection → `service_line: utilities`, `visibility_tier: ic`
- Multifamily Playbook collection → `service_line: multifamily playbook`, `visibility_tier: ic`

GetOutline is being deprecated; expect it to be archived and the subscription cancelled by week 8 of the Aster rollout.
