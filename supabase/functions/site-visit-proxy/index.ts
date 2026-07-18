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

import { Hono } from "hono";

const ASANA_PAT = Deno.env.get("ASANA_PAT") ?? "";
const TEAM_KEY = Deno.env.get("SITE_VISIT_KEY") ?? "";
const BUILDIUM_ID = Deno.env.get("BUILDIUM_CLIENT_ID") ?? "";
const BUILDIUM_SECRET = Deno.env.get("BUILDIUM_CLIENT_SECRET") ?? "";
const WORKSPACE = "706990140225747";
const LEASING_LU_PROJECT = "1213171756304238";
const UNIT_SETTINGS_PROJECT = "1213032009308835";
const PROPERTY_SETTINGS_PROJECT = "1211134623744906";
// Lead maintenance coordinator; default assignee for occupied-unit and manual-address
// tickets until per-property routing exists (Brittany, 2026-07-17).
const DEFAULT_MAINT = { gid: "1201894870325840", name: "Joylyn De Castro" };
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
function matchUnit(units: Array<{ gid: string; address: string }>, typed: string):
  { hit?: { gid: string; address: string }; ambiguous?: string[] } {
  const t = addrTokens(typed);
  if (!t.length) return {};
  const target = t.join(" ");
  const exact = units.find((u) => normAddr(u.address) === target);
  if (exact) return { hit: exact };
  const candidates = units.filter((u) => {
    const ut = addrTokens(u.address);
    if (ut[0] !== t[0]) return false;
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
  // "Settings // 2813 Southwest 28th Street, Redmond" -> "2813 Southwest 28th Street, Redmond"
  return name.split("//").slice(1).join("//").trim();
}

// Leasing vacancies via paged project listing, NOT workspace search: search caps at 100
// results by recent modification, so bot-driven bulk edits push the real LU/TP/PreLease
// tasks out of the window and the picker mysteriously shrinks (seen 2026-07-18).
let luCache: { at: number; vacancies: Array<{ gid: string; address: string }> } | null = null;

async function allVacancies(): Promise<Array<{ gid: string; address: string }>> {
  if (luCache && Date.now() - luCache.at < 2 * 60 * 1000) return luCache.vacancies;
  const out: Array<{ gid: string; address: string }> = [];
  let offset = "";
  for (let page = 0; page < 10; page++) {
    const res = await fetch(
      `${ASANA}/projects/${LEASING_LU_PROJECT}/tasks?completed_since=now&limit=100&opt_fields=name${offset ? `&offset=${encodeURIComponent(offset)}` : ""}`,
      { headers: { "Authorization": `Bearer ${ASANA_PAT}` } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`asana lu page ${page} -> ${res.status}`);
    for (const t of (json.data ?? []) as Array<{ gid: string; name: string }>) {
      if (/^(LU|TP|PreLease)\s*\|/i.test(t.name)) {
        const address = addressFromTaskName(t.name);
        if (address && !address.includes("<")) out.push({ gid: t.gid, address });
      }
    }
    offset = json.next_page?.offset ?? "";
    if (!offset) break;
  }
  // Active = lease not signed yet, OR lease signed but the MOVE-IN subtask is still open
  // (weekly reports run move-out to move-in). Stale leased tasks drop out of the picker.
  try {
    const [leased, moveins] = await Promise.all([
      asana("GET", `/workspaces/${WORKSPACE}/tasks/search?projects.any=${LEASING_LU_PROJECT}&completed=false&custom_fields.1213987093740546.is_set=true&limit=100&opt_fields=name`),
      asana("GET", `/workspaces/${WORKSPACE}/tasks/search?projects.any=${LEASING_LU_PROJECT}&completed=false&text=${encodeURIComponent("move in")}&limit=100&opt_fields=name,parent.gid`),
    ]);
    const leasedSet = new Set<string>();
    (leased ?? []).forEach((t: { gid: string; name: string }) => {
      if (/^(LU|TP|PreLease)\s*\|/i.test(t.name)) leasedSet.add(t.gid);
    });
    const moveInOpen = new Set<string>();
    (moveins ?? []).forEach((t: { name: string; parent?: { gid: string } | null }) => {
      if (/^move[\s-]*in/i.test(t.name) && t.parent?.gid) moveInOpen.add(t.parent.gid);
    });
    if (leasedSet.size) {
      const filtered = out.filter((v) => !leasedSet.has(v.gid) || moveInOpen.has(v.gid));
      if (filtered.length) { out.length = 0; filtered.forEach((v) => out.push(v)); }
    }
  } catch { /* fail open: show the unfiltered list rather than an empty picker */ }

  out.sort((a, b) => a.address.localeCompare(b.address));
  luCache = { at: Date.now(), vacancies: out };
  return out;
}

// The unit list barely changes; cache it in the warm instance so the picker loads fast.
let unitCache: { at: number; units: Array<{ gid: string; address: string }> } | null = null;

async function allUnits(): Promise<Array<{ gid: string; address: string }>> {
  if (unitCache && Date.now() - unitCache.at < 5 * 60 * 1000) return unitCache.units;
  const units: Array<{ gid: string; address: string }> = [];
  let offset = "";
  for (let page = 0; page < 12; page++) {
    const res = await fetch(
      `${ASANA}/projects/${UNIT_SETTINGS_PROJECT}/tasks?completed_since=now&limit=100&opt_fields=name${offset ? `&offset=${encodeURIComponent(offset)}` : ""}`,
      { headers: { "Authorization": `Bearer ${ASANA_PAT}` } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`asana units page ${page} -> ${res.status}`);
    for (const t of (json.data ?? []) as Array<{ gid: string; name: string }>) {
      if (/^settings\s*\/\//i.test(t.name)) units.push({ gid: t.gid, address: addressFromSettingsName(t.name) });
    }
    offset = json.next_page?.offset ?? "";
    if (!offset) break;
  }
  units.sort((a, b) => a.address.localeCompare(b.address));
  unitCache = { at: Date.now(), units };
  return units;
}

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
    if (action === "vacancies") {
      const [vacancies, units] = await Promise.all([allVacancies(), allUnits()]);
      return j(headers, 200, { vacancies, units });
    }

    // ---------- submit: comment + tickets ----------
    if (action === "submit") {
      const address = String(body.address ?? "").trim();
      const source = body.source === "unit" ? "unit" : body.source === "manual" ? "manual" : "lu";
      const taskGid = source === "manual" ? "" : String(body.taskGid ?? "");
      const generalNote = String(body.generalNote ?? "").trim();
      const items = Array.isArray(body.items) ? body.items as Array<Record<string, unknown>> : [];
      if (!items.length || (source === "manual" ? !address : !taskGid)) {
        return j(headers, 400, { error: "missing_fields" });
      }

      // 1) the anchor task and site-visit subtask.
      //    lu: "Weekly Site Visit / Inspection" subtask per SOP. unit: "Site Visits"
      //    subtask on the Settings task. manual: property isn't in Asana yet, so
      //    create a standalone "Site Visit // <address>" task in Property Settings
      //    and everything (comment, tickets) hangs off it.
      let anchorGid = taskGid;
      let inspection;
      if (source === "manual") {
        inspection = await asana("POST", "/tasks", {
          name: `Site Visit // ${address}`.slice(0, 250),
          projects: [PROPERTY_SETTINGS_PROJECT],
          notes: "Created from the site visit tool. This address wasn't in Unit Settings when visited (new onboarding, or not under management). If the property gets a Settings task, fold this into it.",
        });
        anchorGid = inspection.gid;
      } else {
        const subtasks = await asana("GET", `/tasks/${taskGid}/subtasks?limit=100&opt_fields=name`);
        inspection = (subtasks ?? []).find((s: { name: string }) => /site\s*visit/i.test(s.name)) ??
                     (subtasks ?? []).find((s: { name: string }) => /inspect/i.test(s.name));
        if (!inspection) {
          inspection = await asana("POST", `/tasks/${taskGid}/subtasks`, {
            name: source === "unit" ? "Site Visits" : "Weekly Site Visit / Inspection",
            notes: "Site visit documentation lives here. Every visit: one comment with the marked-up checklist and photos. SOP: https://sagareus.getoutline.com/doc/weekly-site-visit-yjZFdeB9EC",
          });
        }
      }

      // 2) move-in date (72-hour rule) + Preferred Showing Slot 1 (next visit due date)
      let moveIn: Date | null = null;
      let slot1 = "";
      if (source !== "manual") try {
        const lu = await asana("GET", `/tasks/${taskGid}?opt_fields=custom_fields.name,custom_fields.display_value`);
        const mi = (lu.custom_fields ?? []).find((f: { name: string }) => /move in date/i.test(f.name));
        if (mi?.display_value) moveIn = new Date(mi.display_value);
        const s1 = (lu.custom_fields ?? []).find((f: { name: string }) => /preferred showing slot 1/i.test(f.name));
        if (s1?.display_value) slot1 = String(s1.display_value);
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

      // 4) due date: default +3 days; if move-in is near, land 3+ days before it (never before tomorrow)
      const today = new Date();
      let due = new Date(today.getTime() + 3 * 86400000);
      if (moveIn && !isNaN(moveIn.getTime())) {
        const cutoff = new Date(moveIn.getTime() - 3 * 86400000);
        if (cutoff < due) due = cutoff;
        const tomorrow = new Date(today.getTime() + 86400000);
        if (due < tomorrow) due = tomorrow;
      }
      const dueOn = due.toISOString().slice(0, 10);

      // 5) create a maintenance subtask per flagged item, on the anchor task.
      //    Assignee: TO Coordinator when a turnover exists; otherwise Joylyn (default
      //    maintenance coordinator) for occupied/manual, unassigned + note for leasing.
      const assignee = toCoordinator ?? (source === "lu" ? null : DEFAULT_MAINT);
      const created: Array<{ gid: string; name: string; url: string }> = [];
      for (const it of items) {
        if (!it.ticket) continue;
        const label = String(it.item ?? "Issue");
        const note = String(it.note ?? "").trim();
        const name = `${note ? note : label} // ${address}`.slice(0, 250);
        const sub = await asana("POST", `/tasks/${anchorGid}/subtasks`, {
          name,
          ...(assignee ? { assignee: assignee.gid } : {}),
          due_on: dueOn,
          notes: `Found on site visit (${today.toISOString().slice(0, 10)}).\nChecklist item: ${label}${note ? `\nNote: ${note}` : ""}\nPhotos on the site visit subtask.${assignee ? assignee === DEFAULT_MAINT ? "\nAssigned to the default maintenance coordinator; reroute if this property has someone else." : "" : "\nNo Turn Over task found for this property. Assign to your Turn Over Coordinator."}`,
        });
        created.push({ gid: sub.gid, name: sub.name, url: `https://app.asana.com/0/0/${sub.gid}` });
      }

      // 6) post the checklist comment on the inspection subtask
      const bySection: Record<string, string[]> = {};
      for (const it of items) {
        const sec = String(it.section ?? "CHECKLIST");
        const mark = it.answer === "yes" ? (it.pf ? "(PASS)" : "(Y)") :
                     it.answer === "no" ? (it.pf ? "(FAIL)" : "(N)") : "(na)";
        const note = String(it.note ?? "").trim();
        (bySection[sec] = bySection[sec] || []).push(
          `${mark} ${it.item}${note ? ` -- ${note}` : ""}${it.ticket ? " [ticket created]" : ""}`);
      }
      const lines: string[] = [`SITE VISIT -- ${today.toISOString().slice(0, 10)} (via site visit tool)`, ""];
      for (const sec of Object.keys(bySection)) { lines.push(sec); lines.push(...bySection[sec]); lines.push(""); }
      if (generalNote) { lines.push("Notes:"); lines.push(generalNote); lines.push(""); }
      lines.push(`RESULT: ${created.length ? `${created.length} issue subtask(s) created${assignee ? `, assigned to ${assignee.name}` : ""}` : "All good, no issues found"}`);
      const story = await asana("POST", `/tasks/${inspection.gid}/stories`, { text: lines.join("\n") });

      // 7) bump the inspection subtask's due date to the next Slot 1 weekday.
      //    Slot 1 is free text ("Tuesday 10-11am"); blank or no weekday = leave as is.
      let inspectionDueOn: string | null = null;
      const wd = slot1 ? weekdayFromText(slot1) : null;
      if (wd !== null) {
        try {
          const local = new Date(Date.now() - 7 * 3600 * 1000); // Seattle-ish day boundary
          let add = (wd - local.getUTCDay() + 7) % 7;
          if (add === 0) add = 7; // visit happened today; due date is NEXT week's slot
          local.setUTCDate(local.getUTCDate() + add);
          inspectionDueOn = local.toISOString().slice(0, 10);
          await asana("PUT", `/tasks/${inspection.gid}`, { due_on: inspectionDueOn });
        } catch { inspectionDueOn = null; /* non-fatal */ }
      }

      return j(headers, 200, {
        ok: true,
        inspectionGid: inspection.gid,
        inspectionUrl: `https://app.asana.com/0/0/${inspection.gid}`,
        storyGid: story?.gid ?? null,
        subtasks: created,
        assignee: assignee ? assignee.name : null,
        dueOn,
        inspectionDueOn,
      });
    }

    // ---------- photo: attach one jpeg to the inspection subtask ----------
    if (action === "photo") {
      const parent = String(body.parent ?? "");
      const filename = String(body.filename ?? "site-visit.jpg").replace(/[^\w.\-]/g, "_");
      const dataB64 = String(body.dataB64 ?? "");
      if (!parent || !dataB64 || dataB64.length > 8_000_000) return j(headers, 400, { error: "bad_photo" });
      const bytes = Uint8Array.from(atob(dataB64), (ch) => ch.charCodeAt(0));
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
      let siteVisitNote = "";
      const weekAgo = now - 7 * 86400000;
      const TEMPLATE = new RegExp([
        "site\\s*visit", "inspection", "activity report", "speed to lead", "listing video",
        "zillow listing", "floor plan", "bd listing", "schedule photo", "market rent",
        "go live", "property listed", "occupied showings", "brandtegic", "move out cleaning",
        "^={2,}", // section headers
        // template subtasks all follow the "Verb | Thing" convention
        "^(email|update|review|confirm|schedule|assign|record|respond|decide|prepare|upload|receive|add|send|notify|cancel|deposit|conduct|request|go)\\s*\\|",
      ].join("|"), "i");
      const fmtSub = (tag: string) => (s: { name: string; assignee?: { name: string } | null; due_on?: string | null }) => {
        const bits = [s.assignee?.name ? `assigned ${s.assignee.name}` : "", s.due_on ? `due ${s.due_on}` : ""].filter(Boolean).join(", ");
        return s.name + (bits ? ` (${bits})` : "") + tag;
      };
      const recentOnly = (s: { name: string; created_at: string }) => Date.parse(s.created_at) >= weekAgo && !TEMPLATE.test(s.name);
      try {
        const subs = await asana("GET", `/tasks/${taskGid}/subtasks?limit=100&opt_fields=name,created_at,assignee.name,due_on`);
        recentSubtasks = (subs ?? []).filter(recentOnly).map(fmtSub(""));
        const insp = (subs ?? []).find((s: { name: string }) => /site\s*visit/i.test(s.name));
        if (insp) {
          const stories = await asana("GET", `/tasks/${insp.gid}/stories?limit=100&opt_fields=type,text`);
          const comments = (stories ?? []).filter((st: { type: string }) => st.type === "comment");
          if (comments.length) {
            let txt = String(comments[comments.length - 1].text ?? "");
            const m = txt.match(/Notes:\s*([\s\S]*?)(?:\n\s*\n|$)/);
            const r = txt.match(/RESULT:[^\n]*/);
            if (m || r) txt = [(m ? m[1].trim() : ""), (r ? r[0] : "")].filter(Boolean).join("\n");
            siteVisitNote = txt.slice(0, 1500);
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
          (tsubs ?? []).filter(recentOnly).forEach((s: { name: string; assignee?: { name: string } | null; due_on?: string | null }) => {
            recentSubtasks.push(fmtSub(" [Turn Over]")(s));
          });
        }
      } catch { /* non-fatal */ }

      return j(headers, 200, {
        recentSubtasks,
        siteVisitNote,
        ok: true,
        name: t.name,
        state,
        daysOnMarket,
        listDate: listDate ? String(listDate).slice(0, 10) : null,
        moveIn: moveIn ? String(moveIn).slice(0, 10) : null,
        leaseSigned: leaseSigned ? String(leaseSigned).slice(0, 10) : null,
        ownerName: get(/owner name/i),
        slot1: get(/preferred showing slot 1/i),
        zillow: get(/zillow/i),
        redfin: get(/redfin/i),
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
      const story = await asana("POST", `/tasks/${war.gid}/stories`, { text: text.slice(0, 60000) });
      // roll due date to next Tuesday (Seattle-ish day boundary)
      const local = new Date(Date.now() - 7 * 3600 * 1000);
      let add = (2 - local.getUTCDay() + 7) % 7;
      if (add === 0) add = 7;
      local.setUTCDate(local.getUTCDate() + add);
      const dueOn = local.toISOString().slice(0, 10);
      try { await asana("PUT", `/tasks/${war.gid}`, { due_on: dueOn }); } catch { /* non-fatal */ }
      return j(headers, 200, {
        ok: true,
        warGid: war.gid,
        warUrl: `https://app.asana.com/0/0/${war.gid}`,
        storyGid: story?.gid ?? null,
        dueOn,
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
        const units = await allUnits();
        const m = matchUnit(units, address);
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
      return j(headers, 200, {
        ok: true,
        matchedAddress: fullAddress,
        address: fullAddress,
        beds: bedBathNum(u.UnitBedrooms),
        baths: bedBathNum(u.UnitBathrooms),
        sqft: u.UnitSize ?? null,
        description: String(u.Description ?? ""),
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
      const att = attJson.data ?? {};
      const url = att.permanent_url || att.view_url ||
        (att.gid ? `https://app.asana.com/app/asana/-/get_asset?asset_id=${att.gid}` : "");
      const label = String(body.label ?? "Inspection PDF").replace(/[^\w /-]/g, "").slice(0, 40) || "Inspection PDF";
      if (storyGid && url) {
        try {
          const st = await asana("GET", `/stories/${storyGid}?opt_fields=text`);
          await asana("PUT", `/stories/${storyGid}`, { text: `${st.text}\n\n${label}: ${url}` });
        } catch { /* comment update is best-effort; the PDF is attached either way */ }
      }
      return j(headers, 200, { ok: true, url });
    }

    return j(headers, 400, { error: "unknown_action" });
  } catch (e) {
    console.error(e);
    return j(headers, 502, { error: "asana_failed", message: "Asana didn't accept that. Try again; if it keeps failing, do this one manually and tell your lead." });
  }
});

Deno.serve(app.fetch);
