import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPTransport } from "@hono/mcp";
import { Hono } from "hono";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
// pdfjs-dist legacy build: works in Deno Edge Runtime without DOM polyfills
// for text extraction. The `password: ""` parameter handles consumer credit
// reports (Equifax, RealPage, etc.) that are commonly exported encrypted
// with an empty user password — `unpdf` couldn't pass that through.
import { getDocument } from "pdfjs-dist/legacy";
// MuPDF compiled to WASM: tolerant parser + rasterizer for PDFs that
// pdfjs-dist can't open (the "Unknown block type in flate stream" case
// on credit-report exports) and for scanned PDFs with no text layer.
// When pdfjs fails or returns no text, we render each page to a PNG via
// MuPDF and return them as MCP image content for claude.ai's vision model
// to read directly. Equivalent to the `mutool clean` step in the recipe,
// plus a rasterization step, all in pure JS+WASM.
import * as mupdf from "mupdf";

// Minimal type shim for MuPDF's JS bindings. Artifex's published types
// don't import cleanly in Deno; we only need a thin surface here.
interface MupdfDocument {
  countPages(): number;
  // deno-lint-ignore no-explicit-any
  loadPage(index: number): any;
  destroy?(): void;
}
import { ALL_PROMPTS } from "./prompts/index.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
const ASTER_ACCESS_KEY = Deno.env.get("ASTER_ACCESS_KEY")!;
const ASANA_API_TOKEN = Deno.env.get("ASANA_API_TOKEN")!;

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Voice instruction prepended to every Aster response. This biases the
// calling assistant (typically Claude) toward Sagareus internal-staff tone
// when wrapping Aster's results into a conversational reply.
//
// v0.8 (May 23 2026): co-ownership carve-out for non-conforming multifamily
// internet and mail policy adherence. Per
// decisions/2026-05-23-leasing-coowns-non-conforming-multifamily-internet-mail.md,
// those questions are IN leasing's lane and should not route to accounting.
//
// v0.7 (May 9 2026): bakes in the leasing-team-pilot assumption. Every
// caller is treated as a leasing team member by default, since v0 is
// scoped to that team only. Out-of-scope questions get routed via the
// matrix in decisions/2026-05-09-leasing-team-scope-and-routing.md
// rather than answered substantively.
const VOICE_NOTE = [
  "[Voice note for the assistant: respond casually and conversationally,",
  "roughly 10th-grade reading level, like a smart coworker who has been at",
  "Sagareus a while. Dry humor in moderation is welcome. Translate the content",
  "below into plain English instead of quoting it verbatim. Skip the",
  "bureaucratic phrasing. Don't use em dashes; use commas or periods instead.",
  "",
  "Audience: Sagareus internal staff, specifically the LEASING team. Assume",
  "every caller is on the leasing team unless they say otherwise.",
  "",
  "Leasing's lane covers 8 service lines: applicant screening, tenant",
  "placement, lease up, move in, premove out, move out, inspections, and",
  "turn over (shared with operations). Anything else is out of scope for",
  "leasing.",
  "",
  "Cross-team carve-out: non-conforming multifamily internet and mail policy",
  "adherence is co-owned by leasing (tenant-facing enforcement at move in /",
  "lease up / move out) and client relations (owner-facing). Leasing answers",
  "those questions directly. Do not route them to accounting. Accounting only",
  "owns utility billing mechanics (flat fees, pass-throughs, ledgers).",
  "",
  "If the question is in-scope, answer normally using the search results below.",
  "",
  "If the question is out-of-scope (maintenance, accounting, customer service,",
  "business development, etc.), do NOT try to answer the substantive question.",
  "Instead, tell the leasing person:",
  "  1. The question is outside leasing's lane and which department owns it",
  "  2. The inbox to route the tenant or owner to:",
  "       maintenance@sagareus.com  -> broken stuff, work orders",
  "       accounting@sagareus.com   -> rent, utility BILLING (flat fees,",
  "                                    pass-throughs, ledgers), deposit",
  "                                    returns, owner financials",
  "       MGMT@sagareus.com         -> everything else, and as the catch-all",
  "                                    when unsure",
  "  3. A short handoff script they can paste to the tenant or owner, in",
  "     Sagareus voice (casual, no em dashes).",
  "",
  "The full routing matrix and handoff scripts live in",
  "decisions/2026-05-09-leasing-team-scope-and-routing.md if you need detail.",
  "The non-conforming multifamily co-ownership carve-out is in",
  "decisions/2026-05-23-leasing-coowns-non-conforming-multifamily-internet-mail.md.",
  "",
  "Section 8 / voucher carve-out: when a leasing person asks how to HELP a",
  "Section 8 or voucher applicant get, secure, or land a unit, LEAD with",
  "proactively working the pre-lease pipeline WITH the applicant: look at units",
  "coming down the pipeline before they are marketed (current tenant has given",
  "notice but not moved out), match them to the applicant's voucher criteria,",
  "and SEND the applicant those unlisted opportunities (pictures, unit number,",
  "bedrooms, bathrooms, washer, dryer) so they can start the voucher paperwork",
  "early and be ready to sign at move-out. Do NOT lead with sprinting the RFTA",
  "or inspection paperwork. Those process SOPs are for running a deal already",
  "in motion; they are secondary and come after the pipeline answer. Never",
  "imply we hold or lock a unit for a voucher holder, and never imply a complete",
  "application secures the unit. The full Section 8 / First-In-Time policy and",
  "playbook is in decisions/2026-05-27-seattle-fit-section-8-completeness.md.",
  "",
  "The point is to de-load the leasing person, not give them a half-right",
  "answer to something that isn't theirs to handle.]",
].join("\n");

