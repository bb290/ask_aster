// Screening Workbench proxy (saga-screening-workbench.module, /workbench).
//
// Current workflow (Brittany, 2026-08-04) - task-first, three steps:
//   - "screenTask":   Asana task URL in -> downloads the task's attachments
//                     (PDFs pass through to the model natively; prior-
//                     underwriting and restricted-screening files skipped by
//                     name), model transcribes figures, engine.ts computes,
//                     plain-text report returned for editing. No writes.
//   - "submitReport": posts the (edited) report as a comment, retitles the
//                     task 'Pending Mgr Review | ...', assigns Courtney
//                     Mon-Thu / Brittany Fri-Sun, due today.
//   - "underwrite":   structured household in -> engine result out.
//
// Dormant (kept for the future Pending Manager Review view; UI no longer
// calls them): "queue", "detail", "createTask", "setStatus", "screen".
//
// Secrets: BUILDIUM_SCREENING_CLIENT_ID/_SECRET (dormant actions),
// SCREENING_KEY (team key), ASANA_PAT, OPENROUTER_API_KEY, PARSE_MODEL
// (optional override; defaults to anthropic/claude-fable-5).
//
// Plan of record: clients/sagareus/projects/applicant-portal/PLAN.md

import { Hono } from "hono";
import { underwrite, type HouseholdInput } from "./engine.ts";
import { imageAsExtracted, isPriorUnderwritingDoc, isRestrictedDoc, mdToAsanaHtml, parseDocuments, pdfAsExtracted, renderReport, type Extracted } from "./screen.ts";
import { buildDecision, DECISION_OPTIONS, type Decision } from "./decide.ts";
import {
  extractDeclaredAdults, initialName, ledgerInsertApplicant, ledgerInsertHousehold,
  ledgerOpenHouseholds, ledgerSeenApplicants, ledgerUpdateHousehold, namesMatch,
  parseRoster, type RosterEntry,
} from "./intake.ts";

