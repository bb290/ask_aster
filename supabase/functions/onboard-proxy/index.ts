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

// ---------- Owner Feed constants + helpers ----------
const FEED_WS = "706990140225747";
const FEED_CR = "1208917007356847";            // Client Relations 2.0 (gate + About)
const FEED_PS = "1211134623744906";            // Property Settings (data + unit subtasks)
const FEED_PID_FIELD = "1213183108704512";     // Property ID custom field (the join key)
const FEED_PROJECTS = [
  { key: "maintenance", title: "Maintenance", gid: "1210320631715650" },
  { key: "rentcollection", title: "Rent Collection", gid: "1201903129380637" },
  { key: "residentrelations", title: "Resident Relations", gid: "1201903129380625" },
  { key: "renewal", title: "Lease Renewal", gid: "1205087214629788" },
  { key: "leasing", title: "Leasing", gid: "1208297375044026" },
  { key: "annualinspection", title: "Annual Inspection", gid: "1205841857464078" },
  { key: "mfinspection", title: "Multifamily Inspection", gid: "1211332673219694" },
];
const FEED_CF_OPT = "gid,name,custom_fields.gid,custom_fields.name,custom_fields.type,custom_fields.display_value,custom_fields.enum_options.gid,custom_fields.enum_options.name,custom_fields.enum_options.enabled";
// never shown to owners (internal links / geo / plumbing)
const FEED_HIDDEN_FIELDS = new Set(["Playbook", "Latitude", "Longitude", "Lease ID"]);
// shown when filled, but never owner-fillable (staff join keys / staff-only judgment)
const FEED_STAFF_FIELDS = new Set(["Property ID", "Unit ID", "Unit #", "Auto Utility Processing Mode"]);
type FeedTask = { gid?: unknown; name?: unknown; due_on?: unknown; completed_at?: unknown; custom_fields?: { name?: unknown; display_value?: unknown }[]; memberships?: { project?: { gid?: unknown }; section?: { name?: unknown } }[] };
type FeedItem = { label: string; info: string; due: string; done: string } | null;
function feedScrub(s: string): string {
  return s.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "").replace(/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/g, "").replace(/\s{2,}/g, " ").trim();
}
function feedUnit(name: string): string {
  const m = name.match(/#\s*([A-Za-z0-9-]+)/);
  return m ? m[1] : "";
}
function feedUnitFromName(name: string): string {
  return feedUnit(name) || name.split("//").pop()?.trim() || name;
}
function feedSearchText(address: string): string {
  const STOP = new Set(["n", "s", "e", "w", "ne", "nw", "se", "sw", "north", "south", "east", "west", "st", "street", "ave", "avenue", "rd", "road", "blvd", "boulevard", "way", "dr", "drive", "ct", "court", "pl", "place", "ln", "lane", "hwy", "apt", "unit"]);
  return address.split(/\s+/).filter((t) => !STOP.has(t.toLowerCase().replace(/[.,]/g, ""))).join(" ").trim() || address;
}
function feedOwnerNames(notes: string): string {
  // the (CLIENT) task description opens with "Owner Contact(s)" then the names line
  const lines = notes.split("\n").map((l) => l.trim());
  const i = lines.findIndex((l) => /^owner contact/i.test(l));
  const cand = i > -1 ? (lines[i + 1] ?? "") : "";
  return /@/.test(cand) ? "" : cand;
}
function feedDateVal(v: string): string {
  const s = v.trim();
  if (!s) return "";
  if (s.startsWith("9999")) return "N/A";
  return s.slice(0, 10);
}
function feedFields(cfs: Record<string, unknown>[]): { gid: string; name: string; type: string; value: string; blank: boolean; fillable: boolean; options?: string[] }[] {
  const out: { gid: string; name: string; type: string; value: string; blank: boolean; fillable: boolean; options?: string[] }[] = [];
  for (const c of cfs ?? []) {
    const name = String(c.name ?? "");
    if (FEED_HIDDEN_FIELDS.has(name)) continue;
    const type = String(c.type ?? "");
    let value = String(c.display_value ?? "").trim();
    if (type === "date") value = feedDateVal(value);
    const blank = !value;
    if (blank && FEED_STAFF_FIELDS.has(name)) continue;   // blank staff keys are noise to owners
    const fillable = blank && !FEED_STAFF_FIELDS.has(name) && ["text", "number", "date", "enum", "multi_enum"].includes(type);
    const row: { gid: string; name: string; type: string; value: string; blank: boolean; fillable: boolean; options?: string[] } = {
      gid: String(c.gid ?? ""), name, type, value, blank, fillable,
    };
    if (fillable && (type === "enum" || type === "multi_enum")) {
      row.options = ((c.enum_options ?? []) as { name?: unknown; enabled?: boolean }[]).filter((o) => o.enabled !== false).map((o) => String(o.name ?? ""));
    }
    out.push(row);
  }
  return out;
}
function feedItem(prKey: string, t: FeedTask, open: boolean): FeedItem {
  const cf: Record<string, string> = {};
  for (const c of t.custom_fields ?? []) cf[String(c.name)] = String(c.display_value ?? "").trim();
  const name = String(t.name ?? "");
  const unit = feedUnit(name);
  const due = open ? String(t.due_on ?? "") : "";
  const done = !open ? String(t.completed_at ?? "").slice(0, 10) : "";
  if (prKey === "rentcollection") {
    // vacated / payment-plan / 3rd-party collections are out of scope, and titles can
    // carry resident names, so these items NEVER render from the raw title
    const sec = (t.memberships ?? []).map((m) => String(m?.section?.name ?? "")).join(" | ").toLowerCase();
    if (/vacated|payment plan|3rd party|third party/.test(sec)) return null;
    const bits: string[] = [];
    if (cf["Balance"]) bits.push("Balance $" + cf["Balance"]);
    if (cf["Status"]) bits.push(cf["Status"]);
    if (!open && !bits.length) bits.push("Resolved");
    return { label: unit ? "Unit " + unit : "Rent collection item", info: bits.join(" · "), due, done };
  }
  if (prKey === "renewal") {
    const from = cf["\u{1F916} Current Total"], to = cf["\u{1F916} New Total"];
    const TYPE_LABEL: Record<string, string> = { "Renew": "Renewed", "N2V": "Notice To Vacate" };
    const typeLbl = TYPE_LABEL[cf["Type"] ?? ""] ?? (cf["Type"] || "");
    const info = from && to && Number(to) > 0 ? "Rent $" + from + " → $" + to : typeLbl;
    return { label: unit ? "Unit " + unit : "Renewal", info, due, done };
  }
  if (prKey === "annualinspection" || prKey === "mfinspection") {
    return { label: unit ? "Unit " + unit : "Building inspection", info: "", due, done };
  }
  if (prKey === "leasing") {
    // owner-facing lifecycle dates from the Leasing task (Brittany 2026-08-01)
    const fmt = (v: string) => {
      const s = (v || "").slice(0, 10);
      if (!s) return "";
      const d = new Date(s + "T12:00:00Z");
      return isNaN(d.getTime()) ? s : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    };
    const bits: string[] = [];
    const mo = fmt(cf["\u{1F64C} Tenant Move-Out Date"]); if (mo) bits.push("Move Out " + mo);
    const ld = fmt(cf["\u{1F481} List Date"]); if (ld) bits.push("Listed " + ld);
    const mi = fmt(cf["\u{1F64C} Move in Date"]); if (mi) bits.push("Move In " + mi);
    const lhead = feedScrub(name.split(/[|<]/)[0].trim()) || "Leasing";
    return {
      label: unit ? "Unit " + unit : lhead,
      info: bits.length ? bits.join(" · ") : (unit ? lhead : ""),
      due, done,
    };
  }
  // maintenance / resident relations / leasing: title segment before the separator, scrubbed
  const head = feedScrub(name.split(/\/\/|[|<]/)[0].trim());
  if (!head) return null;
  return { label: head, info: unit ? "Unit " + unit : "", due, done };
}

// ---------- proposal deal locator (shared by propTerms / propAccept) ----------
// Finds the prospect's latest Mgmt 3.0 deal by contact email OR by the address slug
// carried in ob_proposal_url, plus the emails of the deal's associated contacts.
async function locateMgmtDeal(HS: string, email: string, slug: string, props: string[]):
  Promise<{ id: string; p: Record<string, string>; contactEmails: string[] } | null> {
  const hs = (path: string, init?: RequestInit) => fetch("https://api.hubapi.com" + path, {
    ...init, headers: { "Authorization": `Bearer ${HS}`, "Content-Type": "application/json" },
  });
  const want = [...new Set(["pipeline", "hs_lastmodifieddate", "ob_proposal_url", ...props])];
  let dealId = "", dealProps: Record<string, string> = {};
  if (email) {
    const r = await hs("/crm/v3/objects/contacts/search", {
      method: "POST",
      body: JSON.stringify({ filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }], properties: ["email"], limit: 1 }),
    });
    const jr = await r.json().catch(() => ({}));
    const hit = jr?.results?.[0];
    if (!hit?.id) return null;
    const ar = await hs(`/crm/v4/objects/contacts/${hit.id}/associations/deals?limit=50`);
    const aj = await ar.json().catch(() => ({}));
    const ids = (aj?.results ?? []).map((x: { toObjectId?: unknown }) => x?.toObjectId).filter(Boolean);
    if (!ids.length) return null;
    const br = await hs("/crm/v3/objects/deals/batch/read", {
      method: "POST",
      body: JSON.stringify({ inputs: ids.map((id: unknown) => ({ id: String(id) })), properties: want }),
    });
    const bj = await br.json().catch(() => ({}));
    const deals = (bj?.results ?? [])
      .map((d: { id?: unknown; properties?: Record<string, string> }) => ({ id: String(d.id ?? ""), p: d.properties ?? {} }))
      .filter((d: { id: string; p: Record<string, string> }) => d.id && d.p.pipeline === "2185322227");
    deals.sort((a: { p: Record<string, string> }, b: { p: Record<string, string> }) =>
      String(b.p.hs_lastmodifieddate ?? "").localeCompare(String(a.p.hs_lastmodifieddate ?? "")));
    if (!deals[0]) return null;
    dealId = deals[0].id; dealProps = deals[0].p;
  } else if (slug) {
    const sr = await hs("/crm/v3/objects/deals/search", {
      method: "POST",
      body: JSON.stringify({
        filterGroups: [{ filters: [
          { propertyName: "pipeline", operator: "EQ", value: "2185322227" },
          { propertyName: "ob_proposal_url", operator: "CONTAINS_TOKEN", value: slug },
        ] }],
        sorts: [{ propertyName: "hs_lastmodifieddate", direction: "DESCENDING" }],
        properties: want, limit: 20,
      }),
    });
    const sj = await sr.json().catch(() => ({}));
    const dd = (sj?.results ?? [])
      .map((d: { id?: unknown; properties?: Record<string, string> }) => ({ id: String(d.id ?? ""), p: d.properties ?? {} }))
      .filter((d: { id: string; p: Record<string, string> }) => String(d.p.ob_proposal_url ?? "").endsWith("p=" + slug))[0];
    if (!dd) return null;
    dealId = dd.id; dealProps = dd.p;
  } else return null;
  const contactEmails: string[] = email ? [email] : [];
  if (!email) {
    const car = await hs(`/crm/v4/objects/deals/${dealId}/associations/contacts?limit=5`);
    const caj = await car.json().catch(() => ({}));
    const cids = (caj?.results ?? []).map((x: { toObjectId?: unknown }) => String(x?.toObjectId ?? "")).filter(Boolean);
    if (cids.length) {
      const cbr = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/batch/read", {
        method: "POST", headers: { "Authorization": `Bearer ${HS}`, "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: cids.map((id: string) => ({ id })), properties: ["email"] }),
      });
      const cbj = await cbr.json().catch(() => ({}));
      for (const ct of (cbj?.results ?? [])) {
        const em = String(ct?.properties?.email ?? "").trim();
        if (em) contactEmails.push(em);
      }
    }
  }
  return { id: dealId, p: dealProps, contactEmails };
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
      // readable rich-text version of the dump (Brittany 2026-07-31). Asana derives the
      // plain-text notes from this: each <li> still yields a "Question: Answer" line and
      // each section title its own line, so downstream parsers keep line-based access.
      const hesc = (t: string) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const htmlParts: string[] = [`<b>INITIAL ONBOARDING SUBMISSION (${hesc(kind.replace("_", " "))}) | ${hesc(address)}</b>\n${hesc(lines[1])}\n`];
      for (const sec of sectionsDump) {
        htmlParts.push(`\n<b><u>${hesc(sec.title.toUpperCase())}</u></b>\n<ul>${sec.rows.map((r) => `<li><b>${hesc(r.q)}:</b> ${hesc(r.a)}</li>`).join("")}</ul>`);
      }
      if (units.length) {
        htmlParts.push(`\n<b><u>UNITS</u></b>\n<ul>${units.map((u: Record<string, string>) => `<li><b>${hesc(u.label)}:</b> ${hesc([`${u.beds} bd / ${u.baths} ba${u.sqft ? " / " + u.sqft + " sqft" : ""}`,
          u.laundry ? `Laundry: ${u.laundry}` : "", u.mail ? `Mail: ${u.mail}${u.mailnum ? " #" + u.mailnum : ""}` : "",
          u.storage ? `Storage: ${u.storage}` : "", u.parking ? `Parking: ${u.parking}${u.parknum ? " #" + u.parknum : ""}` : "",
          u.cooling ? `A/C: ${u.cooling}` : ""].filter(Boolean).join(" | "))}</li>`).join("")}</ul>`);
      }
      htmlParts.push(`\nPhotos, leases, and HOA documents: owner was directed to email them to onboarding@sagareus.com.`);
      const htmlNotes = `<body>${htmlParts.join("")}</body>`.slice(0, 60000);
      let task;
      try {
        task = await asana("POST", "/tasks", {
          name: `${TITLE[kind]} | ${address}`,
          projects: [OB_PROJECT],
          html_notes: htmlNotes,
          custom_fields: Object.keys(cf).length ? cf : undefined,
        });
      } catch {
        // rich text rejected: fall back to the plain dump so a submission never fails on formatting
        task = await asana("POST", "/tasks", {
          name: `${TITLE[kind]} | ${address}`,
          projects: [OB_PROJECT],
          notes: lines.join("\n").slice(0, 60000),
          custom_fields: Object.keys(cf).length ? cf : undefined,
        });
      }
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
            // Communication Settings multi-enum on Client Relations 2.0 from the owner's
            // wizard selections (Brittany 2026-07-31). Only ENABLED enum options are mapped;
            // most Leasing options are disabled in Asana, so only "None" maps there.
            try {
              const COMM_FIELD = "1212930081639044";
              const opts: string[] = [];
              const disp = String(answers.dispatch ?? "");
              if (disp === "Dispatch") opts.push("1212930081639047");                       // Maintenance - No Owner Communication
              else if (disp === "Dispatch + Notify") opts.push("1212930081639045");         // Maintenance - Notify & Dispatch
              else if (disp === "100% Owner Provide Instruction") opts.push("1212930081639046"); // Maintenance - Approval Needed
              const ren = String(answers.renewal ?? "");
              if (ren === "Owner Approval Required") opts.push("1212930081639054");
              else if (ren === "Notify Only") opts.push("1212930081639055");
              else if (ren === "No Owner Communication") opts.push("1212930081639056");
              if (/\bNone\b/.test(String(answers.notifs ?? ""))) opts.push("1212930081639053"); // Leasing - No Owner Communication
              if (opts.length) await asana("PUT", `/tasks/${crGid}`, { custom_fields: { [COMM_FIELD]: opts } });
            } catch { /* comm settings are best-effort */ }
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

      // New-client submissions also advance the HubSpot deal to Full Service PM / Onboard
      // (Brittany 2026-07-31). Best effort: an Asana push that already succeeded is never
      // failed by a CRM hiccup. Guarded to only move FORWARD from pre-onboard stages.
      let dealStageMoved = false;
      if (kind === "new_client") {
        try {
          const HS = Deno.env.get("HUBSPOT_CRM_TOKEN") ?? "";
          const firstEmail = (String(answers.ownerEmails ?? "").match(/[^\s,;]+@[^\s,;]+\.[^\s,;]+/) || [""])[0];
          if (HS && firstEmail) {
            const hs = (path: string, init?: RequestInit) => fetch("https://api.hubapi.com" + path, {
              ...init, headers: { "Authorization": `Bearer ${HS}`, "Content-Type": "application/json" },
            });
            const r0 = await hs("/crm/v3/objects/contacts/search", {
              method: "POST",
              body: JSON.stringify({ filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: firstEmail }] }], properties: ["email"], limit: 1 }),
            });
            const cid = (await r0.json().catch(() => ({})))?.results?.[0]?.id;
            if (cid) {
              const ar = await hs(`/crm/v4/objects/contacts/${cid}/associations/deals?limit=50`);
              const dids = ((await ar.json().catch(() => ({})))?.results ?? []).map((x: { toObjectId?: unknown }) => x?.toObjectId).filter(Boolean);
              if (dids.length) {
                const br2 = await hs("/crm/v3/objects/deals/batch/read", {
                  method: "POST",
                  body: JSON.stringify({ inputs: dids.map((id: unknown) => ({ id: String(id) })), properties: ["pipeline", "dealstage", "hs_lastmodifieddate"] }),
                });
                const ds = (((await br2.json().catch(() => ({})))?.results ?? []) as { id?: unknown; properties?: Record<string, string> }[])
                  .map((d) => ({ id: String(d.id ?? ""), p: d.properties ?? {} }))
                  .filter((d) => d.id && d.p.pipeline === "2185322227")
                  .sort((a2, b2) => String(b2.p.hs_lastmodifieddate ?? "").localeCompare(String(a2.p.hs_lastmodifieddate ?? "")));
                const dd2 = ds[0];
                const PRE_ONBOARD = ["3505530579", "3505530580", "3505530581", "3505530582", "3505530583", "3505670863", "3505670865"];
                if (dd2 && PRE_ONBOARD.includes(String(dd2.p.dealstage ?? ""))) {
                  const um = await hs(`/crm/v3/objects/deals/${dd2.id}`, { method: "PATCH", body: JSON.stringify({ properties: { dealstage: "3505530584" } }) });
                  dealStageMoved = um.ok;
                }
                // push the submission back onto the deal's onboarding-wizard properties
                // (mirror of the obPrefill mapping; overwrite - the wizard submission is
                // the owner's authoritative answer set)
                if (dd2) {
                  const DF_MAP: Record<string, string> = {
                    ptype: "ob_property_type", yearBuilt: "ob_year_built", occ: "ob_vacancy_status",
                    pets: "ob_pet_policy", criteria: "ob_applicant_criteria",
                    construction: "ob_construction_planned", constrtime: "ob_construction_timeline",
                    dispatch: "ob_maintenance_dispatch", renewal: "ob_renewal_notice", notifs: "ob_leasing_notifications",
                    pmxfer: "ob_pm_transfer", pmcontact: "ob_pm_contact", rentalreg: "ob_rental_registration",
                    regid: "ob_registration_id", hoa: "ob_hoa", hoacontact: "ob_hoa_contact", hoamanage: "ob_hoa_manages",
                    repairs: "ob_urgent_repairs", repairdetail: "ob_urgent_repairs_detail", moveout: "ob_move_out_date",
                    depositrefund: "ob_deposit_refund", keys: "ob_key_transfer", keydetail: "ob_key_transfer_detail",
                    conforming: "ob_tax_parcel_status", ubElec: "ob_ub_electricity", ubWater: "ob_ub_water_sewer",
                    ubGarbage: "ob_ub_garbage", ubGas: "ob_ub_gas", unitsCount: "units", ownernotes: "onboarding_notes",
                  };
                  const df = (body.dealFields && typeof body.dealFields === "object") ? body.dealFields as Record<string, unknown> : {};
                  const fprops: Record<string, string> = {};
                  for (const [k, prop] of Object.entries(DF_MAP)) {
                    const v = String(df[k] ?? "").trim().slice(0, 1000);
                    if (v) fprops[prop] = v;
                  }
                  if (Object.keys(fprops).length) {
                    const fr = await hs(`/crm/v3/objects/deals/${dd2.id}`, { method: "PATCH", body: JSON.stringify({ properties: fprops }) });
                    if (!fr.ok) {
                      // one invalid enum value fails the whole batch: retry per property, skipping bad ones
                      for (const [prop, v] of Object.entries(fprops)) {
                        await hs(`/crm/v3/objects/deals/${dd2.id}`, { method: "PATCH", body: JSON.stringify({ properties: { [prop]: v } }) }).catch(() => null);
                      }
                    }
                  }
                }
              }
            }
          }
        } catch { /* best effort */ }
      }
      return j(headers, 200, { ok: true, taskGid: task.gid, taskUrl: `https://app.asana.com/0/0/${task.gid}`, crUrl, summarized: !!summary, dealStageMoved });
    }

    // ---------- propQueue (internal, x-sv-key): deals waiting in Proposal Requested ----------
    // Powers Step 0 of the biz dev workbench: everything in the Mgmt 3.0 "Proposal
    // Requested" stage with the associated contact's email so one click starts the lookup.
    if (action === "propQueue") {
      if (!TEAM_KEY || c.req.header("x-sv-key") !== TEAM_KEY) return j(headers, 401, { error: "bad_key" });
      const HS = Deno.env.get("HUBSPOT_CRM_TOKEN") ?? "";
      if (!HS) return j(headers, 500, { error: "not_configured" });
      const hs = (path: string, init?: RequestInit) => fetch("https://api.hubapi.com" + path, {
        ...init, headers: { "Authorization": `Bearer ${HS}`, "Content-Type": "application/json" },
      });
      const sr = await hs("/crm/v3/objects/deals/search", {
        method: "POST",
        body: JSON.stringify({
          filterGroups: [{ filters: [
            { propertyName: "pipeline", operator: "EQ", value: "2185322227" },
            { propertyName: "dealstage", operator: "EQ", value: "3505530581" },
          ] }],
          properties: ["dealname", "subject_city", "createdate", "bed__bath__sqft", "units"],
          sorts: [{ propertyName: "createdate", direction: "ASCENDING" }],
          limit: 25,
        }),
      });
      const sj = await sr.json().catch(() => ({}));
      const qdeals = ((sj?.results ?? []) as { id?: unknown; properties?: Record<string, string> }[])
        .map((d) => ({ id: String(d.id ?? ""), p: d.properties ?? {} })).filter((d) => d.id);
      const emails = new Map<string, { email: string; name: string }>();
      if (qdeals.length) {
        const ab = await hs("/crm/v4/associations/deals/contacts/batch/read", {
          method: "POST", body: JSON.stringify({ inputs: qdeals.map((d) => ({ id: d.id })) }),
        });
        const abj = await ab.json().catch(() => ({}));
        const contactByDeal = new Map<string, string>();
        const cids = new Set<string>();
        for (const r of (abj?.results ?? []) as { from?: { id?: unknown }; to?: { toObjectId?: unknown }[] }[]) {
          const from = String(r?.from?.id ?? "");
          const to = String(r?.to?.[0]?.toObjectId ?? "");
          if (from && to) { contactByDeal.set(from, to); cids.add(to); }
        }
        if (cids.size) {
          const cb = await hs("/crm/v3/objects/contacts/batch/read", {
            method: "POST", body: JSON.stringify({ inputs: [...cids].map((id) => ({ id })), properties: ["email", "firstname", "lastname"] }),
          });
          const cbj = await cb.json().catch(() => ({}));
          const byId = new Map(((cbj?.results ?? []) as { id?: unknown; properties?: Record<string, string> }[])
            .map((cres) => [String(cres.id ?? ""), cres.properties ?? {}]));
          for (const [did, cid] of contactByDeal) {
            const cp = byId.get(cid);
            if (cp) emails.set(did, { email: String(cp.email ?? ""), name: [cp.firstname, cp.lastname].filter(Boolean).join(" ") });
          }
        }
      }
      return j(headers, 200, { ok: true, queue: qdeals.map((d) => ({
        dealId: d.id, dealName: String(d.p.dealname ?? ""), city: String(d.p.subject_city ?? ""),
        created: String(d.p.createdate ?? ""), bedBathSqft: String(d.p.bed__bath__sqft ?? ""),
        email: emails.get(d.id)?.email ?? "", ownerName: emails.get(d.id)?.name ?? "",
      })) });
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
      // property facts, editable in the workbench (Brittany 2026-07-31)
      const unitsIn = String(body.units ?? "").trim().slice(0, 10);
      const bbsIn = String(body.bedBathSqft ?? "").trim().slice(0, 40);
      const cityIn = String(body.subjectCity ?? "").trim().slice(0, 80);
      if (unitsIn) props.units = unitsIn;
      if (bbsIn) props.bed__bath__sqft = bbsIn;
      if (cityIn) props.subject_city = cityIn;
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

    // ---------- propLoad: proposal payload by address slug or prospect email (open, read-only) ----------
    // Client links carry ?p=<address-slug> (Vincent 2026-07-31); the slug lives inside the deal's
    // ob_proposal_url, written at propSave. Legacy ?email= links still resolve via the email path.
    // Returns only proposal-safe facts: name, address, this prospect's own quoted pricing and
    // rent analysis. With a valid x-sv-key it adds staff context (stage, bed/bath, links).
    if (action === "propLoad") {
      const HS = Deno.env.get("HUBSPOT_CRM_TOKEN") ?? "";
      const email = String(body.email ?? "").trim().slice(0, 200);
      const slugIn = String(body.slug ?? "").trim().toLowerCase().slice(0, 120).replace(/[^a-z0-9-]/g, "");
      if (!HS || (!email && !slugIn)) return j(headers, 200, { ok: true, proposal: {} });
      const staff = !!TEAM_KEY && c.req.header("x-sv-key") === TEAM_KEY;
      try {
        const hs = (path: string, init?: RequestInit) => fetch("https://api.hubapi.com" + path, {
          ...init, headers: { "Authorization": `Bearer ${HS}`, "Content-Type": "application/json" },
        });
        const DEAL_PROPS = ["dealname", "pipeline", "dealstage", "subject_city", "hs_lastmodifieddate", "estimated_rent", "onboarding_fee", "lease_up_fee", "mgmt_fee", "renewal_fee", "annual_inspection_fee", "ob_proposal_data", "ob_proposal_url", "ob_agreement_url", "bed__bath__sqft", "units", "link", "rentometer_link", "ob_maintenance_dispatch", "ob_renewal_notice", "ob_leasing_notifications", "ob_applicant_criteria"];
        let c0: Record<string, string> = {};
        let dd: { id: string; p: Record<string, string> } | undefined;
        if (email) {
          const r = await hs("/crm/v3/objects/contacts/search", {
            method: "POST",
            body: JSON.stringify({ filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }], properties: ["firstname", "lastname", "email"], limit: 1 }),
          });
          const jr = await r.json().catch(() => ({}));
          const hit = jr?.results?.[0];
          if (!hit?.id) return j(headers, 200, { ok: true, proposal: {} });
          c0 = hit.properties ?? {};
          const ar = await hs(`/crm/v4/objects/contacts/${hit.id}/associations/deals?limit=50`);
          const aj = await ar.json().catch(() => ({}));
          const ids = (aj?.results ?? []).map((x: { toObjectId?: unknown }) => x?.toObjectId).filter(Boolean);
          if (!ids.length) return j(headers, 200, { ok: true, proposal: { ownerName: [c0.firstname, c0.lastname].filter(Boolean).join(" ") } });
          const br = await hs("/crm/v3/objects/deals/batch/read", {
            method: "POST",
            body: JSON.stringify({ inputs: ids.map((id: unknown) => ({ id: String(id) })), properties: DEAL_PROPS }),
          });
          const bj = await br.json().catch(() => ({}));
          const deals = (bj?.results ?? [])
            .map((d: { id?: unknown; properties?: Record<string, string> }) => ({ id: String(d.id ?? ""), p: d.properties ?? {} }))
            .filter((d: { id: string; p: Record<string, string> }) => d.p.pipeline === "2185322227");
          deals.sort((a: { p: Record<string, string> }, b: { p: Record<string, string> }) =>
            String(b.p.hs_lastmodifieddate ?? "").localeCompare(String(a.p.hs_lastmodifieddate ?? "")));
          dd = deals[0];
        } else {
          // Slug path: deal first (CONTAINS_TOKEN narrows, the endsWith check makes it exact -
          // token search alone could match a subset address), then the associated contact.
          const sr = await hs("/crm/v3/objects/deals/search", {
            method: "POST",
            body: JSON.stringify({
              filterGroups: [{ filters: [
                { propertyName: "pipeline", operator: "EQ", value: "2185322227" },
                { propertyName: "ob_proposal_url", operator: "CONTAINS_TOKEN", value: slugIn },
              ] }],
              sorts: [{ propertyName: "hs_lastmodifieddate", direction: "DESCENDING" }],
              properties: DEAL_PROPS, limit: 20,
            }),
          });
          const sj = await sr.json().catch(() => ({}));
          dd = (sj?.results ?? [])
            .map((d: { id?: unknown; properties?: Record<string, string> }) => ({ id: String(d.id ?? ""), p: d.properties ?? {} }))
            .filter((d: { id: string; p: Record<string, string> }) => String(d.p.ob_proposal_url ?? "").endsWith("p=" + slugIn))[0];
          if (!dd) return j(headers, 200, { ok: true, proposal: {} });
          const car = await hs(`/crm/v4/objects/deals/${dd.id}/associations/contacts?limit=5`);
          const caj = await car.json().catch(() => ({}));
          const cids = (caj?.results ?? []).map((x: { toObjectId?: unknown }) => x?.toObjectId).filter(Boolean);
          if (cids.length) {
            const cr2 = await hs(`/crm/v3/objects/contacts/${String(cids[0])}?properties=firstname,lastname,email`);
            const cj2 = await cr2.json().catch(() => ({}));
            c0 = (cj2?.properties ?? {}) as Record<string, string>;
          }
        }
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
          // The PandaDoc URL never rides the open payload (Vincent 2026-07-31): the client
          // gets a flag, and the URL itself only leaves via propAccept after an email match.
          hasAgreement: /^https:\/\//.test(String(d0.ob_agreement_url ?? "")),
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
          out.email = String(c0.email ?? "");
          out.agreementUrl = String(d0.ob_agreement_url ?? "");   // workbench Step 6 prefill
          out.zillow = String(d0.link ?? "");
          out.rentometer = String(d0.rentometer_link ?? "");
          out.dealName = String(d0.dealname ?? "");
          out.dealId = dd?.id ?? "";   // Save To Deal opens the deal record in HubSpot
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
      const slug = String(body.slug ?? "").trim().toLowerCase().slice(0, 120).replace(/[^a-z0-9-]/g, "");
      const t = (body.terms ?? {}) as Record<string, unknown>;
      if (!HS || (!email && !slug)) return j(headers, 400, { ok: false, error: "missing locator" });
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
        const deal = await locateMgmtDeal(HS, email, slug, []);
        if (!deal) return j(headers, 404, { ok: false, error: "no deal" });
        const ur = await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${deal.id}`, {
          method: "PATCH", headers: { "Authorization": `Bearer ${HS}`, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: props }),
        });
        if (!ur.ok) return j(headers, 502, { ok: false, error: "save failed" });
        return j(headers, 200, { ok: true, saved: Object.keys(props) });
      } catch { return j(headers, 502, { ok: false, error: "save failed" }); }
    }

    // ---------- propAccept: email-match gate in front of the PandaDoc agreement ----------
    // Open-but-contained (Vincent 2026-07-31): the proposal page never receives the agreement
    // URL. Clicking Accept asks the visitor for the email the proposal was sent to; only when
    // it matches a contact on the deal does the URL come back. Mismatches get one generic
    // failure - no hint whether the deal exists or which part was wrong.
    if (action === "propAccept") {
      const HS = Deno.env.get("HUBSPOT_CRM_TOKEN") ?? "";
      const email = String(body.email ?? "").trim().slice(0, 200);
      const slug = String(body.slug ?? "").trim().toLowerCase().slice(0, 120).replace(/[^a-z0-9-]/g, "");
      const verify = String(body.verifyEmail ?? "").trim().toLowerCase().slice(0, 200);
      if (!HS || (!email && !slug) || !verify || !/@.+\./.test(verify)) return j(headers, 200, { ok: false });
      try {
        const deal = await locateMgmtDeal(HS, email, slug, ["ob_agreement_url"]);
        if (!deal) return j(headers, 200, { ok: false });
        const match = deal.contactEmails.some((em) => em.toLowerCase() === verify);
        const url = String(deal.p.ob_agreement_url ?? "");
        if (!match || !/^https:\/\//.test(url)) return j(headers, 200, { ok: false });
        return j(headers, 200, { ok: true, agreementUrl: url });
      } catch { return j(headers, 200, { ok: false }); }
    }

    // ---------- obPdf: the wizard uploads the owner's Onboarding Summary PDF ----------
    // Open-but-contained: accepts ONLY a valid PDF, and ONLY onto a task that lives in
    // Client Relations 2.0 or the Initial Onboard project (the tasks obSubmit just made).
    if (action === "obPdf") {
      const gid = String(body.taskGid ?? "").trim();
      const b64 = String(body.pdfBase64 ?? "");
      const fname = String(body.filename ?? "Onboarding-Summary.pdf").replace(/[^\w.-]+/g, "-").slice(0, 80) || "Onboarding-Summary.pdf";
      if (!/^\d+$/.test(gid)) return j(headers, 400, { error: "bad_task" });
      if (!b64 || b64.length > 9_000_000) return j(headers, 400, { error: "bad_pdf" });
      let bytes: Uint8Array;
      try { bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0)); } catch { return j(headers, 400, { error: "bad_pdf" }); }
      if (bytes.length < 500 || String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") return j(headers, 400, { error: "bad_pdf" });
      const tk = await asana("GET", `/tasks/${gid}?opt_fields=projects.gid`).catch(() => null);
      const allowed = ["1208917007356847", "1216860326210544"];
      if (!tk || !(tk.projects ?? []).some((pr: { gid: string }) => allowed.includes(pr.gid))) {
        return j(headers, 403, { error: "task_not_allowed" });
      }
      const fd = new FormData();
      fd.append("file", new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" }), fname);
      const up = await fetch(`${ASANA}/tasks/${gid}/attachments`, { method: "POST", headers: { "Authorization": `Bearer ${ASANA_PAT}` }, body: fd });
      if (!up.ok) return j(headers, 502, { error: "upload_failed" });
      await asana("POST", `/tasks/${gid}/stories`, { html_text: storyHtml("Onboarding Summary PDF attached (copy for the client on request).") }).catch(() => null);
      return j(headers, 200, { ok: true });
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
        let dealCity = "";
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
            dealCity = String(d0?.subject_city ?? "").trim();
            if (d0?.dealname) {
              const name = String(d0.dealname).replace(/^\s*\[[^\]]*\]\s*/, "").trim();  // strip "[MGMT]"-style prefixes
              dealAddress = dealCity && !name.toLowerCase().includes(dealCity.toLowerCase()) ? `${name}, ${dealCity}` : name;
            }
          }
        }
        return j(headers, 200, { ok: true, prefill: {
          city: dealCity,
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

    // ================= OWNER FEED (live per-property page at /owner-feed?p={PropertyID}) =================
    // Open-but-gated: every call requires the visitor's email to match an owner email on the
    // property's (CLIENT) task in Client Relations 2.0. Line items are built server-side from
    // task fields and the pre-// title segment, scrubbed of emails/phones; resident names in
    // Collection titles never render (those items show as Unit NN + Balance/Status only).

    // ---------- feedLoad: the whole feed in one call ----------
    if (action === "feedLoad") {
      const pid = String(body.propertyId ?? "").replace(/\D/g, "").slice(0, 12);
      const email = String(body.email ?? "").trim().toLowerCase().slice(0, 200);
      if (!pid || !/@.+\./.test(email)) return j(headers, 200, { ok: false, error: "verify" });
      const enc = encodeURIComponent;
      try {
        const [crRes, psRes] = await Promise.all([
          asana("GET", `/workspaces/${FEED_WS}/tasks/search?projects.any=${FEED_CR}&custom_fields.${FEED_PID_FIELD}.value=${enc(pid)}&opt_fields=gid,name,notes,custom_fields.name,custom_fields.display_value&limit=2`).catch(() => []),
          asana("GET", `/workspaces/${FEED_WS}/tasks/search?projects.any=${FEED_PS}&custom_fields.${FEED_PID_FIELD}.value=${enc(pid)}&is_subtask=false&opt_fields=gid,name&limit=2`).catch(() => []),
        ]);
        const cr = (crRes ?? [])[0];
        if (!cr) return j(headers, 200, { ok: false, error: "verify" });
        const ownerEmails = (String(cr.notes ?? "").match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? []).map((e: string) => e.toLowerCase());
        if (!ownerEmails.includes(email)) return j(headers, 200, { ok: false, error: "verify" });

        // property identity: prefer the Settings task name (Settings // Short // Address // City)
        const ps = (psRes ?? [])[0];
        let shortName = "", address = "", city = "";
        if (ps) {
          const parts = String(ps.name ?? "").split("//").map((s: string) => s.trim());
          shortName = parts[1] ?? ""; address = parts[2] ?? ""; city = parts[3] ?? "";
        }
        if (!address) {
          const head = String(cr.name ?? "").split("//")[0].trim();
          const ci = head.lastIndexOf(",");
          address = ci > -1 ? head.slice(0, ci).trim() : head;
          city = ci > -1 ? head.slice(ci + 1).trim() : "";
        }
        const crCf: Record<string, string> = {};
        for (const c of (cr.custom_fields ?? [])) crCf[String(c.name)] = String(c.display_value ?? "").trim();

        const text = feedSearchText(address);
        const cutoff = new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 10);
        const OPT = "gid,name,due_on,completed_at,custom_fields.name,custom_fields.display_value,memberships.project.gid,memberships.section.name";
        const searches = FEED_PROJECTS.flatMap((pr) => [
          asana("GET", `/workspaces/${FEED_WS}/tasks/search?text=${enc(text)}&projects.any=${pr.gid}&completed=false&is_subtask=false&opt_fields=${OPT}&limit=50`).catch(() => []),
          asana("GET", `/workspaces/${FEED_WS}/tasks/search?text=${enc(text)}&projects.any=${pr.gid}&completed=true&completed_on.after=${cutoff}&is_subtask=false&opt_fields=${OPT}&limit=50`).catch(() => []),
        ]);
        const settingsFetch = ps ? Promise.all([
          asana("GET", `/tasks/${ps.gid}?opt_fields=${FEED_CF_OPT}`).catch(() => null),
          asana("GET", `/tasks/${ps.gid}/subtasks?limit=100&opt_fields=${FEED_CF_OPT}`).catch(() => []),
        ]) : Promise.resolve([null, []]);
        const [results, [psFull, psSubs]] = await Promise.all([Promise.all(searches), settingsFetch]);

        let totOpen = 0, totDone = 0;
        const sections = FEED_PROJECTS.map((pr, i) => {
          const open = (results[i * 2] ?? []).map((t: FeedTask) => feedItem(pr.key, t, true)).filter(Boolean);
          const done = (results[i * 2 + 1] ?? []).map((t: FeedTask) => feedItem(pr.key, t, false)).filter(Boolean);
          open.sort((a: FeedItem, b: FeedItem) => String(a?.due || "9999").localeCompare(String(b?.due || "9999")));
          done.sort((a: FeedItem, b: FeedItem) => String(b?.done ?? "").localeCompare(String(a?.done ?? "")));
          totOpen += open.length; totDone += done.length;
          return { key: pr.key, title: pr.title, open, done };
        });

        const propFields = psFull ? feedFields(psFull.custom_fields ?? []) : [];
        const units = (psSubs ?? []).map((s: { gid?: unknown; name?: unknown; custom_fields?: unknown[] }) => ({
          taskGid: String(s.gid ?? ""),
          unit: feedUnitFromName(String(s.name ?? "")),
          fields: feedFields((s.custom_fields ?? []) as Record<string, unknown>[]),
        })).sort((a: { unit: string }, b: { unit: string }) => a.unit.localeCompare(b.unit, undefined, { numeric: true }));

        return j(headers, 200, {
          ok: true,
          property: {
            shortName, address, city, propertyId: pid,
            units: crCf["Unit Count"] || String((psSubs ?? []).length || ""),
            commSettings: (crCf["Communication Settings"] || "").split(",").map((s: string) => s.trim()).filter(Boolean),
            ownerNames: feedOwnerNames(String(cr.notes ?? "")),
          },
          totals: { open: totOpen, done: totDone },
          sections,
          settings: ps ? { taskGid: String(ps.gid), fields: propFields, units } : null,
        });
      } catch { return j(headers, 200, { ok: false, error: "load_failed" }); }
    }

    // ---------- feedFill: owner fills a BLANK settings field (never edits existing data) ----------
    if (action === "feedFill") {
      const pid = String(body.propertyId ?? "").replace(/\D/g, "").slice(0, 12);
      const email = String(body.email ?? "").trim().toLowerCase().slice(0, 200);
      const taskGid = String(body.taskGid ?? "").replace(/\D/g, "");
      const fieldGid = String(body.fieldGid ?? "").replace(/\D/g, "");
      if (!pid || !/@.+\./.test(email) || !taskGid || !fieldGid) return j(headers, 200, { ok: false, error: "verify" });
      const enc = encodeURIComponent;
      try {
        const [crRes, psRes] = await Promise.all([
          asana("GET", `/workspaces/${FEED_WS}/tasks/search?projects.any=${FEED_CR}&custom_fields.${FEED_PID_FIELD}.value=${enc(pid)}&opt_fields=gid,notes&limit=2`).catch(() => []),
          asana("GET", `/workspaces/${FEED_WS}/tasks/search?projects.any=${FEED_PS}&custom_fields.${FEED_PID_FIELD}.value=${enc(pid)}&is_subtask=false&opt_fields=gid&limit=2`).catch(() => []),
        ]);
        const cr = (crRes ?? [])[0], ps = (psRes ?? [])[0];
        if (!cr || !ps) return j(headers, 200, { ok: false, error: "verify" });
        const ownerEmails = (String(cr.notes ?? "").match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? []).map((e: string) => e.toLowerCase());
        if (!ownerEmails.includes(email)) return j(headers, 200, { ok: false, error: "verify" });
        // containment: only the property's own Settings task or one of its unit subtasks
        let allowed = taskGid === String(ps.gid);
        if (!allowed) {
          const subs = await asana("GET", `/tasks/${ps.gid}/subtasks?limit=100&opt_fields=gid`).catch(() => []);
          allowed = (subs ?? []).some((s: { gid?: unknown }) => String(s.gid) === taskGid);
        }
        if (!allowed) return j(headers, 403, { ok: false, error: "not_allowed" });
        const task = await asana("GET", `/tasks/${taskGid}?opt_fields=${FEED_CF_OPT}`);
        const cf = (task.custom_fields ?? []).find((c: { gid?: unknown }) => String(c.gid) === fieldGid);
        if (!cf) return j(headers, 400, { ok: false, error: "no_field" });
        const fname = String(cf.name ?? "");
        if (FEED_HIDDEN_FIELDS.has(fname) || FEED_STAFF_FIELDS.has(fname)) return j(headers, 403, { ok: false, error: "not_allowed" });
        if (String(cf.display_value ?? "").trim()) return j(headers, 409, { ok: false, error: "already_filled", message: "This field already has a value. Existing data can only be changed by our team." });
        const type = String(cf.type ?? "");
        const val = body.value;
        const cfPayload: Record<string, unknown> = {};
        if (type === "text") {
          const s = String(val ?? "").trim().slice(0, 2000);
          if (!s) return j(headers, 400, { ok: false, error: "bad_value" });
          cfPayload[fieldGid] = s;
        } else if (type === "number") {
          const n = Number(val);
          if (!Number.isFinite(n)) return j(headers, 400, { ok: false, error: "bad_value" });
          cfPayload[fieldGid] = n;
        } else if (type === "date") {
          const s = String(val ?? "").trim();
          if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return j(headers, 400, { ok: false, error: "bad_value" });
          cfPayload[fieldGid] = { date: s };
        } else if (type === "enum") {
          const opt = (cf.enum_options ?? []).find((o: { gid?: unknown; name?: unknown; enabled?: boolean }) =>
            o.enabled !== false && (String(o.gid) === String(val) || String(o.name).trim() === String(val ?? "").trim()));
          if (!opt) return j(headers, 400, { ok: false, error: "bad_value" });
          cfPayload[fieldGid] = String(opt.gid);
        } else if (type === "multi_enum") {
          const wants = (Array.isArray(val) ? val : String(val ?? "").split(";")).map((v) => String(v).trim()).filter(Boolean);
          const gids: string[] = [];
          for (const w of wants) {
            const opt = (cf.enum_options ?? []).find((o: { gid?: unknown; name?: unknown; enabled?: boolean }) =>
              o.enabled !== false && (String(o.gid) === w || String(o.name).trim() === w));
            if (!opt) return j(headers, 400, { ok: false, error: "bad_value" });
            gids.push(String(opt.gid));
          }
          if (!gids.length) return j(headers, 400, { ok: false, error: "bad_value" });
          cfPayload[fieldGid] = gids;
        } else return j(headers, 400, { ok: false, error: "bad_value" });
        await asana("PUT", `/tasks/${taskGid}`, { custom_fields: cfPayload });
        await asana("POST", `/tasks/${taskGid}/stories`, {
          html_text: storyHtml(`Owner Feed: "${fname}" was blank and has been filled in by the property owner (${email}) through the live Owner Feed page. Done by Claude (Owner Feed) on behalf of the owner.`),
        }).catch(() => null);
        const after = await asana("GET", `/tasks/${taskGid}?opt_fields=custom_fields.gid,custom_fields.display_value`).catch(() => null);
        const now = after ? (after.custom_fields ?? []).find((c: { gid?: unknown }) => String(c.gid) === fieldGid) : null;
        return j(headers, 200, { ok: true, value: String(now?.display_value ?? "").trim() });
      } catch { return j(headers, 200, { ok: false, error: "save_failed" }); }
    }

    return j(headers, 400, { error: "unknown_action" });
  } catch (e) {
    console.error(e);
    return j(headers, 500, { error: "server_error", message: "Something went wrong on our side. Try again shortly." });
  }
});

app.all("*", (c) => new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: { ...corsHeaders(c.req.header("origin")), "Content-Type": "application/json" } }));

Deno.serve(app.fetch);
