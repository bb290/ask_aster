// Onboarding proxy — the MVI that sunsets the Jotform onboarding form.
// Owner-facing, token-authenticated (no accounts). Writes ONLY Asana in v1.
//
// Actions:
//   - "link"   (internal, x-sv-key gated): generate a signed onboarding link for a
//              Property Settings task (or unit subtask), post it as a comment, return it.
//   - "info"   (token): the owner-supplied field subset for that task — schema + values.
//   - "submit" (token): write custom fields, sync "Owner to provide | X" gap subtasks,
//              post a verification summary comment for staff.
//
// Source of truth: Asana Property Settings (project 1211134623744906). Buildium
// writes are v2 (per Brittany, 2026-07-20). Bank/EFT/W-9 NEVER ride this form
// (slim encrypted Jotform holds those). Plan: website/owner-portal/MVI-JOTFORM-SUNSET.md

import { Hono } from "hono";

const ASANA_PAT = Deno.env.get("ASANA_PAT") ?? "";
const TEAM_KEY = Deno.env.get("SITE_VISIT_KEY") ?? "";
const SIGNING_SECRET = Deno.env.get("ONBOARD_SIGNING_SECRET") ?? "";
const PROPERTY_SETTINGS_PROJECT = "1211134623744906";
const ASANA = "https://app.asana.com/api/1.0";
const LINK_BASE = "https://www.sagareus.com/onboard";
const TOKEN_DAYS = 14;

// Owner-supplied subset of the Property Settings schema (staff-only fields excluded).
// Order here = order on the form. Labels/help are form-side; names must match Asana.
const OWNER_FIELDS: string[] = [
  "Utilities - Electricity", "Utilities - Gas", "Utilities - Water",
  "Utilities - Sewer / Storm Drain", "Utilities - Garbage", "Utilities - Oil",
  "Utilities - Internet", "Utilities",
  "Landscaping Maintenance", "Pest Control",
  "Heating Type", "Cooling", "HVAC Filter", "Laundry", "Parking", "Storage",
  "Appliances", "Mailbox", "EV Charger", "Internet Provider",
  "Hot Water Heater Install", "HVAC Servicing Completed", "Dryer Vent Cleaning Completed",
  "Septic Pump Date", "Roof Cleaning Completed", "Rental Registration Expiration",
  "Backflow Testing Date",
  "Owner Preferences",
];

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ??
  "https://www.sagareus.com,https://sagareus.com")
  .split(",").map((s) => s.trim()).filter(Boolean);

const app = new Hono();