const B_ID = Deno.env.get("BUILDIUM_SCREENING_CLIENT_ID") ?? "";
const B_SECRET = Deno.env.get("BUILDIUM_SCREENING_CLIENT_SECRET") ?? "";
const TEAM_KEY = Deno.env.get("SCREENING_KEY") ?? "";
const ASANA_PAT = Deno.env.get("ASANA_PAT") ?? "";
const WORKSPACE = "706990140225747";
const LEASING_LU_PROJECT = "1213171756304238"; // Leasing | LU (same as site-visit-proxy)
const LEASING_HUMAN_VIEW = "1208297375044026"; // Leasing | Human View: where application tasks are homed
const PENDING_APPLICATIONS_SECTION = "1208297375044039"; // its "Pending Applications" section (per Roommate / Sublet SOP)
const PENDING_APPS_PROJECT = "1217174650640596"; // Leasing | Pending Applications (stage lens, 2026-08-04)
const PENDING_MGR_SECTION = "1217174694944319"; // its "Pending Mgr" section: the mgrQueue source of truth
// Decision -> destination section in Leasing | Pending Applications:
//   approved as-is / negotiate / owner-exception / other -> Approved
//   approved pending Section 8                            -> Pending Docs / Co-Signer / Sec 8
//   insufficient (all options)                            -> Pending Docs / Co-Signer / Sec 8
//   declined (all options)                                -> Complete
const SEC_APPROVED = "1217174603997588";
const SEC_PENDING_DOCS = "1217174650703534";
const SEC_COMPLETE = "1217174603984367";
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
          buildium: `${B_UI}/${a.Id}/summary`,
        };
      }));

      const asana = await findAsanaTasks(members.map((m) => m.name).filter((n) => n !== "Unnamed"));
      return j(headers, 200, { members, asana });
    }

    // ---------- screenTask: Asana task in, editable report out ----------
    // Revised workflow (Brittany, 2026-08-04): the Asana task is the entry
    // point, exactly like the /screening skill. Reads the task's attachments,
    // runs the same extract -> transcribe -> engine -> render pipeline, and
    // returns the report TEXT for the assistant to review and edit in the
    // widget. Writes nothing; submitReport does the writes.
    if (action === "screenTask") {
      const taskUrl = String((body as { taskUrl?: unknown }).taskUrl ?? "");
      const gid = (taskUrl.match(/task\/(\d+)/) ?? taskUrl.match(/\/(\d{12,})/))?.[1];
      if (!gid) return j(headers, 400, { error: "bad_task_url", message: "Paste the full Asana task link." });

      let task: { gid?: string; name?: string; notes?: string; permalink_url?: string };
      try {
        task = await asanaCall("GET", `/tasks/${gid}?opt_fields=name,notes,permalink_url`) as typeof task;
      } catch {
        return j(headers, 404, { error: "task_not_found", message: "Could not open that Asana task. Check the link." });
      }

      const atts = (await asanaCall("GET", `/tasks/${gid}/attachments?opt_fields=name,download_url,size&limit=50`)
        .catch(() => [])) as { gid?: string; name?: string; download_url?: string; size?: number }[];
      if (!atts?.length) {
        return j(headers, 422, { error: "no_attachments", message: "The task has no attachments. Attach the credit report and income documents first." });
      }

      const skipped: string[] = [];
      const failures: string[] = [];
      const docs: Extracted[] = [];
      let totalBytes = 0;
      // PDFs pass through to the model natively; no local parsing or
      // rasterizing. The wasm cascade blew the edge worker's memory/CPU on
      // real-world scans twice on 2026-08-04; the model reads PDFs itself.
      for (const a of atts) {
        const name = a.name ?? "attachment";
        if (isPriorUnderwritingDoc(name)) { skipped.push(name); continue; }
        if (!a.download_url) { failures.push(`${name}: no download URL (external link?)`); continue; }
        if ((a.size ?? 0) > 15 * 1024 * 1024) { failures.push(`${name}: over 15 MB, attach a smaller copy`); continue; }
        try {
          const fr = await fetch(a.download_url);
          if (!fr.ok) { failures.push(`${name}: download ${fr.status}`); continue; }
          const bytes = new Uint8Array(await fr.arrayBuffer());
          totalBytes += bytes.byteLength;
          if (totalBytes > 22 * 1024 * 1024) { failures.push(`${name}: total size cap reached, screen it in a second pass`); continue; }
          const ct = (fr.headers.get("content-type") ?? "").toLowerCase();
          if (ct.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(name)) docs.push(imageAsExtracted(bytes, name));
          else docs.push(pdfAsExtracted(bytes, name));
        } catch {
          failures.push(`${name}: download failed`);
        }
      }
      for (const d of docs) if (d.kind === "failed") failures.push(`${d.name}: ${(d as { error: string }).error}`);
      const readable = docs.filter((d) => d.kind !== "failed");
      if (!readable.length) {
        return j(headers, 422, { error: "nothing_readable", message: "No attachment could be read. Check the files on the task." });
      }

      let parsed;
      try {
        parsed = await parseDocuments(
          readable,
          `Asana task: "${task.name ?? ""}". Task notes (assistant prep):\n${(task.notes ?? "").slice(0, 3000)}\nApplicant names come from the task name and the documents.`,
        );
      } catch (e) {
        console.error("screenTask parse failed:", e);
        const detail = String((e as Error).message ?? "").slice(0, 220);
        return j(headers, 502, {
          error: "parse_failed",
          message: `Document reading failed${detail ? ` (${detail})` : ""}. If this mentions pages or size, remove the largest attachment and rerun; otherwise try again in a minute.`,
        });
      }
      const asOf = new Date(Date.now() - 7 * 3600 * 1000).toISOString().slice(0, 10); // Seattle-ish
      const result = underwrite({ applicants: parsed.applicants, asOf });

      const integrityFlags: string[] = [];
      for (const s of skipped) {
        integrityFlags.push(isRestrictedDoc(s)
          ? `Skipped "${s}" unread. Restricted screening content is not considered.`
          : `Skipped "${s}" unread. Prior-underwriting reports have known calculation errors; figures re-derived from source documents.`);
      }
      for (const f of failures) integrityFlags.push(`Attachment not read: ${f}.`);

      const lastNames = parsed.applicants.map((a) => a.name.split(" ").at(-1) ?? "").join("-").toUpperCase().slice(0, 24);
      const reportId = `SW-${asOf.replace(/-/g, "")}-${lastNames || gid.slice(-6)}`;
      const report = renderReport(result, parsed, { reportId, date: asOf, integrityFlags });

      return j(headers, 200, {
        report, reportId, result,
        warnings: parsed.warnings,
        files: { read: readable.map((d) => d.name), skipped, failed: failures },
        task: { gid, name: task.name ?? "", url: task.permalink_url ?? taskUrl },
      });
    }

    // ---------- intake: automated new-application scanner ----------
    // See intake.ts header for the rules. {propertyFilter} scopes a run to
    // properties whose name/address contains the string (test runs);
    // {dryRun} resolves everything and writes nothing.
    if (action === "intake") {
      const dryRun = (body as { dryRun?: unknown }).dryRun === true;
      const propertyFilter = String((body as { propertyFilter?: unknown }).propertyFilter ?? "").trim().toLowerCase();
      const summary = { created: [] as string[], attached: [] as string[], completed: [] as string[], nudged: [] as string[], flagged: [] as string[], errors: [] as string[] };
      try {
        // 30-day window on SUBMISSION date (Brittany, 2026-08-05): lastupdatedfrom
        // alone let in old applications whose records were touched recently.
        const fromDate = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
        const submittedCutoff = new Date(Date.now() - 30 * 86400000).toISOString();
        const [applicants, rentals] = await Promise.all([
          bGetAll(`/applicants?lastupdatedfrom=${fromDate}`) as Promise<Applicant[]>,
          bGetAll("/rentals") as Promise<Rental[]>,
        ]);
        const rentalById = new Map<number, Rental>();
        for (const r of rentals) if (r.Id != null) rentalById.set(r.Id, r);
        const propOk = (pid: number | null | undefined) => {
          if (!propertyFilter) return true;
          if (pid == null) return false;
          const r = rentalById.get(pid);
          const hay = `${r?.Name ?? ""} ${r?.Address?.AddressLine1 ?? ""} ${r?.Address?.City ?? ""}`.toLowerCase();
          return hay.includes(propertyFilter);
        };

        const seen = await ledgerSeenApplicants();
        const households = await ledgerOpenHouseholds();

        // Candidates: submitted, New/Undecided, not yet in the ledger,
        // processed in submission order so ordinals come out right.
        const cands = applicants
          .filter((a) => ["new", "undecided"].includes((a.Status ?? "").toLowerCase()))
          .filter((a) => (a.Applications ?? []).some((ap) => {
            const sub = (ap as { ApplicationSubmittedDateTime?: string }).ApplicationSubmittedDateTime;
            return sub != null && sub >= submittedCutoff;
          }))
          .filter((a) => a.Id != null && !seen.has(a.Id))
          .filter((a) => propOk(a.PropertyId))
          .sort((x, y) => {
            const dx = ((x.Applications ?? [])[0] as { ApplicationSubmittedDateTime?: string })?.ApplicationSubmittedDateTime ?? "";
            const dy = ((y.Applications ?? [])[0] as { ApplicationSubmittedDateTime?: string })?.ApplicationSubmittedDateTime ?? "";
            return dx < dy ? -1 : 1;
          });

        const flipUndecided = async (a: Applicant) => {
          for (const ap of a.Applications ?? []) {
            if (ap.Id == null) continue;
            const st = ((ap as { ApplicationStatus?: string }).ApplicationStatus ?? ap.Status ?? "");
            if (st !== "Undecided") {
              await fetch(`${BUILDIUM}/applicants/${a.Id}/applications/${ap.Id}`, {
                method: "PUT", headers: { ...BH, "Content-Type": "application/json" },
                body: JSON.stringify({ ApplicationStatus: "Undecided" }),
              }).catch(() => {});
            }
          }
        };

        // On attach, the description's "Application pending" line for this
        // adult becomes their full contact block (Brittany, 2026-08-05);
        // falls back to appending before Next steps if staff edited the text.
        const updateDescriptionForAttach = async (taskGid: string, declaredName: string | null, contactHtml: string) => {
          const cur = await asanaCall("GET", `/tasks/${taskGid}?opt_fields=html_notes`) as { html_notes?: string };
          let bodyHtml = cur.html_notes ?? "<body></body>";
          const x = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          let replaced = false;
          if (declaredName) {
            const pat = `<strong>${x(declaredName)}</strong>\nApplication pending`;
            if (bodyHtml.includes(pat)) {
              bodyHtml = bodyHtml.replace(pat, contactHtml);
              replaced = true;
            }
          }
          if (!replaced) {
            if (bodyHtml.includes("<strong>Next steps</strong>")) {
              bodyHtml = bodyHtml.replace("<strong>Next steps</strong>", `${contactHtml}\n\n<strong>Next steps</strong>`);
            } else {
              bodyHtml = bodyHtml.replace("</body>", `\n\n${contactHtml}</body>`);
            }
          }
          await asanaCall("PUT", `/tasks/${taskGid}`, { html_notes: bodyHtml });
        };

        const contactBlock = (a: Applicant) => {
          const phones = (a.PhoneNumbers ?? []).map((p) => p.Number ?? "").filter(Boolean).join(", ");
          const x = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          return `<strong>${x(fullName(a))}</strong>\nEmail: ${x(a.Email ?? "none on file")}\nPhone: ${x(phones || "none on file")}\nBuildium: <a href="${B_UI}/${a.Id}/summary">${B_UI}/${a.Id}/summary</a>`;
        };

        for (const a of cands) {
          try {
            const appId = (a.Applications ?? [])[0]?.Id;
            const application = appId != null ? await bGet(`/applicants/${a.Id}/applications/${appId}`) : null;
            const declared = application ? extractDeclaredAdults(application) : null;
            const declaredNames = declared ? parseRoster(declared) : [];
            const self = fullName(a);
            if (!declaredNames.some((n) => namesMatch(n, self))) declaredNames.unshift(self);
            // Dedupe phantom entries: a single-token declared name ("Linda")
            // that matches the first name of a fuller entry is the same person.
            const deduped = declaredNames.filter((n, i) => {
              const toks = n.trim().split(/\s+/);
              if (toks.length > 1) return true;
              return !declaredNames.some((m, k) => k !== i && m.trim().split(/\s+/).length > 1 &&
                m.trim().split(/\s+/)[0].toLowerCase() === toks[0].toLowerCase());
            });
            declaredNames.length = 0; declaredNames.push(...deduped);

            // ---- try to attach to a waiting household on the same unit
            let attached = false;
            for (const h of households) {
              if (h.complete || a.UnitId == null || h.unit_id !== a.UnitId) continue;
              const rosterHasMe = h.roster.some((r) => !r.submitted && namesMatch(r.name, self));
              const iDeclareThem = h.roster.some((r) => declaredNames.some((n) => namesMatch(n, r.name)));
              if (!rosterHasMe && !iDeclareThem) continue;
              attached = true;
              const matchedDeclared = h.roster.find((r) => !r.submitted && namesMatch(r.name, self))?.name ?? null;
              const roster = h.roster.map((r) => namesMatch(r.name, self)
                ? { ...r, submitted: true, applicantId: a.Id, email: a.Email, phone: (a.PhoneNumbers ?? [])[0]?.Number }
                : r);
              if (!roster.some((r) => r.applicantId === a.Id)) {
                roster.push({ name: self, norm: self.toLowerCase(), submitted: true, applicantId: a.Id, email: a.Email });
              }
              const complete = roster.every((r) => r.submitted);
              const done = roster.filter((r) => r.submitted).length;
              if (!dryRun) {
                await updateDescriptionForAttach(h.task_gid, matchedDeclared, contactBlock(a)).catch(() => {});
                await asanaCall("POST", `/tasks/${h.task_gid}/stories`, { html_text: `<body>${contactBlock(a)}\n\nApplication received (${done} of ${roster.length}).</body>` });
                // Rebuild the title from the CURRENT roster: attachers who were
                // not declared up front must appear, and the prefix reflects
                // completeness (title segments: head / names / address).
                try {
                  const cur = await asanaCall("GET", `/tasks/${h.task_gid}?opt_fields=name`) as { name?: string };
                  const parts = (cur.name ?? "").split(" / ");
                  if (parts.length >= 3) {
                    const head = parts[0].replace(/^WAITING ON ADD'L APPS /, "");
                    const names = roster.map((r) => initialName(r.name)).join(" + ");
                    const rebuilt = `${complete ? "" : "WAITING ON ADD'L APPS "}${head} / ${names} / ${parts.slice(2).join(" / ")}`;
                    if (rebuilt !== cur.name) await asanaCall("PUT", `/tasks/${h.task_gid}`, { name: rebuilt });
                  }
                } catch { /* name rebuild is best-effort */ }
                if (complete) {
                  await asanaCall("POST", `/tasks/${h.task_gid}/stories`, { text: "All applications submitted." });
                }
                await ledgerUpdateHousehold(h.id, { roster, complete });
                await ledgerInsertApplicant(a.Id!, h.id);
                await flipUndecided(a);
              }
              h.roster = roster; h.complete = complete;
              summary.attached.push(`${self} -> household ${h.id}${complete ? " (complete)" : ""}`);
              if (complete) summary.completed.push(`household ${h.id}`);
              break;
            }
            if (attached) continue;

            // ---- new household from this applicant's declaration
            const unit = a.UnitId != null ? await bGet(`/rentals/units/${a.UnitId}`).catch(() => null) as { UnitNumber?: string; Address?: { AddressLine1?: string; City?: string } } | null : null;
            const prop = a.PropertyId != null ? rentalById.get(a.PropertyId) : undefined;
            const line = unit?.Address?.AddressLine1 ?? prop?.Address?.AddressLine1 ?? "";
            const unitNo = unit?.UnitNumber && line && !line.includes(String(unit.UnitNumber)) ? ` #${unit.UnitNumber}` : "";
            const city = unit?.Address?.City ?? prop?.Address?.City ?? "";
            const cityDup = city && line.toLowerCase().includes(city.toLowerCase());
            const address = line ? `${line}${unitNo}${city && !cityDup ? ", " + city : ""}` : (prop?.Name ?? "");
            const titleAddress = address || "Property Pending";

            const roster: RosterEntry[] = declaredNames.map((n) => ({
              name: n, norm: n.toLowerCase(),
              submitted: namesMatch(n, self),
              applicantId: namesMatch(n, self) ? a.Id : undefined,
              email: namesMatch(n, self) ? a.Email : undefined,
              phone: namesMatch(n, self) ? (a.PhoneNumbers ?? [])[0]?.Number : undefined,
            }));
            const waiting = roster.some((r) => !r.submitted);

            // ordinal + LU parent via the existing machinery
            let luHit: { gid: string; name: string } | null = null;
            let ordinal = "";
            if (address) {
              const lu = matchLu(await openLuTasks(), address);
              if (lu.hit) {
                luHit = lu.hit;
                try {
                  const subs = await asanaCall("GET", `/tasks/${lu.hit.gid}/subtasks?limit=100&opt_fields=name`) as { name?: string }[];
                  const prior = (subs ?? []).filter((t) => /application/i.test(t.name ?? "") && !/roommate addendum/i.test(t.name ?? "")).length;
                  const n = prior + 1;
                  if (n > 1) {
                    const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
                    ordinal = `${n}${suffix} `;
                  }
                } catch { /* unlabeled beats nothing */ }
              }
            }

            const displayNames = roster.map((r) => initialName(r.name)).join(" + ");
            const taskName = `${waiting ? "WAITING ON ADD'L APPS " : ""}${ordinal}Application / ${displayNames} / ${titleAddress}`;
            const pendingLines = roster.filter((r) => !r.submitted).map((r) => {
              const x = r.name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
              return `<strong>${x}</strong>\nApplication pending`;
            }).join("\n\n");
            const notes = `<body><strong>Applicant contact details</strong>\n\n${contactBlock(a)}${pendingLines ? "\n\n" + pendingLines : ""}\n\n<strong>Next steps</strong>\n1. Buildium Applicant Summary: download the applicant's documents and the credit / criminal report, attach them to THIS task\n2. In the Screening Workbench, paste this task's link and Run Screening\n3. Report posts here for manager review\n\nCreated automatically by the intake scanner. Buildium is the system of record for documents.</body>`;

            if (!dryRun) {
              const made = (luHit
                ? await asanaCall("POST", `/tasks/${luHit.gid}/subtasks`, { name: taskName, html_notes: notes })
                : await asanaCall("POST", `/tasks`, { name: taskName, html_notes: notes, projects: [LEASING_HUMAN_VIEW] })
              ) as { gid?: string };
              if (!made.gid) throw new Error("task create returned no gid");
              // home in both boards ("memberships" is not writable on create;
              // addProject with a section does the placement)
              await asanaCall("POST", `/tasks/${made.gid}/addProject`, { project: LEASING_HUMAN_VIEW, section: PENDING_APPLICATIONS_SECTION }).catch(() => {});
              await asanaCall("POST", `/tasks/${made.gid}/addProject`, { project: PENDING_APPS_PROJECT, section: "1217174650640615" }).catch(() => {});
              const hid = await ledgerInsertHousehold({
                unit_id: a.UnitId ?? 0, property_id: a.PropertyId ?? null, task_gid: made.gid,
                address, roster, complete: !waiting,
              });
              await ledgerInsertApplicant(a.Id!, hid);
              await flipUndecided(a);
              households.push({ id: hid, unit_id: a.UnitId ?? 0, property_id: a.PropertyId ?? null, task_gid: made.gid, address, roster, complete: !waiting, last_nudge_at: null, created_at: new Date().toISOString() });
            } else {
              // dry runs must simulate the ledger too, or a same-round
              // co-applicant previews as a duplicate household
              households.push({ id: -1, unit_id: a.UnitId ?? 0, property_id: a.PropertyId ?? null, task_gid: "dry", address, roster, complete: !waiting, last_nudge_at: null, created_at: new Date().toISOString() });
            }
            summary.created.push(taskName);
          } catch (e) {
            summary.errors.push(`${fullName(a)}: ${String((e as Error).message).slice(0, 80)}`);
          }
        }

        // ---- 3-day ghost-roommate nudge, once per household
        if (!dryRun) {
          for (const h of households) {
            if (h.complete || h.last_nudge_at) continue;
            if (Date.now() - new Date(h.created_at).getTime() < 3 * 86400000) continue;
            const waitingOn = h.roster.filter((r) => !r.submitted).map((r) => initialName(r.name)).join(", ");
            if (!waitingOn) continue;
            try {
              await asanaCall("POST", `/tasks/${h.task_gid}/stories`, { text: `Still waiting on: ${waitingOn} (declared ${Math.round((Date.now() - new Date(h.created_at).getTime()) / 86400000)} days ago).` });
              await ledgerUpdateHousehold(h.id, { last_nudge_at: new Date().toISOString() });
              summary.nudged.push(`household ${h.id}: ${waitingOn}`);
            } catch { /* next round */ }
          }
        }

        return j(headers, 200, { dryRun, ...summary });
      } catch (e) {
        console.error("intake failed:", e);
        return j(headers, 502, { error: "intake_failed", message: String((e as Error).message).slice(0, 200), partial: summary });
      }
    }

    // ---------- mgrQueue: open tasks awaiting manager review ----------
    // Tasks the submit step retitled "Pending Mgr Review | ...", read from
    // Human View's Pending Applications section (the convention every
    // application task follows).
    if (action === "mgrQueue") {
      try {
        // Primary: whatever sits in Leasing | Pending Applications -> Pending
        // Mgr (staff drag tasks there; the section IS the stage). Union with
        // title-prefix matches from Human View's section, for tasks Step 3
        // retitled that nobody has dragged yet. Deduped by task gid.
        const seen = new Set<string>();
        const out: { name: string; url: string; due: string }[] = [];
        const collect = async (path: string, filter: (name: string) => boolean) => {
          let offset = "";
          for (let page = 0; page < 5; page++) {
            const res = await fetch(
              `${ASANA}${path}?completed=false&limit=100&opt_fields=name,permalink_url,due_on${offset ? `&offset=${encodeURIComponent(offset)}` : ""}`,
              { headers: { Authorization: `Bearer ${ASANA_PAT}` } },
            );
            const json = await res.json().catch(() => ({})) as { data?: { gid?: string; name?: string; permalink_url?: string; due_on?: string }[]; next_page?: { offset?: string } | null };
            if (!res.ok) throw new Error(`asana ${path} page ${page}`);
            for (const t of json.data ?? []) {
              if (t.gid && !seen.has(t.gid) && filter(t.name ?? "")) {
                seen.add(t.gid);
                out.push({ name: t.name ?? "", url: t.permalink_url ?? "", due: t.due_on ?? "" });
              }
            }
            offset = json.next_page?.offset ?? "";
            if (!offset) break;
          }
        };
        await collect(`/sections/${PENDING_MGR_SECTION}/tasks`, () => true);
        await collect(`/sections/${PENDING_APPLICATIONS_SECTION}/tasks`, (n) => /^Pending Mgr Review/i.test(n));
        return j(headers, 200, { queue: out });
      } catch (e) {
        console.error("mgrQueue failed:", e);
        return j(headers, 502, { error: "asana_failed", message: "Could not load the review queue. Try again in a minute." });
      }
    }

    // ---------- decide: manager decision -> comment with email draft, assign Mary, due today ----------
    if (action === "decide") {
      const taskUrl = String((body as { taskUrl?: unknown }).taskUrl ?? "");
      const gid = (taskUrl.match(/task\/(\d+)/) ?? taskUrl.match(/\/(\d{12,})/))?.[1];
      if (!gid) return j(headers, 400, { error: "bad_task_url" });
      const decision = String((body as { decision?: unknown }).decision ?? "") as Decision;
      const option = String((body as { option?: unknown }).option ?? "");
      const text = String((body as { text?: unknown }).text ?? "").slice(0, 2000);
      if (!DECISION_OPTIONS[decision]) return j(headers, 400, { error: "bad_decision" });

      try {
        const task = await asanaCall("GET", `/tasks/${gid}?opt_fields=name,permalink_url`) as { name?: string; permalink_url?: string };
        // Names/address, best-effort from the task title conventions:
        //   "Pending Mgr Review | [Nth ]Application / Names / Address"
        //   "[prefix ]Application <Address - unit // Names>"
        const raw = (task.name ?? "").replace(/^Pending Mgr Review \|\s*/i, "");
        let names = "", address = "";
        const slash = raw.match(/Application \/ (.+?) \/ (.+)$/i);
        const angle = raw.match(/<([^>]+)>?/);
        if (slash) { names = slash[1]; address = slash[2]; }
        else if (angle) {
          const inner = angle[1];
          const parts = inner.split("//");
          address = (parts[0] ?? "").split(" - ")[0].trim();
          names = (parts[1] ?? "").trim();
        }
        const firsts = names.split(/[+,/]|\band\b/).map((n) => n.trim().split(/\s+/)[0]).filter(Boolean);
        const applicantFirst = firsts.join(" and ");

        const built = buildDecision({ decision, option, text, applicantFirst, address });

        const MARY = { gid: "1203402971273034", name: "Mary Galvez" };
        const dueOn = new Date(Date.now() - 7 * 3600 * 1000).toISOString().slice(0, 10);
        const comment = `MANAGER DECISION: ${built.headline}
Assigned to ${MARY.name}, due ${dueOn}. Send the email below from leasing@sagareus.com (draft only; review before sending).

EMAIL DRAFT
Subject: ${built.email.subject}

${built.email.body}`;
        await asanaCall("POST", `/tasks/${gid}/stories`, { text: comment });
        await asanaCall("PUT", `/tasks/${gid}`, { assignee: MARY.gid, due_on: dueOn });
        // Move to the matching stage section (addProject moves within the
        // project when already homed, and homes the task when not).
        const destSection = decision === "declined" ? SEC_COMPLETE
          : decision === "insufficient" ? SEC_PENDING_DOCS
          : option === "section8" ? SEC_PENDING_DOCS
          : SEC_APPROVED;
        let moved = true;
        try {
          await asanaCall("POST", `/tasks/${gid}/addProject`, { project: PENDING_APPS_PROJECT, section: destSection });
        } catch { moved = false; }
        const destName = destSection === SEC_COMPLETE ? "Complete" : destSection === SEC_PENDING_DOCS ? "Pending Docs / Co-Signer / Sec 8" : "Approved";
        return j(headers, 200, {
          decided: true, headline: built.headline,
          assignee: MARY.name, due: dueOn,
          moved, section: destName,
          task: { name: task.name ?? "", url: task.permalink_url ?? taskUrl },
        });
      } catch (e) {
        console.error("decide failed:", e);
        return j(headers, 502, { error: "decide_failed", message: "Asana did not accept the update. Check the task before retrying; the comment may or may not have posted." });
      }
    }

    // ---------- submitReport: post the (possibly edited) report + route for review ----------
    // Posts the report as a comment, prefixes the title "Pending Mgr Review",
    // assigns by weekday (Courtney Mon-Thu, Brittany Fri-Sun), due today.
    // Section move to a Pending Manager Review section: later (Brittany).
    if (action === "submitReport") {
      const taskUrl = String((body as { taskUrl?: unknown }).taskUrl ?? "");
      const gid = (taskUrl.match(/task\/(\d+)/) ?? taskUrl.match(/\/(\d{12,})/))?.[1];
      if (!gid) return j(headers, 400, { error: "bad_task_url" });
      const report = String((body as { report?: unknown }).report ?? "").trim();
      if (report.length < 200 || report.length > 60000) {
        return j(headers, 400, { error: "bad_report", message: "Report text looks empty or too large. Run the screening first." });
      }

      // Seattle-ish local day: Mon-Thu -> Courtney, Fri/Sat/Sun -> Brittany
      const local = new Date(Date.now() - 7 * 3600 * 1000);
      const dow = local.getUTCDay(); // 0 Sun .. 6 Sat
      const COURTNEY = { gid: "1206362769384360", name: "Courtney Simmons" };
      const BRITTANY = { gid: "1203784854198936", name: "B French" };
      const assignee = dow >= 1 && dow <= 4 ? COURTNEY : BRITTANY;
      const dueOn = local.toISOString().slice(0, 10);

      try {
        // Rich comment (bold/underlined headers) with plain-text fallback if
        // Asana rejects the HTML subset.
        try {
          await asanaCall("POST", `/tasks/${gid}/stories`, { html_text: mdToAsanaHtml(report) });
        } catch {
          await asanaCall("POST", `/tasks/${gid}/stories`, { text: report });
        }
        const cur = await asanaCall("GET", `/tasks/${gid}?opt_fields=name`) as { name?: string };
        const PREFIX = "Pending Mgr Review | ";
        const updates: Record<string, unknown> = { assignee: assignee.gid, due_on: dueOn };
        if (cur.name && !cur.name.startsWith("Pending Mgr Review")) updates.name = PREFIX + cur.name;
        await asanaCall("PUT", `/tasks/${gid}`, updates);
        return j(headers, 200, {
          submitted: true,
          assignee: assignee.name,
          due: dueOn,
          title: (updates.name as string) ?? cur.name ?? "",
        });
      } catch (e) {
        console.error("submitReport failed:", e);
        return j(headers, 502, { error: "submit_failed", message: "Asana did not accept the update. The report may or may not have posted; check the task before retrying." });
      }
    }

    // ---------- screen: documents in, report out, posted to Asana ----------
    // The full replacement for the /screening skill's pipeline: extract
    // (deterministic cascade) -> parse (model transcribes, never computes)
    // -> underwrite (engine.ts) -> render (TEMPLATE.md) -> attach files +
    // post READY FOR MANAGER REVIEW on the household's Asana task.
    // dryRun skips the Asana writes and returns the report for inspection.
    if (action === "screen") {
      const ids = (Array.isArray(body.applicantIds) ? body.applicantIds : [])
        .map((x) => parseInt(String(x), 10)).filter((n) => Number.isFinite(n) && n > 0);
      if (!ids.length || ids.length > 10) return j(headers, 400, { error: "bad_applicant_ids" });
      const files = (body as { files?: { name?: unknown; contentType?: unknown; dataBase64?: unknown }[] }).files;
      if (!Array.isArray(files) || !files.length || files.length > 12) {
        return j(headers, 400, { error: "bad_files", message: "Attach 1-12 PDF or image files." });
      }
      const dryRun = (body as { dryRun?: unknown }).dryRun === true;
      const assistantNotes = String((body as { notes?: unknown }).notes ?? "").slice(0, 4000);

      // Names from Buildium anchor attribution
      const members = await Promise.all(ids.map((id) => bGet(`/applicants/${id}`) as Promise<Applicant>));
      const names = members.map(fullName).filter((n) => n !== "Unnamed");

      // The report needs a task to land on (Step 2 first), unless dryRun.
      const openTasks = (await findAsanaTasks(names)).filter((t) => !t.completed);
      if (!openTasks.length && !dryRun) {
        return j(headers, 422, { error: "no_task", message: "No open application task found. Run Step 2 (Push To Asana) first." });
      }
      const task = openTasks[0];

      // Decode + extract, skipping prior-underwriting artifacts by name.
      const skipped: string[] = [];
      const docs: Extracted[] = [];
      const rawFiles: { name: string; contentType: string; bytes: Uint8Array }[] = [];
      let totalBytes = 0;
      for (const f of files) {
        const name = String(f.name ?? "document");
        if (isPriorUnderwritingDoc(name)) { skipped.push(name); continue; }
        let bytes: Uint8Array;
        try {
          bytes = Uint8Array.from(atob(String(f.dataBase64 ?? "")), (c) => c.charCodeAt(0));
        } catch {
          docs.push({ kind: "failed", name, error: "could not decode upload" });
          continue;
        }
        totalBytes += bytes.byteLength;
        if (totalBytes > 35 * 1024 * 1024) {
          return j(headers, 413, { error: "too_large", message: "Uploads exceed 35 MB total. Screen in two passes." });
        }
        const ct = String(f.contentType ?? "").toLowerCase();
        rawFiles.push({ name, contentType: ct || "application/octet-stream", bytes });
        if (ct.startsWith("image/")) docs.push(imageAsExtracted(bytes, name));
        else docs.push(pdfAsExtracted(bytes, name));
      }
      const failures = docs.filter((d) => d.kind === "failed").map((d) => `${d.name}: ${(d as { error: string }).error}`);
      const readable = docs.filter((d) => d.kind !== "failed");
      if (!readable.length) {
        return j(headers, 422, { error: "nothing_readable", message: "None of the uploads could be read. Check the files and try again." });
      }

      // Parse (model transcribes) then compute (engine).
      let parsed;
      try {
        parsed = await parseDocuments(readable, `Applicants on this household (from Buildium): ${names.join(", ")}.`);
      } catch (e) {
        console.error("screen parse failed:", e);
        return j(headers, 502, { error: "parse_failed", message: "Document reading failed. Try again in a minute; if it repeats, key the figures by hand via the manual path." });
      }
      const asOf = new Date().toISOString().slice(0, 10);
      const result = underwrite({ applicants: parsed.applicants, asOf });

      const integrityFlags: string[] = [];
      for (const s of skipped) integrityFlags.push(`Skipped prior-underwriting report by filename pattern: ${s}. Figures re-derived from source documents.`);
      for (const f of failures) integrityFlags.push(`Attachment failed to extract: ${f}.`);

      const reportId = `SW-${asOf.replace(/-/g, "")}-${names.map((n) => n.split(" ").at(-1) ?? "").join("-").toUpperCase().slice(0, 24)}`;
      const report = renderReport(result, parsed, { reportId, date: asOf, assistantNotes, integrityFlags });

      let posted = false;
      let attached: string[] = [];
      if (!dryRun && task) {
        const gidMatch = task.url.match(/task\/(\d+)/) ?? task.url.match(/\/(\d{10,})/);
        const taskGid = gidMatch?.[1];
        if (taskGid) {
          // Attach source files for the record (best-effort per file)
          for (const rf of rawFiles) {
            try {
              const fd = new FormData();
              fd.append("file", new Blob([rf.bytes.buffer as ArrayBuffer], { type: rf.contentType }), rf.name);
              const ar = await fetch(`https://app.asana.com/api/1.0/tasks/${taskGid}/attachments`, {
                method: "POST",
                headers: { Authorization: `Bearer ${ASANA_PAT}` },
                body: fd,
              });
              if (ar.ok) attached.push(rf.name);
            } catch { /* per-file best effort */ }
          }
          // Post the report comment
          try {
            const cr = await fetch(`https://app.asana.com/api/1.0/tasks/${taskGid}/stories`, {
              method: "POST",
              headers: { Authorization: `Bearer ${ASANA_PAT}`, "Content-Type": "application/json" },
              body: JSON.stringify({ data: { text: `READY FOR MANAGER REVIEW\n\n${report}` } }),
            });
            posted = cr.ok;
          } catch { posted = false; }
        }
      }

      return j(headers, 200, {
        result, report, reportId,
        parsedApplicants: parsed.applicants.map((a) => ({
          name: a.name, equifax: a.equifax,
          incomes: a.incomes.map((s) => ({ type: s.type, monthlyGross: s.monthlyGross, month1Gross: s.month1Gross, month2Gross: s.month2Gross, verified: s.verified !== false, note: s.note })),
        })),
        warnings: parsed.warnings,
        files: { attached, skipped, failed: failures },
        asana: task ? { url: task.url, posted } : null,
        dryRun,
      });
    }

    // ---------- underwrite: deterministic tier math (engine.ts) ----------
    // Structured input in, tier results out. No writes, no Buildium calls.
    // This is the engine that replaces the /screening skill's arithmetic;
    // document parsing feeds it once the docs API question is answered.
    if (action === "underwrite") {
      const household = (body as { household?: unknown }).household as HouseholdInput | undefined;
      if (!household || !Array.isArray(household.applicants) || !household.applicants.length) {
        return j(headers, 400, { error: "bad_household", message: "Pass household: { applicants: [...], asOf?: 'YYYY-MM-DD' }." });
      }
      if (household.applicants.length > 10) return j(headers, 400, { error: "too_many_applicants" });
      if (!household.asOf) household.asOf = new Date().toISOString().slice(0, 10);
      try {
        return j(headers, 200, { result: underwrite(household) });
      } catch (e) {
        console.error("underwrite failed:", e);
        return j(headers, 400, { error: "underwrite_failed", message: "Input shape did not compute. Check the household payload." });
      }
    }

    // ---------- setStatus: update the household's Buildium application status ----------
    // The widget drives Buildium status as steps complete (Brittany,
    // 2026-08-03). Applicant-level Status derives from the application, so we
    // PUT each submitted application's ApplicationStatus.
    if (action === "setStatus") {
      const ids = (Array.isArray(body.applicantIds) ? body.applicantIds : [])
        .map((x) => parseInt(String(x), 10)).filter((n) => Number.isFinite(n) && n > 0);
      const status = String((body as { status?: unknown }).status ?? "");
      const ALLOWED = new Set(["Undecided", "Deferred", "Approved", "Rejected"]);
      if (!ids.length || ids.length > 10) return j(headers, 400, { error: "bad_applicant_ids" });
      if (!ALLOWED.has(status)) return j(headers, 400, { error: "bad_status", message: `Status must be one of: ${[...ALLOWED].join(", ")}` });
      const results = await Promise.all(ids.map(async (id) => {
        try {
          const a = await bGet(`/applicants/${id}`) as Applicant;
          const apps = (a.Applications ?? []).map((ap) => ap.Id).filter((x): x is number => x != null);
          if (!apps.length) return { id, ok: false, message: "no submitted application" };
          for (const appId of apps) {
            const res = await fetch(`${BUILDIUM}/applicants/${id}/applications/${appId}`, {
              method: "PUT",
              headers: { ...BH, "Content-Type": "application/json" },
              body: JSON.stringify({ ApplicationStatus: status }),
            });
            if (!res.ok) return { id, ok: false, message: `buildium ${res.status}` };
          }
          return { id, ok: true };
        } catch {
          return { id, ok: false, message: "fetch failed" };
        }
      }));
      return j(headers, 200, { status, results, ok: results.every((r) => r.ok) });
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

      // Applicant docs and the screening report are NOT retrievable via the
      // Buildium open API (verified 2026-08-03), so attaching them stays a
      // manual step and the task says so explicitly.
      const nextSteps = mode === "roommate" ? "" :
        `\n<strong>Next steps</strong>\n` +
        `1. Buildium Applicant Summary: download the applicant's documents and the credit / criminal report, attach them to THIS task\n` +
        `2. In Claude, run /screening and paste this task's link\n` +
        `3. Aster posts READY FOR MANAGER REVIEW here; assign to the Leasing Manager\n`;
      const notes = `<body><strong>Applicant contact details</strong>\n\n${contactHtml}\n${extra}${nextSteps}\n` +
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
          projects: [LEASING_HUMAN_VIEW],
          ...(mode === "roommate" ? { due_on: due } : {}),
        })
      ) as { gid?: string; permalink_url?: string; name?: string };
      if (mode !== "lu" && made.gid) {
        await asanaCall("POST", `/tasks/${made.gid}/addProject`, { project: LEASING_HUMAN_VIEW, section: PENDING_APPLICATIONS_SECTION }).catch(() => {});
      }

      // Pushing to Asana means work has started: flip New applications to
      // Undecided in Buildium so the queue batches track reality. Best-effort.
      let statusFlipped = false;
      try {
        for (const m of members) {
          for (const ap of m.Applications ?? []) {
            if (ap.Id != null && (ap.Status ?? (ap as { ApplicationStatus?: string }).ApplicationStatus) !== "Undecided") {
              const res = await fetch(`${BUILDIUM}/applicants/${m.Id}/applications/${ap.Id}`, {
                method: "PUT",
                headers: { ...BH, "Content-Type": "application/json" },
                body: JSON.stringify({ ApplicationStatus: "Undecided" }),
              });
              if (res.ok) statusFlipped = true;
            }
          }
        }
      } catch { /* status flip is best-effort */ }

      const note = (mode === "pending"
        ? "Property pending: the task is in Pending Applications with an email draft to confirm the address with the applicant."
        : mode === "roommate"
        ? "No open lease-up matched: filed as Roommate Addendum in Pending Applications, due in 2 days, per the Roommate / Sublet SOP."
        : undefined);
      const statusNote = statusFlipped ? "Buildium status moved to Undecided." : undefined;

      return j(headers, 200, {
        created: true, mode,
        task: { name: made.name ?? taskName, url: made.permalink_url ?? "" },
        parent: luHit ? { name: luHit.name } : null,
        note: [note, statusNote].filter(Boolean).join(" ") || undefined,
      });
    }

    return j(headers, 400, { error: "unknown_action" });
  } catch (e) {
    console.error(`screening-proxy ${action} failed:`, e);
    return j(headers, 502, { error: "buildium_failed", message: "Buildium did not answer. Try again in a minute." });
  }
});

Deno.serve(app.fetch);
