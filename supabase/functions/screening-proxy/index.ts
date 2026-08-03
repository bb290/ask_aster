// Screening Workbench proxy for the applicant screening workbench
// (saga-screening-workbench.module, internal page /workbench).
//
// READ-ONLY against Buildium in this version. No writes to Buildium, Asana, or
// anywhere else. The workbench is a decision-support queue; decisions still
// happen in Buildium/Asana and the Aster /screening skill is untouched.
//
// Actions (all staff-gated with the x-sv-key header):
//   - "queue":  pending applicant households pulled live from Buildium,
//               grouped by ApplicantGroupId (solo applicants form their own
//               group), joined with property name/city, sorted oldest first
//               (First-In-Time: the wait clock is the queue order).
//   - "detail": one household's applicants in full - contact, status,
//               applications, and document metadata when the files API
//               cooperates (it degrades to an empty list, never an error).
//
// Secrets: BUILDIUM_SCREENING_CLIENT_ID / BUILDIUM_SCREENING_CLIENT_SECRET
// (separate read-only credential from site-visit's BUILDIUM_CLIENT_ID, so
// either can be revoked without breaking the other), SCREENING_KEY (team key).
//
// Plan of record: clients/sagareus/projects/applicant-portal/PLAN.md

import { Hono } from "hono";

const B_ID = Deno.env.get("BUILDIUM_SCREENING_CLIENT_ID") ?? "";
const B_SECRET = Deno.env.get("BUILDIUM_SCREENING_CLIENT_SECRET") ?? "";
const TEAM_KEY = Deno.env.get("SCREENING_KEY") ?? "";
const ASANA_PAT = Deno.env.get("ASANA_PAT") ?? "";
const WORKSPACE = "706990140225747";
const LEASING_LU_PROJECT = "1213171756304238"; // Leasing | LU (same as site-visit-proxy)
const LEASING_HUMAN_VIEW = "1208297375044026"; // Leasing | Human View: where application tasks are homed
const PENDING_APPLICATIONS_SECTION = "1208297375044039"; // its "Pending Applications" section (per Roommate / Sublet SOP)
const ASANA = "https://app.asana.com/api/1.0";
const BUILDIUM = "https://api.buildium.com/v1";
const BH = { "x-buildium-client-id": B_ID, "x-buildium-client-secret": B_SECRET };
// Staff-facing Buildium UI deep link (not the API). Path shape mirrors the
// vendor links that appear in the SOPs; Buildium redirects within the app if
// the trailing segment drifts between versions.
const B_UI = "https://sagareus.managebuilding.com/manager/app/rentals/applicants";

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

function j(headers: Record<string, string>, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

async function bGet(path: string): Promise<unknown> {
  const res = await fetch(`${BUILDIUM}${path}`, { headers: BH });
  if (!res.ok) throw new Error(`buildium GET ${path} -> ${res.status}`);
  return res.json();
}

// Paged fetch: Buildium lists cap at limit=1000 per request; walk offsets until
// a short page. Hard stop at 2000 rows - the queue view never needs more.
async function bGetAll(path: string, pageSize = 500): Promise<unknown[]> {
  const out: unknown[] = [];
  for (let offset = 0; offset < 2000; offset += pageSize) {
    const sep = path.includes("?") ? "&" : "?";
    const page = await bGet(`${path}${sep}limit=${pageSize}&offset=${offset}`) as unknown[];
    if (!Array.isArray(page)) break;
    out.push(...page);
    if (page.length < pageSize) break;
  }
  return out;
}

type Applicant = {
  Id?: number;
  ApplicantGroupId?: number | null;
  PropertyId?: number | null;
  UnitId?: number | null;
  TenantId?: number | null;
  FirstName?: string;
  LastName?: string;
  Email?: string;
  PhoneNumbers?: { Number?: string; Type?: string }[];
  Status?: string;
  Applications?: { Id?: number; Status?: string; ApplicationDate?: string }[];
  LastUpdatedDateTime?: string;
};

type Rental = {
  Id?: number;
  Name?: string;
  Address?: { AddressLine1?: string; City?: string };
};

// Applicant statuses that mean "no longer waiting on us". Everything else is
// treated as pending and shows in the queue. Pass-through, not judgment: the
// status text itself is displayed so unexpected values are visible, not hidden.
const SETTLED = new Set([
  "approved", "rejected", "addedtolease", "cancelled", "canceled", "notneeded",
]);

async function asanaCall(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${ASANA}${path}`, {
    method,
    headers: { Authorization: `Bearer ${ASANA_PAT}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify({ data: body }) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`asana ${method} ${path} -> ${res.status}`);
  return (json as { data?: unknown }).data;
}