function corsHeaders(origin: string | undefined): Record<string, string> {
  const allowed = origin && (
    ALLOWED_ORIGINS.includes(origin) ||
    origin.endsWith(".sagareus.com") || origin.endsWith(".hs-sites.com") ||
    origin.endsWith(".hubspotpagebuilder.com")
  );
  return {
    "Access-Control-Allow-Origin": allowed ? origin! : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, x-sv-key",
    "Vary": "Origin",
  };
}
function j(headers: Record<string, string>, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

async function asana(method: string, path: string, body?: unknown) {
  const res = await fetch(`${ASANA}${path}`, {
    method,
    headers: { "Authorization": `Bearer ${ASANA_PAT}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify({ data: body }) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`asana ${method} ${path} -> ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return json.data;
}
function storyHtml(text: string): string {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<body>${escaped.replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}">${u}</a>`)}</body>`;
}

// ---------- token: base64url(gid.exp).base64url(hmac) ----------
const enc = new TextEncoder();
function b64u(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function hmac(msg: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(SIGNING_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}
async function makeToken(gid: string): Promise<string> {
  const exp = Date.now() + TOKEN_DAYS * 86400000;
  const payload = `${gid}.${exp}`;
  return `${b64u(enc.encode(payload))}.${b64u(await hmac(payload))}`;
}
async function verifyToken(token: string): Promise<string | null> {
  const [p, sig] = String(token).split(".");
  if (!p || !sig) return null;
  let payload: string;
  try { payload = atob(p.replace(/-/g, "+").replace(/_/g, "/")); } catch { return null; }
  const expect = b64u(await hmac(payload));
  if (expect !== sig) return null;
  const [gid, expStr] = payload.split(".");
  if (!gid || !/^\d+$/.test(gid) || Date.now() > Number(expStr)) return null;
  return gid;
}

// ---------- schema ----------
async function fieldSchema(): Promise<Map<string, { gid: string; type: string; options: { gid: string; name: string }[] }>> {
  const settings = await asana("GET", `/projects/${PROPERTY_SETTINGS_PROJECT}/custom_field_settings?limit=100&opt_fields=custom_field.gid,custom_field.name,custom_field.type,custom_field.enum_options.gid,custom_field.enum_options.name,custom_field.enum_options.enabled`);
  const map = new Map();
  for (const s of settings ?? []) {
    const f = s.custom_field;
    if (!f || !OWNER_FIELDS.includes(f.name)) continue;
    map.set(f.name, {
      gid: f.gid, type: f.type,
      options: (f.enum_options ?? []).filter((o: { enabled?: boolean }) => o.enabled !== false).map((o: { gid: string; name: string }) => ({ gid: o.gid, name: o.name })),
    });
  }
  return map;
}
function displayValue(cf: Record<string, unknown>): string {
  return String(cf.display_value ?? "").trim();
}

app.options("*", (c) => new Response(null, { status: 204, headers: corsHeaders(c.req.header("origin")) }));

app.post("/onboard-proxy", async (c) => {
  const origin = c.req.header("origin");
  const headers = corsHeaders(origin);
  if (origin) {
    const ok = ALLOWED_ORIGINS.includes(origin) ||
      origin.endsWith(".sagareus.com") || origin.endsWith(".hs-sites.com") || origin.endsWith(".hubspotpagebuilder.com");
    if (!ok) return j(headers, 403, { error: "origin_not_allowed" });
  }
  if (!ASANA_PAT || !SIGNING_SECRET) return j(headers, 500, { error: "server_not_configured" });

  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return j(headers, 400, { error: "bad_json" }); }
  const action = String(body.action ?? "");

  try {
    // ---------- link (internal) ----------
    if (action === "link") {
      if (!TEAM_KEY || c.req.header("x-sv-key") !== TEAM_KEY) return j(headers, 401, { error: "bad_key" });
      const raw = String(body.taskGid ?? "").trim();
      const gid = (raw.match(/\d{10,}/g) ?? []).pop() ?? "";   // accepts a bare gid or a pasted Asana URL
      if (!gid) return j(headers, 400, { error: "bad_task", message: "Paste the Property Settings task link or gid." });
      const task = await asana("GET", `/tasks/${gid}?opt_fields=name,parent.gid,projects.gid,permalink_url`);
      const inPs = (task.projects ?? []).some((p: { gid: string }) => p.gid === PROPERTY_SETTINGS_PROJECT);
      let parentInPs = false;
      if (!inPs && task.parent?.gid) {
        const parent = await asana("GET", `/tasks/${task.parent.gid}?opt_fields=projects.gid`);
        parentInPs = (parent.projects ?? []).some((p: { gid: string }) => p.gid === PROPERTY_SETTINGS_PROJECT);
      }
      if (!inPs && !parentInPs) return j(headers, 400, { error: "not_property_settings", message: "That task is not in the Property Settings project." });
      const url = `${LINK_BASE}?key=${await makeToken(gid)}`;
      await asana("POST", `/tasks/${gid}/stories`, { html_text: storyHtml(`Onboarding link for the owner (expires in ${TOKEN_DAYS} days):\n${url}`) });
      return j(headers, 200, { url, expiresDays: TOKEN_DAYS, task: task.name });
    }

    // ---------- info (token) ----------
    if (action === "info") {
      const gid = await verifyToken(String(body.key ?? ""));
      if (!gid) return j(headers, 401, { error: "bad_link", message: "This link is invalid or has expired. Ask your Sagareus contact for a fresh one." });
      const [schema, task] = await Promise.all([
        fieldSchema(),
        asana("GET", `/tasks/${gid}?opt_fields=name,custom_fields.gid,custom_fields.name,custom_fields.type,custom_fields.display_value`),
      ]);
      const onTask = new Map((task.custom_fields ?? []).map((cf: { name: string }) => [cf.name, cf]));
      const fields = [];
      for (const name of OWNER_FIELDS) {
        const sc = schema.get(name);
        const cf = onTask.get(name) as Record<string, unknown> | undefined;
        if (!sc || !cf) continue;   // field not present on this task
        fields.push({ gid: sc.gid, name, type: sc.type, options: sc.options, value: displayValue(cf) });
      }
      const remaining = fields.filter((f) => !f.value).length;
      return j(headers, 200, { property: String(task.name).replace(/^Settings\s*\/\/\s*/i, ""), fields, remaining });
    }

    // ---------- submit (token) ----------
    if (action === "submit") {
      const gid = await verifyToken(String(body.key ?? ""));
      if (!gid) return j(headers, 401, { error: "bad_link", message: "This link is invalid or has expired. Ask your Sagareus contact for a fresh one." });
      const values = (body.values ?? {}) as Record<string, unknown>;
      const schema = await fieldSchema();
      const byGid = new Map([...schema.values()].map((s) => [s.gid, s]));
      const payload: Record<string, unknown> = {};
      for (const [fgid, raw] of Object.entries(values)) {
        const sc = byGid.get(fgid);
        if (!sc) continue;                                   // not an owner field: ignored
        if (sc.type === "text") payload[fgid] = String(raw ?? "").slice(0, 2000);
        else if (sc.type === "date") {
          const d = String(raw ?? "").trim();
          if (d === "") payload[fgid] = null;
          else if (/^\d{4}-\d{2}-\d{2}$/.test(d)) payload[fgid] = { date: d };
        } else if (sc.type === "enum") {
          const v = String(raw ?? "");
          payload[fgid] = v && sc.options.some((o) => o.gid === v) ? v : null;
        } else if (sc.type === "multi_enum") {
          const arr = Array.isArray(raw) ? raw.map(String) : [];
          payload[fgid] = arr.filter((v) => sc.options.some((o) => o.gid === v));
        }
      }
      if (Object.keys(payload).length) await asana("PUT", `/tasks/${gid}`, { custom_fields: payload });

      // gap subtasks: ensure one per still-empty owner field, complete ones now filled
      const [task, subs] = await Promise.all([
        asana("GET", `/tasks/${gid}?opt_fields=name,custom_fields.name,custom_fields.display_value`),
        asana("GET", `/tasks/${gid}/subtasks?limit=100&opt_fields=name,completed`),
      ]);
      const filled: string[] = [], empty: string[] = [];
      for (const name of OWNER_FIELDS) {
        const cf = (task.custom_fields ?? []).find((f: { name: string }) => f.name === name);
        if (!cf) continue;
        (displayValue(cf) ? filled : empty).push(name);
      }
      const gapName = (n: string) => `Owner to provide | ${n}`;
      for (const name of empty) {
        const existing = (subs ?? []).find((s: { name: string }) => s.name === gapName(name));
        if (!existing) await asana("POST", `/tasks/${gid}/subtasks`, { name: gapName(name), notes: "Auto-created by the onboarding form: the owner has not provided this yet. Completes automatically when they do." });
      }
      for (const name of filled) {
        const open = (subs ?? []).find((s: { name: string; completed: boolean }) => s.name === gapName(name) && !s.completed);
        if (open) await asana("PUT", `/tasks/${open.gid}`, { completed: true });
      }
      await asana("POST", `/tasks/${gid}/stories`, {
        html_text: storyHtml(
          `Onboarding form submission (via /onboard):\nProvided (${filled.length}): ${filled.join(", ") || "none"}\nStill needed (${empty.length}): ${empty.join(", ") || "none"}\nStaff: verify the entries above; Buildium remains manual in v1.`,
        ),
      });
      return j(headers, 200, { saved: Object.keys(payload).length, remaining: empty });
    }

    return j(headers, 400, { error: "unknown_action" });
  } catch (e) {
    console.error(e);
    return j(headers, 500, { error: "server_error", message: "Something went wrong on our side. Try again shortly." });
  }
});

app.all("*", (c) => new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: { ...corsHeaders(c.req.header("origin")), "Content-Type": "application/json" } }));

Deno.serve(app.fetch);
