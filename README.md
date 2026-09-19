# Sagareus Files (formerly Ask Aster)

Supabase project for Sagareus's edge functions. The main one is **Sagareus Files**, a single-tool MCP server that reads Asana attachments server-side and returns them in a format claude.ai can consume. It also hosts the onboarding, RentCast, screening, and site-visit proxies.

Until 2026-09-19 this repo was Ask Aster: a semantic-search MCP over the SOP corpus plus a catalog of leasing skills. Those skills moved to the Sagareus team Claude account and Aster was stripped to the attachment tool. The markdown corpus under `sops/`, `decisions/`, `incidents/`, and `docs/` is kept as historical source material and is no longer indexed. The live SOP library is Outline.

## Reading Asana Attachments

claude.ai's code-execution container has a network allowlist that does not include `asanausercontent.com`, so files surfaced by the Asana connector's `get_attachments` (signed URLs that resolve to that host) can't be read from inside a Claude session. `fetch_asana_attachment` runs server-side, where no such allowlist applies, and returns the file in a format the model can read natively:

- **PDFs** are text-extracted server-side (pdfjs first, MuPDF as a more tolerant fallback). Page boundaries are preserved with `--- Page N of M ---` markers. Scanned PDFs with no text layer are rendered page by page to grayscale PNG and returned as image content for the vision model, up to 20 pages.
- **Raster images** (PNG/JPG/GIF/WEBP) return as MCP image content.
- **text/json/xml** decode and return as text content.
- **Anything else** (zip, xlsx, docx) returns as a base64 resource blob; the model can describe it but not parse it natively.

Use as a two-step pattern:

1. Asana connector `get_attachments_for_object` with the parent task GID to list available attachments and their GIDs.
2. Sagareus Files `fetch_asana_attachment` with each attachment GID you want to read.

Requires `ASANA_API_TOKEN` set as a secret on the edge function (Asana Personal Access Token, generated at `app.asana.com/0/my-apps`). Files larger than 25 MB are rejected; upload those directly to chat instead.

## Connector

- URL: `https://ahonotvcbmczrtnpajua.supabase.co/functions/v1/ask-aster`
- Auth: OAuth 2.0 with dynamic client registration and PKCE, auto-approved for anyone who completes the flow (internal staff only, no per-person identity). The legacy `x-aster-key` header still works.
- The function slug stays `ask-aster` so existing connector installs and tokens keep working. Only the display name in claude.ai changes to Sagareus Files.

## Deploy

```bash
supabase functions deploy ask-aster
```

## Migration provenance

The markdown corpus was imported from GetOutline on 2026-05-01 (SOPs 2.0, Director SOPs, Utilities Playbook, Multifamily Playbook). The frontmatter schema on those files is unchanged from the Aster era. Outline was never retired; it remains the SOP source of truth, and the corpus here is a snapshot.
