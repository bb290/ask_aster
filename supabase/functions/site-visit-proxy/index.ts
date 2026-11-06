// Site Visit proxy for the Sagareus weekly site visit widget (saga-site-visit.module).
//
// The widget is a tap-through checklist on an internal page (/site-visit). This
// function holds the Asana PAT server-side (the "Asana Bot" account) and does the
// writes the agents used to do by hand:
//   - action "vacancies": list open vacancies (Leasing | LU project) plus every
//     managed unit (Unit Settings project), so visits work on occupied properties too
//   - action "submit": post the marked-up checklist as a comment on the property's
//     "Weekly Site Visit / Inspection" subtask (created if missing), and create a
//     maintenance subtask on the LU task for every item flagged "create ticket",
//     assigned to the property's Turn Over Coordinator (TO task assignee), due date
//     respecting the Accountability Rule's 72-hour line when a move-in date is set.
//   - action "photo": attach one photo (base64 jpeg) to the inspection subtask.
//
// Secrets: ASANA_PAT (required), SITE_VISIT_KEY (shared team key the widget sends).
// Per the Weekly Site Visit SOP (Outline doc yjZFdeB9EC).
//
// Asana leasing hierarchy (Brittany, 2026-07-22) — do not misread this:
//   Leasing | <address>                <- the MASTER parent task
//     LU | <address> (or PreLease/TP)  <- subtask, multi-homed into Leasing | LU
//     Turn Over | <address>            <- subtask, multi-homed into Leasing | Turn Over
//   Turn Over is a SIBLING of LU under the Leasing parent, never a child of LU.
//   Site Visit + Activity Report anchor to the LU/PreLease sibling; the
//   Inspections tool anchors to the Turn Over sibling.

import { Hono } from "hono";

const ASANA_PAT = Deno.env.get("ASANA_PAT") ?? "";
const TEAM_KEY = Deno.env.get("SITE_VISIT_KEY") ?? "";
const BUILDIUM_ID = Deno.env.get("BUILDIUM_CLIENT_ID") ?? "";
const BUILDIUM_SECRET = Deno.env.get("BUILDIUM_CLIENT_SECRET") ?? "";
const WORKSPACE = "706990140225747";
const LEASING_LU_PROJECT = "1213171756304238";
// Tier 1 combined key-value fields (Brittany 2026-09-26): each replaces 2-3
// singles. Format is "Label: value" lines; values may span lines until the
// next label. Old single fields stay frozen until Brittany deletes them.
const LU_SHOWING_SLOTS = "1218889144475347";  // Slot 1 / Slot 2
const LU_ZR_LINKS = "1218889284185185";       // Zillow / Redfin
const LS_SCREEN_CRIT = "1218889144473591";    // Credit / Income
const LS_INSPECT_LINKS = "1218889284194156";  // Move In / Most Recent / Pre-Move Out
const LS_UTIL_REPORTS = "1218888960689765";   // Flat Fee / Estimated
function kvGet(text: string, label: string): string {
  const re = new RegExp("(?:^|\\n)\\s*" + label + "\\s*:\\s*([\\s\\S]*?)(?=\\n[A-Za-z][A-Za-z0-9 \\-]{0,22}:\\s|$)", "i");
  const m = String(text ?? "").match(re);
  return m ? m[1].trim() : "";
}
// Owner Contact (Tier 2 combine, 2026-09-26): "Name: ... / Email: ..." lines on
// the LU replace Owner Name(s) + Owner e-mail(s), which stay attached to
// Client Relations 2.0 (onboarding writes them there). Combined first, old
// singles as fallback while both exist on the LU.
function ownerFromCf(cf: Array<{ name?: string; display_value?: string | null }>): { name: string; email: string } {
  const oc = String(cf.find((f) => /^owner contact$/i.test(String(f.name ?? "")))?.display_value ?? "");
  const name = kvGet(oc, "Name") || String(cf.find((f) => /owner name/i.test(String(f.name ?? "")))?.display_value ?? "").trim();
  const email = (kvGet(oc, "Email") || String(cf.find((f) => /owner e-?mail/i.test(String(f.name ?? "")))?.display_value ?? "")).replace(/;/g, ",").trim();
  return { name, email };
}
function kvSet(text: string, label: string, value: string, order: string[]): string {
  const parts: Record<string, string> = {};
  for (const lab of order) parts[lab] = kvGet(text, lab);
  parts[label] = value;
  return order.filter((l) => parts[l]).map((l) => `${l}: ${parts[l]}`).join("\n").slice(0, 1024);
}
const UNIT_SETTINGS_PROJECT = "1213032009308835";
const PROPERTY_SETTINGS_PROJECT = "1211134623744906";
// Parking & Storage (Outline "Property Settings" section 6, 2026-10-13): the
// property task's Parking Type / Storage Type line says what the property offers,
// and the unit's own spot ids sit on its lease's Parking / Storage fields in Lease
// Settings. The unit-level Parking and Storage fields were retired 2026-10-17.
const LEASE_SETTINGS_PROJECT = "1213740462278333";
const LEASE_PARKING_F = "1219431287505501";
const LEASE_STORAGE_F = "1219431415139383";
// spot ids the unit's lease holds; open leases first, oldest first, so the
// outgoing lease wins over a future one. Blank on Included / None / no access.
async function leaseSpots(unitId: string): Promise<{ parking: string; storage: string }> {
  const out = { parking: "", storage: "" };
  if (!/^\d+$/.test(unitId)) return out;
  try {
    const r = await fetch(`${ASANA}/workspaces/${WORKSPACE}/tasks/search?projects.any=${LEASE_SETTINGS_PROJECT}&custom_fields.1213183515622826.value=${unitId}&opt_fields=completed,created_at,custom_fields.gid,custom_fields.display_value`,
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
const MAINTENANCE_PROJECT = "1210320631715650"; // Maintenance 2.0
const TURNOVER_PROJECT = "1213171760535170"; // Leasing | Turn Over
// Lead maintenance coordinator; default assignee for occupied-unit and manual-address
// tickets until per-property routing exists (Brittany, 2026-07-17).
const DEFAULT_MAINT = { gid: "1201894870325840", name: "Joylyn De Castro" };
// Outline Staff Directory roles (Brittany 2026-11-06)
const TURNOVER_LEAD = { gid: "1206951145836779", name: "Portia Christopher" };
const OPS_MANAGER = { gid: "706990761463395", name: "Vincent Chen" };
const ASANA = "https://app.asana.com/api/1.0";

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ??
  "https://www.sagareus.com,https://sagareus.com")
  .split(",").map((s) => s.trim()).filter(Boolean);

const app = new Hono();

function corsHeaders(origin: string | undefined): Record<string, string> {
  const allowed = origin && (
    ALLOWED_ORIGINS.includes(origin) ||
    origin.endsWith(".sagareus.com") ||
    origin.endsWith(".hs-sites.com") ||
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

// Amenity Listing Description (Brittany 2026-10-23): found by NAME on the Listing Settings
// project so the bench works the moment the field is attached; cached per instance
let AMEN_FIELD_GID = "1219842423539303";   // "Amenities Listing Description" (created by Brittany 2026-10-23)
async function amenFieldGid(): Promise<string> {
  if (AMEN_FIELD_GID) return AMEN_FIELD_GID;
  try {
    const cs = (await asana("GET", "/projects/1217446710785429/custom_field_settings?opt_fields=custom_field.gid,custom_field.name&limit=100")) as Array<{ custom_field?: { gid?: string; name?: string } }>;
    const hit = (cs ?? []).find((x) => /^\s*amenit(y|ies) listing description\s*$/i.test(String(x?.custom_field?.name ?? "")));
    if (hit?.custom_field?.gid) AMEN_FIELD_GID = String(hit.custom_field.gid);
  } catch { /* not attached yet */ }
  return AMEN_FIELD_GID;
}
async function asana(method: string, path: string, body?: unknown) {
  const res = await fetch(`${ASANA}${path}`, {
    method,
    headers: {
      "Authorization": `Bearer ${ASANA_PAT}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify({ data: body }) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`asana ${method} ${path} -> ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return json.data;
}

// Rich-text story body: escape HTML, wrap URLs in anchors so links are clickable.
function storyHtml(text: string): string {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const linked = escaped.replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}">${u}</a>`);
  return `<body>${linked}</body>`;
}
async function postStory(taskGid: string, text: string) {
  try {
    return await asana("POST", `/tasks/${taskGid}/stories`, { html_text: storyHtml(text) });
  } catch {
    // fall back to plain text if Asana rejects the markup
    return await asana("POST", `/tasks/${taskGid}/stories`, { text });
  }
}

function addressFromTaskName(name: string): string {
  // "LU | 653 Myrtine St #A, Enumclaw - NOTES" -> "653 Myrtine St #A, Enumclaw"
  const afterBar = name.includes("|") ? name.split("|").slice(1).join("|").trim() : name.trim();
  return afterBar.split(" - ")[0].trim();
}

// Address normalization for matching typed addresses against Unit Settings task names
// ("1003 SW 150th St #1, Burien" vs "1003 Southwest 150th Street #1, Burien")
const ADDR_EXPAND: Record<string, string> = {
  st: "street", ave: "avenue", av: "avenue", rd: "road", dr: "drive", blvd: "boulevard",
  pl: "place", ct: "court", ln: "lane", ter: "terrace", hwy: "highway", pkwy: "parkway",
  cir: "circle", n: "north", s: "south", e: "east", w: "west",
  ne: "northeast", nw: "northwest", se: "southeast", sw: "southwest",
};
function addrTokens(s: string): string[] {
  const raw = s.toLowerCase().replace(/[.,]/g, " ").split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    let w = raw[i];
    // "unit 2" / "apt B" / "ste 4" -> "#2" / "#b" / "#4"
    if ((w === "unit" || w === "apt" || w === "ste" || w === "suite") && raw[i + 1]) {
      out.push("#" + raw[++i].replace(/^#/, ""));
      continue;
    }
    w = ADDR_EXPAND[w] ?? w;
    // drop state and zip noise ("wa", "98166"); the leading street number survives (i > 0)
    if (w === "wa" || w === "washington") continue;
    if (i > 0 && /^9\d{4}(-\d{4})?$/.test(w)) continue;
    out.push(w);
  }
  return out;
}
function normAddr(s: string): string {
  return addrTokens(s).join(" ");
}
// Best Unit Settings match for a typed address; "ambiguous" when a multi-unit
// building matches but the typed address doesn't say which unit.
// LU task by Unit ID (Brittany 2026-08-17: Unit ID only, never addresses): search
// Leasing | \u{1F916} by the Unit ID field, prefer the open LU/TP/PreLease task, else walk
// down from the Leasing task's subtasks.
async function luByUnitId(uid: string): Promise<{ gid: string; name: string } | null> {
  if (!/^\d+$/.test(uid)) return null;
  const LEASING_ROBOT_PROJECT = "1213171758682884";
  try {
    const list = ((await asana("GET",
      `/workspaces/${WORKSPACE}/tasks/search?projects.any=${LEASING_ROBOT_PROJECT}&custom_fields.1213183515622826.value=${uid}&opt_fields=name,completed`)) ?? []) as Array<{ gid: string; name: string; completed?: boolean }>;
    // An OPEN direct hit wins. A completed one does NOT: on a re-lease the prior
    // cycle's LU still carries the Unit ID while the CURRENT cycle's subtasks carry
    // none, so a completed hit returns last year's task (Brittany 2026-08-22).
    const lus = list.filter((t) => /^(LU|TP|PreLease)\s*\|/i.test(t.name));
    const openLu = lus.find((t) => !t.completed);
    if (openLu) return openLu;
    const leasing = list.filter((t) => /^leasing\s*\|/i.test(t.name)).find((t) => !t.completed)
      ?? list.find((t) => /^leasing\s*\|/i.test(t.name));
    if (leasing) {
      const subs = ((await asana("GET", `/tasks/${leasing.gid}/subtasks?limit=100&opt_fields=name,completed`)) ?? []) as Array<{ gid: string; name: string; completed?: boolean }>;
      const sl = subs.filter((s) => /^(LU|TP|PreLease)\s*\|/i.test(s.name));
      const openSub = sl.find((s) => !s.completed);
      if (openSub) return openSub;
    }
    if (lus[0]) return lus[0];
    // Asana workspace search lags on NEW tasks (Norton Ave batch, 2026-09-07):
    // fall back to the paged Leasing-master index, which never depends on search
    try {
      const idx = await moveOutIndex();
      const mg = idx.masterByUid[uid];
      if (mg) {
        const subs2 = ((await asana("GET", `/tasks/${mg}/subtasks?limit=100&opt_fields=name,completed`)) ?? []) as Array<{ gid: string; name: string; completed?: boolean }>;
        const sl2 = subs2.filter((s2) => /^(LU|TP|PreLease)\s*\|/i.test(s2.name));
        return sl2.find((s2) => !s2.completed) ?? sl2[0] ?? null;
      }
    } catch { /* fall through */ }
    return null;
  } catch { return null; }
}

function matchUnit(units: Array<{ gid: string; address: string }>, typed: string):
  { hit?: { gid: string; address: string }; ambiguous?: string[] } {
  const t = addrTokens(typed);
  if (!t.length) return {};
  const target = t.join(" ");
  const exact = units.find((u) => normAddr(u.address) === target);
  if (exact) return { hit: exact };
  // conflicting unit markers are a hard reject: "#21" must never fuzzy-match "#33B"
  // (2026-08-25 bug: a visit for 304 Bell St #21 filed on #33B's Turn Over because
  // #21's was completed and the missing<=1 rule saw #33B as one token off)
  const tMark = t.find((w) => w.startsWith("#"));
  const candidates = units.filter((u) => {
    const ut = addrTokens(u.address);
    if (ut[0] !== t[0]) return false;
    const uMark = ut.find((w) => w.startsWith("#"));
    if (tMark && uMark && tMark !== uMark) return false;
    const set = new Set(ut);
    const missing = t.filter((w) => !set.has(w)).length;
    return missing <= 1;
  });
  if (candidates.length === 1) return { hit: candidates[0] };
  if (candidates.length > 1) {
    // all the same building, different units? surface the unit markers
    const markers = candidates.map((c) => (c.address.match(/#[^\s,]+/) ?? ["?"])[0]);
    return { ambiguous: markers.slice(0, 8) };
  }
  return {};
}

// The weekly inspection subtask, never a dated "Site Visit YYYY-MM-DD | ..." issue
// task (2026-08-25 bug: a legacy dated task sorted ahead of the real subtask and
// swallowed the checklist comment, so visits "didn't show up").
function findInspectionSub<T extends { name: string }>(subs: T[]): T | undefined {
  const dated = (n: string) => /^site\s*visit\s+\d{4}-\d{2}-\d{2}/i.test(n);
  return subs.find((s) => /weekly\s*site\s*visit/i.test(s.name)) ??
         subs.find((s) => /site\s*visit/i.test(s.name) && !dated(s.name)) ??
         subs.find((s) => /inspect/i.test(s.name) && !dated(s.name));
}

// Buildium bed/bath enums ("TwoBed", "OnePointFiveBath", "Studio") -> numbers
function bedBathNum(s: string | null | undefined): number | null {
  if (!s) return null;
  if (/studio/i.test(s)) return 0;
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
  const m = String(s).match(/^(one|two|three|four|five|six|seven|eight|nine)/i);
  if (!m) return null;
  let n = words[m[1].toLowerCase()];
  if (/pointfive/i.test(s)) n += 0.5;
  return n;
}

// "Tuesday 10-11am" / "Tues @ 2pm" -> 0-6 (Sunday-Saturday), or null if no weekday found
function weekdayFromText(text: string): number | null {
  const m = text.match(/\b(sun|mon|tues?|wed(?:nes)?|thur?s?|fri|sat(?:ur)?)(?:day)?s?\b/i);
  if (!m) return null;
  const key = m[1].slice(0, 3).toLowerCase();
  return { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }[key] ?? null;
}

function addressFromSettingsName(name: string): string {
  // "Settings // 2813 Southwest 28th Street, Redmond" -> "2813 Southwest 28th Street, Redmond".
  // Status tags sometimes ride the name ("Settings // OFF BOARDING // 16162 126th
  // Ave SE, Renton" hid unit 439659 from the pickers, 2026-10-02), so the address
  // starts at the first "//" segment that begins with a digit; names without a
  // digit-leading segment keep the old everything-after-the-prefix behavior.
  const segs = name.split("//").slice(1).map((s) => s.trim()).filter(Boolean);
  const addrAt = segs.findIndex((s) => /^\d/.test(s));
  return (addrAt >= 0 ? segs.slice(addrAt) : segs).join(" // ").trim();
}

// Leasing vacancies via paged project listing, NOT workspace search: search caps at 100
// results by recent modification, so bot-driven bulk edits push the real LU/TP/PreLease
// tasks out of the window and the picker mysteriously shrinks (seen 2026-07-18).
//
// One list for BOTH the Site Visit and Activity Report pickers (Brittany,
// 2026-07-22): every open LU/TP/PreLease task, PLUS tasks closed within the past
// 60 days. The 🙌 Move in Date field is the guide — any task (open or closed)
// whose move-in date has passed drops out, unless a MOVE-IN subtask is still
// open (delayed move-in). Lease signed -> the task closes, but site visits and
// weekly reports keep running to its subtasks until the resident moves in
// (activity continues in the Move In // task). No date = keep for the window.
// When an open and a recently-closed task share an address, the open one wins.
let luCache: { at: number; all: Array<{ gid: string; address: string }>; active: Array<{ gid: string; address: string }> } | null = null;

async function allVacancies(includeLeased = false): Promise<Array<{ gid: string; address: string }>> {
  if (luCache && Date.now() - luCache.at < 2 * 60 * 1000) return includeLeased ? luCache.all : luCache.active;
  const since = new Date(Date.now() - 60 * 86400000).toISOString();
  const today = new Date(Date.now() - 7 * 3600 * 1000).toISOString().slice(0, 10); // Seattle-ish
  type Cand = { gid: string; address: string; completed: boolean; miPassed: boolean };
  const cands: Cand[] = [];
  let offset = "";
  for (let page = 0; page < 12; page++) {
    const res = await fetch(
      `${ASANA}/projects/${LEASING_LU_PROJECT}/tasks?completed_since=${encodeURIComponent(since)}&limit=100&opt_fields=name,completed,custom_fields.gid,custom_fields.display_value${offset ? `&offset=${encodeURIComponent(offset)}` : ""}`,
      { headers: { "Authorization": `Bearer ${ASANA_PAT}` } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`asana lu page ${page} -> ${res.status}`);
    for (const t of (json.data ?? []) as Array<{ gid: string; name: string; completed?: boolean; custom_fields?: Array<{ gid: string; display_value?: string | null }> }>) {
      if (!/^(LU|TP|PreLease)\s*\|/i.test(t.name)) continue;
      const address = addressFromTaskName(t.name);
      if (!address || address.includes("<")) continue;
      const mi = (t.custom_fields ?? []).find((f) => f.gid === "1213183520317831")?.display_value; // 🙌 Move in Date
      let miPassed = false;
      if (mi) {
        const d = new Date(mi);
        miPassed = !isNaN(d.getTime()) && d.toISOString().slice(0, 10) < today;
      }
      cands.push({ gid: t.gid, address, completed: Boolean(t.completed), miPassed });
    }
    offset = json.next_page?.offset ?? "";
    if (!offset) break;
  }
  // Delayed move-in keep signal: an open MOVE-IN subtask keeps the task listed
  // even when the Move in Date field is already past.
  const moveInOpen = new Set<string>();
  try {
    const moveins = await asana("GET",
      `/workspaces/${WORKSPACE}/tasks/search?projects.any=${LEASING_LU_PROJECT}&completed=false&text=${encodeURIComponent("move in")}&limit=100&opt_fields=name,parent.gid`);
    (moveins ?? []).forEach((t: { name: string; parent?: { gid: string } | null }) => {
      if (/^move[\s-]*in/i.test(t.name) && t.parent?.gid) moveInOpen.add(t.parent.gid);
    });
  } catch { /* fail open: nothing extra dropped */ }
  const live = cands.filter((c) => !c.miPassed || moveInOpen.has(c.gid));
  const open = live.filter((c) => !c.completed);
  const openAddrs = new Set(open.map((v) => normAddr(v.address)));
  const list = open
    .concat(live.filter((c) => c.completed && !openAddrs.has(normAddr(c.address))))
    .map((c) => ({ gid: c.gid, address: c.address }))
    .sort((a, b) => a.address.localeCompare(b.address));
  luCache = { at: Date.now(), all: list, active: list };
  return list;
}

// ---------- Execute & Adapt helpers (Phase 2, 2026-08-26) ----------
// Weekly reports live as stories on the LU's Weekly Activity Report subtask. Agent
// reports are prefixed "WEEKLY ACTIVITY REPORT" (plain ASCII, set by the WAR widget);
// owner email copies are prefixed "OWNER REPORT SENT". The weekly metric series is
// DERIVED from those stories - the three LU number fields hold only cumulative totals
// (they are number fields; Brittany wants total + weekly breakdown, 2026-08-26).
function parseWarMetrics(text: string): { inquiries: number; showings: number; applications: number } | null {
  const one = (re: RegExp) => { const m = text.match(re); return m ? Number(m[1]) : null; };
  const iq = one(/(?:^|\n)\s*\[metrics\][^\n]*inquiries=(\d+)/i) ?? one(/(?:^|\n)\s*Inquiries:\s*(\d+)/i);
  const sh = one(/(?:^|\n)\s*\[metrics\][^\n]*showings=(\d+)/i) ?? one(/(?:^|\n)\s*Showings:\s*(\d+)/i);
  const ap = one(/(?:^|\n)\s*\[metrics\][^\n]*applications=(\d+)/i) ?? one(/(?:^|\n)\s*Applications:\s*(\d+)/i);
  if (iq == null && sh == null && ap == null) return null;
  return { inquiries: iq ?? 0, showings: sh ?? 0, applications: ap ?? 0 };
}
// Asana stories come back OLDEST first, 100 per page: on a long-lived task the
// newest comments live on the LAST page, so a single limit=100 read silently
// freezes "recent comments" months in the past (422789 Turn Over bug,
// Brittany 2026-09-10). Always walk to the end.
async function allStories(taskGid: string, fields: string): Promise<Array<Record<string, unknown>>> {
  const out: Array<Record<string, unknown>> = [];
  let off = "";
  for (let pg = 0; pg < 15; pg++) {
    const r = await fetch(`${ASANA}/tasks/${taskGid}/stories?limit=100&opt_fields=${fields}${off ? `&offset=${encodeURIComponent(off)}` : ""}`,
      { headers: { "Authorization": `Bearer ${ASANA_PAT}` } });
    const jj = await r.json().catch(() => ({}));
    if (!r.ok) break;
    out.push(...((jj.data ?? []) as Array<Record<string, unknown>>));
    off = jj.next_page?.offset ?? "";
    if (!off) break;
  }
  return out;
}
async function warReportStories(warGid: string): Promise<Array<{ text: string; createdAt: string }>> {
  const stories = await allStories(warGid, "type,text,created_at");
  return ((stories ?? []) as Array<{ type: string; text?: string; created_at?: string }>)
    .filter((s) => s.type === "comment")
    .map((s) => ({ text: String(s.text ?? ""), createdAt: String(s.created_at ?? "") }))
    .filter((s) => /^WEEKLY ACTIVITY REPORT/i.test(s.text.trim()) && !/^OWNER REPORT SENT/i.test(s.text.trim()));
}
function warSeriesBuild(reports: Array<{ text: string; createdAt: string }>) {
  const rows = reports
    .map((r) => ({ m: parseWarMetrics(r.text), at: r.createdAt }))
    .filter((r): r is { m: { inquiries: number; showings: number; applications: number }; at: string } => r.m != null)
    .sort((a, b) => a.at.localeCompare(b.at));
  const sum = (k: "inquiries" | "showings" | "applications") => rows.reduce((a, r) => a + r.m[k], 0);
  return {
    series: {
      inquiries: rows.map((r) => r.m.inquiries),
      showings: rows.map((r) => r.m.showings),
      applications: rows.map((r) => r.m.applications),
    },
    totals: { inquiries: sum("inquiries"), showings: sum("showings"), applications: sum("applications") },
    dates: rows.map((r) => r.at.slice(0, 10)),
  };
}
// Cumulative totals onto the LU's three number fields. Gids resolved off the task by
// name, one field per PUT, fail-soft - never create or attach a field (standing rule).
async function writeLuMetrics(taskGid: string, totals: { inquiries: number; showings: number; applications: number }): Promise<string[]> {
  const t = await asana("GET", `/tasks/${taskGid}?opt_fields=custom_fields.gid,custom_fields.name`);
  const cf = (t.custom_fields ?? []) as Array<{ gid: string; name: string }>;
  const findF = (re: RegExp) => cf.find((f) => re.test(String(f.name)))?.gid ?? "";
  const written: string[] = [];
  const pairs: Array<[RegExp, "inquiries" | "showings" | "applications"]> = [
    [/#\s*of\s*inquiries/i, "inquiries"], [/#\s*of\s*showings/i, "showings"], [/#\s*of\s*applications/i, "applications"],
  ];
  for (const [re, k] of pairs) {
    const g = findF(re);
    if (!g) continue;
    try { await asana("PUT", `/tasks/${taskGid}`, { custom_fields: { [g]: totals[k] } }); written.push(k); }
    catch { /* per-field, keep going */ }
  }
  return written;
}
let execCache: { at: number; payload: unknown } | null = null;
// Vacancy gate (Brittany 2026-08-27): a unit is on the vacant list only POST move-out,
// pre move-in. The scheduled move-out date usually lives on the "Leasing |" master,
// not the LU task, so the queues join against a master index.
let moIdxCache: { at: number; byUid: Record<string, string>; byAddr: Record<string, string>; uidByAddr: Record<string, string>; doneByUid: Record<string, string>; doneByAddr: Record<string, string>; masterByUid: Record<string, string>; moProjByUid: Record<string, string>; moProjByAddr: Record<string, string> } | null = null;
async function moveOutIndex(): Promise<{ byUid: Record<string, string>; byAddr: Record<string, string>; uidByAddr: Record<string, string>; doneByUid: Record<string, string>; doneByAddr: Record<string, string>; masterByUid: Record<string, string>; moProjByUid: Record<string, string>; moProjByAddr: Record<string, string> }> {
  if (moIdxCache && Date.now() - moIdxCache.at < 2 * 60 * 1000) return moIdxCache;
  const byUid: Record<string, string> = {};
  const byAddr: Record<string, string> = {};
  // Unit ID lives on the Leasing MASTER, never the subtasks (Brittany 2026-08-28):
  // every consumer resolves it by walking up via this map
  const uidByAddr: Record<string, string> = {};
  // Move Out Completion on the master: new properties vacant from day one have
  // this but no Tenant Move-Out (486067, 2026-09-03) - it marks them vacant
  const doneByUid: Record<string, string> = {};
  const doneByAddr: Record<string, string> = {};
  const masterByUid: Record<string, string> = {};
  const openMaster: Record<string, { uid: string; addr: string }> = {};
  // 🙌 Move Out Completion Date on the Leasing | Move-Out task is the source of truth
  // (Brittany 2026-10-24): once it is filled, the unit is officially in Turn Over
  const moProjByUid: Record<string, string> = {};
  const moProjByAddr: Record<string, string> = {};
  let off = "";
  for (let pg = 0; pg < 12; pg++) {
    const r0 = await fetch(`${ASANA}/projects/1213171758682884/tasks?completed_since=now&limit=100&opt_fields=name,custom_fields.gid,custom_fields.display_value${off ? `&offset=${encodeURIComponent(off)}` : ""}`,
      { headers: { "Authorization": `Bearer ${ASANA_PAT}` } });
    const j0 = await r0.json().catch(() => ({}));
    for (const t of (j0.data ?? []) as Array<{ gid: string; name: string; custom_fields?: Array<{ gid: string; display_value: string | null }> }>) {
      if (!/^leasing\s*\|/i.test(t.name)) continue;
      const cf = t.custom_fields ?? [];
      const mo = String(cf.find((f) => f.gid === "1213182815411738")?.display_value ?? "").slice(0, 10);
      const done = String(cf.find((f) => f.gid === "1214521745467158")?.display_value ?? "").slice(0, 10);
      const uid = String(cf.find((f) => f.gid === "1213183515622826")?.display_value ?? "").trim();
      const addr = addressFromTaskName(t.name.replace(/^leasing\s*\|\s*/i, "Leasing | "));
      if (uid && addr) uidByAddr[normAddr(addr)] = uid;
      if (uid) masterByUid[uid] = t.gid;
      openMaster[t.gid] = { uid, addr };
      if (/^\d{4}-\d{2}-\d{2}$/.test(done)) {
        if (uid) doneByUid[uid] = done;
        if (addr) doneByAddr[normAddr(addr)] = done;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(mo)) continue;
      if (uid) byUid[uid] = mo;
      if (addr) byAddr[normAddr(addr)] = mo;
    }
    off = j0.next_page?.offset ?? "";
    if (!off) break;
  }
  // Move-Out tasks are subtasks of the open Leasing master (no Unit ID of their own):
  // join through the parent. Masters already closed are not indexed, so a past
  // cycle's completion date cannot leak in.
  try {
    const since = new Date(Date.now() - 120 * 86400000).toISOString();
    let offM = "";
    for (let pg = 0; pg < 12; pg++) {
      const rM = await fetch(`${ASANA}/projects/1213171760534561/tasks?completed_since=${encodeURIComponent(since)}&limit=100&opt_fields=name,parent.gid,parent.name,custom_fields.gid,custom_fields.display_value${offM ? `&offset=${encodeURIComponent(offM)}` : ""}`,
        { headers: { "Authorization": `Bearer ${ASANA_PAT}` } });
      const jM = await rM.json().catch(() => ({}));
      for (const t of (jM.data ?? []) as Array<{ gid: string; name: string; parent?: { gid?: string; name?: string } | null; custom_fields?: Array<{ gid: string; display_value: string | null }> }>) {
        const dM = String((t.custom_fields ?? []).find((f) => f.gid === "1214521745467158")?.display_value ?? "").slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dM)) continue;
        const m0 = openMaster[String(t.parent?.gid ?? "")];
        if (!m0) continue;   // not under an open Leasing master
        if (m0.uid && (!moProjByUid[m0.uid] || dM > moProjByUid[m0.uid])) moProjByUid[m0.uid] = dM;
        if (m0.addr) { const a0 = normAddr(m0.addr); if (!moProjByAddr[a0] || dM > moProjByAddr[a0]) moProjByAddr[a0] = dM; }
      }
      offM = jM.next_page?.offset ?? "";
      if (!offM) break;
    }
  } catch { /* Move-Out project unreadable: the master / LU completion dates still apply */ }
  moIdxCache = { at: Date.now(), byUid, byAddr, uidByAddr, doneByUid, doneByAddr, masterByUid, moProjByUid, moProjByAddr };
  return moIdxCache;
}
let warqCache: { at: number; payload: unknown } | null = null;

// The unit list barely changes; cache it in the warm instance so the picker loads fast.
let unitCache: { at: number; units: Array<{ gid: string; address: string }> } | null = null;
let propCache: { at: number; units: Array<{ gid: string; address: string }> } | null = null;
async function settingsTasks(project: string): Promise<Array<{ gid: string; address: string }>> {
  const units: Array<{ gid: string; address: string }> = [];
  let offset = "";
  for (let page = 0; page < 12; page++) {
    const res = await fetch(
      `${ASANA}/projects/${project}/tasks?completed_since=now&limit=100&opt_fields=name${offset ? `&offset=${encodeURIComponent(offset)}` : ""}`,
      { headers: { "Authorization": `Bearer ${ASANA_PAT}` } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`asana settings page ${page} -> ${res.status}`);
    for (const t of (json.data ?? []) as Array<{ gid: string; name: string }>) {
      if (/^settings\s*\/\//i.test(t.name)) units.push({ gid: t.gid, address: addressFromSettingsName(t.name) });
    }
    offset = json.next_page?.offset ?? "";
    if (!offset) break;
  }
  units.sort((a, b) => a.address.localeCompare(b.address));
  return units;
}
let teamUsersCache: { at: number; users: Array<{ gid: string; name: string }> } | null = null;
async function workspaceUsers(): Promise<Array<{ gid: string; name: string }>> {
  if (teamUsersCache && Date.now() - teamUsersCache.at < 10 * 60 * 1000) return teamUsersCache.users;
  const list = ((await asana("GET", `/users?workspace=${WORKSPACE}&limit=100&opt_fields=name`)) ?? []) as Array<{ gid: string; name: string }>;
  const users = list.map((u) => ({ gid: String(u.gid), name: String(u.name ?? "") }))
    .filter((u) => u.name && !/@/.test(u.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  teamUsersCache = { at: Date.now(), users };
  return users;
}
async function allUnits(): Promise<Array<{ gid: string; address: string }>> {
  if (unitCache && Date.now() - unitCache.at < 5 * 60 * 1000) return unitCache.units;
  const units = await settingsTasks(UNIT_SETTINGS_PROJECT);
  unitCache = { at: Date.now(), units };
  return units;
}
// Single-unit properties have no Unit Settings task; their Unit ID lives on the
// Property Settings task instead (same "Settings // <address>" naming, same field).
async function allPropSettings(): Promise<Array<{ gid: string; address: string }>> {
  if (propCache && Date.now() - propCache.at < 5 * 60 * 1000) return propCache.units;
  const units = await settingsTasks(PROPERTY_SETTINGS_PROJECT);
  propCache = { at: Date.now(), units };
  return units;
}
// Property Settings match by address. Property task names may cover several street
// numbers ("9315, 9317, 9319 51st Ave S"), so the plain matcher's first-token rule
// misses: accept when the unit's street number appears among the property's numbers
// and the street tokens line up (longest name wins).
function matchPropByAddress(plist: Array<{ gid: string; address: string }>, address: string): { gid: string; address: string } | null {
  const direct = matchUnit(plist, address).hit;
  if (direct) return direct;
  const tt = addrTokens(address);
  if (!tt.length || !/^\d+$/.test(tt[0])) return null;
  const tset = new Set(tt);
  // A candidate name (or, for named buildings like "Garden Apartments // Seattle //
  // 1320 14th Ave S // 1319 15th Ave S", any of its "//" segments) matches when the
  // unit's street number appears among its numbers and the street tokens line up.
  const segOk = (seg: string) => {
    const ut = addrTokens(seg);
    if (ut.length < 2) return false;
    if (!ut.filter((w) => /^\d+$/.test(w)).includes(tt[0])) return false;
    const rest = ut.filter((w) => !/^\d+$/.test(w) && !w.startsWith("#"));
    return rest.length > 0 && rest.filter((w) => !tset.has(w)).length <= 1;
  };
  const cands = plist.filter((u) =>
    segOk(u.address) || String(u.address).split("//").some((seg) => segOk(seg))
  ).sort((a, b) => addrTokens(b.address).length - addrTokens(a.address).length);
  return cands[0] ?? null;
}

// Unit Settings first (multi-unit); Property Settings fallback (single-unit).
async function matchSettings(address: string): Promise<{ hit?: { gid: string; address: string }; ambiguous?: string[] }> {
  let m = matchUnit(await allUnits(), address);
  if (!m.hit && !m.ambiguous) m = matchUnit(await allPropSettings(), address);
  return m;
}

// Maintenance 2.0: occupied-property and unlisted-address visits anchor to a
// standalone "Site Visits // <address>" task in the maintenance project
// (Brittany, 2026-07-22; replaced the short-lived Client Relations anchoring
// the same day). Maintenance coordinators work out of this project, and the
// address in the task and ticket names tells them which property it belongs to.
let toCache: { at: number; tasks: Array<{ gid: string; address: string }> } | null = null;
let toOpenCache: { at: number; tasks: Array<{ gid: string; address: string; completed: boolean }> } | null = null;
// Open turn overs plus those completed in the last 90 days: site-visit issue tasks
// file under the Turn Over even when it is already complete, and the visit reopens
// it (Brittany 2026-08-21). Open tasks are preferred when both exist for an address.
async function turnOverTasks(): Promise<Array<{ gid: string; address: string; completed: boolean }>> {
  if (toOpenCache && Date.now() - toOpenCache.at < 2 * 60 * 1000) return toOpenCache.tasks;
  const since = new Date(Date.now() - 90 * 86400000).toISOString();
  const tasks: Array<{ gid: string; address: string; completed: boolean }> = [];
  let off = "";
  for (let page = 0; page < 12; page++) {
    const res = await fetch(
      `${ASANA}/projects/${TURNOVER_PROJECT}/tasks?completed_since=${encodeURIComponent(since)}&limit=100&opt_fields=name,completed${off ? `&offset=${encodeURIComponent(off)}` : ""}`,
      { headers: { "Authorization": `Bearer ${ASANA_PAT}` } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`asana turnover page ${page} -> ${res.status}`);
    for (const t of (json.data ?? []) as Array<{ gid: string; name: string; completed?: boolean }>) {
      if (!/^turn\s*over\s*\|/i.test(t.name)) continue;
      const address = addressFromTaskName(t.name);
      if (address && !address.includes("<")) tasks.push({ gid: t.gid, address, completed: Boolean(t.completed) });
    }
    off = json.next_page?.offset ?? "";
    if (!off) break;
  }
  toOpenCache = { at: Date.now(), tasks };
  return tasks;
}
let moVendorCache: { at: number; vendors: Array<{ name: string; email: string }> } | null = null;
let moUsersCache: { at: number; users: Array<{ name: string; email: string }> } | null = null;
let maintVisitCache: { at: number; recs: Array<{ gid: string; address: string }> } | null = null;
async function maintVisitTasks(): Promise<Array<{ gid: string; address: string }>> {
  if (maintVisitCache && Date.now() - maintVisitCache.at < 5 * 60 * 1000) return maintVisitCache.recs;
  const recs: Array<{ gid: string; address: string }> = [];
  let offset = "";
  for (let page = 0; page < 12; page++) {
    const res = await fetch(
      `${ASANA}/projects/${MAINTENANCE_PROJECT}/tasks?completed_since=now&limit=100&opt_fields=name${offset ? `&offset=${encodeURIComponent(offset)}` : ""}`,
      { headers: { "Authorization": `Bearer ${ASANA_PAT}` } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`asana maintenance page ${page} -> ${res.status}`);
    for (const t of (json.data ?? []) as Array<{ gid: string; name: string }>) {
      if (/^site\s*visits?\s*\/\//i.test(t.name)) {
        const address = t.name.split("//").slice(1).join("//").trim();
        if (address) recs.push({ gid: t.gid, address });
      }
    }
    offset = json.next_page?.offset ?? "";
    if (!offset) break;
  }
  maintVisitCache = { at: Date.now(), recs };
  return recs;
}

// ---------- Lookup (saga-lookup widget, Brittany 2026-10-20) ----------
// Read-only unit details for leasing + ops in the field. The whole tool sits
// behind one shared password (LOOKUP_PASSWORD secret): lkUnlock trades it for a
// signed 15-minute token (was 12 hours; Brittany 2026-10-23, in case a phone is lost), and lkList / lkUnit return nothing without one, so the
// public team key in /field page source never exposes unit data. The keybox code
// and unit status ride behind the same token. Field source rules come from the
// Outline "Property Settings" doc: unit task first, property task when the unit
// field is blank (single-family: the property task is the unit), lease fields
// from the unit's Lease Settings task, keybox from the Leasing parent's
// [Onsite] Key Box (its only home, Brittany 2026-09-15). Never returns client
// fields (fees, communication, termination), Owner Preferences, Housing
// Authority, Pass Through %, or resident names.
const LOOKUP_PASSWORD = Deno.env.get("LOOKUP_PASSWORD") ?? "";
const LK_TTL_MS = 15 * 60 * 1000;
const LK_KEYBOX_F = "1218512667092355"; // [Onsite] Key Box on the Leasing parent
const LK_UNIT_ID_F = "1213183515622826";
const LK_PROP_ID_F = "1213183108704512"; // Property ID (Settings tasks)
const LK_REPAIR_PROJECT = "1208423849228323"; // Buildium Repair Shop (field corrections)
const LK_LISTING_PROJECT = "1217446710785429"; // Listing Settings
const LK_PROVIDERS_F = "1217921018573269";     // Utility Providers on Listing Settings
const lkEnc = new TextEncoder();
function lkB64(bytes: Uint8Array): string {
  let s = "";
  bytes.forEach((b) => s += String.fromCharCode(b));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
// signing key = password + PAT, hashed: changing the password logs every phone out
async function lkSig(msg: string): Promise<string> {
  const raw = await crypto.subtle.digest("SHA-256", lkEnc.encode(`lookup|${LOOKUP_PASSWORD}|${ASANA_PAT}`));
  const key = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return lkB64(new Uint8Array(await crypto.subtle.sign("HMAC", key, lkEnc.encode(msg))));
}
function lkSame(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function lkTokenOk(token: string): Promise<boolean> {
  if (!LOOKUP_PASSWORD) return false;
  const [exp, sig] = String(token ?? "").split(".");
  // the upper bound also retires tokens issued under a longer TTL
  if (!/^\d+$/.test(exp ?? "") || Number(exp) < Date.now() || Number(exp) > Date.now() + LK_TTL_MS + 60000) return false;
  return lkSame(sig ?? "", await lkSig(exp));
}
// wrong-password brake per caller: 5 misses = 15 minute lockout, plus a delay
// on every miss (per warm instance)
const lkFails = new Map<string, { n: number; at: number }>();

type LkCf = Array<{ gid: string; name: string; display_value: string | null }>;
type LkRow = { gid: string; address: string; uid: string; kind: "unit" | "single" };
let lkListCache: { at: number; rows: LkRow[] } | null = null;
async function lkPaged(project: string, fields: string): Promise<Array<Record<string, unknown>>> {
  const out: Array<Record<string, unknown>> = [];
  let off = "";
  for (let page = 0; page < 15; page++) {
    const res = await fetch(`${ASANA}/projects/${project}/tasks?completed_since=now&limit=100&opt_fields=${fields}${off ? `&offset=${encodeURIComponent(off)}` : ""}`,
      { headers: { "Authorization": `Bearer ${ASANA_PAT}` } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`asana lookup page ${page} -> ${res.status}`);
    out.push(...((json.data ?? []) as Array<Record<string, unknown>>));
    off = json.next_page?.offset ?? "";
    if (!off) break;
  }
  return out;
}
// Unit Settings units, plus single-family Property Settings tasks (no unit child)
async function lkList(): Promise<LkRow[]> {
  if (lkListCache && Date.now() - lkListCache.at < 10 * 60 * 1000) return lkListCache.rows;
  const fields = "name,parent.gid,custom_fields.gid,custom_fields.display_value";
  const [units, props] = await Promise.all([lkPaged(UNIT_SETTINGS_PROJECT, fields), lkPaged(PROPERTY_SETTINGS_PROJECT, fields)]);
  const uidOf = (t: Record<string, unknown>) =>
    String(((t.custom_fields ?? []) as LkCf).find((f) => f.gid === LK_UNIT_ID_F)?.display_value ?? "").trim();
  const rows: LkRow[] = [];
  const parents = new Set<string>();
  for (const t of units) {
    const name = String(t.name ?? "");
    if (!/^settings\s*\/\//i.test(name)) continue;
    const p = (t.parent as { gid?: string } | null)?.gid;
    if (p) parents.add(p);
    rows.push({ gid: String(t.gid), address: addressFromSettingsName(name), uid: uidOf(t), kind: "unit" });
  }
  for (const t of props) {
    const name = String(t.name ?? "");
    if (!/^settings\s*\/\//i.test(name) || parents.has(String(t.gid))) continue;
    rows.push({ gid: String(t.gid), address: addressFromSettingsName(name), uid: uidOf(t), kind: "single" });
  }
  rows.sort((a, b) => a.address.localeCompare(b.address));
  lkListCache = { at: Date.now(), rows };
  return rows;
}
// Occupied unless an open Leasing parent says otherwise: Move Out Completion set
// = Vacant (also new properties vacant from day one), Tenant Move-Out set = Moving Out
function lkStatus(uid: string, idx: { byUid: Record<string, string>; doneByUid: Record<string, string> }): string {
  if (uid && idx.doneByUid[uid]) return "Vacant";
  if (uid && idx.byUid[uid]) return "Moving Out";
  return "Occupied";
}
function lkDate(v: string): string {
  const d = String(v ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "";
  return `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}`;
}
const LK_UTIL: Record<string, string> = {
  "tenant account": "Tenant",
  "sagareus account - 100% pass through": "Sagareus, pass through",
  "sagareus account - flat fee": "Sagareus, flat fee",
  "none": "None",
};

app.options("*", (c) => new Response(null, { status: 204, headers: corsHeaders(c.req.header("origin")) }));

app.post("*", async (c) => {
  const origin = c.req.header("origin");
  const headers = corsHeaders(origin);

  if (origin) {
    const ok = ALLOWED_ORIGINS.includes(origin) ||
      origin.endsWith(".sagareus.com") || origin.endsWith(".hs-sites.com") || origin.endsWith(".hubspotpagebuilder.com");
    if (!ok) return j(headers, 403, { error: "origin_not_allowed" });
  }
  if (!ASANA_PAT) return j(headers, 500, { error: "server_not_configured", message: "ASANA_PAT is not set." });
  if (TEAM_KEY && c.req.header("x-sv-key") !== TEAM_KEY) {
    return j(headers, 401, { error: "bad_key", message: "This tool is for the Sagareus team. Check the page link with your lead." });
  }

  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return j(headers, 400, { error: "bad_json" }); }
  const action = String(body.action ?? "");

  try {
    // ---------- vacancies: open leasing tasks + every managed unit ----------
    // scope "visit" (site visit widget): ALL open leasing tasks, leased included —
    // visits anchor to the Leasing parent task for as long as it stays open.
    if (action === "vacancies") {
      if (body.scope === "visit") {
        const [vacancies, units] = await Promise.all([allVacancies(true), allUnits()]);
        return j(headers, 200, { vacancies, units });
      }
      const [vacancies, units] = await Promise.all([allVacancies(), allUnits()]);
      return j(headers, 200, { vacancies, units });
    }

    // ---------- submit: comment + tickets ----------
    if (action === "submit") {
      const address = String(body.address ?? "").trim();
      let source = body.source === "unit" ? "unit" : body.source === "manual" ? "manual" : "lu";
      let taskGid = source === "manual" ? "" : String(body.taskGid ?? "");
      const generalNote = String(body.generalNote ?? "").trim();
      const inspector = String(body.inspector ?? "").trim().slice(0, 80);
      const items = Array.isArray(body.items) ? body.items as Array<Record<string, unknown>> : [];
      if (!items.length || (source === "manual" ? !address : !taskGid)) {
        return j(headers, 400, { error: "missing_fields" });
      }

      // Visits belong on the Leasing parent task whenever one is open for this
      // address — never on a Settings task or a standalone Property Settings task.
      // Rescue manual/unit submits whose address matches an open leasing task
      // (leased included), so a picker miss can't file the visit in the wrong place.
      if (source !== "lu") {
        try {
          const m = matchUnit(await allVacancies(true), address);
          if (m.hit) { source = "lu"; taskGid = m.hit.gid; }
        } catch { /* non-fatal: fall through to the picked/manual anchor */ }
      }

      // 1) the anchor task and site-visit record.
      //    lu: "Weekly Site Visit / Inspection" subtask per SOP on the Leasing task.
      //    unit/manual (occupied, or address with no open leasing task): a standalone
      //    "Site Visits // <address>" task in Maintenance 2.0 — reused visit to visit —
      //    and tickets nest under it so coordinators can tell the property from the name.
      let anchorGid = taskGid;
      let inspection;
      if (source === "lu") {
        const subtasks = await asana("GET", `/tasks/${taskGid}/subtasks?limit=100&opt_fields=name`);
        inspection = findInspectionSub((subtasks ?? []) as Array<{ gid: string; name: string }>);
        if (!inspection) {
          inspection = await asana("POST", `/tasks/${taskGid}/subtasks`, {
            name: "Weekly Site Visit / Inspection",
            notes: "Site visit documentation lives here. Every visit: one comment with the marked-up checklist and photos. SOP: https://sagareus.getoutline.com/doc/weekly-site-visit-yjZFdeB9EC",
          });
        }
      } else {
        const want = normAddr(address);
        let rec: { gid: string } | null = null;
        try { rec = (await maintVisitTasks()).find((t) => normAddr(t.address) === want) ?? null; } catch { /* non-fatal */ }
        if (!rec) {
          rec = await asana("POST", "/tasks", {
            name: `Site Visits // ${address}`.slice(0, 250),
            projects: [MAINTENANCE_PROJECT],
            notes: "Site visit documentation for this property lives here (no open leasing task at the time of the visit). Every visit: one comment with the marked-up checklist and photos; issue tickets nest as subtasks. SOP: https://sagareus.getoutline.com/doc/weekly-site-visit-yjZFdeB9EC",
          });
          maintVisitCache = null; // next lookup sees the new record
        }
        inspection = rec!;
        anchorGid = rec!.gid;
      }

      // 2) Preferred Showing Slot 1 (drives the next visit's due date)
      let slot1 = "";
      if (source !== "manual") try {
        const lu = await asana("GET", `/tasks/${taskGid}?opt_fields=custom_fields.name,custom_fields.display_value`);
        const sC = (lu.custom_fields ?? []).find((f: { name: string }) => /preferred showing slots/i.test(f.name));
        if (sC?.display_value) slot1 = kvGet(String(sC.display_value), "Slot 1");
        const s1 = (lu.custom_fields ?? []).find((f: { name: string }) => /preferred showing slot 1/i.test(f.name));
        if (!slot1 && s1?.display_value) slot1 = String(s1.display_value);
      } catch { /* non-fatal */ }

      // 3) Turn Over Coordinator = assignee of the "Turn Over | <address>" task
      let toCoordinator: { gid: string; name: string } | null = null;
      try {
        const hits = await asana("GET",
          `/workspaces/${WORKSPACE}/typeahead?resource_type=task&query=${encodeURIComponent("Turn Over | " + address.slice(0, 40))}&count=5&opt_fields=name,assignee.name`);
        const streetNo = (address.match(/^\d+/) ?? [""])[0];
        const to = (hits ?? []).find((t: { name: string }) =>
          /^turn\s*over\s*\|/i.test(t.name) && (!streetNo || t.name.includes(streetNo)));
        if (to?.assignee) toCoordinator = { gid: to.assignee.gid, name: to.assignee.name };
      } catch { /* non-fatal */ }

      // 3b) the Turn Over task for this address: dated visit tasks nest under it
      //     (Brittany 2026-08-19; previously under the leasing anchor), and it gets the
      //     duplicate visit comment. A COMPLETED Turn Over still takes the visit task
      //     and is reopened when issues are filed (Brittany 2026-08-21); open ones are
      //     preferred. No Turn Over at all = fall back to the leasing anchor.
      let toTask: { gid: string } | null = null;
      let toWasCompleted = false;
      try {
        const tos = await turnOverTasks();
        const open = matchUnit(tos.filter((t) => !t.completed), address).hit ?? null;
        const done = open ? null : matchUnit(tos.filter((t) => t.completed), address).hit ?? null;
        toTask = open ?? done;
        toWasCompleted = !open && !!done;
      } catch { /* non-fatal */ }

      // 4) due date: every ticket is due the NEXT DAY (Brittany, 2026-07-22).
      //    Always inside the 72-hour Accountability Rule, however close move-in is.
      const todayStr = new Date(Date.now() - 7 * 3600 * 1000).toISOString().slice(0, 10); // Seattle-ish today
      const dueOn = new Date(Date.now() - 7 * 3600 * 1000 + 86400000).toISOString().slice(0, 10); // Seattle-ish tomorrow

      // 5) ONE dated visit task per submission, assigned to the coordinator; flagged
      //    items are bullet points in its description, not subtasks (Bart + Brittany
      //    2026-08-05: individual tickets/subtasks overwhelm the coordinator's view).
      const assignee = toCoordinator ?? (source === "lu" ? null : DEFAULT_MAINT);
      let visitTask: { gid: string; name?: string } | null = null;
      const flagged = items.filter((it) => it.ticket);
      if (flagged.length) {
        const bullets = flagged.map((it) => {
          const label = String(it.item ?? "Issue");
          const issues = Array.isArray(it.issues) ? it.issues.map((x: unknown) => String(x).trim()).filter(Boolean) : [];
          const note = String(it.note ?? "").trim();
          const bits = [issues.join(", "), note].filter(Boolean).join(" — ");
          return `• ${label}${bits ? ": " + bits : ""}`;
        });
        const vLines = [
          `Issues found on the ${todayStr} site visit at ${address}:`,
          "",
          ...bullets,
        ];
        if (generalNote) vLines.push("", `Notes: ${generalNote}`);
        vLines.push("", "Photos for flagged items are attached here; the full set lives on the site visit subtask.");
        if (assignee === DEFAULT_MAINT) vLines.push("", "Assigned to the default maintenance coordinator; reroute if this property has someone else.");
        if (!assignee) vLines.push("", "No Turn Over task found for this property. Assign to your Turn Over Coordinator.");
        if (source === "lu" && !toTask) vLines.push("", "No Turn Over task found for this property (open or recently completed), so this visit task is filed on the leasing task instead.");
        if (source === "lu" && toTask && toWasCompleted) vLines.push("", "The Turn Over task was already complete; this visit reopened it.");
        visitTask = await asana("POST", `/tasks/${(source === "lu" && toTask) ? toTask.gid : anchorGid}/subtasks`, {
          name: `Site Visit ${todayStr} | ${address}`.slice(0, 250),
          ...(assignee ? { assignee: assignee.gid } : {}),
          due_on: dueOn,
          notes: vLines.join("\n"),
        });
        // issues filed on a completed Turn Over reopen it (Brittany 2026-08-21)
        if (source === "lu" && toTask && toWasCompleted) {
          await asana("PUT", `/tasks/${toTask.gid}`, { completed: false }).catch(() => null);
        }
      }
      const created: Array<{ gid: string; name: string; url: string }> = [];

      // 6) post the checklist comment on the inspection subtask
      const bySection: Record<string, string[]> = {};
      for (const it of items) {
        const sec = String(it.section ?? "CHECKLIST");
        const mark = it.answer === "yes" ? (it.pf ? "(PASS)" : "(Y)") :
                     it.answer === "no" ? (it.pf ? "(FAIL)" : "(N)") :
                     it.answer === "task" ? "(TASK)" : "(na)";
        const note = String(it.note ?? "").trim();
        const issues = Array.isArray(it.issues) ? it.issues.map((x: unknown) => String(x).trim()).filter(Boolean) : [];
        const extra = [issues.join(", "), note].filter(Boolean).join(" | ");
        (bySection[sec] = bySection[sec] || []).push(
          `${mark} ${it.item}${extra ? ` -- ${extra}` : ""}${it.ticket ? " [ticket created]" : ""}`);
      }
      // Address in the header: the comment must identify the property on its own —
      // the PDF carries it too, but PDF uploads don't always finish (Brittany, 2026-07-22).
      const lines: string[] = [`SITE VISIT -- ${todayStr} -- ${address}`, ""];
      if (inspector) lines.splice(1, 0, `Inspected by: ${inspector}`);
      for (const sec of Object.keys(bySection)) { lines.push(sec); lines.push(...bySection[sec]); lines.push(""); }
      if (generalNote) { lines.push("Notes:"); lines.push(generalNote); lines.push(""); }
      lines.push(`RESULT: ${flagged.length ? `${flagged.length} issue(s) filed on one Site Visit task` : "All good, no issues found"}`);
      const story = await asana("POST", `/tasks/${inspection.gid}/stories`, { text: lines.join("\n") });

      // While a Turn Over task is open for this address, the coordinator gets a
      // duplicate of the visit comment on that task (Brittany, 2026-07-23).
      // The original posting above is unchanged; this is visibility only.
      try {
        if (toTask) {
          await postStory(toTask.gid, lines.join("\n") +
            `\n\nFull record (photos + inspection PDF): https://app.asana.com/0/0/${inspection.gid}`);
        }
      } catch { /* non-fatal: the visit itself already posted */ }

      // 7) bump the inspection subtask's due date to the next Slot 1 weekday.
      //    Slot 1 is free text ("Tuesday 10-11am"). Blank or no weekday = fall back
      //    to visit date + 6 days (Brittany, 2026-07-18), so the cadence never stalls.
      let inspectionDueOn: string | null = null;
      try {
        const local = new Date(Date.now() - 7 * 3600 * 1000); // Seattle-ish day boundary
        const wd = slot1 ? weekdayFromText(slot1) : null;
        let add: number;
        if (wd !== null) {
          add = (wd - local.getUTCDay() + 7) % 7;
          if (add === 0) add = 7; // visit happened today; due date is NEXT week's slot
        } else {
          add = 6; // no Slot 1 on the property: push out 6 days
        }
        local.setUTCDate(local.getUTCDate() + add);
        inspectionDueOn = local.toISOString().slice(0, 10);
        await asana("PUT", `/tasks/${inspection.gid}`, { due_on: inspectionDueOn });
      } catch { inspectionDueOn = null; /* non-fatal */ }

      // A logged site visit IS the weekly report for turnover / pre-move-in units
      // ONLY (Brittany 2026-08-28): live listings owe BOTH the site visit and the
      // weekly activity report, so the roll skips leasing-state units.
      let warRolled: string | null = null;
      try {
        const tSV = await asana("GET", `/tasks/${taskGid}?opt_fields=custom_fields.gid,custom_fields.name,custom_fields.display_value`);
        const cfSV = (tSV.custom_fields ?? []) as Array<{ gid: string; name: string; display_value: string | null }>;
        const ldSV = String(cfSV.find((f) => f.gid === "1213182838328964")?.display_value ?? "").slice(0, 10);
        const lsSV = String(cfSV.find((f) => /lease signed/i.test(String(f.name)))?.display_value ?? "").trim();
        const todaySV = new Date(Date.now() - 7 * 3600 * 1000).toISOString().slice(0, 10);
        const isLiveListing = !lsSV && /^\d{4}-\d{2}-\d{2}$/.test(ldSV) && ldSV <= todaySV;
        if (isLiveListing) throw new Error("live listing: WAR still owed separately");
        const subsSV = ((await asana("GET", `/tasks/${taskGid}/subtasks?limit=100&opt_fields=name,completed`)) ?? []) as Array<{ gid: string; name: string; completed?: boolean }>;
        const wSV = subsSV.find((x) => !x.completed && /weekly activity report/i.test(x.name)) ?? subsSV.find((x) => /weekly activity report/i.test(x.name));
        if (wSV) {
          const lT = new Date(Date.now() - 7 * 3600 * 1000);
          let addT = (2 - lT.getUTCDay() + 7) % 7;
          if (addT === 0) addT = 7;
          lT.setUTCDate(lT.getUTCDate() + addT);
          warRolled = lT.toISOString().slice(0, 10);
          await asana("PUT", `/tasks/${wSV.gid}`, { due_on: warRolled });
          execCache = null; warqCache = null;
        }
      } catch { warRolled = null; /* non-fatal */ }

      return j(headers, 200, {
        warRolled,
        ok: true,
        inspectionGid: inspection.gid,
        inspectionUrl: `https://app.asana.com/0/0/${inspection.gid}`,
        storyGid: story?.gid ?? null,
        subtasks: created,
        itemCount: flagged.length,
        visitTaskGid: visitTask?.gid ?? null,
        visitTaskUrl: visitTask ? `https://app.asana.com/0/0/${visitTask.gid}` : null,
        assignee: assignee ? assignee.name : null,
        dueOn,
        inspectionDueOn,
      });
    }

    // ---------- Team Development board: AI skills tracker ----------
    // Skills live as "AI Skill | {name}" subtasks on each person's dev task in
    // Team Development 2.0 (Brittany 2026-08-05). Demo uploads prove completion.
    const TD_PROJECT = "1210186078076883";
    async function tdDevTask(member: string): Promise<{ gid: string; name: string } | null> {
      const tasks = await asana("GET", `/projects/${TD_PROJECT}/tasks?opt_fields=name&limit=100`);
      const toks = member.toLowerCase().split(/\s+/).filter(Boolean);
      return (tasks ?? []).find((t: { name: string }) => {
        const n = String(t.name).toLowerCase();
        return toks.length > 0 && toks.every((x) => n.includes(x));
      }) ?? null;
    }
    async function tdVerifySkill(taskGid: string): Promise<{ gid: string; name: string } | null> {
      const t = await asana("GET", `/tasks/${taskGid}?opt_fields=name,parent.name`).catch(() => null);
      if (!t || !/^ai skill/i.test(String(t.name ?? ""))) return null;
      return t;
    }
    if (action === "tdSkills") {
      const member = String(body.member ?? "").trim().slice(0, 80);
      if (!member) return j(headers, 400, { error: "missing_fields" });
      const dev = await tdDevTask(member);
      if (!dev) return j(headers, 200, { ok: false, error: "no_dev_task" });
      const subs = await asana("GET", `/tasks/${dev.gid}/subtasks?opt_fields=name,completed,notes&limit=100`);
      const rows = (subs ?? []).filter((s: { name: string }) => /^ai skill/i.test(String(s.name ?? ""))).slice(0, 10);
      const skills = [];
      for (const s of rows) {
        const atts = await asana("GET", `/tasks/${s.gid}/attachments?opt_fields=name`).catch(() => []);
        const links = String(s.notes ?? "").split("\n").map((l: string) => l.trim()).filter((l: string) => /^https?:\/\//i.test(l));
        skills.push({
          gid: String(s.gid),
          name: String(s.name).replace(/^ai skill\s*\|\s*/i, ""),
          done: s.completed === true,
          links, files: (atts ?? []).length,
        });
      }
      return j(headers, 200, { ok: true, devGid: dev.gid, skills });
    }
    if (action === "tdSkillAdd") {
      const member = String(body.member ?? "").trim().slice(0, 80);
      const name = String(body.name ?? "").trim().slice(0, 120);
      const link = String(body.link ?? "").trim().slice(0, 500);
      if (!member || name.length < 3) return j(headers, 400, { error: "missing_fields" });
      if (link && !/^https?:\/\//i.test(link)) return j(headers, 400, { error: "bad_link" });
      const dev = await tdDevTask(member);
      if (!dev) return j(headers, 200, { ok: false, error: "no_dev_task" });
      const subs = await asana("GET", `/tasks/${dev.gid}/subtasks?opt_fields=name&limit=100`);
      const count = (subs ?? []).filter((s: { name: string }) => /^ai skill/i.test(String(s.name ?? ""))).length;
      if (count >= 5) return j(headers, 200, { ok: false, error: "limit" });
      const sub = await asana("POST", `/tasks/${dev.gid}/subtasks`, {
        name: `AI Skill | ${name}`,
        notes: (link ? link + "\n\n" : "")
          + "Personal AI skill tracked on the Team Development board. Attach a demo video or screenshots here to prove completion; a lead completes the task once presented.\n\n"
          + `Added from the board by ${member}. Done by Claude on behalf of ${member}.`,
      });
      return j(headers, 200, { ok: true, gid: sub.gid });
    }
    if (action === "tdSkillLink") {
      const taskGid = String(body.taskGid ?? "").replace(/\D/g, "");
      const link = String(body.link ?? "").trim().slice(0, 500);
      if (!taskGid || !/^https?:\/\//i.test(link)) return j(headers, 400, { error: "missing_fields" });
      const t = await tdVerifySkill(taskGid);
      if (!t) return j(headers, 200, { ok: false, error: "not_a_skill" });
      const cur = await asana("GET", `/tasks/${taskGid}?opt_fields=notes`);
      await asana("PUT", `/tasks/${taskGid}`, { notes: link + "\n" + String(cur?.notes ?? "") });
      return j(headers, 200, { ok: true });
    }
    if (action === "tdSkillFile") {
      const taskGid = String(body.taskGid ?? "").replace(/\D/g, "");
      const filename = String(body.filename ?? "demo").replace(/[^\w.\-]/g, "_").slice(0, 120);
      const dataB64 = String(body.dataB64 ?? "");
      if (!taskGid || !dataB64 || dataB64.length > 10_700_000) return j(headers, 400, { error: "bad_file" });
      const t = await tdVerifySkill(taskGid);
      if (!t) return j(headers, 200, { ok: false, error: "not_a_skill" });
      const ext = (filename.match(/\.(\w+)$/) ?? [])[1]?.toLowerCase() ?? "";
      const mime = ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", heic: "image/heic", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm" } as Record<string, string>)[ext] ?? "application/octet-stream";
      const bytes = Uint8Array.from(atob(dataB64), (ch) => ch.charCodeAt(0));
      const form = new FormData();
      form.append("parent", taskGid);
      form.append("file", new Blob([bytes], { type: mime }), filename);
      const res = await fetch(`${ASANA}/attachments`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${ASANA_PAT}` },
        body: form,
      });
      if (!res.ok) return j(headers, 200, { ok: false, error: "upload_failed" });
      return j(headers, 200, { ok: true });
    }

    // ---------- photo: attach one jpeg to the inspection subtask ----------
    if (action === "photo") {
      const parent = String(body.parent ?? "");
      const filename = String(body.filename ?? "site-visit.jpg").replace(/[^\w.\-]/g, "_");
      const dataB64 = String(body.dataB64 ?? "");
      if (!parent || !dataB64 || dataB64.length > 8_000_000) return j(headers, 400, { error: "bad_photo" });
      const bytes = Uint8Array.from(atob(dataB64), (ch) => ch.charCodeAt(0));
      // replace: regenerated reports (e.g. a bedroom-count correction, unit 488555
      // 2026-09-07) delete the SAME-NAMED attachment before uploading, so the task
      // never carries two versions of one report
      if (body.replace === true) {
        try {
          const exArr = ((await asana("GET", `/tasks/${parent}/attachments?opt_fields=name`)) ?? []) as Array<{ gid: string; name: string }>;
          for (const ex of exArr) {
            if (String(ex.name) !== filename) continue;
            await fetch(`${ASANA}/attachments/${ex.gid}`, { method: "DELETE", headers: { "Authorization": `Bearer ${ASANA_PAT}` } }).catch(() => null);
          }
        } catch { /* old copy staying is not worth failing the upload */ }
      }
      const form = new FormData();
      form.append("parent", parent);
      form.append("file", new Blob([bytes], { type: "image/jpeg" }), filename);
      const res = await fetch(`${ASANA}/attachments`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${ASANA_PAT}` },
        body: form,
      });
      if (!res.ok) return j(headers, 502, { error: "attach_failed" });
      return j(headers, 200, { ok: true });
    }

    // ---------- war: everything the Weekly Activity Report widget needs from the LU task ----------
    if (action === "war") {
      const taskGid = String(body.taskGid ?? "").trim();
      if (!taskGid) return j(headers, 400, { error: "missing_task" });
      const t = await asana("GET", `/tasks/${taskGid}?opt_fields=name,custom_fields.name,custom_fields.display_value`);
      const cf = (t.custom_fields ?? []) as Array<{ name: string; display_value: string | null }>;
      const get = (re: RegExp) => cf.find((f) => re.test(f.name))?.display_value ?? "";
      const listDate = get(/list date/i);
      const leaseSigned = get(/lease signed date/i);
      const moveIn = get(/move in date/i);
      let priceHistory: unknown = null;
      try { priceHistory = JSON.parse(get(/price history/i) || "null"); } catch { /* unparseable */ }
      // state per the Email | Owner - Weekly Activity Report SOP
      const now = Date.now();
      let state = "turnover";
      if (leaseSigned) state = "premovein";
      else if (listDate && Date.parse(listDate) <= now) state = "leasing";
      const daysOnMarket = listDate ? Math.max(0, Math.floor((now - Date.parse(listDate)) / 86400000)) : null;

      // Turnover/Pre-Move-In prefills: subtasks created in the last 7 days on the LU
      // task AND the property's Turn Over task (excluding template subtasks), plus the
      // latest site-visit checklist comment.
      let recentSubtasks: string[] = [];
      let weekApplications: number | null = null;
      let weekApplicationTasks: { name: string; url: string }[] = [];
      let siteVisitNote = "";
      let siteVisitDate = "";
      let inspectionPdfUrl = "";
      const weekAgo = now - 7 * 86400000;
      const TEMPLATE = new RegExp([
        "site\\s*visit", "inspection", "activity report", "speed to lead", "listing video",
        "zillow listing", "floor plan", "bd listing", "leasing plan", "schedule photo", "market rent",
        "go live", "property listed", "occupied showings", "brandtegic", "move out cleaning",
        "^={2,}", // section headers
        // template subtasks all follow the "Verb | Thing" convention
        "^(email|update|review|confirm|schedule|assign|record|respond|decide|prepare|upload|receive|add|send|notify|cancel|deposit|conduct|request|go)\\s*\\|",
      ].join("|"), "i");
      // Owner-facing: ticket name only. No assignee, no due date (false expectations),
      // and the " // address" suffix the site-visit tool appends is redundant here.
      const fmtSub = () => (s: { name: string }) => String(s.name).split(" // ")[0].split(" | ")[0].trim();
      const recentOnly = (s: { name: string; created_at: string }) => Date.parse(s.created_at) >= weekAgo && !TEMPLATE.test(s.name) && String(s.name).length <= 120;
      try {
        const subs = await asana("GET", `/tasks/${taskGid}/subtasks?limit=100&opt_fields=name,created_at,assignee.name,due_on`);
        recentSubtasks = (subs ?? []).filter(recentOnly).map(fmtSub());
        // Applications submitted in the reporting period, counted from the LU's
        // Application subtasks (team 2026-09-20: agents are not always aware an
        // application came in, so the WAR count prefills from the record). Same
        // Monday-anchored week the report names: Tuesday through Monday.
        try {
          const sea = new Date(now - 7 * 3600 * 1000);
          const dow = (sea.getUTCDay() + 6) % 7; // days since Monday
          const mondayUtc = Date.UTC(sea.getUTCFullYear(), sea.getUTCMonth(), sea.getUTCDate() - dow);
          const periodStart = mondayUtc - 6 * 86400000 + 7 * 3600 * 1000; // Tuesday 00:00 Seattle
          const periodEndExcl = mondayUtc + 86400000 + 7 * 3600 * 1000;   // Tuesday 00:00 after the Monday
          const weekApps = ((subs ?? []) as Array<{ gid?: string; name?: string; created_at?: string }>)
            .filter((s) => /application/i.test(String(s.name ?? "")) && !TEMPLATE.test(String(s.name ?? "")))
            .filter((s) => { const ts = Date.parse(String(s.created_at ?? "")); return ts >= periodStart && ts < periodEndExcl; });
          weekApplications = weekApps.length;
          // named + linked so the agent sees who applied and where it came from
          // (team 2026-09-20); links open inside Leasing | Screen + Sign
          weekApplicationTasks = weekApps.map((s) => ({
            name: String(s.name ?? "").split("|").pop()!.trim().slice(0, 120),
            url: `https://app.asana.com/1/${WORKSPACE}/project/1217174650640596/task/${s.gid ?? ""}`,
          }));
        } catch { /* the input stays manual */ }
        const insp = findInspectionSub((subs ?? []) as Array<{ gid: string; name: string }>);
        if (insp) {
          const stories = (await allStories(insp.gid, "type,text,created_at")) as Array<{ type: string; text?: string; created_at?: string }>;
          const comments = (stories ?? []).filter((st: { type: string }) => st.type === "comment");
          if (comments.length) {
            siteVisitDate = String(comments[comments.length - 1].created_at ?? "").slice(0, 10);
            // newest shareable inspection link, scanning back through recent comments
            // (Asana asset links are login-gated, so only storage links count)
            for (let ci = comments.length - 1; ci >= 0 && !inspectionPdfUrl; ci--) {
              const ms = String(comments[ci].text ?? "").match(/(?:PDF|report):\s*(https?:\/\/\S+)/gi) ?? [];
              for (const mm of ms.reverse()) {
                const u = (mm.match(/https?:\/\/\S+/) ?? [""])[0];
                if (u && !/app\.asana\.com/.test(u)) { inspectionPdfUrl = u; break; }
              }
            }
            // full checklist comment, verbatim (minus the tool tag), for the owner report
            let txt = String(comments[comments.length - 1].text ?? "");
            txt = txt.replace(/\s*\(via [^)]*\)/i, "");
            siteVisitNote = txt.trim().slice(0, 6000);
          }
        }
        // Turn Over task subtasks too
        const addr = addressFromTaskName(t.name);
        const hits = await asana("GET",
          `/workspaces/${WORKSPACE}/typeahead?resource_type=task&query=${encodeURIComponent("Turn Over | " + addr.slice(0, 40))}&count=5&opt_fields=name`);
        const streetNo = (addr.match(/^\d+/) ?? [""])[0];
        const to = (hits ?? []).find((x: { name: string }) => /^turn\s*over\s*\|/i.test(x.name) && (!streetNo || x.name.includes(streetNo)));
        if (to) {
          const tsubs = await asana("GET", `/tasks/${to.gid}/subtasks?limit=100&opt_fields=name,created_at,assignee.name,due_on`);
          (tsubs ?? []).filter(recentOnly).forEach((s: { name: string }) => {
            recentSubtasks.push(fmtSub()(s));
          });
        }
      } catch { /* non-fatal */ }

      return j(headers, 200, {
        recentSubtasks,
        weekApplications,
        weekApplicationTasks,
        siteVisitNote,
        siteVisitDate,
        inspectionPdfUrl,
        ok: true,
        name: t.name,
        state,
        daysOnMarket,
        listDate: listDate ? String(listDate).slice(0, 10) : null,
        moveIn: moveIn ? String(moveIn).slice(0, 10) : null,
        leaseSigned: leaseSigned ? String(leaseSigned).slice(0, 10) : null,
        ownerName: ownerFromCf(cf).name,
        ownerEmail: ownerFromCf(cf).email,
        slot1: kvGet(String(get(/preferred showing slots/i)), "Slot 1") || get(/preferred showing slot 1/i),
        zillow: kvGet(String(get(/zillow \+ redfin/i)), "Zillow") || get(/^🙌?\s*zillow$/i),
        redfin: kvGet(String(get(/zillow \+ redfin/i)), "Redfin") || get(/^🙌?\s*redfin$/i),
        sagareusUrl: get(/sagareus listing link/i),
        priceHistory,
      });
    }

    // ---------- warSubmit: post the report to the recurring WAR subtask, roll due date ----------
    if (action === "warSubmit") {
      const taskGid = String(body.taskGid ?? "").trim();
      const text = String(body.text ?? "").trim();
      if (!taskGid || !text) return j(headers, 400, { error: "missing_fields" });
      const subtasks = await asana("GET", `/tasks/${taskGid}/subtasks?limit=100&opt_fields=name`);
      let war = (subtasks ?? []).find((s: { name: string }) => /weekly activity report/i.test(s.name)) ??
                (subtasks ?? []).find((s: { name: string }) => /activity report/i.test(s.name));
      if (!war) {
        war = await asana("POST", `/tasks/${taskGid}/subtasks`, {
          name: "Send weekly activity report",
          notes: "Recurring: one owner update per week, move-out to move-in. SOP: https://sagareus.getoutline.com/doc/email-owner-weekly-activity-report-VDE6GnaYef",
        });
      }
      // structured numbers (Execute & Adapt, 2026-08-26): a plain machine-readable
      // trailer makes the weekly series parse bulletproof even if the template changes
      const hasNums = body.inquiries != null || body.showings != null || body.applications != null;
      const numsLine = hasNums
        ? `\n\n[metrics] inquiries=${Math.max(0, Math.round(Number(body.inquiries) || 0))} showings=${Math.max(0, Math.round(Number(body.showings) || 0))} applications=${Math.max(0, Math.round(Number(body.applications) || 0))}`
        : "";
      const story = await postStory(war.gid, text.slice(0, 60000) + numsLine);
      // roll due date to next Tuesday (Seattle-ish day boundary). A report sent
      // Sunday or Monday COUNTS for the imminent Tuesday, so its due rolls to the
      // FOLLOWING week (team 2026-09-15: Sun/Mon sends were rolling 1-2 days out
      // and flipping straight back to "WAR due" midweek).
      const local = new Date(Date.now() - 7 * 3600 * 1000);
      let add = (2 - local.getUTCDay() + 7) % 7;
      if (add === 0) add = 7;
      if (local.getUTCDay() === 0 || local.getUTCDay() === 1) add += 7;
      local.setUTCDate(local.getUTCDate() + add);
      const dueOn = local.toISOString().slice(0, 10);
      try { await asana("PUT", `/tasks/${war.gid}`, { due_on: dueOn }); } catch { /* non-fatal */ }
      // Owner report sends stamp lastUpdate into the LU's Price History JSON so the
      // bench queue's UPD pill can show the last-sent date without walking every
      // WAR subtask's comment feed (Brittany 2026-09-11)
      // OWNER REPORT POSTED = the bench's Post + Don't Send (Brittany 2026-10-23):
      // the week counts as handled without an email going out
      if (/^OWNER REPORT (SENT|POSTED)/i.test(text)) {
        try {
          const tU = await asana("GET", `/tasks/${taskGid}?opt_fields=custom_fields.gid,custom_fields.name,custom_fields.display_value`);
          const phU = ((tU.custom_fields ?? []) as Array<{ gid: string; name: string; display_value: string | null }>).find((f) => /price history/i.test(String(f.name)));
          if (phU) {
            let ph1: Record<string, unknown> = {};
            try { const p1 = JSON.parse(String(phU.display_value ?? "") || "{}"); ph1 = (p1 && typeof p1 === "object" && !Array.isArray(p1)) ? p1 : { events: p1 }; } catch { ph1 = {}; }
            ph1.lastUpdate = new Date(Date.now() - 7 * 3600 * 1000).toISOString().slice(0, 10);
            await asana("PUT", `/tasks/${taskGid}`, { custom_fields: { [phU.gid]: JSON.stringify(ph1).slice(0, 6000) } });
          }
        } catch { /* the OWNER REPORT SENT comment already carries the record */ }
      }
      execCache = null; // the WAR heartbeat moved: next execQueue must re-read
      warqCache = null;
      // weekly series + cumulative totals, recomputed from ALL report stories (self
      // healing: no increment drift, resubmits just re-derive); totals go to the LU's
      // three number fields, which the owner page displays
      let series = null, totals = null, dates = null;
      let fieldsWritten: string[] = [];
      try {
        const reps = await warReportStories(war.gid);
        if (reps.length) {
          const sr = warSeriesBuild(reps);
          series = sr.series; totals = sr.totals; dates = sr.dates;
          fieldsWritten = await writeLuMetrics(taskGid, sr.totals);
        }
      } catch { /* metrics are best-effort; the report post already succeeded */ }
      return j(headers, 200, {
        ok: true,
        warGid: war.gid,
        warUrl: `https://app.asana.com/0/0/${war.gid}`,
        storyGid: story?.gid ?? null,
        dueOn,
        series, totals, dates, fieldsWritten,
      });
    }

    // ---------- execQueue: Review Queue for the Execute & Adapt bench (2026-08-26) ----------
    // Active listings = open LU/TP/PreLease with a List Date on or before today and no
    // Lease Signed. Team lead joins from Listing Settings by Unit ID; the WAR subtask's
    // due date is the weekly heartbeat (overdue or missing = red pill on the bench).
    // Occupied units join early when listed (2026-09-09) or when their Listing
    // Settings plan is approved / has a Target List Date (2026-09-21).
    if (action === "execQueue") {
      if (execCache && Date.now() - execCache.at < 2 * 60 * 1000) return j(headers, 200, execCache.payload as Record<string, unknown>);
      const todayQ = new Date(Date.now() - 7 * 3600 * 1000).toISOString().slice(0, 10);
      const LD_F = "1213182838328964";  // 💁 List Date
      const UID_F = "1213183515622826"; // Unit ID
      const moIdx = await moveOutIndex().catch(() => ({ byUid: {} as Record<string, string>, byAddr: {} as Record<string, string>, uidByAddr: {} as Record<string, string>, doneByUid: {} as Record<string, string>, doneByAddr: {} as Record<string, string>, masterByUid: {} as Record<string, string>, moProjByUid: {} as Record<string, string>, moProjByAddr: {} as Record<string, string> }));
      type QRow = { gid: string; url: string; address: string; unitId: string; teamLead: string; agent: string; lsGid: string; listDate: string; state: string; doNotList: string; dom: number | null; moveOut: string | null; moveIn: string; occupiedUntil?: string; modDate: string | null; modOverdue: boolean; firstWeek: boolean; updDate: string | null; signedDate: string; targetListDate?: string; warGid: string; warDue: string | null; warMissing: boolean | null; moConfirmed: boolean | null; relistPending: boolean };
      const rows: QRow[] = [];
      let offQ = "";
      // completed_since 90 days back (not "now"): the LU task is COMPLETED at lease
      // signing, which was dropping every Move In Pending unit off the bench
      // (Brittany 2026-09-10, "10 vacant scheduled for move-in, none showing").
      // Completed tasks stay only while their Move in Date is still ahead.
      const sinceQ = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
      const MI_F = "1213183520317831"; // 🙌 Move in Date
      // Listing Settings index (Unit ID join first, normalized-address fallback
      // for fresh-cycle LU tasks with no Unit ID yet - 2026-08-27, 1151 N 94th
      // #31): team lead + Target List Date for the queue columns, and Plan
      // Status for the gate below. Built BEFORE the LU scan because the gate
      // needs it: an occupied unit whose plan is approved (or has a Target List
      // Date) belongs on the bench so Go Live is reachable before vacancy
      // (Brittany 2026-09-21, unit 387050: Team Lead Approved plan, target list
      // 9/23, invisible until 9/30 move-out under the old vacancy-or-listed
      // rule - Go Live stamps List Date, but only from a bench row, deadlock).
      const lsIdx: Record<string, { teamLead: string; lsGid: string; targetListDate: string; planStatus: string }> = {};
      const lsAddrIdx: Record<string, { teamLead: string; lsGid: string; targetListDate: string; planStatus: string }> = {};
      try {
        let offL = "";
        for (let pg = 0; pg < 15; pg++) {
          const r1 = await fetch(`${ASANA}/projects/1217446710785429/tasks?limit=100&opt_fields=name,custom_fields.gid,custom_fields.display_value${offL ? `&offset=${encodeURIComponent(offL)}` : ""}`,
            { headers: { "Authorization": `Bearer ${ASANA_PAT}` } });
          const j1 = await r1.json().catch(() => ({}));
          for (const t of (j1.data ?? []) as Array<{ gid: string; name: string; custom_fields?: Array<{ gid: string; display_value: string | null }> }>) {
            const cfL = t.custom_fields ?? [];
            const entry = {
              teamLead: String(cfL.find((f) => f.gid === "1217446711292696")?.display_value ?? "").trim(),
              lsGid: t.gid,
              targetListDate: String(cfL.find((f) => f.gid === "1217515135889617")?.display_value ?? "").slice(0, 10),
              planStatus: String(cfL.find((f) => f.gid === "1217569409567702")?.display_value ?? "").trim(),
            };
            const uidL = String(cfL.find((f) => f.gid === "1213183515622826")?.display_value ?? "").trim();
            if (uidL) lsIdx[uidL] = entry;
            const addrL = String(t.name).replace(/^listing\s*\|\s*/i, "").trim();
            if (addrL) lsAddrIdx[normAddr(addrL)] = entry;
          }
          offL = j1.next_page?.offset ?? "";
          if (!offL) break;
        }
      } catch { /* index stays empty: gate falls back to vacancy-or-listed, lead column blank */ }
      for (let pg = 0; pg < 12; pg++) {
        const r0 = await fetch(`${ASANA}/projects/${LEASING_LU_PROJECT}/tasks?completed_since=${sinceQ}&limit=100&opt_fields=name,completed,assignee.name,parent.gid,custom_fields.gid,custom_fields.name,custom_fields.display_value${offQ ? `&offset=${encodeURIComponent(offQ)}` : ""}`,
          { headers: { "Authorization": `Bearer ${ASANA_PAT}` } });
        const j0 = await r0.json().catch(() => ({}));
        for (const t of (j0.data ?? []) as Array<{ gid: string; name: string; completed?: boolean; assignee?: { name?: string } | null; parent?: { gid?: string } | null; custom_fields?: Array<{ gid: string; name: string; display_value: string | null }> }>) {
          if (!/^(LU|TP|PreLease)\s*\|/i.test(t.name)) continue;
          if (t.completed) {
            const cfC = t.custom_fields ?? [];
            const lsC = String(cfC.find((f) => /lease signed/i.test(String(f.name)))?.display_value ?? "").trim();
            const miC = String(cfC.find((f) => f.gid === MI_F)?.display_value ?? "").slice(0, 10);
            if (!lsC || !/^\d{4}-\d{2}-\d{2}$/.test(miC) || miC <= todayQ) continue;
          }
          const address = addressFromTaskName(t.name);
          if (!address || address.includes("<")) continue;
          const cfQ = t.custom_fields ?? [];
          // EVERY VACANT unit gets a weekly report (Brittany 2026-08-27), and vacant
          // means POST move-out, pre move-in. Notice-to-vacate units still occupied
          // (move-out date missing or in the future) stay off the list - even when
          // pre-listed. Not yet listed = Turnover In Progress; lease signed = Move In
          // Pending; listed = Active Listing.
          let listDate = String(cfQ.find((f) => f.gid === LD_F)?.display_value ?? "").slice(0, 10);
          // Price History fallback (feedback 1219524014102594, 5025 S 167th St):
          // a bench Delist clears List Date so Go Live can re-stamp it, but a
          // relist done straight in Buildium never re-stamps it, and the unit
          // then failed every gate below (not vacant on the master, not listed)
          // and dropped off the bench, with Go Live unreachable. The synced
          // Price History still records the relist, so read it: newest event
          // a listing -> listed since the newest LISTED date (healed onto the
          // LU); newest event a delist (last 30 days) -> keep the row on the
          // bench so Go Live stays reachable.
          let relistPending = false;
          if (!/^\d{4}-\d{2}-\d{2}$/.test(listDate)) {
            try {
              const phR = String(cfQ.find((f) => /price history/i.test(String(f.name)))?.display_value ?? "");
              const phP = phR ? JSON.parse(phR) : null;
              const evR = ((phP && typeof phP === "object" && !Array.isArray(phP)) ? phP.events : phP) as Array<Record<string, unknown>> | null;
              const evs = (Array.isArray(evR) ? evR : [])
                .map((e) => ({ type: String(e?.type ?? "").toUpperCase(), date: String(e?.date ?? e?.on ?? "").slice(0, 10) }))
                .filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.date <= todayQ);
              // stable: same-day events keep their written order (DELISTED then LISTED)
              const sorted = evs.map((e, i) => ({ ...e, i })).sort((a, b) => a.date === b.date ? a.i - b.i : (a.date < b.date ? -1 : 1));
              const last = sorted[sorted.length - 1];
              if (last && last.type === "DELISTED") {
                relistPending = (Date.parse(todayQ + "T12:00:00Z") - Date.parse(last.date + "T12:00:00Z")) / 86400000 <= 30;
              } else if (last) {
                const lastListed = [...sorted].reverse().find((e) => e.type === "LISTED");
                if (lastListed) {
                  listDate = lastListed.date;
                  await asana("PUT", `/tasks/${t.gid}`, { custom_fields: { [LD_F]: { date: listDate } } }).catch(() => null);
                }
              }
            } catch { /* unparseable history: row falls through to the normal gates */ }
          }
          const leaseSignedRaw = String(cfQ.find((f) => /lease signed/i.test(String(f.name)))?.display_value ?? "").trim();
          // STALE lease-signed guard (team 2026-09-16, 423 2nd St #214): a signed
          // date 45+ days old on a still-open task with no upcoming Move in Date is
          // a fell-through lease, not a pending move-in; ignore it so the unit
          // shows (and reports) as a normal listing again.
          const miOpen = String(cfQ.find((f) => f.gid === MI_F)?.display_value ?? "").slice(0, 10);
          const lsdQ = leaseSignedRaw.slice(0, 10);
          const staleSigned = !!leaseSignedRaw && !t.completed &&
            !(/^\d{4}-\d{2}-\d{2}$/.test(miOpen) && miOpen >= todayQ) &&
            /^\d{4}-\d{2}-\d{2}$/.test(lsdQ) &&
            (Date.parse(todayQ + "T12:00:00Z") - Date.parse(lsdQ + "T12:00:00Z")) / 86400000 > 45;
          const leaseSigned = staleSigned ? "" : leaseSignedRaw;
          const moOwn = String(cfQ.find((f) => f.gid === "1213182815411738")?.display_value ?? "").slice(0, 10);
          const moDone = String(cfQ.find((f) => f.gid === "1214521745467158")?.display_value ?? "").slice(0, 10);
          let unitIdQ = String(cfQ.find((f) => f.gid === UID_F)?.display_value ?? "").trim();
          if (!unitIdQ && t.parent?.gid) {
            // LU created without a Unit ID (326 NE 125th #1, 2026-10-02; 3038 37th
            // Ave SW before it): the id lives on the Leasing parent. Adopt it and
            // write it back so the LU heals for every later lookup. Same pattern
            // as leaseContext (2026-09-23). Unit ID first, address never.
            try {
              const parQ = await asana("GET", `/tasks/${t.parent.gid}?opt_fields=custom_fields.gid,custom_fields.display_value`);
              unitIdQ = String(((parQ.custom_fields ?? []) as Array<{ gid: string; display_value: string | null }>).find((f) => f.gid === UID_F)?.display_value ?? "").replace(/\D/g, "");
              if (unitIdQ) await asana("PUT", `/tasks/${t.gid}`, { custom_fields: { [UID_F]: unitIdQ } }).catch(() => null);
            } catch { /* best-effort; the row still renders */ }
          }
          if (!unitIdQ) unitIdQ = moIdx.uidByAddr[normAddr(address)] ?? "";
          const moSched = /^\d{4}-\d{2}-\d{2}$/.test(moOwn) ? moOwn : (moIdx.byUid[unitIdQ] ?? moIdx.byAddr[normAddr(address)] ?? "");
          // Leasing | Move-Out task first (Brittany 2026-10-24), then the LU, then the master
          const moProj = moIdx.moProjByUid[unitIdQ] ?? moIdx.moProjByAddr[normAddr(address)] ?? "";
          const moDoneAll = moProj || (/^\d{4}-\d{2}-\d{2}$/.test(moDone) ? moDone : (moIdx.doneByUid[unitIdQ] ?? moIdx.doneByAddr[normAddr(address)] ?? ""));
          const vacant = /^\d{4}-\d{2}-\d{2}$/.test(moDoneAll) || (/^\d{4}-\d{2}-\d{2}$/.test(moSched) && moSched <= todayQ);
          // Pre-listed occupied units (PreLease: live listing, tenant still in
          // place) join the queue too (Brittany 2026-09-09, unit 447916) - a live
          // listing needs the weekly loop even before move out. Everything else
          // still requires vacancy.
          const listedEarly = /^\d{4}-\d{2}-\d{2}$/.test(listDate);
          // ... and so do occupied units whose Listing Settings plan is approved
          // or carries a Target List Date (Brittany 2026-09-21, unit 387050):
          // the plan says list early, so the bench must show the row for Go
          // Live before vacancy. Plan Status Draft/Sent/Rejected/Offload does
          // not qualify; Revised counts (it is the approved-plan unlock state).
          const lsHitQ = (unitIdQ && lsIdx[unitIdQ]) || lsAddrIdx[normAddr(address)];
          const planReady = !!lsHitQ && (
            ["accepted", "team lead approved", "revised"].includes(lsHitQ.planStatus.toLowerCase()) ||
            /^\d{4}-\d{2}-\d{2}$/.test(lsHitQ.targetListDate));
          // completed tasks already passed the Move In Pending gate above and can
          // be pre-move-out (PreLease signed early), so vacancy is not required
          if (!t.completed && !vacant && !(listedEarly && !leaseSigned) && !planReady && !(relistPending && !leaseSigned)) continue;
          const occupiedUntil = !vacant && /^\d{4}-\d{2}-\d{2}$/.test(moSched) && moSched > todayQ ? moSched : "";
          // Do Not List (Brittany 2026-08-27): owner selling / self-listing / moving
          // back in / other. Stays visible at the bottom of the queue for awareness,
          // but owes no weekly update.
          const doNotList = String(cfQ.find((f) => f.gid === "1214787859185273")?.display_value ?? "").trim();
          const listed = /^\d{4}-\d{2}-\d{2}$/.test(listDate) && listDate <= todayQ;
          const state = leaseSigned ? "premovein" : (listed ? "leasing" : "turnover");
          const unitId = unitIdQ;
          const dom = listed ? Math.max(0, Math.floor((Date.parse(todayQ + "T12:00:00Z") - Date.parse(listDate + "T12:00:00Z")) / 86400000)) : null;
          // MOD pill: lastReview stamped by execDecision into Price History; fallback
          // to the newest event date so pre-bench price drops still count
          let modDate: string | null = null;
          let updDate: string | null = null; // last owner update sent (warSubmit stamps lastUpdate)
          try {
            const phRaw = String(cfQ.find((f) => /price history/i.test(String(f.name)))?.display_value ?? "");
            if (phRaw) {
              const p0 = JSON.parse(phRaw);
              const ph0 = (p0 && typeof p0 === "object" && !Array.isArray(p0)) ? p0 : { events: p0 };
              if (/^\d{4}-\d{2}-\d{2}/.test(String(ph0.lastUpdate ?? ""))) updDate = String(ph0.lastUpdate).slice(0, 10);
              if (/^\d{4}-\d{2}-\d{2}/.test(String(ph0.lastReview ?? ""))) modDate = String(ph0.lastReview).slice(0, 10);
              else {
                const ds = (Array.isArray(ph0.events) ? ph0.events : [])
                  .map((e: Record<string, unknown>) => String(e?.date ?? e?.on ?? "").slice(0, 10))
                  .filter((d0: string) => /^\d{4}-\d{2}-\d{2}$/.test(d0)).sort();
                if (ds.length) modDate = ds[ds.length - 1];
              }
            }
          } catch { /* unparseable history: pill shows never */ }
          // MODs are owed on all listed and/or vacant units (Brittany 2026-09-09):
          // a Turn Over or Move In Pending unit gets its weekly review too. The
          // first week (on market, or of vacancy) owes nothing yet.
          const cycleStart = state === "leasing" ? listDate : (moDoneAll || moSched);
          const cycleDays = /^\d{4}-\d{2}-\d{2}$/.test(cycleStart)
            ? Math.floor((Date.parse(todayQ + "T12:00:00Z") - Date.parse(cycleStart + "T12:00:00Z")) / 86400000) : null;
          // occupied AND unlisted (the plan-ready rows the gate now admits):
          // owes no MOD and no WAR until it is listed or vacant - the row is
          // there for Go Live, not the weekly loop
          const preListing = !vacant && !listed && !leaseSigned;
          const modOverdue = doNotList || preListing || (cycleDays != null && cycleDays <= 6) ? false
            : (!modDate || Math.floor((Date.parse(todayQ + "T12:00:00Z") - Date.parse(modDate + "T12:00:00Z")) / 86400000) >= 7);
          rows.push({ gid: t.gid, url: `https://app.asana.com/0/0/${t.gid}`, address, unitId, teamLead: "", agent: String(t.assignee?.name ?? ""), lsGid: "", listDate, state, doNotList, dom, moveOut: /^\d{4}-\d{2}-\d{2}$/.test(moSched) ? moSched : (moDoneAll || null), moveIn: /^\d{4}-\d{2}-\d{2}$/.test(miOpen) ? miOpen : "", occupiedUntil, modDate, modOverdue, firstWeek: state === "leasing" && dom != null && dom <= 6, updDate, signedDate: leaseSigned && /^\d{4}-\d{2}-\d{2}$/.test(lsdQ) ? lsdQ : "", warGid: "", warDue: null, warMissing: null,
            // move out CONFIRMED = a Move Out Completion Date exists (feedback
            // 1219284214483670): only then is a turnover row "TO In Progress";
            // a scheduled-but-unconfirmed move out shows as pending on the bench
            // (a completion date 14+ days before the scheduled move out is a prior
            // cycle's); null = no move out on record at all (new property), so
            // the bench keeps its old label rather than claim a pending move out
            // a filled Move-Out task completion date = officially Turn Over (2026-10-24);
            // the 14-day sanity window only guards the LU / master fallbacks
            moConfirmed: moProj ? true : !/^\d{4}-\d{2}-\d{2}$/.test(moSched) && !/^\d{4}-\d{2}-\d{2}$/.test(moDoneAll) ? null
              : /^\d{4}-\d{2}-\d{2}$/.test(moDoneAll) && (!/^\d{4}-\d{2}-\d{2}$/.test(moSched) ||
                Date.parse(moDoneAll + "T12:00:00Z") >= Date.parse(moSched + "T12:00:00Z") - 14 * 86400000),
            relistPending });
        }
        offQ = j0.next_page?.offset ?? "";
        if (!offQ) break;
      }
      // longest on market first; unlisted vacancies (no DOM) sort below listed
      rows.sort((a, b) => (b.dom ?? -1) - (a.dom ?? -1));
      // heartbeat BEFORE the cap: a missing-WAR listing at low DOM must not be cut
      // (Brittany 2026-08-26: missing reports sort to the top of the queue)
      const queue = rows.slice(0, 150);
      // team lead + Target List Date from the Listing Settings index built
      // above the gate
      queue.forEach((q) => {
        const hitL = (q.unitId && lsIdx[q.unitId]) || lsAddrIdx[normAddr(q.address)];
        if (hitL) { q.teamLead = hitL.teamLead; q.lsGid = hitL.lsGid; q.targetListDate = /^\d{4}-\d{2}-\d{2}$/.test(hitL.targetListDate) ? hitL.targetListDate : ""; }
        // NO fallback to the LU assignee (Brittany 2026-09-18): a blank lead
        // renders as an assign dropdown on the bench instead, and the pick
        // writes to (or creates) the Listing Settings task via execSetLead
      });
      // WAR subtask per listing, concurrency 5, fail-soft
      for (let i = 0; i < queue.length; i += 5) {
        await Promise.all(queue.slice(i, i + 5).map(async (q) => {
          try {
            const subs = await asana("GET", `/tasks/${q.gid}/subtasks?limit=100&opt_fields=name,due_on,completed`);
            const w = ((subs ?? []) as Array<{ gid: string; name: string; due_on?: string | null; completed?: boolean }>)
              .find((s) => !s.completed && /weekly activity report/i.test(s.name)) ??
              ((subs ?? []) as Array<{ gid: string; name: string; due_on?: string | null }>).find((s) => /weekly activity report/i.test(s.name));
            const noWarQ = q.firstWeek || q.doNotList || (q.state === "turnover" && q.occupiedUntil); // occupied pre-listing: no WAR owed yet
            if (w) {
              q.warGid = w.gid;
              q.warDue = w.due_on ?? null;
              q.warMissing = noWarQ ? false : (!w.due_on || String(w.due_on) < todayQ);
            } else q.warMissing = noWarQ ? false : true; // no subtask: nothing is being reported
          } catch { q.warMissing = null; }
        }));
      }
      // days on market first; WAR overdue breaks ties, MOD overdue third (Brittany 2026-08-26)
      queue.sort((a, b) => {
        const adn = a.doNotList ? 1 : 0, bdn = b.doNotList ? 1 : 0;
        if (adn !== bdn) return adn - bdn;
        const ad = a.dom ?? -1, bd = b.dom ?? -1;
        if (bd !== ad) return bd - ad;
        const am = a.warMissing === true ? 0 : 1, bm = b.warMissing === true ? 0 : 1;
        if (am !== bm) return am - bm;
        return (a.modOverdue ? 0 : 1) - (b.modOverdue ? 0 : 1);
      });
      const payloadQ = { ok: true, listings: queue, total: rows.length };
      execCache = { at: Date.now(), payload: payloadQ };
      return j(headers, 200, payloadQ);
    }

    // ---------- warQueue: per-agent report list for the field WAR tool (2026-08-26) ----------
    // Every OPEN LU/TP/PreLease (any state - turnover reports are weekly too), with the
    // assignee and the WAR subtask due date, so an agent picks their name and works
    // their overdue reports one by one from the road.
    if (action === "warQueue") {
      return j(headers, 200, await buildWarQueue() as unknown as Record<string, unknown>);
    }

    // ---------- execTotals: cumulative listing activity for the card hover ----------
    // Reads the LU's three cumulative number fields (# of Inquiries / Showings /
    // Applications, maintained by warSubmit's self-healing recompute).
    // NOTE renamed from execActivity 2026-09-22: that name already belonged to
    // the Review Activity report reader, and the duplicate shadowed it (bench
    // showed "No weekly report submitted" on every populate).
    if (action === "execTotals") {
      const gidA = String(body.taskGid ?? "").replace(/\D/g, "");
      if (!gidA) return j(headers, 400, { error: "missing_fields" });
      try {
        const tA = await asana("GET", `/tasks/${gidA}?opt_fields=custom_fields.name,custom_fields.number_value`) as { custom_fields?: Array<{ name?: string; number_value?: number | null }> };
        const cfA = tA.custom_fields ?? [];
        const numA = (re: RegExp) => { const f = cfA.find((x) => re.test(String(x.name ?? ""))); return f?.number_value ?? 0; };
        return j(headers, 200, { ok: true, inquiries: numA(/#\s*of\s*inquiries/i), showings: numA(/#\s*of\s*showings/i), applications: numA(/#\s*of\s*applications/i) });
      } catch { return j(headers, 502, { error: "asana_failed", message: "Could not read the activity totals." }); }
    }

    // ---------- execDelist: take a live listing off market (team 2026-09-21) ----------
    // Delists the unit in Buildium, clears the LU's List Date (the queue, WAR,
    // and DOM logic all key on it; Go Live re-stamps it at relist so DOM
    // restarts), comments on the LU @mentioning the leasing agent, and routes
    // by reason: repairs / reset DOM / selling park the task in Temporarily
    // Off Market reassigned to the Team Lead (due = relist date); offloading
    // marks the LU complete.
    if (action === "execDelist") {
      const luGidD = String(body.taskGid ?? "").replace(/\D/g, "");
      const uidD = String(body.unitId ?? "").replace(/\D/g, "");
      const reasonD = String(body.reason ?? "");
      const relistD = String(body.relistDate ?? "").slice(0, 10);
      const REASONS: Record<string, string> = {
        repairs: "Additional repairs / upgrades",
        reset_dom: "Reset DOM",
        selling: "Owner selling",
        offloading: "Offloading property",
        other: "Other",
      };
      if (!luGidD) return j(headers, 400, { error: "missing_fields" });
      if (!REASONS[reasonD]) return j(headers, 400, { error: "bad_reason", message: "Pick a delist reason." });
      if (relistD && !/^\d{4}-\d{2}-\d{2}$/.test(relistD)) return j(headers, 400, { error: "bad_date", message: "Re-list date must be YYYY-MM-DD." });
      const notesD: string[] = [];
      if (uidD) {
        try {
          const BHD = { "x-buildium-client-id": BUILDIUM_ID, "x-buildium-client-secret": BUILDIUM_SECRET, "Content-Type": "application/json" };
          const rd = await fetch(`https://api.buildium.com/v1/rentals/units/${uidD}/listing`, { method: "DELETE", headers: BHD });
          notesD.push(rd.ok || rd.status === 404 ? "Unit delisted in Buildium." : `Buildium delist failed (${rd.status}); delist by hand.`);
        } catch { notesD.push("Buildium delist failed; delist by hand."); }
      } else notesD.push("No Unit ID; delist in Buildium by hand.");
      const LD_FD = "1213182838328964"; // List Date
      let agentD = "", addressD = "", oldList = "", ownerEmailD = "", ownerNameD = "";
      try {
        const luT = await asana("GET", `/tasks/${luGidD}?opt_fields=name,assignee.gid,custom_fields.gid,custom_fields.name,custom_fields.display_value`) as { name?: string; assignee?: { gid?: string } | null; custom_fields?: Array<{ gid: string; name?: string; display_value: string | null }> };
        addressD = addressFromTaskName(String(luT.name ?? "")) || String(luT.name ?? "");
        agentD = String(luT.assignee?.gid ?? "");
        ({ email: ownerEmailD, name: ownerNameD } = ownerFromCf((luT.custom_fields ?? []) as Array<{ name?: string; display_value?: string | null }>));
        oldList = String((luT.custom_fields ?? []).find((f) => f.gid === LD_FD)?.display_value ?? "").slice(0, 10);
        await asana("PUT", `/tasks/${luGidD}`, { custom_fields: { [LD_FD]: null } });
        notesD.push(`List Date cleared${oldList ? ` (was ${oldList})` : ""}; Go Live re-stamps it at relist, so DOM restarts.`);
      } catch { notesD.push("Could not clear the List Date; clear it by hand."); }
      // every delist except offloading parks the LU in Temporarily Off Market
      // (Brittany 2026-10-27: "Other" was leaving it in Active Listings)
      const parkedD = ["repairs", "reset_dom", "selling", "other"].includes(reasonD);
      if (parkedD) {
        try {
          const secsD = ((await asana("GET", `/projects/${LEASING_LU_PROJECT}/sections?limit=100&opt_fields=name`)) ?? []) as Array<{ gid: string; name: string }>;
          let offD = secsD.find((s0) => /temporarily off market/i.test(String(s0.name)));
          if (!offD) offD = await asana("POST", `/projects/${LEASING_LU_PROJECT}/sections`, { name: "Temporarily Off Market" }) as { gid: string; name: string };
          await asana("POST", `/tasks/${luGidD}/addProject`, { project: LEASING_LU_PROJECT, section: offD.gid });
          notesD.push("Moved to Temporarily Off Market.");
        } catch { notesD.push("Could not move the task to Temporarily Off Market."); }
        try {
          let leadGidD = "";
          if (uidD) {
            const hitsD = ((await asana("GET", `/workspaces/${WORKSPACE}/tasks/search?projects.any=1217446710785429&custom_fields.1213183515622826.value=${uidD}&opt_fields=custom_fields.gid,custom_fields.people_value.gid`)) ?? []) as Array<{ custom_fields?: Array<{ gid: string; people_value?: Array<{ gid: string }> }> }>;
            leadGidD = String((hitsD[0]?.custom_fields ?? []).find((f) => f.gid === "1217446711292696")?.people_value?.[0]?.gid ?? "");
          }
          const putD: Record<string, unknown> = {};
          if (leadGidD) putD.assignee = leadGidD;
          if (relistD) putD.due_on = relistD;
          if (Object.keys(putD).length) {
            await asana("PUT", `/tasks/${luGidD}`, putD);
            notesD.push(`${leadGidD ? "Reassigned to the Team Lead" : "Assignee unchanged (no Team Lead found)"}${relistD ? `; due ${relistD} (relist)` : ""}.`);
          } else notesD.push("No Team Lead found on Listing Settings; assignee unchanged.");
        } catch { notesD.push("Could not reassign / set the relist due date."); }
      }
      if (reasonD === "offloading") {
        try { await asana("PUT", `/tasks/${luGidD}`, { completed: true }); notesD.push("LU task marked complete (offloading)."); }
        catch { notesD.push("Could not complete the LU task."); }
      }
      try {
        const mentionD = agentD ? `<a data-asana-gid="${agentD}"/> ` : "";
        const bodyD = `DELISTED (Execute + Adapt bench)\nReason: ${REASONS[reasonD]}${relistD ? `\nRe-list date: ${relistD}` : ""}${oldList ? `\nWas listed since ${oldList}` : ""}\n${notesD.join("\n")}`;
        await asana("POST", `/tasks/${luGidD}/stories`, { html_text: `<body>${mentionD}${bodyD}</body>` })
          .catch(async () => { await asana("POST", `/tasks/${luGidD}/stories`, { text: bodyD }); });
      } catch { /* comment is best-effort */ }
      execCache = null;
      warqCache = null;
      return j(headers, 200, { ok: true, reason: REASONS[reasonD], notes: notesD, address: addressD, ownerEmail: ownerEmailD, ownerName: ownerNameD });
    }

    // ---------- execDelistEmail: log the owner delist email copy on the LU ----------
    if (action === "execDelistEmail") {
      const luGidE = String(body.taskGid ?? "").replace(/\D/g, "");
      const copyE = String(body.emailCopy ?? "").trim().slice(0, 8000);
      if (!luGidE || !copyE) return j(headers, 400, { error: "missing_fields" });
      try {
        await asana("POST", `/tasks/${luGidE}/stories`, { text: `OWNER DELIST EMAIL (Execute + Adapt bench)\nSent from listings@sagareus.com; copy below.\n\n${copyE}` });
        return j(headers, 200, { ok: true, loggedOn: "the LU task" });
      } catch {
        return j(headers, 502, { error: "asana_failed", message: "Could not post the email copy." });
      }
    }

    if (action === "execLateWars") {
      // one accountability task listing every late WAR, grouped by agent, in
      // Aster's Audits - the write-up starting point (Brittany 2026-08-27)
      const wq = await buildWarQueue();
      const late = (wq.rows as Array<{ gid: string; address: string; agent: string; agentGid?: string; state: string; dom: number | null; warDue: string | null; warMissing: boolean | null }>).filter((r) => r.warMissing === true);
      const todayL = new Date(Date.now() - 7 * 3600 * 1000).toISOString().slice(0, 10);
      const AUD = "1214497250193277"; // Aster's Audits
      if (!late.length) {
        // Everyone reported on time: a task for Brittany so she can send the
        // appreciation email to the team (Brittany 2026-09-21). Idempotent per day.
        const nameOk = `All WARs On Time | ${todayL}`;
        try {
          const ex0 = ((await asana("GET", `/projects/${AUD}/tasks?completed_since=now&limit=100&opt_fields=name`)) ?? []) as Array<{ gid: string; name: string }>;
          const hit0 = ex0.find((t) => t.name === nameOk);
          if (hit0) return j(headers, 200, { ok: true, created: false, count: 0, agents: 0, onTimeUrl: `https://app.asana.com/0/0/${hit0.gid}`, message: "All reports on time; already recorded today." });
        } catch { /* create anyway */ }
        const total0 = (wq.rows as Array<{ warMissing: boolean | null }>).filter((r) => r.warMissing === false).length;
        const t0 = await asana("POST", "/tasks", {
          name: nameOk,
          projects: [AUD],
          assignee: "1203784854198936",
          due_on: todayL,
          notes: `Every weekly activity report was submitted on time this week${total0 ? ` (${total0} report${total0 > 1 ? "s" : ""})` : ""}. Mock up the appreciation email to the leasing team.\n\nGenerated by the Tuesday late-WAR sweep. Done by Claude on behalf of the team lead.`,
        });
        return j(headers, 200, { ok: true, created: true, count: 0, agents: 0, onTimeUrl: `https://app.asana.com/0/0/${t0.gid}`, message: "All reports on time; appreciation task created." });
      }
      const nameL = `Late WARs | ${todayL} | ${late.length} report${late.length > 1 ? "s" : ""}`;
      try {
        const ex = ((await asana("GET", `/projects/${AUD}/tasks?completed_since=now&limit=100&opt_fields=name`)) ?? []) as Array<{ gid: string; name: string }>;
        const hitE = ex.find((t) => t.name === nameL);
        if (hitE) return j(headers, 200, { ok: true, created: false, count: late.length, agents: 0, url: `https://app.asana.com/0/0/${hitE.gid}`, message: "Already recorded today." });
      } catch { /* create anyway */ }
      const by: Record<string, typeof late> = {};
      late.forEach((r) => { const k = r.agent || "No assignee"; (by[k] = by[k] || []).push(r); });
      const stLbl = (st0: string) => st0 === "premovein" ? "Move In Pending" : st0 === "turnover" ? "Turnover In Progress" : "Active Listing";
      const L: string[] = [`Late Weekly Activity Reports | ${todayL}`, ""];
      Object.keys(by).sort().forEach((k) => {
        L.push(`${k} (${by[k].length}):`);
        by[k].forEach((r) => L.push(`\u2022 ${r.address} - ${r.warDue ? "was due " + r.warDue : "never submitted"} (${stLbl(r.state)}${r.dom != null ? ", " + r.dom + " DOM" : ""})`));
        L.push("");
      });
      L.push("One write-up per agent above.");
      L.push("Generated from the Execute & Adapt bench. Done by Claude on behalf of the team lead.");
      const tL = await asana("POST", "/tasks", {
        name: nameL,
        projects: [AUD],
        assignee: "1203784854198936",
        due_on: todayL,
        notes: L.join("\n"),
      });
      // Per-agent subtask, assigned + due today, with an @mention comment that
      // also cc's the property's team lead(s) from Listing Settings
      // (Brittany 2026-09-21).
      let subtasksMade = 0;
      for (const agentName of Object.keys(by).sort()) {
        const rows9 = by[agentName] as Array<{ gid: string; address: string; agentGid?: string; warDue: string | null; state: string; dom: number | null }>;
        const agentGid = (rows9.find((r) => r.agentGid)?.agentGid ?? "").replace(/\D/g, "");
        // team leads for these properties: LU -> Unit ID -> LS Team Lead
        const leadGids = new Set<string>();
        for (const r9 of rows9.slice(0, 10)) {
          try {
            const lu9 = await asana("GET", `/tasks/${r9.gid}?opt_fields=custom_fields.gid,custom_fields.display_value`) as { custom_fields?: Array<{ gid: string; display_value: string | null }> };
            const uid9 = String((lu9.custom_fields ?? []).find((f) => f.gid === "1213183515622826")?.display_value ?? "").replace(/\D/g, "");
            if (!uid9) continue;
            const hits9 = ((await asana("GET", `/workspaces/${WORKSPACE}/tasks/search?projects.any=1217446710785429&custom_fields.1213183515622826.value=${uid9}&opt_fields=custom_fields.gid,custom_fields.people_value.gid`)) ?? []) as Array<{ custom_fields?: Array<{ gid: string; people_value?: Array<{ gid: string }> }> }>;
            for (const p9 of (hits9[0]?.custom_fields ?? []).find((f) => f.gid === "1217446711292696")?.people_value ?? []) {
              if (p9.gid && p9.gid !== agentGid) leadGids.add(p9.gid);
            }
          } catch { /* mention the agent alone */ }
        }
        try {
          const bullets = rows9.map((r) => `\u2022 ${r.address} - ${r.warDue ? "was due " + r.warDue : "never submitted"}`);
          const sub9 = await asana("POST", "/tasks", {
            name: "Submit Overdue Activity Report(s)",
            parent: tL.gid,
            ...(agentGid ? { assignee: agentGid } : {}),
            due_on: todayL,
            notes: `${agentName}: the weekly activity report(s) below are overdue. Submit today from the WAR tool on /field.\n\n${bullets.join("\n")}`,
          }) as { gid: string };
          const mention = agentGid ? `<a data-asana-gid="${agentGid}"/>` : agentName;
          const ccLeads = [...leadGids].map((g) => `<a data-asana-gid="${g}"/>`).join(" ");
          await asana("POST", `/tasks/${sub9.gid}/stories`, {
            html_text: `<body>${mention} the weekly activity report(s) on this task are overdue; submit today from the WAR tool.${ccLeads ? `\ncc ${ccLeads}` : ""}</body>`,
          }).catch(() => null);
          subtasksMade++;
        } catch { /* the parent write-up still stands */ }
      }
      return j(headers, 200, { ok: true, created: true, count: late.length, agents: Object.keys(by).length, subtasks: subtasksMade, url: `https://app.asana.com/0/0/${tL.gid}` });
    }

    // deduped builder shared by warQueue + execLateWars (hoisted; cached 2 min)
    async function buildWarQueue(): Promise<{ ok: boolean; agents: string[]; rows: unknown[] }> {
      if (warqCache && Date.now() - warqCache.at < 2 * 60 * 1000) return warqCache.payload as { ok: boolean; agents: string[]; rows: unknown[] };
      const todayW = new Date(Date.now() - 7 * 3600 * 1000).toISOString().slice(0, 10);
      const LDW = "1213182838328964";
      const moIdxW = await moveOutIndex().catch(() => ({ byUid: {} as Record<string, string>, byAddr: {} as Record<string, string>, uidByAddr: {} as Record<string, string>, doneByUid: {} as Record<string, string>, doneByAddr: {} as Record<string, string>, masterByUid: {} as Record<string, string>, moProjByUid: {} as Record<string, string>, moProjByAddr: {} as Record<string, string> }));
      type WRow = { gid: string; address: string; agent: string; agentGid: string; state: string; dom: number | null; warDue: string | null; warMissing: boolean | null; noWar?: boolean };
      const rowsW: WRow[] = [];
      let offW = "";
      // completed_since 90 days back so Move In Pending units (LU completed at lease
      // signing) can still show as informational rows (Brittany 2026-09-11)
      const sinceW = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
      const MI_FW = "1213183520317831"; // 🙌 Move in Date
      for (let pg = 0; pg < 12; pg++) {
        const r0 = await fetch(`${ASANA}/projects/${LEASING_LU_PROJECT}/tasks?completed_since=${sinceW}&limit=100&opt_fields=name,completed,assignee.gid,assignee.name,custom_fields.gid,custom_fields.name,custom_fields.display_value${offW ? `&offset=${encodeURIComponent(offW)}` : ""}`,
          { headers: { "Authorization": `Bearer ${ASANA_PAT}` } });
        const j0 = await r0.json().catch(() => ({}));
        for (const t of (j0.data ?? []) as Array<{ gid: string; name: string; completed?: boolean; assignee?: { gid: string; name: string } | null; custom_fields?: Array<{ gid: string; name: string; display_value: string | null }> }>) {
          if (!/^(LU|TP|PreLease)\s*\|/i.test(t.name)) continue;
          const address = addressFromTaskName(t.name);
          if (!address || address.includes("<")) continue;
          const cfW = t.custom_fields ?? [];
          const listDate = String(cfW.find((f) => f.gid === LDW)?.display_value ?? "").slice(0, 10);
          const leaseSignedRawW = String(cfW.find((f) => /lease signed/i.test(String(f.name)))?.display_value ?? "").trim();
          // stale lease-signed guard, same rule as execQueue (team 2026-09-16)
          const miOpenW = String(cfW.find((f) => f.gid === MI_FW)?.display_value ?? "").slice(0, 10);
          const lsdW = leaseSignedRawW.slice(0, 10);
          const staleSignedW = !!leaseSignedRawW && !t.completed &&
            !(/^\d{4}-\d{2}-\d{2}$/.test(miOpenW) && miOpenW >= todayW) &&
            /^\d{4}-\d{2}-\d{2}$/.test(lsdW) &&
            (Date.parse(todayW + "T12:00:00Z") - Date.parse(lsdW + "T12:00:00Z")) / 86400000 > 45;
          const leaseSigned = staleSignedW ? "" : leaseSignedRawW;
          const moOwnW = String(cfW.find((f) => f.gid === "1213182815411738")?.display_value ?? "").slice(0, 10);
          const moDoneW = String(cfW.find((f) => f.gid === "1214521745467158")?.display_value ?? "").slice(0, 10);
          const uidW = String(cfW.find((f) => f.gid === "1213183515622826")?.display_value ?? "").trim() || (moIdxW.uidByAddr[normAddr(address)] ?? "");
          const moSchedW = /^\d{4}-\d{2}-\d{2}$/.test(moOwnW) ? moOwnW : (moIdxW.byUid[uidW] ?? moIdxW.byAddr[normAddr(address)] ?? "");
          const moDoneAllW = (moIdxW.moProjByUid[uidW] ?? moIdxW.moProjByAddr[normAddr(address)] ?? "") || (/^\d{4}-\d{2}-\d{2}$/.test(moDoneW) ? moDoneW : (moIdxW.doneByUid[uidW] ?? moIdxW.doneByAddr[normAddr(address)] ?? ""));
          if (String(cfW.find((f) => f.gid === "1214787859185273")?.display_value ?? "").trim()) continue; // Do Not List: no weekly report owed
          // WARs are owed on ALL LISTED units regardless of occupancy or vacancy
          // (Brittany 2026-09-09 correction). Unlisted vacants (Turn Over) and
          // Move In Pending units owe MODs on the exec bench, no WAR — they show
          // here greyed out with a "No WAR needed" note so agents can see WHY an
          // address is not on their report list (Brittany 2026-09-11).
          const listedW2 = /^\d{4}-\d{2}-\d{2}$/.test(listDate) && listDate <= todayW;
          const warOwed = !t.completed && listedW2 && !leaseSigned;
          if (!warOwed) {
            const vacantW = /^\d{4}-\d{2}-\d{2}$/.test(moDoneAllW) || (/^\d{4}-\d{2}-\d{2}$/.test(moSchedW) && moSchedW <= todayW);
            const miW = String(cfW.find((f) => f.gid === MI_FW)?.display_value ?? "").slice(0, 10);
            const pendingMoveIn = !!leaseSigned && (!t.completed || (/^\d{4}-\d{2}-\d{2}$/.test(miW) && miW > todayW));
            if (t.completed && !pendingMoveIn) continue; // historic cycle, not informational
            if (!vacantW && !pendingMoveIn) continue;    // occupied, no live listing: off the tool
          }
          const listed = /^\d{4}-\d{2}-\d{2}$/.test(listDate) && listDate <= todayW;
          const state = leaseSigned ? "premovein" : (listed ? "leasing" : "turnover");
          const dom = listed ? Math.max(0, Math.floor((Date.parse(todayW + "T12:00:00Z") - Date.parse(listDate + "T12:00:00Z")) / 86400000)) : null;
          rowsW.push({ gid: t.gid, address, agent: String(t.assignee?.name ?? ""), agentGid: String(t.assignee?.gid ?? ""), state, dom, warDue: null, warMissing: warOwed ? null : false, noWar: warOwed ? undefined : true });
        }
        offW = j0.next_page?.offset ?? "";
        if (!offW) break;
      }
      const rowsDue = rowsW.filter((r0) => !r0.noWar);
      for (let i = 0; i < rowsDue.length; i += 5) {
        await Promise.all(rowsDue.slice(i, i + 5).map(async (q) => {
          try {
            const subs = await asana("GET", `/tasks/${q.gid}/subtasks?limit=100&opt_fields=name,due_on,completed`);
            const w = ((subs ?? []) as Array<{ gid: string; name: string; due_on?: string | null; completed?: boolean }>)
              .find((s0) => !s0.completed && /weekly activity report/i.test(s0.name)) ??
              ((subs ?? []) as Array<{ gid: string; name: string; due_on?: string | null }>).find((s0) => /weekly activity report/i.test(s0.name));
            if (w) {
              q.warDue = w.due_on ?? null;
              q.warMissing = !w.due_on || String(w.due_on) < todayW;
            } else q.warMissing = true;
            // first-week grace for listed units, same rule as the bench queue
            if (q.state === "leasing" && q.dom != null && q.dom <= 6 && q.warDue == null) q.warMissing = false;
          } catch { q.warMissing = null; }
        }));
      }
      const agents = Array.from(new Set(rowsW.map((r0) => r0.agent).filter(Boolean))).sort();
      const payloadW = { ok: true, agents, rows: rowsW };
      warqCache = { at: Date.now(), payload: payloadW };
      return payloadW;
    }

    // ---------- execTurnComments: latest human updates off the Turn Over task ----------
    // Feeds the owner report's THIS WEEK'S UPDATE for Turnover In Progress units
    // (Brittany 2026-08-27): the two most recent comments, minus pinned plan blocks
    // and tool signatures.
    // ---------- execLinks: sticky-header extras for the Execute + Adapt V3 bench ----------
    // (Brittany 2026-10-24) The Leasing master's Special Note plus quick links to its
    // Move-Out and Turn Over subtasks. Read only. Unit ID first, address second.
    if (action === "execLinks") {
      const uidL = String(body.unitId ?? "").replace(/\D/g, "");
      const addrL = String(body.address ?? "").trim();
      try {
        const idxL = await moveOutIndex();
        const uidL2 = uidL || (addrL ? idxL.uidByAddr[normAddr(addrL)] ?? "" : "");
        const masterL = uidL2 ? idxL.masterByUid[uidL2] ?? "" : "";
        if (!masterL) return j(headers, 200, { ok: true, masterGid: "", specialNote: "", moGid: "", toGid: "" });
        const mt = await asana("GET", `/tasks/${masterL}?opt_fields=custom_fields.gid,custom_fields.display_value`) as { custom_fields?: Array<{ gid: string; display_value: string | null }> };
        const note = String((mt.custom_fields ?? []).find((f) => f.gid === "1209696172337706")?.display_value ?? "").trim();
        const subsL = ((await asana("GET", `/tasks/${masterL}/subtasks?limit=100&opt_fields=name,completed,completed_at,created_at,projects.gid`)) ?? []) as Array<{ gid: string; name: string; completed?: boolean; completed_at?: string | null; created_at?: string; projects?: Array<{ gid: string }> }>;
        // newest open first, then newest closed, in the Move-Out / Turn Over projects
        const pickT = (proj: string) => subsL.filter((x) => (x.projects ?? []).some((p) => p.gid === proj))
          .sort((a, b) => (Number(!!a.completed) - Number(!!b.completed)) || String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))[0];
        const toT = pickT("1213171760535170");
        // Turn Over complete? (Brittany 2026-10-21: tells the lead how to set the rent ready date)
        return j(headers, 200, { ok: true, masterGid: masterL, specialNote: note.slice(0, 600),
          moGid: pickT("1213171760534561")?.gid ?? "", toGid: toT?.gid ?? "",
          toDone: toT ? !!toT.completed : null, toDoneOn: toT?.completed_at ? String(toT.completed_at).slice(0, 10) : "" });
      } catch { return j(headers, 502, { error: "asana_failed", message: "Could not read the Leasing master." }); }
    }

    if (action === "execTurnComments") {
      const addrT = String(body.address ?? "").trim();
      if (!addrT) return j(headers, 400, { error: "missing_address" });
      let toGid = "";
      try {
        const streetNoT = (addrT.match(/^\d+/) ?? [""])[0];
        const hitsT = await asana("GET", `/workspaces/${WORKSPACE}/typeahead?resource_type=task&query=${encodeURIComponent("Turn Over | " + addrT.slice(0, 40))}&count=8&opt_fields=name,completed`);
        const toT = (hitsT ?? []).find((x: { name: string; completed?: boolean }) => !x.completed && /^turn\s*over\s*\|/i.test(x.name) && (!streetNoT || x.name.includes(streetNoT))) ??
          (hitsT ?? []).find((x: { name: string }) => /^turn\s*over\s*\|/i.test(x.name) && (!streetNoT || x.name.includes(streetNoT)));
        toGid = toT?.gid ?? "";
      } catch { /* none found */ }
      if (!toGid) return j(headers, 200, { ok: true, comments: [], toGid: "", dispatched: "" });
      let dispatched = "";
      try {
        const tT = await asana("GET", `/tasks/${toGid}?opt_fields=custom_fields.gid,custom_fields.display_value`);
        dispatched = String(((tT.custom_fields ?? []) as Array<{ gid: string; display_value: string | null }>).find((f) => String(f.gid) === "1214522138482281")?.display_value ?? "").slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dispatched)) dispatched = "";
      } catch { /* header shows TBD */ }
      const stT = ((await allStories(toGid, "type,text,html_text,created_at,created_by.name")) ?? []) as Array<{ type: string; text?: string; html_text?: string; created_at?: string; created_by?: { name?: string } | null }>;
      // @mentions: plain text carries only a profile URL whose gid the bot cannot
      // resolve (403), but html_text embeds the display name inside the mention
      // anchor - so derive the text from html_text when present (Brittany 2026-08-27)
      const fromHtml = (h: string) => h
        .replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, "$1")
        .replace(/<br\s*\/?\s*>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
      const uMap: Record<string, string> = {};
      try { (await workspaceUsers()).forEach((u) => { uMap[u.gid] = u.name; }); } catch { /* names stay as links */ }
      const comments = stT
        .filter((x) => x.type === "comment" && String(x.text ?? "").trim() && !/^---\s/.test(String(x.text).trim()))
        .map((x) => {
          let txt = (x.html_text ? fromHtml(String(x.html_text)) : String(x.text ?? ""))
            .replace(/https:\/\/app\.asana\.com\/(?:0|1\/\d+)\/profile\/(\d+)\/?/g, (_m0, g1: string) => uMap[g1] ? "@" + uMap[g1] : "@team member")
            .replace(/\s*\(via [^)]*\)/gi, "")
            .split(/\r?\n/).filter((l) => !/^done by claude/i.test(l.trim())).join("\n")
            .replace(/\n{3,}/g, "\n\n").trim();
          txt = txt.slice(0, 450);
          const d = String(x.created_at ?? "");
          const m = d.match(/\d{4}-(\d{2})-(\d{2})/);
          return { text: txt, date: m ? (+m[1]) + "/" + (+m[2]) : "", author: String(x.created_by?.name ?? "").split(" ")[0] };
        })
        .filter((c) => c.text);
      return j(headers, 200, { ok: true, toGid, toUrl: `https://app.asana.com/0/0/${toGid}`, dispatched, comments: comments.slice(-5).reverse() });
    }

    // ---------- execPlan: the approved plan off Listing Settings for one unit ----------
    if (action === "execPlan") {
      const uidP = String(body.unitId ?? "").replace(/\D/g, "");
      let lsGidP = String(body.lsGid ?? "").replace(/\D/g, "");
      if (!uidP && !lsGidP) return j(headers, 400, { error: "missing_unit" });
      if (!lsGidP && uidP) {
        try {
          const sHits = ((await asana("GET",
            `/workspaces/${WORKSPACE}/tasks/search?projects.any=1217446710785429&custom_fields.1213183515622826.value=${uidP}&opt_fields=name`)) ?? []) as Array<{ gid: string }>;
          lsGidP = sHits[0]?.gid ?? "";
        } catch { /* fall through */ }
      }
      if (!lsGidP) return j(headers, 404, { error: "no_listing_settings", message: "No Listing Settings task for this unit. Run the Plan + Propose bench first." });
      const tP = await asana("GET", `/tasks/${lsGidP}?opt_fields=name,custom_fields.gid,custom_fields.display_value,custom_fields.people_value.gid,custom_fields.people_value.name`);
      const cfP = (tP.custom_fields ?? []) as Array<{ gid: string; display_value: string | null; people_value?: Array<{ gid: string; name?: string }> }>;
      const gv = (g0: string) => String(cfP.find((f) => String(f.gid) === g0)?.display_value ?? "").trim();
      const gn = (g0: string) => { const n = Number(String(gv(g0)).replace(/[^0-9.]/g, "")); return Number.isFinite(n) && n > 0 ? n : null; };
      return j(headers, 200, {
        ok: true,
        lsGid: lsGidP,
        lsUrl: `https://app.asana.com/0/0/${lsGidP}`,
        adjPlan: gv("1217448328664674"),
        targetRent: gn("1217446658749360"),
        startingRent: gn("1217446589856415"),
        minRent: gn("1217446710834881"),
        marketRent: gn("1217530253031654"),
        leasingPlanUrl: gv("1217557090620385"),
        teamLead: gv("1217446711292696"),
        securityDeposit: gn("1217515853935577"),
        agentGid: String(cfP.find((f) => f.gid === "1217446729380828")?.people_value?.[0]?.gid ?? ""),
        agentName: String(cfP.find((f) => f.gid === "1217446729380828")?.people_value?.[0]?.name ?? ""),
        // the saved comp set (2026-09-12): both leasing benches share it - the Plan
        // bench writes it on lsPush, the Execute bench restores it here and writes
        // it back via execComps on send
        compsData: gv("1217516812648029"),
      });
    }

    // ---------- execGoLive: one-click listing activation (team 2026-09-18) ----------
    // Puts the Buildium listing live (rent + deposit + available date, floor-clamped),
    // stamps List Date, fills Sagareus Listing Link, hands the LU to the leasing
    // agent, moves the human-board card to Active Listings, @mentions the agent,
    // and assigns/dues the go-live subtasks. Every Asana step is fail-soft with a
    // note; Buildium failing with no existing listing aborts (nothing went live).
    if (action === "execGoLive") {
      const luGidG = String(body.taskGid ?? "").replace(/\D/g, "");
      const uidG = String(body.unitId ?? "").replace(/\D/g, "");
      const agentG = String(body.agentGid ?? "").replace(/\D/g, "");
      const rentG = Number(body.rent);
      const depG = body.deposit == null || body.deposit === "" ? null : Number(body.deposit);
      let availG = String(body.availableDate ?? "").slice(0, 10);
      if (!luGidG || !uidG) return j(headers, 400, { error: "missing_fields" });
      if (!Number.isFinite(rentG) || rentG < 100 || rentG > 50000) return j(headers, 400, { error: "bad_rent", message: "Enter a starting rent between $100 and $50,000." });
      if (depG != null && (!Number.isFinite(depG) || depG < 0 || depG > 100000)) return j(headers, 400, { error: "bad_deposit" });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(availG)) return j(headers, 400, { error: "bad_date", message: "Pick an available date." });
      if (!agentG) return j(headers, 400, { error: "no_agent", message: "Pick the leasing agent first." });
      const notesG: string[] = [];
      const todayG = new Date(Date.now() - 7 * 3600 * 1000).toISOString().slice(0, 10);
      // available-date floor: never sooner than move out + 21 days
      try {
        const idxG = await moveOutIndex();
        const moG = idxG.byUid[uidG] ?? "";
        if (/^\d{4}-\d{2}-\d{2}$/.test(moG)) {
          const floorG = new Date(Date.parse(moG + "T12:00:00Z") + 21 * 86400000).toISOString().slice(0, 10);
          if (availG < floorG) { notesG.push(`Available date raised to ${floorG} (21 days after the ${moG} move out).`); availG = floorG; }
        }
      } catch { /* no clamp possible */ }
      // Buildium: create-or-update the listing
      const BHG = { "x-buildium-client-id": BUILDIUM_ID, "x-buildium-client-secret": BUILDIUM_SECRET, "Content-Type": "application/json" };
      let hadListing = false;
      let listingId = "";
      try {
        const rl0 = await fetch(`https://api.buildium.com/v1/rentals/units/${uidG}/listing`, { headers: BHG });
        const L0 = rl0.ok ? await rl0.json().catch(() => null) : null;
        hadListing = rl0.ok && !!L0;
        const putB: Record<string, unknown> = {
          Rent: rentG,
          Deposit: depG != null ? depG : (L0?.Deposit ?? null),
          AvailableDate: availG,
          LeaseTerms: L0?.LeaseTerms ?? "",
        };
        if (L0?.Contact?.Id != null) putB.ContactId = L0.Contact.Id;
        if (putB.ContactId == null) {
          // listing CREATION requires a ContactId (422 on the first live run,
          // 2026-09-18): match the picked agent's email against Buildium's
          // listing contacts, else the shared Sagareus Leasing contact
          try {
            let agEmail = "";
            try { agEmail = String(((await asana("GET", `/users/${agentG}?opt_fields=email`)) as { email?: string })?.email ?? "").toLowerCase(); } catch { /* fall through */ }
            const rc0 = await fetch("https://api.buildium.com/v1/rentals/units/listingcontacts?limit=100", { headers: BHG });
            const cts = rc0.ok ? (await rc0.json().catch(() => [])) as Array<{ Id?: number; Name?: string; Email?: string }> : [];
            const hitC = (agEmail ? cts.find((ct) => String(ct.Email ?? "").toLowerCase() === agEmail) : undefined) ??
              cts.find((ct) => /leasing@sagareus\.com/i.test(String(ct.Email ?? ""))) ??
              cts.find((ct) => Number(ct.Id) > 0);
            if (hitC?.Id != null) { putB.ContactId = hitC.Id; notesG.push(`Listing contact: ${hitC.Name ?? hitC.Id}.`); }
          } catch { /* creation will 422 with a clear message */ }
        }
        const rp = await fetch(`https://api.buildium.com/v1/rentals/units/${uidG}/listing`, { method: "PUT", headers: BHG, body: JSON.stringify(putB) });
        if (!rp.ok) {
          const et = await rp.text().catch(() => "");
          // stuck delist state (2026-09-19, unit 344448): the unit still carries
          // IsUnitListed=true but the listing record is gone, so the upsert takes
          // the update path and 404s. Only Buildium can clear it.
          if (!hadListing && rp.status === 404 && /no listing found/i.test(et)) {
            return j(headers, 502, { error: "buildium_stuck", message: "Buildium has this unit flagged as listed but its listing record is missing (usually a delist still processing, or a hidden rather than deleted listing). Open the unit in Buildium, make sure the old listing is fully removed (or finish saving it), wait a minute, and retry. Nothing went live." });
          }
          if (!hadListing) return j(headers, 502, { error: "buildium_failed", message: `Buildium refused to create the listing (${rp.status}). ${et.slice(0, 200)} Nothing went live; fix in Buildium and retry.` });
          notesG.push(`Buildium listing update refused (${rp.status}); the existing listing stands with its old numbers.`);
        }
        const rl1 = await fetch(`https://api.buildium.com/v1/rentals/units/${uidG}/listing`, { headers: BHG });
        if (rl1.ok) {
          const L1 = await rl1.json().catch(() => null);
          listingId = String((String(L1?.RentalApplicationUrl ?? "").match(/listingId=(\d+)/) ?? [])[1] ?? "");
        }
      } catch {
        return j(headers, 502, { error: "buildium_failed", message: "Buildium did not answer. Nothing went live; try again." });
      }
      const sagaUrl = listingId ? `https://sagareus.managebuilding.com/Resident/public/rentals/${listingId}` : "";
      // 25+ unit properties need a MANUAL Zillow multifamily post (not synced from
      // Buildium; team 2026-09-19, two known properties): surface the unit count
      let unitsCount = 0;
      try {
        const ru = await fetch(`https://api.buildium.com/v1/rentals/units/${uidG}`, { headers: BHG });
        const uJ = ru.ok ? await ru.json().catch(() => null) : null;
        if (uJ?.PropertyId != null) {
          const rp2 = await fetch(`https://api.buildium.com/v1/rentals/${uJ.PropertyId}`, { headers: BHG });
          const pJ = rp2.ok ? await rp2.json().catch(() => null) : null;
          unitsCount = Number(pJ?.NumberUnits) || 0;
        }
      } catch { /* count stays 0; no nudge */ }
      // LU task: List Date + Sagareus Listing Link + assignee
      let ownerEmailG = "";
      let ownerNameG = "";
      let agentNameG = "";
      try {
        const luT = await asana("GET", `/tasks/${luGidG}?opt_fields=name,custom_fields.gid,custom_fields.name,custom_fields.display_value`);
        const cfG = (luT.custom_fields ?? []) as Array<{ gid: string; name: string; display_value: string | null }>;
        ({ email: ownerEmailG, name: ownerNameG } = ownerFromCf(cfG));
        const linkF = cfG.find((f) => /sagareus listing link/i.test(f.name));
        try { await asana("PUT", `/tasks/${luGidG}`, { custom_fields: { "1213182838328964": { date: todayG } } }); }
        catch { await asana("PUT", `/tasks/${luGidG}`, { custom_fields: { "1213182838328964": todayG } }).catch(() => notesG.push("List Date field write failed.")); }
        if (linkF && sagaUrl) await asana("PUT", `/tasks/${luGidG}`, { custom_fields: { [linkF.gid]: sagaUrl } }).catch(() => notesG.push("Sagareus Listing Link write failed."));
        else if (!sagaUrl) notesG.push("No public listing id from Buildium yet; fill Sagareus Listing Link by hand.");
        // due date clears at go-live (Brittany 2026-09-18): the LU's pre-listing
        // deadline is done; the live cadence lives on the subtasks
        await asana("PUT", `/tasks/${luGidG}`, { assignee: agentG, due_on: null }).catch(() => notesG.push("LU assignee/due change failed."));
      } catch { notesG.push("LU field writes failed."); }
      // human board -> Active Listings
      try { await asana("POST", "/sections/1208297375044038/addTask", { task: luGidG }); notesG.push("moved to Active Listings"); }
      catch { notesG.push("Active Listings section move failed."); }
      // @agent comment
      try {
        agentNameG = String((await workspaceUsers()).find((u) => u.gid === agentG)?.name ?? "");
        const bodyC = `Listing live${sagaUrl ? `: ${sagaUrl}` : ""} (went live ${todayG} via the Execute + Adapt bench). Done by Claude on behalf of the team lead.`;
        await asana("POST", `/tasks/${luGidG}/stories`, { html_text: storyHtml(bodyC).replace("<body>", `<body><a data-asana-gid="${agentG}"/>\n`) })
          .catch(() => postStory(luGidG, bodyC));
      } catch { notesG.push("Listing live comment failed."); }
      // subtasks: assign + due; complete the procedural go-live ones
      try {
        const subsG = ((await asana("GET", `/tasks/${luGidG}/subtasks?limit=100&opt_fields=name,completed,assignee.gid,due_on`)) ?? []) as Array<{ gid: string; name: string; completed?: boolean; assignee?: { gid: string } | null; due_on?: string | null }>;
        const plusDays = (n: number) => new Date(Date.parse(todayG + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
        const dNow = new Date(Date.now() - 7 * 3600 * 1000);
        let addT = (2 - dNow.getUTCDay() + 7) % 7;
        if (addT === 0) addT = 7;
        const nextTue = plusDays(addT);
        let maryGid = "1203402971273034";
        try { maryGid = String((await workspaceUsers()).find((u) => /mary@sagareus\.com/i.test(String((u as { email?: string }).email ?? "")))?.gid ?? maryGid); } catch { /* keep default */ }
        const assignSub = async (re: RegExp, who: string, due: string, label: string) => {
          const s0 = subsG.find((s) => !s.completed && re.test(s.name)) ?? subsG.find((s) => re.test(s.name));
          if (!s0) { notesG.push(`${label} subtask not found.`); return; }
          await asana("PUT", `/tasks/${s0.gid}`, { assignee: who, due_on: due }).then(() => notesG.push(`${label} assigned, due ${due}`)).catch(() => notesG.push(`${label} assign failed.`));
        };
        // subtask templates renamed with emoji prefixes (Brittany 2026-09-24):
        // match on the stable phrase, not the old Record |/Prepare | prefixes
        await assignSub(/listing video/i, agentG, plusDays(1), "Listing Video");
        // Weekly Site Visit: FILL-BLANK ONLY (Brittany 2026-09-18). An existing
        // assignee or due date stands untouched; a blank one goes to the leasing
        // agent, due with the Listing Video (+1 day).
        try {
          const sv = subsG.find((s) => !s.completed && /weekly site visit/i.test(s.name)) ?? subsG.find((s) => /weekly site visit/i.test(s.name));
          if (!sv) notesG.push("Weekly Site Visit subtask not found.");
          else if (sv.assignee?.gid || sv.due_on) notesG.push("Weekly Site Visit already set, left alone.");
          else {
            await asana("PUT", `/tasks/${sv.gid}`, { assignee: agentG, due_on: plusDays(1) });
            notesG.push(`Weekly Site Visit assigned, due ${plusDays(1)}`);
          }
        } catch { notesG.push("Weekly Site Visit assign failed."); }
        // Floor Plan is NOT assigned at go live (Brittany 2026-10-14, feedback
        // 1219524769406187): floor plans are made on request only, so the
        // subtask stays unassigned until someone asks for one.
        await assignSub(/weekly activity report/i, agentG, nextTue, "Weekly Activity Report");
        // renamed "Update | Zillow + Redfin links" (Brittany 2026-09-24); match
        // the stable pair, either generation
        await assignSub(/zillow\s*\+?\s*(and\s*)?redfin/i, maryGid, plusDays(2), "Zillow + Redfin links");
        for (const s0 of subsG) {
          // "Update | List Date..." completes too (Brittany 2026-09-19): the button
          // writes List Date itself. The combined List/Lease-Signed/Move-In variant
          // is EXCLUDED: those last two happen at signing, not go-live.
          if (!s0.completed && (/^go live\b/i.test(s0.name) || /assign \| task to agent/i.test(s0.name) ||
              (/^update \| list date/i.test(s0.name) && !/lease|move/i.test(s0.name)))) {
            await asana("PUT", `/tasks/${s0.gid}`, { completed: true, due_on: todayG }).catch(() => null);
          }
        }
      } catch { notesG.push("subtask assignment failed."); }
      execCache = null;
      warqCache = null;
      return j(headers, 200, { ok: true, sagaUrl, listedDate: todayG, ownerEmail: ownerEmailG, ownerName: ownerNameG, agentName: agentNameG, hadListing, unitsCount, notes: notesG });
    }

    // ---------- execGoLiveEmail: log the Listing Notification email ----------
    // Same shape as the weekly flow: the bench copies the text and opens the
    // compose; this posts the copy on the Email | Owner - Property Listed
    // Notification subtask and completes it.
    if (action === "execGoLiveEmail") {
      const luGidE = String(body.taskGid ?? "").replace(/\D/g, "");
      const copyE = String(body.emailCopy ?? "").trim().slice(0, 20000);
      if (!luGidE || !copyE) return j(headers, 400, { error: "missing_fields" });
      const todayE = new Date(Date.now() - 7 * 3600 * 1000).toISOString().slice(0, 10);
      try {
        const subsE = ((await asana("GET", `/tasks/${luGidE}/subtasks?limit=100&opt_fields=name,completed`)) ?? []) as Array<{ gid: string; name: string; completed?: boolean }>;
        const tgt = subsE.find((s) => /email \| owner.*property listed/i.test(s.name)) ?? null;
        if (!tgt) { await postStory(luGidE, `LISTING NOTIFICATION SENT\n\n${copyE}`); return j(headers, 200, { ok: true, loggedOn: "the LU task (no notification subtask found)" }); }
        await postStory(tgt.gid, copyE);
        await asana("PUT", `/tasks/${tgt.gid}`, { due_on: todayE, completed: true }).catch(() => null);
        return j(headers, 200, { ok: true, loggedOn: tgt.name });
      } catch {
        return j(headers, 200, { ok: true, loggedOn: null });
      }
    }

    // ---------- execComps: Execute bench writes the shared comp set back ----------
    // Writes ONLY the Comps Data field on the Listing Settings task (never the plan
    // fields), so an exec save can never clobber the Plan bench's pricing/strategy.
    // The compsData JSON carries planNote through unchanged; the bench preserves it.
    if (action === "execComps") {
      const uidC = String(body.unitId ?? "").replace(/\D/g, "");
      let lsGidC = String(body.lsGid ?? "").replace(/\D/g, "");
      const cdC = String(body.compsData ?? "").slice(0, 4000);
      if (!cdC) return j(headers, 400, { error: "missing_comps" });
      try { JSON.parse(cdC); } catch { return j(headers, 400, { error: "bad_comps_json" }); }
      if (!lsGidC && uidC) {
        try {
          const sHitsC = ((await asana("GET",
            `/workspaces/${WORKSPACE}/tasks/search?projects.any=1217446710785429&custom_fields.1213183515622826.value=${uidC}&opt_fields=name`)) ?? []) as Array<{ gid: string }>;
          lsGidC = sHitsC[0]?.gid ?? "";
        } catch { /* fall through */ }
      }
      if (!lsGidC) return j(headers, 404, { error: "no_listing_settings", message: "No Listing Settings task for this unit; comps not saved." });
      await asana("PUT", `/tasks/${lsGidC}`, { custom_fields: { "1217516812648029": cdC } });
      try {
        await asana("POST", `/tasks/${lsGidC}/stories`, {
          text: "Comps Data updated from the Execute & Adapt bench (selected comps, best comp, inquiries, concessions). Done by Claude on behalf of the team lead.",
        });
      } catch { /* story is best-effort */ }
      return j(headers, 200, { ok: true, lsGid: lsGidC });
    }

    // ---------- execActivity: the agent's weekly reports off the WAR subtask ----------
    if (action === "execActivity") {
      let warGidA = String(body.warGid ?? "").replace(/\D/g, "");
      const luGidA = String(body.taskGid ?? "").replace(/\D/g, "");
      if (!warGidA && luGidA) {
        try {
          const subs = await asana("GET", `/tasks/${luGidA}/subtasks?limit=100&opt_fields=name`);
          warGidA = String(((subs ?? []) as Array<{ gid: string; name: string }>).find((s) => /weekly activity report/i.test(s.name))?.gid ?? "");
        } catch { /* below */ }
      }
      if (!warGidA) return j(headers, 404, { error: "no_war_subtask", message: "No Weekly Activity Report subtask on this LU task." });
      const reps = await warReportStories(warGidA);
      const sr = warSeriesBuild(reps);
      const newest = reps.length ? reps.reduce((a, b) => (a.createdAt > b.createdAt ? a : b)) : null;
      return j(headers, 200, {
        ok: true,
        warGid: warGidA,
        warUrl: `https://app.asana.com/0/0/${warGidA}`,
        report: newest ? { text: newest.text.slice(0, 20000), createdAt: newest.createdAt } : null,
        reportCount: reps.length,
        series: sr.series,
        totals: sr.totals,
        dates: sr.dates,
      });
    }

    // ---------- execVerify: Zillow / Redfin pass-fail; a fail spawns a troubleshoot subtask ----------
    if (action === "execVerify") {
      const luGidV = String(body.taskGid ?? "").replace(/\D/g, "");
      const resultsV = Array.isArray(body.results) ? (body.results as Array<{ site?: unknown; pass?: unknown; note?: unknown }>).slice(0, 4) : [];
      if (!luGidV || !resultsV.length) return j(headers, 400, { error: "missing_fields" });
      const todayV = new Date(Date.now() - 7 * 3600 * 1000).toISOString().slice(0, 10);
      const subsV = ((await asana("GET", `/tasks/${luGidV}/subtasks?limit=100&opt_fields=name,completed`)) ?? []) as Array<{ gid: string; name: string; completed?: boolean }>;
      const created: Array<{ site: string; gid: string; url: string }> = [];
      const lines: string[] = [];
      for (const rV of resultsV) {
        const site = String(rV.site ?? "").toLowerCase() === "redfin" ? "Redfin" : "Zillow";
        const pass = rV.pass === true;
        lines.push(`${site}: ${pass ? "PASS" : "FAIL"}`);
        if (pass) continue;
        const nm = `Troubleshoot | ${site} listing`;
        const existing = subsV.find((s) => !s.completed && s.name.toLowerCase() === nm.toLowerCase());
        if (existing) { created.push({ site, gid: existing.gid, url: `https://app.asana.com/0/0/${existing.gid}` }); continue; }
        try {
          const sub = await asana("POST", `/tasks/${luGidV}/subtasks`, {
            name: nm,
            due_on: todayV,
            notes: `The ${site} listing failed verification on the Execute & Adapt bench.` +
              (String(rV.note ?? "").trim() ? `\nNote from the team lead: ${String(rV.note).trim().slice(0, 500)}` : "") +
              `\n\nZillow escalation: priorityrentalshelp@zillowgroup.com\nSOP: https://sagareus.getoutline.com/doc/zillow-troubleshooting-AZPJKBA9A7` +
              `\n\nCreated from the Execute & Adapt bench. Done by Claude on behalf of the team lead.`,
          });
          created.push({ site, gid: sub.gid, url: `https://app.asana.com/0/0/${sub.gid}` });
        } catch { lines.push(`${site}: subtask creation FAILED - create it by hand`); }
      }
      // pasted listing links save to the LU's Zillow / Redfin fields on record
      // (Brittany 2026-09-11): the bench fills the blank, the task stays the truth
      const urlsV = (body.urls ?? {}) as Record<string, unknown>;
      const savedUrls: string[] = [];
      try {
        const toWrite: Array<[string, string]> = [];
        for (const k of ["zillow", "redfin"]) {
          const u0 = String(urlsV[k] ?? "").trim();
          if (/^https?:\/\/\S+$/.test(u0) && u0.toLowerCase().includes(k)) toWrite.push([k, u0.slice(0, 500)]);
        }
        if (toWrite.length) {
          const tV = await asana("GET", `/tasks/${luGidV}?opt_fields=custom_fields.gid,custom_fields.display_value`);
          const cfV = (tV.custom_fields ?? []) as Array<{ gid: string; display_value?: string | null }>;
          const cfUpd: Record<string, string> = {};
          // combined Zillow + Redfin Links field (2026-09-26)
          let zrVal = String(cfV.find((f0) => f0.gid === LU_ZR_LINKS)?.display_value ?? "");
          for (const [k, u1] of toWrite) {
            zrVal = kvSet(zrVal, k === "redfin" ? "Redfin" : "Zillow", u1, ["Zillow", "Redfin"]);
            savedUrls.push(k);
          }
          if (zrVal) cfUpd[LU_ZR_LINKS] = zrVal;
          if (Object.keys(cfUpd).length) await asana("PUT", `/tasks/${luGidV}`, { custom_fields: cfUpd });
        }
      } catch { savedUrls.length = 0; /* the story still records; paste on the task by hand */ }
      await postStory(luGidV, `Listing verification (Execute & Adapt bench): ${lines.join(" | ")}.` +
        (savedUrls.length ? ` Listing link${savedUrls.length > 1 ? "s" : ""} (${savedUrls.join(", ")}) saved to the task.` : "") +
        (created.length ? " Troubleshoot subtask ready." : "")).catch(() => null);
      return j(headers, 200, { ok: true, created, savedUrls, summary: lines.join(" | ") });
    }

    // ---------- execMinRent: owner approved a lower Minimum Rent (feedback 1219521325307027 / 1219326547609704) ----------
    // The Modify step refuses a rent below the plan's Minimum Rent floor. When the
    // owner has already approved going lower, the agent records the new floor here:
    // writes Minimum Rent on Listing Settings and logs the approval on the LU, so
    // the price drop then goes through the bench instead of by hand in Buildium.
    if (action === "execMinRent") {
      const luGidM = String(body.taskGid ?? "").replace(/\D/g, "");
      const uidM = String(body.unitId ?? "").replace(/\D/g, "");
      let lsGidM = String(body.lsGid ?? "").replace(/\D/g, "");
      const newMin = Math.round(Number(body.newMin));
      const oldMin = Number.isFinite(Number(body.oldMin)) ? Math.round(Number(body.oldMin)) : null;
      if (!luGidM) return j(headers, 400, { error: "missing_task" });
      if (!Number.isFinite(newMin) || newMin < 100) return j(headers, 400, { error: "bad_min", message: "Enter the new minimum rent the owner approved." });
      if (!lsGidM && uidM) {
        try {
          const hitsM = ((await asana("GET",
            `/workspaces/${WORKSPACE}/tasks/search?projects.any=1217446710785429&custom_fields.1213183515622826.value=${uidM}&opt_fields=name`)) ?? []) as Array<{ gid: string }>;
          lsGidM = hitsM[0]?.gid ?? "";
        } catch { /* fall through */ }
      }
      if (!lsGidM) return j(headers, 404, { error: "no_listing_settings", message: "No Listing Settings task for this unit, so the new minimum has nowhere to save." });
      await asana("PUT", `/tasks/${lsGidM}`, { custom_fields: { "1217446710834881": newMin } });
      const fmtM = (v: number) => `$${v.toLocaleString("en-US")}`;
      const lineM = `Owner approved a lower Minimum Rent: ${fmtM(newMin)}` + (oldMin != null ? ` (was ${fmtM(oldMin)})` : "") +
        `. Recorded on the Execute + Adapt bench (/work-bench); Listing Settings Minimum Rent updated.`;
      await postStory(luGidM, lineM).catch(() => null);
      await postStory(lsGidM, lineM).catch(() => null);
      execCache = null;
      return j(headers, 200, { ok: true, minRent: newMin, lsGid: lsGidM });
    }

    // ---------- execDecision: the team lead's weekly hold-or-adjust record on the LU ----------
    // Rent changes go to Buildium via the existing listingPush BEFORE this call; this
    // records the decision against the plan so the paper trail lives on the LU task.
    if (action === "execDecision") {
      const luGidD = String(body.taskGid ?? "").replace(/\D/g, "");
      const decision = String(body.decision ?? "").toLowerCase() === "adjust" ? "ADJUST" : "HOLD";
      if (!luGidD) return j(headers, 400, { error: "missing_task" });
      const mD = (body.metrics ?? {}) as Record<string, unknown>;
      const nD = (k: string) => Math.max(0, Math.round(Number(mD[k]) || 0));
      const criteriaMet = nD("inquiries") >= 10 || nD("showings") >= 5 || nD("applications") >= 1;
      const domD = Number(body.dom);
      const acts = Array.isArray(body.actionsTaken) ? (body.actionsTaken as unknown[]).map((a) => String(a).slice(0, 200)).slice(0, 12) : [];
      const mods = Array.isArray(body.mods) ? (body.mods as unknown[]).map((a) => String(a).slice(0, 200)).slice(0, 12) : [];
      const modDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.modifiedDate ?? "")) ? String(body.modifiedDate)
        : new Date(Date.now() - 7 * 3600 * 1000).toISOString().slice(0, 10);
      const L: string[] = [];
      L.push("LISTING DECISION (Execute & Adapt bench)");
      L.push(`Modified Date: ${modDate}`);
      if (Number.isFinite(domD)) L.push(`Days on market: ${Math.max(0, Math.round(domD))}`);
      // metrics omitted entirely = a queue-pill "no changes" record on a unit with
      // no weekly numbers (turnover / move in pending); skip the activity lines
      if (body.metrics != null) {
        L.push(`This week: ${nD("inquiries")} inquiries / ${nD("showings")} showings / ${nD("applications")} applications`);
        L.push(`Hold criteria (10 inquiries OR 5 showings OR 1 application): ${criteriaMet ? "MET" : "NOT MET"}`);
      }
      if (String(body.planLine ?? "").trim()) L.push(`Plan line invoked: ${String(body.planLine).trim().slice(0, 300)}`);
      L.push(`Decision: ${decision}`);
      if (mods.length) L.push("Modifications:\n- " + mods.join("\n- "));
      if (acts.length) L.push("Actions taken:\n- " + acts.join("\n- "));
      if (body.newRent != null && Number.isFinite(Number(body.newRent))) L.push(`New listed rent: $${Math.round(Number(body.newRent)).toLocaleString("en-US")} (Buildium updated)`);
      L.push("\nDone by Claude on behalf of the team lead.");
      const storyD = await postStory(luGidD, L.join("\n"));
      execCache = null; // MOD date changed: next execQueue must re-read
      // Stamp the review into the LU's Price History field (existing text field, JSON):
      // lastReview powers the queue's MOD pill; ADJUSTED events keep the price trail
      // the WAR and owner tools already read. Gid resolved off the task, never created.
      let stamped = false;
      try {
        const tD = await asana("GET", `/tasks/${luGidD}?opt_fields=custom_fields.gid,custom_fields.name,custom_fields.display_value`);
        const cfD = (tD.custom_fields ?? []) as Array<{ gid: string; name: string; display_value: string | null }>;
        const phF = cfD.find((f) => /price history/i.test(String(f.name)));
        if (phF) {
          let ph: Record<string, unknown> = {};
          try { const p0 = JSON.parse(String(phF.display_value ?? "") || "{}"); ph = (p0 && typeof p0 === "object" && !Array.isArray(p0)) ? p0 : { events: p0 }; } catch { ph = {}; }
          const evs = Array.isArray(ph.events) ? ph.events as unknown[] : [];
          if (decision === "ADJUST" && body.newRent != null && Number.isFinite(Number(body.newRent))) {
            evs.push({ type: "ADJUSTED", date: modDate, price: Math.round(Number(body.newRent)) });
          }
          ph.events = evs.slice(-40);
          ph.lastReview = modDate;
          await asana("PUT", `/tasks/${luGidD}`, { custom_fields: { [phF.gid]: JSON.stringify(ph).slice(0, 6000) } });
          stamped = true;
        }
      } catch { /* the story already carries the record */ }
      // Listing Settings mirrors the live listing after a weekly modification
      // (Brittany 2026-09-03): changed values write to their LS fields so the
      // settings match what is actually listed. Starting Rent stays the plan's
      // start; Current Listed Rent (field created 2026-09-03 on Brittany's
      // instruction) tracks the live price.
      const lsSync: string[] = [];
      const uidD = String(body.unitId ?? "").replace(/\D/g, "");
      const changesD: Array<[string, string, unknown, "num" | "text"]> = [
        ["1218160030285805", "Current Listed Rent", body.newRent, "num"],
        ["1217515853935577", "Security Deposit", body.newDeposit, "num"],
        ["1217446589879104", "Concessions", body.newConcession, "text"],
        ["1217446589255794", "Pet Policy", body.newPets, "text"],
        ["1217446710797252", "Last Month Rent", body.newLastMo, "text"],
      ];
      const wantedD = changesD.filter(([, , v, ty]) => ty === "num" ? (v != null && Number.isFinite(Number(v))) : String(v ?? "").trim() !== "");
      if (uidD && wantedD.length) {
        try {
          const sHits2 = ((await asana("GET", `/workspaces/${WORKSPACE}/tasks/search?projects.any=1217446710785429&custom_fields.1213183515622826.value=${uidD}&opt_fields=name`)) ?? []) as Array<{ gid: string }>;
          const lsGidD = sHits2[0]?.gid ?? "";
          if (!lsGidD) lsSync.push("no Listing Settings task for this unit");
          else {
            for (const [gidF, label, v, ty] of wantedD) {
              const val = ty === "num" ? Math.round(Number(v)) : String(v).trim().slice(0, 900);
              try { await asana("PUT", `/tasks/${lsGidD}`, { custom_fields: { [gidF]: val } }); lsSync.push(`${label} updated`); }
              catch { lsSync.push(`${label} write failed`); }
            }
          }
        } catch { lsSync.push("Listing Settings lookup failed"); }
      }
      return j(headers, 200, { ok: true, storyGid: storyD?.gid ?? null, criteriaMet, modDate, stamped, lsSync });
    }

    // ---------- warFeedback: staff feedback on the WAR tool -> subtask on the WAR dev task ----------
    if (action === "warFeedback") {
      const text = String(body.text ?? "").trim().slice(0, 4000);
      const address = String(body.address ?? "").trim().slice(0, 120);
      if (text.length < 5) return j(headers, 400, { error: "missing_fields" });
      const WAR_DEV_TASK = "1216867978533183";           // "WAR (Weekly Activity Report)" dev/feedback task
      const BB = "1203784854198936";                     // Brittany
      const todayStr = new Date(Date.now() - 7 * 3600 * 1000).toISOString().slice(0, 10);
      const sub = await asana("POST", `/tasks/${WAR_DEV_TASK}/subtasks`, {
        name: `WAR Feedback // ${todayStr}`,
        assignee: BB,
        due_on: todayStr,
        notes: text
          + (address ? `\n\nProperty loaded at the time: ${address}` : "")
          + "\n\nSubmitted via the WAR widget Team Feedback button. Done by Claude on behalf of the submitting agent.",
      });
      return j(headers, 200, { ok: true, url: `https://app.asana.com/0/0/${sub.gid}` });
    }

    // ---------- svFeedback: staff feedback on the Site Visit tool -> subtask on its dev task ----------
    if (action === "svFeedback") {
      const text = String(body.text ?? "").trim().slice(0, 4000);
      const address = String(body.address ?? "").trim().slice(0, 120);
      if (text.length < 5) return j(headers, 400, { error: "missing_fields" });
      const SV_DEV_TASK = "1216867978492127";            // "Site Visit" under Team Tools | Bugs & Feature Requests (renamed from Field Tools 2026-09-19)
      const BB = "1203784854198936";                     // Brittany
      const todayStr = new Date(Date.now() - 7 * 3600 * 1000).toISOString().slice(0, 10);
      const fbSender = String(body.sender ?? "").trim().slice(0, 120);
      const sub = await asana("POST", `/tasks/${SV_DEV_TASK}/subtasks`, {
        name: `Site Visit Feedback // ${todayStr}`,
        assignee: BB,
        due_on: todayStr,
        notes: text
          + (fbSender ? `\n\n- ${fbSender}` : "")
          + (address ? `\n\nProperty loaded at the time: ${address}` : "")
          + "\n\nSubmitted via the Site Visit widget Team Feedback button. Done by Claude on behalf of the submitting agent.",
      });
      // gid lets the widget attach feedback screenshots via the photo action
      return j(headers, 200, { ok: true, gid: sub.gid, url: `https://app.asana.com/0/0/${sub.gid}` });
    }

    // ---------- plFeedback / toFeedback: staff feedback -> subtask on each tool's dev task ----------
    if (action === "plFeedback" || action === "toFeedback") {
      const text = String(body.text ?? "").trim().slice(0, 4000);
      const address = String(body.address ?? "").trim().slice(0, 120);
      if (text.length < 5) return j(headers, 400, { error: "missing_fields" });
      const BB = "1203784854198936";                     // Brittany
      const cfg = action === "plFeedback"
        ? { task: "1216868072927956", label: "PreListing" }      // "Leasing Workbench" dev task (renamed 2026-09-20)
        : { task: "1216868072929681", label: "Turn Over" };      // "Turn Over Complete (Inspection)" dev task
      // bench picker (Brittany 2026-09-18): the one Team Feedback button serves
      // every bench on /work-bench, so the submitter names the bench and the
      // subtask title leads with it instead of a generic "PreListing"
      const BENCHES = new Set(["Plan + Propose", "Execute + Adapt", "Screen + Sign", "Owner Page", "Other"]);
      const bench = BENCHES.has(String(body.bench ?? "")) ? String(body.bench) : "";
      const label = action === "plFeedback" && bench ? bench : cfg.label;
      const todayStr = new Date(Date.now() - 7 * 3600 * 1000).toISOString().slice(0, 10);
      const sub = await asana("POST", `/tasks/${cfg.task}/subtasks`, {
        name: `${label} Feedback // ${todayStr}`,
        assignee: BB,
        due_on: todayStr,
        notes: text
          + (bench ? `\n\nBench: ${bench}` : "")
          + (address ? `\n\nProperty loaded at the time: ${address}` : "")
          + `\n\nSubmitted via the workbench Team Feedback button. Done by Claude on behalf of the submitting agent.`,
      });
      return j(headers, 200, { ok: true, url: `https://app.asana.com/0/0/${sub.gid}` });
    }

    // ---------- prelistSubmit: post the PreListing text report to the LU task's PreListing subtask ----------
    if (action === "prelistSubmit") {
      const address = String(body.address ?? "").trim();
      const text = String(body.text ?? "").trim();
      if (!address || !text) return j(headers, 400, { error: "missing_fields" });
      // Unit ID first (488323, 2026-09-07: the LU existed but its task-name address
      // tokens did not match the bench address); address matching is the fallback
      let hit: { gid: string; name?: string; address?: string } | null = null;
      const uidPS = String(body.unitId ?? "").replace(/\D/g, "");
      if (uidPS) hit = await luByUnitId(uidPS).catch(() => null);
      if (!hit) {
        const vacancies = await allVacancies();
        hit = matchUnit(vacancies, address).hit ?? null;
      }
      if (!hit) {
        return j(headers, 404, { error: "lu_not_found", message: "No leasing task matches that address or Unit ID. Copy the text and post it manually." });
      }
      let ownerEmail = "";
      try {
        const lu = await asana("GET", `/tasks/${hit.gid}?opt_fields=custom_fields.name,custom_fields.display_value`);
        ownerEmail = ownerFromCf((lu.custom_fields ?? []) as Array<{ name?: string; display_value?: string | null }>).email;
      } catch { /* non-fatal */ }
      const subtasks = await asana("GET", `/tasks/${hit.gid}/subtasks?limit=100&opt_fields=name`);
      // combined subtask (Brittany 2026-09-24): "Send | Leasing Plan" replaces
      // Prepare | BD Listing + Email | Owner - Market Rent & PreListing; the
      // old names keep matching for LUs created before the merge
      let pre = (subtasks ?? []).find((s: { name: string }) => /send\s*\|\s*leasing\s*plan/i.test(s.name))
        ?? (subtasks ?? []).find((s: { name: string }) => /market rent.*prelisting|prelisting/i.test(s.name));
      if (!pre) {
        pre = await asana("POST", `/tasks/${hit.gid}/subtasks`, {
          name: "Send | Leasing Plan",
          notes: "Leasing Plan record. SOP: https://sagareus.getoutline.com/doc/lease-up-asana-sop-fro5kaDubB",
        });
      }
      const story = await postStory(pre.gid, text.slice(0, 60000));
      const todayStr = new Date(Date.now() - 7 * 3600 * 1000).toISOString().slice(0, 10);
      // Report posted = email moment: close the subtask and stamp the day it happened.
      try { await asana("PUT", `/tasks/${pre.gid}`, { completed: true, due_on: todayStr }); } catch { /* fail-soft */ }
      // Price fields on the LU task: Starting/Minimum from the strategy card, plus the
      // 🤖 Estimated Market Rent snapshot so estimates can be compared to reality later.
      const numOrNull = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : null);
      const priceFields: Record<string, number> = {};
      const sp = numOrNull(body.startingPrice); if (sp != null) priceFields["1213858008483682"] = sp;
      const mp = numOrNull(body.minPrice); if (mp != null) priceFields["1213858008483684"] = mp;
      const em = numOrNull(body.estimate); if (em != null) priceFields["1216841038052857"] = em;
      if (Object.keys(priceFields).length) {
        try { await asana("PUT", `/tasks/${hit.gid}`, { custom_fields: priceFields }); } catch { /* fail-soft */ }
      }
      return j(headers, 200, {
        ok: true,
        preGid: pre.gid,
        preUrl: `https://app.asana.com/0/0/${pre.gid}`,
        storyGid: story?.gid ?? null,
        matchedAddress: hit.address ?? address,
        ownerEmail,
      });
    }

    // ---------- listing: pull unit details + listing copy from Buildium ----------
    // Chain: typed address -> Unit Settings task (fuzzy match) -> Unit ID custom field
    // -> Buildium unit record. Returns ONLY beds/baths/sqft/description; nothing else
    // from Buildium ever crosses this proxy.
    if (action === "listing") {
      if (!BUILDIUM_ID || !BUILDIUM_SECRET) {
        return j(headers, 500, { error: "buildium_not_configured", message: "Buildium keys are not set up yet." });
      }
      // Preferred path: direct Buildium Unit ID (from the Asana Unit Settings task).
      // Fallback path: address matching against Unit Settings.
      let uid = String(body.unitId ?? "").trim();
      if (uid && !/^\d+$/.test(uid)) {
        return j(headers, 400, { error: "bad_unit_id", message: "Unit ID should be just the number from the Unit Settings task." });
      }
      if (!uid) {
        const address = String(body.address ?? "").trim();
        if (!address) return j(headers, 400, { error: "missing_address" });
        const m = await matchSettings(address);
        if (m.ambiguous) {
          return j(headers, 404, { error: "ambiguous", message: `Multiple units match that address (${m.ambiguous.join(", ")}). Add the unit number and pull again.` });
        }
        if (!m.hit) {
          return j(headers, 404, { error: "unit_not_found", message: "No managed unit matches that address. Check the spelling, or fill the fields by hand." });
        }
        const task = await asana("GET", `/tasks/${m.hit.gid}?opt_fields=custom_fields.name,custom_fields.display_value`);
        uid = String((task.custom_fields ?? []).find((f: { name: string }) => /^unit id$/i.test(f.name))?.display_value ?? "");
        if (!uid) {
          return j(headers, 404, { error: "no_unit_id", message: `Found ${m.hit.address}, but its Settings task has no Unit ID. Add it in Asana, or fill the fields by hand.` });
        }
      }
      const res = await fetch(`https://api.buildium.com/v1/rentals/units/${encodeURIComponent(String(uid))}`, {
        headers: { "x-buildium-client-id": BUILDIUM_ID, "x-buildium-client-secret": BUILDIUM_SECRET },
      });
      if (res.status === 404) return j(headers, 404, { error: "buildium_unit_not_found", message: "Buildium has no unit with that ID. Double-check it on the Unit Settings task." });
      if (!res.ok) return j(headers, 502, { error: "buildium_failed", message: "Buildium didn't answer. Fill the fields by hand for now." });
      const u = await res.json();
      // Previous lease rent comes from actual lease history, never from the MarketRent field
      // (MarketRent is a hand-typed asking figure and exists even for never-leased units).
      let previousRent: number | null = null;
      let depositHeld: number | null = null;
      let prevBreakdown: Array<{ label: string; amount: number }> = [];
      let prevBreakdownMonth = "";
      let leaseHistory: boolean | null = null; // null = leases API not accessible (scope not granted)
      try {
        // NOTE: /v1/leases silently ignores unitids/unitid filters; propertyids works. Filter to the unit in code.
        const lr = await fetch(`https://api.buildium.com/v1/leases?propertyids=${encodeURIComponent(String(u.PropertyId ?? ""))}&limit=500`, {
          headers: { "x-buildium-client-id": BUILDIUM_ID, "x-buildium-client-secret": BUILDIUM_SECRET },
        });
        if (lr.ok) {
          const leases = await lr.json().catch(() => []);
          const rents = (Array.isArray(leases) ? leases : [])
            .filter((l: { UnitId?: number }) => String(l?.UnitId ?? "") === String(uid))
            .map((l: { Id?: number; LeaseFromDate?: string; AccountDetails?: { Rent?: number | { Amount?: number }; SecurityDeposit?: number } }) => {
              const r = l?.AccountDetails?.Rent;
              const amt = typeof r === "number" ? r : (typeof (r as { Amount?: number })?.Amount === "number" ? (r as { Amount: number }).Amount : null);
              const dep = l?.AccountDetails?.SecurityDeposit;
              return { id: l?.Id, from: String(l?.LeaseFromDate ?? ""), rent: amt, deposit: typeof dep === "number" ? dep : null };
            })
            .filter((x: { rent: number | null }) => x.rent != null && x.rent > 0)
            .sort((a: { from: string }, b: { from: string }) => b.from.localeCompare(a.from));
          leaseHistory = rents.length > 0;
          if (rents.length) { previousRent = rents[0].rent; depositHeld = rents[0].deposit; }
          // Total-cost breakdown of the previous lease (Brittany 2026-09-07): the
          // last month's recurring charges (rent, utility recovery, pet rent,
          // parking, storage...) so next-rent decisions compare total to total.
          if (rents.length && rents[0].id) {
            try {
              const tr2 = await fetch(`https://api.buildium.com/v1/leases/${rents[0].id}/transactions?limit=200`, {
                headers: { "x-buildium-client-id": BUILDIUM_ID, "x-buildium-client-secret": BUILDIUM_SECRET },
              });
              const txs2 = ((await tr2.json().catch(() => [])) as Array<Record<string, unknown>>) ?? [];
              const byMonth: Record<string, Array<{ label: string; amt: number }>> = {};
              for (const t2 of txs2) {
                if (!/charge/i.test(String(t2.TransactionType ?? ""))) continue;
                const mKey = String(t2.Date ?? "").slice(0, 7);
                if (!/^\d{4}-\d{2}$/.test(mKey)) continue;
                const j2 = (t2.Journal ?? {}) as Record<string, unknown>;
                const memo2 = String(j2.Memo ?? "");
                for (const ln2 of ((j2.Lines ?? []) as Array<Record<string, unknown>>)) {
                  const amt2 = Number(ln2.Amount);
                  if (!Number.isFinite(amt2) || amt2 <= 0) continue;
                  const gl2 = String(((ln2.GLAccount ?? {}) as Record<string, unknown>).Name ?? "") || memo2 || "Charge";
                  (byMonth[mKey] = byMonth[mKey] ?? []).push({ label: gl2.slice(0, 60), amt: amt2 });
                }
              }
              // latest month that includes a rent-ish line = a typical full month
              const months2 = Object.keys(byMonth).sort().reverse();
              const pick2 = months2.find((mk) => byMonth[mk].some((x) => /rent/i.test(x.label) && !/pet|last month/i.test(x.label))) ?? months2[0];
              if (pick2) {
                const agg2: Record<string, number> = {};
                for (const x of byMonth[pick2]) agg2[x.label] = (agg2[x.label] ?? 0) + x.amt;
                const rows2 = Object.entries(agg2).map(([label, amt3]) => ({ label, amount: Math.round(amt3 * 100) / 100 }))
                  .sort((a3, b3) => b3.amount - a3.amount).slice(0, 8);
                prevBreakdown = rows2;
                prevBreakdownMonth = pick2;
              }
            } catch { /* breakdown is best-effort */ }
          }
        }
      } catch { /* leases unavailable; leave nulls */ }
      // full address for the comps lookup: line1 (+ unit #), city, state, zip
      const a = u.Address ?? {};
      let line1 = String(a.AddressLine1 ?? "").trim();
      const unitNo = String(u.UnitNumber ?? "").trim();
      if (unitNo) {
        const toks = line1.toLowerCase().split(/[^a-z0-9#]+/);
        const un = unitNo.toLowerCase();
        if (!toks.includes(un) && !toks.includes("#" + un)) line1 += ` #${unitNo}`;
      }
      const fullAddress = [line1, a.City, [a.State === "Washington" || a.State === "WA" ? "WA" : a.State, a.PostalCode].filter(Boolean).join(" ")]
        .filter(Boolean).join(", ");
      // Buildium property subtype (drives the workbench Type dropdown)
      let rentalSubType = "";
      try {
        if (u.PropertyId) {
          const pr = await fetch(`https://api.buildium.com/v1/rentals/${encodeURIComponent(String(u.PropertyId))}`, {
            headers: { "x-buildium-client-id": BUILDIUM_ID, "x-buildium-client-secret": BUILDIUM_SECRET },
          });
          if (pr.ok) {
            const pj = await pr.json().catch(() => ({}));
            rentalSubType = String(pj.RentalSubType ?? "");
          }
        }
      } catch { /* best-effort */ }
      // Buildium amenity checkboxes (unit + property): what the owner page chips and
      // the listing show. Surfaced on Confirm Unit Details for the settings gap check.
      let unitFeatures: unknown[] = [];
      let propFeatures: unknown[] = [];
      try {
        const au = await fetch(`https://api.buildium.com/v1/rentals/units/${encodeURIComponent(String(uid))}/amenities`, {
          headers: { "x-buildium-client-id": BUILDIUM_ID, "x-buildium-client-secret": BUILDIUM_SECRET },
        });
        if (au.ok) {
          const aj = await au.json().catch(() => ({} as Record<string, unknown>));
          unitFeatures = Array.isArray((aj as Record<string, unknown>).Features) ? ((aj as Record<string, unknown>).Features as unknown[]).slice(0, 100) : [];
        }
      } catch { /* best-effort */ }
      try {
        if (u.PropertyId) {
          const ap = await fetch(`https://api.buildium.com/v1/rentals/${encodeURIComponent(String(u.PropertyId))}/amenities`, {
            headers: { "x-buildium-client-id": BUILDIUM_ID, "x-buildium-client-secret": BUILDIUM_SECRET },
          });
          if (ap.ok) {
            const aj2 = await ap.json().catch(() => ({} as Record<string, unknown>));
            propFeatures = Array.isArray((aj2 as Record<string, unknown>).Features) ? ((aj2 as Record<string, unknown>).Features as unknown[]).slice(0, 100) : [];
          }
        }
      } catch { /* best-effort */ }
      // PreListing Workbench populate: amenities/utilities/landscaping from the Unit
      // Settings task, pet policy/criteria/construction from Initial Onboard (best-effort)
      let settings: Record<string, unknown> | null = null;
      let settingsGid = "";
      let psGid = "";
      type SettingsCF = { gid: string; name: string; resource_subtype?: string; display_value: string | null; enum_options?: Array<Record<string, unknown>>; enum_value?: Record<string, unknown>; multi_enum_values?: Array<Record<string, unknown>> };
      let cfUnit: SettingsCF[] = [];
      let cfProp: SettingsCF[] = [];
      let onboard: Record<string, unknown> | null = null;
      try {
        // Settings task by Unit ID field, never by address (Brittany 2026-08-17).
        // Unit Settings first; single-family homes have no Unit Settings task, so
        // fall back to Property Settings, which carries the same Unit ID field
        // (Brittany 2026-08-20).
        const UNIT_SETTINGS_PROJ = "1213032009308835";
        const UNIT_ID_FIELD = "1213183515622826";
        // Both tasks load from the start: Unit Settings values win field by field, and
        // any blank field fills from Property Settings (Brittany 2026-08-20).
        const scanSettings = async (proj: string): Promise<string> => {
          // exact Unit ID search first (fast); the paged walk is the fallback for
          // fresh tasks the search index lags on. Walk raised 5 -> 15 pages: the
          // Unit Settings project held 741 tasks on 2026-09-12 and unit 399465
          // sat on page 6, so the 500-task cap silently matched the property task
          // instead and the bench showed blank unit boxes.
          try {
            const sHit = ((await asana("GET",
              `/workspaces/${WORKSPACE}/tasks/search?projects.any=${proj}&custom_fields.${UNIT_ID_FIELD}.value=${encodeURIComponent(String(uid))}&opt_fields=name`)) ?? []) as Array<{ gid: string }>;
            if (sHit[0]) return sHit[0].gid;
          } catch { /* fall through to the walk */ }
          let offS = "";
          for (let pg = 0; pg < 15; pg++) {
            const rS = await fetch(`${ASANA}/projects/${proj}/tasks?limit=100&opt_fields=custom_fields.gid,custom_fields.display_value${offS ? `&offset=${encodeURIComponent(offS)}` : ""}`,
              { headers: { "Authorization": `Bearer ${ASANA_PAT}` } });
            const jS = await rS.json().catch(() => ({}));
            for (const tk of (jS.data ?? []) as Array<{ gid: string; custom_fields?: Array<{ gid: string; display_value: string | null }> }>) {
              if (String((tk.custom_fields ?? []).find((f) => f.gid === UNIT_ID_FIELD)?.display_value ?? "").trim() === String(uid)) return tk.gid;
            }
            offS = jS.next_page?.offset ?? "";
            if (!offS) break;
          }
          return "";
        };
        const SETTINGS_OPTF = "custom_fields.gid,custom_fields.name,custom_fields.resource_subtype,custom_fields.display_value,custom_fields.enum_options.gid,custom_fields.enum_options.name,custom_fields.enum_options.enabled,custom_fields.enum_value.gid,custom_fields.multi_enum_values.gid";
        const usGid = await scanSettings(UNIT_SETTINGS_PROJ);
        psGid = await scanSettings(PROPERTY_SETTINGS_PROJECT);
        if (!psGid) psGid = matchPropByAddress(await allPropSettings(), fullAddress)?.gid ?? "";
        // a multifamily unit subtask sits in Property Settings too and carries the Unit
        // ID, so the search lands on it; the property task is its parent (2026-10-20:
        // Parking Type / Storage Type / HOA read blank on every multifamily unit)
        if (psGid) {
          try {
            const pp = await asana("GET", `/tasks/${psGid}?opt_fields=parent.gid`);
            if (pp?.parent?.gid) psGid = String(pp.parent.gid);
          } catch { /* keep the unit task */ }
        }
        settingsGid = usGid || psGid;
        if (usGid) cfUnit = ((await asana("GET", `/tasks/${usGid}?opt_fields=${SETTINGS_OPTF}`)).custom_fields ?? []) as typeof cfUnit;
        if (psGid && psGid !== usGid) cfProp = ((await asana("GET", `/tasks/${psGid}?opt_fields=${SETTINGS_OPTF}`)).custom_fields ?? []) as typeof cfProp;
        if (settingsGid) {
          const cfAll = usGid ? cfUnit : cfProp;
          const cfFall = usGid ? cfProp : [];
          const g = (re: RegExp) => String(cfAll.find((f) => re.test(f.name))?.display_value ?? "").trim() ||
            String(cfFall.find((f) => re.test(f.name))?.display_value ?? "").trim();
          // parking + storage = the property's type line plus the unit's lease spots
          const spots = await leaseSpots(String(uid));
          settings = {
            laundry: g(/^laundry$/i), parking: parkStorLine(g(/^parking type$/i), spots.parking, "Spot"), ev: g(/^ev charger$/i),
            cooling: g(/^cooling$/i), heating: g(/^heating type$/i),
            utilities: g(/^utilities$/i), internet: g(/^internet provider$/i),
            landscaping: g(/^landscaping maintenance$/i),
            storage: parkStorLine(g(/^storage type$/i), spots.storage, "Storage"), mailbox: g(/^mailbox$/i),
            parkingSpot: spots.parking, storageSpot: spots.storage,
            hoaPlaybook: g(/^hoa playbook$/i),
            utilityProviders: {
              electricity: g(/^utilities - electricity$/i), gas: g(/^utilities - gas$/i),
              water: g(/^utilities - water$/i), sewer: g(/^utilities - sewer/i),
              garbage: g(/^utilities - garbage$/i), oil: g(/^utilities - oil$/i),
              internet: g(/^utilities - internet$/i),
            },
          };
        }
        // Property-level utility fields: provider names + account numbers live in the
        // property Utilities field, and Auto Utility Processing Mode is the flat-fee
        // signal. The unit-level "Utilities - X" fields above are per-unit BILLING
        // MODES, not providers (Update | Utility Settings doc; Brittany 2026-08-16).
        try {
          const plist = await allPropSettings();
          const mp = { hit: matchPropByAddress(plist, fullAddress) ?? undefined };
          if (mp.hit && mp.hit.gid !== settingsGid) {
            const pt2 = await asana("GET", `/tasks/${mp.hit.gid}?opt_fields=custom_fields.name,custom_fields.display_value`);
            const cf4 = (pt2.custom_fields ?? []) as Array<{ name: string; display_value: string | null }>;
            const gp = (re: RegExp) => String(cf4.find((f) => re.test(f.name))?.display_value ?? "").trim();
            settings = settings ?? {};
            (settings as Record<string, unknown>).propUtilities = gp(/^utilities$/i);
            (settings as Record<string, unknown>).autoMode = gp(/auto utility processing/i);
          } else if (settings) {
            const cfSame = settings as Record<string, unknown>;
            cfSame.propUtilities = cfSame.utilities ?? "";
          }
        } catch { /* best-effort */ }
      } catch { /* populate is best-effort */ }
      try {
        const streetNo = (fullAddress.match(/^\d+/) ?? [""])[0];
        if (streetNo) {
          const hits = await asana("GET", `/workspaces/${WORKSPACE}/typeahead?resource_type=task&query=${encodeURIComponent("Initial Onboarding | " + fullAddress.slice(0, 40))}&count=10&opt_fields=name`);
          const ob = (hits ?? []).find((x: { name: string }) => /^initial onboarding\s*\|/i.test(x.name) && x.name.includes(streetNo));
          if (ob) {
            const t2 = await asana("GET", `/tasks/${ob.gid}?opt_fields=custom_fields.name,custom_fields.display_value`);
            const cf4 = (t2.custom_fields ?? []) as Array<{ name: string; display_value: string | null }>;
            const g2 = (re: RegExp) => String(cf4.find((f) => re.test(f.name))?.display_value ?? "").trim();
            onboard = { petPolicy: g2(/^pet policy$/i), criteria: g2(/^applicant criteria$/i), construction: g2(/^construction plans$/i) };
          }
        }
      } catch { /* best-effort */ }
      // Scheduled move out: open task in Leasing | Move-Out matched by Unit ID (Brittany 2026-08-17).
      let moveOut = "";
      let moveOutTaskGid = "";
      let moveOutSrcGid = "";
      let targetMoveIn = "";
      let pipelineListDate = "";
      try {
        // Scheduled Move Out comes from the parent "Leasing | {address}" task in
        // Leasing | Human View (Brittany 2026-08-20). Targeted search by Unit ID:
        // the old Move-Out-project page scan missed units past the first 500 tasks.
        const HUMAN_VIEW_PROJECT = "1208297375044026";
        const MO_DATE_F = "1213182815411738";   // 🙌 Tenant Move-Out Date
        const MI_DATE_F = "1213183520317831";   // 🙌 Move in Date
        const LD_DATE_F = "1213182838328964";   // 💁 List Date
        const found = ((await asana("GET",
          `/workspaces/${WORKSPACE}/tasks/search?projects.any=${HUMAN_VIEW_PROJECT}&custom_fields.1213183515622826.value=${uid}&completed=false&opt_fields=name,custom_fields.gid,custom_fields.display_value`)) ?? []) as Array<{ gid: string; name: string; custom_fields?: Array<{ gid: string; display_value: string | null }> }>;
        const dateOf = (t: { custom_fields?: Array<{ gid: string; display_value: string | null }> } | undefined, fld: string) => {
          const d = String((t?.custom_fields ?? []).find((f) => f.gid === fld)?.display_value ?? "").slice(0, 10);
          return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "";
        };
        const parentT = found.find((t) => /^leasing\s*\|/i.test(String(t.name)));
        const moT = found.find((t) => /^move-?out\s*\|/i.test(String(t.name)));
        moveOutTaskGid = moT?.gid ?? "";
        moveOut = dateOf(parentT, MO_DATE_F) || dateOf(moT, MO_DATE_F);
        moveOutSrcGid = dateOf(parentT, MO_DATE_F) ? (parentT?.gid ?? "") : (moT?.gid ?? "");
        // The date often lives ONLY on the "Move-Out |" subtask, which usually has no
        // Unit ID, so the search above cannot see it - walk the master's subtasks and
        // read the field there, else the Move-Out task's own due date (the template
        // dues it on move out day) (Brittany 2026-08-25).
        if (!moveOut) {
          let mo2: { gid: string; name: string } | undefined = moT;
          if (!mo2 && parentT) {
            const kids = ((await asana("GET", `/tasks/${parentT.gid}/subtasks?limit=100&opt_fields=name,completed`)) ?? []) as Array<{ gid: string; name: string; completed?: boolean }>;
            mo2 = kids.find((k) => !k.completed && /^move-?out\s*\|/i.test(String(k.name))) ??
              kids.find((k) => /^move-?out\s*\|/i.test(String(k.name)));
          }
          if (mo2) {
            const mt = await asana("GET", `/tasks/${mo2.gid}?opt_fields=due_on,custom_fields.gid,custom_fields.display_value`);
            moveOut = dateOf(mt as { custom_fields?: Array<{ gid: string; display_value: string | null }> }, MO_DATE_F) ||
              (/^\d{4}-\d{2}-\d{2}$/.test(String(mt?.due_on ?? "")) ? String(mt.due_on) : "");
            if (moveOut) { moveOutSrcGid = mo2.gid; moveOutTaskGid = mo2.gid; }
          }
        }
        // target dates for the Vacancy box: Move in Date + List Date off the same tasks
        targetMoveIn = dateOf(parentT, MI_DATE_F) || dateOf(moT, MI_DATE_F);
        pipelineListDate = dateOf(parentT, LD_DATE_F) || dateOf(moT, LD_DATE_F);
      } catch { /* best-effort */ }
      // editable Unit Settings panel: field types + real Asana enum options, so the
      // workbench offers the configured choices instead of free text (Brittany 2026-08-17)
      let settingsFields: Array<Record<string, unknown>> = [];
      let utilFields: Array<Record<string, unknown>> = [];
      try {
        if (settingsGid) {
          const base = cfUnit.length ? cfUnit : cfProp;
          const fall = cfUnit.length ? cfProp : [];
          // Landscaping Maintenance = the operations vendor contact, not a leasing fact;
          // the leasing answer lives in the widget's own Landscaping select (Brittany 2026-08-21)
          // Security System + HOA Move In Detail moved to Listing Settings (Brittany
          // 2026-08-22): they are plan facts, not unit/property settings
          // Parking Type / Storage Type are property-level since 2026-10-13 (the unit
          // Parking / Storage fields retired 2026-10-17): on a multifamily unit they
          // come off the property task and save back there (onProperty)
          const WANTED = [/^laundry$/i, /^parking type$/i, /^ev charger$/i, /^cooling$/i, /^heating type$/i, /^storage type$/i, /^mailbox$/i, /^internet provider$/i];
          const PROP_ONLY = [/^parking type$/i, /^storage type$/i];
          const shape = (f: SettingsCF) => ({
            value: String(f.display_value ?? ""),
            selected: f.resource_subtype === "enum"
              ? String(((f.enum_value ?? {}) as Record<string, unknown>).gid ?? "")
              : f.resource_subtype === "multi_enum"
                ? ((f.multi_enum_values ?? []) as Array<Record<string, unknown>>).map((v) => String(v.gid ?? ""))
                : null,
          });
          settingsFields = base
            .filter((f) => WANTED.some((re) => re.test(String(f.name ?? ""))))
            .map((f) => {
              const own = shape(f);
              const fb = fall.find((x) => x.gid === f.gid);
              if (fall.length && PROP_ONLY.some((re) => re.test(String(f.name ?? "")))) {
                return { gid: f.gid, name: String(f.name ?? ""), type: "text", value: String(fb?.display_value ?? ""), options: [], selected: null, fromProperty: false, onProperty: true };
              }
              const borrowed = !own.value.trim() && fb && String(fb.display_value ?? "").trim() ? shape(fb) : null;
              return {
                gid: f.gid,
                name: String(f.name ?? ""),
                type: String(f.resource_subtype ?? "text"),
                value: (borrowed ?? own).value,
                options: ((f.enum_options ?? []) as Array<Record<string, unknown>>).filter((o) => o.enabled !== false).map((o) => ({ gid: o.gid, name: String(o.name ?? "") })),
                selected: (borrowed ?? own).selected,
                fromProperty: !!borrowed,
              };
            });
          if (fall.length) {
            for (const f of fall.filter((x) => PROP_ONLY.some((re) => re.test(String(x.name ?? ""))))) {
              if (settingsFields.some((x) => x.gid === f.gid)) continue;
              settingsFields.push({ gid: f.gid, name: String(f.name ?? ""), type: String(f.resource_subtype ?? "text"), value: String(f.display_value ?? ""), options: [], selected: null, fromProperty: false, onProperty: true });
            }
          }
        }
      } catch { /* best-effort */ }
      // Utility billing modes for the Plan bench V3 Utility Setup table (Brittany
      // 2026-10-21): the seven "Utilities - X" enums with their options, unit task
      // first, property task as the fallback, so "Who pays" can save back through
      // setUnitSettings. Read-only here.
      try {
        if (settingsGid) {
          const UKEYS: Array<[string, RegExp]> = [["electricity", /^utilities - electricity$/i], ["gas", /^utilities - gas$/i], ["water", /^utilities - water$/i],
            ["sewer", /^utilities - sewer/i], ["garbage", /^utilities - garbage$/i], ["oil", /^utilities - oil$/i], ["internet", /^utilities - internet$/i]];
          const fromU = (cfUnit ?? []) as SettingsCF[];
          const fromP = (cfProp ?? []) as SettingsCF[];
          for (const [k, re] of UKEYS) {
            const fu = fromU.find((f) => re.test(String(f.name ?? "")));
            const f = fu ?? fromP.find((x) => re.test(String(x.name ?? "")));
            if (!f || f.resource_subtype !== "enum") continue;
            utilFields.push({
              key: k, gid: f.gid, name: String(f.name ?? ""),
              options: ((f.enum_options ?? []) as Array<Record<string, unknown>>).filter((o) => o.enabled !== false).map((o) => ({ gid: o.gid, name: String(o.name ?? "") })),
              selected: String(((f.enum_value ?? {}) as Record<string, unknown>).gid ?? ""),
              onProperty: !fu,
            });
          }
        }
      } catch { /* best-effort */ }
      // Plan Status + open owner Modify requests from the Listing Settings task (by Unit ID)
      let planStatus = "";
      let lsGid = "";
      let teamAssign: Record<string, string> | null = null;
      let lsPlan: Record<string, string> | null = null;
      let openRequests: Array<Record<string, unknown>> = [];
      try {
        const LSP = "1217446710785429";
        lsGid = "";
        // Unit-ID search first; page scan (raised to 15 pages / 1,500 tasks) as fallback
        try {
          const sH = ((await asana("GET",
            `/workspaces/${WORKSPACE}/tasks/search?projects.any=${LSP}&custom_fields.1213183515622826.value=${uid}&opt_fields=name`)) ?? []) as Array<{ gid: string }>;
          if (sH[0]) lsGid = sH[0].gid;
        } catch { /* scan below */ }
        let off9 = "";
        for (let pg = 0; pg < 15 && !lsGid; pg++) {
          const r9 = await fetch(`${ASANA}/projects/${LSP}/tasks?limit=100&opt_fields=name,custom_fields.gid,custom_fields.display_value${off9 ? `&offset=${encodeURIComponent(off9)}` : ""}`,
            { headers: { "Authorization": `Bearer ${ASANA_PAT}` } });
          const j9 = await r9.json().catch(() => ({}));
          for (const t of (j9.data ?? []) as Array<{ gid: string; custom_fields?: Array<{ gid: string; display_value: string | null }> }>) {
            if (String((t.custom_fields ?? []).find((f) => f.gid === "1213183515622826")?.display_value ?? "").trim() === String(uid)) { lsGid = t.gid; break; }
          }
          off9 = j9.next_page?.offset ?? "";
          if (!off9) break;
        }
        if (lsGid) {
          const lst = await asana("GET", `/tasks/${lsGid}?opt_fields=custom_fields.gid,custom_fields.display_value,custom_fields.people_value.gid`);
          const lcf = (lst.custom_fields ?? []) as Array<{ gid: string; display_value: string | null; people_value?: Array<{ gid: string }> }>;
          const pv = (g0: string) => String(lcf.find((f) => String(f.gid) === g0)?.people_value?.[0]?.gid ?? "");
          teamAssign = { lead: pv("1217446711292696"), agent: pv("1217446729380828"), toc: pv("1217446729380923") };
          const lv = (g: string) => String(lcf.find((f) => f.gid === g)?.display_value ?? "").trim();
          planStatus = lv("1217569409567702");
          // current plan hydration (Brittany 2026-08-18): the workbench boots from the
          // stored decisions so a modification never redoes every step
          lsPlan = {
            marketRent: lv("1217530253031654"), targetRent: lv("1217446658749360"),
            startingRent: lv("1217446589856415"), minRent: lv("1217446710834881"),
            previousRent: lv("1217446658742575"),
            targetListDate: lv("1217515135889617").slice(0, 10),
            priorities: lv("1217535711314799"),
            petPolicy: lv("1217446589255794"), petRent: lv("1217450345262256"), petDeposit: lv("1217450833264180"),
            securityDeposit: lv("1217515853935577"), moveInSpecial: lv("1217446589879104"),
            lastMonthRent: lv("1217446710797252"), specialTerms: lv("1217446589881673"),
            minCredit: kvGet(lv(LS_SCREEN_CRIT), "Credit") || lv("1217446728640049"),
            minIncome: kvGet(lv(LS_SCREEN_CRIT), "Income") || lv("1217446770195125"),
            utilDesc: lv("1217515337017428"),
            amenDesc: lv(await amenFieldGid()),
            ffReport: kvGet(lv(LS_UTIL_REPORTS), "Flat Fee") || lv("1217533821059479"),
            estReport: kvGet(lv(LS_UTIL_REPORTS), "Estimated") || lv("1217533868879515"),
            utilProviders: lv("1217921018573269"),
            preparedBy: lv("1217516811159332"),
            inspectUrl: kvGet(lv(LS_INSPECT_LINKS), "Move In") || lv("1217515237891095"),
            recentInspectUrl: kvGet(lv(LS_INSPECT_LINKS), "Most Recent") || lv("1217718959198830"),
            preMoveOutUrl: kvGet(lv(LS_INSPECT_LINKS), "Pre-Move Out") || lv("1217719249318990"),
            bdRent: lv("1217624971001054"),
            targetMoveIn: lv("1217740384009759").slice(0, 10),
            landscaping: lv("1217741708866530"),
            securitySystem: lv("1217535226939178"), hoaMoveIn: lv("1217622037538954"),
            depositHeld: lv("1217530249320839"),
            targetDaysVacant: lv("1217530249349847"),
            compsData: lv("1217516812648029"),
            adjPlan: lv("1217448328664674"),
            turnNote: lv("1217509139690271"),
            turnAuth: lv("1217611635986386"),
          };
          const subs9 = await asana("GET", `/tasks/${lsGid}/subtasks?limit=100&opt_fields=name,notes,completed`);
          openRequests = ((subs9 ?? []) as Array<{ gid: string; name: string; notes?: string; completed?: boolean }>)
            .filter((s) => !s.completed && /^modify\s/i.test(String(s.name)))
            .map((s) => ({ gid: s.gid, name: String(s.name).slice(0, 140), text: String(s.notes ?? "").slice(0, 600) }));
        }
      } catch { /* best-effort */ }
      // inspection files on the initial populate (Brittany 2026-08-22): move-in and
      // annual, same rules as the dedicated Populate button
      const inspectFound: Record<string, unknown> = {};
      try {
        if (BUILDIUM_ID && BUILDIUM_SECRET) {
          const bhI = { "x-buildium-client-id": BUILDIUM_ID, "x-buildium-client-secret": BUILDIUM_SECRET };
          const frI = await fetch(`https://api.buildium.com/v1/files?entitytype=RentalUnit&entityid=${encodeURIComponent(String(uid))}&limit=200`, { headers: bhI });
          if (frI.ok) {
            const filesI = await frI.json().catch(() => []);
            const candI = (Array.isArray(filesI) ? filesI : [])
              .map((f: Record<string, unknown>) => ({
                name: String(f.Title ?? f.FileName ?? f.Name ?? ""),
                uploaded: String(f.UploadedDateTime ?? ""),
                ct: String(f.ContentType ?? ""),
              }))
              .filter((f) => /inspect/i.test(f.name) && (/pdf/i.test(f.ct) || /\.pdf$/i.test(f.name) || !f.ct))
              .sort((a, b) => b.uploaded.localeCompare(a.uploaded));
            const miI = candI.filter((f) => /move.?in/i.test(f.name))[0];
            const anI = candI.filter((f) => /annual/i.test(f.name))[0];
            if (miI) inspectFound.moveIn = `On file in Buildium: ${miI.name} (uploaded ${miI.uploaded.slice(0, 10)})`;
            if (anI) inspectFound.annual = `On file in Buildium: ${anI.name} (uploaded ${anI.uploaded.slice(0, 10)})`;
          }
        }
      } catch { /* inspections stay blank; the button can still populate them */ }
      // Owner identity + comms for the workbench (Brittany 2026-08-22):
      // name/email from the LU (or TP/PreLease) task, comm settings from the
      // Client Relations 2.0 task matched on Property ID.
      let luOwnerName = "";
      let luOwnerEmail = "";
      let ownerComms = "";
      let ownerCrGid = "";
      let ownerSrcGid = "";
      let ownerSrcKind = "";
      try {
        const luHitO = await luByUnitId(String(uid));
        if (luHitO) {
          ownerSrcGid = luHitO.gid;
          // LU vs PreLease vs TP matters to staff: PreLease means the listing is live
          // while the outgoing resident is still in place, so showings cannot be
          // scheduled yet (occupied showings / push) (Brittany 2026-08-22)
          ownerSrcKind = (String(luHitO.name).match(/^(LU|TP|PreLease)/i) || [""])[0].toUpperCase() === "PRELEASE"
            ? "PreLease" : (String(luHitO.name).match(/^(LU|TP)/i) || [""])[0].toUpperCase();
          const lu = await asana("GET", `/tasks/${luHitO.gid}?opt_fields=custom_fields.name,custom_fields.display_value`);
          const cfo = (lu.custom_fields ?? []) as Array<{ name: string; display_value: string | null }>;
          // Owner Contact (Tier 2 combined field) first, legacy singles as fallback.
          // Until 2026-10-07 this read only the legacy names while ownerSave wrote
          // Owner Contact, so a saved owner never came back on repopulate
          // (Plan + Propose feedback 1219237601948194).
          const ownerO = ownerFromCf(cfo);
          luOwnerName = ownerO.name.slice(0, 160);
          luOwnerEmail = ownerO.email.slice(0, 240);
        }
      } catch { /* owner block stays blank */ }
      // Buildium rental owners are the DEFAULT identity; anything saved on the
      // LU / TP / PreLease task is a deliberate override and wins (Brittany
      // 2026-09-10: "no owner communication" owners get a staff address there).
      // Bench saves write to that task only, never back to Buildium or Client Relations.
      let ownerNameSource = luOwnerName ? "task" : "";
      let ownerEmailSource = luOwnerEmail ? "task" : "";
      if (!luOwnerName || !luOwnerEmail) {
        try {
          const pidB = String((u as Record<string, unknown>).PropertyId ?? "").trim();
          if (pidB) {
            const orr = await fetch(`https://api.buildium.com/v1/rentals/owners?propertyids=${encodeURIComponent(pidB)}&limit=20`,
              { headers: { "x-buildium-client-id": BUILDIUM_ID, "x-buildium-client-secret": BUILDIUM_SECRET } });
            if (orr.ok) {
              const owners = (await orr.json().catch(() => [])) as Array<{ IsCompany?: boolean; FirstName?: string; LastName?: string; CompanyName?: string; Email?: string }>;
              // greeting convention is FIRST names ("Hi Emily,"); Buildium sometimes
              // stores the full name in FirstName, so take its first word. Companies
              // keep the full company name (Brittany 2026-09-10).
              const names = owners.map((o) => o.IsCompany
                ? String(o.CompanyName ?? "").trim()
                : (String(o.FirstName ?? "").trim().split(/\s+/)[0] ?? "")).filter(Boolean);
              const emails = [...new Set(owners.map((o) => String(o.Email ?? "").trim().toLowerCase()).filter(Boolean))];
              if (!luOwnerName && names.length) { luOwnerName = names.join(" & ").slice(0, 160); ownerNameSource = "buildium"; }
              if (!luOwnerEmail && emails.length) { luOwnerEmail = emails.join(",").slice(0, 240); ownerEmailSource = "buildium"; }
            }
          }
        } catch { /* defaults stay blank; the team fills them by hand */ }
      }
      try {
        const pidO = String((u as Record<string, unknown>).PropertyId ?? "").trim();
        if (pidO) {
          const crList = ((await asana("GET",
            `/workspaces/${WORKSPACE}/tasks/search?projects.any=1208917007356847&custom_fields.1213183108704512.value=${encodeURIComponent(pidO)}&opt_fields=name,custom_fields.gid,custom_fields.display_value`)) ?? []) as Array<{ gid: string; custom_fields?: Array<{ gid: string; display_value: string | null }> }>;
          const cr = crList[0];
          if (cr) {
            ownerCrGid = cr.gid;
            const cv = (g0: string) => String((cr.custom_fields ?? []).find((f) => String(f.gid) === g0)?.display_value ?? "").trim();
            // comms only. Name + email come from the LU / PreLease task ONLY, never from
            // Client Relations: those LU fields power other leasing tools, so a blank here
            // is a real gap the team needs to see and fill (Brittany 2026-08-22).
            ownerComms = cv("1212930081639044").slice(0, 400);
          }
        }
      } catch { /* comms stay blank */ }
      return j(headers, 200, {
        ok: true,
        unitId: String(uid),
        prevBreakdown,
        prevBreakdownMonth,
        ownerName: luOwnerName,
        ownerEmail: luOwnerEmail,
        ownerNameSource,
        ownerEmailSource,
        ownerComms,
        ownerCrGid,
        ownerSrcGid,
        ownerSrcKind,
        planStatus,
        lsPlan,
        openRequests,
        settingsFields,
        utilFields,
        matchedAddress: fullAddress,
        address: fullAddress,
        beds: bedBathNum(u.UnitBedrooms),
        baths: bedBathNum(u.UnitBathrooms),
        sqft: u.UnitSize ?? null,
        previousRent,
        depositHeld,
        leaseHistory,
        rentalSubType,
        settings,
        settingsGid,
        onboard,
        inspectFound,
        moveOut,
        moveOutTaskGid,
        moveOutSrcGid,
        targetMoveIn,
        pipelineListDate,
        teamAssign,
        teamUsers: await workspaceUsers().catch(() => []),
        psGid,
        lsGid,
        unitFeatures,
        propFeatures,
        marketRent: typeof u.MarketRent === "number" && u.MarketRent > 0 ? u.MarketRent : null,
        description: String(u.Description ?? ""),
        propertyId: u.PropertyId ?? null,
      });
    }

    // ---------- utilData: utility calculators support (Listing Workbench utility section) ----------
    // Returns the LU task + Calculate|utility subtask (report upload targets) and the unit's
    // utility charge lines from Buildium lease transactions (the populate button). Populated
    // bills are a starting point ONLY: staff cross-reference the actual bills and type over
    // anything off (Brittany 2026-08-16).
    if (action === "utilData") {
      const address = String(body.address ?? "").trim();
      if (!address) return j(headers, 400, { error: "missing_address" });
      const out: Record<string, unknown> = { ok: true, luGid: "", calcGid: "", bills: [] };
      try {
        let luHit: { gid: string; name?: string } | null = await luByUnitId(String(body.unitId ?? "").trim());
        if (!luHit) luHit = matchUnit(await allVacancies(true), address).hit ?? null;
        if (luHit) {
          out.luGid = luHit.gid;
          out.luName = luHit.name ?? "";
          const subs = await asana("GET", `/tasks/${luHit.gid}/subtasks?limit=100&opt_fields=name`);
          const isCalc = (sx: { name: string }) => /calculat/i.test(sx.name) && /utilit/i.test(sx.name);
          let calc = ((subs ?? []) as Array<{ gid: string; name: string }>).find(isCalc);
          if (!calc) {
            // "Calculate | New utility for listing" lives under the Pre Move-Out task,
            // a SIBLING of LU/TP/PreLease on the Leasing parent (Brittany 2026-08-20)
            try {
              const full = await asana("GET", `/tasks/${luHit.gid}?opt_fields=parent.gid`) as { parent?: { gid: string } | null };
              const pgid = full?.parent?.gid;
              if (pgid) {
                const sibs = ((await asana("GET", `/tasks/${pgid}/subtasks?limit=100&opt_fields=name`)) ?? []) as Array<{ gid: string; name: string }>;
                const pmo = sibs.find((sx) => /^pre\s*move[\s-]*out\s*\|/i.test(sx.name));
                if (pmo) {
                  const psubs = ((await asana("GET", `/tasks/${pmo.gid}/subtasks?limit=100&opt_fields=name`)) ?? []) as Array<{ gid: string; name: string }>;
                  calc = psubs.find(isCalc);
                }
              }
            } catch { /* calc target stays optional */ }
          }
          if (calc) { out.calcGid = calc.gid; out.calcName = calc.name; }
        }
      } catch { /* upload targets are optional; client reports what it found */ }
      const uid = String(body.unitId ?? "").trim();
      if (uid && BUILDIUM_ID && BUILDIUM_SECRET) {
        try {
          const bh = { "x-buildium-client-id": BUILDIUM_ID, "x-buildium-client-secret": BUILDIUM_SECRET };
          const ur = await fetch(`https://api.buildium.com/v1/rentals/units/${encodeURIComponent(uid)}`, { headers: bh });
          const u = await ur.json().catch(() => ({} as Record<string, unknown>));
          const pid = (u as Record<string, unknown>)?.PropertyId;
          if (pid) {
            // the queried unit's property address: names the comparable in report disclaimers
            try {
              const prr = await fetch(`https://api.buildium.com/v1/rentals/${encodeURIComponent(String(pid))}`, { headers: bh });
              if (prr.ok) {
                const prj = await prr.json().catch(() => ({} as Record<string, unknown>));
                const adr = ((prj as Record<string, unknown>).Address ?? {}) as Record<string, unknown>;
                out.unitAddress = [String(adr.AddressLine1 ?? ""), String(adr.City ?? "")].filter(Boolean).join(", ").slice(0, 120);
              }
            } catch { /* best-effort */ }
            const lr = await fetch(`https://api.buildium.com/v1/leases?propertyids=${encodeURIComponent(String(pid))}&limit=500`, { headers: bh });
            const leases = ((await lr.json().catch(() => [])) as Array<Record<string, unknown>>) ?? [];
            const mine = leases.filter((l) => String(l.UnitId ?? "") === uid)
              .sort((a, b) => String(b.LeaseFromDate ?? "").localeCompare(String(a.LeaseFromDate ?? ""))).slice(0, 3);
            const cutoff = Date.now() - 400 * 86400000;
            const UT = /util|water|sewer|garbage|electric|\bgas\b|wsg|spu|scl|pse\b|recology|republic|waste|city of/i;
            const bills: Array<{ date: string; memo: string; amount: number }> = [];
            for (const l of mine) {
              const tr = await fetch(`https://api.buildium.com/v1/leases/${l.Id}/transactions?limit=200`, { headers: bh });
              const txs = ((await tr.json().catch(() => [])) as Array<Record<string, unknown>>) ?? [];
              for (const t of txs) {
                const d = String(t.Date ?? "").slice(0, 10);
                if (!d || Date.parse(d) < cutoff) continue;
                if (!/charge/i.test(String(t.TransactionType ?? ""))) continue;
                const j0 = (t.Journal ?? {}) as Record<string, unknown>;
                const memo = String(j0.Memo ?? "");
                const lines = (j0.Lines ?? []) as Array<Record<string, unknown>>;
                let pushed = false;
                for (const ln of lines) {
                  const gl = String(((ln.GLAccount ?? {}) as Record<string, unknown>).Name ?? "");
                  const amt = Number(ln.Amount);
                  if (!isFinite(amt) || amt === 0) continue;
                  if (UT.test(gl) || UT.test(memo)) { bills.push({ date: d, memo: (memo || gl).slice(0, 120), amount: amt }); pushed = true; }
                }
                if (!pushed && !lines.length && UT.test(memo)) {
                  const amt = Number(t.TotalAmount);
                  if (isFinite(amt) && amt !== 0) bills.push({ date: d, memo: memo.slice(0, 120), amount: amt });
                }
              }
            }
            bills.sort((a, b) => b.date.localeCompare(a.date));
            out.bills = bills.slice(0, 40);
            // Total property bedrooms (flat fee denominator): every unit's bedroom count,
            // vacancy ignored (Brittany 2026-08-16: "we don't track vacancies into this equation").
            try {
              const unr = await fetch(`https://api.buildium.com/v1/rentals/units?propertyids=${encodeURIComponent(String(pid))}&limit=100`, { headers: bh });
              const units = ((await unr.json().catch(() => [])) as Array<Record<string, unknown>>) ?? [];
              const BEDN: Record<string, number> = { Studio: 1, OneBed: 1, TwoBed: 2, ThreeBed: 3, FourBed: 4, FiveBed: 5, SixBed: 6, SevenBed: 7, EightBed: 8, NineBedPlus: 9 };
              let totBeds = 0;
              const parts: string[] = [];
              for (const u2 of units) {
                const n = BEDN[String(u2.UnitBedrooms ?? "")] ?? 0;
                if (n > 0) { parts.push(`${String(u2.UnitNumber ?? "?")}: ${String(u2.UnitBedrooms)}`); totBeds += n; }
              }
              out.propertyBedrooms = totBeds;
              out.unitBreakdown = parts.slice(0, 20).join(" | ");
            } catch { /* bedroom pull is best-effort */ }
            // Flat fee source: the actual utility BILLS paid on the property (accounts
            // payable), not resident charges. GL names resolve the line categories.
            try {
              const gr = await fetch("https://api.buildium.com/v1/glaccounts?limit=500", { headers: bh });
              const gls = ((await gr.json().catch(() => [])) as Array<Record<string, unknown>>) ?? [];
              const glName: Record<string, string> = {};
              for (const g0 of gls) glName[String(g0.Id)] = String(g0.Name ?? "");
              let bl: Array<Record<string, unknown>> = [];
              const dFrom = new Date(Date.now() - 364 * 86400000).toISOString().slice(0, 10);
              const dTo = new Date().toISOString().slice(0, 10);
              const dq = `frompaiddate=${dFrom}&topaiddate=${dTo}`;
              for (const q of [`entitytype=Rental&entityid=${encodeURIComponent(String(pid))}&${dq}`, `propertyids=${encodeURIComponent(String(pid))}&${dq}`]) {
                const br2 = await fetch(`https://api.buildium.com/v1/bills?${q}&limit=200`, { headers: bh });
                if (!br2.ok) { out.ffQuery = (out.ffQuery ?? "") + q.split("=")[0] + ":" + br2.status + " "; continue; }
                const parsed = await br2.json().catch(() => null);
                if (Array.isArray(parsed)) { bl = parsed; out.ffQuery = q.split("=")[0] + ":ok:" + parsed.length; break; }
              }
              const ffBills: Array<{ date: string; memo: string; amount: number; vendor?: string }> = [];
              const ffVids: string[] = [];
              for (const b0 of bl) {
                const d = String(b0.Date ?? "").slice(0, 10);
                if (!d || Date.parse(d) < cutoff) continue;
                const bmemo = String(b0.Memo ?? "");
                const lines2 = (b0.Lines ?? []) as Array<Record<string, unknown>>;
                for (const ln of lines2) {
                  // Batch vendor bills carry lines for MANY properties, and the bills
                  // query returns any bill with a line touching this property. Only
                  // this property's lines belong in its flat fee (bitten 2026-09-02:
                  // unit 462300 pulled City of Auburn lines from an 8/2025 batch).
                  const ae0 = (ln.AccountingEntity ?? {}) as Record<string, unknown>;
                  if (ae0.Id != null && String(ae0.Id) !== String(pid)) continue;
                  const glo = (ln.GLAccount ?? {}) as Record<string, unknown>;
                  const gl = String(glo.Name ?? "") || (glName[String(glo.Id ?? "")] ?? "");
                  const amt = Number(ln.Amount);
                  if (!isFinite(amt) || amt === 0) continue;
                  const lnMemo = String(ln.Memo ?? "");
                  // Flat fee lines come ONLY from the utility GL subaccounts
                  // "Gas / Electric" and "Water, Sewer, Garbage" (Brittany 2026-08-16);
                  // memo matching caught appliance purchases and the like.
                  const FF_GL = /(gas\s*\/\s*electric)|(water[,\s]+sewer[,\s]+garbage)/i;
                  if (FF_GL.test(gl)) {
                    const label = [gl, bmemo, lnMemo].filter((x, ix, arr) => x && arr.indexOf(x) === ix).join(" - ");
                    ffBills.push({ date: d, memo: (label || "Utility bill").slice(0, 140), amount: amt });
                    ffVids.push(String(b0.VendorId ?? ""));
                  }
                }
              }
              // Vendor names on the bills: accounting's flat-fee method groups bills
              // by PROVIDER, each on its own billing cycle, so the workbench needs
              // the vendor to group by (Cooper's Flat Fee Utility Cost Analysis).
              const vids = Array.from(new Set(ffVids.filter(Boolean))).slice(0, 8);
              const vmap: Record<string, string> = {};
              for (const vid of vids) {
                try {
                  const vr = await fetch(`https://api.buildium.com/v1/vendors/${encodeURIComponent(vid)}`, { headers: bh });
                  if (!vr.ok) continue;
                  const v0 = (await vr.json().catch(() => null)) as Record<string, unknown> | null;
                  const nm = v0 ? (String(v0.CompanyName ?? "").trim() || `${String(v0.FirstName ?? "")} ${String(v0.LastName ?? "")}`.trim()) : "";
                  if (nm) vmap[vid] = nm;
                } catch { /* vendor name is best-effort */ }
              }
              ffBills.forEach((b, i) => { const nm = vmap[ffVids[i]]; if (nm) b.vendor = nm; });
              ffBills.sort((a, b) => b.date.localeCompare(a.date));
              out.ffBills = ffBills.slice(0, 40);
              // diagnostic: distinct GL names seen in the window, so a zero-match is explainable
              const seen = new Set<string>();
              for (const b0 of bl) for (const ln of ((b0.Lines ?? []) as Array<Record<string, unknown>>)) {
                const glo2 = (ln.GLAccount ?? {}) as Record<string, unknown>;
                const nm = String(glo2.Name ?? "") || (glName[String(glo2.Id ?? "")] ?? "");
                if (nm) seen.add(nm);
              }
              out.glSeen = Array.from(seen).slice(0, 20);
            } catch { /* bills pull is best-effort */ }
          }
        } catch { /* populate is best-effort */ }
      }
      return j(headers, 200, out);
    }

    // ---------- lsPush: PreListing Workbench -> Listing Settings task + Leasing URL ----------
    // Find-or-create "Listing | {address}" in Listing Settings, write the bench's fields,
    // and return the owner-facing /en/listing URL (Brittany 2026-08-13).
    if (action === "lsPush") {
      const LS_PROJECT = "1217446710785429";
      const address = String(body.address ?? "").trim().slice(0, 200);
      if (address.length < 8) return j(headers, 400, { error: "missing_address" });
      const lsSlug = (a: string) => a.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
      let slug = lsSlug(address);
      // find existing by Unit ID first (the stable key; address formatting varies and
      // used to spawn duplicate tasks — Brittany 2026-08-17). Slug match is the
      // fallback for tasks that predate the Unit ID field.
      const UNIT_F = "1213183515622826";
      const pushUid = String(body.unitId ?? "").trim();
      let taskGid = "";
      let matchedName = "";
      let slugGid = "";
      let off = "";
      // Unit-ID search first: the page scan below caps at 500 tasks and would silently
      // CREATE A DUPLICATE Listing task past that (2026-08-25 audit; the Move-Out
      // project hit this exact cap earlier). Scan stays as the no-Unit-ID fallback.
      if (/^\d+$/.test(pushUid)) {
        try {
          const sHits = ((await asana("GET",
            `/workspaces/${WORKSPACE}/tasks/search?projects.any=${LS_PROJECT}&custom_fields.${UNIT_F}.value=${pushUid}&opt_fields=name`)) ?? []) as Array<{ gid: string; name: string }>;
          if (sHits[0]) { taskGid = sHits[0].gid; matchedName = sHits[0].name; }
        } catch { /* fall through to the page scan */ }
      }
      for (let page = 0; page < 15 && !taskGid; page++) {
        const res0 = await fetch(`${ASANA}/projects/${LS_PROJECT}/tasks?limit=100&opt_fields=name,custom_fields.gid,custom_fields.display_value${off ? `&offset=${encodeURIComponent(off)}` : ""}`,
          { headers: { "Authorization": `Bearer ${ASANA_PAT}` } });
        const json0 = await res0.json().catch(() => ({}));
        for (const t of (json0.data ?? []) as Array<{ gid: string; name: string; custom_fields?: Array<{ gid: string; display_value: string | null }> }>) {
          if (pushUid && String((t.custom_fields ?? []).find((f) => f.gid === UNIT_F)?.display_value ?? "").trim() === pushUid) { taskGid = t.gid; matchedName = t.name; break; }
          if (!slugGid && lsSlug(String(t.name).replace(/^listing\s*\|/i, "").trim()) === slug) slugGid = t.gid;
        }
        off = json0.next_page?.offset ?? "";
        if (!off) break;
      }
      if (!taskGid) taskGid = slugGid;
      // the owner URL slug comes from the TASK NAME, not the pushed address: Buildium's
      // full address format ("#A, Seattle, WA 98133") slugs differently than the task
      // name ("#A Seattle") and produced dead preview links (Brittany 2026-08-17)
      if (taskGid && matchedName) {
        const nameSlug = lsSlug(String(matchedName).replace(/^listing\s*\|/i, "").trim());
        if (nameSlug) slug = nameSlug;
      }
      // estimatedRent = the workbench's verified rent -> Market Rent (Target Rent is
      // derived from priorities on the owner page, never pushed as market; Brittany 2026-08-17).
      const F: Record<string, string> = {
        unitId: "1213183515622826", petPolicy: "1217446589255794", startingRent: "1217446589856415",
        currentRent: "1217446658742575", estimatedRent: "1217530253031654", minRent: "1217446710834881",
        targetRent: "1217446658749360", securityDeposit: "1217515853935577",
        moveInSpecial: "1217446589879104",
        lastMonthRent: "1217446710797252", specialTerms: "1217446589881673",
        priceAdjustmentPlan: "1217448328664674", photoReview: "1217448327991331",
        petRent: "1217450345262256", petDeposit: "1217450833264180",
        utilDesc: "1217515337017428",
        utilProviders: "1217921018573269",
        preparedBy: "1217516811159332", compsData: "1217516812648029",
        turnProposal: "1217509139690271",
        securitySystem: "1217535226939178", hoaMoveIn: "1217622037538954",
        depositHeld: "1217530249320839", targetDaysVacant: "1217530249349847",
        bdRent: "1217624971001054",
        turnAuth: "1217611635986386",
      };
      const DATE_F: Record<string, string> = { targetLeaseEnd: "1217450212127139", targetListDate: "1217515135889617", targetMoveIn: "1217740384009759" };
      // Client Priorities multi-select: option names -> option gids (field 1217535711314799)
      const PRI_FIELD = "1217535711314799";
      const PRI_OPTS: Record<string, string> = {
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
      const cf: Record<string, unknown> = {};
      for (const [k, gidF] of [["assignLead", "1217446711292696"], ["assignAgent", "1217446729380828"], ["assignToc", "1217446729380923"]] as const) {
        const v0 = String(body[k] ?? "").replace(/\D/g, "");
        if (v0) cf[gidF] = [v0];
      }
      // Landscaping Responsibility enum (Brittany 2026-08-22)
      const LRESP_OPT: Record<string, string> = { "Landlord Responsible": "1217741708866531", "Resident Responsible": "1217741708866532" };
      const lresp = String(body.landscaping ?? "").trim();
      if (LRESP_OPT[lresp]) cf["1217741708866530"] = LRESP_OPT[lresp];
      if (String(body.amenDesc ?? "").trim()) {
        const ag = await amenFieldGid();
        if (ag) cf[ag] = String(body.amenDesc).slice(0, 6000);
      }
      for (const [k, gid] of Object.entries(F)) {
        const v = body[k];
        if (v == null || v === "") continue;
        const n = Number(v);
        cf[gid] = ["startingRent", "currentRent", "estimatedRent", "targetRent", "minRent", "petRent", "petDeposit", "securityDeposit", "turnAuth", "bdRent", "depositHeld", "targetDaysVacant"].includes(k)
          ? (Number.isFinite(n) ? n : undefined)
          : String(v).slice(0, k === "compsData" ? 4000 : 6000);
        if (cf[gid] === undefined) delete cf[gid];
      }
      for (const [k, gid] of Object.entries(DATE_F)) {
        const v = String(body[k] ?? "").slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(v)) cf[gid] = { date: v };
      }
      // Tier 1 combined fields (2026-09-26): the bench form still sends the
      // parts separately; a blank part keeps the existing value, mirroring the
      // skip-empty behavior the single fields had.
      try {
        const curC = taskGid ? await asana("GET", `/tasks/${taskGid}?opt_fields=custom_fields.gid,custom_fields.display_value`) : { custom_fields: [] };
        const curCf = (curC.custom_fields ?? []) as Array<{ gid: string; display_value?: string | null }>;
        const curOf = (g: string) => String(curCf.find((f) => f.gid === g)?.display_value ?? "");
        const compose = (gid: string, parts: Array<[string, string]>) => {
          const cur = curOf(gid);
          const lines = parts
            .map(([lab, key]) => { const v = String(body[key] ?? "").trim() || kvGet(cur, lab); return v ? `${lab}: ${v}` : ""; })
            .filter(Boolean);
          if (lines.length) cf[gid] = lines.join("\n").slice(0, 1024);
        };
        compose(LS_SCREEN_CRIT, [["Credit", "minCredit"], ["Income", "minIncome"]]);
        compose(LS_INSPECT_LINKS, [["Move In", "inspectUrl"], ["Most Recent", "recentInspectUrl"], ["Pre-Move Out", "preMoveOutUrl"]]);
        compose(LS_UTIL_REPORTS, [["Flat Fee", "flatFeeReport"], ["Estimated", "estReport"]]);
      } catch { /* combined fields skip this push; the next push writes them */ }
      // the owner page URL is recorded on the task itself (Leasing Plan URL field,
      // added by Brittany 2026-08-17) so the team can open it straight from Asana
      cf["1217557090620385"] = `https://www.sagareus.com/leasing-plan?p=${slug}`;
      if (Array.isArray(body.clientPriorities)) {
        const gids = (body.clientPriorities as unknown[])
          .map((o) => PRI_OPTS[String(o).trim()]).filter(Boolean);
        if (gids.length) cf[PRI_FIELD] = gids;
      }
      // draft:true = a per-step quick save (Brittany 2026-08-21): fields write, but no
      // status lifecycle, no approval reset, no Modify auto-close, no subtask completion.
      const isDraft = body.draft === true;
      // Plan Status lifecycle (Brittany 2026-08-17): first push = Sent; a push against
      // an approved plan = Revised (the unlock). Open Modify tasks auto-complete below.
      const PS_F = "1217569409567702";
      const PS_OPT: Record<string, string> = { Draft: "1217569409567703", Sent: "1217569409567704", Accepted: "1217569409567705", "Team Lead Approved": "1217569409567706", Revised: "1217569409567707" };
      const RN_F = "1217569237386930";
      const respToOwner = String(body.responseToOwner ?? "").trim().slice(0, 600);
      let wasApproved = false;
      let openModify: Array<{ gid: string; name: string; notes?: string }> = [];
      if (taskGid) {
        try {
          const cur = await asana("GET", `/tasks/${taskGid}?opt_fields=custom_fields.gid,custom_fields.display_value`);
          const curPs = String(((cur.custom_fields ?? []) as Array<{ gid: string; display_value: string | null }>).find((f) => f.gid === PS_F)?.display_value ?? "");
          wasApproved = curPs === "Accepted" || curPs === "Team Lead Approved";
          const msubs = await asana("GET", `/tasks/${taskGid}/subtasks?limit=100&opt_fields=name,notes,completed`);
          openModify = ((msubs ?? []) as Array<{ gid: string; name: string; notes?: string; completed?: boolean }>)
            .filter((s) => !s.completed && /^modify\s/i.test(String(s.name)));
        } catch { /* best-effort */ }
      }
      // Owner Managed Listing (feedback 1219659478918810): the plan saves straight to
      // Team Lead Approved (no owner approval round, no fan-out), the LU is marked Do
      // Not List = Owner Self Listing, and no staff leasing work is assigned until an
      // applicant is approved. The plan email still goes to the owner.
      const ownerListing = String(body.listManaged ?? "") === "owner";
      const psOut = ownerListing ? "Team Lead Approved" : (wasApproved ? "Revised" : "Sent");
      if (!isDraft) cf[PS_F] = PS_OPT[psOut];
      // revision state field: machine state for the page banner (You asked / What we did);
      // approvals reset on every push, lsAccept rebuilds them
      const rnDay = new Date(Date.now() - 7 * 3600 * 1000).toISOString().slice(0, 10);
      const rnState = { appr: ownerListing ? { lp: { d: rnDay, by: "Owner Managed Listing" }, to: { d: rnDay, by: "Owner Managed Listing" } } : {}, req: openModify.map((m) => ({ s: String(m.name).replace(/^modify\s+/i, "").replace(/\s*\|.*$/, "").slice(0, 40), t: String(m.notes ?? "").split(/\r?\n/).find((l) => l.trim() && !/^section:/i.test(l)) ?? "" })).slice(0, 4), resp: respToOwner, d: new Date(Date.now() - 7 * 3600 * 1000).toISOString().slice(0, 10) };
      if (!isDraft) cf[RN_F] = JSON.stringify(rnState).slice(0, 1020);
      // One bad field rejects an entire batched write ("Custom field is not on given
      // object"), silently losing every other field. Batch first for speed; on failure
      // retry field-by-field and report exactly which gids Asana refused (2026-08-25).
      const fieldErrors: string[] = [];
      const writeCf = async (gid9: string, fields: Record<string, unknown>) => {
        if (!Object.keys(fields).length) return;
        try { await asana("PUT", `/tasks/${gid9}`, { custom_fields: fields }); return; }
        catch { /* batch refused: isolate the offender(s) */ }
        for (const [fg, fv] of Object.entries(fields)) {
          try { await asana("PUT", `/tasks/${gid9}`, { custom_fields: { [fg]: fv } }); }
          catch { fieldErrors.push(fg); }
        }
      };
      if (!taskGid) {
        const t = await asana("POST", "/tasks", {
          name: `Listing | ${address}`.slice(0, 250),
          projects: [LS_PROJECT],
          notes: "Source of truth for this property's Leasing URL. Edit fields here; the page updates live.\n\nCreated from the PreListing Workbench. Done by Claude on behalf of the listing agent.",
        });
        taskGid = t.gid;
        await writeCf(taskGid, cf);
      } else if (Object.keys(cf).length) {
        await writeCf(taskGid, cf);
        if (!isDraft) await asana("POST", `/tasks/${taskGid}/stories`, {
          text: "Listing Settings updated from the PreListing Workbench." +
            (ownerListing ? " Owner Managed Listing: plan saved as Team Lead Approved; the Lease Up task is marked Do Not List (Owner Self Listing), so no staff leasing work is assigned until an applicant is approved." : "") +
            " Done by Claude on behalf of the listing agent.",
        }).catch(() => null);
      }
      // auto-complete the unit's open Modify tasks, each closed quoting the response (Brittany 2026-08-17)
      let modifyClosed = 0;
      for (const m of isDraft ? [] : openModify) {
        try {
          await asana("POST", `/tasks/${m.gid}/stories`, {
            text: `Handled by a workbench push on ${rnState.d}.` + (respToOwner ? `\nResponse to owner: ${respToOwner}` : "") + "\nDone by Claude on behalf of the listing agent.",
          }).catch(() => null);
          await asana("PUT", `/tasks/${m.gid}`, { completed: true });
          modifyClosed++;
        } catch { /* best-effort */ }
      }
      // LU pipeline close-out (Brittany 2026-08-17): the push IS the record. Complete the
      // Prepare + Email subtasks with the owner email pasted, due today; write the LU
      // task's Starting Price + Minimum Price fields from the derived (nearest-$5) plan.
      const luNotes: string[] = [];
      try {
        const emailCopy = String(body.emailCopy ?? "").trim().slice(0, 8000);
        const luHit9 = await luByUnitId(pushUid);
        if (luHit9) {
          const today9 = new Date(Date.now() - 7 * 3600 * 1000).toISOString().slice(0, 10);
          const subs10 = await asana("GET", `/tasks/${luHit9.gid}/subtasks?limit=100&opt_fields=name,completed`);
          const targets = ((subs10 ?? []) as Array<{ gid: string; name: string; completed?: boolean }>)
            .filter((s) => /send\s*\|\s*leasing\s*plan/i.test(s.name) || /^prepare\s*\|\s*bd\s*listing/i.test(s.name) || /market rent.*prelisting|prelisting/i.test(s.name));
          for (const s of isDraft ? [] : targets) {
            try {
              if (emailCopy) {
                await asana("POST", `/tasks/${s.gid}/stories`, {
                  text: `Leasing Plan sent to the owner. Copy of the email:\n\n${emailCopy}\n\nDone by Claude on behalf of the listing agent.`,
                }).catch(() => null);
              }
              await asana("PUT", `/tasks/${s.gid}`, { due_on: today9, completed: true });
              luNotes.push(`closed: ${s.name}`);
            } catch { luNotes.push(`failed: ${s.name}`); }
          }
          // Starting Price + Minimum Price + Utility Flat Fee on the LU task, by name
          const startN = Number(body.startingRent);
          const minN = Number(body.minRent);
          const feeN = Number(body.utilFlatFee);
          if (Number.isFinite(startN) || Number.isFinite(minN) || (Number.isFinite(feeN) && feeN > 0)) {
            try {
              const luT = await asana("GET", `/tasks/${luHit9.gid}?opt_fields=custom_fields.gid,custom_fields.name`);
              const luCf9 = (luT.custom_fields ?? []) as Array<{ gid: string; name: string }>;
              const cf9: Record<string, unknown> = {};
              const sp = luCf9.find((f) => /starting\s*price$/i.test(f.name));
              const mp = luCf9.find((f) => /minimum\s*price$/i.test(f.name));
              const uf = luCf9.find((f) => /utility\s*flat\s*fee/i.test(f.name));
              if (sp && Number.isFinite(startN)) cf9[sp.gid] = startN;
              if (mp && Number.isFinite(minN)) cf9[mp.gid] = minN;
              if (uf && Number.isFinite(feeN) && feeN > 0) cf9[uf.gid] = feeN;
              else if (!uf && Number.isFinite(feeN) && feeN > 0) luNotes.push("no Utility Flat Fee field on the LU task");
              if (Object.keys(cf9).length) { await asana("PUT", `/tasks/${luHit9.gid}`, { custom_fields: cf9 }); luNotes.push("lu prices set"); }
              else luNotes.push("lu price fields not found");
            } catch { luNotes.push("lu prices failed"); }
          }
          // Do Not List follows the Listing Management choice on every final push:
          // Owner Managed sets Owner Self Listing; switching back clears ONLY that
          // value (an Owner Selling / Moving Back In flag set by hand stays)
          if (!isDraft) {
            try {
              const DNL_F = "1214787859185273", DNL_SELF = "1214787859185276";
              const luD = await asana("GET", `/tasks/${luHit9.gid}?opt_fields=custom_fields.gid,custom_fields.enum_value.gid`);
              const curDnl = String(((luD.custom_fields ?? []) as Array<{ gid: string; enum_value?: { gid?: string } | null }>).find((f) => f.gid === DNL_F)?.enum_value?.gid ?? "");
              if (ownerListing && curDnl !== DNL_SELF) { await asana("PUT", `/tasks/${luHit9.gid}`, { custom_fields: { [DNL_F]: DNL_SELF } }); luNotes.push("lu do not list: owner self listing"); }
              else if (!ownerListing && curDnl === DNL_SELF) { await asana("PUT", `/tasks/${luHit9.gid}`, { custom_fields: { [DNL_F]: null } }); luNotes.push("lu do not list cleared"); }
            } catch { luNotes.push("lu do not list failed"); }
          }
          // Final push only: LU due 1 day before Target List Date, assigned to the
          // Team Lead from Listing Settings (Leasing Agent as fallback) (Brittany 2026-08-21).
          // Skipped for an Owner Managed Listing: no staff leasing work until an applicant.
          if (!isDraft && !ownerListing) {
            try {
              const upd9: Record<string, unknown> = {};
              const tld9 = String(body.targetListDate ?? "").slice(0, 10);
              if (/^\d{4}-\d{2}-\d{2}$/.test(tld9)) {
                const d9 = new Date(tld9 + "T12:00:00Z");
                d9.setUTCDate(d9.getUTCDate() - 1);
                upd9.due_on = d9.toISOString().slice(0, 10);
              }
              if (taskGid) {
                const lsT9 = await asana("GET", `/tasks/${taskGid}?opt_fields=custom_fields.gid,custom_fields.people_value.gid`);
                const lsCf9 = (lsT9.custom_fields ?? []) as Array<{ gid: string; people_value?: Array<{ gid: string }> }>;
                const lead9 = String(lsCf9.find((f) => String(f.gid) === "1217446711292696")?.people_value?.[0]?.gid ?? "") ||
                              String(lsCf9.find((f) => String(f.gid) === "1217446729380828")?.people_value?.[0]?.gid ?? "");
                if (lead9) upd9.assignee = lead9;
              }
              if (Object.keys(upd9).length) { await asana("PUT", `/tasks/${luHit9.gid}`, upd9); luNotes.push("lu due + assignee set"); }
            } catch { luNotes.push("lu due/assignee failed"); }
          }
        } else luNotes.push("no LU task for unit");
      } catch { /* best-effort */ }
      return j(headers, 200, {
        ok: true,
        taskGid,
        taskUrl: `https://app.asana.com/0/0/${taskGid}`,
        leasingUrl: `https://www.sagareus.com/leasing-plan?p=${slug}`,
        planStatus: isDraft ? undefined : psOut,
        modifyClosed,
        luNotes,
        fieldErrors,
      });
    }

    // ---------- plPhotoFail: photo review failed -> flag the LU photo subtask ----------
    // Prefixes NEED PHOTO onto the photo subtask under the property's Lease Up task,
    // dues it the same day as move out, and assigns Courtney (Brittany 2026-08-13).
    // ---------- execFollowUp: "check the owner's email reply" task (Brittany 2026-10-21) ----------
    // For a price drop that needs owner approval: subtask under the LU, due the next
    // day, assigned to the unit's team lead. An open one is reused, not duplicated.
    if (action === "execFollowUp") {
      const luF = String(body.taskGid ?? "").trim();
      const addrF = String(body.address ?? "").trim();
      const leadF = String(body.teamLead ?? "").trim().toLowerCase();
      const whatF = String(body.what ?? "").trim().slice(0, 300);
      if (!luF) return j(headers, 400, { error: "missing_fields" });
      try {
        const tomorrowF = new Date(Date.now() - 7 * 3600 * 1000 + 86400000).toISOString().slice(0, 10);
        const subsF = ((await asana("GET", `/tasks/${luF}/subtasks?limit=100&opt_fields=name,completed,assignee.name,due_on`)) ?? []) as Array<{ gid: string; name: string; completed?: boolean; assignee?: { name?: string } | null; due_on?: string | null }>;
        const openF = subsF.find((x) => !x.completed && /^check owner email response/i.test(x.name));
        if (openF) return j(headers, 200, { ok: true, existing: true, gid: openF.gid, url: `https://app.asana.com/0/0/${openF.gid}`, dueOn: openF.due_on ?? "", assignedTo: openF.assignee?.name ?? "" });
        let gidF = "", nameF = "";
        if (leadF) { const hitF = (await workspaceUsers()).find((u) => u.name.trim().toLowerCase() === leadF); if (hitF) { gidF = hitF.gid; nameF = hitF.name; } }
        const sub = await asana("POST", `/tasks/${luF}/subtasks`, {
          name: `Check owner email response // listing adjustment // ${addrF || "listing"}`.slice(0, 250),
          due_on: tomorrowF,
          ...(gidF ? { assignee: gidF } : {}),
          notes: "Owner approval is needed before this listing adjustment goes live (for example a price drop below the minimum rent). Check the owner's email reply; once approved, record it on the Execute + Adapt bench and submit the change." + (whatF ? `\n\nProposed change: ${whatF}` : ""),
        }) as { gid: string };
        await asana("POST", `/tasks/${luF}/stories`, { text: `Waiting on the owner's approval for a listing adjustment. Follow up task due ${tomorrowF}${nameF ? `, assigned to ${nameF}` : ""} (Execute + Adapt bench).` }).catch(() => null);
        return j(headers, 200, { ok: true, existing: false, gid: sub.gid, url: `https://app.asana.com/0/0/${sub.gid}`, dueOn: tomorrowF, assignedTo: nameF });
      } catch { return j(headers, 502, { error: "asana_failed", message: "Could not create the follow up task; add it on the LU by hand." }); }
    }

    // ---------- execPhotoOrder: Execute + Adapt V3 "Order New Photos" (Brittany 2026-10-24) ----------
    // Subtask under the Lease Up task, due the same day, assigned to the unit's team
    // lead. An open "Order New Photos" subtask is reused rather than duplicated.
    if (action === "execPhotoOrder") {
      const luO = String(body.taskGid ?? "").trim();
      const addrO = String(body.address ?? "").trim();
      const leadO = String(body.teamLead ?? "").trim().toLowerCase();
      if (!luO) return j(headers, 400, { error: "missing_fields" });
      try {
        const todayO = new Date(Date.now() - 7 * 3600 * 1000).toISOString().slice(0, 10);
        const subsO = ((await asana("GET", `/tasks/${luO}/subtasks?limit=100&opt_fields=name,completed,assignee.name,due_on`)) ?? []) as Array<{ gid: string; name: string; completed?: boolean; assignee?: { name?: string } | null; due_on?: string | null }>;
        const openO = subsO.find((x) => !x.completed && /^order new photos/i.test(x.name));
        if (openO) return j(headers, 200, { ok: true, existing: true, gid: openO.gid, url: `https://app.asana.com/0/0/${openO.gid}`, dueOn: openO.due_on ?? "", assignedTo: openO.assignee?.name ?? "" });
        let leadGid = "", leadName = "";
        if (leadO) {
          const hitO = (await workspaceUsers()).find((u) => u.name.trim().toLowerCase() === leadO);
          if (hitO) { leadGid = hitO.gid; leadName = hitO.name; }
        }
        const sub = await asana("POST", `/tasks/${luO}/subtasks`, {
          name: `Order New Photos | ${addrO || "listing"}`.slice(0, 250),
          due_on: todayO,
          ...(leadGid ? { assignee: leadGid } : {}),
          notes: "Requested from the Execute + Adapt bench during the weekly listing review: the current listing photos need a refresh. Schedule the reshoot and update the Buildium listing when the new photos are in.",
        }) as { gid: string };
        await asana("POST", `/tasks/${luO}/stories`, { text: `New listing photos ordered (Execute + Adapt bench). Subtask due ${todayO}${leadName ? `, assigned to ${leadName}` : ", no team lead on Listing Settings so it is unassigned"}.` }).catch(() => null);
        return j(headers, 200, { ok: true, existing: false, gid: sub.gid, url: `https://app.asana.com/0/0/${sub.gid}`, dueOn: todayO, assignedTo: leadName });
      } catch { return j(headers, 502, { error: "asana_failed", message: "Could not create the photo subtask; add it on the LU task by hand." }); }
    }

    if (action === "plPhotoFail") {
      const address = String(body.address ?? "").trim();
      if (!address && !body.unitId) return j(headers, 400, { error: "missing_address" });
      let luHit: { gid: string } | null = await luByUnitId(String(body.unitId ?? "").trim());
      if (!luHit) luHit = matchUnit(await allVacancies(true), address).hit ?? null;
      if (!luHit) return j(headers, 404, { error: "lu_not_found", message: "No Lease Up task matches this unit, so the photo subtask could not be flagged." });
      const luGid = luHit.gid;
      const lu = await asana("GET", `/tasks/${luGid}?opt_fields=name,custom_fields.name,custom_fields.display_value`);
      const luCf = (lu.custom_fields ?? []) as Array<{ name: string; display_value: string | null }>;
      const moRaw = String(luCf.find((f) => /move\s*out/i.test(f.name) && !/completion/i.test(f.name) && f.display_value)?.display_value ??
        luCf.find((f) => /move\s*out/i.test(f.name) && f.display_value)?.display_value ?? "").slice(0, 10);
      const dueOn = /^\d{4}-\d{2}-\d{2}$/.test(moRaw) ? moRaw : new Date(Date.now() - 7 * 3600 * 1000).toISOString().slice(0, 10);
      const subs = await asana("GET", `/tasks/${luGid}/subtasks?limit=100&opt_fields=name,completed`);
      const ph = ((subs ?? []) as Array<{ gid: string; name: string; completed?: boolean }>).find((s) => /photo/i.test(s.name) && !s.completed) ??
        ((subs ?? []) as Array<{ gid: string; name: string }>).find((s) => /photo/i.test(s.name));
      if (!ph) return j(headers, 404, { error: "no_photo_subtask", message: "No photo subtask found under the Lease Up task; flag it manually." });
      const newName = /^NEED PHOTO/i.test(ph.name) ? ph.name : ("NEED PHOTO | " + ph.name).slice(0, 250);
      await asana("PUT", `/tasks/${ph.gid}`, { name: newName, due_on: dueOn, assignee: "courtney@sagareus.com", completed: false });
      await asana("POST", `/tasks/${ph.gid}/stories`, {
        text: `Photo review FAILED on the PreListing Workbench: current photos do not meet the listing standard. Re-shoot needed, due same day as move out (${dueOn}). Done by Claude on behalf of the listing agent (via /wt PreListing Workbench).`,
      }).catch(() => null);
      return j(headers, 200, { ok: true, subtaskGid: ph.gid, name: newName, dueOn, url: `https://app.asana.com/0/0/${ph.gid}` });
    }

    // ---------- plPhotoPass: photo review passed -> close the schedule-photo decision ----------
    // Photos that meet the standard answer "Decide | Schedule photo? (y/n)" with a no,
    // so the subtask completes (Brittany 2026-08-25). undo:true reopens it, for the case
    // where the reviewer flips the verdict to a fail afterwards.
    if (action === "plPhotoPass") {
      const addressP = String(body.address ?? "").trim();
      if (!addressP && !body.unitId) return j(headers, 400, { error: "missing_address" });
      let luHitP: { gid: string } | null = await luByUnitId(String(body.unitId ?? "").trim());
      if (!luHitP) luHitP = matchUnit(await allVacancies(true), addressP).hit ?? null;
      if (!luHitP) return j(headers, 404, { error: "lu_not_found", message: "No Lease Up task matches this unit, so the photo decision could not be closed." });
      const undoP = body.undo === true;
      const subsP = ((await asana("GET", `/tasks/${luHitP.gid}/subtasks?limit=100&opt_fields=name,completed`)) ?? []) as Array<{ gid: string; name: string; completed?: boolean }>;
      // the decision subtask specifically, not any subtask with "photo" in the name
      const dec = subsP.find((s) => /^decide\s*\|/i.test(s.name) && /schedule\s*photo/i.test(s.name)) ??
        subsP.find((s) => /schedule\s*photo/i.test(s.name));
      if (!dec) return j(headers, 404, { error: "no_photo_decision", message: "No 'Decide | Schedule photo?' subtask under the Lease Up task; close it manually." });
      if (Boolean(dec.completed) === !undoP) {
        return j(headers, 200, { ok: true, gid: dec.gid, name: dec.name, alreadySet: true, url: `https://app.asana.com/0/0/${dec.gid}` });
      }
      await asana("PUT", `/tasks/${dec.gid}`, { completed: !undoP });
      await asana("POST", `/tasks/${dec.gid}/stories`, {
        text: undoP
          ? "Reopened: the photo review verdict on the PreListing Workbench changed to a fail, so a shoot needs scheduling after all. Done by Claude on behalf of the listing agent."
          : "Photo review PASSED on the PreListing Workbench: the current Buildium photos meet the listing standard, so no shoot needs scheduling. Done by Claude on behalf of the listing agent.",
      }).catch(() => null);
      return j(headers, 200, { ok: true, gid: dec.gid, name: dec.name, completed: !undoP, url: `https://app.asana.com/0/0/${dec.gid}` });
    }

    // ---------- plHeatConfirm: Heating Type blank in settings -> confirm-at-move-out subtask ----------
    if (action === "plHeatConfirm") {
      const address = String(body.address ?? "").trim();
      if (!address && !body.unitId) return j(headers, 400, { error: "missing_address" });
      let luHit: { gid: string } | null = await luByUnitId(String(body.unitId ?? "").trim());
      if (!luHit) luHit = matchUnit(await allVacancies(true), address).hit ?? null;
      if (!luHit) return j(headers, 404, { error: "lu_not_found", message: "No Lease Up task matches this unit; create the confirm task manually." });
      const luGid = luHit.gid;
      const name = `Confirm Heating Type At Move Out | ${address}`.slice(0, 250);
      const subs = await asana("GET", `/tasks/${luGid}/subtasks?limit=100&opt_fields=name,completed`);
      const existing = ((subs ?? []) as Array<{ gid: string; name: string }>).find((s) => /^confirm heating type/i.test(s.name));
      if (existing) return j(headers, 200, { ok: true, gid: existing.gid, existed: true, url: `https://app.asana.com/0/0/${existing.gid}` });
      const settingsGid = String(body.settingsGid ?? "").replace(/\D/g, "");
      const sub = await asana("POST", `/tasks/${luGid}/subtasks`, {
        name,
        notes: "Heating Type is blank in Unit Settings. Confirm the heating type during the move out inspection, then update the Heating Type field on the Settings task so future listings auto-fill." +
          (settingsGid ? `\n\nSettings task: https://app.asana.com/0/0/${settingsGid}` : "") +
          "\n\nCreated from the PreListing Workbench. Done by Claude on behalf of the listing agent.",
      });
      return j(headers, 200, { ok: true, gid: sub.gid, existed: false, url: `https://app.asana.com/0/0/${sub.gid}` });
    }

    // ---------- unitPhotos: Buildium unit/property images for the PreListing photo review ----------
    if (action === "unitPhotos") {
      if (!BUILDIUM_ID || !BUILDIUM_SECRET) return j(headers, 500, { error: "buildium_not_configured" });
      const uid = String(body.unitId ?? "").trim();
      if (!/^\d+$/.test(uid)) return j(headers, 400, { error: "bad_unit_id" });
      const BH = { "x-buildium-client-id": BUILDIUM_ID, "x-buildium-client-secret": BUILDIUM_SECRET, "Content-Type": "application/json" };
      const grab = async (base: string) => {
        const lr = await fetch(`${base}?limit=50`, { headers: BH });
        if (!lr.ok) return [];
        const list = await lr.json().catch(() => []);
        if (!Array.isArray(list) || !list.length) return [];
        // Buildium image download endpoints vary between singular/plural; try both.
        // One downloadrequest per image, in batches of 10: 40 photos resolve in a
        // few round trips instead of 40 sequential ones (Brittany 2026-09-10)
        const want = list.slice(0, 40);
        const photos: { id: number; name: string; url: string }[] = [];
        const one = async (img: { Id: number; Description?: string }) => {
          let dr = await fetch(`${base}/${img.Id}/downloadrequest`, { method: "POST", headers: BH, body: "{}" });
          if (dr.status === 404 || dr.status === 405) {
            dr = await fetch(`${base}/${img.Id}/downloadrequests`, { method: "POST", headers: BH, body: "{}" });
          }
          if (!dr.ok) return null;
          const d = await dr.json().catch(() => ({}));
          const url = String(d.DownloadUrl ?? d.Url ?? d.ResultUrl ?? "");
          return url ? { id: img.Id, name: String(img.Description ?? ""), url } : null;
        };
        for (let i = 0; i < want.length; i += 10) {
          const got = await Promise.all(want.slice(i, i + 10).map(one));
          for (const p of got) if (p) photos.push(p);
        }
        return photos;
      };
      let photos = await grab(`https://api.buildium.com/v1/rentals/units/${encodeURIComponent(uid)}/images`);
      let source = "unit";
      if (!photos.length) {
        const ru = await fetch(`https://api.buildium.com/v1/rentals/units/${encodeURIComponent(uid)}`, { headers: BH });
        if (ru.ok) {
          const u = await ru.json().catch(() => ({}));
          if (u.PropertyId) {
            photos = await grab(`https://api.buildium.com/v1/rentals/${encodeURIComponent(String(u.PropertyId))}/images`);
            source = "property";
          }
        }
      }
      return j(headers, 200, { ok: true, photos, source, count: photos.length });
    }

    // ---------- moVideoUrl: signed upload for the move-out walkthrough video ----------
    // The widget PUTs the raw file straight to storage (videos are too big for JSON).
    // ---------- moReportUrl: signed upload for a Move Out report PDF added by hand ----------
    // (Courtney's dispatch feedback 2026-10-01: the inspection had not synced from
    // Buildium and there was no way to attach it). Same public inspections bucket
    // as the synced copies; PDFs only.
    if (action === "moReportUrl") {
      const supaUrlR = Deno.env.get("SUPABASE_URL") ?? "";
      const supaKeyR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      if (!supaUrlR || !supaKeyR) return j(headers, 500, { error: "storage_not_configured" });
      let fnR = String(body.filename ?? "move-out-report.pdf").replace(/[^\w.\-]/g, "_").slice(0, 80);
      if (!/\.pdf$/i.test(fnR)) fnR += ".pdf";
      const keyR = `mo-reports/${crypto.randomUUID()}/${fnR}`;
      const shR = { "Authorization": `Bearer ${supaKeyR}`, "apikey": supaKeyR };
      await fetch(`${supaUrlR}/storage/v1/bucket`, {
        method: "POST", headers: { ...shR, "Content-Type": "application/json" },
        body: JSON.stringify({ id: "inspections", name: "inspections", public: true }),
      }).catch(() => null);
      const rR = await fetch(`${supaUrlR}/storage/v1/object/upload/sign/inspections/${keyR}`, {
        method: "POST", headers: { ...shR, "Content-Type": "application/json" }, body: "{}",
      });
      const jR = await rR.json().catch(() => ({}));
      if (!rR.ok || !jR.url) return j(headers, 502, { error: "sign_failed", message: "Could not prepare the upload. Try again." });
      return j(headers, 200, { ok: true, uploadUrl: `${supaUrlR}/storage/v1${jR.url}`, publicUrl: `${supaUrlR}/storage/v1/object/public/inspections/${keyR}` });
    }

    if (action === "moVideoUrl") {
      const supaUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const supaKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      if (!supaUrl || !supaKey) return j(headers, 500, { error: "storage_not_configured" });
      const filename = String(body.filename ?? "moveout-video.mp4").replace(/[^\w.\-]/g, "_").slice(0, 80);
      const key = `mo-videos/${crypto.randomUUID()}/${filename}`;
      const sh = { "Authorization": `Bearer ${supaKey}`, "apikey": supaKey };
      await fetch(`${supaUrl}/storage/v1/bucket`, {
        method: "POST", headers: { ...sh, "Content-Type": "application/json" },
        body: JSON.stringify({ id: "inspections", name: "inspections", public: true }),
      }).catch(() => null);
      const r = await fetch(`${supaUrl}/storage/v1/object/upload/sign/inspections/${key}`, {
        method: "POST", headers: { ...sh, "Content-Type": "application/json" }, body: "{}",
      });
      const jr = await r.json().catch(() => ({}));
      if (!r.ok || !jr.url) return j(headers, 502, { error: "sign_failed", message: "Could not prepare the video upload. Paste a Drive link instead." });
      return j(headers, 200, {
        ok: true,
        uploadUrl: `${supaUrl}/storage/v1${jr.url}`,
        publicUrl: `${supaUrl}/storage/v1/object/public/inspections/${key}`,
      });
    }

    // ---------- prSettings: Unit Settings values for the Prepare verify rows ----------
    if (action === "prSettings") {
      const address = String(body.address ?? "").trim();
      if (!address) return j(headers, 400, { error: "missing_fields" });
      const ms = await matchSettings(address);
      if (!ms.hit) return j(headers, 200, { ok: true, found: false, us: {} });
      const st = await asana("GET", `/tasks/${ms.hit.gid}?opt_fields=parent.gid,custom_fields.gid,custom_fields.name,custom_fields.display_value`);
      const cf = (st.custom_fields ?? []) as Array<{ gid: string; name: string; display_value: string | null }>;
      const g = (re: RegExp) => String(cf.find((f) => re.test(f.name))?.display_value ?? "").trim();
      // Parking Type / Storage Type sit on the property task: a multifamily unit
      // subtask reads them off its parent
      let cfP = cf;
      if (st.parent?.gid && !g(/^parking type$/i) && !g(/^storage type$/i)) {
        try { cfP = ((await asana("GET", `/tasks/${st.parent.gid}?opt_fields=custom_fields.name,custom_fields.display_value`)).custom_fields ?? []) as typeof cf; } catch { /* unit only */ }
      }
      const gp = (re: RegExp) => String(cfP.find((f) => re.test(f.name))?.display_value ?? "").trim();
      const spots = await leaseSpots(String(cf.find((f) => f.gid === "1213183515622826")?.display_value ?? "").trim());
      const us = {
        mailbox: g(/^mailbox\s*(number|#)/i) || g(/^mailbox/i),
        parking: parkStorLine(gp(/^parking type$/i), spots.parking, "Spot"),
        cooling: g(/^cooling$/i),
        storage: parkStorLine(gp(/^storage type$/i), spots.storage, "Storage"),
        ev: g(/^ev charger$/i),
        heat: g(/^heating type$/i),
        internet: g(/^internet provider$/i),
      };
      return j(headers, 200, { ok: true, found: true, us });
    }

    // ---------- prSubmit: Turn Over Prep (Prepare) submission ----------
    // Pre-move-out visit while the tenant is present. Report posts on the picked
    // Turn Over task; keybox code writes to Unit Settings; details answered No or
    // Unsure spawn ONE "Detail Verification Needed" subtask (unassigned during the
    // build/test stage -- later: portia@sagareus.com), due same day.
    if (action === "prSubmit") {
      const taskGid = String(body.taskGid ?? "");
      const address = String(body.address ?? "").trim();
      if (!taskGid || !address) return j(headers, 400, { error: "missing_fields" });
      const kb = body.keybox ?? {};
      const keyboxCode = String((kb as Record<string, unknown>).code ?? "").slice(0, 40);
      const yard = (body.yard ?? {}) as Record<string, unknown>;
      const yardGrade = String(yard.grade ?? "").slice(0, 2);
      const yardNote = String(yard.note ?? "").trim().slice(0, 400);
      const walkThru = body.walkThru === true;
      type PrVerify = { answer: string; value: string };
      const verify: Record<string, PrVerify> = {};
      const rawVerify = (body.verify ?? {}) as Record<string, Record<string, unknown>>;
      for (const k of ["mailbox", "parking", "cooling", "storage", "ev", "heat", "internet"]) {
        const v = rawVerify[k];
        if (!v) continue;
        const answer = String(v.answer ?? "").toLowerCase().slice(0, 8);
        if (!/^(yes|no|unsure)$/.test(answer)) continue;
        verify[k] = { answer, value: String(v.value ?? "").slice(0, 200) };
      }
      const items = (Array.isArray(body.items) ? body.items : []).slice(0, 40).map((x: unknown) => String(x).slice(0, 60)).filter(Boolean);
      const note = String(body.note ?? "").slice(0, 2000);
      const inspector = String(body.inspector ?? "").trim().slice(0, 80);
      const todayStr = new Date(Date.now() - 7 * 3600 * 1000).toISOString().slice(0, 10);
      const VLABEL: Record<string, string> = { mailbox: "Mailbox #", parking: "Parking", cooling: "Cooling", storage: "Storage", ev: "EV Charger", heat: "Heat", internet: "Internet Provider" };

      const tuGid = taskGid;
      // owner email off the LU sibling (same lookup as Propose)
      let ownerEmail = "";
      try {
        const picked = await asana("GET", `/tasks/${taskGid}?opt_fields=parent.gid`);
        const parentGid = picked?.parent?.gid;
        if (parentGid) {
          const subs = await asana("GET", `/tasks/${parentGid}/subtasks?limit=100&opt_fields=name`);
          const luTask = (subs ?? []).find((t: { name: string }) => /^(lu|tp|pre.?lease)\s*\|/i.test(t.name));
          if (luTask) {
            const lu = await asana("GET", `/tasks/${luTask.gid}?opt_fields=custom_fields.name,custom_fields.display_value`);
            ownerEmail = ownerFromCf((lu.custom_fields ?? []) as Array<{ name?: string; display_value?: string | null }>).email;
          }
        }
      } catch { /* fail-soft */ }

      // Flat report in the Site Visit style
      const cap = (s2: string) => s2.charAt(0).toUpperCase() + s2.slice(1);
      const lines: string[] = [`TURN OVER PREP -- ${todayStr} -- ${address}`, ""];
      if (inspector) lines.splice(1, 0, `Inspected by: ${inspector}`);
      // keybox CODE never prints in the report: Unit Settings + access emails only
      if (keyboxCode) { lines.push("Keybox code updated in Unit Settings."); lines.push(""); }
      lines.push(`EXTERIOR: ${yardGrade || "not graded"}${yardNote ? " -- " + yardNote : ""}`);
      lines.push("");
      lines.push("DETAILS VERIFIED");
      for (const k of ["mailbox", "parking", "cooling"]) {
        if (verify[k]) lines.push(`${VLABEL[k]}: ${cap(verify[k].answer)}${verify[k].value ? ` -- on file: ${verify[k].value}` : ""}`);
      }
      if (walkThru) {
        for (const k of ["storage", "ev", "heat", "internet"]) {
          if (verify[k]) lines.push(`${VLABEL[k]}: ${cap(verify[k].answer)}${verify[k].value ? ` -- on file: ${verify[k].value}` : ""}`);
        }
      } else {
        lines.push("PreMove walk thru: not conducted.");
      }
      lines.push("");
      lines.push(`TURN OVER ESTIMATE ITEMS (${items.length})`);
      items.forEach((it: string) => lines.push(`- ${it}`));
      if (!items.length) lines.push("None flagged.");
      if (note) { lines.push(""); lines.push("Notes:"); lines.push(note); }
      const story = await postStory(tuGid, lines.join("\n").slice(0, 60000));

      // keybox code -> Unit Settings (same rule as Propose)
      let keyboxSaved = false;
      if (keyboxCode) {
        try {
          const ms = await matchSettings(address);
          if (ms.hit) {
            await asana("PUT", `/tasks/${ms.hit.gid}`, { custom_fields: { "1217495572560475": keyboxCode } });
            keyboxSaved = true;
          }
        } catch { /* fail-soft */ }
      }

      // Detail Verification Needed subtask for every No / Unsure answer
      let verifyTaskGid: string | null = null;
      const flagged = Object.keys(verify).filter((k) => verify[k].answer !== "yes");
      if (flagged.length) {
        try {
          const vt = await asana("POST", `/tasks/${tuGid}/subtasks`, {
            name: `Detail Verification Needed | ${address}`,
            due_on: todayStr,
            // assignee: "portia@sagareus.com" -- intentionally unassigned during the build/test stage (Brittany 2026-08-14)
            notes: "From the Turn Over Prep inspection: verify these details at the property, then update Unit Settings and Buildium.\n\n" +
              flagged.map((k) => `${VLABEL[k]}: agent answered ${cap(verify[k].answer)}${verify[k].value ? ` (Unit Settings: "${verify[k].value}")` : " (Unit Settings: blank)"}`).join("\n") +
              `\n\nDone by Claude on behalf of ${inspector || "the inspector"}.`,
          });
          verifyTaskGid = vt?.gid ?? null;
        } catch { /* fail-soft */ }
      }

      return j(headers, 200, {
        ok: true,
        conductGid: tuGid,
        conductUrl: `https://app.asana.com/0/0/${tuGid}`,
        storyGid: story?.gid ?? null,
        ownerEmail,
        tuGid,
        keyboxSaved,
        verifyTaskGid,
        flaggedCount: flagged.length,
        reportDate: todayStr,
      });
    }

    // ---------- moUpdate: real-time pushes DURING the move out inspection ----------
    // The keybox code and walkthrough video are the two things that must never wait
    // for submit (Brittany 2026-08-14): the code writes to the Unit Settings Keybox
    // Code field the moment it is typed, the video posts to the Conduct subtask the
    // moment the upload finishes. moSubmit re-writes both later; all idempotent.
    // ---------- moVendorTo: vendor-email recipients for the dispatch send ----------
    // Resolves who the vendor work-order email goes to (Brittany 2026-09-22):
    // the Turn Over task's Turn Over Vendor enum matched against Buildium vendors
    // (the foundation - vendor emails are thin today) PLUS the Turn Over
    // Coordinator (the TO assignee). No vendor email on file = coordinator only,
    // who forwards. No coordinator either = nothing to send (Asana comment stands).
    if (action === "moVendorTo") {
      const tgV = String(body.taskGid ?? "");
      if (!tgV) return j(headers, 400, { error: "missing_task" });
      let coordEmail = "", coordName = "", vendorName = "", vendorEmail = "";
      try {
        const toT = await asana("GET", `/tasks/${tgV}?opt_fields=assignee.gid,assignee.name,custom_fields.gid,custom_fields.display_value`);
        // the assignment comes through the "Turn Over Vendor" field 1205841857463978
        // (Brittany 2026-09-24, replacing the "Vendor" enum as primary); the
        // "Vendor" enum stays as the fallback when Turn Over Vendor is blank
        const cfV = (toT.custom_fields ?? []) as Array<{ gid: string; display_value: string | null }>;
        vendorName = String(cfV.find((f) => f.gid === "1205841857463978")?.display_value ?? "").trim() ||
                     String(cfV.find((f) => f.gid === "1205263939685412")?.display_value ?? "").trim();
        if (toT?.assignee?.gid) {
          const uV = await asana("GET", `/users/${toT.assignee.gid}?opt_fields=email,name`).catch(() => null);
          const emV = String(uV?.email ?? "").toLowerCase();
          if (/@sagareus\.com$/.test(emV)) { coordEmail = emV; coordName = String(uV?.name ?? toT.assignee.name ?? ""); }
        }
      } catch { /* resolved fields stay blank */ }
      const normV = (n: string) => n.toLowerCase().replace(/\([^)]*\)/g, "").replace(/[^a-z0-9]/g, "");
      const skipV = /^(need schedule|not needed|owner)$/i.test(vendorName);
      if (vendorName && !skipV && BUILDIUM_ID && BUILDIUM_SECRET) {
        try {
          if (!moVendorCache || Date.now() - moVendorCache.at > 10 * 60 * 1000) {
            const vsAll: Array<{ name: string; email: string }> = [];
            const bhV = { "x-buildium-client-id": BUILDIUM_ID, "x-buildium-client-secret": BUILDIUM_SECRET };
            for (let pg = 0; pg < 5; pg++) {
              const rV = await fetch(`https://api.buildium.com/v1/vendors?limit=100&offset=${pg * 100}`, { headers: bhV });
              if (!rV.ok) break;
              const jV = await rV.json().catch(() => []);
              const arrV = Array.isArray(jV) ? jV : [];
              for (const v of arrV as Array<Record<string, unknown>>) {
                const nm = String(v.CompanyName ?? "").trim() || `${String(v.FirstName ?? "")} ${String(v.LastName ?? "")}`.trim();
                const em = String(v.Email ?? v.PrimaryEmail ?? "").trim().toLowerCase();
                if (nm) vsAll.push({ name: nm, email: /@/.test(em) ? em : "" });
              }
              if (arrV.length < 100) break;
            }
            moVendorCache = { at: Date.now(), vendors: vsAll };
          }
          const want = normV(vendorName);
          if (want.length >= 4) {
            const hitsV = moVendorCache.vendors.filter((v) => {
              const got = normV(v.name);
              return got.length >= 4 && (got === want || got.indexOf(want) === 0 || want.indexOf(got) === 0);
            }).filter((v) => v.email);
            if (hitsV.length === 1) vendorEmail = hitsV[0].email;
          }
        } catch { /* vendor email stays blank; coordinator carries it */ }
      }
      const toV = [vendorEmail, coordEmail].filter(Boolean).join(", ");
      return j(headers, 200, {
        ok: true, to: toV, coordEmail, coordName, vendorName, vendorEmail,
        vendorMatched: !!vendorEmail,
        reason: toV ? "" : (coordEmail ? "" : "no_coordinator"),
      });
    }

    // ---------- moFeedback: team feedback from the Turn Over Dispatch widget ----------
    // Lands as a comment on the Turn Over Dispatch subtask of Team Tools | Bugs &
    // Feature Requests (Improvements project); find-or-create by name so a
    // reshuffle never loses feedback (Brittany 2026-09-21).
    if (action === "moFeedback") {
      const fbText = String(body.text ?? "").trim().slice(0, 4000);
      const fbFrom = String(body.sender ?? "").trim().slice(0, 160);
      if (!fbText) return j(headers, 400, { error: "missing_text" });
      const FB_PARENT = "1216868072846283"; // Team Tools | Bugs & Feature Requests
      try {
        const fbSubs = ((await asana("GET", `/tasks/${FB_PARENT}/subtasks?limit=100&opt_fields=name`)) ?? []) as Array<{ gid: string; name: string }>;
        let fbTask = fbSubs.find((t) => /turn\s*over\s*dispatch/i.test(t.name)) ?? null;
        if (!fbTask) {
          fbTask = await asana("POST", `/tasks/${FB_PARENT}/subtasks`, {
            name: "Turn Over Dispatch",
            notes: "Bugs and feature requests for the Turn Over Dispatch field tool on /field.",
          });
        }
        // each feedback item is its own subtask to work through, not a comment
        // (Brittany 2026-10-01); the first line names it, the full text + sender
        // live in the description
        const fbLine = fbText.split("\n")[0].trim().slice(0, 120) || "Feedback";
        await asana("POST", `/tasks/${fbTask!.gid}/subtasks`, {
          name: fbLine,
          notes: fbText + "\n\n- " + (fbFrom || "unnamed") + ", via the Turn Over Dispatch feedback button",
        });
        return j(headers, 200, { ok: true });
      } catch {
        return j(headers, 200, { ok: false, error: "feedback_failed" });
      }
    }

    // ---------- moUsers: Asana workspace users for the Inspector Name dropdown ----------
    // Always in sync with Asana (Brittany 2026-09-19); @sagareus.com humans only.
    if (action === "moUsers") {
      if (moUsersCache && Date.now() - moUsersCache.at < 10 * 60 * 1000) return j(headers, 200, { ok: true, users: moUsersCache.users });
      const usersU: Array<{ name: string; email: string }> = [];
      let offU = "";
      for (let pg = 0; pg < 3; pg++) {
        const rU = await fetch(`${ASANA}/workspaces/${WORKSPACE}/users?limit=100&opt_fields=name,email${offU ? `&offset=${encodeURIComponent(offU)}` : ""}`,
          { headers: { "Authorization": `Bearer ${ASANA_PAT}` } });
        const jU = await rU.json().catch(() => ({}));
        if (!rU.ok) break;
        for (const u of (jU.data ?? []) as Array<{ name: string; email?: string }>) {
          const em = String(u.email ?? "").toLowerCase();
          if (!/@sagareus\.com$/.test(em)) continue;
          if (/bot|asana/i.test(String(u.name)) || /^asana_bot@/.test(em)) continue;
          usersU.push({ name: String(u.name).slice(0, 80), email: em });
        }
        offU = jU.next_page?.offset ?? "";
        if (!offU) break;
      }
      usersU.sort((a, b) => a.name.localeCompare(b.name));
      moUsersCache = { at: Date.now(), users: usersU };
      return j(headers, 200, { ok: true, users: usersU });
    }

    // ---------- moDraft: create a Gmail draft in the INSPECTOR's own mailbox ----------
    // Service account with domain-wide delegation, scope gmail.compose (drafts only,
    // can never send; Brittany 2026-09-16: drafts land in the inspector's mailbox).
    // Secret GMAIL_SA_JSON = the service-account key JSON. Absent secret = the
    // widget falls back to the mailto flow.
    if (action === "moDraft") {
      const saRaw = Deno.env.get("GMAIL_SA_JSON") ?? "";
      if (!saRaw) return j(headers, 200, { ok: false, error: "gmail_unconfigured" });
      const userEmail = String(body.userEmail ?? "").trim().toLowerCase();
      const toAddr = String(body.to ?? "").trim().slice(0, 300);
      const subject = String(body.subject ?? "").trim().slice(0, 250);
      const textBody = String(body.textBody ?? "").slice(0, 40000);
      const htmlBody = String(body.htmlBody ?? "").slice(0, 80000);
      const fromAddr = String(body.from ?? "").trim().toLowerCase();
      // cc defaults to listings@ (every leasing flow wants the archive copy);
      // pass cc:"" to send with none (bizdev proposal, person to person)
      const ccAddr = body.cc === undefined ? "listings@sagareus.com" : String(body.cc).trim().slice(0, 300);
      // bcc: only HubSpot's logging address or our own domain (2026-10-23: proposals BCC
      // HubSpot so API-sent mail still lands on the deal timeline)
      const bccAddr = String(body.bcc ?? "").trim().toLowerCase().slice(0, 200);
      if (bccAddr && !/^[^@\s]+@(bcc\.(na\d\.)?hubspot\.com|sagareus\.com)$/.test(bccAddr)) return j(headers, 400, { error: "bad_bcc" });
      if (!/^[^@\s]+@sagareus\.com$/.test(userEmail)) return j(headers, 400, { error: "bad_user" });
      if (fromAddr && !/^[^@\s]+@sagareus\.com$/.test(fromAddr)) return j(headers, 400, { error: "bad_from" });
      if (!subject || !textBody) return j(headers, 400, { error: "missing_fields" });
      try {
        const sa = JSON.parse(saRaw) as { client_email: string; private_key: string };
        // JWT -> access token impersonating the inspector
        const b64u = (bytes: Uint8Array) => {
          let bin = "";
          for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        };
        const enc = (o: unknown) => b64u(new TextEncoder().encode(JSON.stringify(o)));
        const now = Math.floor(Date.now() / 1000);
        const unsigned = enc({ alg: "RS256", typ: "JWT" }) + "." + enc({
          iss: sa.client_email, sub: userEmail,
          scope: "https://www.googleapis.com/auth/gmail.compose",
          aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 300,
        });
        const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
        const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
        const keyObj = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
        const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keyObj, new TextEncoder().encode(unsigned)));
        const tokRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${unsigned + "." + b64u(sig)}`,
        });
        const tok = await tokRes.json().catch(() => ({}));
        if (!tokRes.ok || !tok.access_token) {
          return j(headers, 200, { ok: false, error: "gmail_auth_failed", detail: String(tok.error_description ?? tok.error ?? tokRes.status).slice(0, 200) });
        }
        // multipart/alternative MIME, each part base64 so unicode is safe
        const b64mime = (t: string) => {
          const bytes = new TextEncoder().encode(t);
          let bin = "";
          for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          return btoa(bin);
        };
        const subj = /^[\x20-\x7e]*$/.test(subject) ? subject : `=?UTF-8?B?${b64mime(subject)}?=`;
        const bnd = "sagab" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
        // optional jpeg attachments (Move Out Delayed photos, Brittany 2026-11-05):
        // the text/html alternative nests inside multipart/mixed, max 10, ~20 MB total
        const attsIn = (Array.isArray(body.attachments) ? body.attachments : []).slice(0, 10) as Array<{ filename?: string; dataB64?: string }>;
        const atts = attsIn
          .map((x, i) => ({ name: String(x.filename ?? `photo-${i + 1}.jpg`).replace(/[^\w.\-]/g, "_").slice(0, 100), data: String(x.dataB64 ?? "").replace(/[^A-Za-z0-9+/=]/g, "") }))
          .filter((x) => x.data);
        if (atts.reduce((n, x) => n + x.data.length, 0) > 20_000_000) return j(headers, 400, { error: "attachments_too_large" });
        const mixB = "sagam" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
        const mime = [
          // From: a send-as alias of the impersonated user (the weekly reports go
          // out as listings@; every agent has the alias configured). Gmail silently
          // falls back to the user's own address when the alias is missing.
          ...(fromAddr ? [`From: ${fromAddr}`] : []),
          `To: ${toAddr}`,
          ...(ccAddr ? [`Cc: ${ccAddr}`] : []),
          ...(bccAddr ? [`Bcc: ${bccAddr}`] : []),
          `Subject: ${subj}`,
          "MIME-Version: 1.0",
          ...(atts.length ? [`Content-Type: multipart/mixed; boundary="${mixB}"`, "", `--${mixB}`] : []),
          `Content-Type: multipart/alternative; boundary="${bnd}"`,
          "",
          `--${bnd}`,
          "Content-Type: text/plain; charset=UTF-8",
          "Content-Transfer-Encoding: base64",
          "",
          b64mime(textBody),
          `--${bnd}`,
          "Content-Type: text/html; charset=UTF-8",
          "Content-Transfer-Encoding: base64",
          "",
          b64mime(htmlBody || `<pre>${textBody.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>`),
          `--${bnd}--`,
          ...atts.flatMap((x) => [
            `--${mixB}`,
            `Content-Type: image/jpeg; name="${x.name}"`,
            `Content-Disposition: attachment; filename="${x.name}"`,
            "Content-Transfer-Encoding: base64",
            "",
            x.data.replace(/.{76}/g, "$&\r\n"),
          ]),
          ...(atts.length ? [`--${mixB}--`] : []),
          "",
        ].join("\r\n");
        // send:true = send immediately from the inspector (Brittany 2026-09-19: the
        // tool preview IS the human review; staff forget a second button). Same
        // scope covers both. Otherwise a draft is created as before.
        const doSend = body.send === true;
        const rawMsg = atts.length ? "" : b64u(new TextEncoder().encode(mime));
        // with attachments the message goes up as raw RFC 822 on the upload endpoint
        // (the JSON raw field is size-capped); text-only mail keeps the JSON path
        const gRes = atts.length
          ? await fetch(`https://gmail.googleapis.com/upload/gmail/v1/users/me/${doSend ? "messages/send" : "drafts"}?uploadType=media`, {
            method: "POST", headers: { "Authorization": `Bearer ${tok.access_token}`, "Content-Type": "message/rfc822" },
            body: mime,
          })
          : await fetch(doSend
            ? "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
            : "https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
            method: "POST", headers: { "Authorization": `Bearer ${tok.access_token}`, "Content-Type": "application/json" },
            body: JSON.stringify(doSend ? { raw: rawMsg } : { message: { raw: rawMsg } }),
          });
        const dj = await gRes.json().catch(() => ({}));
        if (!gRes.ok) return j(headers, 200, { ok: false, error: doSend ? "gmail_send_failed" : "gmail_draft_failed", detail: String(dj?.error?.message ?? gRes.status).slice(0, 200) });
        return j(headers, 200, {
          ok: true,
          sent: doSend,
          draftId: doSend ? "" : String(dj.id ?? ""),
          gmailUrl: `https://mail.google.com/mail/?authuser=${encodeURIComponent(userEmail)}${doSend ? "#sent" : "#drafts"}`,
        });
      } catch (e) {
        return j(headers, 200, { ok: false, error: "gmail_error", detail: String((e as Error)?.message ?? e).slice(0, 200) });
      }
    }

    // ---------- moManaged: is this unit's turn over Owner Managed? ----------
    // The flag lives in the Plan bench's compsData JSON on the Listing Settings
    // task, keyed by Unit ID (no Asana field; Brittany 2026-09-15/22). The
    // Leasing Team Lead rides along because Owner Managed hands the turn over
    // coordination to them.
    if (action === "moManaged") {
      const uidM = String(body.unitId ?? "").replace(/\D/g, "");
      if (!uidM) return j(headers, 400, { error: "missing_unit" });
      try {
        const shM = ((await asana("GET", `/workspaces/${WORKSPACE}/tasks/search?projects.any=1217446710785429&custom_fields.1213183515622826.value=${uidM}&opt_fields=name`)) ?? []) as Array<{ gid: string }>;
        const lsM = shM[0]?.gid ?? "";
        if (!lsM) return j(headers, 200, { ok: true, ownerManaged: false, leadGid: "", leadName: "" });
        const lsT = await asana("GET", `/tasks/${lsM}?opt_fields=custom_fields.gid,custom_fields.display_value,custom_fields.people_value.gid,custom_fields.people_value.name`);
        const cfM = (lsT.custom_fields ?? []) as Array<{ gid: string; display_value?: string | null; people_value?: Array<{ gid: string; name: string }> }>;
        let omM = false;
        try {
          const cdM = JSON.parse(String(cfM.find((f) => f.gid === "1217516812648029")?.display_value ?? "") || "{}");
          omM = cdM?.turnManaged === "owner";
        } catch { /* unparseable plan JSON = not owner-managed */ }
        const leadM = cfM.find((f) => f.gid === "1217446711292696")?.people_value?.[0];
        return j(headers, 200, { ok: true, ownerManaged: omM, leadGid: leadM?.gid ?? "", leadName: leadM?.name ?? "", lsGid: lsM });
      } catch {
        return j(headers, 200, { ok: false, ownerManaged: false });
      }
    }

    // ---------- moKb: current [Onsite] Key Box value from the Leasing parent ----------
    // Prefills the dispatch tool's keybox input so staff see the code on file and
    // update it when they change the physical code (Brittany 2026-09-15).
    if (action === "moKb") {
      const tgK = String(body.taskGid ?? "");
      if (!tgK) return j(headers, 400, { error: "missing_task" });
      try {
        const pkK = await asana("GET", `/tasks/${tgK}?opt_fields=parent.gid`) as { parent?: { gid: string } | null };
        const pgK = pkK?.parent?.gid;
        if (!pgK) return j(headers, 200, { ok: true, code: "" });
        const ptK = await asana("GET", `/tasks/${pgK}?opt_fields=custom_fields.gid,custom_fields.display_value`);
        const fK = ((ptK.custom_fields ?? []) as Array<{ gid: string; display_value: string | null }>).find((x) => x.gid === "1218512667092355");
        // owner name + email from the LU/TP/PreLease sibling, for the email previews.
        // Also the LU's Do Not List value (Vincent ask 1219236873185401, 2026-10-06):
        // when set (Owner Selling / Moving Back In / Self Listing / Others) the owner
        // email must not say a vendor was dispatched. An offboarding LU has no Unit
        // ID, so this is the parent walk, never a Unit ID search. Prefer the open
        // LU sibling, else the newest one (a relisted unit can carry several).
        let ownerNameK = "", ownerEmailK = "", doNotListK = "";
        try {
          const subsK = await asana("GET", `/tasks/${pgK}/subtasks?limit=100&opt_fields=name,completed,created_at`);
          const lusK = ((subsK ?? []) as Array<{ gid: string; name: string; completed?: boolean; created_at?: string }>)
            .filter((t) => /^(lu|tp|pre.?lease)\s*\|/i.test(t.name))
            .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
          const luK = lusK.find((t) => !t.completed) ?? lusK[0];
          if (luK) {
            const luT = await asana("GET", `/tasks/${luK.gid}?opt_fields=custom_fields.gid,custom_fields.name,custom_fields.display_value`);
            const cfK = (luT.custom_fields ?? []) as Array<{ gid: string; name: string; display_value: string | null }>;
            ({ name: ownerNameK, email: ownerEmailK } = ownerFromCf(cfK));
            ownerNameK = ownerNameK.slice(0, 160);
            ownerEmailK = ownerEmailK.slice(0, 200);
            doNotListK = String(cfK.find((f) => f.gid === "1214787859185273")?.display_value ?? "").trim().slice(0, 60);
          }
        } catch { /* previews fall back to the token */ }
        return j(headers, 200, { ok: true, code: String(fK?.display_value ?? "").trim().slice(0, 40), ownerName: ownerNameK, ownerEmail: ownerEmailK, doNotList: doNotListK });
      } catch { return j(headers, 200, { ok: false, code: "" }); }
    }

    // ---------- moFile: the Move Out v2 inspection from Buildium unit files ----------
    // The third-party inspector app syncs its report into Buildium; this pulls the
    // newest unit file whose title contains "Move Out" and re-hosts a copy in storage
    // (Buildium download links expire, so the emails need a stable URL).
    if (action === "moFile") {
      const uidF = String(body.unitId ?? "").replace(/\D/g, "");
      if (!uidF) return j(headers, 400, { error: "missing_unit" });
      if (!BUILDIUM_ID || !BUILDIUM_SECRET) return j(headers, 200, { ok: false, error: "buildium_unconfigured" });
      const BHF = { "x-buildium-client-id": BUILDIUM_ID, "x-buildium-client-secret": BUILDIUM_SECRET };
      const frF = await fetch(`https://api.buildium.com/v1/files?entitytype=RentalUnit&entityid=${uidF}&limit=200`, { headers: BHF });
      if (!frF.ok) return j(headers, 200, { ok: false, error: `buildium_files_${frF.status}` });
      const filesF = await frF.json().catch(() => []);
      const allF = (Array.isArray(filesF) ? filesF : [])
        .map((f: Record<string, unknown>) => ({
          id: f.Id,
          name: String(f.Title ?? f.FileName ?? f.Name ?? ""),
          uploaded: String(f.UploadedDateTime ?? ""),
          ct: String(f.ContentType ?? ""),
        }))
        .sort((a, b) => b.uploaded.localeCompare(a.uploaded));
      // The inspector app syncs the report titled "{address} - {date}"
      // (Brittany 2026-09-15): prefer the newest file starting with the street
      // number and carrying a date; fall back to a *Move Out* title.
      const addrF = String(body.address ?? "").trim();
      const streetNoF = (addrF.match(/^\d+/) ?? [""])[0];
      const dateishF = (n: string) => /\d{1,4}[-\/.]\d{1,2}[-\/.]\d{1,4}/.test(n);
      // dispatch runs right after the inspection, and old files reuse both naming
      // schemes (a 2024 "address - date" file nearly matched on 447916): only files
      // UPLOADED in the last 60 days count
      const freshCut = new Date(Date.now() - 60 * 86400000).toISOString();
      const freshF = allF.filter((f) => f.uploaded && f.uploaded >= freshCut);
      // app-named files ONLY (Brittany 2026-09-15: the fallback was surfacing old
      // manually-uploaded "Move Out ..." inspections in the emails)
      // app titles are "{address} - {date}", so they always LEAD with the street
      // number; without an address to compare, still require a leading digit so
      // "Move Out Inspection - {date}" style titles can never match (2026-09-15:
      // a stale widget build calling without the address resurrected the old file)
      const appNamed = freshF.filter((f) => {
        const nmF = f.name.trim();
        if (!dateishF(nmF)) return false;
        return streetNoF ? nmF.startsWith(streetNoF) : /^\d/.test(nmF);
      });
      // kind "premove" (Plan bench Pull From Buildium, Brittany 2026-10-21): the
      // inspector app names pre-move-out and move-out reports alike, so the
      // pre-move one is the newest report DATED BEFORE the scheduled move out
      const premoveF = String(body.kind ?? "") === "premove";
      const beforeF = String(body.before ?? "").slice(0, 10);
      const titleDate = (n: string) => (n.match(/(\d{4}-\d{2}-\d{2})/) ?? [])[1] ?? "";
      const poolF = premoveF && /^\d{4}-\d{2}-\d{2}$/.test(beforeF)
        ? appNamed.filter((f) => { const td = titleDate(f.name); return !!td && td < beforeF; })
        : appNamed;
      const pickF = poolF[0];
      if (!pickF) return j(headers, 200, { ok: false, error: "not_found", fresh: freshF.slice(0, 8).map((f) => f.name + " (up " + f.uploaded.slice(0, 10) + ")") });
      const dlF = await fetch(`https://api.buildium.com/v1/files/${encodeURIComponent(String(pickF.id))}/downloadrequest`, { method: "POST", headers: BHF });
      const djF = await dlF.json().catch(() => ({} as Record<string, unknown>));
      const tmpF = String((djF as Record<string, unknown>).DownloadUrl ?? (djF as Record<string, unknown>).DownloadURL ?? "");
      if (!dlF.ok || !tmpF) return j(headers, 200, { ok: false, error: "download_request_failed" });
      const fresF = await fetch(tmpF);
      if (!fresF.ok) return j(headers, 200, { ok: false, error: "download_failed" });
      const bufF = new Uint8Array(await fresF.arrayBuffer());
      if (bufF.length > 30_000_000) return j(headers, 200, { ok: false, error: "file_too_large" });
      const supaUrlF = Deno.env.get("SUPABASE_URL") ?? "";
      const supaKeyF = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      if (!supaUrlF || !supaKeyF) return j(headers, 200, { ok: false, error: "storage_unconfigured" });
      const shF = { "Authorization": `Bearer ${supaKeyF}`, "apikey": supaKeyF };
      await fetch(`${supaUrlF}/storage/v1/bucket`, {
        method: "POST", headers: { ...shF, "Content-Type": "application/json" },
        body: JSON.stringify({ id: "inspections", name: "inspections", public: true }),
      }).catch(() => null); // 409 when it exists; fine
      const safeF = pickF.name.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "move-out-v2"; // no spaces: the URL rides plain-text emails
      const extF = /\.[a-z0-9]{2,5}$/i.test(safeF) ? "" : (/pdf/i.test(pickF.ct) ? ".pdf" : "");
      // deterministic path: the URL reads as the filename, the same Buildium file
      // always maps to one stable URL (no per-refresh duplicate copies), and the
      // short hash segment keeps it unguessable (Brittany 2026-09-16)
      const hashInF = new TextEncoder().encode(String(pickF.id) + ":" + uidF);
      const hashF = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", hashInF)))
        .map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
      const keyF = `moveout-v2/${hashF}/${safeF}${extF}`;
      const upF = await fetch(`${supaUrlF}/storage/v1/object/inspections/${keyF}`, {
        method: "POST", headers: { ...shF, "Content-Type": pickF.ct || "application/octet-stream", "x-upsert": "true" }, body: bufF,
      });
      if (!upF.ok) return j(headers, 200, { ok: false, error: "store_failed" });
      return j(headers, 200, {
        ok: true,
        fileUrl: `${supaUrlF}/storage/v1/object/public/inspections/${keyF}`,
        fileName: pickF.name,
        uploaded: pickF.uploaded.slice(0, 10),
      });
    }

    if (action === "moUpdate") {
      const taskGid = String(body.taskGid ?? "");
      const address = String(body.address ?? "").trim();
      const keyboxCode = String(body.keyboxCode ?? "").trim().slice(0, 40);
      const videoLink = String(body.videoLink ?? "").trim().slice(0, 400);
      if (!keyboxCode && !videoLink) return j(headers, 400, { error: "missing_fields" });
      let keyboxSaved = false, videoPosted = false;
      // keybox lives EXCLUSIVELY on the Leasing parent's [Onsite] Key Box field
      // (Brittany 2026-09-15); Unit Settings' key field is being repurposed as the
      // post-move-in storage locker label and is no longer written here.
      if (keyboxCode && taskGid) {
        try {
          const pk = await asana("GET", `/tasks/${taskGid}?opt_fields=parent.gid`) as { parent?: { gid: string } | null };
          const pg = pk?.parent?.gid;
          if (pg) {
            await asana("PUT", `/tasks/${pg}`, { custom_fields: { "1218512667092355": keyboxCode } });
            keyboxSaved = true;
            // a saved code completes the Move-Out subtask "Change | Lockbox code &
            // Update 1Password" (Brittany 2026-09-16); the code itself never posts
            try {
              const sibsL = ((await asana("GET", `/tasks/${pg}/subtasks?limit=100&opt_fields=name`)) ?? []) as Array<{ gid: string; name: string }>;
              const moL = sibsL.find((t) => /^move.?out\s*\|/i.test(t.name));
              if (moL) {
                const mSubL = ((await asana("GET", `/tasks/${moL.gid}/subtasks?limit=100&opt_fields=name,completed`)) ?? []) as Array<{ gid: string; name: string; completed?: boolean }>;
                const chL = mSubL.find((t) => /change\s*\|.*lockbox/i.test(t.name));
                if (chL && !chL.completed) {
                  const todayL = new Date(Date.now() - 7 * 3600 * 1000).toISOString().slice(0, 10);
                  await asana("PUT", `/tasks/${chL.gid}`, { completed: true, due_on: todayL }).catch(() => null);
                }
              }
            } catch { /* fail-soft */ }
          }
        } catch { /* fail-soft: submit re-writes it */ }
      }
      if (videoLink && taskGid) {
        // no Turn Over task comment for the video (Brittany 2026-09-16: the TO
        // task carries only the condition comment + vendor email); the link lands
        // on the Move-Out task's "Record | Move-out video" subtask, which completes
        try {
          const pkV = await asana("GET", `/tasks/${taskGid}?opt_fields=parent.gid`) as { parent?: { gid: string } | null };
          const pgV = pkV?.parent?.gid;
          if (pgV) {
            const sibsV = ((await asana("GET", `/tasks/${pgV}/subtasks?limit=100&opt_fields=name`)) ?? []) as Array<{ gid: string; name: string }>;
            const moV = sibsV.find((t) => /^move.?out\s*\|/i.test(t.name));
            if (moV) {
              const mSubV = ((await asana("GET", `/tasks/${moV.gid}/subtasks?limit=100&opt_fields=name`)) ?? []) as Array<{ gid: string; name: string }>;
              const recV = mSubV.find((t) => /record\s*\|.*video/i.test(t.name));
              if (recV) {
                await postStory(recV.gid, `Move out video: ${videoLink}`);
                const todayV = new Date(Date.now() - 7 * 3600 * 1000).toISOString().slice(0, 10);
                await asana("PUT", `/tasks/${recV.gid}`, { completed: true, due_on: todayV }).catch(() => null);
                videoPosted = true;
              }
            }
          }
        } catch { /* fail-soft */ }
      }
      return j(headers, 200, { ok: true, keyboxSaved, videoPosted });
    }

    // ---------- moEmailLog: record the sent owner email on the Turn Over task ----------
    // The widget calls this after the compose opens: posts the final email text as a
    // comment on the "Email | Owner - Turn Over Plan" subtask (falls back to the
    // "Email | Owner - Turn Over Communication" template name), dates it today, and
    // marks it complete (Brittany 2026-08-20).
    if (action === "moEmailLog") {
      const tuGid9 = String(body.taskGid ?? "");
      const emailCopy = String(body.emailCopy ?? "").slice(0, 20000);
      const kind9 = body.kind === "vendor" ? "vendor" : "owner";
      if (!tuGid9 || !emailCopy.trim()) return j(headers, 400, { error: "missing_fields" });
      const today9 = new Date(Date.now() - 7 * 3600 * 1000).toISOString().slice(0, 10);
      try {
        if (kind9 === "vendor") {
          // vendor dispatch email posts as a comment on the TURN OVER task itself,
          // @mentioning its assignee, and the task goes due today (Brittany
          // 2026-09-16; the Email | Vendor subtask is no longer touched)
          const tu9 = await asana("GET", `/tasks/${tuGid9}?opt_fields=assignee.gid,assignee.name`).catch(() => null);
          const aGid9 = tu9?.assignee?.gid ?? "";
          try {
            const html9 = storyHtml(emailCopy);
            await asana("POST", `/tasks/${tuGid9}/stories`, {
              html_text: aGid9 ? html9.replace("<body>", `<body><a data-asana-gid="${aGid9}"/>\n`) : html9,
            });
          } catch {
            await postStory(tuGid9, emailCopy);
          }
          await asana("PUT", `/tasks/${tuGid9}`, { due_on: today9 }).catch(() => null);
          return j(headers, 200, { ok: true, emailLogged: "the Turn Over task" + (tu9?.assignee?.name ? ", @" + tu9.assignee.name + " mentioned" : "") + ", due today" });
        }
        // owner email lands on the MOVE-OUT task's "Email | Owner - Move Out
        // Notification" subtask (Brittany 2026-09-16); older cycles without that
        // subtask fall back to the Turn Over subtask names
        let emailTask: { gid: string; name: string } | null = null;
        try {
          const pk9 = await asana("GET", `/tasks/${tuGid9}?opt_fields=parent.gid`) as { parent?: { gid: string } | null };
          if (pk9?.parent?.gid) {
            const sibs9 = ((await asana("GET", `/tasks/${pk9.parent.gid}/subtasks?limit=100&opt_fields=name`)) ?? []) as Array<{ gid: string; name: string }>;
            const mo9 = sibs9.find((t) => /^move.?out\s*\|/i.test(t.name));
            if (mo9) {
              const mSubs9 = ((await asana("GET", `/tasks/${mo9.gid}/subtasks?limit=100&opt_fields=name`)) ?? []) as Array<{ gid: string; name: string }>;
              emailTask = mSubs9.find((t) => /email\s*\|\s*owner.*move\s*out\s*notification/i.test(t.name)) ?? null;
            }
          }
        } catch { /* fall back below */ }
        // no Turn Over fallback (Brittany 2026-09-16): the owner email lands on
        // the Move-Out notification subtask or nowhere
        if (!emailTask) return j(headers, 200, { ok: true, emailLogged: null });
        await postStory(emailTask.gid, emailCopy);
        await asana("PUT", `/tasks/${emailTask.gid}`, { due_on: today9, completed: true }).catch(() => null);
        return j(headers, 200, { ok: true, emailLogged: emailTask.name });
      } catch {
        return j(headers, 200, { ok: true, emailLogged: null });
      }
    }

    // ---------- moReportFollowUp: Move Out report missing at Submit (Brittany 2026-11-05) ----------
    // The owner notification says "Report failed to upload -- Internal Follow Up task
    // created", so this files that task: a subtask on the Turn Over task, assigned to
    // Bryan, due today. An open same-named subtask is reused (resubmits never double it).
    if (action === "moReportFollowUp") {
      const tuF = String(body.taskGid ?? "").replace(/\D/g, "");
      const addressF = String(body.address ?? "").trim().slice(0, 140);
      if (!tuF || !addressF) return j(headers, 400, { error: "missing_fields" });
      const BRYAN = { gid: "1211066901816385", name: "Bryan Torres" };
      // assigneeGid lets a test land on someone else; real runs always go to Bryan
      const whoF = /^\d{10,20}$/.test(String(body.assigneeGid ?? "")) ? String(body.assigneeGid) : BRYAN.gid;
      const nameF = `Send Move Out to owner, upload fail | ${addressF}`;
      const todayF = new Date(Date.now() - 7 * 3600 * 1000).toISOString().slice(0, 10);
      const subsF = ((await asana("GET", `/tasks/${tuF}/subtasks?limit=100&opt_fields=name,completed,assignee.name`)) ?? []) as Array<{ gid: string; name: string; completed?: boolean; assignee?: { name?: string } | null }>;
      const hitF = subsF.find((t) => !t.completed && t.name.trim().toLowerCase() === nameF.toLowerCase());
      if (hitF) return j(headers, 200, { ok: true, gid: hitF.gid, reused: true, assignee: hitF.assignee?.name ?? "" });
      const ownerF = String(body.ownerEmail ?? "").trim().slice(0, 200);
      const emailF = String(body.emailStatus ?? "").trim().slice(0, 300);
      const reporterF = String(body.reporter ?? "").trim().slice(0, 80);
      const notesF = [
        `The Move Out report had not synced or been uploaded when ${reporterF || "the inspector"} submitted the Move Out Update for ${addressF}, so the owner notification went out without it ("Report failed to upload -- Internal Follow Up task created").`,
        "",
        `Owner: ${ownerF || "no owner email on file"}`,
        ...(emailF ? [`Owner email: ${emailF}`] : []),
        "",
        "To do: get the Move Out inspection report (Buildium files or the inspector app), send it to the owner (cc listings@sagareus.com), and attach it to this Turn Over task.",
        "",
        "Created by the Move Out Update widget. Done by Claude on behalf of the submitting team member.",
      ].join("\n");
      const tF = await asana("POST", `/tasks/${tuF}/subtasks`, { name: nameF, notes: notesF, assignee: whoF, due_on: todayF });
      return j(headers, 200, { ok: true, gid: tF.gid, reused: false, assignee: whoF === BRYAN.gid ? BRYAN.name : "" });
    }

    // ---------- moDelay: the Move Out Update "Delayed?" branch (Brittany 2026-11-05) ----------
    // taskGid is the picked Turn Over task; the Move-Out task is its sibling under
    // the Leasing parent. phase "apply": Move-Out due -> the modified move out date
    // (fallback today + 2), Turn Over due -> the day after, and one playbook subtask
    // per reason under Move-Out (an open same-named subtask is reused, so a resubmit
    // never doubles them). Returns the owner email for the send. phase "log": the
    // status comment (built by the widget, owner email result included) on both
    // tasks. No vendor dispatch, nothing completed.
    if (action === "moDelay") {
      const tuD = String(body.taskGid ?? "").replace(/\D/g, "");
      if (!tuD) return j(headers, 400, { error: "missing_fields" });
      const pickedD = await asana("GET", `/tasks/${tuD}?opt_fields=parent.gid,assignee.gid,assignee.name`);
      const parentD = pickedD?.parent?.gid ?? "";
      const subsD = (parentD ? (await asana("GET", `/tasks/${parentD}/subtasks?limit=100&opt_fields=name`)) ?? [] : []) as Array<{ gid: string; name: string }>;
      const moD = subsD.find((t) => /^move.?out\s*\|/i.test(t.name))?.gid ?? "";
      if (body.phase === "log") {
        const textD = String(body.text ?? "").slice(0, 20000);
        if (!textD.trim()) return j(headers, 400, { error: "missing_fields" });
        let postedD = 0;
        for (const g of [moD, tuD]) {
          if (!g) continue;
          try { await postStory(g, textD); postedD++; } catch { /* the other task still gets it */ }
        }
        return j(headers, 200, { ok: true, posted: postedD, moGid: moD });
      }
      if (!moD) return j(headers, 200, { ok: false, error: "no_move_out", message: "No Move-Out task found under this unit's Leasing task." });
      const DELAY_SUBTASKS: Record<string, Array<{ name: string; role: "toc" | "lead" | "maint" | "tol" | "ops"; tomorrow?: boolean; link: string; notes: string }>> = {
        keys: [
          { name: "Dispatch Locksmith | {address}", role: "toc", link: "https://sagareus.getoutline.com/doc/move-out-tenant-forgot-to-leave-keys-how-to-get-access-and-charge-the-tenant-BoCM0tYLif",
            notes: "Resident confirmed fully vacated but did not leave the keys. Dispatch a locksmith to open and rekey the unit.\nDo not proceed until vacancy is confirmed with the resident. If they cannot be reached, treat the unit as occupied (Tenant Hasn't Left playbook)." },
          { name: "Locksmith Charge | Keys Not Returned", role: "toc", link: "https://sagareus.getoutline.com/doc/move-out-tenant-forgot-to-leave-keys-how-to-get-access-and-charge-the-tenant-BoCM0tYLif",
            notes: "Tenant confirmed vacated but did not leave keys. Locksmith required for access. Cost to be deducted from the security deposit.\nAttach the locksmith invoice or cost confirmation to this subtask. Update 1Password with the new lockbox code after the inspection." },
        ],
        // extension requests escalate to the Operations Manager (Brittany 2026-11-06);
        // the prorated rent subtask is gone: Ops decides extension (prorated rent) or eviction
        time: [
          { name: "Move Out Extension Request | {address}", role: "ops", link: "https://sagareus.getoutline.com/doc/move-out-tenant-needs-more-time-or-wants-to-change-their-move-out-date-YRL4juOKMb",
            notes: "The resident has requested to extend their move out date to {due}. Decide the next step today:\n1 - Approve the extension: the resident will be charged prorated rent through their actual move out date.\n2 - Proceed with eviction.\nDocument the decision here and tag the Leasing Team Lead. The Move Out Update already moved the Move-Out task to {due} and the Turn Over task to {toDue}." },
        ],
        unsafe: [
          { name: "Unit Trash Out Needed", role: "tol", link: "https://sagareus.getoutline.com/doc/move-out-what-to-do-when-a-unit-is-trashed-unsafe-or-unsanitary-QgCvmvtanr",
            notes: "The unit is unsafe or unsanitary; the move out inspection stopped at the entrance. Schedule a third-party trash out vendor (priority) and tag the Operations Manager.\nPhotos are on the Move-Out task. When the trash out is done, tag the inspector so the move out inspection can be completed." },
        ],
        notleft: [
          { name: "Resident Status Follow Up", role: "lead", tomorrow: true, link: "https://sagareus.getoutline.com/doc/move-out-tenant-hasnt-left-45h2awSNex",
            notes: "The resident has not fully moved out and their status is unclear. Do not enter without 24-hour written notice.\nCall and text the resident: do they need more time, or are they no longer moving out? More time = Modified Move Out Date playbook. No longer moving out = document here and notify the Team Lead." },
        ],
        squat: [
          { name: "Possible Trespass // {address}", role: "toc", link: "https://sagareus.getoutline.com/doc/move-out-property-compromised-suspected-squatter-break-in-XtLFCY5UOJ",
            notes: "Suspected squatter or break in. Do NOT enter, for personal safety.\nCall police to report the trespass (they enter to confirm the unit is clear), then call a locksmith to replace the locks. Document photos and comments on suspicious activity here." },
        ],
      };
      const reasonsD = (Array.isArray(body.reasons) ? body.reasons : []).map(String).filter((r) => DELAY_SUBTASKS[r]);
      if (!reasonsD.length) return j(headers, 400, { error: "missing_fields", message: "Pick what caused the delay." });
      const addressD = String(body.address ?? "").trim().slice(0, 140);
      const noteD = String(body.note ?? "").trim().slice(0, 4000);
      const reporterD = String(body.reporter ?? "").trim().slice(0, 80);
      const todayD = new Date(Date.now() - 7 * 3600 * 1000).toISOString().slice(0, 10);
      const plusD = (d: string, n: number) => new Date(Date.parse(d + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
      const ndD = String(body.newDate ?? "").trim();
      const dueD = /^\d{4}-\d{2}-\d{2}$/.test(ndD) && ndD >= todayD ? ndD : plusD(todayD, 2);
      const toDueD = plusD(dueD, 1);
      await asana("PUT", `/tasks/${moD}`, { due_on: dueD });
      const toMoved = await asana("PUT", `/tasks/${tuD}`, { due_on: toDueD }).then(() => true).catch(() => false);
      // people: Turn Over Coordinator = the Turn Over task's assignee; Leasing Team
      // Lead = the Listing Settings Team Lead (as moManaged reads it), falling back
      // to the coordinator; trash out goes to the Turn Over Lead and extension requests to
      // the Operations Manager (Outline Staff Directory, Brittany 2026-11-06)
      const tocD = pickedD?.assignee?.gid ? { gid: String(pickedD.assignee.gid), name: String(pickedD.assignee.name ?? "") } : null;
      let leadD: { gid: string; name: string } | null = null;
      const uidD = String(body.unitId ?? "").replace(/\D/g, "");
      if (uidD && reasonsD.some((r) => DELAY_SUBTASKS[r].some((s) => s.role === "lead"))) {
        try {
          const shL = ((await asana("GET", `/workspaces/${WORKSPACE}/tasks/search?projects.any=1217446710785429&custom_fields.1213183515622826.value=${uidD}&opt_fields=name`)) ?? []) as Array<{ gid: string }>;
          if (shL[0]?.gid) {
            const lsL = await asana("GET", `/tasks/${shL[0].gid}?opt_fields=custom_fields.gid,custom_fields.people_value.gid,custom_fields.people_value.name`);
            const pL = ((lsL.custom_fields ?? []) as Array<{ gid: string; people_value?: Array<{ gid: string; name: string }> }>).find((f) => f.gid === "1217446711292696")?.people_value?.[0];
            if (pL?.gid) leadD = { gid: pL.gid, name: pL.name };
          }
        } catch { /* falls back to the coordinator */ }
      }
      let ownerEmailD = "", ownerNameD = "";
      const luD = subsD.find((t) => /^(lu|tp|pre.?lease)\s*\|/i.test(t.name));
      if (luD) {
        try {
          const luT = await asana("GET", `/tasks/${luD.gid}?opt_fields=custom_fields.gid,custom_fields.name,custom_fields.display_value`);
          ({ email: ownerEmailD, name: ownerNameD } = ownerFromCf((luT.custom_fields ?? []) as Array<{ name?: string; display_value?: string | null }>));
        } catch { /* owner email stays blank -> the widget drafts instead of sending */ }
      }
      const existD = ((await asana("GET", `/tasks/${moD}/subtasks?limit=100&opt_fields=name,completed`)) ?? []) as Array<{ gid: string; name: string; completed?: boolean }>;
      const madeD: string[] = [], reusedD: string[] = [];
      const testWhoD = /^\d{10,20}$/.test(String(body.assigneeGid ?? "")) ? String(body.assigneeGid) : "";
      for (const r of reasonsD) {
        for (const s of DELAY_SUBTASKS[r]) {
          const nameS = s.name.replace("{address}", addressD);
          if (existD.some((t) => !t.completed && t.name.trim().toLowerCase() === nameS.toLowerCase())) { reusedD.push(nameS); continue; }
          // assigneeGid lets a test land on someone else (as in moReportFollowUp)
          const who = testWhoD ? { gid: testWhoD, name: "test assignee" } : s.role === "maint" ? DEFAULT_MAINT : s.role === "tol" ? TURNOVER_LEAD : s.role === "ops" ? OPS_MANAGER : s.role === "lead" ? (leadD ?? tocD) : tocD;
          const notesS = s.notes.replaceAll("{due}", dueD).replaceAll("{toDue}", toDueD) +
            (noteD ? `\n\nFrom the Move Out Update${reporterD ? " (" + reporterD + ")" : ""}:\n${noteD}` : "") +
            `\n\nPlaybook: ${s.link}\n\nCreated by the Move Out Update widget (Delayed). Done by Claude on behalf of the submitting team member.`;
          await asana("POST", `/tasks/${moD}/subtasks`, { name: nameS, notes: notesS, due_on: s.tomorrow ? plusD(todayD, 1) : todayD, ...(who?.gid ? { assignee: who.gid } : {}) });
          madeD.push(nameS + (who?.name ? " (" + who.name + ")" : ""));
        }
      }
      return j(headers, 200, { ok: true, moGid: moD, due: dueD, toDue: toDueD, toMoved, ownerEmail: ownerEmailD.slice(0, 200), ownerName: ownerNameD, made: madeD, reused: reusedD });
    }

    // ---------- moSubmit: Turn Over Plan (Propose) submission ----------
    // Posts the report + photos + PDF on the picked TURN OVER task (Brittany
    // 2026-08-14: not the Move-Out conduct subtask, which stays incomplete),
    // stamps Move Out Completion Date on the LU task, and appends the work order
    // items to the Turn Over task's description (the work order). Deliberately NO verdict, NO
    // tickets, NO deposit language.
    if (action === "moSubmit") {
      const taskGid = String(body.taskGid ?? "");
      const address = String(body.address ?? "").trim();
      if (!taskGid || !address) return j(headers, 400, { error: "missing_fields" });
      // Work-order capture (Brittany 2026-08-14: "Don't go room by room. Just do
      // enough for the work order.") — findings are work-order items, not room issues.
      type MoFinding = { type: string; note: string; photos: number; group: string };
      const findings: MoFinding[] = (Array.isArray(body.findings) ? body.findings : []).slice(0, 60).map((f: Record<string, unknown>) => ({
        type: String(f.type ?? "").slice(0, 60),
        note: String(f.note ?? "").slice(0, 1000),
        photos: Number(f.photos ?? 0) || 0,
        group: /^(minor|major)$/i.test(String(f.group ?? "")) ? String(f.group).slice(0, 1).toUpperCase() + String(f.group).slice(1).toLowerCase() : "Required",
      })).filter((f: MoFinding) => f.type);
      const reqFindings = findings.filter((f) => f.group === "Required");
      const optFindings = findings.filter((f) => f.group !== "Required");
      const byType: Array<{ t: string; items: string[] }> = (Array.isArray(body.byType) ? body.byType : []).slice(0, 12)
        .map((g: Record<string, unknown>) => ({
          t: String(g.t ?? "").slice(0, 30),
          items: (Array.isArray(g.items) ? g.items : []).slice(0, 60).map((i: unknown) => String(i).slice(0, 400)),
        })).filter((g: { t: string; items: string[] }) => g.t && g.items.length);
      const ratings = (body.ratings ?? {}) as Record<string, unknown>;
      const cleanRating = String(ratings.cleanliness ?? "").slice(0, 2);
      const yardRating = String(ratings.yard ?? "").slice(0, 2);
      const cleanNote = String(ratings.cleanNote ?? "").trim().slice(0, 400);
      const yardNote = String(ratings.yardNote ?? "").trim().slice(0, 400);
      const odor = String(body.odor ?? "").slice(0, 200);
      const mold = String(body.mold ?? "").slice(0, 200);
      const pests = String(body.pests ?? "").slice(0, 200);
      const kb = body.keybox ?? {};
      const keyboxLoc = String((kb as Record<string, unknown>).location ?? "").slice(0, 200);
      const keyboxCode = String((kb as Record<string, unknown>).code ?? "").slice(0, 40);
      const videoLink = String(body.videoLink ?? "").trim().slice(0, 400);
      const inspector = String(body.inspector ?? "").trim().slice(0, 80);
      const generalNote = String(body.generalNote ?? "").slice(0, 2000);
      const todayStr = new Date(Date.now() - 7 * 3600 * 1000).toISOString().slice(0, 10);

      // taskGid is the picked Turn Over task (the picker serves both modes); the
      // report lives HERE. Its Leasing parent gives the LU task for owner email +
      // Move Out Completion Date.
      const tuGid = taskGid;
      const picked = await asana("GET", `/tasks/${taskGid}?opt_fields=parent.gid,parent.name`);
      const parentGid = picked?.parent?.gid ?? null;
      let luGid: string | null = null;
      let moGid: string | null = null;
      let ownerEmail = "";
      let doNotList9 = "";
      if (parentGid) {
        try {
          const subs = await asana("GET", `/tasks/${parentGid}/subtasks?limit=100&opt_fields=name`);
          moGid = ((subs ?? []).find((t: { name: string }) => /^move.?out\s*\|/i.test(t.name)) ?? {}).gid ?? null;
          const luTask = (subs ?? []).find((t: { name: string }) => /^(lu|tp|pre.?lease)\s*\|/i.test(t.name));
          if (luTask) {
            luGid = luTask.gid;
            const lu = await asana("GET", `/tasks/${luGid}?opt_fields=custom_fields.gid,custom_fields.name,custom_fields.display_value`);
            const luCf9 = (lu.custom_fields ?? []) as Array<{ gid?: string; name?: string; display_value?: string | null }>;
            ownerEmail = ownerFromCf(luCf9).email;
            // Do Not List (ask 1219236873185401): no Go Live nudge for a unit we are not relisting
            doNotList9 = String(luCf9.find((f) => f.gid === "1214787859185273")?.display_value ?? "").trim();
          }
        } catch { /* fail-soft: owner email just stays blank */ }
      }

      // Flat report comment in the Site Visit style (simplified 2026-08-14)
      const lines: string[] = [
        "Move Out Condition Inspection | Repairs / Damages + Optional Upgrades",
        `${todayStr} -- ${address}`,
        "",
      ];
      if (inspector) lines.splice(2, 0, `Inspected by: ${inspector}`);
      if (videoLink) { lines.push(`Walkthrough video: ${videoLink}`); lines.push(""); }
      // the Move Out v2 inspection (third-party inspector app -> Buildium files ->
      // re-hosted copy) is the condition record from 2026-09; link it first
      const moFileUrl = String(body.moFileUrl ?? "").trim().slice(0, 500);
      const moFileName = String(body.moFileName ?? "").trim().slice(0, 160);
      if (/^https:\/\//.test(moFileUrl)) { lines.push(`Move Out Condition Inspection${moFileName ? " (" + moFileName + ")" : ""}: ${moFileUrl}`); lines.push(""); }
      // keybox never prints in the report (Brittany 2026-09-16: not even the
      // updated-note line); the code lives ONLY on the Leasing parent's
      // [Onsite] Key Box field and the owner + vendor access emails
      // ratings retired from the Propose widget (Brittany 2026-08-19); print only if sent
      if (cleanRating || yardRating || cleanNote || yardNote) {
        lines.push("RATINGS");
        lines.push(`Cleanliness: ${cleanRating || "not graded"}${cleanNote ? " -- " + cleanNote : ""}`);
        lines.push(`Exterior: ${yardRating || "not graded"}${yardNote ? " -- " + yardNote : ""}`);
      }
      if (odor) lines.push(`Odor: ${odor}`);
      if (mold) lines.push(`Mold: ${mold}`);
      if (pests) lines.push(`Pests: ${pests}`);
      // no work-order sections on findings-less submits (2026-09-16: the Move Out
      // v2 report carries the condition detail; legacy dispatch callers still send
      // findings and keep the sections)
      if (findings.length) {
      lines.push("");
      lines.push(`REQUIRED WORK ORDER (${reqFindings.length} item${reqFindings.length === 1 ? "" : "s"}) -- estimate 1, executed up to Authorization`);
      reqFindings.forEach((f) => lines.push(`- ${f.type}${f.note ? " -- " + f.note : ""}${f.photos ? ` (${f.photos} photo${f.photos > 1 ? "s" : ""})` : ""}`));
      if (!reqFindings.length) lines.push("None. Everything not listed is assumed OK.");
      }
      if (optFindings.length) {
        lines.push("");
        lines.push(`OPTIONAL UPGRADES (${optFindings.length} item${optFindings.length === 1 ? "" : "s"}) -- estimate 2 separately; owner picks from these`);
        optFindings.forEach((f) => lines.push(`- ${f.group} - ${f.type}${f.note ? " -- " + f.note : ""}${f.photos ? ` (${f.photos} photo${f.photos > 1 ? "s" : ""})` : ""}`));
      }
      if (byType.length) {
        lines.push("");
        lines.push("BY TYPE");
        byType.forEach((g) => {
          lines.push(`${g.t}:`);
          g.items.forEach((i) => lines.push(`- ${i}`));
        });
      }
      if (generalNote) { lines.push(""); lines.push("Notes:"); lines.push(generalNote); }
      // photo backup links (Brittany 2026-09-03, after 414987 lost its photos):
      // every capture uploads to storage during the walk, so the report keeps
      // the originals even when the PDF fails to attach
      const photoUrls = Array.isArray(body.photoUrls)
        ? (body.photoUrls as unknown[]).map((x) => String(x)).filter((u) => /^https:\/\//.test(u)).slice(0, 100)
        : [];
      if (photoUrls.length) {
        lines.push("");
        lines.push(`PHOTO BACKUPS (${photoUrls.length})`);
        photoUrls.forEach((u) => lines.push(u));
      }
      // Owner Managed turn over (Brittany 2026-09-22): no vendor dispatch (the
      // widget skips those calls) and the coordination belongs to the Leasing
      // Team Lead, so the Turn Over task is reassigned to them BEFORE the
      // condition comment posts; the @mention then lands on the lead.
      let omAssigned = "";
      if (body.ownerManaged === true) {
        const uidOM = String(body.unitId ?? "").replace(/\D/g, "");
        if (uidOM) {
          try {
            const shOM = ((await asana("GET", `/workspaces/${WORKSPACE}/tasks/search?projects.any=1217446710785429&custom_fields.1213183515622826.value=${uidOM}&opt_fields=name`)) ?? []) as Array<{ gid: string }>;
            const lsOM = shOM[0]?.gid ?? "";
            if (lsOM) {
              const lsTOM = await asana("GET", `/tasks/${lsOM}?opt_fields=custom_fields.gid,custom_fields.people_value.gid,custom_fields.people_value.name`);
              const leadOM = ((lsTOM.custom_fields ?? []) as Array<{ gid: string; people_value?: Array<{ gid: string; name: string }> }>).find((f) => f.gid === "1217446711292696")?.people_value?.[0];
              if (leadOM) {
                await asana("PUT", `/tasks/${tuGid}`, { assignee: leadOM.gid });
                omAssigned = leadOM.name;
              }
            }
          } catch { /* fail-soft: assignment can be set by hand */ }
        }
      }

      // the condition comment @mentions the Turn Over assignee (Brittany 2026-09-16)
      let story: { gid?: string } | null = null;
      const bodyText9 = lines.join("\n").slice(0, 60000);
      try {
        const tuA9 = await asana("GET", `/tasks/${tuGid}?opt_fields=assignee.gid`).catch(() => null);
        const aG9 = tuA9?.assignee?.gid ?? "";
        story = aG9
          ? await asana("POST", `/tasks/${tuGid}/stories`, { html_text: storyHtml(bodyText9).replace("<body>", `<body><a data-asana-gid="${aG9}"/>\n`) })
          : await postStory(tuGid, bodyText9);
      } catch { story = await postStory(tuGid, bodyText9); }

      // LU heads-up comment (Brittany 2026-09-16): move out complete, show-ready,
      // and the report link, so leasing sees the unit state at a glance
      const showReady9 = String(body.showReady ?? "").trim().slice(0, 10);
      let luNoted = false;
      if (luGid) {
        try {
          const luLines = [`Move out complete -- ${todayStr} -- ${address}`];
          if (showReady9) luLines.push(`• Photo / Show Ready: ${showReady9}`);
          luLines.push(`• Move Out Report: ${/^https:\/\//.test(moFileUrl) ? moFileUrl : "not synced at dispatch"}`);
          await postStory(luGid, luLines.join("\n"));
          luNoted = true;
        } catch { /* fail-soft */ }
      }

      // Move-Out task completes on dispatch (Brittany 2026-09-16; it stayed open
      // pre-Move-Out-v2), with the completion date stamped, and the two Move-Out
      // subtasks this tool now performs itself get ticked: Attach | Move Out
      // Inspection Report to Turn Over Task and Update | move_out_date metric.
      if (moGid) {
        try { await asana("PUT", `/tasks/${moGid}`, { completed: true, custom_fields: { "1214521745467158": { date: todayStr } } }); } catch { /* fail-soft */ }
        try {
          const mSubT = ((await asana("GET", `/tasks/${moGid}/subtasks?limit=100&opt_fields=name,completed`)) ?? []) as Array<{ gid: string; name: string; completed?: boolean }>;
          for (const tS of mSubT) {
            if (tS.completed) continue;
            if (/attach\s*\|.*inspection/i.test(tS.name) || /update\s*\|.*move.?_?out.?_?date/i.test(tS.name)) {
              await asana("PUT", `/tasks/${tS.gid}`, { completed: true, due_on: todayStr }).catch(() => null);
            }
          }
        } catch { /* fail-soft */ }
      }
      try { await asana("PUT", `/tasks/${tuGid}`, { custom_fields: { "1214522138482281": { date: todayStr } } }); } catch { /* fail-soft */ }

      // New keybox code -> the Leasing parent's [Onsite] Key Box field, its only home
      // besides the owner + vendor access emails (Brittany 2026-09-15; Unit Settings'
      // key field is being repurposed as the post-move-in storage locker label)
      let keyboxSaved = false;
      if (keyboxCode && parentGid) {
        try {
          await asana("PUT", `/tasks/${parentGid}`, { custom_fields: { "1218512667092355": keyboxCode.slice(0, 40) } });
          keyboxSaved = true;
        } catch { /* fail-soft: the code still rides the owner email */ }
      }

      // Append findings to this Turn Over task's DESCRIPTION = initial work
      // order (the Approved Scope field retired 2026-09-24; the description is
      // the scope again, as toScope always allowed)
      let scopeAppended = 0;
      if (reqFindings.length) {
        // Required items only: Optional Upgrades are owner choices, never pre-approved scope
        try {
          const tuTask = await asana("GET", `/tasks/${tuGid}?opt_fields=notes`);
          const existing = String(tuTask?.notes ?? "").trim();
          const block = reqFindings.map((f) => `${f.type}${f.note ? ": " + f.note : ""}`).join("\n");
          const merged = (existing ? existing + "\n" : "") + block;
          await asana("PUT", `/tasks/${tuGid}`, { notes: merged.slice(0, 9000) });
          scopeAppended = reqFindings.length;
        } catch { /* fail-soft; scope can be filled by hand */ }
      }

      // Work order -> Turn Proposal field on the Listing Settings task, line by line
      // (Brittany 2026-08-14). Find-or-create "Listing | {address}" like lsPush.
      let turnProposalSaved = false;
      // Unit ID keys the Make Ready page and the LS lookup (Brittany 2026-09-03:
      // never address, so two units at one property cannot cross)
      const uidMR = String(body.unitId ?? "").replace(/\D/g, "");
      let lsGidOut = "";
      if (findings.length) {
        try {
          const LS_PROJECT = "1217446710785429";
          const lsSlug = (a: string) => a.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
          const slug = lsSlug(address);
          let lsGid = "";
          if (uidMR) {
            try {
              const shMR = ((await asana("GET", `/workspaces/${WORKSPACE}/tasks/search?projects.any=${LS_PROJECT}&custom_fields.1213183515622826.value=${uidMR}&opt_fields=name`)) ?? []) as Array<{ gid: string }>;
              lsGid = shMR[0]?.gid ?? "";
            } catch { /* slug scan below */ }
          }
          let off = "";
          for (let page = 0; page < 15 && !lsGid; page++) {
            const r0 = await fetch(`${ASANA}/projects/${LS_PROJECT}/tasks?limit=100&opt_fields=name${off ? `&offset=${encodeURIComponent(off)}` : ""}`,
              { headers: { "Authorization": `Bearer ${ASANA_PAT}` } });
            const j0 = await r0.json().catch(() => ({}));
            for (const t of (j0.data ?? []) as Array<{ gid: string; name: string }>) {
              if (lsSlug(String(t.name).replace(/^listing\s*\|/i, "").trim()) === slug) { lsGid = t.gid; break; }
            }
            off = j0.next_page?.offset ?? "";
            if (!off) break;
          }
          const proposal = reqFindings.map((f) => `${f.type}${f.note ? ": " + f.note : ""}`)
            .concat(optFindings.map((f) => `${f.group} - ${f.type}${f.note ? ": " + f.note : ""}`))
            .join("\n").slice(0, 6000);
          if (!lsGid) {
            const t = await asana("POST", "/tasks", {
              name: `Listing | ${address}`.slice(0, 250),
              projects: [LS_PROJECT],
              notes: "Source of truth for this property's Leasing URL. Edit fields here; the page updates live.\n\nCreated from the Turn Over Proposal inspection. Done by Claude on behalf of the inspector.",
              custom_fields: uidMR ? { "1217509139690271": proposal, "1213183515622826": uidMR } : { "1217509139690271": proposal },
            });
            lsGid = t?.gid ?? "";
          } else {
            await asana("PUT", `/tasks/${lsGid}`, { custom_fields: { "1217509139690271": proposal } });
            await asana("POST", `/tasks/${lsGid}/stories`, {
              text: `Turn Proposal updated from the ${todayStr} Turnover Dispatch (via the /work-bench turnover widget). Done by Claude on behalf of the inspector.`,
            }).catch(() => null);
          }
          turnProposalSaved = !!lsGid;
          lsGidOut = lsGid;
        } catch { /* fail-soft: the field can be filled from the report by hand */ }
      }

      // Photo / Show Ready = Yes: the LU task's Go Live subtask goes due today,
      // assigned to the Leasing Team Lead, with a ready-to-list note. Target List
      // Date is deliberately NOT touched (Brittany 2026-09-22: targets stay as set
      // so target-vs-actual can be compared later).
      let goLiveSet = false, goLiveLead = "";
      if (showReady9.toLowerCase() === "yes" && !doNotList9) {
        const LSP9 = "1217446710785429", UIDF9 = "1213183515622826", LEADF9 = "1217446711292696";
        let lsGid9 = "";
        let leadGid9 = "";
        if (uidMR) {
          try {
            const sH9 = ((await asana("GET",
              `/workspaces/${WORKSPACE}/tasks/search?projects.any=${LSP9}&custom_fields.${UIDF9}.value=${uidMR}&opt_fields=name`)) ?? []) as Array<{ gid: string }>;
            lsGid9 = sH9[0]?.gid ?? "";
          } catch { /* fail-soft */ }
        }
        if (lsGid9) {
          try {
            const lsT9 = await asana("GET", `/tasks/${lsGid9}?opt_fields=custom_fields.gid,custom_fields.people_value.gid,custom_fields.people_value.name`);
            const leadF9 = ((lsT9.custom_fields ?? []) as Array<{ gid: string; people_value?: Array<{ gid: string; name: string }> }>).find((f) => f.gid === LEADF9);
            if (leadF9?.people_value?.[0]) { leadGid9 = leadF9.people_value[0].gid; goLiveLead = leadF9.people_value[0].name; }
          } catch { /* assignee stays as-is */ }
        }
        if (luGid) {
          try {
            const luSubs9 = ((await asana("GET", `/tasks/${luGid}/subtasks?limit=100&opt_fields=name`)) ?? []) as Array<{ gid: string; name: string }>;
            const gl9 = luSubs9.find((t) => /^go\s*live/i.test(t.name));
            if (gl9) {
              const upd9: Record<string, unknown> = { due_on: todayStr };
              if (leadGid9) upd9.assignee = leadGid9;
              await asana("PUT", `/tasks/${gl9.gid}`, upd9);
              await postStory(gl9.gid, "Move out confirmed, unit is ready to list.").catch(() => null);
              goLiveSet = true;
            }
          } catch { /* fail-soft */ }
        }
      }

      // the Move Out report rides on the Turn Over task as a real attachment, not only
      // as a link (Courtney's dispatch feedback 2026-10-07); skipped when a file of
      // the same name is already there
      let moAttached = false;
      if (/^https:\/\//.test(moFileUrl)) {
        try {
          const nmA = ((moFileName || "Move Out Report").replace(/[\\/:*?"<>|]+/g, " ").trim().replace(/\.pdf$/i, "") + ".pdf").slice(0, 150);
          const exA = ((await asana("GET", `/tasks/${tuGid}/attachments?opt_fields=name`)) ?? []) as Array<{ gid: string; name: string }>;
          if (!exA.some((a) => a.name === nmA)) {
            const fr = await fetch(moFileUrl);
            if (fr.ok) {
              const blob = await fr.blob();
              if (blob.size > 0 && blob.size < 95 * 1024 * 1024) {
                const formA = new FormData();
                formA.append("parent", tuGid);
                formA.append("file", new Blob([await blob.arrayBuffer()], { type: "application/pdf" }), nmA);
                const ra = await fetch(`${ASANA}/attachments`, { method: "POST", headers: { "Authorization": `Bearer ${ASANA_PAT}` }, body: formA });
                moAttached = ra.ok;
              }
            }
          } else moAttached = true;
        } catch { /* fail-soft: the link is still in the report comment */ }
      }

      return j(headers, 200, {
        ok: true,
        moAttached,
        luNoted,
        goLiveSet, goLiveLead,
        doNotList: doNotList9,
        omAssigned,
        // photos + PDF attach here too: the Turn Over task carries everything
        conductGid: tuGid,
        conductUrl: `https://app.asana.com/0/0/${tuGid}`,
        storyGid: story?.gid ?? null,
        ownerEmail,
        tuGid,
        scopeAppended,
        keyboxSaved,
        turnProposalSaved,
        lsGid: lsGidOut,
        makeReadyUrl: uidMR ? `https://www.sagareus.com/make-ready?u=${uidMR}&t=${todayStr.slice(0, 7)}` : "",
        reportDate: todayStr,
      });
    }

    // ---------- pdf: attach the inspection PDF and link it in the checklist comment ----------
    if (action === "pdf") {
      const parent = String(body.parent ?? "");
      const storyGid = String(body.storyGid ?? "");
      const filename = String(body.filename ?? "site-visit.pdf").replace(/[^\w.\-]/g, "_");
      const dataB64 = String(body.dataB64 ?? "");
      if (!parent || !dataB64 || dataB64.length > 12_000_000) return j(headers, 400, { error: "bad_pdf" });
      const bytes = Uint8Array.from(atob(dataB64), (ch) => ch.charCodeAt(0));
      // replace: regenerated reports (e.g. a bedroom-count correction, unit 488555
      // 2026-09-07) delete the SAME-NAMED attachment before uploading, so the task
      // never carries two versions of one report
      if (body.replace === true) {
        try {
          const exArr = ((await asana("GET", `/tasks/${parent}/attachments?opt_fields=name`)) ?? []) as Array<{ gid: string; name: string }>;
          for (const ex of exArr) {
            if (String(ex.name) !== filename) continue;
            await fetch(`${ASANA}/attachments/${ex.gid}`, { method: "DELETE", headers: { "Authorization": `Bearer ${ASANA_PAT}` } }).catch(() => null);
          }
        } catch { /* old copy staying is not worth failing the upload */ }
      }
      // replace: regenerated reports (e.g. a bedroom-count correction, unit 488555
      // 2026-09-07) delete the SAME-NAMED attachment before uploading, so the task
      // never carries two versions of one report
      if (body.replace === true) {
        try {
          const exArr = ((await asana("GET", `/tasks/${parent}/attachments?opt_fields=name`)) ?? []) as Array<{ gid: string; name: string }>;
          for (const ex of exArr) {
            if (String(ex.name) !== filename) continue;
            await fetch(`${ASANA}/attachments/${ex.gid}`, { method: "DELETE", headers: { "Authorization": `Bearer ${ASANA_PAT}` } }).catch(() => null);
          }
        } catch { /* old copy staying is not worth failing the upload */ }
      }
      const form = new FormData();
      form.append("parent", parent);
      form.append("file", new Blob([bytes], { type: "application/pdf" }), filename);
      const res = await fetch(`${ASANA}/attachments?opt_fields=permanent_url,view_url`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${ASANA_PAT}` },
        body: form,
      });
      const attJson = await res.json().catch(() => ({}));
      if (!res.ok) return j(headers, 502, { error: "attach_failed" });
      // opt-in: the utility-report flow marks its Calculate task complete once the
      // report is attached (Brittany 2026-08-20); other pdf callers are unaffected
      if (body.completeParent === true) {
        await asana("PUT", `/tasks/${parent}`, { completed: true }).catch(() => null);
      }
      const att = attJson.data ?? {};
      const asanaUrl = att.permanent_url || att.view_url ||
        (att.gid ? `https://app.asana.com/app/asana/-/get_asset?asset_id=${att.gid}` : "");

      // Public copy in Supabase storage so OWNERS can open the link (Asana asset
      // links are login-gated). Unguessable path; bucket created on first use.
      let publicUrl = "";
      try {
        const supaUrl = Deno.env.get("SUPABASE_URL") ?? "";
        const supaKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
        if (supaUrl && supaKey) {
          const sh = { "Authorization": `Bearer ${supaKey}`, "apikey": supaKey };
          await fetch(`${supaUrl}/storage/v1/bucket`, {
            method: "POST",
            headers: { ...sh, "Content-Type": "application/json" },
            body: JSON.stringify({ id: "inspections", name: "inspections", public: true }),
          }).catch(() => null); // 409 when it already exists; fine
          const key = `${crypto.randomUUID()}/${filename}`;
          const up = await fetch(`${supaUrl}/storage/v1/object/inspections/${key}`, {
            method: "POST",
            headers: { ...sh, "Content-Type": "application/pdf" },
            body: bytes,
          });
          if (up.ok) publicUrl = `${supaUrl}/storage/v1/object/public/inspections/${key}`;
        }
      } catch { /* public copy is best-effort */ }

      const url = publicUrl || asanaUrl;
      const label = String(body.label ?? "Inspection PDF").replace(/[^\w /-]/g, "").slice(0, 40) || "Inspection PDF";
      if (storyGid && url) {
        try {
          const st = await asana("GET", `/stories/${storyGid}?opt_fields=text`);
          const combined = `${st.text}\n\n${label}: ${url}`;
          try {
            await asana("PUT", `/stories/${storyGid}`, { html_text: storyHtml(combined) });
          } catch {
            await asana("PUT", `/stories/${storyGid}`, { text: combined });
          }
        } catch { /* comment update is best-effort; the PDF is attached either way */ }
      }
      return j(headers, 200, { ok: true, url });
    }

    // ---------- draftCopy: generate Zillow-ready listing copy (internal, /wt pilot) ----------
    // Prompt condensed from ask-aster/skills/listing-copywriter/SKILL.md (canonical voice).
    // OpenRouter for now (Brittany, 2026-07-21); revisit direct Anthropic key if generation spreads.
    if (action === "draftCopy") {
      const OR_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
      if (!OR_KEY) return j(headers, 500, { error: "server_not_configured", message: "No LLM key on the server." });
      const facts = [
        `Address: ${String(body.address ?? "")}`,
        body.propertyType ? `Property type: ${body.propertyType}` : "",
        body.beds ? `Bedrooms: ${body.beds}` : "",
        body.baths ? `Bathrooms: ${body.baths}` : "",
        body.sqft ? `Square feet: ${body.sqft}` : "",
        body.rent ? `Asking rent: $${body.rent}/mo` : "",
        body.previousRent ? `Previous list price: $${body.previousRent}/mo (context only, do not print)` : "",
      ].filter(Boolean).join("\n");
      const existing = String(body.existingCopy ?? "").slice(0, 4000);
      const SYSTEM = [
        "You are the Sagareus listing copywriter: a warm, persuasive marketing writer producing Zillow-ready rental listing copy that makes a prospect want to tour.",
        "NEVER include the street address, bed count, bath count, or square footage anywhere in the copy. Those display in the listing's data fields already; repeating them wastes the description. The description is pure narrative.",
        "STRUCTURE (always exactly 5 paragraphs, 140-250 words total):",
        "1. Opener: two sentences. Start with \"You'll love this...\" or \"Welcome to your next home in [Neighborhood].\", then ONE hook sentence that sells the property's single most compelling verified feature.",
        "2. Living experience: 2-4 sentences on VERIFIED interior features, written as the experience of living with them, not a list. Cook on the gas range, unwind by the fireplace, spread out in the bonus room.",
        "3. Comfort and convenience: 2-4 sentences on verified property-level perks (A/C, laundry, parking, included services), framed as what they make easy.",
        "4. Location: 2-4 sentences with SPECIFIC named places and real distances from your research: nearest major freeway(s), at least one notable park, and a shopping or dining area, each with an approximate drive/walk time or mileage. If research fails for a place, name it without a number rather than inventing one.",
        "5. Call to action: exactly \"Don't wait, schedule your tour today!\" or \"Showings by appointment only, schedule today!\"",
        "SENTENCE CRAFT: vary sentence openings. Never start two consecutive sentences with the same word. Sell, don't inventory: every feature gets a benefit or a moment, never a bare spec. Warm, evocative adjectives are encouraged when anchored to a real feature (gleaming refinished hardwoods, a chef-worthy Bertazzoni range). Avoid absolute or unverifiable claims (best, luxury, one-of-a-kind) and anything misleading.",
        "VOICE RULES (non-negotiable): never use em dashes. No emojis. NO tenant-targeting language of any kind: never describe who should live there or who the home suits (Fair Housing). Banned words in any form: family, families, kids, children, couples, professionals, students, seniors, \"perfect for\", \"ideal for\". Describe the property and the lifestyle it offers, never the people. Second person (you, your) is fine.",
        "If the verified facts are thin, still produce the best compliant draft and use [verify: detail] placeholders sparingly rather than refusing.",
        "If the input copy contains discriminatory or tenant-targeting language, silently drop it.",
        "SELF-CHECK before you output: exactly 5 paragraphs? Zero mentions of address, beds, baths, or square footage? Opener has a hook? CTA line present and exact? 140-250 words? No repeated sentence openers? Location paragraph names a freeway, a park, and shopping with distances? Reads like a story, not a spec sheet? Fix anything failing, then output.",
        "OUTPUT: plain text only, no markdown, no asterisks, no bullet symbols, no links, no inline citations. Output EXACTLY this structure: a first line that is exactly LISTING: followed by the 5 paragraphs, then a line that is exactly NOTE: followed by what the agent must verify before publishing plus the research source domains (domains only). NOTHING before the LISTING: line. Any reasoning about location context or verification belongs after NOTE:, never in the listing paragraphs.",
      ].join("\n");
      const userMsg = existing
        ? `Rewrite the existing listing copy below to the required format. Keep verified content, drop anything unverifiable or non-compliant.\n\nVerified facts:\n${facts}\n\nExisting copy:\n${existing}`
        : `Write listing copy from these verified facts:\n${facts}`;
      for (const model of ["anthropic/claude-sonnet-5", "anthropic/claude-sonnet-4.5", "anthropic/claude-3.7-sonnet"]) {
        try {
          const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${OR_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model, max_tokens: 1400, plugins: [{ id: "web", max_results: 5 }], messages: [{ role: "system", content: SYSTEM }, { role: "user", content: userMsg }] }),
          });
          const jr = await r.json().catch(() => ({}));
          const text = jr?.choices?.[0]?.message?.content;
          if (r.ok && text) {
            // house style: no em or en dashes in customer-facing copy, ever. The prompt
            // bans them but models leak them; scrub mechanically (Brittany 2026-08-27).
            // Numeric ranges become "to"; everything else becomes a comma.
            const noDash = (t0: string) => t0
              .replace(/(\d)\s*[\u2014\u2013]\s*(\d)/g, "$1 to $2")
              .replace(/\s*[\u2014\u2013]\s*/g, ", ");
            const raw = noDash(String(text)).replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\*\*/g, "").trim();
            // Split the delimited output: anything before LISTING: (model preamble) and
            // everything after NOTE: goes to the agent-facing note, never the listing.
            let copy = raw;
            let note = "";
            const mL = /(^|\n)\s*LISTING:\s*/i.exec(raw);
            if (mL) {
              const pre = raw.slice(0, mL.index).trim();
              copy = raw.slice(mL.index + mL[0].length).trim();
              if (pre) note = pre;
            }
            const mN = /(^|\n)\s*NOTE:\s*/i.exec(copy);
            if (mN) {
              note = [note, copy.slice(mN.index + mN[0].length).trim()].filter(Boolean).join("\n\n");
              copy = copy.slice(0, mN.index).trim();
            }
            // Fallback for undelimited output: a leading first-person planning paragraph
            // ("I have enough verified location context...") is reasoning, not listing copy.
            if (!mL) {
              const paras = copy.split(/\n{2,}/);
              if (paras.length > 5 && /^["\u201C]?I(?:'ll| have| am| will|\s)/.test(paras[0].trim())) {
                note = [paras.shift()!.trim().replace(/^["\u201C]|["\u201D]$/g, ""), note].filter(Boolean).join("\n\n");
                copy = paras.join("\n\n").trim();
              }
            }
            return j(headers, 200, { copy, note, model });
          }
        } catch { /* try next model */ }
      }
      return j(headers, 502, { error: "llm_failed", message: "Copy generation is unavailable right now. Draft manually for this one." });
    }

    // ---------- warListing: current Buildium listing + description for the WAR listing-update flow ----------
    if (action === "warListing") {
      if (!BUILDIUM_ID || !BUILDIUM_SECRET) return j(headers, 500, { error: "buildium_not_configured" });
      const address = String(body.address ?? "").trim();
      // Unit ID first (Brittany's standing rule): the bench sends the row's
      // Unit ID, so the address match is only a fallback for callers without
      // one. Address matching flagged 10650 NE 9th Pl #1520 as "ambiguous"
      // and hid a live listing (2026-09-30).
      let uid = String(body.unitId ?? "").replace(/\D/g, "");
      if (!uid) {
        if (!address) return j(headers, 400, { error: "missing_address" });
        const m = await matchSettings(address);
        if (m.ambiguous) return j(headers, 404, { error: "ambiguous", message: `Multiple units match (${m.ambiguous.join(", ")}). Listing updates need a single unit.` });
        if (!m.hit) return j(headers, 404, { error: "unit_not_found", message: "No Unit Settings task matches this address, so there is no Buildium unit to update." });
        const task = await asana("GET", `/tasks/${m.hit.gid}?opt_fields=custom_fields.name,custom_fields.display_value`);
        uid = String((task.custom_fields ?? []).find((f: { name: string }) => /^unit id$/i.test(f.name))?.display_value ?? "").trim();
        if (!/^\d+$/.test(uid)) return j(headers, 404, { error: "no_unit_id", message: "The Unit Settings task has no Unit ID; add it in Asana to enable listing updates." });
      }
      const BH = { "x-buildium-client-id": BUILDIUM_ID, "x-buildium-client-secret": BUILDIUM_SECRET };
      const ru = await fetch(`https://api.buildium.com/v1/rentals/units/${encodeURIComponent(uid)}`, { headers: BH });
      if (!ru.ok) return j(headers, 502, { error: "buildium_failed", message: "Buildium didn't answer for that unit." });
      const u = await ru.json();
      let listing: Record<string, unknown> | null = null;
      const rl = await fetch(`https://api.buildium.com/v1/rentals/units/${encodeURIComponent(uid)}/listing`, { headers: BH });
      if (rl.ok) {
        const L = await rl.json();
        listing = {
          rent: L.Rent ?? null,
          deposit: L.Deposit ?? null,
          availableDate: L.AvailableDate ?? null,
          leaseTerms: L.LeaseTerms ?? null,
          contactId: L?.Contact?.Id ?? null,
          listingDate: L.ListingDate ?? null,
          // bed / bath / sqft off the unit record for the apply-step hint
          // (Brittany 2026-09-23)
          bedrooms: u.UnitBedrooms ?? null,
          bathrooms: u.UnitBathrooms ?? null,
          squareFeet: u.UnitSize ?? null,
        };
      }
      // sticky-header extras (Brittany 2026-08-26): previous lease rent from real
      // lease history (same rule as the listing action: never MarketRent), pending
      // application tasks from Asana, and the Buildium manager link parts
      let previousRent: number | null = null;
      try {
        const lr2 = await fetch(`https://api.buildium.com/v1/leases?propertyids=${encodeURIComponent(String(u.PropertyId ?? ""))}&limit=500`, { headers: BH });
        if (lr2.ok) {
          const leases2 = await lr2.json().catch(() => []);
          const rents2 = (Array.isArray(leases2) ? leases2 : [])
            .filter((l: { UnitId?: number }) => String(l?.UnitId ?? "") === String(uid))
            .map((l: { LeaseFromDate?: string; AccountDetails?: { Rent?: number | { Amount?: number } } }) => {
              const r0 = l?.AccountDetails?.Rent;
              const amt = typeof r0 === "number" ? r0 : (typeof (r0 as { Amount?: number })?.Amount === "number" ? (r0 as { Amount: number }).Amount : null);
              return { from: String(l?.LeaseFromDate ?? ""), rent: amt };
            })
            .filter((x: { rent: number | null }) => x.rent != null && x.rent > 0)
            .sort((a0: { from: string }, b0: { from: string }) => b0.from.localeCompare(a0.from));
          if (rents2.length) previousRent = rents2[0].rent;
        }
      } catch { /* leases unavailable */ }
      const pendingApps: Array<{ gid: string; name: string; url: string }> = [];
      try {
        const streetNo2 = (address.match(/^\d+/) ?? [""])[0];
        if (streetNo2) {
          const hits2 = await asana("GET", `/workspaces/${WORKSPACE}/typeahead?resource_type=task&query=${encodeURIComponent("PENDING")}&count=20&opt_fields=name,completed`);
          (hits2 ?? []).forEach((t2: { gid: string; name: string; completed?: boolean }) => {
            if (!t2.completed && /^PENDING/i.test(t2.name) && /app/i.test(t2.name) && t2.name.includes(streetNo2)) {
              pendingApps.push({ gid: t2.gid, name: String(t2.name).slice(0, 160), url: `https://app.asana.com/0/0/${t2.gid}` });
            }
          });
        }
      } catch { /* header just omits the pill */ }
      return j(headers, 200, {
        ok: true,
        unitId: uid,
        propertyId: u.PropertyId ?? null,
        buildiumUrl: u.PropertyId ? `https://sagareus.managebuilding.com/manager/app/properties/${u.PropertyId}/units/${uid}/summary` : null,
        previousRent,
        pendingApps,
        beds: bedBathNum(u.UnitBedrooms),
        baths: bedBathNum(u.UnitBathrooms),
        sqft: u.UnitSize ?? null,
        description: String(u.Description ?? ""),
        listed: !!listing,
        listing,
      });
    }

    // ---------- listingPush: apply WAR listing updates to Buildium (description + rent + availability) ----------
    if (action === "listingPush") {
      if (!BUILDIUM_ID || !BUILDIUM_SECRET) return j(headers, 500, { error: "buildium_not_configured" });
      const uid = String(body.unitId ?? "").trim();
      if (!/^\d+$/.test(uid)) return j(headers, 400, { error: "bad_unit_id" });
      const desc = body.description == null ? null : String(body.description).trim();
      const rent = body.rent == null ? null : Number(body.rent);
      const deposit = body.deposit == null ? null : Number(body.deposit);
      const availableDate = body.availableDate == null ? null : String(body.availableDate).trim();
      // the listing's Lease details in Buildium (exec V3 Lease Terms, Brittany 2026-10-24)
      const leaseTerms = body.leaseTerms == null ? null : String(body.leaseTerms).trim().slice(0, 500);
      if (rent != null && (!Number.isFinite(rent) || rent < 100 || rent > 50000)) return j(headers, 400, { error: "bad_rent" });
      if (deposit != null && (!Number.isFinite(deposit) || deposit < 0 || deposit > 100000)) return j(headers, 400, { error: "bad_deposit" });
      if (availableDate != null && !/^\d{4}-\d{2}-\d{2}$/.test(availableDate)) return j(headers, 400, { error: "bad_date" });
      if (desc != null && desc.length > 60000) return j(headers, 400, { error: "desc_too_long" });
      const BH = { "x-buildium-client-id": BUILDIUM_ID, "x-buildium-client-secret": BUILDIUM_SECRET };
      const updated: Record<string, boolean> = { description: false, rent: false, deposit: false, availableDate: false };
      const warnings: string[] = [];
      // Available date FLOOR (team 2026-09-11): never sooner than 21 days after the
      // scheduled move out. Pre-lease units were getting rent ready dates moved up
      // faster than the turn can physically happen; the clamp only ever raises.
      let availEff = availableDate;
      if (availEff != null) {
        try {
          const idxA = await moveOutIndex();
          const moA = idxA.byUid[uid] ?? "";
          if (/^\d{4}-\d{2}-\d{2}$/.test(moA)) {
            const floorA = new Date(Date.parse(moA + "T12:00:00Z") + 21 * 86400000).toISOString().slice(0, 10);
            if (availEff < floorA) {
              warnings.push(`Available date raised to ${floorA}: it can never be sooner than 21 days after the ${moA} move out.`);
              availEff = floorA;
            }
          }
        } catch { /* no move-out on file: the requested date stands */ }
      }
      if (desc != null && desc.length >= 40) {
        const r0 = await fetch(`https://api.buildium.com/v1/rentals/units/${encodeURIComponent(uid)}`, { headers: BH });
        if (!r0.ok) return j(headers, 502, { error: "buildium_failed", message: "Buildium didn't answer for that unit." });
        const u = await r0.json();
        const r1 = await fetch(`https://api.buildium.com/v1/rentals/units/${encodeURIComponent(uid)}`, {
          method: "PUT",
          headers: { ...BH, "Content-Type": "application/json" },
          body: JSON.stringify({
            UnitNumber: u.UnitNumber, UnitSize: u.UnitSize, MarketRent: u.MarketRent, Address: u.Address,
            UnitBedrooms: u.UnitBedrooms, UnitBathrooms: u.UnitBathrooms, Description: desc,
          }),
        });
        if (!r1.ok) {
          const et = await r1.text().catch(() => "");
          return j(headers, 502, { error: "desc_failed", message: `Buildium rejected the description update (${r1.status}). ${et.slice(0, 160)}` });
        }
        updated.description = true;
      }
      if (rent != null || availableDate != null || deposit != null || leaseTerms != null) {
        const rl = await fetch(`https://api.buildium.com/v1/rentals/units/${encodeURIComponent(uid)}/listing`, { headers: BH });
        if (rl.status === 404) {
          warnings.push("No active Buildium listing on this unit; rent, deposit, availability, and lease terms were not changed.");
        } else if (!rl.ok) {
          warnings.push("Could not read the current listing; rent, deposit, availability, and lease terms were not changed.");
        } else {
          const L = await rl.json();
          const putBody: Record<string, unknown> = {
            Rent: rent != null ? rent : L.Rent,
            // deposit follows a rent change (Brittany 2026-08-26): the caller sends
            // the recomputed deposit alongside the new rent
            Deposit: deposit != null ? deposit : L.Deposit,
            AvailableDate: availEff != null ? availEff : L.AvailableDate,
            LeaseTerms: leaseTerms != null ? leaseTerms : L.LeaseTerms,
          };
          if (L?.Contact?.Id != null) putBody.ContactId = L.Contact.Id;
          const r2 = await fetch(`https://api.buildium.com/v1/rentals/units/${encodeURIComponent(uid)}/listing`, {
            method: "PUT",
            headers: { ...BH, "Content-Type": "application/json" },
            body: JSON.stringify(putBody),
          });
          if (!r2.ok) {
            const et = await r2.text().catch(() => "");
            return j(headers, 502, { error: "listing_failed", message: `Buildium rejected the listing update (${r2.status}). ${et.slice(0, 200)}`, updated, warnings });
          }
          if (rent != null) updated.rent = true;
          if (deposit != null) updated.deposit = true;
          if (availableDate != null) updated.availableDate = true;
          if (leaseTerms != null) updated.leaseTerms = true;
        }
      }
      return j(headers, 200, { ok: true, updated, warnings, availableDateApplied: availEff ?? null });
    }

    // ---------- warComments: draft the Agent Comments for a weekly leasing report ----------
    // ---------- amenDraft: Amenity Listing Description (Brittany 2026-10-23) ----------
    // Unit / Property Settings are written for ops; this rewrites them for renters as
    // one short line per amenity. The bench falls back to a plain rule-based draft.
    if (action === "amenDraft") {
      if (!TEAM_KEY || c.req.header("x-sv-key") !== TEAM_KEY) return j(headers, 401, { error: "bad_key" });
      const OR_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
      if (!OR_KEY) return j(headers, 500, { error: "llm_not_configured" });
      const it = (body.items && typeof body.items === "object") ? body.items as Record<string, unknown> : {};
      const v = (k: string) => String(it[k] ?? "").replace(/\s+/g, " ").trim().slice(0, 400);
      const facts = [
        ["Laundry", v("laundry")], ["Parking", v("parking") + (v("parkingSpaces") ? ` (spaces: ${v("parkingSpaces")})` : "")],
        ["Storage", v("storage")], ["Mailbox", v("mailbox")], ["Heating", v("heating")], ["Cooling", v("cooling")],
        ["EV Charger", v("ev")], ["Security System", v("security")], ["Landscaping", v("landscaping")],
      ].map(([k, x]) => `${k}: ${x || "(nothing on file)"}`).join("\n");
      // JSON with a fixed key per item: free-form lines let the model drop items at will
      // (tests 2026-10-23 stopped after Parking); the labels and order are set here
      const KEYS: [string, string][] = [["laundry", "Laundry"], ["parking", "Parking"], ["storage", "Storage"], ["mailbox", "Mailbox"],
        ["heatingCooling", "Heating / Cooling"], ["ev", "EV Charger"], ["security", "Security System"], ["landscaping", "Landscaping"]];
      const SYSTEM = [
        "You write the Amenities section of a rental listing for Sagareus Property Management, read by prospective renters.",
        "The input is internal property notes written for the operations team. Rewrite each item for a renter: plain, accurate, specific, short.",
        "Drop details a renter should not see: account numbers, codes, combinations, key locations, vendor or utility company names, internal instructions, staff notes, and 'see lease' style references. Keep the useful fact behind them.",
        "Never invent features. Use an empty string only when the item says nothing on file, none, n/a, or no, EXCEPT these five, which always get a value so prospects never have to ask: laundry, parking, and ev (when there is none or nothing on file: exactly 'None'), storage (when there is none or nothing on file: exactly 'In-unit closets only'), and heatingCooling (describe what exists, for example 'Electric wall heaters; no air conditioning').",
        "mailbox always gets a value and only says where mail is: exactly 'Onsite' when the mailbox is anywhere on the property (unit door slot, building or cluster box, curbside box) or when the notes are blank or unknown; only when mail is clearly off the property (PO box, post office, a cluster box down the street) write a short phrase saying where. Never mention keys, box numbers, or how the box is built.",
        "Each value is one short fragment, 12 words max, with no trailing period. Never repeat the label or its words in the value (Landscaping: 'Resident responsible', not 'Resident responsible for landscaping'; Laundry: 'In-unit stackable washer and dryer'). Plain text, never an em dash. Describe the property, never the people (fair housing).",
        "Return ONLY a JSON object with exactly these keys: " + KEYS.map((k) => k[0]).join(", ") + ".",
      ].join("\n");
      const USER = `Property: ${String(body.address ?? "").slice(0, 140)}\n\nINTERNAL NOTES:\n${facts}`;
      for (const model of ["anthropic/claude-sonnet-5", "anthropic/claude-sonnet-4.5", "anthropic/claude-3.7-sonnet"]) {
        try {
          const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${OR_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model, max_tokens: 500, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: USER }] }),
          });
          const jr = await r.json().catch(() => ({}));
          const text = String(jr?.choices?.[0]?.message?.content ?? "");
          const m = text.match(/\{[\s\S]*\}/);
          if (!r.ok || !m) continue;
          let o: Record<string, unknown> = {};
          try { o = JSON.parse(m[0]); } catch { continue; }
          const out = KEYS.map(([k, label]) => {
            const val = String(o[k] ?? "").replace(/\*\*/g, "").replace(/(\d)\s*[\u2014\u2013]\s*(\d)/g, "$1 to $2").replace(/\s*[\u2014\u2013]\s*/g, ", ").replace(/\s+/g, " ").trim();
            return val ? `${label}: ${val.replace(/[.\s]+$/, "")}` : "";
          }).filter(Boolean).join("\n");
          if (out) return j(headers, 200, { ok: true, text: out, model });
        } catch { /* next model */ }
      }
      return j(headers, 502, { error: "llm_failed", message: "Drafting is unavailable right now; the bench used the plain draft." });
    }

    if (action === "warComments") {
      const OR_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
      if (!OR_KEY) return j(headers, 500, { error: "llm_not_configured" });
      const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
      const arr = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean).slice(0, 20) : []);
      // Polish mode (Brittany, 2026-07-22): the agent writes their own comment first
      // (widget gates the button on 12+ words); the model revises THEIR words instead
      // of drafting from the report data, which just repeated the report in paragraphs.
      const draft = String(body.draft ?? "").trim().slice(0, 4000);
      const ctx0 = String(body.context ?? "");
      // Execute + Adapt V3 owner update clean up (Brittany 2026-10-23): the agent's
      // notes and the Turn Over task comments are internal shorthand; this rewrites
      // them for the owner. Facts only from the source text.
      if (ctx0 === "ownerActivity" || ctx0 === "ownerTurnover") {
        if ((draft.match(/\S+/g) ?? []).length < 4) return j(headers, 400, { error: "draft_too_short", message: "Nothing to clean up yet." });
        const isTurnU = ctx0 === "ownerTurnover";
        const statusU = String(body.status ?? "").slice(0, 60);
        const SYS_U = [
          isTurnU
            ? "You clean up the TURNOVER UPDATES section of a weekly update email that Sagareus Property Management sends to a property owner. The source is internal comments from the Turn Over task: coordinators, vendors, inspectors."
            : "You clean up the THIS WEEK'S ACTIVITY section of a weekly update email that Sagareus Property Management sends to a property owner. The source is the leasing agent's internal notes and prospect feedback.",
          `Unit status this week: ${statusU || "unknown"}. Write for that status; drop notes that only made sense before it (for example prospect showing feedback once the lease is signed).`,
          "Keep every fact that matters to the owner: work done, dates, what is next. Never add facts, costs, dates, or promises that are not in the source, and no opening or closing framing sentences (no \"we are actively marketing\", no \"we will keep you posted\"): every sentence must come from something in the source.",
          "Remove internal-only material: @mentions, staff initials and first names, task assignment chatter, internal links, and duplicate or superseded notes. Site visit checklists are reported separately in the email; drop them.",
          "Voice: we / our team, professional, direct, steady. No investor jargon.",
          isTurnU
            ? "Format: one short line per update, oldest to newest, each starting with \"• \" and the date as M/D when the source has one (\"• 10/19: Cleaning completed.\"). Merge updates that say the same thing."
            : "Format: 1 to 4 short sentences of plain prose, or \"• \" bullet lines if the source is a list.",
          "Under 150 words. Plain text only: no markdown, no headings, no emojis, never an em dash.",
          "OUTPUT: the cleaned section text only. No heading, no preamble.",
        ].join("\n");
        const USER_U = `PROPERTY: ${String(body.address ?? "").slice(0, 120)}\n\nSOURCE TEXT:\n${draft}`;
        for (const model of ["anthropic/claude-sonnet-5", "anthropic/claude-sonnet-4.5", "anthropic/claude-3.7-sonnet"]) {
          try {
            const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
              method: "POST",
              headers: { "Authorization": `Bearer ${OR_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({ model, max_tokens: 600, messages: [{ role: "system", content: SYS_U }, { role: "user", content: USER_U }] }),
            });
            const jr = await r.json().catch(() => ({}));
            const text = jr?.choices?.[0]?.message?.content;
            if (r.ok && text) {
              const cNoDash = String(text).replace(/(\d)\s*[\u2014\u2013]\s*(\d)/g, "$1 to $2").replace(/\s*[\u2014\u2013]\s*/g, ", ");
              return j(headers, 200, { comments: cNoDash.replace(/\*\*/g, "").trim(), model });
            }
          } catch { /* try next model */ }
        }
        return j(headers, 502, { error: "llm_failed", message: "Clean up is unavailable right now. Edit the text by hand." });
      }
      if ((draft.match(/\S+/g) ?? []).length < 12) {
        return j(headers, 400, { error: "draft_too_short", message: "Write at least 12 words of your own comment first, then polish." });
      }
      const ctx = String(body.context ?? "");
      const isPre = ctx === "prelisting";
      const isProposal = ctx === "proposal";
      // turnover: the Agent Note on the Plan bench's Turn Over Plan (feedback
      // 1219328556082433), shown to the owner on the Leasing Plan page
      const isTurn = ctx === "turnover";
      const facts = isTurn ? [
        `Property: ${String(body.address ?? "").slice(0, 120)}`,
        arr(body.turnItems).length ? `Turn over work items already listed on the plan: ${arr(body.turnItems).join("; ")}` : "",
      ].filter(Boolean).join("\n") : isProposal ? [
        `Property: ${String(body.address ?? "").slice(0, 120)}`,
        body.marketRent != null ? `Verified market rent going on the proposal: $${n(body.marketRent)}/mo.` : "",
        body.marketPosition ? `Market position: ${String(body.marketPosition).slice(0, 240)}` : "",
      ].filter(Boolean).join("\n") : isPre ? [
        `Property: ${String(body.address ?? "").slice(0, 120)}`,
        body.marketRent != null ? `Estimated market rent from comps: $${n(body.marketRent)}/mo.` : "",
        body.marketPosition ? `Market position: ${String(body.marketPosition).slice(0, 240)}` : "",
      ].filter(Boolean).join("\n") : [
        `Property: ${String(body.address ?? "").slice(0, 120)}`,
        `This week: ${n(body.inquiries)} inquiries, ${n(body.showings)} showings, ${n(body.applications)} applications.`,
        body.daysOnMarket != null ? `Days on market: ${n(body.daysOnMarket)}.` : "",
        body.marketRent != null ? `Estimated market rent from comps: $${n(body.marketRent)}/mo.` : "",
        arr(body.priceHistory).length ? `Price history: ${arr(body.priceHistory).join("; ")}` : "",
        arr(body.feedback).length ? `Prospect feedback: ${arr(body.feedback).join("; ")}` : "Prospect feedback: none recorded this week.",
        arr(body.updates).length ? `Listing updates made this week: ${arr(body.updates).join("; ")}` : "Listing updates made this week: none.",
        arr(body.recommendations).length ? `Recommendations going to the owner: ${arr(body.recommendations).join("; ")}` : "",
      ].filter(Boolean).join("\n");
      const SYSTEM = [
        isTurn
          ? "You polish the AGENT NOTE a Sagareus leasing agent wrote on the Turn Over Plan of an owner's leasing plan page. It sits under the list of make-ready work items and covers special requests or context about the turn over."
          : isProposal
          ? "You polish the NOTES FROM OUR TEAM a Sagareus biz dev agent wrote for a property management proposal that goes to a PROSPECTIVE owner deciding whether to sign. It sits directly under the rent analysis on the proposal."
          : isPre
          ? "You polish the AGENT COMMENTS a Sagareus leasing agent wrote for a PreListing report that goes to a property owner before their unit is listed."
          : "You polish the AGENT COMMENTS a Sagareus leasing agent wrote for the weekly activity report that goes to a property owner.",
        "The agent's draft is the source of truth: keep every fact, observation, and intention they wrote, and keep their first-person voice. Fix grammar, spelling, and clarity; tighten rambling; make the tone professional, direct, steady.",
        isTurn
          ? "Do not add information the agent did not write. The work items already appear on the plan above the note (given to you as context); never pad the note by reciting them. Never promise costs, dates, or outcomes the agent did not state."
          : isProposal
          ? "Do not add information the agent did not write. The verified rent, market range, and comparables already appear on the proposal above the note (given to you as context) — never pad the note by reciting them. Only pull a specific from context when the agent's draft clearly alludes to it and needs it to make sense. Never promise outcomes; keep any pricing talk consistent with the verified rent."
          : isPre
          ? "Do not add information the agent did not write. The rent estimate, comps, and strategy already appear in the report above the comments (given to you as context) — never pad the comment by reciting them. Only pull a specific from context when the agent's draft clearly alludes to it and needs it to make sense."
          : "Do not add information the agent did not write. The week's numbers, feedback, and updates already appear in the report above the comments (given to you as context) — never pad the comment by reciting them. Only pull a specific from context when the agent's draft clearly alludes to it and needs it to make sense.",
        "Length: roughly the agent's length, 2 to 5 sentences, 90 words max. Plain text only: no markdown, no bullets, no emojis, never an em dash.",
        "If the draft clearly implies a next step, sharpen the final sentence into it; otherwise keep the agent's ending.",
        "OUTPUT: the polished comment only. No heading, no preamble, nothing after.",
      ].join("\n");
      const USER = `AGENT'S DRAFT COMMENT:\n${draft}\n\nREPORT CONTEXT (already shown in the report; do not recite):\n${facts}`;
      for (const model of ["anthropic/claude-sonnet-5", "anthropic/claude-sonnet-4.5", "anthropic/claude-3.7-sonnet"]) {
        try {
          const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${OR_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model, max_tokens: 300, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: USER }] }),
          });
          const jr = await r.json().catch(() => ({}));
          const text = jr?.choices?.[0]?.message?.content;
          if (r.ok && text) {
            // same no-dash house rule as draftCopy: this text reaches owners
            const cNoDash = String(text)
              .replace(/(\d)\s*[\u2014\u2013]\s*(\d)/g, "$1 to $2")
              .replace(/\s*[\u2014\u2013]\s*/g, ", ");
            return j(headers, 200, { comments: cNoDash.replace(/\*\*/g, "").trim(), model });
          }
        } catch { /* try next model */ }
      }
      return j(headers, 502, { error: "llm_failed", message: "Polishing is unavailable right now. Your comment is fine to send as written." });
    }

    // ---------- postListing: push the draft listing text to the Buildium unit record ----------
    // Deliberately updates ONLY the unit Description. Creating/updating the listing itself
    // (rent, deposit, dates) stays with the Go Live step so nothing syndicates by accident.
    // ---------- listingQueue: workbench step 0 ----------
    // Two sources (Brittany 2026-08-17): the Listing Adjustments section of Listing
    // Settings (owner modification requests land there), and Prepare | BD Listing
    // subtasks (LU task -> Leasing task, Leasing | robot project) due within 30 days.
    if (action === "listingQueue") {
      const UNIT_F2 = "1213183515622826";
      // Move Out Date joins each row by Unit ID (team 2026-09-18)
      const idxQ = await moveOutIndex().catch(() => ({ byUid: {} as Record<string, string>, byAddr: {} as Record<string, string>, uidByAddr: {} as Record<string, string>, doneByUid: {} as Record<string, string>, doneByAddr: {} as Record<string, string>, masterByUid: {} as Record<string, string>, moProjByUid: {} as Record<string, string>, moProjByAddr: {} as Record<string, string> }));
      const ADJ_SECTION = "1217553095980495";
      const uidOf = (cfs: Array<{ gid: string; display_value: string | null }> | undefined) =>
        String((cfs ?? []).find((f) => f.gid === UNIT_F2)?.display_value ?? "").trim();
      const adjustments: Array<Record<string, unknown>> = [];
      const prepare: Array<Record<string, unknown>> = [];
      try {
        const ra = await fetch(`${ASANA}/sections/${ADJ_SECTION}/tasks?completed_since=now&limit=50&opt_fields=name,due_on,notes,parent.gid,custom_fields.gid,custom_fields.display_value`,
          { headers: { "Authorization": `Bearer ${ASANA_PAT}` } });
        const ja = await ra.json().catch(() => ({}));
        for (const t of (ja.data ?? []) as Array<{ gid: string; name: string; due_on?: string | null; notes?: string; parent?: { gid: string } | null; custom_fields?: Array<{ gid: string; display_value: string | null }> }>) {
          let aUid = uidOf(t.custom_fields);
          if (!aUid && t.parent?.gid) {
            // Modify tasks carry no Unit ID; walk up to the parent Listing task (Unit ID only, never addresses)
            try {
              const pt9 = await asana("GET", `/tasks/${t.parent.gid}?opt_fields=custom_fields.gid,custom_fields.display_value`);
              aUid = uidOf(pt9.custom_fields);
            } catch { /* best-effort */ }
          }
          adjustments.push({
            gid: t.gid,
            name: String(t.name ?? "").slice(0, 140),
            due: String(t.due_on ?? ""),
            moveOut: idxQ.byUid[aUid] ?? "",
            unitId: aUid,
            preview: String(t.notes ?? "").split(/\r?\n/).find((l) => l.trim()) ?? "",
            url: `https://app.asana.com/0/0/${t.gid}`,
          });
        }
      } catch { /* best-effort */ }
      try {
        // week-slice the search window: the text match is fuzzy and capped at 100, so a
        // single 6-week query lets near-matches crowd out real Prepare tasks.
        type PrepHit = { gid: string; name: string; due_on?: string | null; parent?: { gid: string; name: string } | null };
        const preps: PrepHit[] = [];
        const seenP = new Set<string>();
        for (let w = -2; w < 5; w++) {
          const from = new Date(Date.now() + w * 7 * 86400000).toISOString().slice(0, 10);
          const to = new Date(Date.now() + (w + 1) * 7 * 86400000).toISOString().slice(0, 10);
          // projects.any scopes the fuzzy text match to leasing (subtasks inherit the
          // parent's project in search) - without it the workspace-wide noise fills
          // the 100-hit cap and real Prepare tasks get crowded out (472496, 2026-08-28)
          // both generations feed the workbench queue: the combined
          // "Send | Leasing Plan" (2026-09-24) and the old "Prepare | BD Listing"
          for (const q0 of ["Send | Leasing Plan", "Prepare | BD Listing"]) {
            const rs = await fetch(`${ASANA}/workspaces/${WORKSPACE}/tasks/search?projects.any=${LEASING_LU_PROJECT}&text=${encodeURIComponent(q0)}&completed=false&due_on.after=${from}&due_on.before=${to}&sort_by=due_date&sort_ascending=true&limit=100&opt_fields=name,due_on,parent.gid,parent.name`,
              { headers: { "Authorization": `Bearer ${ASANA_PAT}` } });
            const js = await rs.json().catch(() => ({}));
            for (const t of (js.data ?? []) as PrepHit[]) {
              if (!/^send\s*\|\s*leasing\s*plan/i.test(String(t.name)) && !/^prepare\s*\|\s*bd\s*listing/i.test(String(t.name))) continue;
              if (/[<>]/.test(String(t.parent?.name ?? ""))) continue;  // template artifacts like "LU | <address>"
              if (seenP.has(t.gid)) continue;
              seenP.add(t.gid);
              preps.push(t);
            }
          }
        }
        for (const t of preps.slice(0, 20)) {
          const pname = String(t.parent?.name ?? "");
          const addr2 = (pname.replace(/^[a-z]+\s*\|\s*/i, "").trim() || String(t.name)).slice(0, 120);
          // Unit ID ONLY, never addresses (Brittany 2026-08-17): walk the task chain
          // Prepare -> parent LU -> parent Leasing task, which carries the Unit ID field.
          let unitId = "";
          if (t.parent?.gid) {
            try {
              const pt = await asana("GET", `/tasks/${t.parent.gid}?opt_fields=parent.gid,custom_fields.gid,custom_fields.display_value`);
              unitId = uidOf(pt.custom_fields);
              if (!unitId && pt.parent?.gid) {
                const gt = await asana("GET", `/tasks/${pt.parent.gid}?opt_fields=custom_fields.gid,custom_fields.display_value`);
                unitId = uidOf(gt.custom_fields);
              }
            } catch { /* best-effort */ }
          }
          prepare.push({
            gid: t.gid,
            address: addr2,
            due: String(t.due_on ?? ""),
            moveOut: idxQ.byUid[unitId] ?? "",
            unitId,
            url: `https://app.asana.com/0/0/${t.gid}`,
          });
        }
      } catch { /* best-effort */ }
      prepare.sort((a, b) => String(a.due).localeCompare(String(b.due)));
      // Sent, awaiting approval (Brittany 2026-08-28): plans pushed to owners with
      // Plan Status still Sent/Revised. Sent date = the rnState 'd' the push stamped.
      const sentPlans: Array<Record<string, unknown>> = [];
      try {
        const PS_F2 = "1217569409567702", RN_F2 = "1217569237386930";
        let offS = "";
        for (let pg = 0; pg < 15; pg++) {
          const rS = await fetch(`${ASANA}/projects/1217446710785429/tasks?limit=100&opt_fields=name,custom_fields.gid,custom_fields.display_value${offS ? `&offset=${encodeURIComponent(offS)}` : ""}`,
            { headers: { "Authorization": `Bearer ${ASANA_PAT}` } });
          const jS = await rS.json().catch(() => ({}));
          for (const t of (jS.data ?? []) as Array<{ gid: string; name: string; custom_fields?: Array<{ gid: string; display_value: string | null }> }>) {
            const cfS = t.custom_fields ?? [];
            const ps = String(cfS.find((f) => f.gid === PS_F2)?.display_value ?? "").trim();
            if (ps !== "Sent" && ps !== "Revised") continue;
            let sentOn = "";
            try { sentOn = String(JSON.parse(String(cfS.find((f) => f.gid === RN_F2)?.display_value ?? "") || "{}")?.d ?? ""); } catch { /* undated */ }
            // slug off the Leasing Plan URL so the bench can team-approve in place
            const lpUrl = String(cfS.find((f) => f.gid === "1217557090620385")?.display_value ?? "");
            const slugS = (lpUrl.match(/[?&]p=([\w-]+)/) ?? [])[1] ?? "";
            sentPlans.push({
              gid: t.gid,
              url: `https://app.asana.com/0/0/${t.gid}`,
              address: String(t.name).replace(/^listing\s*\|\s*/i, "").trim(),
              unitId: uidOf(cfS),
              status: ps,
              slug: slugS,
              sentOn: /^\d{4}-\d{2}-\d{2}$/.test(sentOn) ? sentOn : null,
            });
          }
          offS = jS.next_page?.offset ?? "";
          if (!offS) break;
        }
        // oldest first: the most-ignored plan tops the list
        sentPlans.sort((a, b) => String(a.sentOn ?? "0000").localeCompare(String(b.sentOn ?? "0000")));
      } catch { /* section renders empty */ }
      return j(headers, 200, { ok: true, adjustments, prepare, sentPlans });
    }

    // ---------- setUnitSettings: write edited facts back to the Unit Settings task ----------
    if (action === "setUnitSettings") {
      const sg = String(body.settingsGid ?? "").replace(/\D/g, "");
      if (!sg) return j(headers, 400, { error: "missing_settings_gid" });
      const fields = (body.fields ?? {}) as Record<string, { type?: string; value?: unknown; onProperty?: boolean }>;
      // Parking Type / Storage Type live on the property task (2026-10-13): those
      // fields save to propertyGid, which must be a Property Settings task
      let pg = String(body.propertyGid ?? "").replace(/\D/g, "");
      if (pg && pg !== sg) {
        try {
          const pt = await asana("GET", `/tasks/${pg}?opt_fields=projects.gid`);
          if (!(pt.projects ?? []).some((p: { gid: string }) => p.gid === PROPERTY_SETTINGS_PROJECT)) pg = "";
        } catch { pg = ""; }
      }
      const target: Record<string, string> = {};
      const cfU: Record<string, unknown> = {};
      for (const [gid, spec] of Object.entries(fields)) {
        if (!/^\d+$/.test(gid)) continue;
        target[gid] = spec?.onProperty && pg ? pg : sg;
        const ty = String(spec?.type ?? "text");
        if (ty === "enum") {
          const og = String(spec?.value ?? "").replace(/\D/g, "");
          cfU[gid] = og || null;
        } else if (ty === "multi_enum") {
          cfU[gid] = (Array.isArray(spec?.value) ? spec.value : []).map((v: unknown) => String(v).replace(/\D/g, "")).filter(Boolean);
        } else {
          cfU[gid] = String(spec?.value ?? "").slice(0, 2000);
        }
      }
      if (!Object.keys(cfU).length) return j(headers, 400, { error: "no_fields" });
      // one field per request: a field the task does not carry rejects the WHOLE
      // batch ("not on given object"), which used to lose every other edit silently
      // (Brittany 2026-08-22)
      const savedF: string[] = [];
      const failedF: string[] = [];
      for (const [gidF, val] of Object.entries(cfU)) {
        try {
          await asana("PUT", `/tasks/${target[gidF] || sg}`, { custom_fields: { [gidF]: val } });
          savedF.push(gidF);
        } catch { failedF.push(gidF); }
      }
      // no comments on Unit or Property Settings tasks (Brittany 2026-08-17)
      if (!savedF.length) return j(headers, 502, { error: "asana_failed", message: "Asana rejected every field. Check the Settings task." });
      return j(headers, 200, { ok: true, saved: savedF, failed: failedF });
    }

    // ---------- setAmenities: write the UNIT amenity checkboxes back to Buildium ----------
    // Two-way per Brittany 2026-08-17: the workbench can add missing amenities. Unit
    // scope only; property-level checkboxes stay read-only.
    if (action === "setAmenities") {
      if (!BUILDIUM_ID || !BUILDIUM_SECRET) return j(headers, 500, { error: "buildium_not_configured" });
      const uid = String(body.unitId ?? "").trim();
      if (!/^\d+$/.test(uid)) return j(headers, 400, { error: "bad_unit_id" });
      const feats = (Array.isArray(body.features) ? body.features : [])
        .map((f: unknown) => String(f).trim())
        .filter((f: string) => /^[A-Za-z0-9_]{2,60}$/.test(f))
        .slice(0, 100);
      const BH = { "x-buildium-client-id": BUILDIUM_ID, "x-buildium-client-secret": BUILDIUM_SECRET, "Content-Type": "application/json" };
      const cur = await fetch(`https://api.buildium.com/v1/rentals/units/${encodeURIComponent(uid)}/amenities`, { headers: BH });
      const curJ = cur.ok ? await cur.json().catch(() => ({} as Record<string, unknown>)) : {};
      const put = await fetch(`https://api.buildium.com/v1/rentals/units/${encodeURIComponent(uid)}/amenities`, {
        method: "PUT", headers: BH,
        body: JSON.stringify({ Features: feats, IncludedInRent: (curJ as Record<string, unknown>).IncludedInRent ?? [] }),
      });
      if (!put.ok) {
        const msg = await put.text().catch(() => "");
        return j(headers, 502, { error: "buildium_rejected", message: ("Buildium rejected the update: " + msg).slice(0, 300) });
      }
      const after = await fetch(`https://api.buildium.com/v1/rentals/units/${encodeURIComponent(uid)}/amenities`, { headers: BH });
      const aj = after.ok ? await after.json().catch(() => ({} as Record<string, unknown>)) : {};
      return j(headers, 200, { ok: true, features: Array.isArray((aj as Record<string, unknown>).Features) ? (aj as Record<string, unknown>).Features : feats });
    }

    // ---------- inspectFiles: newest inspection PDF from the Buildium UNIT file section ----------
    // Inspection reports live on the unit profile: not the lease, not the property (Brittany 2026-08-17).
    if (action === "inspectFiles") {
      if (!BUILDIUM_ID || !BUILDIUM_SECRET) return j(headers, 500, { error: "buildium_not_configured" });
      const uid = String(body.unitId ?? "").trim();
      if (!/^\d+$/.test(uid)) return j(headers, 400, { error: "bad_unit_id", message: "Populate from a Unit ID first." });
      const BH = { "x-buildium-client-id": BUILDIUM_ID, "x-buildium-client-secret": BUILDIUM_SECRET };
      const fr = await fetch(`https://api.buildium.com/v1/files?entitytype=RentalUnit&entityid=${encodeURIComponent(uid)}&limit=200`, { headers: BH });
      if (!fr.ok) return j(headers, 502, { error: "buildium_failed", message: "Buildium didn't answer; paste the link by hand." });
      const files = await fr.json().catch(() => []);
      const cand = (Array.isArray(files) ? files : [])
        .map((f: Record<string, unknown>) => ({
          id: f.Id,
          name: String(f.Title ?? f.FileName ?? f.Name ?? ""),
          uploaded: String(f.UploadedDateTime ?? ""),
          ct: String(f.ContentType ?? ""),
        }))
        .filter((f) => /inspect/i.test(f.name) && (/pdf/i.test(f.ct) || /\.pdf$/i.test(f.name) || !f.ct));
      cand.sort((a, b) => b.uploaded.localeCompare(a.uploaded));
      // kind=recent: newest ANNUAL inspection only; anything else (incl. move-in)
      // never fills this field (Brittany 2026-08-21, after a move-in bled into both).
      // Default: MOVE-IN inspection only, never the newest of any kind (Brittany 2026-08-21)
      // preview link: a fresh (expiring) download URL for the found file, so the
      // agent can eyeball the PDF before pushing (Brittany 2026-08-21)
      const previewUrl = async (f: { id: unknown } | null): Promise<string> => {
        if (!f) return "";
        try {
          const dl = await fetch(`https://api.buildium.com/v1/files/${encodeURIComponent(String(f.id))}/downloadrequest`, { method: "POST", headers: BH });
          if (!dl.ok) return "";
          const dj = await dl.json().catch(() => ({} as Record<string, unknown>));
          return String((dj as Record<string, unknown>).DownloadUrl ?? (dj as Record<string, unknown>).DownloadURL ?? "");
        } catch { return ""; }
      };
      if (String(body.kind ?? "") === "recent") {
        const annual = cand.filter((f) => /annual/i.test(f.name));
        const hitR = annual[0] ?? null;
        return j(headers, 200, { ok: true, found: !!hitR, file: hitR, count: annual.length, url: await previewUrl(hitR) });
      }
      const movein = cand.filter((f) => /move.?in/i.test(f.name));
      const hit2 = movein[0] ?? null;
      return j(headers, 200, { ok: true, found: !!hit2, file: hit2, count: movein.length, otherInspections: cand.length - movein.length, url: await previewUrl(hit2) });
    }

    // ---------- utilCompSearch: find comparable properties for the utility calculators
    // (Brittany 2026-08-21). Comparable = same city (utility providers are municipal,
    // so city is the provider proxy), has a unit with the same bedroom count, and has
    // utility bills on file in the last year.
    // ---------- lsAssign: Leasing Team Lead / Leasing Agent / Turn Over Coordinator
    // people fields on the Listing Settings task (Brittany 2026-08-21)
    // ---------- lsReset: clear the plan from Listing Settings (Brittany 2026-08-21):
    // comps data, rents, target dates. Workbench clears its own local state.
    if (action === "teamUsers") {
      return j(headers, 200, { ok: true, teamUsers: await workspaceUsers().catch(() => []) });
    }

    // ---------- workload: who is assigned on active Listing Settings ----------
    // (Brittany 2026-10-21) Plan bench Assignments card, to balance who gets the
    // next listing. Source of truth = the Listing Settings people fields (Team
    // Lead, Leasing Agent, Turn Over Coordinator), not task assignees. Active =
    // the unit still has an open LU / TP / PreLease task in Leasing | LU
    // (matched on Unit ID), so leased-out Listing Settings tasks drop off.
    // Read-only.
    if (action === "workload") {
      const LSP_W = "1217446710785429";
      const UID_W = "1213183515622826";
      const ROLE_W: Array<[string, "lead" | "agent" | "toc"]> = [["1217446711292696", "lead"], ["1217446729380828", "agent"], ["1217446729380923", "toc"]];
      type CfW = { gid: string; display_value?: string | null; people_value?: Array<{ gid?: string; name?: string }> | null };
      const openTasks = async (proj: string, fields: string) => {
        const out: Array<{ name: string; custom_fields?: CfW[] }> = [];
        let off = "";
        for (let pg = 0; pg < 15; pg++) {
          const r = await fetch(`${ASANA}/projects/${proj}/tasks?completed_since=now&limit=100&opt_fields=${fields}${off ? `&offset=${encodeURIComponent(off)}` : ""}`,
            { headers: { "Authorization": `Bearer ${ASANA_PAT}` } });
          const jw = await r.json().catch(() => ({}));
          out.push(...((jw.data ?? []) as typeof out));
          off = jw.next_page?.offset ?? "";
          if (!off) break;
        }
        return out;
      };
      const [luT, lsT] = await Promise.all([
        openTasks(LEASING_LU_PROJECT, "name,custom_fields.gid,custom_fields.display_value"),
        openTasks(LSP_W, "name,custom_fields.gid,custom_fields.display_value,custom_fields.people_value.gid,custom_fields.people_value.name"),
      ]);
      const uidOf = (t: { custom_fields?: CfW[] }) => String((t.custom_fields ?? []).find((f) => f.gid === UID_W)?.display_value ?? "").trim();
      const activeUids = new Set(luT.filter((t) => /^(LU|TP|PreLease)\s*\|/i.test(String(t.name))).map(uidOf).filter(Boolean));
      const activeLs = lsT.filter((t) => activeUids.has(uidOf(t)));
      const by: Record<string, { gid: string; name: string; lead: number; agent: number; toc: number }> = {};
      for (const t of activeLs) {
        for (const [fg, role] of ROLE_W) {
          const pv = (t.custom_fields ?? []).find((f) => f.gid === fg)?.people_value ?? [];
          const who = pv.length ? pv : [{ gid: "", name: "" }];
          for (const p of who) {
            const g = String(p.gid ?? "") || "none";
            by[g] = by[g] ?? { gid: g === "none" ? "" : g, name: g === "none" ? "Unassigned" : String(p.name ?? ""), lead: 0, agent: 0, toc: 0 };
            by[g][role]++;
          }
        }
      }
      const rows = Object.values(by).sort((a, b) => (a.gid ? 0 : 1) - (b.gid ? 0 : 1) || (b.lead + b.agent + b.toc) - (a.lead + a.agent + a.toc));
      return j(headers, 200, { ok: true, rows, activeListings: activeLs.length, asOf: new Date().toISOString() });
    }

    // ---------- execSetLead: assign a team lead from the bench queue ----------
    // (Brittany 2026-09-18): a No Lead row shows a dropdown; the pick writes the
    // Team Lead person onto the Listing Settings task, CREATING the LS task first
    // when the unit has none (the transition left some units without one).
    if (action === "execSetLead") {
      const uidL = String(body.unitId ?? "").replace(/\D/g, "");
      const addrL = String(body.address ?? "").trim().slice(0, 140);
      const leadGid = String(body.leadGid ?? "").replace(/\D/g, "");
      if (!leadGid || (!uidL && !addrL)) return j(headers, 400, { error: "missing_fields" });
      const LSP = "1217446710785429";
      const UIDF = "1213183515622826";
      const LEADF = "1217446711292696";
      let lsGidL = "";
      if (uidL) {
        try {
          const sH = ((await asana("GET",
            `/workspaces/${WORKSPACE}/tasks/search?projects.any=${LSP}&custom_fields.${UIDF}.value=${uidL}&opt_fields=name`)) ?? []) as Array<{ gid: string }>;
          if (sH[0]) lsGidL = sH[0].gid;
        } catch { /* scan below */ }
        if (!lsGidL) {
          let offL9 = "";
          for (let pg = 0; pg < 15 && !lsGidL; pg++) {
            const r9 = await fetch(`${ASANA}/projects/${LSP}/tasks?limit=100&opt_fields=name,custom_fields.gid,custom_fields.display_value${offL9 ? `&offset=${encodeURIComponent(offL9)}` : ""}`,
              { headers: { "Authorization": `Bearer ${ASANA_PAT}` } });
            const j9 = await r9.json().catch(() => ({}));
            for (const t9 of (j9.data ?? []) as Array<{ gid: string; custom_fields?: Array<{ gid: string; display_value: string | null }> }>) {
              if (String((t9.custom_fields ?? []).find((f) => f.gid === UIDF)?.display_value ?? "").trim() === uidL) { lsGidL = t9.gid; break; }
            }
            offL9 = j9.next_page?.offset ?? "";
            if (!offL9) break;
          }
        }
      }
      let created = false;
      if (!lsGidL) {
        if (!addrL) return j(headers, 404, { error: "no_listing_settings", message: "No Listing Settings task and no address to create one from." });
        const mk = await asana("POST", "/tasks", {
          name: `Listing | ${addrL}`,
          projects: [LSP],
          notes: "Created from the Execute & Adapt bench lead assignment (no Listing Settings task existed for this unit). Done by Claude on behalf of the team lead.",
        });
        lsGidL = mk.gid;
        created = true;
        if (uidL) await asana("PUT", `/tasks/${lsGidL}`, { custom_fields: { [UIDF]: uidL } }).catch(() => null);
      }
      await asana("PUT", `/tasks/${lsGidL}`, { custom_fields: { [LEADF]: [leadGid] } });
      execCache = null; // the lead column changed: next execQueue must re-read
      let leadName = "";
      try { leadName = String((await workspaceUsers()).find((u) => u.gid === leadGid)?.name ?? ""); } catch { /* name from the client */ }
      return j(headers, 200, { ok: true, lsGid: lsGidL, created, leadName, lsUrl: `https://app.asana.com/0/0/${lsGidL}` });
    }

    if (action === "lsReset") {
      const lsGid9 = String(body.lsGid ?? "").replace(/\D/g, "");
      if (!lsGid9) return j(headers, 400, { error: "no_listing_settings" });
      await asana("PUT", `/tasks/${lsGid9}`, { custom_fields: {
        "1217516812648029": "",      // Comps Data
        "1217446658749360": null,    // Target Rent
        "1217446589856415": null,    // Starting Rent
        "1217446710834881": null,    // Min Rent
        "1217530253031654": null,    // Market Rent
        "1217515135889617": null,    // Target List Date
        "1217740384009759": null,    // Target Move In Date
      } });
      await asana("POST", `/tasks/${lsGid9}/stories`, {
        text: "Plan reset from the PreListing Workbench: comps, rents, and target dates cleared. Done by Claude on behalf of the listing agent.",
      }).catch(() => null);
      return j(headers, 200, { ok: true });
    }

    if (action === "lsAssign") {
      const lsGid9 = String(body.lsGid ?? "").replace(/\D/g, "");
      if (!lsGid9) return j(headers, 400, { error: "no_listing_settings", message: "No Listing Settings task yet. Push To Settings first, then save assignments." });
      const FLDS: Array<[string, string]> = [["lead", "1217446711292696"], ["agent", "1217446729380828"], ["toc", "1217446729380923"]];
      // one field at a time: a field missing from the project rejects the whole
      // request, so a single bad role would silently lose the other two
      const okRoles: string[] = [];
      const failRoles: string[] = [];
      for (const [k, gidF] of FLDS) {
        const v = String(body[k] ?? "").replace(/\D/g, "");
        try {
          await asana("PUT", `/tasks/${lsGid9}`, { custom_fields: { [gidF]: v ? [v] : [] } });
          okRoles.push(k);
        } catch { failRoles.push(k); }
      }
      if (!okRoles.length) return j(headers, 502, { error: "assign_failed", message: "Asana rejected every assignment write. Set them on the task by hand." });
      return j(headers, 200, { ok: true, saved: okRoles, failed: failRoles });
    }

    // ---------- ownerSave: write Owner Name / Owner Email back to the open
    // LU / TP / PreLease task (Brittany 2026-08-25). Those two fields power other
    // leasing tools, so the workbench fills them when they come back blank.
    // Field GIDs are resolved off the task itself: never create or attach a field,
    // report it as blocked instead.
    if (action === "ownerSave") {
      const luGidO = String(body.ownerSrcGid ?? "").replace(/\D/g, "");
      if (!luGidO) {
        return j(headers, 400, {
          error: "no_lu_task",
          message: "No open LU / TP / PreLease task for this unit, so there is nowhere to save the owner. Populate from a Unit ID first.",
        });
      }
      const tO = await asana("GET", `/tasks/${luGidO}?opt_fields=name,custom_fields.gid,custom_fields.name,custom_fields.display_value`);
      const cfO = ((tO.custom_fields ?? []) as Array<{ gid: string; name: string; display_value?: string | null }>);
      const findF = (re: RegExp) => String(cfO.find((f) => re.test(String(f.name)))?.gid ?? "");
      const savedO: string[] = [];
      const blockedO: string[] = [];
      const writeOne = async (label: string, gidF: string, val: string) => {
        if (!gidF) { blockedO.push(label + " (field not on the task)"); return; }
        // one field per request: a field missing from the project rejects the whole
        // batch, which would silently lose the other one
        try {
          await asana("PUT", `/tasks/${luGidO}`, { custom_fields: { [gidF]: val } });
          savedO.push(label);
        } catch { blockedO.push(label + " (Asana rejected the write)"); }
      };
      // Tier 2 combine (2026-09-26): both parts land in Owner Contact; a part
      // the bench did not send keeps its current value
      {
        const ocGid = findF(/^owner contact$/i);
        let ocVal = String(cfO.find((f) => f.gid === ocGid)?.display_value ?? "");
        if (body.ownerName !== undefined) ocVal = kvSet(ocVal, "Name", String(body.ownerName ?? "").trim().slice(0, 160), ["Name", "Email"]);
        if (body.ownerEmail !== undefined) ocVal = kvSet(ocVal, "Email", String(body.ownerEmail ?? "").trim().slice(0, 240), ["Name", "Email"]);
        await writeOne("Owner Contact", ocGid, ocVal);
      }
      if (!savedO.length) {
        return j(headers, 502, {
          error: "owner_save_failed",
          message: "Nothing saved: " + (blockedO.join("; ") || "no fields sent") + ". Set them on the task by hand.",
          blocked: blockedO,
        });
      }
      return j(headers, 200, { ok: true, saved: savedO, blocked: blockedO, taskName: String(tO.name ?? "") });
    }

    if (action === "utilCompSearch") {
      if (!BUILDIUM_ID || !BUILDIUM_SECRET) return j(headers, 500, { error: "buildium_not_configured" });
      const uid = String(body.unitId ?? "").trim();
      if (!/^\d+$/.test(uid)) return j(headers, 400, { error: "bad_unit_id", message: "Populate from a Unit ID first." });
      const bh = { "x-buildium-client-id": BUILDIUM_ID, "x-buildium-client-secret": BUILDIUM_SECRET };
      const ur = await fetch(`https://api.buildium.com/v1/rentals/units/${encodeURIComponent(uid)}`, { headers: bh });
      if (!ur.ok) return j(headers, 502, { error: "buildium_failed" });
      const u = await ur.json().catch(() => ({} as Record<string, unknown>));
      const beds = String((u as Record<string, unknown>).UnitBedrooms ?? "");
      const pid = String((u as Record<string, unknown>).PropertyId ?? "");
      if (!pid) return j(headers, 404, { error: "no_property" });
      const pr = await fetch(`https://api.buildium.com/v1/rentals/${encodeURIComponent(pid)}`, { headers: bh });
      const pj = await pr.json().catch(() => ({} as Record<string, unknown>));
      const padr = ((pj as Record<string, unknown>).Address ?? {}) as Record<string, unknown>;
      const city = String(padr.City ?? "").trim().toLowerCase();
      const zip = String(padr.PostalCode ?? "").slice(0, 5);
      if (!city) return j(headers, 404, { error: "no_city" });
      const props: Array<Record<string, unknown>> = [];
      for (let pg = 0; pg < 6; pg++) {
        const rr = await fetch(`https://api.buildium.com/v1/rentals?limit=100&offset=${pg * 100}`, { headers: bh });
        const arr = ((await rr.json().catch(() => [])) as Array<Record<string, unknown>>) ?? [];
        props.push(...arr);
        if (arr.length < 100) break;
      }
      const cands = props.filter((p0) => {
        const a0 = (p0.Address ?? {}) as Record<string, unknown>;
        return String(p0.Id) !== pid && String(a0.City ?? "").trim().toLowerCase() === city;
      }).sort((a0, b0) => {
        const az = String(((a0.Address ?? {}) as Record<string, unknown>).PostalCode ?? "").slice(0, 5) === zip ? 1 : 0;
        const bz = String(((b0.Address ?? {}) as Record<string, unknown>).PostalCode ?? "").slice(0, 5) === zip ? 1 : 0;
        return bz - az;
      });
      const UTS = /util|water|sewer|garbage|electric|\bgas\b|wsg|spu|scl|pse\b|recology|republic|waste|city of/i;
      let glName: Record<string, string> = {};
      try {
        const gr = await fetch("https://api.buildium.com/v1/glaccounts?limit=500", { headers: bh });
        for (const g0 of ((await gr.json().catch(() => [])) as Array<Record<string, unknown>>) ?? []) glName[String(g0.Id)] = String(g0.Name ?? "");
      } catch { glName = {}; }
      const dFrom = new Date(Date.now() - 364 * 86400000).toISOString().slice(0, 10);
      const dTo = new Date().toISOString().slice(0, 10);
      const found: Array<Record<string, unknown>> = [];
      let checked = 0;
      for (const cp of cands) {
        if (found.length >= 5 || checked >= 14) break;
        checked++;
        const cadr = (cp.Address ?? {}) as Record<string, unknown>;
        try {
          const unr = await fetch(`https://api.buildium.com/v1/rentals/units?propertyids=${encodeURIComponent(String(cp.Id))}&limit=100`, { headers: bh });
          const units2 = ((await unr.json().catch(() => [])) as Array<Record<string, unknown>>) ?? [];
          const match = units2.find((u2) => String(u2.UnitBedrooms ?? "") === beds);
          if (!match) continue;
          // entitytype/entityid is the property scope that actually works on /v1/bills
          // (utilData proved it; propertyids returns an unscoped list)
          const br = await fetch(`https://api.buildium.com/v1/bills?entitytype=Rental&entityid=${encodeURIComponent(String(cp.Id))}&frompaiddate=${dFrom}&topaiddate=${dTo}&limit=100`, { headers: bh });
          if (!br.ok) continue;
          const bl = ((await br.json().catch(() => [])) as Array<Record<string, unknown>>) ?? [];
          // Count exactly what a comparable pull would load: this property's own
          // lines on the two utility GL subaccounts. Counting any utility-ish line
          // on multi-property batch bills advertised comparables whose real pull
          // is empty or full of other properties' cities (462300, 2026-09-02).
          let nBills = 0;
          const FF_GL2 = /(gas\s*\/\s*electric)|(water[,\s]+sewer[,\s]+garbage)/i;
          for (const b0 of bl) {
            const lines = (b0.Lines ?? []) as Array<Record<string, unknown>>;
            if (lines.some((ln) => {
              const ae1 = (ln.AccountingEntity ?? {}) as Record<string, unknown>;
              if (ae1.Id != null && String(ae1.Id) !== String(cp.Id)) return false;
              const glo1 = (ln.GLAccount ?? {}) as Record<string, unknown>;
              const gl1 = String(glo1.Name ?? "") || (glName[String(glo1.Id ?? ln.GlAccountId ?? "")] ?? "");
              return FF_GL2.test(gl1);
            })) nBills++;
          }
          if (!nBills) continue;
          found.push({
            propertyId: cp.Id,
            address: [String(cadr.AddressLine1 ?? ""), String(cadr.City ?? "")].filter(Boolean).join(", ").slice(0, 120),
            unitId: match.Id,
            unitNumber: String(match.UnitNumber ?? ""),
            utilityBills: nBills,
            sameZip: String(cadr.PostalCode ?? "").slice(0, 5) === zip,
          });
        } catch { /* skip candidate */ }
      }
      found.sort((a0, b0) => Number(b0.utilityBills) - Number(a0.utilityBills));
      return j(headers, 200, { ok: true, city: String(padr.City ?? ""), beds, checked, candidates: found });
    }

    if (action === "postListing") {
      if (!BUILDIUM_ID || !BUILDIUM_SECRET) {
        return j(headers, 500, { error: "buildium_not_configured", message: "Buildium keys are not set up yet." });
      }
      const uid = String(body.unitId ?? "").trim();
      const desc = String(body.description ?? "").trim();
      if (!/^\d+$/.test(uid)) return j(headers, 400, { error: "bad_unit_id", message: "Populate from a Unit ID first; posting needs to know which Buildium unit to update." });
      if (!desc || desc.length < 40) return j(headers, 400, { error: "empty_draft", message: "The draft listing looks empty. Build it first, then post." });
      if (desc.length > 60000) return j(headers, 400, { error: "draft_too_long" });
      const BH = { "x-buildium-client-id": BUILDIUM_ID, "x-buildium-client-secret": BUILDIUM_SECRET };
      const r0 = await fetch(`https://api.buildium.com/v1/rentals/units/${encodeURIComponent(uid)}`, { headers: BH });
      if (!r0.ok) return j(headers, 502, { error: "buildium_failed", message: "Buildium didn't answer. Copy the listing and paste it manually." });
      const u = await r0.json();
      // PUT wants the full unit body; send everything back unchanged except Description.
      const putBody = {
        UnitNumber: u.UnitNumber,
        UnitSize: u.UnitSize,
        MarketRent: u.MarketRent,
        Address: u.Address,
        UnitBedrooms: u.UnitBedrooms,
        UnitBathrooms: u.UnitBathrooms,
        Description: desc,
      };
      const r1 = await fetch(`https://api.buildium.com/v1/rentals/units/${encodeURIComponent(uid)}`, {
        method: "PUT",
        headers: { ...BH, "Content-Type": "application/json" },
        body: JSON.stringify(putBody),
      });
      if (r1.status === 403) return j(headers, 502, { error: "buildium_no_scope", message: "Buildium hasn't granted edit access yet. Copy the listing and paste it manually for now." });
      if (!r1.ok) return j(headers, 502, { error: "buildium_failed", message: "Buildium rejected the update. Copy the listing and paste it manually." });
      // Listing prep is done in Buildium: close "Prepare | BD Listing" on the LU task
      // and stamp the day via due_on. Fail-soft; the Buildium write already succeeded.
      let prepGid: string | null = null;
      try {
        const address = String(body.address ?? "").trim();
        if (address) {
          const m2 = matchUnit(await allVacancies(true), address);
          if (m2.hit) {
            const subs = await asana("GET", `/tasks/${m2.hit.gid}/subtasks?limit=100&opt_fields=name,completed`);
            const prep = (subs ?? []).find((t: { name: string }) => /prep(?:are)?\s*\|?\s*bd\s*listing/i.test(t.name));
            if (prep) {
              const today2 = new Date(Date.now() - 7 * 3600 * 1000).toISOString().slice(0, 10);
              await asana("PUT", `/tasks/${prep.gid}`, { completed: true, due_on: today2 });
              prepGid = prep.gid;
            }
          }
        }
      } catch { /* fail-soft */ }
      return j(headers, 200, { ok: true, unitId: uid, chars: desc.length, prepCompleted: !!prepGid });
    }

    // ---------- toScope: turn scope for the Inspections tool ----------
    // The Turn Over task's DESCRIPTION is the scope (the Approved Scope field
    // retired 2026-09-24). The widget renders the lines as checkboxes; all
    // checked = section passed.
    if (action === "toScope") {
      const taskGid = String(body.taskGid ?? "").trim();
      if (!taskGid) return j(headers, 400, { error: "missing_task" });
      const t = await asana("GET", `/tasks/${taskGid}?opt_fields=notes`);
      const scope = String(t?.notes ?? "").slice(0, 4000);
      return j(headers, 200, { scope });
    }

    // ---------- toList: Turn Over tasks, open or closed within the past 30 days ----------
    if (action === "toList") {
      if (toCache && Date.now() - toCache.at < 2 * 60 * 1000) return j(headers, 200, { tasks: toCache.tasks });
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      type ToCand = { gid: string; address: string; completed: boolean; created: string };
      const cands: ToCand[] = [];
      let off = "";
      for (let page = 0; page < 12; page++) {
        const res = await fetch(
          `${ASANA}/projects/${TURNOVER_PROJECT}/tasks?completed_since=${encodeURIComponent(since)}&limit=100&opt_fields=name,completed,created_at${off ? `&offset=${encodeURIComponent(off)}` : ""}`,
          { headers: { "Authorization": `Bearer ${ASANA_PAT}` } });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`asana turnover page ${page} -> ${res.status}`);
        for (const t of (json.data ?? []) as Array<{ gid: string; name: string; completed?: boolean; created_at?: string }>) {
          if (!/^turn\s*over\s*\|/i.test(t.name)) continue;
          const address = addressFromTaskName(t.name);
          if (!address || address.includes("<")) continue;
          cands.push({ gid: t.gid, address, completed: Boolean(t.completed), created: String(t.created_at ?? "") });
        }
        off = json.next_page?.offset ?? "";
        if (!off) break;
      }
      // One entry per address: open beats closed, newest beats oldest (a re-turn
      // within 30 days would otherwise show duplicate buttons in the picker).
      const best = new Map<string, ToCand>();
      for (const c of cands) {
        const k = normAddr(c.address);
        const cur = best.get(k);
        if (!cur || (cur.completed && !c.completed) || (cur.completed === c.completed && c.created > cur.created)) best.set(k, c);
      }
      const tasks = Array.from(best.values()).map((c) => ({ gid: c.gid, address: c.address }))
        .sort((a, b) => a.address.localeCompare(b.address));
      toCache = { at: Date.now(), tasks };
      return j(headers, 200, { tasks });
    }

    // ---------- toSubmit: Turn Over Complete inspection ----------
    // One subtask per inspection on the Turn Over task, named with the verdict:
    // "PASSED \u{1F64C} || Turn Over Complete Inspection - <date> / <address>". FAILED
    // inspections carry the punch list in the description, assigned to the Turn Over
    // task's assignee, due the next day. PASSED ones post as a completed record.
    if (action === "toSubmit") {
      const address = String(body.address ?? "").trim();
      const source = body.source === "manual" ? "manual" : "to";
      const taskGid = source === "manual" ? "" : String(body.taskGid ?? "");
      const generalNote = String(body.generalNote ?? "").trim();
      const inspector = String(body.inspector ?? "").trim().slice(0, 80);
      const turnScope = String(body.turnScope ?? "").trim().slice(0, 4000);
      const cleaningIn = (body.cleaning && typeof body.cleaning === "object") ? body.cleaning as Record<string, unknown> : {};
      const cleanGrade = String(cleaningIn.grade ?? "").trim().slice(0, 80);
      const cleanNote = String(cleaningIn.note ?? "").trim().slice(0, 1000);
      const items = Array.isArray(body.items) ? body.items as Array<Record<string, unknown>> : [];
      if (!items.length || (source === "manual" ? !address : !taskGid)) return j(headers, 400, { error: "missing_fields" });

      const todayStr = new Date(Date.now() - 7 * 3600 * 1000).toISOString().slice(0, 10); // Seattle-ish
      const dueOn = todayStr; // FAILED punch lists are due TODAY (Brittany, 2026-07-22)
      const TOC_FIELD = "1208575208052359"; // Turn Over Completion (date)
      const TOV_FIELD = "1214522291188762"; // 💁‍♀️ Turn Over Verified (date)

      const punch: string[] = [];
      for (const it of items) {
        if (!it.ticket) continue;
        const issues = Array.isArray(it.issues) ? it.issues.map((x: unknown) => String(x).trim()).filter(Boolean) : [];
        const note = String(it.note ?? "").trim();
        const extra = [issues.join(", "), note].filter(Boolean).join(" | ");
        punch.push(`${String(it.item ?? "Issue")}${extra ? ` -- ${extra}` : ""}`);
      }
      const verdict = items.some((it) => it.answer === "no" || it.answer === "task") ? "FAILED" : "PASSED";

      let assignee: { gid: string; name: string } | null = null;
      if (source !== "manual") try {
        const to = await asana("GET", `/tasks/${taskGid}?opt_fields=assignee.name`);
        if (to?.assignee) assignee = { gid: to.assignee.gid, name: to.assignee.name };
      } catch { /* non-fatal */ }
      if (!assignee && verdict === "FAILED") assignee = DEFAULT_MAINT;

      const name = `${verdict === "PASSED" ? "PASSED \u{1F64C}" : "FAILED \u{1F629}"} || Turn Over Complete Inspection - ${todayStr} / ${address}`.slice(0, 250);
      const notesLines = punch.length ? ["Punch list:", ...punch.map((pp) => `- ${pp}`)] : ["All items passed."];
      notesLines.push("", "Created by the Turn Over Inspection tool. Full checklist, photos, and inspection PDF are in the comments.");
      const payload: Record<string, unknown> = { name, notes: notesLines.join("\n") };
      if (verdict === "FAILED") {
        if (assignee) payload.assignee = assignee.gid;
        payload.due_on = dueOn;
      }
      const inspection = source === "manual"
        ? await asana("POST", "/tasks", { ...payload, projects: [TURNOVER_PROJECT] })
        : await asana("POST", `/tasks/${taskGid}/subtasks`, payload);
      if (verdict === "PASSED") { try { await asana("PUT", `/tasks/${inspection.gid}`, { completed: true }); } catch { /* record stays open */ } }

      const bySection: Record<string, string[]> = {};
      for (const it of items) {
        const sec = String(it.section ?? "CHECKLIST");
        const mark = it.answer === "yes" ? "(PASS)" : it.answer === "no" ? "(FAIL)" : it.answer === "task" ? "(TASK)" : "(na)";
        const note = String(it.note ?? "").trim();
        const issues = Array.isArray(it.issues) ? it.issues.map((x: unknown) => String(x).trim()).filter(Boolean) : [];
        const extra = [issues.join(", "), note].filter(Boolean).join(" | ");
        (bySection[sec] = bySection[sec] || []).push(`${mark} ${it.item}${extra ? ` -- ${extra}` : ""}${it.ticket ? " [punch list]" : ""}`);
      }
      const lines: string[] = [`TURN OVER COMPLETE INSPECTION -- ${todayStr} -- ${address}`, ""];
      if (inspector) lines.splice(1, 0, `Inspected by: ${inspector}`);
      if (turnScope) { lines.push("TURN SCOPE"); lines.push(turnScope); lines.push(""); }
      for (const sec of Object.keys(bySection)) { lines.push(sec); lines.push(...bySection[sec]); lines.push(""); }
      if (cleanGrade) {
        lines.push("CLEANING (graded for the report; does not affect the verdict)");
        lines.push(cleanGrade + (cleanNote ? ` -- ${cleanNote}` : ""));
        lines.push("");
      }
      if (generalNote) { lines.push("Notes:"); lines.push(generalNote); lines.push(""); }
      lines.push(`RESULT: ${verdict}${punch.length ? ` -- ${punch.length} punch list item(s), due ${dueOn}` : ""}`);
      const story = await asana("POST", `/tasks/${inspection.gid}/stories`, { text: lines.join("\n") });

      // Verdict choreography on the Turn Over task (Brittany, 2026-07-22):
      // FAILED -> reopen the TU task, clear Turn Over Completion, reopen the
      //   Confirm | Turn Over Complete subtask (no due date), @mention the
      //   coordinator on the inspection.
      // PASSED -> stamp Turn Over Verified today (+ Completion if blank), complete
      //   the TU task and the Confirm subtask, @mention the coordinator with
      //   thanks and heart the task (appreciation stickers aren't in the API).
      if (source !== "manual") {
        const findConfirm = async () => {
          const subs = await asana("GET", `/tasks/${taskGid}/subtasks?limit=100&opt_fields=name`);
          return (subs ?? []).find((sub: { name: string }) => /^confirm\s*\|?\s*turn\s*over\s*complete/i.test(sub.name)) ?? null;
        };
        if (verdict === "FAILED") {
          try { await asana("PUT", `/tasks/${taskGid}`, { completed: false }); } catch { /* non-fatal */ }
          try { await asana("PUT", `/tasks/${taskGid}`, { custom_fields: { [TOC_FIELD]: null } }); } catch { /* non-fatal */ }
          try {
            const conf = await findConfirm();
            if (conf) await asana("PUT", `/tasks/${conf.gid}`, { completed: false, due_on: null });
          } catch { /* non-fatal */ }
          if (assignee) {
            try {
              await asana("POST", `/tasks/${inspection.gid}/stories`, { html_text: `<body><a data-asana-gid="${assignee.gid}"/> Turn over failed inspection. Punch list above is due today (${dueOn}).</body>` });
            } catch { /* non-fatal */ }
          }
        } else {
          try { await asana("PUT", `/tasks/${taskGid}`, { completed: true, liked: true }); } catch { /* non-fatal */ }
          try {
            // PASSED stamps Turn Over Verified only; Turn Over Completion is never
            // touched on a pass (Brittany, 2026-07-23). Date fields need the object form.
            await asana("PUT", `/tasks/${taskGid}`, { custom_fields: { [TOV_FIELD]: { date: todayStr } } });
          } catch { /* non-fatal */ }
          try {
            const conf = await findConfirm();
            if (conf) await asana("PUT", `/tasks/${conf.gid}`, { completed: true });
          } catch { /* non-fatal */ }
          if (assignee) {
            try {
              await asana("POST", `/tasks/${inspection.gid}/stories`, { html_text: `<body><a data-asana-gid="${assignee.gid}"/> Turn over verified! The unit is rent-ready. Great work 🎉</body>` });
            } catch { /* non-fatal */ }
          }
        }
      }

      // Cleaning result -> "Schedule | Move Out Cleaning" subtask on the TU task.
      // Cleaning is scheduled by the Leasing Team, so on PASSED the subtask is
      // assigned to the LU task's assignee, due today. On FAILED: comment only
      // (the inspection repeats). Never affects the verdict.
      let cleaningPosted = false;
      let cleaningAssignee: string | null = null;
      if (cleanGrade && source !== "manual") {
        try {
          const subs = await asana("GET", `/tasks/${taskGid}/subtasks?limit=100&opt_fields=name`);
          const cleanTask = (subs ?? []).find((sub: { name: string }) => /schedule\s*\|?\s*(move[\s-]*out\s*)?cleaning/i.test(sub.name));
          if (cleanTask) {
            await postStory(cleanTask.gid, [
              `Cleanliness grade: ${cleanGrade}${cleanNote ? ` -- ${cleanNote}` : ""}`,
              `From the Turn Over Complete Inspection on ${todayStr} (${verdict}): https://app.asana.com/0/0/${inspection.gid}`,
            ].join("\n"));
            cleaningPosted = true;
            if (verdict === "PASSED") {
              try {
                const lu = matchUnit(await allVacancies(true), address).hit;
                if (lu) {
                  const luTask = await asana("GET", `/tasks/${lu.gid}?opt_fields=assignee.name`);
                  if (luTask?.assignee) {
                    await asana("PUT", `/tasks/${cleanTask.gid}`, { assignee: luTask.assignee.gid, due_on: todayStr });
                    cleaningAssignee = luTask.assignee.name;
                  }
                }
              } catch { /* comment already posted; assignment is best-effort */ }
            }
          }
        } catch { /* non-fatal */ }
      }

      return j(headers, 200, {
        ok: true,
        verdict,
        inspectionGid: inspection.gid,
        inspectionUrl: `https://app.asana.com/0/0/${inspection.gid}`,
        storyGid: story?.gid ?? null,
        punch,
        assignee: assignee ? assignee.name : null,
        dueOn,
        cleaningPosted,
        cleaningAssignee,
      });
    }

    // TEMP: identity probe (remove after PAT swap verification)
    // ---------- lkUnlock / lkList / lkUnit: the Lookup widget (see helpers) ----------
    if (action === "lkUnlock") {
      if (!LOOKUP_PASSWORD) return j(headers, 503, { error: "not_configured", message: "Lookup isn't set up yet. Tell Brittany." });
      const who = (c.req.header("x-forwarded-for") ?? "").split(",")[0].trim() || "anon";
      const f = lkFails.get(who);
      if (f && f.n >= 5 && Date.now() - f.at < 15 * 60 * 1000) {
        return j(headers, 429, { error: "locked", message: "Too many tries. Wait 15 minutes." });
      }
      if (!lkSame(String(body.password ?? ""), LOOKUP_PASSWORD)) {
        lkFails.set(who, { n: (f && Date.now() - f.at < 15 * 60 * 1000 ? f.n : 0) + 1, at: Date.now() });
        await new Promise((r) => setTimeout(r, 800));
        return j(headers, 401, { error: "bad_password", message: "Wrong password." });
      }
      lkFails.delete(who);
      const exp = String(Date.now() + LK_TTL_MS);
      return j(headers, 200, { ok: true, token: `${exp}.${await lkSig(exp)}`, exp: Number(exp) });
    }

    // Lookup Team Feedback -> subtask straight on "Team Tools | Bugs & Feature
    // Requests" (Brittany 2026-10-20), assigned to Brittany, due same day. Token
    // gated like the rest of Lookup so the public team key can't post.
    if (action === "lkFeedback") {
      if (!(await lkTokenOk(String(body.token ?? "")))) return j(headers, 401, { error: "locked", message: "Enter the password." });
      const text = String(body.text ?? "").trim().slice(0, 4000);
      const address = String(body.address ?? "").trim().slice(0, 120);
      if (text.length < 5) return j(headers, 400, { error: "missing_fields" });
      const todayStr = new Date(Date.now() - 7 * 3600 * 1000).toISOString().slice(0, 10);
      const sub = await asana("POST", `/tasks/1216868072846283/subtasks`, {
        name: `Lookup Feedback // ${todayStr}`,
        assignee: "1203784854198936",
        due_on: todayStr,
        notes: text
          + (address ? `\n\nUnit open at the time: ${address}` : "")
          + "\n\nSubmitted via the Lookup widget Team Feedback button. Done by Claude on behalf of the submitting team member.",
      });
      return j(headers, 200, { ok: true, gid: sub.gid });
    }

    // field correction from the pencil on a Lookup row: one task on Buildium Repair
    // Shop with the address, Unit ID, Property ID, field and what the staff member
    // typed (Brittany 2026-10-23). Ids come from the Settings task server-side,
    // never from the page.
    if (action === "lkEdit") {
      if (!(await lkTokenOk(String(body.token ?? "")))) return j(headers, 401, { error: "locked", message: "Enter the password." });
      const text = String(body.text ?? "").trim().slice(0, 2000);
      const field = String(body.field ?? "").trim().slice(0, 80);
      const shown = String(body.shown ?? "").trim().slice(0, 300);
      if (!text || !field) return j(headers, 400, { error: "missing_fields", message: "Type the correction first." });
      const row = (await lkList()).find((r) => r.gid === String(body.gid ?? ""));
      if (!row) return j(headers, 404, { error: "not_found", message: "That unit isn't in the list anymore. Search again." });
      // the Keybox Code pencil writes straight to the open Leasing parent's [Onsite]
      // Key Box, the same field the Move Out Update widget saves (Brittany
      // 2026-11-05). No open Leasing parent = no home for the code, so it falls
      // through to the normal correction task.
      if (field === "Keybox Code") {
        const master = row.uid ? (await moveOutIndex()).masterByUid[row.uid] : "";
        if (master) {
          await asana("PUT", `/tasks/${master}`, { custom_fields: { [LK_KEYBOX_F]: text.slice(0, 40) } });
          return j(headers, 200, { ok: true, keyboxSaved: true });
        }
      }
      const cfQ = "custom_fields.gid,custom_fields.display_value";
      const ut = await asana("GET", `/tasks/${row.gid}?opt_fields=parent.gid,${cfQ}`);
      const val = (cf: LkCf, gid: string) => String(cf.find((x) => x.gid === gid)?.display_value ?? "").trim();
      let pid = val(ut.custom_fields ?? [], LK_PROP_ID_F);
      if (!pid && ut.parent?.gid) {
        try { pid = val((await asana("GET", `/tasks/${ut.parent.gid}?opt_fields=${cfQ}`)).custom_fields ?? [], LK_PROP_ID_F); } catch { /* left blank */ }
      }
      const line = "----------------------------------------";
      const t = await asana("POST", `/tasks`, {
        projects: [LK_REPAIR_PROJECT],
        name: `Lookup field correction // ${field} // ${row.address}`,
        notes: `Lookup Field Correction\n${line}\n\nhttps://app.asana.com/0/0/${row.gid}/f (Settings // ${row.address})\n`
          + (pid && row.uid ? `https://sagareus.managebuilding.com/manager/app/properties/${pid}/units/${row.uid}/summary\n` : "")
          + `${line}\n\nAddress: ${row.address}\nUnit ID: ${row.uid || "not on file"}\nProperty ID: ${pid || "not on file"}\nField: ${field}\nLookup shows: ${shown || "Unconfirmed"}\n\n${line}\n\nStaff member says:\n${text}\n\n${line}\n\nSubmitted via the Lookup widget pencil. Done by Claude on behalf of the submitting team member.`,
      });
      return j(headers, 200, { ok: true, gid: t.gid });
    }

    if (action === "lkList" || action === "lkUnit") {
      if (!(await lkTokenOk(String(body.token ?? "")))) return j(headers, 401, { error: "locked", message: "Enter the password." });
      const [rows, idx] = await Promise.all([lkList(), moveOutIndex()]);

      if (action === "lkList") {
        return j(headers, 200, { ok: true, units: rows.map((r) => ({ gid: r.gid, address: r.address, kind: r.kind, status: lkStatus(r.uid, idx) })) });
      }

      // only tasks the list offers: the token never reads arbitrary Asana tasks
      const row = rows.find((r) => r.gid === String(body.gid ?? ""));
      if (!row) return j(headers, 404, { error: "not_found", message: "That unit isn't in the list anymore. Search again." });
      const cfQ = "custom_fields.gid,custom_fields.name,custom_fields.display_value";
      const ut = await asana("GET", `/tasks/${row.gid}?opt_fields=name,parent.gid,${cfQ}`);
      const ucf = (ut.custom_fields ?? []) as LkCf;
      let pcf: LkCf = [];
      if (row.kind === "unit" && ut.parent?.gid) {
        try { pcf = ((await asana("GET", `/tasks/${ut.parent.gid}?opt_fields=${cfQ}`)).custom_fields ?? []) as LkCf; } catch { /* unit fields only */ }
      }
      const pick = (cf: LkCf, re: RegExp) => {
        const hit = cf.find((x) => re.test(String(x.name ?? "").trim()));
        return hit ? String(hit.display_value ?? "").trim() : null;
      };
      // unit first, property when the unit field is blank or missing
      const g = (re: RegExp): string => pick(ucf, re) || pick(pcf, re) || "";
      // dates: a property 12/31/9999 never stands in for a blank unit date (sync
      // stamps it on multifamily property tasks, where unit fields do not apply)
      const gd = (re: RegExp): string => {
        const u = pick(ucf, re) || "";
        if (u || row.kind !== "unit") return u;
        const p = pick(pcf, re) || "";
        return p.startsWith("9999") ? "" : p;
      };
      const gp = (re: RegExp): string => pick(pcf, re) || pick(ucf, re) || "";
      const multi = row.kind === "unit";

      // lease: the unit's Lease Settings task, open first, oldest first (the
      // current resident's lease wins over a future one)
      let lcf: LkCf = [];
      if (/^\d+$/.test(row.uid)) {
        try {
          const r = await fetch(`${ASANA}/workspaces/${WORKSPACE}/tasks/search?projects.any=${LEASE_SETTINGS_PROJECT}&custom_fields.${LK_UNIT_ID_F}.value=${row.uid}&opt_fields=completed,created_at,${cfQ}`,
            { headers: { "Authorization": `Bearer ${ASANA_PAT}` } });
          const ls = (((await r.json().catch(() => ({}))) as { data?: unknown }).data ?? []) as Array<{ completed?: boolean; created_at?: string; custom_fields?: LkCf }>;
          ls.sort((a, b) => Number(!!a.completed) - Number(!!b.completed) || String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
          lcf = ls[0]?.custom_fields ?? [];
        } catch { /* lease rows read None on Record */ }
      }
      const gl = (re: RegExp): string => pick(lcf, re) || "";

      // utility providers: the unit's Listing Settings task (Brittany 2026-10-20),
      // open first, newest first
      let providers = "";
      if (/^\d+$/.test(row.uid)) {
        try {
          const r = await fetch(`${ASANA}/workspaces/${WORKSPACE}/tasks/search?projects.any=${LK_LISTING_PROJECT}&custom_fields.${LK_UNIT_ID_F}.value=${row.uid}&opt_fields=completed,created_at,custom_fields.gid,custom_fields.display_value`,
            { headers: { "Authorization": `Bearer ${ASANA_PAT}` } });
          const ls = (((await r.json().catch(() => ({}))) as { data?: unknown }).data ?? []) as Array<{ completed?: boolean; created_at?: string; custom_fields?: LkCf }>;
          ls.sort((a, b) => Number(!!a.completed) - Number(!!b.completed) || String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
          for (const t of ls) {
            providers = String((t.custom_fields ?? []).find((x) => x.gid === LK_PROVIDERS_F)?.display_value ?? "").trim();
            if (providers) break;
          }
        } catch { /* reads None on Record */ }
      }

      // keybox: the open Leasing parent's [Onsite] Key Box
      let keybox = "";
      const master = row.uid ? idx.masterByUid[row.uid] : "";
      if (master) {
        try {
          const mt = await asana("GET", `/tasks/${master}?opt_fields=custom_fields.gid,custom_fields.display_value`);
          keybox = String(((mt.custom_fields ?? []) as LkCf).find((x) => x.gid === LK_KEYBOX_F)?.display_value ?? "").trim();
        } catch { /* shows No Key Box On File */ }
      }

      type R = { label: string; value: string | null; note?: string; link?: string };
      // Outline playbook links: the first sagareus.getoutline.com URL becomes the
      // row's link; any other text stays as the value
      const lkLinkRow = (label: string, raw: string): R => {
        const m = raw.match(/https:\/\/sagareus\.getoutline\.com\/\S+/);
        if (!m) return { label, value: raw || null };
        const rest = raw.replace(m[0], "").trim();
        return { label, value: rest || null, link: m[0] };
      };
      const txt = (label: string, v: string, note = ""): R => ({ label, value: v || null, ...(note ? { note } : {}) });
      const yearAgo = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
      // service dates: 12/31/9999 = does not apply (row hidden); over a year old flagged
      const svc = (label: string, raw: string): R | null => {
        const d = raw.slice(0, 10);
        if (d.startsWith("9999")) return null;
        if (!lkDate(d)) return txt(label, "");
        return txt(label, lkDate(d), d < yearAgo ? "Over a year ago" : "");
      };
      const keep = (xs: Array<R | null>) => xs.filter(Boolean) as R[];

      const parkType = gp(/^parking type$/i), storType = gp(/^storage type$/i);
      const leaseSpot = (v: string) => (v && !/^(included|none)$/i.test(v) ? v : "");
      const parkIds = leaseSpot(gl(/^parking$/i)), storIds = leaseSpot(gl(/^storage$/i));
      const parking = parkType ? parkStorLine(parkType, parkIds, "Spot") : "";
      const storage = storType ? parkStorLine(storType, storIds, "Storage") : (storIds || "");

      const reg = gp(/^rental registration expiration$/i).slice(0, 10);
      const today = new Date(Date.now() - 7 * 3600 * 1000).toISOString().slice(0, 10);
      const regRow: R | null = reg.startsWith("9999") ? null
        : lkDate(reg) ? txt("Rental Registration", `Expires ${lkDate(reg)}`, reg < today ? "Expired" : "")
        : txt("Rental Registration", "");

      const hoaDues = gp(/^hoa dues$/i), hoaBook = gp(/^hoa playbook$/i);
      const hoaRow: R = /^none$/i.test(hoaDues) ? txt("HOA", "No HOA")
        : hoaDues || hoaBook ? { label: "HOA", value: hoaDues ? `Dues ${hoaDues.replace(/^paid by/i, "paid by")}` : "Yes", ...(hoaBook ? { link: hoaBook } : {}) }
        : txt("HOA", "");

      const asset = gp(/^asset storage$/i);
      const util = (label: string, re: RegExp): R => {
        const v = g(re);
        return txt(label, LK_UTIL[v.toLowerCase()] ?? v);
      };
      const pets = gl(/^pets$/i), petTerm = gl(/^pet lease term$/i);

      const sections: Array<{ title: string; rows: R[] }> = [
        { title: "Unit", rows: keep([
          txt("Mailbox", g(/^mailbox$/i)),
          txt("Parking", parking),
          // the property's spot id lists (Property Settings, Brittany 2026-10-23)
          txt("Parking Spots", gp(/^parking spots$/i)),
          txt("Storage Spots", gp(/^storage spots$/i)),
          txt("Heating", g(/^heating type$/i)),
          txt("Cooling", g(/^cooling$/i)),
          txt("HVAC Filter", g(/^hvac filter$/i)),
          txt("Laundry", g(/^laundry$/i)),
          txt("EV Charger", g(/^ev charger$/i)),
          txt("Internet", g(/^internet provider$/i)),
          lkLinkRow("Playbook", gp(/^playbook$/i)),
          hoaRow,
          txt("Asset Storage", asset),
          regRow,
        ]) },
        { title: "Maintenance", rows: keep([
          txt("Keys Common Area", gp(/^keys common area$/i)),
          svc("HVAC Service", gd(/^hvac servicing completed$/i)),
          svc("Dryer Vent", gd(/^dryer vent cleaning completed$/i)),
          (() => { const d = gd(/^hot water heater install$/i).slice(0, 10); return d.startsWith("9999") ? null : txt("Water Heater Installed", lkDate(d)); })(),
          svc("Annual Inspection", gd(/^annual inspection completed$/i)),
          txt("Landscaping", gp(/^landscaping maintenance$/i)),
          txt("Pest Control", gp(/^pest control$/i)),
          ...(multi ? [txt("Common Area Cleaning", gp(/^common area cleaning$/i))] : []),
          svc("Roof Cleaning", gp(/^roof cleaning completed$/i)),
          svc("Septic Pump", gp(/^septic pump date$/i)),
          svc("Backflow Test", gp(/^backflow testing date$/i)),
          ...(multi ? [
            svc("Coin Pickup", gp(/^coin pickup completed$/i)),
            svc("Multifamily Inspection", gp(/^multifamily inspection date$/i)),
            svc("Fire Inspection", gp(/^fire inspection date$/i)),
            svc("Elevator Inspection", gp(/^elevator inspection date$/i)),
          ] : []),
          txt("Appliances", g(/^appliances$/i)),
        ]) },
        { title: "Utilities", rows: [
          util("Electric", /^utilities - electricity$/i),
          util("Gas", /^utilities - gas$/i),
          util("Water", /^utilities - water$/i),
          util("Sewer / Storm", /^utilities - sewer/i),
          util("Garbage", /^utilities - garbage$/i),
          util("Oil", /^utilities - oil$/i),
          util("Internet", /^utilities - internet$/i),
          txt("Providers", providers),
        ] },
        { title: "Lease", rows: [
          txt("Pets", pets, petTerm ? `Pet Lease Term: ${petTerm}` : ""),
          txt("ESA", gl(/^esa$/i)),
          txt("Vehicles", gl(/^vehicles$/i)),
          txt("Storage", storage),
        ] },
      ];

      const chips: string[] = [lkStatus(row.uid, idx)];
      if (pets && !/^none$/i.test(pets)) chips.push(pets.replace(/\b\w/g, (ch) => ch.toUpperCase()));
      if (hoaRow.value && hoaRow.value !== "No HOA") chips.push("HOA");

      return j(headers, 200, {
        ok: true,
        address: row.address,
        chips,
        top: [
          { label: "Keybox Code", value: keybox || null, empty: "No Key Box On File" },
          { label: "Keys Storage", value: g(/^keys storage$/i) || null },
        ],
        sections,
      });
    }

    if (action === "whoami") {
      const out: Record<string, string> = {};
      for (const [label, tok] of [["ASANA_PAT", Deno.env.get("ASANA_PAT")], ["ASANA_API_TOKEN", Deno.env.get("ASANA_API_TOKEN")]] as Array<[string, string | undefined]>) {
        if (!tok) { out[label] = "(not set)"; continue; }
        try {
          const r = await fetch("https://app.asana.com/api/1.0/users/me?opt_fields=name,email", { headers: { "Authorization": `Bearer ${tok}` } });
          const jj = await r.json().catch(() => ({}));
          out[label] = r.ok ? `${jj.data?.name} <${jj.data?.email}>` : `(invalid: ${r.status})`;
        } catch { out[label] = "(error)"; }
      }
      return j(headers, 200, out);
    }

    return j(headers, 400, { error: "unknown_action" });
  } catch (e) {
    console.error(e);
    return j(headers, 502, { error: "asana_failed", message: "Asana didn't accept that. Try again; if it keeps failing, do this one manually and tell your lead." });
  }
});

Deno.serve(app.fetch);