async function getEmbedding(text: string): Promise<number[]> {
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
    const msg = await r.text().catch(() => "");
    throw new Error(`OpenRouter embeddings failed: ${r.status} ${msg}`);
  }
  const d = await r.json();
  return d.data[0].embedding;
}

// --- MCP Server Setup ---

const server = new McpServer({
  name: "ask-aster",
  version: "0.1.0",
});

server.registerTool(
  "ask_aster",
  {
    title: "Ask Aster",
    description:
      "Semantic search over Sagareus's SOPs, decisions, incidents, and edge cases. Use this when the team asks operational questions like 'how do we handle a tenant who hasn't paid by day 14', 'what's our policy on rodent infestation', or 'tell me about the unit confusion at 13337 30th Ave NE'. Returns ranked content chunks with the source file path so the caller can pull the full doc if needed.\n\nVoice when responding to the user with these results: casual and conversational, like a smart coworker who has been at Sagareus a while. About 10th-grade reading level. Dry humor in moderation is welcome. Translate the content into plain English; don't quote SOP or decision text verbatim. Skip bureaucratic phrasing. Don't use em dashes; use commas or periods instead. Audience is internal Sagareus staff.",
    inputSchema: {
      query: z.string().describe("The operational question to search for"),
      service_line: z
        .string()
        .optional()
        .describe(
          "Optional filter to one of the 25 service lines (e.g. 'rent collection', 'lease up', 'utilities'). Lowercase, spaces preserved. Omit to search across all lines.",
        ),
      limit: z.number().optional().default(10).describe("Max number of chunks to return (default 10)"),
    },
  },
  async ({ query, service_line, limit }) => {
    try {
      const qEmb = await getEmbedding(query);
      const { data, error } = await supabase.rpc("match_sops", {
        query_embedding: qEmb,
        match_threshold: 0.3,
        match_count: limit,
        filter_service_line: service_line ?? null,
      });

      if (error) {
        return {
          content: [{ type: "text" as const, text: `Search error: ${error.message}` }],
          isError: true,
        };
      }

      if (!data || data.length === 0) {
        const filterNote = service_line ? ` in service_line "${service_line}"` : "";
        return {
          content: [
            {
              type: "text" as const,
              text: `${VOICE_NOTE}\n\nNothing matched "${query}"${filterNote}. Try broader phrasing or drop the service_line filter.`,
            },
          ],
        };
      }

      const results = (data as Array<{
        file_path: string;
        chunk_heading: string | null;
        content: string;
        title: string;
        service_line: string;
        visibility_tier: string;
        status: string;
        last_reviewed: string | null;
        tags: string[];
        created_but_never_updated: boolean;
        similarity: number;
      }>).map((r, i) => {
        const headerParts = [
          `--- Result ${i + 1} (${(r.similarity * 100).toFixed(1)}% match) ---`,
          `Title: ${r.title}`,
          `Service line: ${r.service_line}`,
        ];
        if (r.chunk_heading) headerParts.push(`Section: ${r.chunk_heading}`);
        if (r.status !== "active") headerParts.push(`Status: ${r.status}`);
        if (r.tags?.length) headerParts.push(`Tags: ${r.tags.join(", ")}`);
        if (r.last_reviewed) headerParts.push(`Last reviewed: ${r.last_reviewed}`);
        if (r.created_but_never_updated) {
          headerParts.push(`⚠ created_but_never_updated: this SOP has not been touched since initial migration`);
        }
        headerParts.push(`Source: ${r.file_path}`);
        headerParts.push("");
        headerParts.push(r.content);
        return headerParts.join("\n");
      });

      return {
        content: [
          {
            type: "text" as const,
            text: `${VOICE_NOTE}\n\nFound ${data.length} chunk(s) for "${query}":\n\n${results.join("\n\n")}`,
          },
        ],
      };
    } catch (err: unknown) {
      return {
        content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  },
);

// --- fetch_asana_attachment ---
//
// Aster lives in claude.ai. When the leasing team asks Aster to read an
// Asana attachment (credit reports, paystubs, etc.) the Claude code-execution
// container has a network allowlist that does not include asanausercontent.com,
// so the bytes never reach the client. This tool runs server-side, where no
// such allowlist applies, and returns the file in an MCP content format
// Claude can read natively.
//
// Two-step pattern:
//   1. mcp__asana__asana_get_attachments_for_object -> list attachments + GIDs
//   2. fetch_asana_attachment(attachment_gid)       -> read the file itself

const ASANA_API_BASE = "https://app.asana.com/api/1.0";
const ASANA_MAX_BYTES = 25 * 1024 * 1024; // 25 MB

interface AsanaAttachmentMeta {
  data: {
    gid: string;
    name: string;
    download_url: string | null;
    resource_type: string;
    host: string;
  };
}

// Chunked base64 encoder. The naive btoa(String.fromCharCode(...buf)) blows
// the JS argument-count limit on multi-MB buffers; chunking keeps us safe up
// to the 25 MB cap.
function bytesToBase64(buf: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    bin += String.fromCharCode.apply(
      null,
      Array.from(buf.subarray(i, i + CHUNK)),
    );
  }
  return btoa(bin);
}

function pickReturnFormat(
  name: string,
  contentType: string,
): { kind: "text" | "image" | "pdf" | "resource"; mime: string } {
  const lcName = name.toLowerCase();
  const lcType = contentType.toLowerCase().split(";")[0].trim();

  // PDFs are extracted to text server-side. The MCP image content type only
  // accepts raster formats (GIF/JPG/PNG/WEBP), so passing a PDF as image
  // content gets rejected by claude.ai's renderer.
  if (lcType === "application/pdf" || lcName.endsWith(".pdf")) {
    return { kind: "pdf", mime: "application/pdf" };
  }

  // Actual raster images return as MCP image content.
  if (lcType.startsWith("image/")) {
    return { kind: "image", mime: lcType };
  }

  // Text-ish payloads decode to text content.
  if (
    lcType.startsWith("text/") ||
    lcType === "application/json" ||
    lcType === "application/xml"
  ) {
    return { kind: "text", mime: lcType };
  }

  // Everything else (zip, xlsx, docx, etc.) goes through as a resource blob.
  return { kind: "resource", mime: lcType || "application/octet-stream" };
}

// Soft cap on extracted PDF text returned to the caller. Most leasing docs
// (POI, ledger, credit report, underwriting decision) are well under this,
// but a long lease addendum could blow up the response payload.
const PDF_TEXT_MAX_CHARS = 500_000;

server.registerTool(
  "fetch_asana_attachment",
  {
    title: "Fetch Asana attachment",
    description:
      "Fetch the actual contents of an Asana attachment. The get_attachments tool only returns metadata and URLs; use this tool to read the file itself. Pass the attachment GID returned by get_attachments. Returns content in the format the model can read natively: PDFs come back as server-extracted text with page markers (works for credit reports, POI docs, ledgers, underwriting reports, leases); raster images come back as MCP image content; text/json/xml come back as text; everything else comes back as a base64 resource blob. Scanned PDFs with no text layer return a clear error.",
    inputSchema: {
      attachment_gid: z
        .string()
        .describe(
          "The GID of the Asana attachment to fetch (from get_attachments_for_object)",
        ),
    },
  },
  async ({ attachment_gid }) => {
    try {
      // Step 1: re-fetch metadata. Asana's signed download_urls expire, so
      // never trust a URL passed in by the caller; always get a fresh one.
      const metaResp = await fetch(
        `${ASANA_API_BASE}/attachments/${attachment_gid}`,
        {
          headers: {
            Authorization: `Bearer ${ASANA_API_TOKEN}`,
            Accept: "application/json",
          },
        },
      );

      console.log(
        `fetch_asana_attachment: gid=${attachment_gid} meta_status=${metaResp.status}`,
      );

      if (metaResp.status === 401 || metaResp.status === 403) {
        return {
          content: [{
            type: "text" as const,
            text:
              `Asana rejected the request with ${metaResp.status}. The Asana API token may have expired or been revoked. Have an admin rotate the ASANA_API_TOKEN secret on the Aster edge function and redeploy.`,
          }],
          isError: true,
        };
      }
      if (metaResp.status === 404) {
        return {
          content: [{
            type: "text" as const,
            text:
              `No Asana attachment found for GID ${attachment_gid}. It may have been deleted, or the GID may be wrong. Re-run get_attachments_for_object to get current GIDs.`,
          }],
          isError: true,
        };
      }
      if (!metaResp.ok) {
        return {
          content: [{
            type: "text" as const,
            text:
              `Asana returned HTTP ${metaResp.status} fetching attachment metadata for GID ${attachment_gid}.`,
          }],
          isError: true,
        };
      }

      const meta = (await metaResp.json()) as AsanaAttachmentMeta;
      const { name, download_url } = meta.data;
      if (!download_url) {
        return {
          content: [{
            type: "text" as const,
            text:
              `Asana attachment ${attachment_gid} ('${name}') has no download_url. It may be an external link or a Google Drive embed rather than a hosted file. Open it directly in the browser instead.`,
          }],
          isError: true,
        };
      }

      // Step 2: pre-flight size check off the metadata if Asana included it.
      // The download_url itself may not echo content-length, so this is the
      // earliest cheap check we can do.

      // Step 3: download. download_url is short-lived and signed, no auth
      // header needed.
      const fileResp = await fetch(download_url);
      console.log(
        `fetch_asana_attachment: gid=${attachment_gid} file_status=${fileResp.status}`,
      );

      if (!fileResp.ok) {
        return {
          content: [{
            type: "text" as const,
            text:
              `Downloading the attachment file failed with HTTP ${fileResp.status}. The signed URL may have expired between metadata and download; try again.`,
          }],
          isError: true,
        };
      }

      const declaredLen = parseInt(
        fileResp.headers.get("content-length") ?? "0",
        10,
      );
      if (declaredLen > ASANA_MAX_BYTES) {
        return {
          content: [{
            type: "text" as const,
            text:
              `Attachment '${name}' is ${
                (declaredLen / 1024 / 1024).toFixed(1)
              } MB, larger than Aster's 25 MB limit. Upload the file directly into chat instead.`,
          }],
          isError: true,
        };
      }

      const buf = new Uint8Array(await fileResp.arrayBuffer());

      // Belt-and-suspenders: some hosts don't send content-length on chunked
      // responses, so re-check after the body is in memory.
      if (buf.byteLength > ASANA_MAX_BYTES) {
        return {
          content: [{
            type: "text" as const,
            text:
              `Attachment '${name}' is ${
                (buf.byteLength / 1024 / 1024).toFixed(1)
              } MB, larger than Aster's 25 MB limit. Upload the file directly into chat instead.`,
          }],
          isError: true,
        };
      }

      const contentType = fileResp.headers.get("content-type") ??
        "application/octet-stream";
      const fmt = pickReturnFormat(name, contentType);
      const sizeLabel = `${fmt.mime}, ${buf.byteLength} bytes`;

      if (fmt.kind === "text") {
        const decoded = new TextDecoder().decode(buf);
        return {
          content: [{
            type: "text" as const,
            text:
              `Asana attachment '${name}' (${sizeLabel}):\n\n${decoded}`,
          }],
        };
      }

      if (fmt.kind === "pdf") {
        // Three-tier PDF cascade:
        //   1. pdfjs-dist text extraction (fast, works for most PDFs).
        //   2. MuPDF text extraction (more tolerant; salvages credit-report
        //      exports that pdfjs can't open at all).
        //   3. MuPDF page rasterization to PNG (final fallback; returns
        //      images for claude.ai's vision model to read directly).
        //
        // The cascade is necessary because the leasing team's real-world
        // PDFs include three failure modes pdfjs alone can't handle:
        //   - Encrypted-with-empty-password (consumer credit reports)
        //   - Malformed-flate-stream (screening-vendor exports)
        //   - No text layer at all (scanned proof-of-income docs)
        // MuPDF rasterization handles all three by punting to vision.

        const pdfBytes = new Uint8Array(buf);
        let totalPages = 0;
        let extractedPages: string[] | null = null;
        let extractionMethod = "";

        // --- Tier 1: pdfjs-dist text extraction ---
        try {
          const pdfDoc = await getDocument({
            data: pdfBytes,
            password: "",
            verbosity: 0,
            useSystemFonts: false,
            disableFontFace: true,
            isEvalSupported: false,
            stopAtErrors: false,
          }).promise;
          totalPages = pdfDoc.numPages;
          const pages: string[] = [];
          for (let i = 1; i <= totalPages; i++) {
            const page = await pdfDoc.getPage(i);
            const content = await page.getTextContent();
            const pageText = content.items
              .map((item: unknown) =>
                typeof item === "object" && item !== null && "str" in item
                  ? String((item as { str: unknown }).str)
                  : ""
              )
              .join(" ")
              .trim();
            pages.push(pageText);
          }
          if (pages.some((p) => p && p.trim().length > 0)) {
            extractedPages = pages;
            extractionMethod = "pdfjs";
          }
          // else: text layer empty, fall through to MuPDF render below
        } catch (pdfjsErr) {
          // pdfjs couldn't even open the PDF. Fall through to MuPDF.
          console.log(
            `fetch_asana_attachment: pdfjs failed gid=${attachment_gid} err="${
              (pdfjsErr as Error).message
            }" — falling back to mupdf`,
          );
        }

        // --- Tier 2: MuPDF text extraction (only if Tier 1 produced nothing) ---
        if (!extractedPages) {
          try {
            const doc = (mupdf as unknown as {
              Document: { openDocument(b: Uint8Array, mime: string): MupdfDocument };
            }).Document.openDocument(pdfBytes, "application/pdf");
            totalPages = doc.countPages();
            const pages: string[] = [];
            for (let i = 0; i < totalPages; i++) {
              const page = doc.loadPage(i);
              // MuPDF's StructuredText#asText returns plain reading-order text.
              // Behavior: empty string when there's no text layer.
              // deno-lint-ignore no-explicit-any
              const stext: any = page.toStructuredText("preserve-whitespace");
              const t: string = typeof stext.asText === "function"
                ? String(stext.asText())
                : "";
              pages.push(t.trim());
              page.destroy?.();
            }
            doc.destroy?.();
            if (pages.some((p) => p.length > 0)) {
              extractedPages = pages;
              extractionMethod = "mupdf-text";
            }
          } catch (mupdfTextErr) {
            console.log(
              `fetch_asana_attachment: mupdf-text failed gid=${attachment_gid} err="${
                (mupdfTextErr as Error).message
              }"`,
            );
          }
        }

        // --- Tiers 1+2 succeeded: return text content ---
        if (extractedPages) {
          let body = extractedPages
            .map((p, i) =>
              `--- Page ${i + 1} of ${totalPages} ---\n\n${(p ?? "").trim()}`
            )
            .join("\n\n");
          let truncatedNote = "";
          if (body.length > PDF_TEXT_MAX_CHARS) {
            truncatedNote =
              `\n\n[Note: extracted text exceeded ${PDF_TEXT_MAX_CHARS} characters and was truncated. Earlier pages are intact.]`;
            body = body.slice(0, PDF_TEXT_MAX_CHARS);
          }
          return {
            content: [{
              type: "text" as const,
              text:
                `Asana attachment '${name}' (${sizeLabel}, ${totalPages} page(s)) — extracted text (${extractionMethod}):\n\n${body}${truncatedNote}`,
            }],
          };
        }

        // --- Tier 3: MuPDF rasterize each page to PNG, return as image content ---
        // No text layer or pdfjs+mupdf-text both came up empty. Render the
        // pages as grayscale PNGs at 200 DPI and let claude.ai's vision model
        // read them. Cap at MAX_PAGES_RENDERED to keep response size bounded.
        const MAX_PAGES_RENDERED = 20;
        const RENDER_DPI = 200;
        try {
          const doc = (mupdf as unknown as {
            Document: { openDocument(b: Uint8Array, mime: string): MupdfDocument };
          }).Document.openDocument(pdfBytes, "application/pdf");
          if (!totalPages) totalPages = doc.countPages();
          const pageLimit = Math.min(totalPages, MAX_PAGES_RENDERED);
          const scale = RENDER_DPI / 72;
          // deno-lint-ignore no-explicit-any
          const Matrix = (mupdf as any).Matrix;
          // deno-lint-ignore no-explicit-any
          const ColorSpace = (mupdf as any).ColorSpace;
          const matrix = Matrix.scale(scale, scale);
          const grayscale = ColorSpace.DeviceGray;

          const imageContents: Array<{
            type: "image";
            data: string;
            mimeType: "image/png";
          }> = [];

          for (let i = 0; i < pageLimit; i++) {
            // deno-lint-ignore no-explicit-any
            const page = doc.loadPage(i) as any;
            const pixmap = page.toPixmap(matrix, grayscale, false);
            const pngBytes: Uint8Array = pixmap.asPNG();
            imageContents.push({
              type: "image",
              data: bytesToBase64(pngBytes),
              mimeType: "image/png",
            });
            pixmap.destroy?.();
            page.destroy?.();
          }
          doc.destroy?.();

          const truncatedNote = totalPages > MAX_PAGES_RENDERED
            ? ` Rendered the first ${MAX_PAGES_RENDERED} pages; the remaining ${
              totalPages - MAX_PAGES_RENDERED
            } pages are not included.`
            : "";

          return {
            content: [
              {
                type: "text" as const,
                text:
                  `Asana attachment '${name}' (${sizeLabel}, ${totalPages} page(s)) — no text layer or unparseable; rendered each page as a grayscale PNG for vision reading.${truncatedNote} Read the page images below to extract content.`,
              },
              ...imageContents,
            ],
          };
        } catch (mupdfRenderErr) {
          return {
            content: [{
              type: "text" as const,
              text:
                `Failed to extract or render PDF '${name}': pdfjs and mupdf both could not open the file. Last error: ${
                  (mupdfRenderErr as Error).message
                }. The PDF may be heavily corrupted or use an unsupported feature.`,
            }],
            isError: true,
          };
        }
      }

      const b64 = bytesToBase64(buf);

      if (fmt.kind === "image") {
        return {
          content: [
            {
              type: "text" as const,
              text: `Asana attachment '${name}' (${sizeLabel}):`,
            },
            {
              type: "image" as const,
              data: b64,
              mimeType: fmt.mime,
            },
          ],
        };
      }

      // resource
      return {
        content: [
          {
            type: "text" as const,
            text: `Asana attachment '${name}' (${sizeLabel}):`,
          },
          {
            type: "resource" as const,
            resource: {
              uri: `asana://attachment/${attachment_gid}`,
              mimeType: fmt.mime,
              blob: b64,
            },
          },
        ],
      };
    } catch (err: unknown) {
      return {
        content: [{
          type: "text" as const,
          text:
            `Error fetching Asana attachment ${attachment_gid}: ${
              (err as Error).message
            }`,
        }],
        isError: true,
      };
    }
  },
);

// --- MCP Prompts (slash commands surfaced to clients) ---
//
// Each prompt is generated from a SKILL.md file under skills/<name>/SKILL.md
// by scripts/sync-prompts.ts. The SKILL.md is the source of truth; the TS
// modules under prompts/ are deployment artifacts.

for (const p of ALL_PROMPTS) {
  server.registerPrompt(
    p.name,
    {
      title: p.name,
      description: p.description,
    },
    () => ({
      messages: [
        {
          role: "user",
          content: { type: "text", text: p.content },
        },
      ],
    }),
  );
}

// --- MCP Tools for skills (workaround for claude.ai web) ---
//
// claude.ai web doesn't surface MCP prompts in the chat slash menu (as of
// May 2026). To make the skill catalog usable for claude.ai users, each
// skill is also registered as a tool. The model can call the tool when an
// agent invokes the skill via natural language. The tool returns the
// SKILL.md body wrapped in an instruction note so the model interprets it
// as directives to follow, not text to paste back.
//
// Tool names convert kebab-case (prompt names) to snake_case (MCP tool
// convention). E.g. /meet-aster prompt -> meet_aster tool.

function wrapSkillBodyAsToolResult(skillName: string, body: string): string {
  return [
    `[Skill invoked: ${skillName}.`,
    `The text below is your instruction set for handling this conversation.`,
    `Read it as directives, not as text to paste back to the user. Begin`,
    `executing the skill immediately, following the voice and flow it`,
    `describes. Maintain the Sagareus voice rules (no em dashes, plain English,`,
    `casual coworker tone). If the skill says to render markdown (like an`,
    `image), render it directly to the user. If it says to ask a question,`,
    `ask it. If it says to wait for a connector check, run that check first.]`,
    ``,
    body,
  ].join("\n");
}

for (const p of ALL_PROMPTS) {
  const toolName = p.name.replace(/-/g, "_");
  server.registerTool(
    toolName,
    {
      title: p.name,
      description: p.description,
      inputSchema: {
        context: z
          .string()
          .optional()
          .describe(
            "Optional context the user has already provided in their request (e.g., a property address, an incident summary). The skill should acknowledge this context and not re-ask for it.",
          ),
      },
    },
    ({ context }) => ({
      content: [
        {
          type: "text" as const,
          text: wrapSkillBodyAsToolResult(p.name, p.content) +
            (context ? `\n\n[User-provided context: ${context}]` : ""),
        },
      ],
    }),
  );
}

// --- OAuth 2.0 (for claude.ai custom connector compatibility) ---
//
// Aster's native auth is the shared ASTER_ACCESS_KEY (sent as x-aster-key
// header or ?key=). claude.ai's custom connector flow requires OAuth 2.0
// with Dynamic Client Registration (RFC 7591) and PKCE (RFC 7636). We
// implement the minimum endpoints to satisfy that flow. Since all
// leasing-team users have the same access level in v0, the OAuth ceremony
// is cosmetic: any client that completes the flow gets a signed Bearer
// token that validates against the same ASTER_ACCESS_KEY (used as HMAC
// secret). No state is persisted; codes and tokens are self-contained.
//
// Grandfathered x-aster-key connections continue to work alongside the new
// OAuth path. Both are checked in the catch-all auth middleware.

const ISSUER = `${SUPABASE_URL}/functions/v1/ask-aster`;
const TEXT_ENC = new TextEncoder();
const TEXT_DEC = new TextDecoder();

function b64uEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function b64uDecode(str: string): Uint8Array {
  const padded = str.replaceAll("-", "+").replaceAll("_", "/") +
    "===".slice((str.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacSha256(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    TEXT_ENC.encode(ASTER_ACCESS_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, TEXT_ENC.encode(payload));
  return b64uEncode(new Uint8Array(sig));
}

async function pkceS256(verifier: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", TEXT_ENC.encode(verifier));
  return b64uEncode(new Uint8Array(hash));
}

interface CodeData {
  c?: string; // code_challenge
  m?: string; // code_challenge_method (S256 or plain)
  r: string;  // redirect_uri
  i: string;  // client_id
  e: number;  // expires_at (unix ts)
}

async function mintCode(data: CodeData): Promise<string> {
  const payload = b64uEncode(TEXT_ENC.encode(JSON.stringify(data)));
  const sig = await hmacSha256(payload);
  return `${payload}.${sig}`;
}

async function verifyCode(code: string): Promise<CodeData | null> {
  const parts = code.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = await hmacSha256(payload);
  if (expected !== sig) return null;
  try {
    const data = JSON.parse(TEXT_DEC.decode(b64uDecode(payload))) as CodeData;
    if (data.e < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}

interface TokenData {
  iss: string;
  sub: string;
  iat: number;
  exp: number;
  k: "aster-access";
}

async function mintAccessToken(client_id: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const data: TokenData = {
    iss: ISSUER,
    sub: client_id || "anonymous",
    iat: now,
    exp: now + 60 * 60 * 24 * 365, // 1 year
    k: "aster-access",
  };
  const payload = b64uEncode(TEXT_ENC.encode(JSON.stringify(data)));
  const sig = await hmacSha256(payload);
  return `${payload}.${sig}`;
}

async function verifyAccessToken(token: string): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  const expected = await hmacSha256(payload);
  if (expected !== sig) return false;
  try {
    const data = JSON.parse(TEXT_DEC.decode(b64uDecode(payload))) as TokenData;
    if (data.k !== "aster-access") return false;
    if (data.exp < Math.floor(Date.now() / 1000)) return false;
    return true;
  } catch {
    return false;
  }
}

// --- Hono App with Auth + CORS ---

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-aster-key, accept, mcp-session-id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
};

const app = new Hono();

app.options("*", (c) => c.text("ok", 200, corsHeaders));

app.all("*", async (c) => {
  // Supabase Edge Functions passes the full request path (including the
  // /functions/v1/ask-aster prefix) to Hono, so Hono's path-specific
  // routing won't match plain "/register" etc. We dispatch OAuth flows
  // here by inspecting the URL suffix instead.
  const url = new URL(c.req.url);
  const path = url.pathname;
  const method = c.req.method;

  // --- OAuth 2.0 discovery + DCR + auth code + token endpoints ---
  // No auth check on these; the OAuth ceremony is the auth path.

  if (
    method === "GET" &&
    path.endsWith("/.well-known/oauth-authorization-server")
  ) {
    return c.json(
      {
        issuer: ISSUER,
        authorization_endpoint: `${ISSUER}/authorize`,
        token_endpoint: `${ISSUER}/token`,
        registration_endpoint: `${ISSUER}/register`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none"],
        scopes_supported: ["aster"],
      },
      200,
      corsHeaders,
    );
  }

  if (
    method === "GET" &&
    path.endsWith("/.well-known/oauth-protected-resource")
  ) {
    return c.json(
      {
        resource: ISSUER,
        authorization_servers: [ISSUER],
        scopes_supported: ["aster"],
        bearer_methods_supported: ["header"],
      },
      200,
      corsHeaders,
    );
  }

  if (method === "POST" && path.endsWith("/register")) {
    const body = await c.req.json().catch(
      () => ({} as Record<string, unknown>),
    );
    const client_id = `aster-${crypto.randomUUID()}`;
    return c.json(
      {
        client_id,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        redirect_uris:
          (body as { redirect_uris?: string[] }).redirect_uris ?? [],
        client_name:
          (body as { client_name?: string }).client_name ?? "anonymous",
        grant_types: ["authorization_code"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      },
      201,
      corsHeaders,
    );
  }

  if (method === "GET" && path.endsWith("/authorize")) {
    const q = c.req.query();
    if (q.response_type !== "code") {
      return c.text("unsupported_response_type", 400, corsHeaders);
    }
    if (!q.redirect_uri) {
      return c.text("missing redirect_uri", 400, corsHeaders);
    }
    // Auto-approve. Internal staff only, no consent screen needed.
    const code = await mintCode({
      c: q.code_challenge,
      m: q.code_challenge_method,
      r: q.redirect_uri,
      i: q.client_id ?? "",
      e: Math.floor(Date.now() / 1000) + 600, // 10 minutes
    });
    const redirectUrl = new URL(q.redirect_uri);
    redirectUrl.searchParams.set("code", code);
    if (q.state) redirectUrl.searchParams.set("state", q.state);
    return c.redirect(redirectUrl.toString(), 302);
  }

  if (method === "POST" && path.endsWith("/token")) {
    const form = await c.req.parseBody().catch(
      () => ({} as Record<string, string>),
    );
    const grant_type = String(form.grant_type ?? "");
    const code = String(form.code ?? "");
    const redirect_uri = String(form.redirect_uri ?? "");
    const code_verifier = String(form.code_verifier ?? "");

    if (grant_type !== "authorization_code") {
      return c.json({ error: "unsupported_grant_type" }, 400, corsHeaders);
    }
    if (!code) {
      return c.json(
        { error: "invalid_request", error_description: "missing code" },
        400,
        corsHeaders,
      );
    }

    const codeData = await verifyCode(code);
    if (!codeData) {
      return c.json({ error: "invalid_grant" }, 400, corsHeaders);
    }
    if (codeData.r !== redirect_uri) {
      return c.json(
        {
          error: "invalid_grant",
          error_description: "redirect_uri mismatch",
        },
        400,
        corsHeaders,
      );
    }
    if (codeData.c) {
      if (!code_verifier) {
        return c.json(
          {
            error: "invalid_grant",
            error_description: "missing code_verifier",
          },
          400,
          corsHeaders,
        );
      }
      const expected = codeData.m === "S256"
        ? await pkceS256(code_verifier)
        : code_verifier;
      if (expected !== codeData.c) {
        return c.json(
          {
            error: "invalid_grant",
            error_description: "PKCE verification failed",
          },
          400,
          corsHeaders,
        );
      }
    }

    const access_token = await mintAccessToken(codeData.i);
    return c.json(
      {
        access_token,
        token_type: "Bearer",
        expires_in: 60 * 60 * 24 * 365,
        scope: "aster",
      },
      200,
      corsHeaders,
    );
  }

  // --- MCP traffic: three accepted auth paths ---
  //   1. x-aster-key header (back-compat for grandfathered connections)
  //   2. ?key=... query param (legacy / manual testing)
  //   3. Authorization: Bearer <token> from the OAuth DCR flow above
  const xKey = c.req.header("x-aster-key") ||
    new URL(c.req.url).searchParams.get("key");
  const authHeader = c.req.header("authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";

  let authed = false;
  if (xKey && xKey === ASTER_ACCESS_KEY) {
    authed = true;
  } else if (bearer && (await verifyAccessToken(bearer))) {
    authed = true;
  }

  if (!authed) {
    // RFC 9728 / MCP authorization spec: 401 with WWW-Authenticate pointing
    // at the protected-resource metadata so clients discover the OAuth AS.
    // Kept minimal (just resource_metadata) so strict parsers don't choke
    // on extra parameters.
    return c.json({ error: "Invalid or missing access key" }, 401, {
      ...corsHeaders,
      "WWW-Authenticate":
        `Bearer resource_metadata="${ISSUER}/.well-known/oauth-protected-resource"`,
    });
  }

  // Fix: Claude Desktop connectors don't always send the Accept header that
  // StreamableHTTPTransport requires. Patch it in if missing. (Same workaround
  // OB1 uses — see https://github.com/NateBJones-Projects/OB1/issues/33)
  if (!c.req.header("accept")?.includes("text/event-stream")) {
    const headers = new Headers(c.req.raw.headers);
    headers.set("Accept", "application/json, text/event-stream");
    const patched = new Request(c.req.raw.url, {
      method: c.req.raw.method,
      headers,
      body: c.req.raw.body,
      // @ts-ignore -- duplex required for streaming body in Deno
      duplex: "half",
    });
    Object.defineProperty(c.req, "raw", { value: patched, writable: true });
  }

  const transport = new StreamableHTTPTransport();
  await server.connect(transport);
  return transport.handleRequest(c);
});

Deno.serve(app.fetch);
