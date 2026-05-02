import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPTransport } from "@hono/mcp";
import { Hono } from "hono";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
const ASTER_ACCESS_KEY = Deno.env.get("ASTER_ACCESS_KEY")!;

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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
      "Semantic search over Sagareus's SOPs. Use this when the team asks operational questions like 'how do we handle a tenant who hasn't paid by day 14' or 'what's the process for adding a roommate'. Returns ranked SOP chunks with the source file path so the caller can pull the full doc if needed.",
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
              text: `No SOPs found matching "${query}"${filterNote}. Try broader phrasing or remove the service_line filter.`,
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
            text: `Found ${data.length} SOP chunk(s) for "${query}":\n\n${results.join("\n\n")}`,
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
  // Accept access key via header OR URL query parameter (?key=...)
  const provided = c.req.header("x-aster-key") || new URL(c.req.url).searchParams.get("key");
  if (!provided || provided !== ASTER_ACCESS_KEY) {
    return c.json({ error: "Invalid or missing access key" }, 401, corsHeaders);
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
