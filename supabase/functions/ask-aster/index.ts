import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPTransport } from "@hono/mcp";
import { Hono } from "hono";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { ALL_PROMPTS } from "./prompts/index.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
const ASTER_ACCESS_KEY = Deno.env.get("ASTER_ACCESS_KEY")!;

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