// Address normalization, ported from site-visit-proxy: tokenizes and expands
// abbreviations so "5200 Roosevelt Way NE #403" matches "5200 Roosevelt Way
// Northeast Apt 403".
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
    if ((w === "unit" || w === "apt" || w === "ste" || w === "suite") && raw[i + 1]) {
      out.push("#" + raw[++i].replace(/^#/, ""));
      continue;
    }
    w = ADDR_EXPAND[w] ?? w;
    if (w === "wa" || w === "washington") continue;
    if (i > 0 && /^9\d{4}(-\d{4})?$/.test(w)) continue;
    out.push(w);
  }
  return out;
}
function normAddr(s: string): string {
  return addrTokens(s).join(" ");
}
function addressFromTaskName(name: string): string {
  const afterBar = name.includes("|") ? name.split("|").slice(1).join("|").trim() : name.trim();
  return afterBar.split(" - ")[0].trim();
}

// Open LU/TP/PreLease tasks from the Leasing | LU project via paged listing
// (workspace search caps at 100 recently-modified results and silently drops
// tasks; see the same warning in site-visit-proxy).
let luCache: { at: number; tasks: Array<{ gid: string; name: string; address: string }> } | null = null;
async function openLuTasks(): Promise<Array<{ gid: string; name: string; address: string }>> {
  if (luCache && Date.now() - luCache.at < 2 * 60 * 1000) return luCache.tasks;
  const out: Array<{ gid: string; name: string; address: string }> = [];
  let offset = "";
  for (let page = 0; page < 12; page++) {
    const res = await fetch(
      `${ASANA}/projects/${LEASING_LU_PROJECT}/tasks?completed=false&limit=100&opt_fields=name,completed${offset ? `&offset=${encodeURIComponent(offset)}` : ""}`,
      { headers: { Authorization: `Bearer ${ASANA_PAT}` } },
    );
    const json = await res.json().catch(() => ({})) as {
      data?: Array<{ gid: string; name: string; completed?: boolean }>;
      next_page?: { offset?: string } | null;
    };
    if (!res.ok) throw new Error(`asana lu page ${page}`);
    for (const t of json.data ?? []) {
      if (t.completed) continue;
      if (!/^(LU|TP|PreLease)\s*\|/i.test(t.name)) continue;
      const address = addressFromTaskName(t.name);
      if (!address || address.includes("<")) continue;
      out.push({ gid: t.gid, name: t.name, address });
    }
    offset = json.next_page?.offset ?? "";
    if (!offset) break;
  }
  luCache = { at: Date.now(), tasks: out };
  return out;
}

// Best LU parent for a Buildium address: exact normalized match, else same
// street number with at most one unmatched token.
function matchLu(tasks: Array<{ gid: string; name: string; address: string }>, target: string):
  { hit?: { gid: string; name: string; address: string }; near: string[] } {
  const t = addrTokens(target);
  if (!t.length) return { near: [] };
  const wanted = t.join(" ");
  const exact = tasks.find((k) => normAddr(k.address) === wanted);
  if (exact) return { hit: exact, near: [] };
  const cands = tasks.filter((k) => {
    const kt = addrTokens(k.address);
    if (kt[0] !== t[0]) return false;
    const set = new Set(kt);
    return t.filter((w) => !set.has(w)).length <= 1;
  });
  if (cands.length === 1) return { hit: cands[0], near: [] };
  return { near: cands.slice(0, 3).map((c) => c.address) };
}

