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
// Parking & Storage (Outline "Property Settings" section 6, 2026-10-13): the
// property task's Parking Type / Storage Type line says what the property offers,
// and the unit's own spot ids sit on its lease's Parking / Storage fields in Lease
// Settings. The unit-level Parking and Storage fields were retired 2026-10-17.
// Same helpers as site-visit-proxy.
const LEASE_SETTINGS_PROJECT = "1213740462278333";
const LEASE_PARKING_F = "1219431287505501";
const LEASE_STORAGE_F = "1219431415139383";
// spot ids the unit's lease holds; open leases first, oldest first, so the
// outgoing lease wins over a future one. Blank on Included / None / no access.
async function leaseSpots(unitId: string): Promise<{ parking: string; storage: string }> {
  const out = { parking: "", storage: "" };
  if (!/^\d+$/.test(unitId)) return out;
  try {
    const r = await fetch(`${ASANA}/workspaces/706990140225747/tasks/search?projects.any=${LEASE_SETTINGS_PROJECT}&custom_fields.1213183515622826.value=${unitId}&opt_fields=completed,created_at,custom_fields.gid,custom_fields.display_value`,
      { headers: { "Authorization": `Bearer ${ASANA_PAT}` } });
    if (!r.ok) return out;
    const rows = (((await r.json().catch(() => ({}))) as { data?: unknown }).data ?? []) as Array<{ completed?: boolean; created_at?: string; custom_fields?: Array<{ gid: string; display_value: string | null }> }>;
    rows.sort((a, b) => Number(!!a.completed) - Number(!!b.completed) || String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
    const ids = (t: typeof rows[number], gid: string) => {
      const v = String((t.custom_fields ?? []).find((f) => f.gid === gid)?.display_value ?? "").trim();
      return v && !/^(included|none)$/i.test(v) ? v : "";
    };
    for (const t of rows) {
      if (!out.parking) out.parking = ids(t, LEASE_PARKING_F);
      if (!out.storage) out.storage = ids(t, LEASE_STORAGE_F);
    }
  } catch { /* type line only */ }
  return out;
}
// "Off-street lot, 1 assigned per unit" + "2" -> "Off-street lot, 1 assigned per unit (Spot 2)"
function parkStorLine(type: string, ids: string, noun: string): string {
  const t = type.trim();
  if (!t || !ids || /^none$/i.test(t)) return t;
  return `${t} (${noun}${noun === "Spot" && ids.includes(",") ? "s" : ""} ${ids})`;
}
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
  "Heating Type", "Cooling", "HVAC Filter", "Laundry", "Parking Type", "Storage Type",
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
type FeedItem = { label: string; info: string; due: string; done: string; group?: string; gid?: string; reports?: { gid: string; name: string }[]; steps?: { label: string; due: string; done: boolean }[]; pills?: string[] } | null;
// vendor enum values carry trade codes / regions / phone numbers ("GC - Everywhere -
// J&J Construction - (206) 535-4492"); owners get the company name only
function feedVendor(v: string): string {
  const parts = v.split(" - ").map((s) => s.trim()).filter((s) =>
    s && !/^\(?\+?\d/.test(s) && !/^everywhere$/i.test(s) && !/^[A-Z]{1,3}$/.test(s));
  return parts.join(" - ").replace(/\s*everywhere\s*$/i, "").trim();
}
// the leasing parent's lifecycle subtasks, in Brittany's order; labels are OURS
// (subtask titles can carry resident names and never render)
const FEED_LEASE_STEPS: [RegExp, string][] = [
  [/^pre[\s-]*move/i, "Pre Move Out"],
  [/^move[\s-]*out/i, "Move Out"],
  [/^turn\s*over/i, "Turn Over"],
  [/^lu\b/i, "Lease Up"],
  [/^process\s*deposit/i, "Process Deposit"],
];
const FEED_INSPECTION_GIDS = new Set(["1205841857464078", "1211332673219694"]);
// owner-friendly grouping of the Leasing | Human View board sections; agent-name
// and assignment columns all read as "With Leasing Team"
function feedLeaseGroup(sec: string): string {
  const s = sec.toLowerCase();
  if (/active listing/.test(s)) return "Active Listings";
  if (/move out/.test(s)) return "Move Out Pending";
  if (/move in/.test(s)) return "Move In";
  if (/pending application/.test(s)) return "Pending Applications";
  if (/quick turn|turn ?over/.test(s)) return "Turnover";
  if (/security deposit/.test(s)) return "Security Deposits";
  if (/parking|storage/.test(s)) return "Parking & Storage";
  if (/selling|off market/.test(s)) return "Temporarily Off Market";
  if (/complete/.test(s)) return "Complete";
  return "With Leasing Team";
}
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
// display address is anonymized but recognizable: "1151 N 94th St" + Seattle -> "1151 **** Seattle"
// (the full address stays server-side for the Asana searches)
function feedMaskAddr(address: string, city: string): string {
  const num = (address.trim().split(/\s+/)[0] || "").replace(/[^\w-]/g, "");
  return [num, "****", city.trim()].filter(Boolean).join(" ");
}
// staff sometimes type the street address inside issue titles; mask any occurrence
// (street number + directionals/street tokens/unit refs) down to "1151 ****"
function feedAddrRegex(address: string): RegExp | null {
  const num = (address.trim().split(/\s+/)[0] || "").replace(/[^\w-]/g, "");
  if (!num || !/\d/.test(num)) return null;
  return new RegExp(
    "\\b" + num + "(\\s+(?:n|s|e|w|ne|nw|se|sw|north|south|east|west)\\.?\\b|\\s+\\d+(?:st|nd|rd|th)?\\w*|\\s+(?:st|street|ave|avenue|rd|road|blvd|boulevard|way|dr|drive|ct|court|pl|place|ln|lane)\\.?\\b|\\s+#\\s*\\w+)*",
    "gi",
  );
}
// building nickname ("Stone Ct" / "Stone Court") is stripped from everything owners see;
// the base word alone is NOT matched (a "stone tile" repair must survive), so the
// pattern requires base + a building-suffix word
function feedNameRegex(shortName: string): RegExp | null {
  const toks = shortName.trim().split(/\s+/).filter(Boolean);
  if (!toks.length) return null;
  const SUF = "(?:ct|court|st|street|apts?|apartments?|bldg|building|manor|place|pl|villas?|estates?|terrace|commons?)";
  const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const last = toks[toks.length - 1].toLowerCase();
  const isSuf = new RegExp("^" + SUF + "$", "i").test(last);
  const base = (isSuf ? toks.slice(0, -1) : toks).map(escRe).join("\\s+");
  if (!base) return null;
  return new RegExp("\\b" + base + "\\s+" + SUF + "\\b", "gi");
}
// Owner Feed access emails: the 🙆 Owner e-mail(s) field on the (CLIENT) task is the
// canonical source (Brittany 2026-08-12: the emoji field, shared with Initial Onboard,
// replaced the duplicate plain "Owner Email(s)"); the description scrape is the legacy fallback
function feedGateEmails(cr: { notes?: unknown; custom_fields?: { gid?: unknown; name?: unknown; display_value?: unknown }[] }): string[] {
  const cfs = cr.custom_fields ?? [];
  const cf = cfs.find((c) => String(c.gid) === CR_OWNER_EMAILS_FIELD || String(c.name) === "\u{1F646} Owner e-mail(s)") ??
    cfs.find((c) => String(c.gid) === "1217116783105713" || String(c.name) === "Owner Email(s)");
  const src = String(cf?.display_value ?? "").trim() || String(cr.notes ?? "");
  return (src.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? []).map((e) => e.toLowerCase());
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
    // gid rides along so feedLoad can look up report attachments; stripped before response
    return { label: unit ? "Unit " + unit : "Building inspection", info: "", due, done, gid: String(t.gid ?? "") };
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
    const lsec = (t.memberships ?? []).find((m) => String(m?.project?.gid) === "1208297375044026");
    return {
      label: unit ? "Unit " + unit : lhead,
      info: "",
      pills: bits,   // Move Out / Listed / Move In dates render as pills (Brittany 2026-08-01)
      due, done,
      group: open ? feedLeaseGroup(String(lsec?.section?.name ?? "")) : "",
      gid: open && unit ? String(t.gid ?? "") : "",   // open unit items get lifecycle steps
    };
  }
  // maintenance / resident relations: title segment before the separator, scrubbed
  const head = feedScrub(name.split(/\/\/|[|<]/)[0].trim());
  if (!head) return null;
  const pills: string[] = [];
  if (prKey === "maintenance") {
    if (cf["Severity"]) pills.push(cf["Severity"] + " Severity");
    const vn = feedVendor(cf["Vendor"] ?? "");
    if (vn) pills.push(vn);
  }
  return { label: head, info: unit ? "Unit " + unit : "", due, done, ...(pills.length ? { pills } : {}) };
}

// ---------- onboarding wizard shared builders (obStart / obProgress / obSubmit) ----------
const OB_PROJECT_GID = "1216860326210544";
const OB_WIP_SECTION = "1217116571349206";               // Wizard In Progress
const CR_OWNER_EMAILS_FIELD = "1215178211298892";        // 🙆 Owner e-mail(s) - the ONE owner email field (Brittany 2026-08-12); the Owner Feed gate reads it
type ObUnit = { label: string; beds: string; baths: string; sqft: string; laundry: string; mail: string; mailnum: string; storage: string; parking: string; parknum: string; cooling: string };
function obParseAnswers(body: Record<string, unknown>): Record<string, string> {
  return (body.answers && typeof body.answers === "object") ? body.answers as Record<string, string> : {};
}
function obParseUnits(body: Record<string, unknown>): ObUnit[] {
  return (Array.isArray(body.units) ? body.units : []).slice(0, 30).map((u: Record<string, unknown>) => ({
    label: String(u.label ?? "").slice(0, 40), beds: String(u.beds ?? "").slice(0, 10),
    baths: String(u.baths ?? "").slice(0, 10), sqft: String(u.sqft ?? "").slice(0, 10),
    laundry: String(u.laundry ?? "").slice(0, 60), mail: String(u.mail ?? "").slice(0, 60),
    mailnum: String(u.mailnum ?? "").slice(0, 20), storage: String(u.storage ?? "").slice(0, 60),
    parking: String(u.parking ?? "").slice(0, 60), parknum: String(u.parknum ?? "").slice(0, 20),
    cooling: String(u.cooling ?? "").slice(0, 40),
  })).filter((u: { label: string }) => u.label);
}
function obParseSections(body: Record<string, unknown>): { title: string; rows: { q: string; a: string }[] }[] {
  return (Array.isArray(body.sections) ? body.sections : []).slice(0, 20).map((sec: Record<string, unknown>) => ({
    title: String(sec.title ?? "").slice(0, 80),
    rows: (Array.isArray(sec.rows) ? sec.rows : []).slice(0, 60).map((r: Record<string, unknown>) => ({
      q: String(r.q ?? "").slice(0, 160), a: String(r.a ?? "").slice(0, 1500),
    })).filter((r: { q: string; a: string }) => r.q && r.a),
  })).filter((sec: { rows: unknown[] }) => sec.rows.length);
}
function obUnitLine(u: Record<string, string>): string {
  return [`${u.beds} bd / ${u.baths} ba${u.sqft ? " / " + u.sqft + " sqft" : ""}`,
    u.laundry ? `Laundry: ${u.laundry}` : "", u.mail ? `Mail: ${u.mail}${u.mailnum ? " #" + u.mailnum : ""}` : "",
    u.storage ? `Storage: ${u.storage}` : "", u.parking ? `Parking: ${u.parking}${u.parknum ? " #" + u.parknum : ""}` : "",
    u.cooling ? `A/C: ${u.cooling}` : ""].filter(Boolean).join(" | ");
}
function obDump(kind: string, address: string, sectionsDump: { title: string; rows: { q: string; a: string }[] }[], units: ObUnit[], inProgress: boolean, answers: Record<string, string> = {}): { lines: string[]; htmlNotes: string } {
  const stamp = new Date(Date.now() - 7 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ");
  const head = inProgress ? `${kind === "tenant_placement" ? "TENANT PLACEMENT" : "INITIAL"} ONBOARDING (IN PROGRESS) | ${address}` : `${kind === "tenant_placement" ? "TENANT PLACEMENT" : "INITIAL"} ONBOARDING SUBMISSION (${kind.replace("_", " ")}) | ${address}`;
  const sub = inProgress
    ? `The owner is still working through the /onboard wizard. Last synced ${stamp} (Seattle time); answers below update as they go.`
    : `Submitted via the /onboard wizard on ${stamp} (Seattle time).`;
  const lines: string[] = [head, sub, ""];
  for (const sec of sectionsDump) {
    lines.push(`=== ${sec.title.toUpperCase()} ===`);
    for (const r of sec.rows) lines.push(`${r.q}: ${r.a}`);
    lines.push("");
  }
  if (units.length) {
    lines.push("=== UNITS ===");
    units.forEach((u) => lines.push(`${u.label}: ${obUnitLine(u)}`));
    lines.push("");
  }
  // values shaped for the Property Settings task (Outline "Property Settings"
  // section 6); onboard-asana copies them over once the Settings task exists
  const ps = obParkStor(answers);
  if (ps.length) {
    lines.push("=== PARKING & STORAGE (FOR PROPERTY SETTINGS) ===");
    ps.forEach(([k, v]) => lines.push(`${k}: ${v}`));
    lines.push("");
  }
  lines.push("Photos, leases, and HOA documents: the confirmation screen offers direct upload and link sharing (files land as comments on this task); onboarding@sagareus.com is the fallback.");
  const hesc = (t: string) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const htmlParts: string[] = [`<b>${hesc(head)}</b>\n${hesc(sub)}\n`];
  for (const sec of sectionsDump) {
    htmlParts.push(`\n<b><u>${hesc(sec.title.toUpperCase())}</u></b>\n<ul>${sec.rows.map((r) => `<li><b>${hesc(r.q)}:</b> ${hesc(r.a)}</li>`).join("")}</ul>`);
  }
  if (units.length) {
    htmlParts.push(`\n<b><u>UNITS</u></b>\n<ul>${units.map((u) => `<li><b>${hesc(u.label)}:</b> ${hesc(obUnitLine(u))}</li>`).join("")}</ul>`);
  }
  if (ps.length) {
    htmlParts.push(`\n<b><u>PARKING &amp; STORAGE (FOR PROPERTY SETTINGS)</u></b>\n<ul>${ps.map(([k, v]) => `<li><b>${hesc(k)}:</b> ${hesc(v)}</li>`).join("")}</ul>`);
  }
  htmlParts.push(`\nPhotos, leases, and HOA documents: the confirmation screen offers direct upload and link sharing (files land as comments on this task); onboarding@sagareus.com is the fallback.`);
  return { lines, htmlNotes: `<body>${htmlParts.join("")}</body>`.slice(0, 60000) };
}
function obParkStor(answers: Record<string, string>): [string, string][] {
  return ([["Parking Type", answers.parkingType], ["Parking Spots", answers.parkingSpots], ["Storage Type", answers.storageType], ["Storage Spots", answers.storageSpots]] as [string, string | undefined][])
    .map(([k, v]): [string, string] => [k, String(v ?? "").trim().slice(0, 300)]).filter(([, v]) => v);
}
async function obFieldSettings(): Promise<Map<string, { gid: string; type: string; options: { gid: string; name: string }[] }>> {
  const settings = await asana("GET", `/projects/${OB_PROJECT_GID}/custom_field_settings?limit=100&opt_fields=custom_field.gid,custom_field.name,custom_field.resource_subtype,custom_field.enum_options.gid,custom_field.enum_options.name`);
  const byName = new Map<string, { gid: string; type: string; options: { gid: string; name: string }[] }>();
  for (const st of settings ?? []) {
    const f = st.custom_field;
    byName.set(obFieldKey(String(f.name)), { gid: f.gid, type: f.resource_subtype, options: f.enum_options ?? [] });
  }
  return byName;
}
// field names match without their emoji prefix, so renaming "🙆 Owner Name(s)"
// to "Owner Name(s)" cannot break the wizard (2026-09-26)
function obFieldKey(name: string): string {
  return String(name).toLowerCase().replace(/^[^a-z0-9]+/, "").trim();
}
function obMapAnswers(byName: Map<string, { gid: string; type: string; options: { gid: string; name: string }[] }>, answers: Record<string, string>): Record<string, unknown> {
  const cf: Record<string, unknown> = {};
  const setText = (name: string, val: string) => {
    const f = byName.get(obFieldKey(name));
    if (f && val) cf[f.gid] = String(val).slice(0, 1000);
  };
  const setEnum = (name: string, val: string) => {
    const f = byName.get(obFieldKey(name));
    if (!f || !val) return;
    const hit = f.options.find((o) => o.name.toLowerCase() === val.toLowerCase()) ??
      f.options.find((o) => val.toLowerCase().startsWith(o.name.slice(0, 12).toLowerCase()) || o.name.toLowerCase().startsWith(val.slice(0, 12).toLowerCase()));
    if (hit) cf[f.gid] = hit.gid;
  };
  const setMulti = (name: string, val: string) => {
    const f = byName.get(obFieldKey(name));
    if (!f || !val) return;
    const gids = String(val).split(",").map((v) => v.trim()).filter(Boolean).map((v) => {
      const hit = f.options.find((o) => o.name.toLowerCase() === v.toLowerCase()) ??
        f.options.find((o) => v.toLowerCase().startsWith(o.name.slice(0, 10).toLowerCase()) || o.name.toLowerCase().startsWith(v.slice(0, 10).toLowerCase()));
      return hit?.gid;
    }).filter(Boolean);
    if (gids.length) cf[f.gid] = gids;
  };
  const setNum = (name: string, val: string) => {
    const f = byName.get(obFieldKey(name));
    const n = Number(val);
    if (f && Number.isFinite(n) && n > 0) cf[f.gid] = n;
  };
  setEnum("Applicant Criteria", answers.criteria ?? "");
  setMulti("Pet Policy", answers.pets ?? ""); // multi_enum since 2026-08-19; wizard sends comma-joined option names
  setText("Construction Plans", answers.construction ?? "");
  setNum("Year Built", answers.yearBuilt ?? "");
  setText("\u{1F646} Owner Phone(s)", answers.ownerPhones ?? "");
  setText("\u{1F646} Owner Name(s)", answers.ownerNames ?? "");
  setText("\u{1F646} Owner e-mail(s)", answers.ownerEmails ?? "");
  setText("Mailbox", answers.mailbox ?? "");
  // Parking / Storage: no Onboarding project fields; the dump's PARKING & STORAGE
  // block carries them to Property Settings (unit fields retired 2026-10-17)
  setText("Cooling", answers.cooling ?? "");
  setText("EV Charger", answers.ev ?? "");
  setText("Internet Provider", answers.internetProvider ?? "");
  setText("Utilities", answers.utilities ?? "");
  setText("Appliances", answers.appliances ?? "");
  setText("Heating Type", answers.heating ?? "");
  setMulti("Laundry", answers.laundry ?? "");
  setNum("\u{1F916} Estimated Market Rent", answers.estimatedRent ?? "");
  setText("Owner Preferences", answers.ownerPreferences ?? "");
  setText("Special Note", answers.specialNote ?? "");
  setText("Pest Control", answers.pest ?? "");
  setText("Common Area Cleaning", answers.commonArea ?? "");
  return cf;
}
// ---- Leasing Plan approval helpers (lsAccept / lsRequest, 2026-08-17) ----
const OB_WORKSPACE = "706990140225747";
const OB_UNIT_F = "1213183515622826";
const OB_PS_F = "1217569409567702";
const OB_PS_OPT: Record<string, string> = { Draft: "1217569409567703", Sent: "1217569409567704", Accepted: "1217569409567705", "Team Lead Approved": "1217569409567706", Revised: "1217569409567707" };
const OB_RN_F = "1217569237386930";
const OB_ADJ_SECTION = "1217553095980495";
// Open owner change requests on a Listing task: the incomplete "Modify {Section} | ..."
// subtasks lsRequest creates. While any is open, Modify and Approve are mutually
// exclusive (Brittany 2026-09-02): the plan on screen is not the plan the owner
// wants, so approvals pause until the team makes the change and re-sends.
// A re-approved (overwritten) plan REPLACES the bot's old pinned plan comment
// instead of stacking a second one (team 2026-09-15): delete previous comments
// whose text starts with the given prefix before posting the fresh block.
async function obReplacePlanComment(taskGid0: string, prefix0: string): Promise<void> {
  try {
    let offP = "";
    for (let pgP = 0; pgP < 15; pgP++) {
      const rP = await fetch(`${ASANA}/tasks/${taskGid0}/stories?limit=100&opt_fields=type,text${offP ? `&offset=${encodeURIComponent(offP)}` : ""}`,
        { headers: { "Authorization": `Bearer ${ASANA_PAT}` } });
      const jP = await rP.json().catch(() => ({}));
      if (!rP.ok) break;
      for (const sP of (jP.data ?? []) as Array<{ gid: string; type: string; text?: string }>) {
        if (sP.type === "comment" && String(sP.text ?? "").trimStart().startsWith(prefix0)) {
          await fetch(`${ASANA}/stories/${sP.gid}`, { method: "DELETE", headers: { "Authorization": `Bearer ${ASANA_PAT}` } }).catch(() => null);
        }
      }
      offP = jP.next_page?.offset ?? "";
      if (!offP) break;
    }
  } catch { /* old comment stays; the new one still posts */ }
}
async function obOpenMods(gid: string): Promise<string[]> {
  const subs = await asana("GET", `/tasks/${gid}/subtasks?limit=100&opt_fields=name,completed`);
  return ((subs ?? []) as Array<{ name: string; completed?: boolean }>)
    .filter((s) => !s.completed && /^modify\s/i.test(String(s.name)))
    .map((s) => String(s.name).replace(/\s*\|.*$/, "").replace(/^modify\s*/i, "").trim() || "Plan")
    .slice(0, 6);
}
// field-staff priority definitions (locked with Brittany 2026-08-17)
const OB_PRIO_DEF: Record<string, string> = {
  "Listing:Maximize Rent": "price above market and hold; slower adjustments; owner accepts longer vacancy to chase top rent",
  "Listing:Balanced": "price at market with the standard weekly adjustment schedule; lease within a normal window",
  "Listing:Minimize Vacancy": "price to move; adjust fast and early; filling the unit beats squeezing the last dollar",
  "Turn:Essentials Only": "repair what blocks rent ready; skip cosmetic upgrades; estimates only for must-fix items",
  "Turn:Balanced": "rent ready plus low-cost fixes that clearly help the unit show; bigger items get owner-approved estimates",
  "Turn:Upgrade": "owner wants estimates for improvements that raise rent or cut future maintenance; think beyond rent ready",
  "Risk:Selective": "hold the line on terms: full deposit, no move in specials or rent credits, standard pet policy only; strict screening at the criteria line",
  "Risk:Balanced": "standard deposit and screening; a modest concession (move in special or rent credit) or a small pet allowance stretch may be used if activity stalls",
  "Risk:Flexible": "use the levers to fill the unit: reduced deposit, move in special or rent credit, and expanded pet allowances (number, type, and/or weight); terms priced to compensate",
  "Listing:Lean Maximize Rent": "leans toward top rent: price a step above market, adjust patiently; owner accepts some extra vacancy",
  "Listing:Lean Minimize Vacancy": "leans toward a faster lease: price a step sharper than market and adjust a little earlier than standard",
  "Turn:Lean Essentials": "essentials first; add only the low-cost fixes that clearly help the unit show",
  "Turn:Lean Upgrade": "balanced scope plus estimates for targeted upgrades where they raise rent or cut future maintenance",
  "Risk:Lean Selective": "mostly hold the line on terms; one modest concession may be used if activity stalls, screening stays at the criteria line",
  "Risk:Lean Flexible": "open the common levers a little earlier (modest concession, small pet stretch); deposit and criteria stay standard",
};
async function obTaskByUnitId(projectGid: string, uid: string): Promise<{ gid: string; name: string } | null> {
  if (!/^\d+$/.test(uid)) return null;
  try {
    const list = ((await asana("GET",
      `/workspaces/${OB_WORKSPACE}/tasks/search?projects.any=${projectGid}&custom_fields.${OB_UNIT_F}.value=${uid}&opt_fields=name,completed`)) ?? []) as Array<{ gid: string; name: string; completed?: boolean }>;
    return list.find((t) => !t.completed) ?? list[0] ?? null;   // caller checks .completed
  } catch { return null; }
}
async function obLuByUnitId(uid: string): Promise<{ gid: string; name: string } | null> {
  return await obLeasingSubByUnitId(uid, /^(LU|TP|PreLease)\s*\|/i);
}
// Pipeline subtasks (LU / Turn Over / ...) often carry no Unit ID of their own — only the
// "Leasing | ..." master task does (found on unit 374402, 2026-08-19). Search direct first,
// then walk the master's subtasks by name. Unit ID only, never addresses.
// The OPEN "Leasing | ..." master for this cycle. Same completed-task trap as
// obLeasingSubByUnitId: on a re-lease the prior cycle's master still carries the Unit ID.
async function obLeasingMasterByUnitId(uid: string): Promise<{ gid: string; name: string } | null> {
  if (!/^\d+$/.test(uid)) return null;
  try {
    const list = ((await asana("GET",
      `/workspaces/${OB_WORKSPACE}/tasks/search?projects.any=1213171758682884&custom_fields.${OB_UNIT_F}.value=${uid}&opt_fields=name,completed`)) ?? []) as Array<{ gid: string; name: string; completed?: boolean }>;
    const masters = list.filter((t) => /^leasing\s*\|/i.test(t.name));
    return masters.find((t) => !t.completed) ?? masters[0] ?? null;
  } catch { return null; }
}

async function obLeasingSubByUnitId(uid: string, re: RegExp): Promise<{ gid: string; name: string } | null> {
  if (!/^\d+$/.test(uid)) return null;
  try {
    const list = ((await asana("GET",
      `/workspaces/${OB_WORKSPACE}/tasks/search?projects.any=1213171758682884&custom_fields.${OB_UNIT_F}.value=${uid}&opt_fields=name,completed`)) ?? []) as Array<{ gid: string; name: string; completed?: boolean }>;
    // An OPEN direct hit wins. A completed one does NOT: on a re-lease the prior
    // cycle's LU / Turn Over still carry the Unit ID while the CURRENT cycle's
    // subtasks carry none, so taking the completed hit fanned plans out to last
    // year's tasks (Brittany 2026-08-22, units 344444 + 426448).
    const direct = list.filter((t) => re.test(t.name));
    const openDirect = direct.find((t) => !t.completed);
    if (openDirect) return openDirect;
    // walk the OPEN "Leasing | ..." master for this cycle's subtask
    const leasingOpen = list.filter((t) => /^leasing\s*\|/i.test(t.name)).find((t) => !t.completed)
      ?? list.find((t) => /^leasing\s*\|/i.test(t.name));
    if (leasingOpen) {
      const subs = ((await asana("GET", `/tasks/${leasingOpen.gid}/subtasks?limit=100&opt_fields=name,completed`)) ?? []) as Array<{ gid: string; name: string; completed?: boolean }>;
      const sl = subs.filter((s) => re.test(String(s.name)));
      const openSub = sl.find((s) => !s.completed);
      if (openSub) return openSub;
    }
    return direct[0] ?? null;   // nothing open anywhere: last resort
  } catch { return null; }
}
// approver check: any owner email on file for the unit (field may hold several,
// split on ; or ,), or the team address. Never expose the emails to the page.
async function obValidApprover(email: string, unitId: string): Promise<{ ok: boolean; isTeam: boolean }> {
  const e = String(email ?? "").trim().toLowerCase();
  if (!/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(e)) return { ok: false, isTeam: false };
  // named staff approvers (Brittany 2026-08-27): each approval records the actual
  // email, so approving under a personal address shows exactly who signed off
  const TEAM_APPROVERS = [
    "listing@sagareus.com", "listings@sagareus.com",
    "bb@sagareus.com", "vincent@sagareus.com", "courtney@sagareus.com",
    "brittany@sagareus.com", "jessica@sagareus.com", "portia@sagareus.com",
  ];
  if (TEAM_APPROVERS.includes(e)) return { ok: true, isTeam: true };
  const lu = await obLuByUnitId(unitId);
  if (!lu) return { ok: false, isTeam: false };
  try {
    const t = await asana("GET", `/tasks/${lu.gid}?opt_fields=custom_fields.name,custom_fields.display_value`);
    const cfA = (t.custom_fields ?? []) as Array<{ name: string; display_value: string | null }>;
    // Owner Contact ("Name: ... / Email: ..." lines) replaced the LU's owner
    // singles 2026-09-26; fall back to the old field while both exist
    const oc = String(cfA.find((f) => /^owner contact$/i.test(f.name))?.display_value ?? "");
    const ocEmail = (oc.match(/(?:^|\n)\s*Email\s*:\s*([^\n]*)/i) ?? [])[1] ?? "";
    const raw = ocEmail || String(cfA.find((f) => /owner e-?mail/i.test(f.name))?.display_value ?? "");
    const owners = raw.split(/[;,]/).map((x) => x.trim().toLowerCase()).filter(Boolean);
    return { ok: owners.includes(e), isTeam: false };
  } catch { return { ok: false, isTeam: false }; }
}
type RnState = { appr: Record<string, { d: string; by: string }>; req: Array<{ s: string; t: string }>; resp: string; d: string };
function obRnParse(raw: string): RnState {
  try { const p = JSON.parse(raw); return { appr: p.appr ?? {}, req: Array.isArray(p.req) ? p.req : [], resp: String(p.resp ?? ""), d: String(p.d ?? "") }; }
  catch { return { appr: {}, req: [], resp: "", d: "" }; }
}
// replace-or-append a marker-delimited block in a task description (plain text notes)
function obBlockMerge(notes: string, tag: string, block: string): string {
  const begin = `--- ${tag} `;
  const end = `--- end ${tag.toLowerCase()} ---`;
  const re = new RegExp(`\\n?-{3} ${tag}[^\\n]*\\n[\\s\\S]*?-{3} end ${tag.toLowerCase()} -{3}`, "i");
  const clean = String(notes ?? "").replace(re, "").trimEnd();
  return (clean ? clean + "\n\n" : "") + block + "\n" + end;
}

function obDuePT(days: number): string {
  return new Date(Date.now() + days * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

// Asana date custom fields come back as "2026-09-23T00:00:00.000Z"; the intended date
// is the literal one, so slice rather than parse through a timezone.
function obDateOnly(v: unknown): string {
  const m = String(v ?? "").match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : "";
}
// Shift a YYYY-MM-DD by n days without letting the local timezone move it.
function obShiftDate(iso: string, n: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
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
    // ---------- obStart: address step creates the Initial Onboarding task up front ----------
    // Open-but-contained: creates ONLY in the Wizard In Progress section of Initial Onboard.
    // Assigned to Brittany with due = next day (Brittany 2026-09-23: initial onboard tasks are
    // hers, due the following day, as they come in); every obProgress save rolls the due date
    // forward, so an active wizard stays due tomorrow and surfaces the day the owner goes quiet.
    if (action === "obStart") {
      const kind = ["new_client", "add_property", "add_unit", "tenant_placement"].includes(String(body.kind)) ? String(body.kind) : "new_client";
      const TITLE: Record<string, string> = { new_client: "Initial Onboarding", add_property: "Add Property", add_unit: "Add Unit", tenant_placement: "Tenant Placement" };
      const address = String(body.address ?? "").trim().slice(0, 200);
      const ownerName = String(body.ownerName ?? "").trim().slice(0, 80);
      const ownerEmail = String(body.ownerEmail ?? "").trim().slice(0, 120);
      if (!address) return j(headers, 400, { ok: false, error: "missing_address" });
      try {
        const task = await asana("POST", "/tasks", {
          name: `${TITLE[kind]} | ${address} (IN PROGRESS)`,
          projects: [OB_PROJECT_GID],
          assignee: "bb@sagareus.com",
          due_on: obDuePT(1),
          notes: `${TITLE[kind]} wizard started for ${address}${ownerName ? ` by ${ownerName}${ownerEmail ? " (" + ownerEmail + ")" : ""}` : ""}. Answers fill in here as the owner works through the form; the task renames and moves out of Wizard In Progress when they submit.\n\nIf this surfaces on its due date, the owner has gone quiet - worth a follow up.\n\nCreated by Claude (onboarding wizard) on behalf of the owner.`,
        });
        await asana("POST", `/sections/${OB_WIP_SECTION}/addTask`, { task: task.gid }).catch(() => null);
        // Existing-client adds also spawn the Client Relations tracking task NOW, with the
        // staff PMA step assigned to Brittany due today (Brittany 2026-08-03). Tenant
        // Placement does not: staff create its Leasing TP task (Brittany 2026-10-20)
        let crUrl = "";
        if (kind === "add_property" || kind === "add_unit") {
          try {
            const TPL = kind === "add_property" ? "1214028249129139" : "1214029792896122";   // (PROPERTY) / (UNIT) templates
            const SUB = kind === "add_property" ? "Send | PMA - Existing client adding property" : "Verify | PMA - Includes all units";
            const label = kind === "add_property" ? "(PROPERTY)" : "(UNIT)";
            const job = await asana("POST", `/task_templates/${TPL}/instantiateTask`, {
              name: `${label} ${address}${ownerName ? " / " + ownerName : ""}`,
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
              const today = obDuePT(0);
              const subs = await asana("GET", `/tasks/${crGid}/subtasks?limit=100&opt_fields=gid,name`).catch(() => []);
              const pma = (subs ?? []).find((s: { name?: unknown }) => /pma/i.test(String(s.name ?? "")));
              if (pma) await asana("PUT", `/tasks/${pma.gid}`, { assignee: "bb@sagareus.com", due_on: today }).catch(() => null);
              else await asana("POST", `/tasks/${crGid}/subtasks`, { name: SUB, assignee: "bb@sagareus.com", due_on: today }).catch(() => null);
              if (ownerEmail) await asana("PUT", `/tasks/${crGid}`, { custom_fields: { [CR_OWNER_EMAILS_FIELD]: ownerEmail } }).catch(() => null);
              await asana("POST", `/tasks/${crGid}/stories`, { html_text: storyHtml(`Created by the onboarding wizard (${TITLE[kind]}, requested by ${ownerName || "the owner"}${ownerEmail ? ", " + ownerEmail : ""}). Onboarding data fills in at: https://app.asana.com/0/0/${task.gid}`) }).catch(() => null);
              await asana("POST", `/tasks/${task.gid}/stories`, { html_text: storyHtml(`Client Relations task created: ${crUrl}`) }).catch(() => null);
            }
          } catch { /* CR task is best-effort; the data task is already safe */ }
        }
        return j(headers, 200, { ok: true, taskGid: String(task.gid), token: await makeToken(String(task.gid)), crUrl });
      } catch { return j(headers, 200, { ok: false, error: "start_failed" }); }
    }

    // ---------- obProgress: debounced autosave from the wizard onto the obStart task ----------
    // Token-gated to the exact task obStart minted; contained to the Initial Onboard project.
    if (action === "obProgress") {
      const gid = String(body.taskGid ?? "").replace(/\D/g, "");
      const tok = String(body.token ?? "");
      if (!gid || (await verifyToken(tok)) !== gid) return j(headers, 401, { ok: false, error: "bad_token" });
      const address = String(body.address ?? "").trim().slice(0, 200);
      const answers = obParseAnswers(body);
      const units = obParseUnits(body);
      const sectionsDump = obParseSections(body);
      try {
        const t0 = await asana("GET", `/tasks/${gid}?opt_fields=gid,name,projects.gid,completed`);
        if (!(t0.projects ?? []).some((p: { gid?: unknown }) => String(p.gid) === OB_PROJECT_GID)) return j(headers, 403, { ok: false, error: "not_allowed" });
        // once finalized (suffix gone), autosave stops touching it
        if (!/\(IN PROGRESS\)/.test(String(t0.name ?? ""))) return j(headers, 200, { ok: true, finalized: true });
        const byName = await obFieldSettings();
        const cf = obMapAnswers(byName, answers);
        const prefix = String(t0.name ?? "").split(" | ")[0].trim() || "Initial Onboarding";
        const { lines, htmlNotes } = obDump(prefix === "Tenant Placement" ? "tenant_placement" : "new_client", address || "(address pending)", sectionsDump, units, true, answers);
        const base: Record<string, unknown> = { due_on: obDuePT(1), custom_fields: Object.keys(cf).length ? cf : undefined };
        if (address) base.name = `${prefix} | ${address} (IN PROGRESS)`;
        try { await asana("PUT", `/tasks/${gid}`, { ...base, html_notes: htmlNotes }); }
        catch { await asana("PUT", `/tasks/${gid}`, { ...base, notes: lines.join("\n").slice(0, 60000) }); }
        return j(headers, 200, { ok: true });
      } catch { return j(headers, 200, { ok: false, error: "save_failed" }); }
    }

    // ---------- obSubmit: /onboard wizard -> Client Relations // Initial Onboard ----------
    // OPEN endpoint by design (open-but-contained): writes ONLY to the Initial Onboard
    // project. Nothing here touches Property/Unit Settings; the push is a later staff step.
    if (action === "obSubmit") {
      const OB_PROJECT = OB_PROJECT_GID;
      const SECTIONS: Record<string, string> = { new_client: "New Submissions", add_property: "Existing Client Requests", add_unit: "Existing Client Requests", tenant_placement: "New Submissions" };
      const kind = ["new_client", "add_property", "add_unit", "tenant_placement"].includes(String(body.kind)) ? String(body.kind) : "new_client";
      const address = String(body.address ?? "").trim().slice(0, 200);
      if (!address) return j(headers, 400, { error: "missing_address", message: "Property address is required." });
      const answers = obParseAnswers(body);
      const units = obParseUnits(body);
      const sectionsDump = obParseSections(body);

      // task description: the full structured dump (source of record for unmapped answers)
      const { lines, htmlNotes } = obDump(kind, address, sectionsDump, units, false, answers);

      // find target section
      // Section names drift ("New Submissions" became "New Submissions = Human Review", then was
      // removed entirely on the 3-section board), so match by prefix and accept a miss: with no
      // review section the task stays in Wizard In Progress, assigned to Brittany due next day,
      // and her move to Review Complete is the go signal (Brittany 2026-09-23).
      const secs = await asana("GET", `/projects/${OB_PROJECT}/sections?opt_fields=name`);
      const target = (secs ?? []).find((x: { name: string }) => String(x.name ?? "").startsWith(SECTIONS[kind])) ?? null;

      const byName = await obFieldSettings();
      const cf = obMapAnswers(byName, answers);

      const TITLE: Record<string, string> = { new_client: "Initial Onboarding", add_property: "Add Property", add_unit: "Add Unit", tenant_placement: "Tenant Placement" };
      // obStart may have created the task at the address step: finalize IN PLACE (rename,
      // full dump + fields) instead of creating a duplicate. The task stays assigned to
      // Brittany, due next day, so every submission lands in her My Tasks for review.
      let existingGid = "";
      const upGid = String(body.taskGid ?? "").replace(/\D/g, "");
      const upTok = String(body.token ?? "");
      if (upGid && upTok && (await verifyToken(upTok)) === upGid) {
        const t0 = await asana("GET", `/tasks/${upGid}?opt_fields=gid,projects.gid`).catch(() => null);
        if (t0 && (t0.projects ?? []).some((p: { gid?: unknown }) => String(p.gid) === OB_PROJECT)) existingGid = upGid;
      }
      let task;
      if (existingGid) {
        const fin = { name: `${TITLE[kind]} | ${address}`, custom_fields: Object.keys(cf).length ? cf : undefined, assignee: "bb@sagareus.com", due_on: obDuePT(1) };
        try {
          await asana("PUT", `/tasks/${existingGid}`, { ...fin, html_notes: htmlNotes });
        } catch {
          await asana("PUT", `/tasks/${existingGid}`, { ...fin, notes: lines.join("\n").slice(0, 60000) });
        }
        task = { gid: existingGid };
      } else {
        try {
          task = await asana("POST", "/tasks", {
            name: `${TITLE[kind]} | ${address}`,
            projects: [OB_PROJECT],
            assignee: "bb@sagareus.com",
            due_on: obDuePT(1),
            html_notes: htmlNotes,
            custom_fields: Object.keys(cf).length ? cf : undefined,
          });
        } catch {
          // rich text rejected: fall back to the plain dump so a submission never fails on formatting
          task = await asana("POST", "/tasks", {
            name: `${TITLE[kind]} | ${address}`,
            projects: [OB_PROJECT],
            assignee: "bb@sagareus.com",
            due_on: obDuePT(1),
            notes: lines.join("\n").slice(0, 60000),
            custom_fields: Object.keys(cf).length ? cf : undefined,
          });
        }
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
            // 🙆 Owner e-mail(s) on the (CLIENT) task: all authorized personnel emails, comma-
            // separated - the Owner Feed email gate reads this field (Brittany 2026-08-12:
            // write ONLY the emoji field; the plain duplicate was removed from the project)
            try {
              const oe = String(answers.ownerEmails ?? "").trim().slice(0, 500);
              if (oe) await asana("PUT", `/tasks/${crGid}`, { custom_fields: { [CR_OWNER_EMAILS_FIELD]: oe } });
            } catch { /* best-effort */ }
            // Onboard Received date = wizard submission date (Brittany 2026-08-19: the wizard
            // never stamped this; /onboard-asana verifies it on the UPLOAD | Onboarding Form step)
            try {
              const subDate = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
              await asana("PUT", `/tasks/${crGid}`, { custom_fields: { "1211334026744269": { date: subDate } } });
            } catch { /* best-effort */ }
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
          const SYSTEM = (kind === "tenant_placement" ? "This is a TENANT PLACEMENT onboarding: Sagareus markets, screens, and places a resident, and after move in the owner's named contact manages the property (no utilities, maintenance, or accounting transition). " : "") + "You write the Onboarding Summary for a Sagareus property management onboarding. From the intake below, write: (1) a tight 4-8 sentence operational summary a coordinator can act on (occupancy, transfer situation, access, utilities plan, policies chosen, risks/flags), then (2) a 30-60-90 Day Priorities list, 2-4 bullets per period, grounded ONLY in the intake. Plain text, no markdown headers other than the literal lines 'SUMMARY', '30 DAYS', '60 DAYS', '90 DAYS'. No em dashes. Do not invent facts.";
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
      // Queue = Free Rental Analysis Request + Proposal Requested (oldest first); Sent =
      // Analysis Sent + Proposal Sent follow-up stages (most recently touched first).
      // The bench V3 sidebar groups by these (Brittany 2026-10-23); older clients read
      // only `queue`.
      const QUEUE_STAGES = ["3505530579", "3505530581"], SENT_STAGES = ["3505530580", "3505530582"];
      const search = async (stages: string[], sortProp: string, dir: string, limit: number) => {
        const sr = await hs("/crm/v3/objects/deals/search", {
          method: "POST",
          body: JSON.stringify({
            filterGroups: [{ filters: [
              { propertyName: "pipeline", operator: "EQ", value: "2185322227" },
              { propertyName: "dealstage", operator: "IN", values: stages },
            ] }],
            properties: ["dealname", "subject_city", "createdate", "bed__bath__sqft", "units", "dealstage", "hs_lastmodifieddate"],
            sorts: [{ propertyName: sortProp, direction: dir }],
            limit,
          }),
        });
        const sj = await sr.json().catch(() => ({}));
        return ((sj?.results ?? []) as { id?: unknown; properties?: Record<string, string> }[])
          .map((d) => ({ id: String(d.id ?? ""), p: d.properties ?? {} })).filter((d) => d.id);
      };
      const qdeals = await search(QUEUE_STAGES, "createdate", "ASCENDING", 50);
      const sdeals = body.withSent ? await search(SENT_STAGES, "hs_lastmodifieddate", "DESCENDING", 30) : [];
      const all = qdeals.concat(sdeals);
      const emails = new Map<string, { email: string; name: string }>();
      if (all.length) {
        const ab = await hs("/crm/v4/associations/deals/contacts/batch/read", {
          method: "POST", body: JSON.stringify({ inputs: all.map((d) => ({ id: d.id })) }),
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
      const row = (d: { id: string; p: Record<string, string> }) => ({
        dealId: d.id, dealName: String(d.p.dealname ?? ""), city: String(d.p.subject_city ?? ""),
        created: String(d.p.createdate ?? ""), modified: String(d.p.hs_lastmodifieddate ?? ""), stage: String(d.p.dealstage ?? ""),
        bedBathSqft: String(d.p.bed__bath__sqft ?? ""),
        email: emails.get(d.id)?.email ?? "", ownerName: emails.get(d.id)?.name ?? "",
      });
      return j(headers, 200, { ok: true, queue: qdeals.map(row), sent: sdeals.map(row) });
    }

    // ---------- obFeedback (internal, x-sv-key): staff feedback on the wizard -> subtask on its dev task ----------
    if (action === "obFeedback") {
      if (!TEAM_KEY || c.req.header("x-sv-key") !== TEAM_KEY) return j(headers, 401, { error: "bad_key" });
      const text = String(body.text ?? "").trim().slice(0, 4000);
      if (text.length < 5) return j(headers, 400, { error: "missing_fields" });
      // tool routing (Brittany 2026-09-19): the same action serves the Onboarding
      // Wizard AND the Biz Dev Workbench; each tool's feedback lands on its own dev
      // task under Team Tools | Bugs & Feature Requests (renamed from Field Tools 2026-09-19), same as pl/toFeedback.
      const cfg = String(body.tool ?? "") === "bizdev"
        ? { task: "1218655969980670", label: "Biz Dev Workbench" }
        : { task: "1216867998034878", label: "Onboarding Wizard" };
      const address = String(body.address ?? "").trim().slice(0, 120);
      const BB = "1203784854198936";                     // Brittany
      const todayPT = obDuePT(0);
      const sub = await asana("POST", `/tasks/${cfg.task}/subtasks`, {
        name: `${cfg.label} Feedback // ${todayPT}`,
        assignee: BB,
        due_on: todayPT,
        notes: text
          + (address ? `\n\nDeal loaded at the time: ${address}` : "")
          + `\n\nSubmitted via the ${cfg.label} Team Feedback button (staff view). Done by Claude on behalf of the submitting agent.`,
      });
      return j(headers, 200, { ok: true, url: `https://app.asana.com/0/0/${sub.gid}` });
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
      // When the workbench names the deal it loaded, write to exactly that deal - and
      // FAIL rather than fall back to latest-modified: with several deals on one contact
      // a fallback could quietly save one property's analysis onto another's deal
      // (peddy721 case 2026-09-10).
      const saveDealId = String(body.dealId ?? "").replace(/[^0-9]/g, "").slice(0, 30);
      const deal = saveDealId
        ? deals.find((d: { id?: unknown }) => String(d.id ?? "") === saveDealId)
        : deals[0];
      if (!deal) {
        return j(headers, 404, saveDealId
          ? { error: "deal_mismatch", message: "That deal is not associated with this contact anymore. Re-run the lookup and try again." }
          : { error: "no_mgmt_deal", message: "No Mgmt 3.0 deal for that contact." });
      }
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
      // Staff can target a specific deal: one contact can hold several Mgmt 3.0 deals
      // (peddy721 case 2026-09-10: three addresses, latest-modified always won).
      const dealIdIn = String(body.dealId ?? "").replace(/[^0-9]/g, "").slice(0, 30);
      if (!HS || (!email && !slugIn)) return j(headers, 200, { ok: true, proposal: {} });
      const staff = !!TEAM_KEY && c.req.header("x-sv-key") === TEAM_KEY;
      let allDeals: { id: string; p: Record<string, string> }[] = [];
      try {
        const hs = (path: string, init?: RequestInit) => fetch("https://api.hubapi.com" + path, {
          ...init, headers: { "Authorization": `Bearer ${HS}`, "Content-Type": "application/json" },
        });
        const DEAL_PROPS = ["dealname", "pipeline", "dealstage", "subject_city", "hs_lastmodifieddate", "estimated_rent", "onboarding_fee", "lease_up_fee", "mgmt_fee", "renewal_fee", "annual_inspection_fee", "ob_proposal_data", "ob_proposal_url", "ob_agreement_url", "bed__bath__sqft", "units", "link", "rentometer_link", "ob_maintenance_dispatch", "ob_renewal_notice", "ob_leasing_notifications", "ob_applicant_criteria", "ob_tax_parcel_number", "ob_tax_record_url"];
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
          allDeals = deals;
          // staff picks a specific deal by id (unknown ids fall back to latest, a read is harmless)
          dd = (staff && dealIdIn ? deals.find((d: { id: string }) => d.id === dealIdIn) : undefined) ?? deals[0];
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
        // all associated contacts = the owners on the tax record (staff maintains them in Step 5)
        let allContacts: { name: string; email: string }[] = [];
        try {
          const car2 = await hs(`/crm/v4/objects/deals/${dd!.id}/associations/contacts?limit=10`);
          const caj2 = await car2.json().catch(() => ({}));
          const cids2 = (caj2?.results ?? []).map((x: { toObjectId?: unknown }) => String(x?.toObjectId ?? "")).filter(Boolean).slice(0, 6);
          if (cids2.length) {
            const cbr = await hs("/crm/v3/objects/contacts/batch/read", {
              method: "POST",
              body: JSON.stringify({ inputs: cids2.map((id: string) => ({ id })), properties: ["firstname", "lastname", "email"] }),
            });
            const cbj = await cbr.json().catch(() => ({}));
            allContacts = (cbj?.results ?? []).map((cx: { properties?: Record<string, string> }) => ({
              name: [cx.properties?.firstname, cx.properties?.lastname].filter(Boolean).join(" ").trim(),
              email: String(cx.properties?.email ?? ""),
            })).filter((cx: { name: string }) => cx.name);
          }
        } catch { /* non-fatal */ }
        const name = String(d0.dealname ?? "").replace(/^\s*\[[^\]]*\]\s*/, "").trim();
        const city = String(d0.subject_city ?? "").trim();
        let address = city && name && !name.toLowerCase().includes(city.toLowerCase()) ? `${name}, ${city}` : name;
        // Without a state, RentCast geocodes ambiguous city names anywhere in the US
        // ("4914 131st Place SE, Bellevue" matched Bellevue NE and returned Omaha
        // comps, 2026-09-07). Sagareus only manages WA property, so pin the state
        // whenever the deal address doesn't already end with one.
        if (address && !/\b(WA|Washington)\b\.?,?\s*(\d{5}(-\d{4})?)?\s*$/i.test(address)) address = `${address}, WA`;
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
          // tax record download for the accept popup; names only (never emails) on the open payload
          taxRecordUrl: String(d0.ob_tax_record_url ?? ""),
          owners: allContacts.map((cx) => cx.name),
        };
        if (staff) {
          out.stage = String(d0.dealstage ?? "");
          out.taxParcel = String(d0.ob_tax_parcel_number ?? "");
          out.ownersFull = allContacts;
          out.email = String(c0.email ?? "");
          out.agreementUrl = String(d0.ob_agreement_url ?? "");   // workbench Step 6 prefill
          out.zillow = String(d0.link ?? "");
          out.rentometer = String(d0.rentometer_link ?? "");
          out.dealName = String(d0.dealname ?? "");
          out.dealId = dd?.id ?? "";   // Save To Deal opens the deal record in HubSpot
          out.contactId = String(c0.hs_object_id ?? "");   // bench header Contact link (2026-10-23)
          // one contact, several properties: the workbench renders a deal chooser
          if (allDeals.length > 1) {
            out.deals = allDeals.map((d) => ({ id: d.id, name: String(d.p.dealname ?? ""), stage: String(d.p.dealstage ?? "") }));
          }
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

    // ---------- propTaxSave (staff): parcel number + tax-record URL + owners on record ----------
    if (action === "propTaxSave") {
      if (!TEAM_KEY || c.req.header("x-sv-key") !== TEAM_KEY) return j(headers, 401, { error: "bad_key" });
      const HS = Deno.env.get("HUBSPOT_CRM_TOKEN") ?? "";
      const dealId = String(body.dealId ?? "").replace(/\D/g, "");
      const parcel = String(body.parcel ?? "").trim().slice(0, 60);
      const taxUrl = String(body.taxUrl ?? "").trim().slice(0, 500);
      const owners = (Array.isArray(body.owners) ? body.owners : []).slice(0, 6).map((o: Record<string, unknown>) => ({
        name: String(o.name ?? "").trim().slice(0, 120),
        email: String(o.email ?? "").trim().toLowerCase().slice(0, 200),
      })).filter((o: { name: string }) => o.name);
      if (!HS || !dealId) return j(headers, 400, { error: "missing_fields" });
      const hs = (path: string, init?: RequestInit) => fetch("https://api.hubapi.com" + path, {
        ...init, headers: { "Authorization": `Bearer ${HS}`, "Content-Type": "application/json" },
      });
      const dr = await hs(`/crm/v3/objects/deals/${dealId}?properties=pipeline`);
      const dj = await dr.json().catch(() => ({}));
      if (dj?.properties?.pipeline !== "2185322227") return j(headers, 404, { error: "no_mgmt_deal" });
      const props: Record<string, string> = {};
      if (parcel) props.ob_tax_parcel_number = parcel;
      if (/^https:\/\//.test(taxUrl)) props.ob_tax_record_url = taxUrl;
      if (Object.keys(props).length) {
        await hs(`/crm/v3/objects/deals/${dealId}`, { method: "PATCH", body: JSON.stringify({ properties: props }) });
      }
      // owners -> contacts associated to the deal (create when missing, skip already-associated names)
      const car = await hs(`/crm/v4/objects/deals/${dealId}/associations/contacts?limit=10`);
      const caj = await car.json().catch(() => ({}));
      const cids = (caj?.results ?? []).map((x: { toObjectId?: unknown }) => String(x?.toObjectId ?? "")).filter(Boolean);
      const existing: { id: string; name: string; email: string }[] = [];
      if (cids.length) {
        const cbr = await hs("/crm/v3/objects/contacts/batch/read", {
          method: "POST", body: JSON.stringify({ inputs: cids.map((id: string) => ({ id })), properties: ["firstname", "lastname", "email"] }),
        });
        const cbj = await cbr.json().catch(() => ({}));
        for (const cx of (cbj?.results ?? [])) {
          existing.push({ id: String(cx.id), name: [cx.properties?.firstname, cx.properties?.lastname].filter(Boolean).join(" ").trim().toLowerCase(), email: String(cx.properties?.email ?? "").toLowerCase() });
        }
      }
      const added: string[] = [];
      for (const o of owners) {
        const nm = o.name.toLowerCase();
        if (existing.some((e) => e.name === nm || (o.email && e.email === o.email))) continue;
        let cid = "";
        if (o.email) {
          const sr = await hs("/crm/v3/objects/contacts/search", {
            method: "POST", body: JSON.stringify({ filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: o.email }] }], properties: ["email"], limit: 1 }),
          });
          const sj = await sr.json().catch(() => ({}));
          cid = String(sj?.results?.[0]?.id ?? "");
        }
        if (!cid) {
          const parts = o.name.split(/\s+/);
          const cr = await hs("/crm/v3/objects/contacts", {
            method: "POST",
            body: JSON.stringify({ properties: { firstname: parts.slice(0, -1).join(" ") || parts[0], lastname: parts.length > 1 ? parts[parts.length - 1] : "", ...(o.email ? { email: o.email } : {}) } }),
          });
          const cj = await cr.json().catch(() => ({}));
          cid = String(cj?.id ?? "");
        }
        if (cid) {
          await hs(`/crm/v4/objects/deals/${dealId}/associations/default/contacts/${cid}`, { method: "PUT" }).catch(() => null);
          added.push(o.name);
        }
      }
      return j(headers, 200, { ok: true, added });
    }

    // ---------- propTaxUploadUrl (staff): signed storage upload for the tax record ----------
    if (action === "propTaxUploadUrl") {
      if (!TEAM_KEY || c.req.header("x-sv-key") !== TEAM_KEY) return j(headers, 401, { error: "bad_key" });
      const dealId = String(body.dealId ?? "").replace(/\D/g, "") || "misc";
      const supaUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const supaKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      if (!supaUrl || !supaKey) return j(headers, 500, { error: "storage_not_configured" });
      const filename = String(body.filename ?? "tax-record").replace(/[^\w.\-]/g, "_").slice(0, 80);
      const key = `tax-records/${dealId}/${crypto.randomUUID().slice(0, 8)}-${filename}`;
      const sh = { "Authorization": `Bearer ${supaKey}`, "apikey": supaKey };
      await fetch(`${supaUrl}/storage/v1/bucket`, {
        method: "POST", headers: { ...sh, "Content-Type": "application/json" },
        body: JSON.stringify({ id: "inspections", name: "inspections", public: true }),
      }).catch(() => null);
      const r = await fetch(`${supaUrl}/storage/v1/object/upload/sign/inspections/${key}`, {
        method: "POST", headers: { ...sh, "Content-Type": "application/json" }, body: "{}",
      });
      const jr = await r.json().catch(() => ({}));
      if (!r.ok || !jr.url) return j(headers, 502, { error: "sign_failed" });
      return j(headers, 200, { ok: true, uploadUrl: `${supaUrl}/storage/v1${jr.url}`, publicUrl: `${supaUrl}/storage/v1/object/public/inspections/${key}` });
    }

    // ================= LEASING URL (open, per-property listing review at /leasing-plan?p={slug}) =================
    // Listing Settings task = source of truth; the page reads it live on every load.
    // Names only ride the open payload (team roles); emails are scrubbed from values.
    if (action === "lsView" || action === "lsApprove" || action === "lsModify" || action === "lsTurn" || action === "lsRequest" || action === "lsAccept" || action === "lsComps" || action === "lsDraft" || action === "lsInspect") {
      const LS_PROJECT = "1217446710785429";
      const LS_APPROVAL = "1217446658980732"; // Owner Approval Date
      const LS_TURN = "1217509139690271";     // Turn Proposal, one work item per line
      // Owner decisions live as a prefix marker on each line, so the field stays the single
      // source of truth and the status is readable straight from Asana.
      const turnParse = (raw: string) => String(raw ?? "").split(/\r?\n/)
        .map((l) => l.trim()).filter(Boolean)
        .map((l, i) => {
          const m = l.match(/^\[(APPROVED|DEFERRED)\]\s*(.*)$/i);
          return { i, status: m ? m[1].toUpperCase() : "PENDING", text: (m ? m[2] : l).slice(0, 400) };
        });
      const turnLine = (t: { status: string; text: string }) =>
        t.status === "PENDING" ? t.text : `[${t.status}] ${t.text}`;
      const LS_PRIMARY = "1217446729380828";  // Leasing Agent (people); fallback owner for owner requests
      const lsSlug = (addr: string) => addr.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
      const slugIn = String(body.slug ?? "").trim().toLowerCase().slice(0, 120).replace(/[^a-z0-9-]/g, "");
      if (!slugIn) return j(headers, 400, { error: "missing_slug" });
      let hit: { gid: string; address: string } | null = null;
      let off = "";
      // 15 pages = 1,500 tasks, matching the growth target; the loop breaks early on
      // the last page so small projects pay nothing (2026-08-25 audit)
      for (let page = 0; page < 15 && !hit; page++) {
        const res0 = await fetch(`${ASANA}/projects/${LS_PROJECT}/tasks?limit=100&opt_fields=name${off ? `&offset=${encodeURIComponent(off)}` : ""}`,
          { headers: { "Authorization": `Bearer ${ASANA_PAT}` } });
        const json0 = await res0.json().catch(() => ({}));
        for (const t of (json0.data ?? []) as Array<{ gid: string; name: string }>) {
          const addr = String(t.name).replace(/^listing\s*\|/i, "").trim();
          if (addr && lsSlug(addr) === slugIn) { hit = { gid: t.gid, address: addr }; break; }
        }
        off = json0.next_page?.offset ?? "";
        if (!off) break;
      }
      if (!hit) return j(headers, 404, { error: "not_found", message: "No listing matches this link. Check the URL or contact listings@sagareus.com." });

      if (action === "lsView") {
        const t = await asana("GET", `/tasks/${hit.gid}?opt_fields=name,created_at,modified_at,custom_fields.gid,custom_fields.name,custom_fields.display_value,custom_fields.resource_subtype`);
        const scrub = (s: string) => s.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "").trim();
        const fields: Array<{ name: string; value: string; gid?: string }> = [];
        const team: Array<{ role: string; name: string; [k: string]: string }> = [];
        let approval = "";
        for (const cf of (t.custom_fields ?? []) as Array<{ gid: string; name: string; display_value: string | null; resource_subtype?: string }>) {
          const nm = String(cf.name);
          const val = String(cf.display_value ?? "").trim();
          if (!val) continue;
          if (/^(\u{1F512}|internal)/iu.test(nm)) continue;             // agent-hidden fields
          if (String(cf.gid) === LS_APPROVAL) { approval = val.slice(0, 10); continue; }
          if (/^unit id$/i.test(nm)) continue;                          // internal reference
          if (/^plan status$/i.test(nm)) continue;                      // returned separately, drives lock state
          if (String(cf.gid) === LS_TURN) continue;                     // rendered as its own approve/defer section
          if (cf.resource_subtype === "people") { team.push({ role: nm, name: scrub(val).slice(0, 120) }); continue; }
          fields.push({ name: nm, value: scrub(val).slice(0, 6000), gid: String(cf.gid) });   // gid: owner page v2 matches by id (2026-11-06)
        }
        // key dates + leasing metrics pull LIVE from the leasing projects, never from Listing Settings
        const dates: Record<string, string> = {};
        const metrics: Record<string, string> = {};
        // Scheduled move out: open Leasing | Move-Out task matched by Unit ID ONLY
        // (the Listing Settings Move-Out Date field was removed 2026-08-17; move out
        // is tracked in the Leasing pipeline and read live here).
        try {
          // Targeted search on Leasing | Human View by Unit ID (the old Move-Out
          // project page scan missed units past the first 500 tasks); the parent
          // Leasing task's date wins, Move-Out task as fallback (2026-08-22).
          const HUMAN_VIEW2 = "1208297375044026";
          const MO_DATE_F2 = "1213182815411738";
          const UNIT_F3 = "1213183515622826";
          const uidMO = String((t.custom_fields ?? []).find((f: { gid: string; display_value: string | null }) => String(f.gid) === UNIT_F3)?.display_value ?? "").trim();
          if (/^\d+$/.test(uidMO)) {
            const foundM = ((await asana("GET",
              `/workspaces/${FEED_WS}/tasks/search?projects.any=${HUMAN_VIEW2}&custom_fields.${UNIT_F3}.value=${uidMO}&completed=false&opt_fields=name,custom_fields.gid,custom_fields.display_value`)) ?? []) as Array<{ gid: string; name: string; custom_fields?: Array<{ gid: string; display_value: string | null }> }>;
            const dOf = (tk?: { custom_fields?: Array<{ gid: string; display_value: string | null }> }) => {
              const dM = String((tk?.custom_fields ?? []).find((f) => f.gid === MO_DATE_F2)?.display_value ?? "").slice(0, 10);
              return /^\d{4}-\d{2}-\d{2}$/.test(dM) ? dM : "";
            };
            const parM = foundM.find((tk) => /^leasing\s*\|/i.test(String(tk.name)));
            const moM = foundM.find((tk) => /^move-?out\s*\|/i.test(String(tk.name)));
            const dGot = dOf(parM) || dOf(moM);
            if (dGot) dates.moveOut = dGot;
            // the date often lives ONLY on the "Move-Out |" subtask, which usually has
            // no Unit ID so the search cannot see it - walk the master's subtasks, then
            // fall back to that task's own due date (Brittany 2026-08-25)
            if (!dates.moveOut && parM) {
              const kidsM = ((await asana("GET", `/tasks/${parM.gid}/subtasks?limit=100&opt_fields=name,completed`)) ?? []) as Array<{ gid: string; name: string; completed?: boolean }>;
              const mo3 = kidsM.find((k) => !k.completed && /^move-?out\s*\|/i.test(String(k.name))) ??
                kidsM.find((k) => /^move-?out\s*\|/i.test(String(k.name)));
              if (mo3) {
                const mt3 = await asana("GET", `/tasks/${mo3.gid}?opt_fields=due_on,custom_fields.gid,custom_fields.display_value`);
                dates.moveOut = dOf(mt3 as { custom_fields?: Array<{ gid: string; display_value: string | null }> }) ||
                  (/^\d{4}-\d{2}-\d{2}$/.test(String(mt3?.due_on ?? "")) ? String(mt3.due_on) : "");
              }
            }
          }
        } catch { /* best-effort */ }
        try {
          // Unit ID only, never the address (Brittany 2026-10-07: "Everything should
          // be based off the unit ID with property ID as fall back. No address
          // parsing"). The LU / TP / PreLease task comes from the Leasing | LU
          // project by Unit ID (open first, else newest); the Turn Over task is
          // reached by walking the Leasing parent found on Human View by Unit ID.
          // No Unit ID on the Listing Settings task = these stay blank.
          const UNIT_F4 = "1213183515622826";
          const uidT = String((t.custom_fields ?? []).find((f: { gid: string; display_value: string | null }) => String(f.gid) === UNIT_F4)?.display_value ?? "").trim();
          const byUid = async (proj: string) => {
            if (!/^\d+$/.test(uidT)) return [] as Array<{ gid: string; name: string; completed?: boolean; created_at?: string }>;
            return ((await asana("GET",
              `/workspaces/${FEED_WS}/tasks/search?projects.any=${proj}&custom_fields.${UNIT_F4}.value=${uidT}&opt_fields=name,completed,created_at`)) ?? []) as Array<{ gid: string; name: string; completed?: boolean; created_at?: string }>;
          };
          const pickOpen = (arr: Array<{ gid: string; name: string; completed?: boolean; created_at?: string }>, re: RegExp) => {
            const m = arr.filter((x) => re.test(String(x.name))).sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
            return m.find((x) => !x.completed) ?? m[0] ?? null;
          };
          const lu = pickOpen(await byUid("1213171756304238"), /^(LU|TP|PreLease)\s*\|/i);
          if (lu) {
            const lt = await asana("GET", `/tasks/${lu.gid}?opt_fields=custom_fields.name,custom_fields.display_value`);
            const cfs = (lt.custom_fields ?? []) as Array<{ name: string; display_value: string | null }>;
            const g = (re: RegExp) => String(cfs.find((f) => re.test(f.name) && f.display_value)?.display_value ?? "").slice(0, 10);
            const gn = (re: RegExp) => String(cfs.find((f) => re.test(f.name) && f.display_value)?.display_value ?? "").trim().slice(0, 12);
            // "completion" excluded: LU tasks also carry Move Out Completion-style
            // fields, and grabbing one shows the wrong date to the owner
            if (!dates.moveOut) dates.moveOut = String(cfs.find((f) => /move\s*out/i.test(f.name) && !/completion/i.test(f.name) && f.display_value)?.display_value ?? "").slice(0, 10);
            dates.listDate = g(/list date/i);
            dates.moveIn = g(/move\s*in date/i);
            dates.leaseSigned = g(/lease signed/i);
            metrics.inquiries = gn(/#\s*of\s*inquiries/i);
            metrics.showings = gn(/#\s*of\s*showings/i);
            metrics.applications = gn(/#\s*of\s*applications/i);
          }
          let to: { gid: string; name: string } | null = null;
          const parT = pickOpen(await byUid("1208297375044026"), /^leasing\s*\|/i);
          if (parT) {
            const kidsT = ((await asana("GET", `/tasks/${parT.gid}/subtasks?limit=100&opt_fields=name,completed,created_at`)) ?? []) as Array<{ gid: string; name: string; completed?: boolean; created_at?: string }>;
            to = pickOpen(kidsT, /^turn\s*over\s*\|/i);
          }
          if (to) {
            const tt = await asana("GET", `/tasks/${to.gid}?opt_fields=custom_fields.gid,custom_fields.name,custom_fields.display_value`);
            const tcf = (tt.custom_fields ?? []) as Array<{ gid: string; name: string; display_value: string | null }>;
            dates.turnOverDispatched = String(tcf.find((f) => String(f.gid) === "1214522138482281")?.display_value ?? "").slice(0, 10);
            if (!dates.moveOut) dates.moveOut = String(tcf.find((f) => /move\s*out/i.test(String(f.name)) && !/completion/i.test(String(f.name)) && f.display_value)?.display_value ?? "").slice(0, 10);
          }
          // days vacant: move out -> move in (or today while still vacant)
          if (/^\d{4}-\d{2}-\d{2}/.test(dates.moveOut ?? "")) {
            const end = /^\d{4}-\d{2}-\d{2}/.test(dates.moveIn ?? "") ? Date.parse(dates.moveIn) : Date.now();
            const dv = Math.max(0, Math.round((end - Date.parse(dates.moveOut)) / 86400000));
            metrics.daysVacant = String(dv);
          }
        } catch { /* best-effort */ }
        // property facts render LIVE from the Unit/Property Settings task; they are
        // deliberately NOT duplicated into Listing Settings (Brittany 2026-08-13)
        const unitSettings: Record<string, string> = {};
        try {
          // Settings task by Unit ID first (stable key; #A/#B units make address
          // matching ambiguous — Brittany 2026-08-17), Property ID as the fallback
          // (2026-10-07; the address typeahead fallback is gone).
          const UNIT_SETTINGS_PROJECT = "1213032009308835";
          const UNIT_ID_F = "1213183515622826";
          const uidLS = String((t.custom_fields ?? []).find((f: { gid: string; display_value: string | null }) => String(f.gid) === UNIT_ID_F)?.display_value ?? "").trim();
          let stGid = "";
          if (/^\d+$/.test(uidLS)) {
            // Unit Settings first (multifamily); single-family / townhouse / condo units
            // have no Unit Settings task, so fall back to Property Settings, which
            // carries the same Unit ID field (Brittany 2026-08-20).
            // Targeted search on the Unit ID field (2026-10-07): the previous page
            // scan stopped at 500 tasks per project, and Unit Settings passed 700,
            // so units past page 5 (1506 S G St #4, Unit ID 354539) rendered the
            // owner page with blank unit details.
            for (const settingsProj of [UNIT_SETTINGS_PROJECT, PROPERTY_SETTINGS_PROJECT]) {
              if (stGid) break;
              try {
                const found = ((await asana("GET",
                  `/workspaces/${FEED_WS}/tasks/search?projects.any=${settingsProj}&custom_fields.${UNIT_ID_F}.value=${uidLS}&opt_fields=name,completed`)) ?? []) as Array<{ gid: string; name: string; completed?: boolean }>;
                const pick = found.find((tk) => !tk.completed) ?? found[0];
                if (pick) stGid = pick.gid;
              } catch { /* fall through to the Property ID lookup */ }
            }
          }
          // Property ID fallback (Brittany 2026-10-07: Unit ID, then Property ID,
          // never the address): Buildium gives the unit's PropertyId, and the
          // Property Settings task is found on its Property ID field. No match =
          // blank unit details, never a guessed task.
          if (!stGid && /^\d+$/.test(uidLS)) {
            try {
              const B_ID2 = Deno.env.get("BUILDIUM_CLIENT_ID") ?? "";
              const B_SEC2 = Deno.env.get("BUILDIUM_CLIENT_SECRET") ?? "";
              if (B_ID2 && B_SEC2) {
                const ru2 = await fetch(`https://api.buildium.com/v1/rentals/units/${encodeURIComponent(uidLS)}`, { headers: { "x-buildium-client-id": B_ID2, "x-buildium-client-secret": B_SEC2 } });
                const pid2 = ru2.ok ? String(((await ru2.json().catch(() => ({}))) as Record<string, unknown>).PropertyId ?? "").trim() : "";
                if (/^\d+$/.test(pid2)) {
                  const foundP = ((await asana("GET",
                    `/workspaces/${FEED_WS}/tasks/search?projects.any=${PROPERTY_SETTINGS_PROJECT}&custom_fields.${FEED_PID_FIELD}.value=${pid2}&opt_fields=name,completed,custom_fields.gid,custom_fields.display_value`)) ?? []) as Array<{ gid: string; completed?: boolean; custom_fields?: Array<{ gid: string; display_value: string | null }> }>;
                  // the property's Settings tasks can include per-unit ones: take the
                  // one whose Unit ID matches, else the property-level task (no Unit
                  // ID), never another unit's task
                  const uidOfP = (tk: { custom_fields?: Array<{ gid: string; display_value: string | null }> }) => String((tk.custom_fields ?? []).find((f) => String(f.gid) === UNIT_ID_F)?.display_value ?? "").trim();
                  const openP = foundP.filter((tk) => !tk.completed);
                  const pickP = openP.find((tk) => uidOfP(tk) === uidLS) ?? openP.find((tk) => !uidOfP(tk)) ??
                    foundP.find((tk) => uidOfP(tk) === uidLS) ?? foundP.find((tk) => !uidOfP(tk));
                  if (pickP) stGid = pickP.gid;
                }
              }
            } catch { /* blank unit details */ }
          }
          if (stGid) {
            const stt = await asana("GET", `/tasks/${stGid}?opt_fields=parent.gid,custom_fields.name,custom_fields.display_value`);
            const stCf = (stt.custom_fields ?? []) as Array<{ name: string; display_value: string | null }>;
            for (const cf of stCf) {
              const nm = String(cf.name);
              const val = String(cf.display_value ?? "").trim();
              if (!val) continue;
              if (/^(laundry|ev charger|cooling|heating type|mailbox|security system|landscaping maintenance|utilities|internet provider|utilities - .+)$/i.test(nm)) {
                unitSettings[nm] = val.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "").slice(0, 1000);
              }
            }
            // the owner page's Parking / Storage rows: property type line (a multifamily
            // unit subtask reads its parent) plus the unit's lease spots
            const tv = (cfs: Array<{ name: string; display_value: string | null }>, re: RegExp) => String(cfs.find((f) => re.test(String(f.name)))?.display_value ?? "").trim();
            let propCf = stCf;
            if (stt.parent?.gid && !tv(stCf, /^parking type$/i) && !tv(stCf, /^storage type$/i)) {
              try { propCf = ((await asana("GET", `/tasks/${stt.parent.gid}?opt_fields=custom_fields.name,custom_fields.display_value`)).custom_fields ?? []) as typeof stCf; } catch { /* unit only */ }
            }
            const spots = await leaseSpots(uidLS);
            const pk = parkStorLine(tv(propCf, /^parking type$/i), spots.parking, "Spot");
            const sto = parkStorLine(tv(propCf, /^storage type$/i), spots.storage, "Storage");
            if (pk) unitSettings["Parking"] = pk.slice(0, 1000);
            if (sto) unitSettings["Storage"] = sto.slice(0, 1000);
          }
        } catch { /* best-effort */ }
        // Leasing team cards: Asana says who is assigned, the HubDB directory says who they
        // are (photo, phone, blurb). Assembled here so the page never waits on a second call
        // and the module needs no HubDB access of its own.
        try {
          const HSTOK = Deno.env.get("HUBSPOT_CRM_TOKEN") ?? "";
          const hsGet = (path: string) => fetch("https://api.hubapi.com" + path, {
            headers: { "Authorization": `Bearer ${HSTOK}`, "Content-Type": "application/json" },
          });
          const dr = await hsGet("/cms/v3/hubdb/tables/3405630153/rows?limit=100");
          if (dr.ok) {
            const dj = await dr.json().catch(() => ({})) as { results?: Array<{ values?: Record<string, unknown> }> };
            const dir = (dj.results ?? []).map((r) => r.values ?? {});
            const norm = (x: unknown) => String(x ?? "").trim().toLowerCase();
            for (const m of team) {
              const want = norm(m.name);
              const first = want.split(/\s+/)[0];
              const row = dir.find((d) => norm(d.asana_name) === want)
                ?? dir.find((d) => norm(d.asana_name).split(/\s+/)[0] === first && first.length > 2);
              if (!row) continue;
              const img = row.photo as { url?: string } | string | undefined;
              Object.assign(m, {
                displayName: String(row.staff_name ?? m.name).slice(0, 80),
                email: String(row.email ?? "").slice(0, 120),
                phone: String(row.phone ?? "").slice(0, 40),
                photo: String((typeof img === "string" ? img : img?.url) ?? "").slice(0, 500),
                blurb: String(row.responsibilities ?? "").slice(0, 300),
                calendar: String(row.calendar_url ?? "").slice(0, 300),
              });
            }
          }
        } catch { /* cards fall back to name and role only */ }

        const turnRaw = String(((t.custom_fields ?? []) as Array<{ gid: string; display_value: string | null }>)
          .find((c) => String(c.gid) === LS_TURN)?.display_value ?? "");
        const turn = turnParse(turnRaw);
        // lock state: Plan Status + per-section approvals + the revision exchange
        // (approval dates only on the wire; approver emails never reach the page)
        const psVal = String(((t.custom_fields ?? []) as Array<{ gid: string; display_value: string | null }>).find((f) => String(f.gid) === OB_PS_F)?.display_value ?? "");
        const rnRaw = String(((t.custom_fields ?? []) as Array<{ gid: string; display_value: string | null }>).find((f) => String(f.gid) === OB_RN_F)?.display_value ?? "");
        const rnV = obRnParse(rnRaw);
        const apprOut: Record<string, string> = {};
        for (const [k, v] of Object.entries(rnV.appr)) apprOut[k] = String((v as { d: string }).d ?? "");
        // Listing Plan note rides inside the (agent-hidden) Comps Data JSON; surface
        // just the note to the page, like turnNote (Brittany 2026-08-27)
        let planNote = "";
        let turnManaged = "";
        let listManaged = "";
        try {
          const cdRaw = String(((t.custom_fields ?? []) as Array<{ name: string; display_value: string | null }>).find((f) => /comps data/i.test(String(f.name)))?.display_value ?? "");
          if (cdRaw) {
            const cdj = JSON.parse(cdRaw);
            planNote = scrub(String(cdj?.planNote ?? "")).slice(0, 800);
            // Owner Managed Turn Over flag rides here too (team 2026-09-15)
            if (String(cdj?.turnManaged ?? "") === "owner") turnManaged = "owner";
            // Owner Managed Listing (feedback 1219659478918810) rides here as well
            if (String(cdj?.listManaged ?? "") === "owner") listManaged = "owner";
          }
        } catch { /* no note */ }
        // open change requests pause the approve buttons on the page; best-effort
        // here because lsAccept/lsApprove enforce the same gate server-side
        let pendingMods: string[] = [];
        try { pendingMods = await obOpenMods(hit.gid); } catch { /* view stays usable */ }
        return j(headers, 200, { ok: true, address: hit.address, fields, team, approval, dates, metrics, unitSettings, turn, turnNote: turnRaw.slice(0, 2000), planNote, turnManaged, listManaged, planStatus: psVal, approvals: apprOut, revision: { req: rnV.req, resp: rnV.resp, d: rnV.d }, pendingMods, lastUpdated: String(t.modified_at ?? "").slice(0, 10), createdAt: String(t.created_at ?? "").slice(0, 10) });
      }

      // lsDraft: the Draft Listing section — photos, listing description, and the
      // amenity checkboxes exactly as they stand in Buildium (read-only sync; the
      // feature list is fixed by the listing service providers).
      // fresh download link for the newest inspection PDF on the Buildium UNIT profile
      // (file URLs expire, so the page fetches one at click time; Brittany 2026-08-17)
      if (action === "lsInspect") {
        const B_ID = Deno.env.get("BUILDIUM_CLIENT_ID") ?? "";
        const B_SEC = Deno.env.get("BUILDIUM_CLIENT_SECRET") ?? "";
        if (!B_ID || !B_SEC) return j(headers, 500, { error: "buildium_not_configured" });
        const t3 = await asana("GET", `/tasks/${hit.gid}?opt_fields=custom_fields.name,custom_fields.display_value`);
        const uid3 = String(((t3.custom_fields ?? []) as Array<{ name: string; display_value: string | null }>)
          .find((f) => /^unit id$/i.test(String(f.name)))?.display_value ?? "").trim();
        if (!/^\d+$/.test(uid3)) return j(headers, 404, { error: "no_unit_id", message: "This listing has no Unit ID yet." });
        const BH3 = { "x-buildium-client-id": B_ID, "x-buildium-client-secret": B_SEC, "Content-Type": "application/json" };
        const fr3 = await fetch(`https://api.buildium.com/v1/files?entitytype=RentalUnit&entityid=${encodeURIComponent(uid3)}&limit=200`, { headers: BH3 });
        if (!fr3.ok) return j(headers, 502, { error: "buildium_failed" });
        const files3 = await fr3.json().catch(() => []);
        const cand3 = (Array.isArray(files3) ? files3 : [])
          .map((f: Record<string, unknown>) => ({
            id: f.Id,
            name: String(f.Title ?? f.FileName ?? f.Name ?? ""),
            uploaded: String(f.UploadedDateTime ?? ""),
            ct: String(f.ContentType ?? ""),
          }))
          .filter((f) => /inspect/i.test(f.name) && (/pdf/i.test(f.ct) || /\.pdf$/i.test(f.name) || !f.ct));
        cand3.sort((a, b) => b.uploaded.localeCompare(a.uploaded));
        // kind=recent: newest ANNUAL inspection only (Brittany 2026-08-21).
        // Default: MOVE-IN inspection only, never the newest of any kind (Brittany 2026-08-21)
        const wantRecent = String(body.kind ?? "") === "recent";
        // kind=premoveout (owner page v2, 2026-11-06): newest pre-move-out inspection from Buildium
        const wantPmo = String(body.kind ?? "") === "premoveout";
        const mi3 = wantPmo ? cand3.filter((f) => /pre.?move.?out/i.test(f.name))
          : wantRecent ? cand3.filter((f) => /annual/i.test(f.name)) : cand3.filter((f) => /move.?in/i.test(f.name));
        const pick = mi3[0] ?? null;
        if (!pick && wantPmo) return j(headers, 404, { error: "no_inspection", message: "No pre-move-out inspection report is on file for this unit yet." });
        if (!pick) return j(headers, 404, { error: "no_inspection", message: wantRecent ? "No annual inspection report is on file for this unit yet." : "No move in inspection report is on file for this unit yet." });
        const dl = await fetch(`https://api.buildium.com/v1/files/${encodeURIComponent(String(pick.id))}/downloadrequest`, { method: "POST", headers: BH3 });
        if (!dl.ok) return j(headers, 502, { error: "buildium_failed" });
        const dj = await dl.json().catch(() => ({} as Record<string, unknown>));
        const url3 = String((dj as Record<string, unknown>).DownloadUrl ?? (dj as Record<string, unknown>).DownloadURL ?? "");
        if (!url3) return j(headers, 502, { error: "no_download_url" });
        return j(headers, 200, { ok: true, url: url3, name: pick.name });
      }

      if (action === "lsDraft") {
        const B_ID = Deno.env.get("BUILDIUM_CLIENT_ID") ?? "";
        const B_SEC = Deno.env.get("BUILDIUM_CLIENT_SECRET") ?? "";
        const out: Record<string, unknown> = { ok: true, photos: [], description: "", beds: null, baths: null, sqft: null, unitFeatures: null, propFeatures: null };
        if (!B_ID || !B_SEC) return j(headers, 200, out);
        try {
          const t = await asana("GET", `/tasks/${hit.gid}?opt_fields=custom_fields.name,custom_fields.display_value`);
          const cfs = (t.custom_fields ?? []) as Array<{ name: string; display_value: string | null }>;
          const uid = String(cfs.find((f) => /^unit id$/i.test(String(f.name)))?.display_value ?? "").trim();
          if (!/^\d+$/.test(uid)) return j(headers, 200, out);
          const BH = { "x-buildium-client-id": B_ID, "x-buildium-client-secret": B_SEC, "Content-Type": "application/json" };
          const ru = await fetch(`https://api.buildium.com/v1/rentals/units/${encodeURIComponent(uid)}`, { headers: BH });
          if (!ru.ok) return j(headers, 200, out);
          const u = await ru.json().catch(() => ({} as Record<string, unknown>));
          out.description = String((u as Record<string, unknown>).Description ?? "").slice(0, 12000);
          out.beds = (u as Record<string, unknown>).UnitBedrooms ?? null;
          out.baths = (u as Record<string, unknown>).UnitBathrooms ?? null;
          out.sqft = (u as Record<string, unknown>).UnitSize ?? null;
          const pid = (u as Record<string, unknown>).PropertyId;
          // selected amenities (dedicated endpoints; the Draft Listing section shows
          // ONLY what is checked in Buildium)
          try {
            const au = await fetch(`https://api.buildium.com/v1/rentals/units/${encodeURIComponent(uid)}/amenities`, { headers: BH });
            if (au.ok) {
              const aj = await au.json().catch(() => ({} as Record<string, unknown>));
              out.unitFeatures = Array.isArray((aj as Record<string, unknown>).Features) ? ((aj as Record<string, unknown>).Features as unknown[]).slice(0, 100) : [];
            }
          } catch { /* best-effort */ }
          if (pid) {
            try {
              const ap = await fetch(`https://api.buildium.com/v1/rentals/${encodeURIComponent(String(pid))}/amenities`, { headers: BH });
              if (ap.ok) {
                const aj2 = await ap.json().catch(() => ({} as Record<string, unknown>));
                out.propFeatures = Array.isArray((aj2 as Record<string, unknown>).Features) ? ((aj2 as Record<string, unknown>).Features as unknown[]).slice(0, 100) : [];
              }
            } catch { /* best-effort */ }
            // deposit balance held on the most recent lease (Turn Over Plan row on the owner page)
            try {
              const lr = await fetch(`https://api.buildium.com/v1/leases?propertyids=${encodeURIComponent(String(pid))}&limit=500`, { headers: BH });
              if (lr.ok) {
                const leases = await lr.json().catch(() => []);
                const dep = (Array.isArray(leases) ? leases : [])
                  .filter((l: { UnitId?: number }) => String(l?.UnitId ?? "") === uid)
                  .sort((a: { LeaseFromDate?: string }, b: { LeaseFromDate?: string }) => String(b?.LeaseFromDate ?? "").localeCompare(String(a?.LeaseFromDate ?? "")))
                  .map((l: { AccountDetails?: { SecurityDeposit?: number } }) => l?.AccountDetails?.SecurityDeposit)
                  // $0 is a real answer (new property, no deposit collected yet) and
                  // must render as $0 on the owner page, not the generic placeholder
                  // (Brittany 2026-09-22); null still means "no lease found", which
                  // keeps the generic text so a failed lookup never claims $0
                  .find((d: unknown) => typeof d === "number" && d >= 0);
                out.depositHeld = dep ?? null;
                // scheduled move out from Buildium (owner page v2, Brittany 2026-11-06: move out
                // comes from Buildium): the newest lease's latest MoveOutData date, null when none
                try {
                  const newest = (Array.isArray(leases) ? leases : [])
                    .filter((l: { UnitId?: number }) => String(l?.UnitId ?? "") === uid)
                    .sort((a: { LeaseFromDate?: string }, b: { LeaseFromDate?: string }) => String(b?.LeaseFromDate ?? "").localeCompare(String(a?.LeaseFromDate ?? "")))[0] as { MoveOutData?: Array<{ MoveOutDate?: string }> } | undefined;
                  const mo = (newest?.MoveOutData ?? []).map((m) => String(m?.MoveOutDate ?? "").slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().pop();
                  out.moveOut = mo ?? null;
                } catch { out.moveOut = null; }
              }
            } catch { /* best-effort */ }
          }
          // photos: unit images first, property images as the fallback (same dance
          // as the workbench unitPhotos action; download endpoints vary singular/plural)
          const grab = async (base: string) => {
            const lr = await fetch(`${base}?limit=50`, { headers: BH });
            if (!lr.ok) return [] as { name: string; url: string }[];
            const list = await lr.json().catch(() => []);
            if (!Array.isArray(list) || !list.length) return [];
            // one downloadrequest per image; batches of 10 so 40 photos resolve
            // in a few round trips instead of 40 sequential ones (Brittany 2026-09-10)
            const want = list.slice(0, 40);
            const photos: { name: string; url: string }[] = [];
            const one = async (img: { Id: number; Description?: string }) => {
              let dr = await fetch(`${base}/${img.Id}/downloadrequest`, { method: "POST", headers: BH, body: "{}" });
              if (dr.status === 404 || dr.status === 405) {
                dr = await fetch(`${base}/${img.Id}/downloadrequests`, { method: "POST", headers: BH, body: "{}" });
              }
              if (!dr.ok) return null;
              const d = await dr.json().catch(() => ({}));
              const url = String(d.DownloadUrl ?? d.Url ?? d.ResultUrl ?? "");
              return url ? { name: String(img.Description ?? "").slice(0, 80), url } : null;
            };
            for (let i = 0; i < want.length; i += 10) {
              const got = await Promise.all(want.slice(i, i + 10).map(one));
              for (const p of got) if (p) photos.push(p);
            }
            return photos;
          };
          let photos = await grab(`https://api.buildium.com/v1/rentals/units/${encodeURIComponent(uid)}/images`);
          if (!photos.length && pid) photos = await grab(`https://api.buildium.com/v1/rentals/${encodeURIComponent(String(pid))}/images`);
          out.photos = photos;
        } catch { /* section renders its pending states */ }
        return j(headers, 200, out);
      }

      // lsComps: the market rent analysis behind the Comp Review section. Source of
      // truth is the listing task's agent-hidden Comps Data field (JSON written by the
      // Listing Workbench; same shape the proposal workbench saves to deals).
      if (action === "lsComps") {
        try {
          const t = await asana("GET", `/tasks/${hit.gid}?opt_fields=custom_fields.name,custom_fields.display_value`);
          const cfs = (t.custom_fields ?? []) as Array<{ name: string; display_value: string | null }>;
          const g = (re: RegExp) => String(cfs.find((f) => re.test(String(f.name)) && f.display_value)?.display_value ?? "");
          const raw = g(/comps data/i);
          if (!raw) return j(headers, 200, { ok: true, comps: null });
          let data: Record<string, unknown> | null = null;
          try { data = JSON.parse(raw); } catch { data = null; }
          if (!data) return j(headers, 200, { ok: true, comps: null });
          const dnum = (v: unknown) => { const n = Number(v); return isFinite(n) && n > 0 ? n : null; };
          const rawList = (data as { comps?: Array<Record<string, unknown>> }).comps;
          const list = Array.isArray(rawList) ? rawList.slice(0, 8).map((cc) => ({
            address: String(cc.address ?? "").slice(0, 140),
            rent: Number(cc.rent) || null,
            bedrooms: cc.bedrooms ?? null,
            bathrooms: cc.bathrooms ?? null,
            squareFootage: Number(cc.squareFootage) || null,
            distance: cc.distance != null && isFinite(Number(cc.distance)) ? Number(cc.distance) : null,
            // per-comp data from the bench (Brittany 2026-09-11): shown only when filled
            inq: cc.inq != null && isFinite(Number(cc.inq)) ? Number(cc.inq) : null,
            conc: String(cc.conc ?? "").slice(0, 200) || null,
            // optional DOM + comment from either leasing bench (Brittany 2026-10-23)
            daysOnMarket: cc.daysOnMarket != null && cc.daysOnMarket !== "" && isFinite(Number(cc.daysOnMarket)) ? Number(cc.daysOnMarket) : null,
            note: String(cc.note ?? "").slice(0, 300) || null,
          })) : [];
          return j(headers, 200, { ok: true, comps: {
            rent: dnum(data.rent) ?? dnum(g(/^market rent$/i)),
            low: dnum(data.low), high: dnum(data.high), model: dnum(data.model),
            comments: String(data.comments ?? "").slice(0, 2000),
            list,
          } });
        } catch { return j(headers, 200, { ok: true, comps: null }); }
      }

      const who = String(body.name ?? "").trim().slice(0, 120);
      // lsRequest/lsAccept identify by validated email, not typed name (2026-08-17)
      if (!who && action !== "lsRequest" && action !== "lsAccept") return j(headers, 400, { error: "missing_name", message: "Add your name first." });

      if (action === "lsApprove") {
        try {
          const openMods0 = await obOpenMods(hit.gid);
          if (openMods0.length) {
            return j(headers, 409, { error: "mods_pending", message: "You have a change request in progress (" + openMods0.join(", ") + "). Approvals are paused while we update the plan; we will email you when the updated plan is ready to approve." });
          }
        } catch (e) { console.error("pending-mod check failed (lsApprove):", e); }
        const today = obDuePT(0);
        try { await asana("PUT", `/tasks/${hit.gid}`, { custom_fields: { [LS_APPROVAL]: { date: today } } }); } catch { /* field may be blocked; the comment still lands */ }
        await asana("POST", `/tasks/${hit.gid}/stories`, {
          html_text: storyHtml(`Owner Approves listing! Approved by ${who} on ${today} via the Leasing URL (/leasing-plan). Done by Claude on behalf of the owner.`),
        });
        try {
          const subs = await asana("GET", `/tasks/${hit.gid}/subtasks?limit=50&opt_fields=name,completed`);
          const oa = ((subs ?? []) as Array<{ gid: string; name: string; completed: boolean }>).find((s) => /owner approval/i.test(s.name) && !s.completed);
          if (oa) await asana("PUT", `/tasks/${oa.gid}`, { completed: true });
        } catch { /* best-effort */ }
        return j(headers, 200, { ok: true, approval: today });
      }

      // lsRequest: the single owner-request mechanism. Every button on the feed that is not
      // an approval routes here, so the team gets one consistent subtask shape no matter which
      // section it came from. Never writes to Buildium or to any settings field; it only asks.
      if (action === "lsRequest") {
        // Modify {Section} | {address} -> subtask of the Listing task, multi-homed into the
        // Listing Adjustments section so it surfaces in the workbench queue (Brittany 2026-08-17)
        const SECTIONS = ["Unit Settings", "Listing Plan", "Turn Over Plan", "Draft Listing"];
        const secIn = String(body.section ?? "").trim();
        const section = SECTIONS.find((s) => s.toLowerCase() === secIn.toLowerCase()) ?? "Listing Plan";
        const detail = String(body.detail ?? "").trim().slice(0, 4000);
        if (detail.length < 3) return j(headers, 400, { error: "missing_detail", message: "Tell us what you need and we will take it from there." });
        const t4 = await asana("GET", `/tasks/${hit.gid}?opt_fields=custom_fields.gid,custom_fields.display_value,custom_fields.people_value.gid`);
        const cf4 = (t4.custom_fields ?? []) as Array<{ gid: string; display_value?: string | null; people_value?: Array<{ gid: string }> }>;
        const reqUid = String(cf4.find((f) => String(f.gid) === OB_UNIT_F)?.display_value ?? "").trim();
        // validated exactly like approvals: owner email(s) on file or the team address
        const vr = await obValidApprover(String(body.email ?? ""), reqUid);
        if (!vr.ok) return j(headers, 403, { error: "email_mismatch", message: "That email does not match our records for this property. Use the email we have on file, or contact listings@sagareus.com." });
        const LS_TEAMLEAD3 = "1217446711292696";
        let owner = String(cf4.find((f) => String(f.gid) === LS_TEAMLEAD3)?.people_value?.[0]?.gid ?? "");
        if (!owner) owner = String(cf4.find((f) => String(f.gid) === LS_PRIMARY)?.people_value?.[0]?.gid ?? "");
        const day = obDuePT(0);
        const reqEmail = String(body.email ?? "").trim().toLowerCase().slice(0, 120);
        let subGid = "";
        try {
          const st = await asana("POST", "/tasks", {
            name: `Modify ${section} | ${hit.address}`.slice(0, 240),
            parent: hit.gid, ...(owner ? { assignee: owner } : {}), due_on: day,
            notes: `${detail}\n\nSection: ${section}\nRequested by ${reqEmail} on ${day} from the Leasing Plan page.\nReply to the owner from listings@sagareus.com once handled.`,
          });
          subGid = String(st?.gid ?? "");
          if (subGid) await asana("POST", `/sections/${OB_ADJ_SECTION}/addTask`, { task: subGid }).catch(() => null);
        } catch { /* the comment below still preserves the request */ }
        await asana("POST", `/tasks/${hit.gid}/stories`, {
          text: `Owner request (${section}) from ${reqEmail} on ${day}:\n${detail}` + (subGid ? "" : "\nNote: the Modify task could not be created; action this from the comment."),
        }).catch(() => null);
        return j(headers, 200, { ok: true, logged: true, assigned: Boolean(owner) });
      }

      // lsAccept: per-step approval with email signature (Brittany 2026-08-17).
      // Records a comment on the Listing task, tracks section state in the
      // revision-note field, flips Plan Status when both plan sections are
      // approved, and fans the approved plan out to the Leasing pipeline.
      if (action === "lsAccept") {
        const STEP_NAMES: Record<string, string> = { ud: "Unit Details", pr: "Client Priorities", lp: "Listing Plan", to: "Turn Over Plan", dl: "Draft Listing" };
        const step = String(body.step ?? "").trim().toLowerCase();
        if (!STEP_NAMES[step]) return j(headers, 400, { error: "bad_step" });
        const t5 = await asana("GET", `/tasks/${hit.gid}?opt_fields=custom_fields.gid,custom_fields.display_value,custom_fields.people_value.gid`);
        const cf5 = (t5.custom_fields ?? []) as Array<{ gid: string; display_value: string | null; people_value?: Array<{ gid: string }> }>;
        const accUid = String(cf5.find((f) => String(f.gid) === OB_UNIT_F)?.display_value ?? "").trim();
        const vr2 = await obValidApprover(String(body.email ?? ""), accUid);
        if (!vr2.ok) return j(headers, 403, { error: "email_mismatch", message: "That email does not match our records for this property. Use the email we have on file, or contact listings@sagareus.com." });
        // Modify blocks Approve until the team makes the change and re-sends
        // (fail-open on an Asana blip; the page lock still guards the main path)
        try {
          const openMods = await obOpenMods(hit.gid);
          if (openMods.length) {
            return j(headers, 409, { error: "mods_pending", message: "You have a change request in progress (" + openMods.join(", ") + "). Approvals are paused while we update the plan; we will email you when the updated plan is ready to approve." });
          }
        } catch (e) { console.error("pending-mod check failed (lsAccept):", e); }
        const accEmail = String(body.email ?? "").trim().toLowerCase().slice(0, 120);
        const day5 = obDuePT(0);
        const snap = (body.snapshot ?? {}) as Record<string, unknown>;
        const fm = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? "$" + Math.round(n).toLocaleString("en-US") : "TBD"; };
        // priorities block: chosen flavors + field-staff definitions
        const prio = (Array.isArray(snap.prio) ? snap.prio : []) as Array<{ k?: string; name?: string }>;
        // bench-side team approval sends no snapshot (Brittany 2026-09-03): fall
        // back to the Listing Settings fields so the fan-out blocks stay complete
        const lsNum5 = (g0: string) => { const n0 = Number(String(cf5.find((f) => String(f.gid) === g0)?.display_value ?? "").replace(/[^0-9.]/g, "")); return Number.isFinite(n0) && n0 > 0 ? n0 : null; };
        if (!prio.length) {
          const pv5 = String(cf5.find((f) => String(f.gid) === "1217535711314799")?.display_value ?? "");
          pv5.split(",").forEach((seg) => { const m5 = seg.trim().match(/^(Listing|Turn|Risk)\s*-\s*(.+)$/i); if (m5) prio.push({ k: m5[1], name: m5[2].trim() }); });
        }
        const prioLines = prio.map((p) => {
          const k = String(p.k ?? ""); const n = String(p.name ?? "");
          const def = OB_PRIO_DEF[k + ":" + n] ?? "";
          return `${k}: ${n}` + (def ? ` - ${def}` : "");
        });
        const nums = (snap.nums ?? {}) as Record<string, unknown>;
        if (nums.start == null) nums.start = lsNum5("1217446589856415");
        if (nums.target == null) nums.target = lsNum5("1217446658749360");
        if (nums.min == null) nums.min = lsNum5("1217446710834881");
        if (snap.budget == null) snap.budget = lsNum5("1217611635986386");
        if (snap.depositHeld == null) snap.depositHeld = lsNum5("1217530249320839");
        const sched = (Array.isArray(snap.sched) ? snap.sched : []) as Array<[number, number]>;
        const schedLines = sched.map((s) => `Week ${s[0]}: ${fm(s[1])}`);
        // Adjustment Plan field (pushed from the workbench) = what the team executes
        const adjPlanRaw = String(cf5.find((f) => String(f.gid) === "1217448328664674")?.display_value ?? "").trim();
        const url5 = `https://www.sagareus.com/leasing-plan?p=${slugIn}`;
        // target dates drive the LU schedule below, so they read the Listing Settings
        // fields rather than the page snapshot (Brittany 2026-08-25)
        const tgtList = obDateOnly(cf5.find((f) => String(f.gid) === "1217515135889617")?.display_value);
        const tgtMoveIn = obDateOnly(cf5.find((f) => String(f.gid) === "1217740384009759")?.display_value);
        // team lead notes ride into the fan-out (Brittany 2026-08-27): turn note from
        // the Turn Proposal field (only when it is a note, not decision markers), plan
        // note from the Comps Data JSON
        const noteTurn = (() => {
          const raw0 = String(cf5.find((f) => String(f.gid) === LS_TURN)?.display_value ?? "").trim();
          return raw0 && !/^\[/.test(raw0) ? raw0.replace(/\s*\n+\s*/g, " ").slice(0, 400) : "";
        })();
        const notePlan = (() => {
          try {
            const cd0 = JSON.parse(String(cf5.find((f) => String(f.gid) === "1217516812648029")?.display_value ?? "") || "{}");
            return String(cd0?.planNote ?? "").replace(/\s*\n+\s*/g, " ").slice(0, 400);
          } catch { return ""; }
        })();
        // reader-friendly blocks (format set by Brittany 2026-08-27): bulleted lines
        // with breathing room, note first, priorities at the end
        let summary = "";
        if (step === "lp") {
          summary = "LISTING PLAN\n\n" +
            (notePlan ? `* Note from Team Lead: ${notePlan}\n\n` : "") +
            `* Starting Rent: ${fm(nums.start)} | Target Rent: ${fm(nums.target)} | Minimum Rent: ${fm(nums.min)}\n\n` +
            `* Target List Date: ${tgtList || "TBD"} | Target Move In Date: ${tgtMoveIn || "TBD"}\n\n` +
            "WEEKLY ADJUSTMENT SCHEDULE\n" +
            `Hold criteria, checked weekly: 10 inquiries OR 5 showings OR 1 application.\nCriteria met = hold price that week. Criteria missed = take the action below:\n` +
            // the team's real plan is the Adjustment Plan field the workbench pushed;
            // the generic price ladder is only a fallback (Brittany 2026-08-22)
            (adjPlanRaw ? adjPlanRaw : schedLines.join("\n")) +
            `\nNever below Minimum Rent (${fm(nums.min)}). Below-minimum action requires owner contact.`;
        } else if (step === "to") {
          summary = "TURN OVER PLAN\n\n" +
            (noteTurn ? `* Note from Team Lead: ${noteTurn}\n\n` : "") +
            "* Standard: Rent Ready + Cleaning (minimum standard)\n\n" +
            (Number(snap.budget) > 0 ? `* Turn budget authorized by the owner: ${fm(snap.budget)} (estimates approved by priority up to this total)\n\n` : "") +
            (snap.depositHeld != null && snap.depositHeld !== "" ? `* Deposit Balance held: ${fm(snap.depositHeld)}\n\n` : "");
          summary = summary.trimEnd();
        }
        // comment on the Listing task = the human record
        const head5 = `${STEP_NAMES[step]} approved by ${accEmail} on ${day5}` + (vr2.isTeam ? " (team lead approval)" : "");
        const prioBlock = prioLines.length ? "CLIENT PRIORITIES\n" + prioLines.join("\n-\n") : "";
        await asana("POST", `/tasks/${hit.gid}/stories`, {
          text: head5 + (summary ? `\n\n${summary}` : "") + (prioBlock ? `\n\n${prioBlock}` : "") + "\n\nApproved on the Leasing Plan page. Done by Claude on behalf of the owner's click.",
        }).catch(() => null);
        // state update: section approvals live in the revision-note field
        const rnRaw5 = String(cf5.find((f) => String(f.gid) === OB_RN_F)?.display_value ?? "");
        const st5 = obRnParse(rnRaw5);
        st5.appr[step] = { d: day5, by: vr2.isTeam ? "team" : "owner" };
        const bothDone = Boolean(st5.appr.lp && st5.appr.to);
        if (bothDone) { st5.req = []; st5.resp = ""; }
        const cfW: Record<string, unknown> = { [OB_RN_F]: JSON.stringify(st5).slice(0, 1020) };
        // Priorities / Listing Plan approvals also write the Client Priorities multi-select
        if ((step === "pr" || step === "lp") && prio.length) {
          const PRI_F = "1217535711314799";
          const PRI_O: Record<string, string> = {
            "Listing - Maximize Rent": "1217535711314800", "Listing - Lean Maximize Rent": "1218113013664327",
            "Listing - Balanced": "1217535711314801", "Listing - Lean Minimize Vacancy": "1218113013692703",
            "Listing - Minimize Vacancy": "1217535711314802",
            "Turn - Essentials Only": "1217535711314803", "Turn - Lean Essentials": "1218112988657402",
            "Turn - Balanced": "1217535711314804", "Turn - Lean Upgrade": "1218112988504655",
            "Turn - Upgrade": "1217535711314805",
            "Risk - Selective": "1217535711314806", "Risk - Lean Selective": "1218122442685208",
            "Risk - Balanced": "1217535711314807", "Risk - Lean Flexible": "1218112988504657",
            "Risk - Flexible": "1217535711314808",
          };
          const pg = prio.map((p) => PRI_O[`${String(p.k ?? "")} - ${String(p.name ?? "")}`]).filter(Boolean);
          if (pg.length === 3) cfW[PRI_F] = pg;
        }
        let psOut = "";
        if (bothDone) {
          const allOwner = st5.appr.lp.by === "owner" && st5.appr.to.by === "owner";
          psOut = allOwner ? "Accepted" : "Team Lead Approved";
          cfW[OB_PS_F] = OB_PS_OPT[psOut];
        }
        await asana("PUT", `/tasks/${hit.gid}`, { custom_fields: cfW }).catch(() => null);
        // fan-out to the Leasing pipeline (LP + TO only; all tasks by Unit ID)
        const fanNotes: string[] = [];
        try {
          if (step === "to" && /^\d+$/.test(accUid)) {
            // prefer an OPEN Turn Over task; the project search can only see the prior
            // cycle's (completed) one, so fall through to the master walk (2026-08-22)
            const toDirect = await obTaskByUnitId("1213171760535170", accUid) as { gid: string; name: string; completed?: boolean } | null;
            const toTask = (toDirect && !toDirect.completed) ? toDirect
              : ((await obLeasingSubByUnitId(accUid, /^turn\s*over\s*\|/i)) ?? toDirect);
            // TOC + move out date resolve regardless of the Turn Over task: Process
            // Deposit below still schedules when the turn task is missing (2026-08-25)
            const tocGid = String(cf5.find((f) => String(f.gid) === "1217446729380923")?.people_value?.[0]?.gid ?? "");
            if (!tocGid) fanNotes.push("no Turn Over Coordinator on Listing Settings, turn over left unassigned");
            const masterT = await obLeasingMasterByUnitId(accUid);
            let moDateT = "";
            if (masterT) {
              const mCfT = ((await asana("GET", `/tasks/${masterT.gid}?opt_fields=custom_fields.gid,custom_fields.display_value`))?.custom_fields ?? []) as Array<{ gid: string; display_value: string | null }>;
              moDateT = obDateOnly(mCfT.find((f) => String(f.gid) === "1213182815411738")?.display_value);
            }
            if (!moDateT) fanNotes.push("no Tenant Move-Out Date, turn over due date skipped");
            if (toTask) {
              // pinned comment, not a description block (Brittany 2026-08-19) — same shape as the LU one
              const block = `--- Turn Over Plan (approved ${day5}${vr2.isTeam ? " by team lead" : ""}) ---\n` + summary + `\n\nLeasing Plan: ${url5}` + (prioBlock ? `\n${prioBlock}` : "");
              await obReplacePlanComment(toTask.gid, "--- Turn Over Plan (approved");
              const toStory = await asana("POST", `/tasks/${toTask.gid}/stories`, { text: block });
              if (toStory?.gid) { await asana("PUT", `/stories/${toStory.gid}`, { is_pinned: true }).catch(() => null); fanNotes.push("turnover comment pinned"); }

              // Turn Over Plan approval hands the turn to its coordinator (Brittany
              // 2026-08-25): TOC from Listing Settings, due at move out, and the human
              // board moves to Pending Turn Over.
              const pT: Record<string, unknown> = {};
              if (tocGid) pT.assignee = tocGid;
              if (moDateT) pT.due_on = moDateT;
              if (Object.keys(pT).length) {
                try { await asana("PUT", `/tasks/${toTask.gid}`, pT); fanNotes.push(`turn over${tocGid ? " assigned to coordinator" : ""}${moDateT ? ` due ${moDateT}` : ""}`); }
                catch { fanNotes.push("turn over assign/due failed"); }
              }
              // ONLY the main Turn Over task is assigned to the coordinator; its
              // subtasks stay unassigned so the TOC dispatches them deliberately
              // (Brittany 2026-09-03, reversing the 2026-08-25 blanket assignment)
              // the TURN OVER task goes into Pending Turn Over on the human board;
              // the Leasing master stays in the Untitled section (Brittany 2026-08-25)
              try {
                await asana("POST", "/sections/1209370106064141/addTask", { task: toTask.gid });
                fanNotes.push("turn over task moved to Pending Turn Over");
              } catch { fanNotes.push("Pending Turn Over section move failed"); }
            } else fanNotes.push("no turn over task");
            {
              // Process Deposit is the coordinator's too (Brittany 2026-08-25): task and
              // subtasks due two weeks after move out, and the task goes into Security
              // Deposits on the human board.
              try {
                if (!masterT) fanNotes.push("no open Leasing master, process deposit skipped");
                else {
                  const pdSubs = ((await asana("GET", `/tasks/${masterT.gid}/subtasks?limit=100&opt_fields=name,completed`)) ?? []) as Array<{ gid: string; name: string; completed?: boolean }>;
                  const pdTask = pdSubs.find((s) => !s.completed && /^process\s*deposit\s*\|/i.test(s.name));
                  if (!pdTask) fanNotes.push("no open Process Deposit subtask");
                  else {
                    const pdDue = moDateT ? obShiftDate(moDateT, 14) : "";
                    const pPD: Record<string, unknown> = {};
                    if (tocGid) pPD.assignee = tocGid;
                    if (pdDue) pPD.due_on = pdDue;
                    if (Object.keys(pPD).length) {
                      try { await asana("PUT", `/tasks/${pdTask.gid}`, pPD); fanNotes.push(`process deposit${tocGid ? " assigned to coordinator" : ""}${pdDue ? ` due ${pdDue}` : ""}`); }
                      catch { fanNotes.push("process deposit assign/due failed"); }
                    }
                    try {
                      const pdKids = ((await asana("GET", `/tasks/${pdTask.gid}/subtasks?limit=100&opt_fields=name,completed`)) ?? []) as Array<{ gid: string; name: string; completed?: boolean }>;
                      let nPD = 0;
                      for (const s of pdKids) {
                        if (s.completed || /^==/.test(String(s.name).trim())) continue;
                        const pK: Record<string, unknown> = {};
                        if (tocGid) pK.assignee = tocGid;
                        if (pdDue) pK.due_on = pdDue;
                        if (!Object.keys(pK).length) break;
                        try { await asana("PUT", `/tasks/${s.gid}`, pK); nPD++; } catch { /* per-subtask, keep going */ }
                      }
                      if (nPD) fanNotes.push(`${nPD} process deposit subtasks scheduled`);
                    } catch { fanNotes.push("process deposit subtask scheduling failed"); }
                    try {
                      await asana("POST", "/sections/1209321278531017/addTask", { task: pdTask.gid });
                      fanNotes.push("process deposit moved to Security Deposits");
                    } catch { fanNotes.push("Security Deposits section move failed"); }
                  }
                }
              } catch { fanNotes.push("process deposit error"); }
            }
          }
          if (step === "lp" && /^\d+$/.test(accUid)) {
            const lu5 = await obLuByUnitId(accUid);
            if (lu5) {
              const block = `--- Leasing Plan (approved ${day5}${vr2.isTeam ? " by team lead" : ""}) ---\n` + summary + `\n\nLeasing Plan: ${url5}` + (prioBlock ? `\n${prioBlock}` : "");
              const subs5 = await asana("GET", `/tasks/${lu5.gid}/subtasks?limit=100&opt_fields=name,completed`);
              const subList = ((subs5 ?? []) as Array<{ gid: string; name: string; completed?: boolean }>);
              const war = subList.find((s) => /weekly activity report/i.test(s.name));
              if (war) {
                const curW = await asana("GET", `/tasks/${war.gid}?opt_fields=notes`);
                await asana("PUT", `/tasks/${war.gid}`, { notes: obBlockMerge(String(curW.notes ?? ""), "Leasing Plan", block) });
                fanNotes.push("weekly activity report updated");
              } else fanNotes.push("no weekly activity report subtask");
              await obReplacePlanComment(lu5.gid, "--- Leasing Plan (approved");
              const story = await asana("POST", `/tasks/${lu5.gid}/stories`, { text: block });
              if (story?.gid) { await asana("PUT", `/stories/${story.gid}`, { is_pinned: true }).catch(() => null); fanNotes.push("lu comment pinned"); }

              // Approval starts the listing clock (Brittany 2026-08-25): the LU task goes
              // to the Team Lead due two days before we intend to list, and the two
              // go-live subtasks land on the target list date itself.
              const leadGid5 = String(cf5.find((f) => String(f.gid) === "1217446711292696")?.people_value?.[0]?.gid ?? "");
              const luDue = tgtList ? obShiftDate(tgtList, -2) : "";
              const luPatch: Record<string, unknown> = {};
              if (leadGid5) luPatch.assignee = leadGid5;
              if (luDue) luPatch.due_on = luDue;
              if (Object.keys(luPatch).length) {
                try {
                  await asana("PUT", `/tasks/${lu5.gid}`, luPatch);
                  fanNotes.push(`LU${leadGid5 ? " assigned to team lead" : ""}${luDue ? ` due ${luDue}` : ""}`);
                } catch { fanNotes.push("LU assign/due failed"); }
              }
              if (!leadGid5) fanNotes.push("no Team Lead on Listing Settings, LU left unassigned");
              if (!tgtList) fanNotes.push("no Target List Date, due dates skipped");
              else {
                // Go Live is Mary's standing job; the owner notification goes out the same day
                const MARY = "1203402971273034";
                const goLive = subList.find((s) => !s.completed && /^go live\s*\|/i.test(s.name) && /buildium/i.test(s.name));
                if (goLive) {
                  try {
                    await asana("PUT", `/tasks/${goLive.gid}`, { assignee: MARY, due_on: tgtList });
                    fanNotes.push(`go live assigned to Mary, due ${tgtList}`);
                  } catch { fanNotes.push("go live update failed"); }
                } else fanNotes.push("no open Go Live subtask");
                const listedNote = subList.find((s) => !s.completed && /^email\s*\|/i.test(s.name) && /property listed/i.test(s.name));
                if (listedNote) {
                  try {
                    await asana("PUT", `/tasks/${listedNote.gid}`, { due_on: tgtList });
                    fanNotes.push(`property listed notification due ${tgtList}`);
                  } catch { fanNotes.push("property listed notification update failed"); }
                } else fanNotes.push("no open Property Listed subtask");
              }

              // Move out side of the same approval: the Leasing Agent owns the move out
              // and its two lead-time subtasks, and the property moves into Move Out
              // Pending on the human board (Brittany 2026-08-25).
              try {
                const master = await obLeasingMasterByUnitId(accUid);
                if (!master) fanNotes.push("no open Leasing master, move out schedule skipped");
                else {
                  const agentGid = String(cf5.find((f) => String(f.gid) === "1217446729380828")?.people_value?.[0]?.gid ?? "");
                  if (!agentGid) fanNotes.push("no Leasing Agent on Listing Settings, move out subtasks left unassigned");
                  const mSubs = ((await asana("GET", `/tasks/${master.gid}/subtasks?limit=100&opt_fields=name,completed`)) ?? []) as Array<{ gid: string; name: string; completed?: boolean }>;
                  // "^move out |" excludes the sibling "Pre Move-Out | ..." task
                  const moTask = mSubs.find((s) => !s.completed && /^move[-\s]*out\s*\|/i.test(s.name));
                  // move out date lives on the Leasing master, not on Listing Settings
                  const mCf = ((await asana("GET", `/tasks/${master.gid}?opt_fields=custom_fields.gid,custom_fields.display_value`))?.custom_fields ?? []) as Array<{ gid: string; display_value: string | null }>;
                  const moDate = obDateOnly(mCf.find((f) => String(f.gid) === "1213182815411738")?.display_value);
                  if (!moDate) fanNotes.push("no Tenant Move-Out Date, move out due dates skipped");
                  if (moTask) {
                    const p: Record<string, unknown> = {};
                    if (agentGid) p.assignee = agentGid;
                    if (moDate) p.due_on = moDate;
                    if (Object.keys(p).length) {
                      try { await asana("PUT", `/tasks/${moTask.gid}`, p); fanNotes.push(`move out${agentGid ? " assigned to agent" : ""}${moDate ? ` due ${moDate}` : ""}`); }
                      catch { fanNotes.push("move out update failed"); }
                    }
                    // lead-time subtasks hang off the Move-Out task, not the master
                    const moSubs = ((await asana("GET", `/tasks/${moTask.gid}/subtasks?limit=100&opt_fields=name,completed`)) ?? []) as Array<{ gid: string; name: string; completed?: boolean }>;
                    const LEAD: Array<[RegExp, number, string]> = [
                      [/^text\s*\|.*schedule\s*move\s*out/i, -14, "text tenant"],
                      [/^install\s*\|.*key\s*box/i, -7, "install keybox"],
                    ];
                    for (const [re2, off, label] of LEAD) {
                      const sub = moSubs.find((s) => !s.completed && re2.test(s.name));
                      if (!sub) { fanNotes.push(`no open ${label} subtask`); continue; }
                      const due2 = moDate ? obShiftDate(moDate, off) : "";
                      const p2: Record<string, unknown> = {};
                      if (agentGid) p2.assignee = agentGid;
                      if (due2) p2.due_on = due2;
                      if (!Object.keys(p2).length) continue;
                      try { await asana("PUT", `/tasks/${sub.gid}`, p2); fanNotes.push(`${label}${due2 ? ` due ${due2}` : ""}`); }
                      catch { fanNotes.push(`${label} update failed`); }
                    }
                    // the MOVE-OUT task goes into Move Out Pending on the human board;
                    // the Leasing master stays in the Untitled section (Brittany 2026-08-25)
                    try {
                      await asana("POST", "/sections/1209043324530975/addTask", { task: moTask.gid });
                      fanNotes.push("move out task moved to Move Out Pending");
                    } catch { fanNotes.push("Move Out Pending section move failed"); }
                  } else fanNotes.push("no open Move-Out subtask");
                }
              } catch { fanNotes.push("move out schedule error"); }
            } else fanNotes.push("no LU task");
          }
        } catch { fanNotes.push("fanout error"); }
        return j(headers, 200, { ok: true, step, approvedOn: day5, planStatus: psOut, approvals: Object.fromEntries(Object.entries(st5.appr).map(([k, v]) => [k, (v as { d: string }).d])), fanNotes });
      }

      // lsTurn: owner approves or defers each turn proposal line. Decisions write back as
      // prefix markers on the field itself, plus a comment and one subtask for the Team Lead.
      // Estimates and scheduling stay human work; this only records the owner's answer.
      if (action === "lsTurn") {
        const t3 = await asana("GET", `/tasks/${hit.gid}?opt_fields=custom_fields.gid,custom_fields.display_value,custom_fields.people_value.gid`);
        const cf3 = (t3.custom_fields ?? []) as Array<{ gid: string; display_value: string | null; people_value?: Array<{ gid: string }> }>;
        const lines = turnParse(String(cf3.find((c) => String(c.gid) === LS_TURN)?.display_value ?? ""));
        if (!lines.length) return j(headers, 400, { error: "no_turn_proposal", message: "There is no turn proposal on this listing yet." });

        const note = String(body.note ?? "").trim().slice(0, 2000);
        const approveAll = body.approveAll === true;
        const decIn = Array.isArray(body.decisions) ? (body.decisions as Array<{ i?: unknown; status?: unknown }>).slice(0, 60) : [];
        const changed: string[] = [];
        // An approved item is final from the owner's side: work gets scheduled off it, so
        // letting an owner un-approve later would strand committed vendor work. Deferred
        // items stay changeable, since approving later is the normal path. Only staff can
        // reverse an approval, by editing the marker on the field in Asana.
        const locked: string[] = [];
        if (approveAll) {
          for (const l of lines) {
            if (l.status !== "APPROVED") { changed.push(`APPROVED: ${l.text}`); l.status = "APPROVED"; }
          }
        } else {
          for (const d of decIn) {
            const idx = Number(d.i);
            const st = String(d.status ?? "").toUpperCase();
            if (!Number.isInteger(idx) || idx < 0 || idx >= lines.length) continue;
            if (st !== "APPROVED" && st !== "DEFERRED" && st !== "PENDING") continue;
            if (lines[idx].status === "APPROVED") { locked.push(lines[idx].text); continue; }
            if (lines[idx].status === st) continue;
            lines[idx].status = st;
            changed.push(`${st}: ${lines[idx].text}`);
          }
        }
        if (!changed.length && locked.length && !note) {
          return j(headers, 409, { error: "already_approved", message: "Those items are already approved and the work is scheduled. Contact your leasing team to change anything that is already approved." });
        }
        if (!changed.length && !note) return j(headers, 400, { error: "no_changes", message: "Choose approve or defer on at least one item, or add a comment." });

        if (changed.length) {
          try { await asana("PUT", `/tasks/${hit.gid}`, { custom_fields: { [LS_TURN]: lines.map(turnLine).join("\n").slice(0, 6000) } }); }
          catch { return j(headers, 502, { error: "write_failed", message: "Could not save your choices. Please try again or email listings@sagareus.com." }); }
        }

        const today = obDuePT(0);
        const pending = lines.filter((l) => l.status === "PENDING").length;
        const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

        // Approved items flow into the Turn Over task's DESCRIPTION (the work
        // order the crew works from; the Approved Scope field retired
        // 2026-09-24). Kept in sync both ways: un-approving an item pulls it
        // back out. Lines the crew added by hand are never touched.
        let scopeNote = "";
        try {
          // Unit ID, never the address (Brittany 2026-10-07): this call WRITES the
          // crew's work order, so a near-miss on a sibling unit would be the worst
          // kind of wrong. Listing Settings Unit ID -> Leasing parent on Human
          // View -> its open Turn Over subtask.
          const UNIT_F5 = "1213183515622826";
          const tLs5 = await asana("GET", `/tasks/${hit.gid}?opt_fields=custom_fields.gid,custom_fields.display_value`);
          const uid5 = String(((tLs5.custom_fields ?? []) as Array<{ gid: string; display_value: string | null }>).find((f) => String(f.gid) === UNIT_F5)?.display_value ?? "").trim();
          let to: { gid: string; name: string } | null = null;
          if (/^\d+$/.test(uid5)) {
            const pars5 = ((await asana("GET",
              `/workspaces/${FEED_WS}/tasks/search?projects.any=1208297375044026&custom_fields.${UNIT_F5}.value=${uid5}&opt_fields=name,completed,created_at`)) ?? []) as Array<{ gid: string; name: string; completed?: boolean; created_at?: string }>;
            const par5 = pars5.filter((x) => /^leasing\s*\|/i.test(String(x.name)))
              .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
            const p5 = par5.find((x) => !x.completed) ?? par5[0];
            if (p5) {
              const kids5 = ((await asana("GET", `/tasks/${p5.gid}/subtasks?limit=100&opt_fields=name,completed`)) ?? []) as Array<{ gid: string; name: string; completed?: boolean }>;
              const tos5 = kids5.filter((x) => /^turn\s*over\s*\|/i.test(String(x.name)));
              to = tos5.find((x) => !x.completed) ?? tos5[0] ?? null;
            }
          }
          if (to) {
            const tt = await asana("GET", `/tasks/${to.gid}?opt_fields=notes`);
            const scopeRaw = String((tt as { notes?: string })?.notes ?? "");
            const scopeLines = scopeRaw.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
            const proposalTexts = new Set(lines.map((l) => l.text));
            const kept = scopeLines.filter((x) => !proposalTexts.has(x));   // crew-added lines survive
            const approved = lines.filter((l) => l.status === "APPROVED").map((l) => l.text);
            const nextScope = [...kept, ...approved].join("\n").slice(0, 9000);
            if (nextScope !== scopeRaw.trim()) {
              await asana("PUT", `/tasks/${to.gid}`, { notes: nextScope });
              scopeNote = `The Turn Over task's work order now lists ${approved.length} approved item${approved.length === 1 ? "" : "s"}.`;
            }
          } else {
            scopeNote = "No Turn Over task found for this unit (by Unit ID), so the work order was not updated.";
          }
        } catch { scopeNote = "Could not update the Turn Over task's work order; please copy the approved items over by hand."; }
        const bodyHtml = [
          `<strong>Owner turn proposal decisions</strong> from ${who} on ${today} via the Leasing URL.`,
          changed.length ? "<ul>" + changed.map((c) => `<li>${esc(c)}</li>`).join("") + "</ul>" : "",
          note ? `<strong>Owner comment:</strong> ${esc(note)}` : "",
          pending ? `${pending} item${pending === 1 ? "" : "s"} still undecided.` : "All items decided.",
          locked.length ? `The owner tried to change ${locked.length} already-approved item${locked.length === 1 ? "" : "s"}; the approval was kept. Follow up if they want it pulled.` : "",
          scopeNote,
        ].filter(Boolean).join("\n");
        await asana("POST", `/tasks/${hit.gid}/stories`, { html_text: `<body>${bodyHtml}</body>` });

        const LS_TEAMLEAD2 = "1217446711292696";
        let lead = String(cf3.find((f) => String(f.gid) === LS_TEAMLEAD2)?.people_value?.[0]?.gid ?? "");
        if (!lead) lead = String(cf3.find((f) => String(f.gid) === LS_PRIMARY)?.people_value?.[0]?.gid ?? "");
        // one subtask per property, reused: repeated visits append rather than pile up
        let deciGid = "";
        try {
          const subs2 = await asana("GET", `/tasks/${hit.gid}/subtasks?limit=50&opt_fields=name,completed`);
          deciGid = String(((subs2 ?? []) as Array<{ gid: string; name: string; completed: boolean }>)
            .find((x) => /^turn proposal decisions/i.test(x.name) && !x.completed)?.gid ?? "");
        } catch { /* fall through to create */ }
        try {
          if (deciGid) {
            await asana("POST", `/tasks/${deciGid}/stories`, { html_text: `<body>${bodyHtml}</body>` });
            await asana("PUT", `/tasks/${deciGid}`, { due_on: today });
          } else await asana("POST", "/tasks", {
            name: `Turn Proposal Decisions | ${hit.address}`.slice(0, 240),
            parent: hit.gid,
            ...(lead ? { assignee: lead } : {}),
            due_on: today,
            html_notes: `<body>${bodyHtml}\nSchedule the approved work and hold the deferred items. Update Buildium and the turn over task to match.</body>`,
          });
        } catch { /* the comment already carries the record */ }
        return j(headers, 200, { ok: true, turn: lines.map((l) => ({ i: l.i, status: l.status, text: l.text })), pending });
      }

      // lsModify: owner-edited field values push straight into Listing Settings, and one
      // subtask (assigned to the Team Lead) collects everything for review + Buildium update.
      const LS_TEAMLEAD = "1217446711292696";
      const text = String(body.text ?? "").trim().slice(0, 4000);
      const changesIn = Array.isArray(body.changes) ? (body.changes as Array<{ name?: unknown; value?: unknown }>).slice(0, 30) : [];
      // amenity changes are review-only: they NEVER write to Unit Settings or Listing
      // Settings; a human verifies at the property and updates the systems by hand
      const amenIn = Array.isArray(body.amenityChanges) ? (body.amenityChanges as Array<{ name?: unknown; from?: unknown; to?: unknown }>).slice(0, 10) : [];
      const amenDiffs = amenIn
        .map((a) => ({ name: String(a.name ?? "").slice(0, 40), from: String(a.from ?? "").slice(0, 120), to: String(a.to ?? "").slice(0, 120) }))
        .filter((a) => a.name && a.to && a.from !== a.to)
        .map((a) => `${a.name}: ${a.from || "(blank)"} -> ${a.to}`);
      if (text.length < 5 && !changesIn.length && !amenDiffs.length) return j(headers, 400, { error: "missing_text", message: "Edit a field or describe the change you want first." });
      const t2 = await asana("GET", `/tasks/${hit.gid}?opt_fields=custom_fields.gid,custom_fields.name,custom_fields.display_value,custom_fields.resource_subtype,custom_fields.people_value.gid`);
      const cf2 = (t2.custom_fields ?? []) as Array<{ gid: string; name: string; display_value: string | null; resource_subtype?: string; people_value?: Array<{ gid: string }> }>;
      let agentGid = String(cf2.find((f) => String(f.gid) === LS_TEAMLEAD)?.people_value?.[0]?.gid ?? "");
      if (!agentGid) agentGid = String(cf2.find((f) => String(f.gid) === LS_PRIMARY)?.people_value?.[0]?.gid ?? "");
      const updates: Record<string, unknown> = {};
      const diffs: string[] = [];
      for (const ch of changesIn) {
        const nm = String(ch.name ?? "").trim().slice(0, 80);
        const val = String(ch.value ?? "").trim().slice(0, 6000);
        const f = cf2.find((x) => x.name === nm && x.resource_subtype !== "people" && x.resource_subtype !== "date" && String(x.gid) !== LS_APPROVAL);
        if (!f) continue;
        const old = String(f.display_value ?? "").trim();
        if (old === val) continue;
        if (f.resource_subtype === "number") {
          const n = parseFloat(val.replace(/[^0-9.]/g, ""));
          if (!Number.isFinite(n)) continue;
          updates[f.gid] = n;
          diffs.push(`${f.name}: ${old || "(blank)"} -> ${n}`);
        } else {
          updates[f.gid] = val;
          diffs.push(`${f.name}: ${old || "(blank)"} -> ${val}`);
        }
      }
      if (Object.keys(updates).length) {
        try { await asana("PUT", `/tasks/${hit.gid}`, { custom_fields: updates }); } catch { /* diffs still land in the subtask */ }
      }
      const bodyLines = [
        "Review owner requested modifications & update Buildium.",
        "",
        ...(diffs.length ? ["Field changes (already pushed to Listing Settings; the Leasing URL shows them now):", ...diffs.map((d) => "• " + d), ""] : []),
        ...(amenDiffs.length ? ["Amenity change requests (NOT auto-applied anywhere; verify at the property, then update Unit Settings and Buildium by hand):", ...amenDiffs.map((d) => "• " + d), ""] : []),
        ...(text ? [`Comment from ${who}:`, text, ""] : []),
        "Reply through listings@sagareus.com. Done by Claude on behalf of the owner.",
      ];
      const allDiffLines = diffs.map((d) => "• " + d).concat(amenDiffs.map((d) => "• " + d + " (amenity: review only)"));
      await asana("POST", `/tasks/${hit.gid}/stories`, {
        html_text: storyHtml(`Listing modification request from ${who} (via the Leasing URL):\n\n${allDiffLines.join("\n")}${allDiffLines.length && text ? "\n\n" : ""}${text}`),
      }).catch(() => null);
      const sub = await asana("POST", `/tasks/${hit.gid}/subtasks`, {
        name: `Owner Modifications | ${obDuePT(0)} | ${hit.address}`.slice(0, 250),
        notes: bodyLines.join("\n"),
        due_on: obDuePT(0),
        ...(agentGid ? { assignee: agentGid } : {}),
      });
      return j(headers, 200, { ok: true, subtaskGid: sub.gid, applied: diffs.length, reviewOnly: amenDiffs.length });
    }

    // ---------- propAcceptConfirm (open): client accepts + confirms owners on tax record ----------
    // Replaces the PandaDoc email gate (Brittany 2026-08-07): moves the deal to Proposal
    // Accepted, records the confirmed owner names/emails as a deal note, and fills missing
    // emails on matching associated contacts. Never moves a deal backward.
    // ---------- mrView: the Make Ready page (public, Unit ID keyed) ----------
    // Renders the dispatch work order + photo backups for owner AND vendor at
    // /make-ready?u={unitId} (Brittany 2026-09-03: Unit ID, never address, so two
    // units at one property cannot cross). No keybox codes ever leave here.
    if (action === "mrView") {
      const uidM = String(body.unitId ?? "").replace(/\D/g, "");
      if (!uidM) return j(headers, 400, { error: "missing_unit" });
      const lsM = await obTaskByUnitId("1217446710785429", uidM);
      const masterM = await obLeasingMasterByUnitId(uidM);
      if (!lsM && !masterM) return j(headers, 404, { error: "not_found", message: "We could not find this property. Check the link, or contact listings@sagareus.com." });
      const addressM = String((lsM?.name ?? masterM?.name ?? "")).replace(/^listing\s*\|\s*/i, "").replace(/^leasing\s*\|\s*/i, "").split(" - ")[0].trim();
      // Turn Over task off the master (Unit ID lives on the master; subtask walk)
      let toM: { gid: string; name: string; completed?: boolean } | null = null;
      if (masterM) {
        try {
          const subsM = ((await asana("GET", `/tasks/${masterM.gid}/subtasks?limit=100&opt_fields=name,completed`)) ?? []) as Array<{ gid: string; name: string; completed?: boolean }>;
          const tos = subsM.filter((x) => /^turn\s*over\s*\|/i.test(String(x.name)));
          toM = tos.find((x) => !x.completed) ?? tos[tos.length - 1] ?? null;
        } catch { /* report 404 below */ }
      }
      if (!toM) return j(headers, 404, { error: "no_turnover", message: "No turn over has been dispatched for this property yet. Contact listings@sagareus.com with any questions." });
      let dispatchedM = "";
      try {
        const tT = await asana("GET", `/tasks/${toM.gid}?opt_fields=custom_fields.gid,custom_fields.display_value`);
        dispatchedM = String(((tT.custom_fields ?? []) as Array<{ gid: string; display_value: string | null }>).find((f) => String(f.gid) === "1214522138482281")?.display_value ?? "").slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dispatchedM)) dispatchedM = "";
      } catch { /* chip shows nothing */ }
      // newest dispatch report comment
      let report = "";
      // optional &t=YYYY-MM pins WHICH turnover this link shows (a unit turns
      // over more than once); no match falls back to the newest report
      const ymM = (String(body.ym ?? "").match(/^\d{4}-\d{2}$/) ?? [""])[0];
      const videosM: string[] = [];
      const extraPhotos: string[] = [];
      try {
        // stories come back OLDEST first, 100/page: walk every page or a
        // long-lived Turn Over task hides its newest dispatch report
        // (site-visit-proxy 422789 bug class, Brittany 2026-09-10)
        const stAll: Array<Record<string, unknown>> = [];
        let stOff = "";
        for (let stPg = 0; stPg < 15; stPg++) {
          const stR = await fetch(`${ASANA}/tasks/${toM.gid}/stories?limit=100&opt_fields=type,text,created_at${stOff ? `&offset=${encodeURIComponent(stOff)}` : ""}`,
            { headers: { "Authorization": `Bearer ${ASANA_PAT}` } });
          const stJ = await stR.json().catch(() => ({}));
          if (!stR.ok) break;
          stAll.push(...((stJ.data ?? []) as Array<Record<string, unknown>>));
          stOff = stJ.next_page?.offset ?? "";
          if (!stOff) break;
        }
        const stM = stAll as Array<{ type: string; text?: string; created_at?: string }>;
        let newest = "";
        for (const x of stM) {
          const tx = String(x.text ?? "");
          if (x.type !== "comment") continue;
          // walkthrough videos live in storage; collect them from any comment
          for (const vm of tx.matchAll(/https:\/\/\S+\/inspections\/mo-videos\/\S+/g)) {
            const u2 = String(vm[0]).replace(/[),.]+$/, "").slice(0, 500);
            // photo backups share the storage path; images are not videos
            if (/\.(jpe?g|png|webp|heic)(\?|$)/i.test(u2)) continue;
            if (!videosM.includes(u2)) videosM.push(u2);
          }
          // standalone PHOTO BACKUPS comments (backfilled dispatches) count too
          if (/^PHOTO BACKUPS/i.test(tx.trim())) {
            for (const l of tx.split(/\r?\n/)) { const t3 = l.trim(); if (/^https:\/\//.test(t3)) extraPhotos.push(t3.slice(0, 500)); }
            continue;
          }
          if (!/^(move out condition inspection|turnover dispatch)/i.test(tx.trim())) continue;
          newest = tx;
          const dLine = (tx.split(/\r?\n/)[1] ?? "").match(/\d{4}-\d{2}/);
          if (ymM && dLine && dLine[0] === ymM) report = tx;
        }
        if (!report) report = newest;
      } catch { /* handled below */ }
      if (!report) return j(headers, 404, { error: "no_report", message: "The dispatch report is not posted yet. Contact listings@sagareus.com with any questions." });
      // parse: title line, "date -- address" line, then sections split on known headers
      const HEADS = /^(REQUIRED WORK ORDER|OPTIONAL UPGRADES|BY TYPE|ROOM BY ROOM|RATINGS|Notes:|PHOTO BACKUPS)/i;
      const linesM = report.split(/\r?\n/).map((l) => l.replace(/\s+$/, ""))
        .filter((l) => !/key\s*box|door\s*code/i.test(l));
      let reportDateM = "";
      const dm2 = (linesM[1] ?? "").match(/\d{4}-\d{2}-\d{2}/);
      if (dm2) reportDateM = dm2[0];
      let inspectorM = "";
      const insLine = linesM.find((l) => /^inspected by/i.test(l.trim()));
      if (insLine) inspectorM = insLine.replace(/^inspected by\s*:?\s*/i, "").split(/\s+-\s+|--/)[0].replace(/^:\s*/, "").trim().slice(0, 60);
      const sectionsM: Array<{ title: string; lines: string[] }> = [];
      const photosM: string[] = [];
      let pdfUrlM = "";
      let cur: { title: string; lines: string[] } | null = null;
      for (const l of linesM.slice(1)) {
        const t2 = l.trim();
        // the attached-PDF line moves to the page header as a download button
        const pm2 = t2.match(/^[\w\s-]*pdf\s*:\s*(https?:\/\/\S+)/i);
        if (pm2) { if (!pdfUrlM) pdfUrlM = pm2[1].slice(0, 500); continue; }
        if (HEADS.test(t2)) {
          if (/^PHOTO BACKUPS/i.test(t2)) { cur = { title: "__photos__", lines: [] }; continue; }
          cur = { title: t2.replace(/:$/, ""), lines: [] };
          sectionsM.push(cur);
          continue;
        }
        if (!cur || !t2) continue;
        if (cur.title === "__photos__") {
          if (/^https:\/\//.test(t2)) photosM.push(t2.slice(0, 500));
          continue;
        }
        cur.lines.push(t2.slice(0, 400));
      }
      return j(headers, 200, {
        ok: true, address: addressM, dispatched: dispatchedM, reportDate: reportDateM, inspector: inspectorM,
        sections: sectionsM.filter((s2) => s2.lines.length).slice(0, 12),
        photos: photosM.concat(extraPhotos.filter((u2) => !photosM.includes(u2))).slice(0, 100),
        videos: videosM.slice(0, 6),
        pdfUrl: pdfUrlM,
      });
    }

    if (action === "propAcceptConfirm") {
      const HS = Deno.env.get("HUBSPOT_CRM_TOKEN") ?? "";
      const email = String(body.email ?? "").trim().slice(0, 200);
      const slugIn = String(body.slug ?? "").trim().toLowerCase().slice(0, 120).replace(/[^a-z0-9-]/g, "");
      const owners = (Array.isArray(body.owners) ? body.owners : []).slice(0, 6).map((o: Record<string, unknown>) => ({
        name: String(o.name ?? "").trim().slice(0, 120),
        email: String(o.email ?? "").trim().toLowerCase().slice(0, 200),
      })).filter((o: { name: string; email: string }) => o.name && /@.+\./.test(o.email));
      if (!HS || (!email && !slugIn) || !owners.length) return j(headers, 200, { ok: false });
      const hs = (path: string, init?: RequestInit) => fetch("https://api.hubapi.com" + path, {
        ...init, headers: { "Authorization": `Bearer ${HS}`, "Content-Type": "application/json" },
      });
      const deal = await locateMgmtDeal(HS, email, slugIn, ["dealstage", "dealname"]);
      if (!deal) return j(headers, 200, { ok: false });
      // forward-only stage move: pre-accept stages -> Proposal Accepted
      const PRE = new Set(["3505530579", "3505530580", "3505530581", "3505530582", "3505530583"]);
      if (PRE.has(String(deal.p.dealstage ?? ""))) {
        await hs(`/crm/v3/objects/deals/${deal.id}`, { method: "PATCH", body: JSON.stringify({ properties: { dealstage: "4112393962" } }) }).catch(() => null);
      }
      // note the confirmation on the deal
      const lines = owners.map((o) => `- ${o.name} <${o.email}>`).join("\n");
      await hs("/crm/v3/objects/notes", {
        method: "POST",
        body: JSON.stringify({
          properties: {
            hs_timestamp: new Date().toISOString(),
            hs_note_body: `Proposal ACCEPTED on the web proposal. Client confirmed the owners on the tax record:\n${lines}\n\nAll owners must sign the PM Agreement. Logged by the proposal page.`,
          },
          associations: [{ to: { id: deal.id }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 214 }] }],
        }),
      }).catch(() => null);
      // fill missing emails on matching associated contacts (best effort)
      try {
        const car = await hs(`/crm/v4/objects/deals/${deal.id}/associations/contacts?limit=10`);
        const caj = await car.json().catch(() => ({}));
        const cids = (caj?.results ?? []).map((x: { toObjectId?: unknown }) => String(x?.toObjectId ?? "")).filter(Boolean);
        if (cids.length) {
          const cbr = await hs("/crm/v3/objects/contacts/batch/read", {
            method: "POST", body: JSON.stringify({ inputs: cids.map((id: string) => ({ id })), properties: ["firstname", "lastname", "email"] }),
          });
          const cbj = await cbr.json().catch(() => ({}));
          for (const cx of (cbj?.results ?? [])) {
            const nm = [cx.properties?.firstname, cx.properties?.lastname].filter(Boolean).join(" ").trim().toLowerCase();
            const cur = String(cx.properties?.email ?? "");
            if (cur) continue;
            const hit = owners.find((o) => o.name.toLowerCase() === nm);
            if (hit) await hs(`/crm/v3/objects/contacts/${cx.id}`, { method: "PATCH", body: JSON.stringify({ properties: { email: hit.email } }) }).catch(() => null);
          }
        }
      } catch { /* non-fatal */ }
      return j(headers, 200, { ok: true });
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
        const ownerEmails = feedGateEmails(cr);
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

        // Maintenance and Resident Relations render as one combined section (Brittany 2026-08-03)
        {
          const mi = sections.findIndex((s) => s.key === "maintenance");
          const ri = sections.findIndex((s) => s.key === "residentrelations");
          if (mi > -1 && ri > -1) {
            const m = sections[mi], r = sections[ri];
            m.title = "Maintenance + Resident Relations";
            m.open = [...m.open, ...r.open];
            m.done = [...m.done, ...r.done];
            m.open.sort((a: FeedItem, b: FeedItem) => String(a?.due || "9999").localeCompare(String(b?.due || "9999")));
            m.done.sort((a: FeedItem, b: FeedItem) => String(b?.done ?? "").localeCompare(String(a?.done ?? "")));
            sections.splice(ri, 1);
          }
        }

        // mask the street address and the building nickname wherever staff typed them into titles
        const addrRe = feedAddrRegex(address);
        const nameRe = feedNameRegex(shortName);
        const masked = feedMaskAddr(address, "");
        const clean = (s: string) => {
          let out = s;
          if (addrRe) out = out.replace(addrRe, masked);
          if (nameRe) out = out.replace(nameRe, "");
          out = out.replace(/\s{2,}/g, " ").replace(/^[\s\-–—:,]+/, "").trim();
          return out ? out.charAt(0).toUpperCase() + out.slice(1) : out;
        };
        if (addrRe || nameRe) {
          for (const sec of sections) {
            for (const it of [...sec.open, ...sec.done]) {
              const rec = it as unknown as Record<string, unknown>;
              if (!rec) continue;
              rec.label = clean(String(rec.label ?? "")) || "Property item";
              if (rec.info) rec.info = clean(String(rec.info));
            }
          }
        }

        // leasing lifecycle steps: Pre Move Out / Move Out / Turn Over / Lease Up /
        // Move In (child of LU) / Process Deposit, each with due date + done state
        const leaseItems: { gid: string; item: Record<string, unknown> }[] = [];
        for (const sec of sections) {
          if (sec.key !== "leasing") continue;
          for (const it of sec.open) {
            const rec = it as unknown as Record<string, unknown>;
            if (rec && rec.gid) leaseItems.push({ gid: String(rec.gid), item: rec });
          }
        }
        const subLists = await Promise.all(leaseItems.map((x) =>
          asana("GET", `/tasks/${x.gid}/subtasks?opt_fields=gid,name,due_on,completed&limit=30`).catch(() => [])));
        const luFetches: { itemIdx: number; promise: Promise<unknown> }[] = [];
        const stepsByItem: { label: string; due: string; done: boolean }[][] = leaseItems.map(() => []);
        subLists.forEach((subs, idx) => {
          for (const s of (subs ?? []) as { gid?: unknown; name?: unknown; due_on?: unknown; completed?: boolean }[]) {
            const head = String(s.name ?? "").split(/[|<]/)[0].trim();
            for (const [re, label] of FEED_LEASE_STEPS) {
              if (!re.test(head)) continue;
              stepsByItem[idx].push({ label, due: String(s.due_on ?? ""), done: s.completed === true });
              if (label === "Lease Up") luFetches.push({ itemIdx: idx, promise: asana("GET", `/tasks/${String(s.gid)}/subtasks?opt_fields=name,due_on,completed&limit=40`).catch(() => []) });
              break;
            }
          }
        });
        const luChildren = await Promise.all(luFetches.map((f) => f.promise));
        luFetches.forEach((f, i) => {
          const mi = ((luChildren[i] ?? []) as { name?: unknown; due_on?: unknown; completed?: boolean }[])
            .find((s) => /^move[\s-]*in/i.test(String(s.name ?? "").trim()));
          if (mi) stepsByItem[f.itemIdx].push({ label: "Move In", due: String(mi.due_on ?? ""), done: mi.completed === true });
        });
        const STEP_ORDER = ["Pre Move Out", "Move Out", "Turn Over", "Lease Up", "Move In", "Process Deposit"];
        leaseItems.forEach((x, idx) => {
          const steps = stepsByItem[idx];
          steps.sort((a, b) => STEP_ORDER.indexOf(a.label) - STEP_ORDER.indexOf(b.label));
          if (steps.length) x.item.steps = steps;
          delete x.item.gid;
        });

        // inspection report attachments (Multifamily reports live on the tasks today;
        // Annual items light up automatically if staff start attaching reports)
        const inspItems: { gid: string; item: Record<string, unknown> }[] = [];
        for (const sec of sections) {
          if (sec.key !== "annualinspection" && sec.key !== "mfinspection") continue;
          for (const it of [...sec.open, ...sec.done]) {
            const rec = it as unknown as Record<string, unknown>;
            if (rec && rec.gid) inspItems.push({ gid: String(rec.gid), item: rec });
          }
        }
        const attLists = await Promise.all(inspItems.map((x) =>
          asana("GET", `/tasks/${x.gid}/attachments?opt_fields=gid,name`).catch(() => [])));
        inspItems.forEach((x, idx) => {
          const reps = ((attLists[idx] ?? []) as { gid?: unknown; name?: unknown }[])
            .map((a) => {
              // attachment filenames carry the full address; owners get a generic label + date
              const dm = String(a.name ?? "").match(/\d{4}-\d{2}-\d{2}/);
              return { gid: String(a.gid ?? ""), name: "Inspection Report" + (dm ? " " + dm[0] : "") };
            })
            .filter((a) => a.gid);
          if (reps.length) x.item.reports = reps;
          delete x.item.gid;
        });

        const propFields = psFull ? feedFields(psFull.custom_fields ?? []) : [];
        const units = (psSubs ?? []).map((s: { gid?: unknown; name?: unknown; custom_fields?: unknown[] }) => ({
          taskGid: String(s.gid ?? ""),
          unit: feedUnitFromName(String(s.name ?? "")),
          fields: feedFields((s.custom_fields ?? []) as Record<string, unknown>[]),
        })).sort((a: { unit: string }, b: { unit: string }) => a.unit.localeCompare(b.unit, undefined, { numeric: true }));

        // unit count: Property Settings "Unit #" is the source of truth (Brittany 2026-08-01);
        // the CR-task Unit Count and the subtask count are fallbacks only
        const psCf: Record<string, string> = {};
        for (const c of ((psFull?.custom_fields ?? []) as { name?: unknown; display_value?: unknown }[])) {
          psCf[String(c.name)] = String(c.display_value ?? "").trim();
        }
        return j(headers, 200, {
          ok: true,
          property: {
            // building nickname withheld from the page entirely (Brittany 2026-08-01)
            shortName: "", address: feedMaskAddr(address, city), city, propertyId: pid,
            units: psCf["Unit #"] || crCf["Unit Count"] || String((psSubs ?? []).length || ""),
            commSettings: (crCf["Communication Settings"] || "").split(",").map((s: string) => s.trim()).filter(Boolean),
            ownerNames: feedOwnerNames(String(cr.notes ?? "")),
          },
          totals: { open: totOpen, done: totDone },
          sections,
          settings: ps ? { taskGid: String(ps.gid), fields: propFields, units } : null,
        });
      } catch { return j(headers, 200, { ok: false, error: "load_failed" }); }
    }

    // ---------- feedFeedback: owner feedback -> subtask under the (CLIENT) task ----------
    if (action === "feedFeedback") {
      const pid = String(body.propertyId ?? "").replace(/\D/g, "").slice(0, 12);
      const email = String(body.email ?? "").trim().toLowerCase().slice(0, 200);
      const text = String(body.text ?? "").trim().slice(0, 4000);
      if (!pid || !/@.+\./.test(email) || text.length < 5) return j(headers, 200, { ok: false, error: "verify" });
      const enc = encodeURIComponent;
      try {
        const crRes = await asana("GET", `/workspaces/${FEED_WS}/tasks/search?projects.any=${FEED_CR}&custom_fields.${FEED_PID_FIELD}.value=${enc(pid)}&opt_fields=gid,name,notes,custom_fields.name,custom_fields.display_value&limit=2`).catch(() => []);
        const cr = (crRes ?? [])[0];
        if (!cr) return j(headers, 200, { ok: false, error: "verify" });
        const ownerEmails = feedGateEmails(cr);
        if (!ownerEmails.includes(email)) return j(headers, 200, { ok: false, error: "verify" });
        const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
        await asana("POST", `/tasks/${cr.gid}/subtasks`, {
          name: `Owner Feed Feedback // ${String(cr.name ?? "").split("//")[0].trim()} // ${today}`,
          assignee: "bb@sagareus.com",
          due_on: today,
          notes: `${text}\n\nSubmitted by the property owner (${email}) through the Owner Feed page. Done by Claude (Owner Feed) on behalf of the owner.`,
        });
        return j(headers, 200, { ok: true });
      } catch { return j(headers, 200, { ok: false, error: "save_failed" }); }
    }

    // ---------- feedReport: gated fetch of an inspection report attachment link ----------
    // The owner clicks View Report; we verify the email gate, confirm the attachment hangs
    // on an inspection task for THIS property, and hand back Asana's signed download URL.
    if (action === "feedReport") {
      const pid = String(body.propertyId ?? "").replace(/\D/g, "").slice(0, 12);
      const email = String(body.email ?? "").trim().toLowerCase().slice(0, 200);
      const attGid = String(body.attGid ?? "").replace(/\D/g, "");
      if (!pid || !/@.+\./.test(email) || !attGid) return j(headers, 200, { ok: false, error: "verify" });
      const enc = encodeURIComponent;
      try {
        const [crRes, psRes] = await Promise.all([
          asana("GET", `/workspaces/${FEED_WS}/tasks/search?projects.any=${FEED_CR}&custom_fields.${FEED_PID_FIELD}.value=${enc(pid)}&opt_fields=gid,name,notes,custom_fields.name,custom_fields.display_value&limit=2`).catch(() => []),
          asana("GET", `/workspaces/${FEED_WS}/tasks/search?projects.any=${FEED_PS}&custom_fields.${FEED_PID_FIELD}.value=${enc(pid)}&is_subtask=false&opt_fields=gid,name&limit=2`).catch(() => []),
        ]);
        const cr = (crRes ?? [])[0];
        if (!cr) return j(headers, 200, { ok: false, error: "verify" });
        const ownerEmails = feedGateEmails(cr);
        if (!ownerEmails.includes(email)) return j(headers, 200, { ok: false, error: "verify" });
        const ps = (psRes ?? [])[0];
        let address = ps ? (String(ps.name ?? "").split("//")[2] ?? "").trim() : "";
        if (!address) address = String(cr.name ?? "").split("//")[0].split(",")[0].trim();
        const att = await asana("GET", `/attachments/${attGid}?opt_fields=name,download_url,parent.gid`);
        const parentGid = String(att?.parent?.gid ?? "");
        const url = String(att?.download_url ?? "");
        if (!parentGid || !/^https:\/\//.test(url)) return j(headers, 200, { ok: false, error: "no_report" });
        const parent = await asana("GET", `/tasks/${parentGid}?opt_fields=name,projects.gid`);
        const inInsp = (parent.projects ?? []).some((pr: { gid?: unknown }) => FEED_INSPECTION_GIDS.has(String(pr.gid)));
        const toks = feedSearchText(address).toLowerCase().split(/\s+/).filter(Boolean);
        const pname = String(parent.name ?? "").toLowerCase();
        const isOurs = toks.length > 0 && toks.every((tk) => pname.includes(tk));
        if (!inInsp || !isOurs) return j(headers, 403, { ok: false, error: "not_allowed" });
        return j(headers, 200, { ok: true, url, name: "Inspection Report" });
      } catch { return j(headers, 200, { ok: false, error: "no_report" }); }
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
          asana("GET", `/workspaces/${FEED_WS}/tasks/search?projects.any=${FEED_CR}&custom_fields.${FEED_PID_FIELD}.value=${enc(pid)}&opt_fields=gid,notes,custom_fields.name,custom_fields.display_value&limit=2`).catch(() => []),
          asana("GET", `/workspaces/${FEED_WS}/tasks/search?projects.any=${FEED_PS}&custom_fields.${FEED_PID_FIELD}.value=${enc(pid)}&is_subtask=false&opt_fields=gid&limit=2`).catch(() => []),
        ]);
        const cr = (crRes ?? [])[0], ps = (psRes ?? [])[0];
        if (!cr || !ps) return j(headers, 200, { ok: false, error: "verify" });
        const ownerEmails = feedGateEmails(cr);
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
        // NO WRITE to settings from the feed (Brittany 2026-08-01): validate the value,
        // then file a review subtask under the (CLIENT) task, exactly like feedback.
        // Staff enters the data; Property/Unit Settings stay staff-only.
        const type = String(cf.type ?? "");
        const val = body.value;
        let shown = "";
        if (type === "text") {
          shown = String(val ?? "").trim().slice(0, 2000);
          if (!shown) return j(headers, 400, { ok: false, error: "bad_value" });
        } else if (type === "number") {
          const n = Number(val);
          if (!Number.isFinite(n)) return j(headers, 400, { ok: false, error: "bad_value" });
          shown = String(n);
        } else if (type === "date") {
          shown = String(val ?? "").trim();
          if (!/^\d{4}-\d{2}-\d{2}$/.test(shown)) return j(headers, 400, { ok: false, error: "bad_value" });
        } else if (type === "enum") {
          const opt = (cf.enum_options ?? []).find((o: { gid?: unknown; name?: unknown; enabled?: boolean }) =>
            o.enabled !== false && (String(o.gid) === String(val) || String(o.name).trim() === String(val ?? "").trim()));
          if (!opt) return j(headers, 400, { ok: false, error: "bad_value" });
          shown = String(opt.name);
        } else if (type === "multi_enum") {
          const wants = (Array.isArray(val) ? val : String(val ?? "").split(";")).map((v) => String(v).trim()).filter(Boolean);
          const names: string[] = [];
          for (const w of wants) {
            const opt = (cf.enum_options ?? []).find((o: { gid?: unknown; name?: unknown; enabled?: boolean }) =>
              o.enabled !== false && (String(o.gid) === w || String(o.name).trim() === w));
            if (!opt) return j(headers, 400, { ok: false, error: "bad_value" });
            names.push(String(opt.name));
          }
          if (!names.length) return j(headers, 400, { ok: false, error: "bad_value" });
          shown = names.join("; ");
        } else return j(headers, 400, { ok: false, error: "bad_value" });
        const um = String(task.name ?? "").match(/#\s*(\w+)/);
        const where = um ? "Unit " + um[1] : "Property";
        const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
        await asana("POST", `/tasks/${cr.gid}/subtasks`, {
          name: `Owner Feed Data Update // ${fname} // ${where} // ${today}`,
          assignee: "bb@sagareus.com",
          due_on: today,
          notes: `The owner submitted a value for a missing settings field through the Owner Feed. Nothing was written; please review and enter it on the settings task.\n\n` +
            `Field: ${fname}\nWhere: ${String(task.name ?? "")} (https://app.asana.com/0/0/${taskGid}/f)\nSubmitted value: ${shown}\n\n` +
            `Submitted by the property owner (${email}) through the Owner Feed page. Done by Claude (Owner Feed) on behalf of the owner.`,
        });
        return j(headers, 200, { ok: true, value: shown });
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
