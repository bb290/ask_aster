// Automated application intake (Brittany, 2026-08-05).
//
// Polls Buildium for newly submitted applications and files the Asana task
// per household, combining adults via the application form's "Name of all
// adults" declaration (verified field: Applicant information section,
// FieldLabel starting "Name of all adults"). Rules:
//   - First adult to apply creates the task listing ALL declared adults;
//     title prefix "WAITING ON ADD'L APPS " until every declared adult has
//     submitted, then the prefix is stripped ("All applications in").
//   - Later adults are matched to the waiting household by unit + normalized
//     name (bidirectional: their name on the roster, or a roster member in
//     THEIR declaration). Wrong-merge is never acceptable; a failed match
//     creates a separate task and the same-unit cross-flag covers it.
//   - Task names use first name + last initial (titles surface on
//     website-facing views); descriptions carry full contact details.
//   - Buildium application status flips to Undecided at creation/attach.
//   - Ghost-roommate nudge: one comment after 3 days waiting, never repeated.
// Ledger: intake_households / intake_applicants (Supabase Postgres),
// accessed via PostgREST with the service role key. Idempotent by
// applicant_id.

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const SBH = {
  "apikey": SB_KEY,
  "Authorization": `Bearer ${SB_KEY}`,
  "Content-Type": "application/json",
};

export interface RosterEntry {
  name: string; // as declared
  norm: string;
  submitted: boolean;
  applicantId?: number;
  email?: string;
  phone?: string;
}

export interface HouseholdRow {
  id: number;
  unit_id: number;
  property_id: number | null;
  task_gid: string;
  address: string | null;
  roster: RosterEntry[];
  complete: boolean;
  last_nudge_at: string | null;
  created_at: string;
}

export function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

/** Conservative match: exact normalized full name, or first-initial + last
 * token. Never matches on last name alone. */
export function namesMatch(a: string, b: string): boolean {
  const na = normName(a), nb = normName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ta = a.trim().split(/\s+/), tb = b.trim().split(/\s+/);
  if (ta.length < 2 || tb.length < 2) return false;
  const la = normName(ta[ta.length - 1]), lb = normName(tb[tb.length - 1]);
  return la === lb && ta[0][0]?.toLowerCase() === tb[0][0]?.toLowerCase();
}

/** "Sada k Mahaffey, Jaedin WyattGraham" -> ["Sada k Mahaffey", "Jaedin WyattGraham"] */
export function parseRoster(declared: string): string[] {
  return declared.split(/,|&|\band\b|\n|;/i).map((s) => s.trim()).filter((s) => s.length > 1);
}

/** First name + last initial: "Jaedin Wyatt Graham" -> "Jaedin G." */
export function initialName(full: string): string {
  const t = full.trim().split(/\s+/).filter(Boolean);
  if (!t.length) return "Applicant";
  if (t.length === 1) return t[0];
  return `${t[0]} ${t[t.length - 1][0].toUpperCase()}.`;
}

export function extractDeclaredAdults(application: unknown): string | null {
  const sections = (application as { Application?: { SectionResponses?: { SectionFields?: { FieldLabel?: string; Value?: string }[] }[] }[] })?.Application ?? [];
  for (const sec of sections) {
    for (const resp of sec.SectionResponses ?? []) {
      for (const f of resp.SectionFields ?? []) {
        if ((f.FieldLabel ?? "").toLowerCase().startsWith("name of all adults")) {
          return f.Value ?? null;
        }
      }
    }
  }
  return null;
}

// ------------------------------------------------------------ ledger I/O

export async function ledgerSeenApplicants(): Promise<Set<number>> {
  const r = await fetch(`${SB_URL}/rest/v1/intake_applicants?select=applicant_id`, { headers: SBH });
  if (!r.ok) throw new Error(`ledger applicants ${r.status}`);
  const rows = await r.json() as { applicant_id: number }[];
  return new Set(rows.map((x) => x.applicant_id));
}

export async function ledgerOpenHouseholds(): Promise<HouseholdRow[]> {
  const r = await fetch(`${SB_URL}/rest/v1/intake_households?complete=eq.false&select=*`, { headers: SBH });
  if (!r.ok) throw new Error(`ledger households ${r.status}`);
  return await r.json() as HouseholdRow[];
}

export async function ledgerInsertHousehold(row: Omit<HouseholdRow, "id" | "created_at" | "last_nudge_at">): Promise<number> {
  const r = await fetch(`${SB_URL}/rest/v1/intake_households`, {
    method: "POST", headers: { ...SBH, "Prefer": "return=representation" }, body: JSON.stringify(row),
  });
  if (!r.ok) throw new Error(`ledger insert household ${r.status}`);
  return ((await r.json()) as { id: number }[])[0].id;
}

export async function ledgerUpdateHousehold(id: number, patch: Record<string, unknown>): Promise<void> {
  const r = await fetch(`${SB_URL}/rest/v1/intake_households?id=eq.${id}`, {
    method: "PATCH", headers: SBH, body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error(`ledger update household ${r.status}`);
}

export async function ledgerInsertApplicant(applicantId: number, householdId: number): Promise<void> {
  const r = await fetch(`${SB_URL}/rest/v1/intake_applicants`, {
    method: "POST", headers: SBH, body: JSON.stringify({ applicant_id: applicantId, household_id: householdId }),
  });
  if (!r.ok && r.status !== 409) throw new Error(`ledger insert applicant ${r.status}`);
}