// Find the household's Asana application task. The SOP template names tasks
// "Application // <names>" (older ones "<Application> // <names>") in the
// Leasing project, so typeahead on the applicant's name and keep tasks whose
// name mentions "application". Best-effort: no PAT or no match returns [].
async function findAsanaTasks(names: string[]): Promise<{ name: string; url: string; completed: boolean }[]> {
  if (!ASANA_PAT) return [];
  const seen = new Map<string, { name: string; url: string; completed: boolean }>();
  for (const q of names.slice(0, 4)) {
    try {
      const u = `https://app.asana.com/api/1.0/workspaces/${WORKSPACE}/typeahead?resource_type=task&query=${
        encodeURIComponent(q)
      }&count=10&opt_fields=name,permalink_url,completed`;
      const res = await fetch(u, { headers: { Authorization: `Bearer ${ASANA_PAT}` } });
      if (!res.ok) continue;
      const data = (await res.json())?.data as { gid?: string; name?: string; permalink_url?: string; completed?: boolean }[];
      for (const t of data ?? []) {
        if (!t.gid || !t.name || !t.permalink_url) continue;
        if (!/application/i.test(t.name)) continue;
        seen.set(t.gid, { name: t.name, url: t.permalink_url, completed: !!t.completed });
      }
    } catch { /* best-effort */ }
  }
  return [...seen.values()].slice(0, 5);
}

function fullName(a: Applicant): string {
  return [a.FirstName, a.LastName].filter(Boolean).join(" ").trim() || "Unnamed";
}

function newestDate(as: Applicant[]): string {
  return as.map((a) => a.LastUpdatedDateTime ?? "").sort().at(-1) ?? "";
}

function oldestApplication(as: Applicant[]): string {
  const dates = as.flatMap((a) => (a.Applications ?? []).map((ap) => ap.ApplicationDate ?? ""))
    .filter(Boolean).sort();
  return dates[0] ?? "";
}

app.options("*", (c) => new Response(null, { status: 204, headers: corsHeaders(c.req.header("origin")) }));

