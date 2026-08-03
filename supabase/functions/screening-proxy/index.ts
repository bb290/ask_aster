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
const BUILDIUM = "https://api.buildium.com/v1";
const BH = { "x-buildium-client-id": B_ID, "x-buildium-client-secret": B_SECRET };

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
      const [applicants, rentals] = await Promise.all([
        bGetAll("/applicants") as Promise<Applicant[]>,
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

      const pending = applicants.filter((a) => !SETTLED.has((a.Status ?? "").toLowerCase()));

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

      return j(headers, 200, { members });
    }

    return j(headers, 400, { error: "unknown_action" });
  } catch (e) {
    console.error(`screening-proxy ${action} failed:`, e);
    return j(headers, 502, { error: "buildium_failed", message: "Buildium did not answer. Try again in a minute." });
  }
});

Deno.serve(app.fetch);
