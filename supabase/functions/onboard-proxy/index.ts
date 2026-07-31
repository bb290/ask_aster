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
    // ---------- obSubmit: /onboard wizard -> Client Relations // Initial Onboard ----------
    // OPEN endpoint by design (open-but-contained): writes ONLY to the Initial Onboard
    // project. Nothing here touches Property/Unit Settings; the push is a later staff step.
    if (action === "obSubmit") {
      const OB_PROJECT = "1216860326210544";
      const SECTIONS: Record<string, string> = { new_client: "New Submissions", add_property: "Existing Client Requests", add_unit: "Existing Client Requests" };
      const kind = ["new_client", "add_property", "add_unit"].includes(String(body.kind)) ? String(body.kind) : "new_client";
      const address = String(body.address ?? "").trim().slice(0, 200);
      if (!address) return j(headers, 400, { error: "missing_address", message: "Property address is required." });
      const answers = (body.answers && typeof body.answers === "object") ? body.answers as Record<string, string> : {};
      const units = (Array.isArray(body.units) ? body.units : []).slice(0, 30).map((u: Record<string, unknown>) => ({
        label: String(u.label ?? "").slice(0, 40), beds: String(u.beds ?? "").slice(0, 10),
        baths: String(u.baths ?? "").slice(0, 10), sqft: String(u.sqft ?? "").slice(0, 10),
        laundry: String(u.laundry ?? "").slice(0, 60), mail: String(u.mail ?? "").slice(0, 60),
        mailnum: String(u.mailnum ?? "").slice(0, 20), storage: String(u.storage ?? "").slice(0, 60),
        parking: String(u.parking ?? "").slice(0, 60), parknum: String(u.parknum ?? "").slice(0, 20),
        cooling: String(u.cooling ?? "").slice(0, 40),
      })).filter((u: { label: string }) => u.label);
      const sectionsDump = (Array.isArray(body.sections) ? body.sections : []).slice(0, 20).map((sec: Record<string, unknown>) => ({
        title: String(sec.title ?? "").slice(0, 80),
        rows: (Array.isArray(sec.rows) ? sec.rows : []).slice(0, 60).map((r: Record<string, unknown>) => ({
          q: String(r.q ?? "").slice(0, 160), a: String(r.a ?? "").slice(0, 1500),
        })).filter((r: { q: string; a: string }) => r.q && r.a),
      })).filter((sec: { rows: unknown[] }) => sec.rows.length);

      // task description: the full structured dump (source of record for unmapped answers)
      const lines: string[] = [`INITIAL ONBOARDING SUBMISSION (${kind.replace("_", " ")}) | ${address}`, `Submitted via the /onboard wizard on ${new Date(Date.now() - 7 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ")} (Seattle time).`, ""];
      for (const sec of sectionsDump) {
        lines.push(`=== ${sec.title.toUpperCase()} ===`);
        for (const r of sec.rows) lines.push(`${r.q}: ${r.a}`);
        lines.push("");
      }
      if (units.length) {
        lines.push("=== UNITS ===");
        units.forEach((u: Record<string, string>) => lines.push([`${u.label}: ${u.beds} bd / ${u.baths} ba${u.sqft ? " / " + u.sqft + " sqft" : ""}`,
          u.laundry ? `Laundry: ${u.laundry}` : "", u.mail ? `Mail: ${u.mail}${u.mailnum ? " #" + u.mailnum : ""}` : "",
          u.storage ? `Storage: ${u.storage}` : "", u.parking ? `Parking: ${u.parking}${u.parknum ? " #" + u.parknum : ""}` : "",
          u.cooling ? `A/C: ${u.cooling}` : ""].filter(Boolean).join(" | ")));
        lines.push("");
      }
      lines.push("Photos, leases, and HOA documents: owner was directed to email them to onboarding@sagareus.com.");

      // find target section
      const secs = await asana("GET", `/projects/${OB_PROJECT}/sections?opt_fields=name`);
      const target = (secs ?? []).find((x: { name: string }) => x.name === SECTIONS[kind]) ?? null;

      // enum matching helper against the project's own fields
      const settings = await asana("GET", `/projects/${OB_PROJECT}/custom_field_settings?limit=100&opt_fields=custom_field.gid,custom_field.name,custom_field.resource_subtype,custom_field.enum_options.gid,custom_field.enum_options.name`);
      const byName = new Map<string, { gid: string; type: string; options: { gid: string; name: string }[] }>();
      for (const st of settings ?? []) {
        const f = st.custom_field;
        byName.set(String(f.name).toLowerCase(), { gid: f.gid, type: f.resource_subtype, options: f.enum_options ?? [] });
      }
      const cf: Record<string, unknown> = {};
      const setText = (name: string, val: string) => {
        const f = byName.get(name.toLowerCase());
        if (f && val) cf[f.gid] = String(val).slice(0, 1000);
      };
      const setEnum = (name: string, val: string) => {
        const f = byName.get(name.toLowerCase());
        if (!f || !val) return;
        const hit = f.options.find((o) => o.name.toLowerCase() === val.toLowerCase()) ??
          f.options.find((o) => val.toLowerCase().startsWith(o.name.slice(0, 12).toLowerCase()) || o.name.toLowerCase().startsWith(val.slice(0, 12).toLowerCase()));
        if (hit) cf[f.gid] = hit.gid;
      };
      const setMulti = (name: string, val: string) => {
        const f = byName.get(name.toLowerCase());
        if (!f || !val) return;
        const gids = String(val).split(",").map((v) => v.trim()).filter(Boolean).map((v) => {
          const hit = f.options.find((o) => o.name.toLowerCase() === v.toLowerCase()) ??
            f.options.find((o) => v.toLowerCase().startsWith(o.name.slice(0, 10).toLowerCase()) || o.name.toLowerCase().startsWith(v.slice(0, 10).toLowerCase()));
          return hit?.gid;
        }).filter(Boolean);
        if (gids.length) cf[f.gid] = gids;
      };
      const setNum = (name: string, val: string) => {
        const f = byName.get(name.toLowerCase());
        const n = Number(val);
        if (f && Number.isFinite(n) && n > 0) cf[f.gid] = n;
      };
      setEnum("Applicant Criteria", answers.criteria ?? "");
      setEnum("Pet Policy", answers.pets ?? "");
      setText("Construction Plans", answers.construction ?? "");
      setNum("Year Built", answers.yearBuilt ?? "");
      setText("🙆 Owner Phone(s)", answers.ownerPhones ?? "");
      setText("🙆 Owner Name(s)", answers.ownerNames ?? "");
      setText("🙆 Owner e-mail(s)", answers.ownerEmails ?? "");
      setText("Mailbox", answers.mailbox ?? "");
      setText("Storage", answers.storage ?? "");
      setText("Parking", answers.parking ?? "");
      setText("Cooling", answers.cooling ?? "");
      setText("EV Charger", answers.ev ?? "");
      setText("Internet Provider", answers.internetProvider ?? "");
      setText("Utilities", answers.utilities ?? "");
      setText("Appliances", answers.appliances ?? "");
      setText("Heating Type", answers.heating ?? "");
      setMulti("Laundry", answers.laundry ?? "");
      setNum("🤖 Estimated Market Rent", answers.estimatedRent ?? "");
      setText("Owner Preferences", answers.ownerPreferences ?? "");
      setText("Special Note", answers.specialNote ?? "");
      setText("Pest Control", answers.pest ?? "");
      setText("Common Area Cleaning", answers.commonArea ?? "");
      setText("Utilities - Electricity", ""); // enum-only; skip unless mapped
      // per-utility enum mapping (Tenant Account / Sagareus Pass Through / etc. is set at push, not here)

      const TITLE: Record<string, string> = { new_client: "Initial Onboarding", add_property: "Add Property", add_unit: "Add Unit" };
      const task = await asana("POST", "/tasks", {
        name: `${TITLE[kind]} | ${address}`,
        projects: [OB_PROJECT],
        notes: lines.join("\n").slice(0, 60000),
        custom_fields: Object.keys(cf).length ? cf : undefined,
      });
      if (target) { try { await asana("POST", `/sections/${target.gid}/addTask`, { task: task.gid }); } catch { /* stays in default */ } }

      // Push 2 (new clients): instantiate the (CLIENT) template in Client Relations 2.0
      let crUrl = "";
      if (kind === "new_client") {
        try {
          const CR_TEMPLATE = "1214028249129136"; // (CLIENT) <Address> / <Owner Name>
          const firstOwner = String(answers.ownerNames ?? "").split(",")[0].replace(/\s*\([^)]*\)/, "").trim();
          const job = await asana("POST", `/task_templates/${CR_TEMPLATE}/instantiateTask`, {
            name: `(CLIENT) ${address}${firstOwner ? " / " + firstOwner : ""}`,
          });
          let crGid = job?.new_task?.gid ?? "";
          for (let i = 0; i < 10 && !crGid; i++) {
            await new Promise((res) => setTimeout(res, 700));
            const jb = await asana("GET", `/jobs/${job.gid}`);
            if (jb?.status === "succeeded" || jb?.new_task?.gid) crGid = jb?.new_task?.gid ?? "";
            if (jb?.status === "failed") break;
          }
          if (crGid) {
            crUrl = `https://app.asana.com/0/0/${crGid}`;
            await asana("POST", `/tasks/${crGid}/stories`, { html_text: storyHtml(`Created by the onboarding wizard. Full onboarding data: https://app.asana.com/0/0/${task.gid}`) }).catch(() => null);
            await asana("POST", `/tasks/${task.gid}/stories`, { html_text: storyHtml(`Client Relations task created: ${crUrl}`) }).catch(() => null);
          }
        } catch { /* CR task creation is best-effort; onboarding data is already safe */ }
      }
      const unitNoField = byName.get("unit #");
      for (const u of units) {
        try {
          const detail = [`${u.beds} bd / ${u.baths} ba${u.sqft ? " / " + u.sqft + " sqft" : ""}`,
            u.laundry ? `Laundry: ${u.laundry}` : "", u.mail ? `Mail: ${u.mail}${u.mailnum ? " #" + u.mailnum : ""}` : "",
            u.storage ? `Storage: ${u.storage}` : "", u.parking ? `Parking: ${u.parking}${u.parknum ? " #" + u.parknum : ""}` : "",
            u.cooling ? `A/C: ${u.cooling}` : ""].filter(Boolean).join("\n");
          const sub = await asana("POST", `/tasks/${task.gid}/subtasks`, { name: `Unit ${u.label} | ${address}`, notes: detail });
          const n = Number(String(u.label).replace(/[^0-9]/g, ""));
          if (unitNoField && sub?.gid && Number.isFinite(n) && n > 0) {
            try { await asana("PUT", `/tasks/${sub.gid}`, { custom_fields: { [unitNoField.gid]: n } }); } catch { /* field may not accept */ }
          }
        } catch { /* best-effort */ }
      }

      // LLM summary -> Onboarding Summary field + comment (fail-soft)
      let summary = "";
      try {
        const OR_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
        if (OR_KEY) {
          const SYSTEM = "You write the Onboarding Summary for a Sagareus property management onboarding. From the intake below, write: (1) a tight 4-8 sentence operational summary a coordinator can act on (occupancy, transfer situation, access, utilities plan, policies chosen, risks/flags), then (2) a 30-60-90 Day Priorities list, 2-4 bullets per period, grounded ONLY in the intake. Plain text, no markdown headers other than the literal lines 'SUMMARY', '30 DAYS', '60 DAYS', '90 DAYS'. No em dashes. Do not invent facts.";
          const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${OR_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: "anthropic/claude-sonnet-5", max_tokens: 900, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: lines.join("\n").slice(0, 12000) }] }),
          });
          const jr = await r.json().catch(() => ({}));
          summary = String(jr?.choices?.[0]?.message?.content ?? "").trim();
          if (summary) {
            try { await asana("PUT", `/tasks/${task.gid}`, { custom_fields: { "1216860326654431": summary.slice(0, 1000) } }); } catch { /* field cap */ }
            await asana("POST", `/tasks/${task.gid}/stories`, { html_text: storyHtml(summary.slice(0, 60000)) });
          }
        }
      } catch { /* summary is best-effort */ }

      return j(headers, 200, { ok: true, taskGid: task.gid, taskUrl: `https://app.asana.com/0/0/${task.gid}`, crUrl, summarized: !!summary });
    }

    // ---------- propSave (internal, x-sv-key): verify + save proposal numbers to the deal ----------
    if (action === "propSave") {
      if (!TEAM_KEY || c.req.header("x-sv-key") !== TEAM_KEY) return j(headers, 401, { error: "bad_key" });
      const HS = Deno.env.get("HUBSPOT_CRM_TOKEN") ?? "";
      const email = String(body.email ?? "").trim().slice(0, 200);
      const rent = Number(body.estimatedRent);
      const propUrl = String(body.proposalUrl ?? "").slice(0, 400);
      const propData = String(body.proposalData ?? "").slice(0, 30000);
      const agreementUrl = String(body.agreementUrl ?? "").trim().slice(0, 500);
      const pricingIn = (body.pricing && typeof body.pricing === "object") ? body.pricing as Record<string, unknown> : {};
      const moveStage = body.moveStage === true;
      if (!HS || !email) return j(headers, 400, { error: "missing", message: "Email required." });
      const hs = (path: string, init?: RequestInit) => fetch("https://api.hubapi.com" + path, {
        ...init, headers: { "Authorization": `Bearer ${HS}`, "Content-Type": "application/json" },
      });
      const r = await hs("/crm/v3/objects/contacts/search", {
        method: "POST",
        body: JSON.stringify({ filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }], properties: ["email"], limit: 1 }),
      });
      const jr = await r.json().catch(() => ({}));
      const cid = jr?.results?.[0]?.id;
      if (!cid) return j(headers, 404, { error: "no_contact", message: "No HubSpot contact for that email." });
      const ar = await hs(`/crm/v4/objects/contacts/${cid}/associations/deals?limit=50`);
      const aj = await ar.json().catch(() => ({}));
      const ids = (aj?.results ?? []).map((x: { toObjectId?: unknown }) => x?.toObjectId).filter(Boolean);
      if (!ids.length) return j(headers, 404, { error: "no_deal", message: "No deal associated with that contact." });
      const br = await hs("/crm/v3/objects/deals/batch/read", {
        method: "POST",
        body: JSON.stringify({ inputs: ids.map((id: unknown) => ({ id: String(id) })), properties: ["dealname", "pipeline", "dealstage", "hs_lastmodifieddate", "authorization", "link"] }),
      });
      const bj = await br.json().catch(() => ({}));
      const deals = (bj?.results ?? []).filter((d: { properties?: Record<string, string> }) => d.properties?.pipeline === "2185322227")
        .sort((a: { properties?: Record<string, string> }, b: { properties?: Record<string, string> }) =>
          String(b.properties?.hs_lastmodifieddate ?? "").localeCompare(String(a.properties?.hs_lastmodifieddate ?? "")));
      const deal = deals[0];
      if (!deal) return j(headers, 404, { error: "no_mgmt_deal", message: "No Mgmt 3.0 deal for that contact." });
      const props: Record<string, string> = {};
      if (Number.isFinite(rent) && rent > 0) props.estimated_rent = String(rent);
      if (propUrl) props.ob_proposal_url = propUrl;
      // Save To Deal defaults (Brittany 2026-07-31):
      // - the client link also goes to the About-section "Proposal Link" field
      //   (internal name rentometer_link - the property was repurposed/relabeled in HubSpot)
      // - authorization defaults to 1000, FILL-BLANK ONLY (a negotiated amount survives re-saves)
      // - contract_start_date = proposal save date + 3 days, refreshed on every save
      if (propUrl) props.rentometer_link = propUrl;
      if (!String(deal.properties?.authorization ?? "").trim()) props.authorization = "1000";
      // Zillow/Redfin link: subject-property Zillow URL, fill-blank only (a hand-pasted
      // specific listing URL on the deal always wins over the generated search URL)
      const zillowUrl = String(body.zillowUrl ?? "").trim().slice(0, 400);
      if (/^https:\/\/www\.zillow\.com\//.test(zillowUrl) && !String(deal.properties?.link ?? "").trim()) props.link = zillowUrl;
      props.contract_start_date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
      if (propData) props.ob_proposal_data = propData;
      if (/^https:\/\/\S+$/.test(agreementUrl)) props.ob_agreement_url = agreementUrl;
      else if (agreementUrl === "-") props.ob_agreement_url = "";   // explicit clear
      // Finalized pricing: the same deal properties PandaDoc merges, so web + PDF + PandaDoc agree.
      for (const f of ["onboarding_fee", "lease_up_fee", "mgmt_fee", "renewal_fee", "annual_inspection_fee"]) {
        const v = Number((pricingIn as Record<string, unknown>)[f]);
        if (Number.isFinite(v) && v >= 0) props[f] = String(v);
      }
      // Stage move: only forward into Proposal Sent from pre-agreement stages; never pull a deal back from agreement/onboarding/won.
      const SENT_STAGE = "3505530582";
      const MOVABLE_FROM = new Set(["3505530579", "3505530580", "3505530581", "3505530583", "3505670865"]);
      let stageMoved = false, stageNote = "";
      const curStage = String(deal.properties?.dealstage ?? "");
      if (moveStage) {
        if (curStage === SENT_STAGE) stageNote = "Deal is already in Proposal Sent.";
        else if (MOVABLE_FROM.has(curStage)) { props.dealstage = SENT_STAGE; stageMoved = true; }
        else stageNote = "Stage left unchanged: the deal is already past the proposal step.";
      }
      if (!Object.keys(props).length) return j(headers, 400, { error: "nothing_to_save" });
      const ur = await hs(`/crm/v3/objects/deals/${deal.id}`, { method: "PATCH", body: JSON.stringify({ properties: props }) });
      if (!ur.ok) return j(headers, 502, { error: "deal_update_failed" });
      return j(headers, 200, { ok: true, dealName: String(deal.properties?.dealname ?? ""), saved: Object.keys(props), stageMoved, stageNote });
    }

    // ---------- propLoad: proposal payload by prospect email (open, read-only) ----------
    // Returns only proposal-safe facts: name, address, this prospect's own quoted pricing and
    // rent analysis. With a valid x-sv-key it adds staff context (stage, bed/bath, links).
    if (action === "propLoad") {
      const HS = Deno.env.get("HUBSPOT_CRM_TOKEN") ?? "";
      const email = String(body.email ?? "").trim().slice(0, 200);
      if (!HS || !email) return j(headers, 200, { ok: true, proposal: {} });
      const staff = !!TEAM_KEY && c.req.header("x-sv-key") === TEAM_KEY;
      try {
        const hs = (path: string, init?: RequestInit) => fetch("https://api.hubapi.com" + path, {
          ...init, headers: { "Authorization": `Bearer ${HS}`, "Content-Type": "application/json" },
        });
        const r = await hs("/crm/v3/objects/contacts/search", {
          method: "POST",
          body: JSON.stringify({ filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }], properties: ["firstname", "lastname", "email"], limit: 1 }),
        });
        const jr = await r.json().catch(() => ({}));
        const hit = jr?.results?.[0];
        if (!hit?.id) return j(headers, 200, { ok: true, proposal: {} });
        const c0 = hit.properties ?? {};
        const ar = await hs(`/crm/v4/objects/contacts/${hit.id}/associations/deals?limit=50`);
        const aj = await ar.json().catch(() => ({}));
        const ids = (aj?.results ?? []).map((x: { toObjectId?: unknown }) => x?.toObjectId).filter(Boolean);
        if (!ids.length) return j(headers, 200, { ok: true, proposal: { ownerName: [c0.firstname, c0.lastname].filter(Boolean).join(" ") } });
        const br = await hs("/crm/v3/objects/deals/batch/read", {
          method: "POST",
          body: JSON.stringify({ inputs: ids.map((id: unknown) => ({ id: String(id) })), properties: ["dealname", "pipeline", "dealstage", "subject_city", "hs_lastmodifieddate", "estimated_rent", "onboarding_fee", "lease_up_fee", "mgmt_fee", "renewal_fee", "annual_inspection_fee", "ob_proposal_data", "ob_agreement_url", "bed__bath__sqft", "units", "link", "rentometer_link", "ob_maintenance_dispatch", "ob_renewal_notice", "ob_leasing_notifications", "ob_applicant_criteria"] }),
        });
        const bj = await br.json().catch(() => ({}));
        const deals = (bj?.results ?? [])
          .map((d: { id?: unknown; properties?: Record<string, string> }) => ({ id: String(d.id ?? ""), p: d.properties ?? {} }))
          .filter((d: { id: string; p: Record<string, string> }) => d.p.pipeline === "2185322227");
        deals.sort((a: { p: Record<string, string> }, b: { p: Record<string, string> }) =>
          String(b.p.hs_lastmodifieddate ?? "").localeCompare(String(a.p.hs_lastmodifieddate ?? "")));
        const dd = deals[0];
        const d0 = dd?.p;
        if (!d0) return j(headers, 200, { ok: true, proposal: { ownerName: [c0.firstname, c0.lastname].filter(Boolean).join(" ") } });
        const name = String(d0.dealname ?? "").replace(/^\s*\[[^\]]*\]\s*/, "").trim();
        const city = String(d0.subject_city ?? "").trim();
        const address = city && name && !name.toLowerCase().includes(city.toLowerCase()) ? `${name}, ${city}` : name;
        let data: unknown = null;
        try { data = d0.ob_proposal_data ? JSON.parse(String(d0.ob_proposal_data)) : null; } catch { data = null; }
        const out: Record<string, unknown> = {
          ownerName: [c0.firstname, c0.lastname].filter(Boolean).join(" "),
          address, city,
          estimatedRent: String(d0.estimated_rent ?? ""),
          pricing: {
            onboarding_fee: String(d0.onboarding_fee ?? ""),
            lease_up_fee: String(d0.lease_up_fee ?? ""),
            mgmt_fee: String(d0.mgmt_fee ?? ""),
            renewal_fee: String(d0.renewal_fee ?? ""),
            annual_inspection_fee: String(d0.annual_inspection_fee ?? ""),
          },
          units: String(d0.units ?? ""),
          agreementUrl: String(d0.ob_agreement_url ?? ""),
          // bed/bath/sqft of the prospect's own property is proposal-safe; the client
          // header renders beds/baths from it (moved from staff-only 2026-07-29).
          bedBathSqft: String(d0.bed__bath__sqft ?? ""),
          // the prospect's own agreement-term selections (Agreement Terms section
          // prefills from these; propTerms writes them back)
          terms: {
            dispatch: String(d0.ob_maintenance_dispatch ?? ""),
            renewal: String(d0.ob_renewal_notice ?? ""),
            notifs: String(d0.ob_leasing_notifications ?? ""),
            criteria: String(d0.ob_applicant_criteria ?? ""),
          },
          data,
        };
        if (staff) {
          out.stage = String(d0.dealstage ?? "");
          out.zillow = String(d0.link ?? "");
          out.rentometer = String(d0.rentometer_link ?? "");
          out.dealName = String(d0.dealname ?? "");
          out.dealId = dd.id;   // Save To Deal opens the deal record in HubSpot
        }
        return j(headers, 200, { ok: true, proposal: out });
      } catch { return j(headers, 200, { ok: true, proposal: {} }); }
    }

    // ---------- propTerms: prospect saves agreement-term selections onto their own deal ----------
    // Open-but-contained (same pattern as obSubmit): writes ONLY the four whitelisted
    // preference fields, values validated against the exact option lists the onboarding
    // wizard uses, always to the prospect's own latest Mgmt 3.0 deal.
    if (action === "propTerms") {
      const HS = Deno.env.get("HUBSPOT_CRM_TOKEN") ?? "";
      const email = String(body.email ?? "").trim().slice(0, 200);
      const t = (body.terms ?? {}) as Record<string, unknown>;
      if (!HS || !email) return j(headers, 400, { ok: false, error: "missing email" });
      const OPTS: Record<string, string[]> = {
        ob_maintenance_dispatch: ["Dispatch", "Dispatch + Notify", "100% Owner Provide Instruction"],
        ob_renewal_notice: ["No Owner Communication", "Notify Only", "Owner Approval Required"],
        ob_applicant_criteria: ["Standard: 2.5x rent gross income, 650+ credit score", "Strict: 3x rent gross income & 650+ credit score", "Lenient: 2x rent gross income & 650+ credit score", "Not Sure - Please advise"],
      };
      const NOTIF_OPTS = ["None", "PreListing Email", "Listed!", "Weekly Updates", "Lease Signed!"];
      const KEYMAP: Record<string, string> = { dispatch: "ob_maintenance_dispatch", renewal: "ob_renewal_notice", criteria: "ob_applicant_criteria" };
      const props: Record<string, string> = {};
      for (const [k, prop] of Object.entries(KEYMAP)) {
        if (t[k] === undefined) continue;
        const v = String(t[k]).trim();
        if (v && !OPTS[prop].includes(v)) return j(headers, 400, { ok: false, error: `invalid ${k}` });
        props[prop] = v; // empty clears the field
      }
      if (t.notifs !== undefined) {
        const list = String(t.notifs).split(";").map((s) => s.trim()).filter(Boolean);
        if (list.some((v) => !NOTIF_OPTS.includes(v))) return j(headers, 400, { ok: false, error: "invalid notifs" });
        props.ob_leasing_notifications = list.join(";");
      }
      if (!Object.keys(props).length) return j(headers, 400, { ok: false, error: "nothing to save" });
      try {
        const hs = (path: string, init?: RequestInit) => fetch("https://api.hubapi.com" + path, {
          ...init, headers: { "Authorization": `Bearer ${HS}`, "Content-Type": "application/json" },
        });
        const r = await hs("/crm/v3/objects/contacts/search", {
          method: "POST",
          body: JSON.stringify({ filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }], properties: ["email"], limit: 1 }),
        });
        const jr = await r.json().catch(() => ({}));
        const hit = jr?.results?.[0];
        if (!hit?.id) return j(headers, 404, { ok: false, error: "no contact" });
        const ar = await hs(`/crm/v4/objects/contacts/${hit.id}/associations/deals?limit=50`);
        const aj = await ar.json().catch(() => ({}));
        const ids = (aj?.results ?? []).map((x: { toObjectId?: unknown }) => x?.toObjectId).filter(Boolean);
        if (!ids.length) return j(headers, 404, { ok: false, error: "no deal" });
        const br = await hs("/crm/v3/objects/deals/batch/read", {
          method: "POST",
          body: JSON.stringify({ inputs: ids.map((id: unknown) => ({ id: String(id) })), properties: ["pipeline", "hs_lastmodifieddate"] }),
        });
        const bj = await br.json().catch(() => ({}));
        const deals = (bj?.results ?? [])
          .map((d: { id?: unknown; properties?: Record<string, string> }) => ({ id: String(d.id ?? ""), p: d.properties ?? {} }))
          .filter((d: { id: string; p: Record<string, string> }) => d.id && d.p.pipeline === "2185322227");
        deals.sort((a: { p: Record<string, string> }, b: { p: Record<string, string> }) =>
          String(b.p.hs_lastmodifieddate ?? "").localeCompare(String(a.p.hs_lastmodifieddate ?? "")));
        const deal = deals[0];
        if (!deal) return j(headers, 404, { ok: false, error: "no deal" });
        const ur = await hs(`/crm/v3/objects/deals/${deal.id}`, { method: "PATCH", body: JSON.stringify({ properties: props }) });
        if (!ur.ok) return j(headers, 502, { ok: false, error: "save failed" });
        return j(headers, 200, { ok: true, saved: Object.keys(props) });
      } catch { return j(headers, 502, { ok: false, error: "save failed" }); }
    }

    // ---------- obAttach: owner shares document links onto their onboarding task ----------
    if (action === "obAttach") {
      const OB_PROJECT = "1216860326210544";
      const gid = String(body.taskGid ?? "").replace(/[^0-9]/g, "");
      if (!gid) return j(headers, 400, { error: "bad_task" });
      const links = (Array.isArray(body.links) ? body.links : []).slice(0, 10)
        .map((u: unknown) => String(u).trim()).filter((u: string) => /^https?:\/\/\S+$/.test(u) && u.length < 500);
      if (!links.length) return j(headers, 400, { error: "no_links", message: "Nothing to attach." });
      const task = await asana("GET", `/tasks/${gid}?opt_fields=projects.gid`).catch(() => null);
      const inOb = (task?.projects ?? []).some((p: { gid: string }) => p.gid === OB_PROJECT);
      if (!inOb) return j(headers, 403, { error: "not_onboarding_task" });
      const label = String(body.label ?? "documents").slice(0, 60);
      await asana("POST", `/tasks/${gid}/stories`, { html_text: storyHtml(`Owner shared ${label}:\n${links.join("\n")}`) });
      return j(headers, 200, { ok: true, attached: links.length });
    }

    // ---------- obUploadUrl: signed storage upload for owner documents ----------
    if (action === "obUploadUrl") {
      const OB_PROJECT = "1216860326210544";
      const gid = String(body.taskGid ?? "").replace(/[^0-9]/g, "");
      if (!gid) return j(headers, 400, { error: "bad_task" });
      const task = await asana("GET", `/tasks/${gid}?opt_fields=projects.gid`).catch(() => null);
      const inOb = (task?.projects ?? []).some((p: { gid: string }) => p.gid === OB_PROJECT);
      if (!inOb) return j(headers, 403, { error: "not_onboarding_task" });
      const supaUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const supaKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      if (!supaUrl || !supaKey) return j(headers, 500, { error: "storage_not_configured" });
      const filename = String(body.filename ?? "document").replace(/[^\w.\-]/g, "_").slice(0, 80);
      const key = `ob-docs/${gid}/${crypto.randomUUID().slice(0, 8)}-${filename}`;
      const sh = { "Authorization": `Bearer ${supaKey}`, "apikey": supaKey };
      await fetch(`${supaUrl}/storage/v1/bucket`, {
        method: "POST", headers: { ...sh, "Content-Type": "application/json" },
        body: JSON.stringify({ id: "inspections", name: "inspections", public: true }),
      }).catch(() => null);
      const r = await fetch(`${supaUrl}/storage/v1/object/upload/sign/inspections/${key}`, {
        method: "POST", headers: { ...sh, "Content-Type": "application/json" }, body: "{}",
      });
      const jr = await r.json().catch(() => ({}));
      if (!r.ok || !jr.url) return j(headers, 502, { error: "sign_failed", message: "Could not prepare the upload. Share a link instead, or email the file." });
      return j(headers, 200, {
        ok: true,
        uploadUrl: `${supaUrl}/storage/v1${jr.url}`,
        publicUrl: `${supaUrl}/storage/v1/object/public/inspections/${key}`,
      });
    }

    // ---------- obPrefill: HubSpot contact + Mgmt 3.0 deal-card lookup ----------
    // Returns only owner-safe facts (name, phone, property address). Internal deal fields
    // (fees, commissions, onboarding notes) must never be sent to the owner-facing form.
    if (action === "obPrefill") {
      const HS = Deno.env.get("HUBSPOT_CRM_TOKEN") ?? "";
      const email = String(body.email ?? "").trim().slice(0, 200);
      if (!HS || !email) return j(headers, 200, { ok: true, prefill: {} });
      try {
        const hs = (path: string, init?: RequestInit) => fetch("https://api.hubapi.com" + path, {
          ...init, headers: { "Authorization": `Bearer ${HS}`, "Content-Type": "application/json" },
        });
        const r = await hs("/crm/v3/objects/contacts/search", {
          method: "POST",
          body: JSON.stringify({ filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }], properties: ["firstname", "lastname", "email", "phone", "address", "city", "state", "zip"], limit: 1 }),
        });
        const jr = await r.json().catch(() => ({}));
        const hit = jr?.results?.[0];
        const c0 = hit?.properties ?? {};
        let dealAddress = "";
        let dealNotes = "", dealUnits = "", dealRent = "";
        let dealFields: Record<string, string> = {};
        if (hit?.id) {
          const MGMT_PIPELINE = "2185322227";                                        // Mgmt 3.0
          const ONBOARD_STAGES = new Set(["3505530584", "3505670864", "3540740803"]); // FS Onboard, TP Onboard, Closed Won
          const ar = await hs(`/crm/v4/objects/contacts/${hit.id}/associations/deals?limit=50`);
          const aj = await ar.json().catch(() => ({}));
          const ids = (aj?.results ?? []).map((x: { toObjectId?: unknown }) => x?.toObjectId).filter(Boolean);
          if (ids.length) {
            const br = await hs("/crm/v3/objects/deals/batch/read", {
              method: "POST",
              body: JSON.stringify({ inputs: ids.map((id: unknown) => ({ id: String(id) })), properties: ["dealname", "pipeline", "dealstage", "subject_city", "hs_lastmodifieddate", "onboarding_notes", "units", "bed__bath__sqft", "estimated_rent", "ob_property_type", "ob_year_built", "ob_vacancy_status", "ob_pet_policy", "ob_applicant_criteria", "ob_construction_planned", "ob_construction_timeline", "ob_maintenance_dispatch", "ob_renewal_notice", "ob_leasing_notifications", "ob_pm_transfer", "ob_pm_contact", "ob_rental_registration", "ob_registration_id", "ob_hoa", "ob_hoa_contact", "ob_hoa_manages", "ob_urgent_repairs", "ob_urgent_repairs_detail", "ob_move_out_date", "ob_deposit_refund", "ob_key_transfer", "ob_key_transfer_detail", "ob_tax_parcel_status", "ob_ub_electricity", "ob_ub_water_sewer", "ob_ub_garbage", "ob_ub_gas"] }),
            });
            const bj = await br.json().catch(() => ({}));
            const deals = (bj?.results ?? [])
              .map((d: { properties?: Record<string, string> }) => d.properties ?? {})
              .filter((p: Record<string, string>) => p.pipeline === MGMT_PIPELINE);
            deals.sort((a: Record<string, string>, b: Record<string, string>) =>
              ((ONBOARD_STAGES.has(b.dealstage) ? 1 : 0) - (ONBOARD_STAGES.has(a.dealstage) ? 1 : 0)) ||
              String(b.hs_lastmodifieddate ?? "").localeCompare(String(a.hs_lastmodifieddate ?? "")));
            const d0 = deals[0];
            dealNotes = String(d0?.onboarding_notes ?? "").slice(0, 2000);
            dealUnits = String(d0?.units ?? "");
            dealRent = String(d0?.estimated_rent ?? "");
            dealFields = {
              ptype: String(d0?.ob_property_type ?? ""),
              yearBuilt: String(d0?.ob_year_built ?? ""),
              occ: String(d0?.ob_vacancy_status ?? ""),
              // HubSpot enum values cannot hold semicolons; restore the wizard's exact string
              pets: String(d0?.ob_pet_policy ?? "").replace("up to 30lbs, $50/mo", "up to 30lbs; $50/mo"),
              criteria: String(d0?.ob_applicant_criteria ?? ""),
              construction: String(d0?.ob_construction_planned ?? ""),
              constrtime: String(d0?.ob_construction_timeline ?? ""),
              dispatch: String(d0?.ob_maintenance_dispatch ?? ""),
              renewal: String(d0?.ob_renewal_notice ?? ""),
              notifs: String(d0?.ob_leasing_notifications ?? ""),          // semicolon-joined multi
              pmxfer: String(d0?.ob_pm_transfer ?? ""),
              pmcontact: String(d0?.ob_pm_contact ?? ""),
              rentalreg: String(d0?.ob_rental_registration ?? ""),
              regid: String(d0?.ob_registration_id ?? ""),
              hoa: String(d0?.ob_hoa ?? ""),
              hoacontact: String(d0?.ob_hoa_contact ?? ""),
              hoamanage: String(d0?.ob_hoa_manages ?? ""),                 // semicolon-joined multi
              repairs: String(d0?.ob_urgent_repairs ?? ""),
              repairdetail: String(d0?.ob_urgent_repairs_detail ?? ""),
              moveout: String(d0?.ob_move_out_date ?? ""),
              depositrefund: String(d0?.ob_deposit_refund ?? ""),
              keys: String(d0?.ob_key_transfer ?? ""),
              keydetail: String(d0?.ob_key_transfer_detail ?? ""),
              conforming: String(d0?.ob_tax_parcel_status ?? ""),
              ubElec: String(d0?.ob_ub_electricity ?? ""),
              ubWater: String(d0?.ob_ub_water_sewer ?? ""),
              ubGarbage: String(d0?.ob_ub_garbage ?? ""),
              ubGas: String(d0?.ob_ub_gas ?? ""),
            };
            if (d0?.dealname) {
              const name = String(d0.dealname).replace(/^\s*\[[^\]]*\]\s*/, "").trim();  // strip "[MGMT]"-style prefixes
              const city = String(d0.subject_city ?? "").trim();
              dealAddress = city && !name.toLowerCase().includes(city.toLowerCase()) ? `${name}, ${city}` : name;
            }
          }
        }
        return j(headers, 200, { ok: true, prefill: {
          ownerName: [c0.firstname, c0.lastname].filter(Boolean).join(" "),
          email: c0.email ?? "", phone: c0.phone ?? "",
          address: dealAddress || [c0.address, c0.city, c0.state, c0.zip].filter(Boolean).join(", "),
          notes: dealNotes, unitsCount: dealUnits, estimatedRent: dealRent, fields: dealFields,
        } });
      } catch { return j(headers, 200, { ok: true, prefill: {} }); }
    }

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