app.post("*", async (c) => {
  const origin = c.req.header("origin");
  const headers = corsHeaders(origin);
  if (origin) {
    const ok = ALLOWED_ORIGINS.includes(origin) ||
      origin.endsWith(".sagareus.com") || origin.endsWith(".hs-sites.com") ||
      origin.endsWith(".hubspotpagebuilder.com");
    if (!ok) return j(headers, 403, { error: "origin_not_allowed" });
  }
  if (!TEAM_KEY || c.req.header("x-sv-key") !== TEAM_KEY) {
    return j(headers, 401, { error: "bad_key", message: "Team key missing or wrong. Check the module's Internal Key field." });
  }
  if (!B_ID || !B_SECRET) {
    return j(headers, 500, { error: "buildium_not_configured", message: "Buildium screening keys are not set up yet." });
  }

  let body: { action?: string; applicantIds?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return j(headers, 400, { error: "bad_json" });
  }
  const action = String(body.action ?? "");

  try {
    // ---------- queue: pending households, oldest first ----------
    if (action === "queue") {
      // Buildium returns applicants OLDEST-FIRST and this portfolio has years
      // of them, so an unfiltered page walk returns 2020-2023 rows and never
      // reaches the live pipeline. lastupdatedfrom (verified 2026-08-03) makes
      // Buildium do the 90-day cut server-side.
      const fromDate = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
      const [applicants, rentals] = await Promise.all([
        bGetAll(`/applicants?lastupdatedfrom=${fromDate}`) as Promise<Applicant[]>,
        bGetAll("/rentals") as Promise<Rental[]>,
      ]);
      const propName = new Map<number, { name: string; city: string }>();
      for (const r of rentals) {
        if (r.Id != null) {
          propName.set(r.Id, {
            name: r.Name || r.Address?.AddressLine1 || `Property ${r.Id}`,
            city: r.Address?.City ?? "",
          });
        }
      }

      // 90-day window (Brittany, 2026-08-03): only surface applications with
      // activity in the last 90 days. Application date when Buildium has one,
      // otherwise last-updated. Older deferred/stale applicants stay in
      // Buildium but out of the queue.
      const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
      const recent = (a: Applicant) => {
        const applied = (a.Applications ?? []).map((ap) => ap.ApplicationDate ?? "").sort().at(-1) ?? "";
        return (applied || a.LastUpdatedDateTime || "") >= cutoff;
      };
      const pending = applicants.filter((a) =>
        !SETTLED.has((a.Status ?? "").toLowerCase()) && recent(a)
      );

      // Group households. ApplicantGroupId when Buildium assigned one;
      // otherwise the applicant is their own group.
      const groups = new Map<string, Applicant[]>();
      for (const a of pending) {
        const key = a.ApplicantGroupId != null ? `g${a.ApplicantGroupId}` : `a${a.Id}`;
        (groups.get(key) ?? groups.set(key, []).get(key)!).push(a);
      }

      const queue = [...groups.entries()].map(([key, members]) => {
        const prop = members[0].PropertyId != null ? propName.get(members[0].PropertyId) : undefined;
        return {
          key,
          household: members.map(fullName).join(" + "),
          applicants: members.map((a) => ({
            id: a.Id,
            name: fullName(a),
            email: a.Email ?? "",
            status: a.Status ?? "",
          })),
          propertyId: members[0].PropertyId ?? null,
          property: prop?.name ?? "",
          city: prop?.city ?? "",
          unitId: members[0].UnitId ?? null,
          applied: oldestApplication(members),
          updated: newestDate(members),
        };
      });

      // Oldest application first (First-In-Time). The list endpoint often has
      // no application dates, so fall back to most recently updated first,
      // which is the useful triage order for the team.
      queue.sort((a, b) => {
        if (a.applied || b.applied) return (a.applied || "9999") < (b.applied || "9999") ? -1 : 1;
        return a.updated > b.updated ? -1 : 1;
      });

      return j(headers, 200, { queue, counts: { pending: queue.length, applicants: pending.length } });
    }

    // ---------- detail: one household in full ----------
    if (action === "detail") {
      const ids = (Array.isArray(body.applicantIds) ? body.applicantIds : [])
        .map((x) => parseInt(String(x), 10)).filter((n) => Number.isFinite(n) && n > 0);
      if (!ids.length || ids.length > 10) {
        return j(headers, 400, { error: "bad_applicant_ids", message: "Pass 1-10 applicant IDs." });
      }

      const members = await Promise.all(ids.map(async (id) => {
        const a = await bGet(`/applicants/${id}`) as Applicant;
        // Files metadata is best-effort: the exact filter params are unverified
        // against this account, so a failure degrades to an empty list.
        let files: { id?: number; title?: string; type?: string; size?: number; uploaded?: string }[] = [];
        try {
          const fs = await bGet(`/files?entitytype=Applicant&entityid=${id}&limit=50`) as {
            Id?: number; Title?: string; ContentType?: string; Size?: number; UploadedDateTime?: string;
          }[];
          if (Array.isArray(fs)) {
            files = fs.map((f) => ({
              id: f.Id, title: f.Title ?? "", type: f.ContentType ?? "",
              size: f.Size, uploaded: f.UploadedDateTime ?? "",
            }));
          }
        } catch { /* files stay empty */ }
        return {
          id: a.Id,
          name: fullName(a),
          email: a.Email ?? "",
          phones: (a.PhoneNumbers ?? []).map((p) => p.Number ?? "").filter(Boolean),
          status: a.Status ?? "",
          applications: (a.Applications ?? []).map((ap) => ({
            id: ap.Id, status: ap.Status ?? "", date: ap.ApplicationDate ?? "",
          })),
          updated: a.LastUpdatedDateTime ?? "",
          files,
        };
      }));

      const asana = await findAsanaTasks(members.map((m) => m.name).filter((n) => n !== "Unnamed"));
      return j(headers, 200, { members, asana });
    }

    // ---------- createTask: file the household's application task in Asana ----------
    // The household is whoever the assistant loaded: all adults on the
    // application share ONE task (Brittany, 2026-08-03). Name template:
    //   Application / <names> / <address>
    // Description: Buildium application links + each applicant's contact.
    // Created as a subtask of the matching open LU/TP/PreLease task.
    // dryRun:true resolves everything and creates nothing.
    if (action === "createTask") {
      const ids = (Array.isArray(body.applicantIds) ? body.applicantIds : [])
        .map((x) => parseInt(String(x), 10)).filter((n) => Number.isFinite(n) && n > 0);
      if (!ids.length || ids.length > 10) {
        return j(headers, 400, { error: "bad_applicant_ids", message: "Pass 1-10 applicant IDs." });
      }
      const dryRun = (body as { dryRun?: unknown }).dryRun === true;

      const members = await Promise.all(ids.map((id) => bGet(`/applicants/${id}`) as Promise<Applicant>));
      const names = members.map(fullName).filter((n) => n !== "Unnamed");
      if (!names.length) return j(headers, 400, { error: "no_names", message: "Buildium has no names for these applicants." });

      // Address: unit record when the applicant has one (LU tasks are per
      // unit), property record otherwise.
      let address = "";
      const unitId = members[0].UnitId, propId = members[0].PropertyId;
      if (unitId != null) {
        try {
          const u = await bGet(`/rentals/units/${unitId}`) as { UnitNumber?: string; Address?: { AddressLine1?: string; City?: string } };
          const line = u.Address?.AddressLine1 ?? "";
          const num = u.UnitNumber && line && !line.includes(String(u.UnitNumber)) ? ` #${u.UnitNumber}` : "";
          address = line ? `${line}${num}${u.Address?.City ? ", " + u.Address.City : ""}` : "";
        } catch { /* fall through to property */ }
      }
      if (!address && propId != null) {
        try {
          const p = await bGet(`/rentals/${propId}`) as Rental;
          address = p.Address?.AddressLine1 ? `${p.Address.AddressLine1}${p.Address.City ? ", " + p.Address.City : ""}` : (p.Name ?? "");
        } catch { /* stays empty */ }
      }
      // Duplicate guard: an existing open application task for this household wins.
      const existing = (await findAsanaTasks(names)).filter((t) => !t.completed);
      if (existing.length) {
        return j(headers, 200, { created: false, existing: existing[0], message: "An open application task already exists." });
      }

      // Three creation modes (Brittany, 2026-08-03). Every path files a task;
      // nothing bounces back to "create it by hand".
      //   lu       - address matched an open LU/TP/PreLease task: subtask of it.
      //   pending  - no property on the application: standalone task in
      //              Leasing | Human View with an address-confirmation email
      //              draft for the applicant (drafts only; a human sends it).
      //   roommate - address but no open lease-up: standalone task flagged for
      //              the Roommate / Sublet SOP (roommate addendum template).
      let mode: "lu" | "pending" | "roommate" = "pending";
      let luHit: { gid: string; name: string } | null = null;
      if (address) {
        const lu = matchLu(await openLuTasks(), address);
        if (lu.hit) { mode = "lu"; luHit = lu.hit; } else mode = "roommate";
      }

      const streetOnly = address ? address.split(",")[0].trim() : "Property Pending";

      // Per-property application numbering (Brittany, 2026-08-03): the Nth
      // application received for a property is labeled so First-In-Time order
      // is visible at a glance ("2nd Application", "3rd Application" - the
      // convention already in the project). Count = existing application
      // subtasks under the LU parent, completed included (they were received).
      let ordinal = "";
      if (mode === "lu" && luHit) {
        try {
          const subs = await asanaCall("GET", `/tasks/${luHit.gid}/subtasks?limit=100&opt_fields=name`) as { name?: string }[];
          const prior = (subs ?? []).filter((s) =>
            /application/i.test(s.name ?? "") && !/roommate addendum/i.test(s.name ?? "")
          ).length;
          const n = prior + 1;
          if (n > 1) {
            const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
            ordinal = `${n}${suffix} `;
          }
        } catch { /* numbering is best-effort; an unlabeled task beats no task */ }
      }

      // Roommate mode uses its own template per the Roommate / Sublet SOP.
      const taskName = mode === "roommate"
        ? `Roommate Addendum // ${streetOnly}`
        : `${ordinal}Application / ${names.join(" + ")} / ${streetOnly}`;
      // html_notes is parsed as XML by Asana; escape user-derived text.
      const x = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const contactHtml = members.map((m) => {
        const phones = (m.PhoneNumbers ?? []).map((p) => p.Number ?? "").filter(Boolean).join(", ");
        return `<strong>${x(fullName(m))}</strong>\n` +
          `Email: ${x(m.Email ?? "none on file")}\n` +
          `Phone: ${x(phones || "none on file")}\n` +
          `Buildium: <a href="${B_UI}/${m.Id}/summary">${B_UI}/${m.Id}/summary</a>`;
      }).join("\n\n");

      let extra = "";
      if (mode === "pending") {
        // Address-confirmation email draft, ready to copy into leasing@.
        // Sagareus voice: no em dashes; signature per the Initial Review SOP
        // email template. DRAFT ONLY - a human reviews and sends.
        const first = members.map((m) => x(m.FirstName ?? "")).filter(Boolean).join(" and ") || "there";
        extra = `\n<strong>PROPERTY ADDRESS PENDING</strong>\n` +
          `This application arrived without a property attached in Buildium. ` +
          `Confirm the address with the applicant, set it in Buildium, then move this task under the right LU task.\n\n` +
          `<strong>Email draft (send from leasing@sagareus.com)</strong>\n` +
          `Subject: Your Sagareus application, one quick question\n\n` +
          `Hi ${first},\n\n` +
          `Thanks for applying with Sagareus! Your application came through without a property attached, ` +
          `so we want to confirm which home you are applying for. Reply with the property address ` +
          `(including the unit number if there is one) and we will keep your application moving right away.\n\n` +
          `Applications are reviewed in the order they are completed, so a quick reply keeps your place in line.\n\n` +
          `Best regards,\nMary + Bryan\nSagareus Leasing Support Team\nleasing@sagareus.com\nCall/Text: 425-390-8122\n`;
      } else if (mode === "roommate") {
        extra = `\n<strong>ROOMMATE ADDENDUM PATH</strong>\n` +
          `No open LU / TP / PreLease task matched ${x(address)}, so this applicant is likely ` +
          `joining an existing tenancy. Per the Roommate / Sublet SOP:\n` +
          `1. Same screening procedures as an initial application: charge the fee, request proof of income, review for completeness, verify income standards\n` +
          `2. PandaDoc: Templates, Lease + Move In Instructions folder, Roommate Addendum; send to all existing and new residents for e-signature\n` +
          `3. Attach the signed addendum to the Lease Record in Buildium\n` +
          `4. Apply the $200 Change in Occupancy Fee to the existing resident's ledger, category Admin CC (EXCEPT in Seattle)\n`;
      }

      const notes = `<body><strong>Applicant contact details</strong>\n\n${contactHtml}\n${extra}\n` +
        `Created from the Screening Workbench. Buildium is the system of record for documents.</body>`;

      if (dryRun) {
        return j(headers, 200, {
          created: false, dryRun: true, mode, wouldCreate: taskName,
          parent: luHit ? { gid: luHit.gid, name: luHit.name } : null,
        });
      }

      // Standalone modes land in the Pending Applications section; roommate
      // gets the SOP's 2-day due date (Seattle-ish date math, same as
      // site-visit-proxy).
      const due = new Date(Date.now() + 2 * 86400000 - 7 * 3600 * 1000).toISOString().slice(0, 10);
      const made = (mode === "lu" && luHit
        ? await asanaCall("POST", `/tasks/${luHit.gid}/subtasks`, { name: taskName, html_notes: notes })
        : await asanaCall("POST", `/tasks`, {
          name: taskName,
          html_notes: notes,
          memberships: [{ project: LEASING_HUMAN_VIEW, section: PENDING_APPLICATIONS_SECTION }],
          ...(mode === "roommate" ? { due_on: due } : {}),
        })
      ) as { gid?: string; permalink_url?: string; name?: string };

      const note = mode === "pending"
        ? "Property pending: the task is in Pending Applications with an email draft to confirm the address with the applicant."
        : mode === "roommate"
        ? "No open lease-up matched: filed as Roommate Addendum in Pending Applications, due in 2 days, per the Roommate / Sublet SOP."
        : undefined;

      return j(headers, 200, {
        created: true, mode,
        task: { name: made.name ?? taskName, url: made.permalink_url ?? "" },
        parent: luHit ? { name: luHit.name } : null,
        note,
      });
    }

    return j(headers, 400, { error: "unknown_action" });
  } catch (e) {
    console.error(`screening-proxy ${action} failed:`, e);
    return j(headers, 502, { error: "buildium_failed", message: "Buildium did not answer. Try again in a minute." });
  }
});

Deno.serve(app.fetch);
