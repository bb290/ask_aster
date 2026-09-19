# Ask Aster

Supabase project for Sagareus's edge functions. The main one is **Ask Aster**, now a small MCP server with two jobs: `fetch_asana_attachment`, which reads Asana attachments server-side and returns them in a format claude.ai can consume, and the applicant screening skill (`/screening` prompt plus a `screening` tool). It also hosts the onboarding, RentCast, screening, and site-visit proxies.

Until 2026-09-19 Aster was also a semantic-search MCP over the SOP corpus plus a catalog of leasing skills. The other skills moved to the Sagareus team Claude account and Aster was stripped to the attachment tool and screening. The markdown corpus under `sops/`, `decisions/`, `incidents/`, and `docs/` is kept as historical source material and is no longer indexed. The live SOP library is Outline.

## Reading Asana Attachments

claude.ai's code-execution container has a network allowlist that does not include `asanausercontent.com`, so files surfaced by the Asana connector's `get_attachments` (signed URLs that resolve to that host) can't be read from inside a Claude session. `fetch_asana_attachment` runs server-side, where no such allowlist applies, and returns the file in a format the model can read natively:

- **PDFs** are text-extracted server-side (pdfjs first, MuPDF as a more tolerant fallback). Page boundaries are preserved with `--- Page N of M ---` markers. Scanned PDFs with no text layer are rendered page by page to grayscale PNG and returned as image content for the vision model, up to 20 pages.
- **Raster images** (PNG/JPG/GIF/WEBP) return as MCP image content.
- **text/json/xml** decode and return as text content.
- **Anything else** (zip, xlsx, docx) returns as a base64 resource blob; the model can describe it but not parse it natively.

Use as a two-step pattern:

1. Asana connector `get_attachments_for_object` with the parent task GID to list available attachments and their GIDs.
2. Ask Aster `fetch_asana_attachment` with each attachment GID you want to read.

Requires `ASANA_API_TOKEN` set as a secret on the edge function (Asana Personal Access Token, generated at `app.asana.com/0/my-apps`). Files larger than 25 MB are rejected; upload those directly to chat instead.

## Connector

- URL: `https://ahonotvcbmczrtnpajua.supabase.co/functions/v1/ask-aster`
- Auth: OAuth 2.0 with dynamic client registration and PKCE, auto-approved for anyone who completes the flow (internal staff only, no per-person identity). The legacy `x-aster-key` header still works.
- Server name, function slug, URL, and the claude.ai connector name are unchanged; existing installs and tokens keep working.

## Screening skill

Source: `skills/screening/SKILL.md` plus `TEMPLATE.md` and `SCREENING_CRITERIA.md`. Regenerate the deployed prompt with `deno run --allow-read --allow-write scripts/sync-prompts.ts`, then deploy.

## Deploy

```bash
supabase functions deploy ask-aster
```

## Migration provenance

The markdown corpus was imported from GetOutline on 2026-05-01 (SOPs 2.0, Director SOPs, Utilities Playbook, Multifamily Playbook). The frontmatter schema on those files is unchanged from the Aster era. Outline was never retired; it remains the SOP source of truth, and the corpus here is a snapshot.
