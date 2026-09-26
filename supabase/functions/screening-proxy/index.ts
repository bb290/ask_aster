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
// (optional override; defaults to anthropic/claude-sonnet-5, see screen.ts).
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
const APPLICATION_TEMPLATE = "1208297780570331"; // task template "Application // <names>" (Human View): subtasks populate
const APPLICANT_ID_FIELD = "1217198624982390"; // number field on Pending Apps: Buildium group id (or applicant id for solos)
// Status multi-select on Pending Apps (Brittany, 2026-08-08): mirrors the
// title prefix / workflow stage. Values REPLACE on each transition.
const STATUS_FIELD = "1217294173155621";
const STATUS = {
  pendingShowing: "1217294173155638",
  pendingApps: "1217294173155622",
  pendingIncomeDocs: "1217294173155623",
  complete: "1217294173155624",
  pendingEnhanced: "1217294173155625",
  pendingMgr: "1217294173155626",
  condSec8: "1217294173155627",
  condOwnerException: "1217294173155628",
  approved: "1218662867653596", // added 2026-09-20 (team feedback: Approved split from Lease Sent)
  approvedLeaseSent: "1217294173155629", // renamed "Lease Sent" 2026-09-20
  leaseSigned: "1217294173155640",
  pendingCosigner: "1217294173155630",
  pendingAddlDocs: "1217294173155631",
  pendingLandlordBalance: "1217294173155632",
  exceptionPet: "1217294173155633",
  declined: "1217294173155636",
  onHold: "1217294173155639",
} as const;
const STATUS_NAME: Record<string, string> = {
  [STATUS.pendingShowing]: "Pending Showing",
  [STATUS.pendingApps]: "Pending App(s)",
  [STATUS.pendingIncomeDocs]: "Pending - Income Docs",
  [STATUS.complete]: "Complete",
  [STATUS.pendingEnhanced]: "Pending Enhanced Review",
  [STATUS.pendingMgr]: "Pending Mgr Review",
  [STATUS.condSec8]: "Conditionally Approved - Pending Sec 8",
  [STATUS.condOwnerException]: "Conditionally Approved - Pending Owner Policy exception",
  [STATUS.approved]: "Approved",
  [STATUS.approvedLeaseSent]: "Lease Sent",
  [STATUS.leaseSigned]: "Lease Signed",
  [STATUS.pendingCosigner]: "Pending - Co-Signer",
  [STATUS.pendingAddlDocs]: "Pending - Add'l Income Docs",
  [STATUS.pendingLandlordBalance]: "Pending - Balance Owed to Landlord",
  [STATUS.exceptionPet]: "Exception: Pet Policy",
  [STATUS.declined]: "Declined",
  [STATUS.onHold]: "On Hold",
};
// New single-select Status DROPDOWN (Brittany created it 2026-09-20; options
// populated to match the workflow). Written alongside the multi-select on
// every transition until the multi-select retires.
const STATUS2_FIELD = "1218663431960583";
const STATUS2: Record<string, string> = {
  [STATUS.pendingShowing]: "1218663295804891",
  [STATUS.pendingApps]: "1218663432373710",
  [STATUS.pendingIncomeDocs]: "1218663431960584",
  [STATUS.complete]: "1218663318816594",
  [STATUS.pendingEnhanced]: "1218663295715903",
  [STATUS.pendingMgr]: "1218663431960587",
  [STATUS.approved]: "1218663431960585",
  [STATUS.condSec8]: "1218663502335171",
  [STATUS.condOwnerException]: "1218663318816597",
  [STATUS.pendingCosigner]: "1218663345966377",
  [STATUS.pendingAddlDocs]: "1218663432392120",
  [STATUS.pendingLandlordBalance]: "1218663295821865",
  [STATUS.approvedLeaseSent]: "1218663431960586",
  [STATUS.leaseSigned]: "1218663432372366",
  [STATUS.declined]: "1218663432392831",
  [STATUS.onHold]: "1218663345967452",
};
// Dropdown option gid -> name; the pill and title prefixes speak this vocabulary
const STATUS2_NAME: Record<string, string> = {
  "1218663295804891": "Pending Showing",
  "1218663432373710": "Pending App(s)",
  "1218685241682741": "Pending App Fee",
  "1218663431960584": "Pending - Income Docs",
  "1218663318816594": "Complete",
  "1218663295715903": "Pending Enhanced Review",
  "1218663431960587": "Pending Mgr Review",
  "1218663431960585": "Approved",
  "1218663502335171": "Conditionally Approved - Pending Sec 8",
  "1218663318816597": "Conditionally Approved - Pending Owner Policy exception",
  "1218663345966377": "Pending - Co-Signer",
  "1218663432392120": "Pending - Add'l Income Docs",
  "1218663295821865": "Pending - Balance Owed to Landlord",
  "1218663431960586": "Lease Sent",
  "1218663432372366": "Lease Signed",
  "1218663432392831": "Declined",
  "1218663345967452": "On Hold",
  "1218716506959444": "Leasing Complete, Pending MI",
  "1218716498458224": "Cancelled",
};
// Dropdown-native statuses with no old-vocabulary equivalent (team 2026-09-21):
// Leasing Complete = lease signed + Buildium entered, waiting on the physical
// move in; Cancelled = the applicant withdrew (task files to Complete, closed).
const ST2_LEASING_DONE = "1218716506959444";
const ST2_CANCELLED = "1218716498458224";
// ---- Status split (Brittany 2026-09-24): Stage / Decision / Holds ----
// Stage = where the file is in the process; Decision = our call (Pending =
// none yet); Holds = named conditions, any number. Conditionally Approved
// always carries at least one Hold.
const F_STAGE = "1218844007644664";
const F_DECISION = "1218843918385357";
const F_HOLDS = "1218843872406896";
// Revised by Brittany 2026-09-25: the intake stages collapsed into Initial
// Review, with what is outstanding carried as Holds; Negotiating added.
const STAGE_OPT: Record<string, string> = {
  "Initial Review": "1218844007644665", "Mgr Review": "1218844007644671",
  "Negotiating": "1218873507535180", "Lease Sent": "1218844007644672",
  "Lease Signed": "1218844007644673", "Pending MI": "1218844007644674",
  "Cancelled": "1218844007644675",
};
const DEC_OPT: Record<string, string> = {
  "Pending": "1218843918385358", "Approved": "1218843918385359",
  "Conditionally Approved": "1218843918385360", "Declined": "1218843918385361",
};
const HOLD_OPT: Record<string, string> = {
  "Pending Showing": "1218871533373041", "Income Docs": "1218871533373042",
  "Applications": "1218871533373043", "Bank Docs": "1218871533373044",
  "App Fee": "1218871533373045", "Co-Signer": "1218843872406899",
  "Sec 8": "1218843872406897", "Owner Policy Exception": "1218843872406898",
  "Balance Owed": "1218843872406901",
};
// holds that mean a decision-side condition (vs an intake doc chase): these
// pull the file onto the holding list / Pending Docs section
const CONDITION_HOLDS = ["Sec 8", "Owner Policy Exception", "Co-Signer", "Balance Owed"];
const SEC_LEASE_SENT = "1217174552914951";
const SEC_PENDING_MGR = "1217174694944319";
const SEC_NEW_INCOMPLETE = "1217174650640615";
type TripleUpd = { stage?: string; decision?: string; holds?: string[]; addHolds?: string[] };
async function applyTriple(gid: string, upd: TripleUpd): Promise<{ stage: string; decision: string; holds: string[] }> {
  const t = await asanaCall("GET", `/tasks/${gid}?opt_fields=name,custom_fields.gid,custom_fields.enum_value.name,custom_fields.multi_enum_values.name`) as { name?: string; custom_fields?: Array<{ gid: string; enum_value?: { name?: string } | null; multi_enum_values?: Array<{ name?: string }> | null }> };
  const cf = t.custom_fields ?? [];
  const curStage = String(cf.find((f) => f.gid === F_STAGE)?.enum_value?.name ?? "");
  const curDec = String(cf.find((f) => f.gid === F_DECISION)?.enum_value?.name ?? "");
  const curHolds = (cf.find((f) => f.gid === F_HOLDS)?.multi_enum_values ?? []).map((x) => String(x?.name ?? "")).filter(Boolean);
  const stage = upd.stage ?? curStage;
  const decision = upd.decision ?? curDec;
  let holds = upd.holds ?? curHolds;
  if (upd.addHolds) holds = [...new Set([...holds, ...upd.addHolds])];
  const writes: Record<string, unknown> = {};
  if (upd.stage && STAGE_OPT[upd.stage]) writes[F_STAGE] = STAGE_OPT[upd.stage];
  if (upd.decision && DEC_OPT[upd.decision]) writes[F_DECISION] = DEC_OPT[upd.decision];
  if (upd.holds || upd.addHolds) writes[F_HOLDS] = holds.map((h) => HOLD_OPT[h]).filter(Boolean);
  if (Object.keys(writes).length) await asanaCall("PUT", `/tasks/${gid}`, { custom_fields: writes }).catch(() => {});
  // No title renames: the triple carries the status, the task keeps its own
  // name (team feedback 2026-09-25). stripStatusPrefix stays for READING the
  // legacy prefixes still on old tasks.
  // section sync: the bench moves sections itself so the Asana rules are
  // optional. Doc-chase holds during Initial Review stay in New/Incomplete;
  // condition holds (or any hold after the file reached Mgr Review) park the
  // file on the Pending Docs / holding section.
  try {
    const heldBack = holds.some((h) => CONDITION_HOLDS.includes(h)) || (holds.length > 0 && stage === "Mgr Review");
    const sec = stage === "Cancelled" ? SEC_COMPLETE
      : decision === "Declined" ? SEC_COMPLETE
      : (stage === "Lease Signed" || stage === "Pending MI") ? SEC_MOVEIN_PENDING
      : stage === "Lease Sent" ? SEC_LEASE_SENT
      : decision === "Conditionally Approved" ? SEC_PENDING_DOCS
      : (heldBack && decision !== "Approved") ? SEC_PENDING_DOCS
      : decision === "Approved" ? SEC_APPROVED
      : (stage === "Mgr Review" || stage === "Negotiating") ? SEC_PENDING_MGR
      : stage ? SEC_NEW_INCOMPLETE : "";
    if (sec) await asanaCall("POST", `/tasks/${gid}/addProject`, { project: PENDING_APPS_PROJECT, section: sec }).catch(() => {});
  } catch { /* section move is best-effort */ }
  return { stage, decision, holds };
}
// old-vocabulary translation: every existing caller keeps its gids
const OLD_TO_TRIPLE: Record<string, TripleUpd> = {
  [STATUS.pendingShowing]: { stage: "Initial Review", addHolds: ["Pending Showing"] },
  [STATUS.pendingApps]: { stage: "Initial Review", addHolds: ["Applications"] },
  [STATUS.pendingIncomeDocs]: { stage: "Initial Review", addHolds: ["Income Docs"] },
  [STATUS.complete]: { stage: "Initial Review", holds: [] }, // every item in
  [STATUS.pendingEnhanced]: { stage: "Initial Review", addHolds: ["Bank Docs"] },
  [STATUS.pendingMgr]: { stage: "Mgr Review" },
  [STATUS.approved]: { decision: "Approved" },
  [STATUS.approvedLeaseSent]: { stage: "Lease Sent", decision: "Approved" },
  [STATUS.leaseSigned]: { stage: "Lease Signed", decision: "Approved" },
  [STATUS.condSec8]: { decision: "Conditionally Approved", addHolds: ["Sec 8"] },
  [STATUS.condOwnerException]: { decision: "Conditionally Approved", addHolds: ["Owner Policy Exception"] },
  [STATUS.pendingCosigner]: { addHolds: ["Co-Signer"] },
  [STATUS.pendingAddlDocs]: { addHolds: ["Income Docs"] },
  [STATUS.pendingLandlordBalance]: { addHolds: ["Balance Owed"] },
  [STATUS.exceptionPet]: { addHolds: ["Owner Policy Exception"] },
  [STATUS.declined]: { decision: "Declined" },
  // On Hold was disabled 2026-09-25; a voided lease goes back to Negotiating
  [STATUS.onHold]: { stage: "Negotiating" },
};
const OLD2_TO_TRIPLE: Record<string, TripleUpd> = Object.fromEntries(
  Object.entries(STATUS2).map(([oldGid, ddGid]) => [ddGid, OLD_TO_TRIPLE[oldGid]]).filter(([, v]) => v)
) as Record<string, TripleUpd>;
OLD2_TO_TRIPLE["1218685241682741"] = { stage: "Initial Review", addHolds: ["App Fee"] };
OLD2_TO_TRIPLE[ST2_LEASING_DONE] = { stage: "Pending MI", decision: "Approved" };
OLD2_TO_TRIPLE[ST2_CANCELLED] = { stage: "Cancelled" };
// combined display chips: stage, then a real decision, then each hold
function tripleChips(cf: Array<{ gid?: string; enum_value?: { name?: string; color?: string } | null; multi_enum_values?: Array<{ name?: string; color?: string }> | null }> | undefined): Array<{ name: string; color: string }> {
  const out: Array<{ name: string; color: string }> = [];
  const st = (cf ?? []).find((f) => f.gid === F_STAGE)?.enum_value;
  if (st?.name) out.push({ name: st.name, color: st.color ?? "" });
  const de = (cf ?? []).find((f) => f.gid === F_DECISION)?.enum_value;
  if (de?.name && de.name !== "Pending") out.push({ name: de.name, color: de.color ?? "" });
  for (const h of (cf ?? []).find((f) => f.gid === F_HOLDS)?.multi_enum_values ?? []) {
    if (h?.name) out.push({ name: h.name, color: h.color ?? "" });
  }
  return out;
}
function tripleNames(cf: Parameters<typeof tripleChips>[0]): { stage: string; decision: string; holds: string[] } {
  return {
    stage: String((cf ?? []).find((f) => f.gid === F_STAGE)?.enum_value?.name ?? ""),
    decision: String((cf ?? []).find((f) => f.gid === F_DECISION)?.enum_value?.name ?? ""),
    holds: ((cf ?? []).find((f) => f.gid === F_HOLDS)?.multi_enum_values ?? []).map((x) => String(x?.name ?? "")).filter(Boolean),
  };
}
// Every status name plus every legacy prefix the automation or staff ever used
const PREFIX_TOKENS = [
  ...Object.values(STATUS_NAME),
  ...Object.values(STATUS2_NAME),
  "WAITING ON ADD'L APPS", "Pending Mgr Review", "ADDITIONAL DOCS NEEDED",
  "Pending Income Docs", "Pending - Balanced Owed to Landlord",
  "Approved - Lease Sent",
  "APPROVED", "REJECTED", "DECLINED", "LEASE SENT", "CO-SIGNER NEEDED",
  "PENDING SEC 8", "Additional Docs Needed",
  // Status split vocabulary (2026-09-24; revised 2026-09-25)
  "Pending Showing", "Pending App(s)", "Pending App Fee", "Ready for Review",
  "Enhanced Review", "Mgr Review", "Lease Signed", "Pending MI",
  "Conditionally Approved", "Pending", "Initial Review", "Negotiating",
  "Pending Bank Docs",
].sort((a, b) => b.length - a.length);
export function stripStatusPrefix(name: string): string {
  let out = name.trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const tok of PREFIX_TOKENS) {
      const re = new RegExp(`^${tok.replace(/[.*+?^$()|[\]\\]/g, "\\$&")}\\s*(\\||\/\/)?\\s*`, "i");
      if (re.test(out)) { out = out.replace(re, ""); changed = true; }
    }
  }
  return out.trim();
}
// Sets the Status field AND rewrites the title prefix to match it: the
// prefix IS the status list, uppercased, pipe-joined (Brittany, 2026-08-08).
async function setStatus_(gid: string, optionGids: string[]) {
  // Status split (2026-09-24): old-vocabulary gids translate onto the Stage /
  // Decision / Holds triple, which also handles prefix + section. The old
  // dropdown is no longer written; delete it when ready.
  const upd = OLD_TO_TRIPLE[optionGids[0] ?? ""];
  if (upd) await applyTriple(gid, upd).catch(() => {});
}
// setStatus2_: like setStatus_ but takes the DROPDOWN option gid directly, for
// the dropdown-native statuses that never existed in the old vocabulary
async function setStatus2_(gid: string, opt2: string) {
  // dropdown-vocabulary gids translate onto the triple too (2026-09-24)
  const upd = OLD2_TO_TRIPLE[opt2];
  if (upd) await applyTriple(gid, upd).catch(() => {});
}
// ---- Screen + Sign v2 application fields (created 2026-09-20, Brittany-approved) ----
const F_MEDIAN_CREDIT = "1218658616135258";
const F_QUAL_INCOME = "1218658506648570";
const PF_FIELDS = {
  income: { field: "1218658224776608", pass: "1218658224776609", fail: "1218658224776610" },
  credit: { field: "1218658224776895", pass: "1218658224776896", fail: "1218658224776897" },
  rentalhx: { field: "1218658224776674", pass: "1218658224776675", fail: "1218658224776676" },
} as const;
// Listing Settings fields the criteria card reads (tiers are sunset; the
// property's criteria ARE Min Credit / Min Income on its LS task)
const LS_PROJECT_ID = "1217446710785429";
const UNIT_ID_FIELD = "1213183515622826";
const LS_MIN_CREDIT = "1217446728640049";
const LS_MIN_INCOME = "1217446770195125";
// combined Screening Criteria field ("Credit: ... / Income: ..." lines)
// replaced the two singles on Listing Settings (Tier 1 combine, 2026-09-26)
const LS_SCREEN_CRIT = "1218889144473591";
function kvGet(text: string, label: string): string {
  const m = String(text ?? "").match(new RegExp(`(?:^|\n)\s*${label}\s*:\s*([\s\S]*?)(?=\n[A-Za-z][A-Za-z0-9 \-]{0,22}:\s|$)`, "i"));
  return m ? m[1].trim() : "";
}
const LS_CURRENT_RENT = "1218160030285805";
const LS_STARTING_RENT = "1217446589856415";
// Status stages that put an application on the Conditionally Approved holding list
const COND_STATUSES: readonly string[] = [STATUS.condSec8, STATUS.condOwnerException, STATUS.pendingCosigner, STATUS.pendingAddlDocs, STATUS.pendingLandlordBalance];
// dropdown option gids for the same five conditional stages
const COND_STATUSES2: readonly string[] = ["1218663502335171", "1218663318816597", "1218663345966377", "1218663432392120", "1218663295821865"];
// ---- v2 stage 2: lease negotiation fields + PandaDoc ----
const F_APPLICANT_EMAILS = "1218658616141558";
const F_APPLICANT_NAMES = "1218658174527268";
const F_DESIRED_START = "1218658616145008";
const F_LEASE_START = "1218658616145235";
const F_TERM_MONTHS = "1218658506629868";
const F_APPROVED_RENT = "1218658166425654";
const F_PETS_MOVEIN = "1218658166425716";
const F_PAYMENT_PLAN = "1218658174540220";
const F_LEASE_DOC_ID = "1218658616146387";
const F_LEASE_CANCEL = "1218658166414542";
// Review Ready At (created 2026-09-20, Brittany-approved): stamped the FIRST
// time an application reaches Pending Mgr Review; the review queue sorts by it
// oldest-first, which is first-in-time lease offering per the Seattle FIT SOP.
const F_REVIEW_READY = "1218668312828102";
const CANCEL_OPTS: Record<string, { gid: string; label: string }> = {
  another_property: { gid: "1218658166414543", label: "Chose Another Property" },
  price: { gid: "1218658166414544", label: "Price" },
  move_in_date: { gid: "1218658166414545", label: "Move In Date" },
  term: { gid: "1218658166414546", label: "Term" },
  pet_policy: { gid: "1218658166414547", label: "Pet Policy" },
  other: { gid: "1218658166414548", label: "Other" },
};
const LS_SECURITY_DEPOSIT = "1217515853935577";
const LS_LAST_MONTH = "1217446710797252";
const LS_PET_RENT = "1217450345262256";
const LS_PET_POLICY = "1217446589255794";
const LS_CONCESSIONS = "1217446589879104";
const LU_FLAT_FEE = "1214959218211026";
const PD = "https://api.pandadoc.com/public/v1";
const PD_KEY = Deno.env.get("PANDADOC_API_KEY") ?? "";
const pdH = { "Authorization": `API-Key ${PD_KEY}`, "Content-Type": "application/json" };
// One walk for everything the lease form and send need: application fields,
// the parent LU (address, flat fee), and the LS task (rent, deposit, terms).
async function leaseContext(gid: string) {
  const t = await asanaCall("GET", `/tasks/${gid}?opt_fields=name,permalink_url,parent.gid,parent.name,custom_fields.gid,custom_fields.number_value,custom_fields.text_value,custom_fields.display_value,custom_fields.enum_value.name`) as {
    name?: string; permalink_url?: string; parent?: { gid?: string; name?: string } | null;
    custom_fields?: { gid?: string; number_value?: number | null; text_value?: string | null; display_value?: string | null; enum_value?: { name?: string } | null }[];
  };
  const cf = t.custom_fields ?? [];
  const num = (fid: string) => { const f = cf.find((x) => x.gid === fid); return f?.number_value ?? null; };
  const str = (fid: string) => String(cf.find((x) => x.gid === fid)?.display_value ?? cf.find((x) => x.gid === fid)?.text_value ?? "").trim();
  const ctx = {
    appName: t.name ?? "", appUrl: t.permalink_url ?? "",
    names: str(F_APPLICANT_NAMES), emails: str(F_APPLICANT_EMAILS),
    desiredStart: str(F_DESIRED_START).slice(0, 10), leaseStart: str(F_LEASE_START).slice(0, 10),
    termMonths: num(F_TERM_MONTHS), approvedRent: num(F_APPROVED_RENT),
    pets: str(F_PETS_MOVEIN), paymentPlanMonths: num(F_PAYMENT_PLAN),
    leaseDocId: str(F_LEASE_DOC_ID),
    luGid: t.parent?.gid ?? "", address: "", tacoma: false, flatFee: null as number | null,
    listedRent: null as number | null, securityDeposit: null as number | null,
    lastMonthRent: "", petRent: null as number | null, petPolicy: "", concessions: "", lsUrl: "",
    unitId: "",
    landscaping: "", utilities: "", utilProviders: "", leaseTermsText: "", internetProvider: "",
    petDeposit: null as number | null, rentCreditDefault: null as number | null,
    parkingInfo: "", storageInfo: "", mailboxLocation: "", mailboxNumber: "",
  };
  if (ctx.luGid) {
    try {
      const lu = await asanaCall("GET", `/tasks/${ctx.luGid}?opt_fields=name,parent.gid,custom_fields.gid,custom_fields.name,custom_fields.number_value,custom_fields.display_value`) as { name?: string; parent?: { gid?: string } | null; custom_fields?: { gid?: string; name?: string; number_value?: number | null; display_value?: string | null }[] };
      const lcf = lu.custom_fields ?? [];
      ctx.address = String(lu.name ?? "").replace(/^LU \|\s*/i, "").split(" - ")[0].trim();
      ctx.tacoma = /tacoma/i.test(String(lu.name ?? ""));
      ctx.flatFee = lcf.find((x) => x.gid === LU_FLAT_FEE)?.number_value ?? null;
      let uid = String(lcf.find((f) => /unit id/i.test(String(f.name ?? "")))?.display_value ?? "").replace(/\D/g, "");
      if (!uid && lu.parent?.gid) {
        // LU without a Unit ID (748 Old Pacific, 2026-09-23): the id lives up
        // the pipeline on the LEASING parent task (Application -> Lease-up ->
        // Leasing). Never match by address; two units at one property cross.
        try {
          const par = await asanaCall("GET", `/tasks/${lu.parent!.gid}?opt_fields=custom_fields.name,custom_fields.display_value`) as { custom_fields?: { name?: string; display_value?: string | null }[] };
          uid = String((par.custom_fields ?? []).find((f) => /unit id/i.test(String(f.name ?? "")))?.display_value ?? "").replace(/\D/g, "");
          if (uid) {
            // heal the LU so the whole pipeline finds it next time
            const luUidF = lcf.find((f) => /unit id/i.test(String(f.name ?? "")));
            if (luUidF?.gid) await asanaCall("PUT", `/tasks/${ctx.luGid}`, { custom_fields: { [luUidF.gid]: uid } }).catch(() => {});
          }
        } catch { /* no parent walk; the form renders partial */ }
      }
      ctx.unitId = uid;
      {
        let hits: { permalink_url?: string; custom_fields?: { gid?: string; display_value?: string | null; number_value?: number | null }[] }[] = [];
        if (uid) {
          hits = (await asanaCall("GET", `/workspaces/${WORKSPACE}/tasks/search?projects.any=${LS_PROJECT_ID}&custom_fields.${UNIT_ID_FIELD}.value=${uid}&opt_fields=name,permalink_url,custom_fields.gid,custom_fields.display_value,custom_fields.number_value`)) as typeof hits;
        }
        const ls = hits?.[0];
        if (ls) {
          const scf = ls.custom_fields ?? [];
          const lnum = (fid: string) => { const f = scf.find((x) => x.gid === fid); return f?.number_value ?? null; };
          const lstr = (fid: string) => String(scf.find((x) => x.gid === fid)?.display_value ?? "").trim();
          ctx.listedRent = lnum(LS_CURRENT_RENT) ?? lnum(LS_STARTING_RENT);
          ctx.securityDeposit = lnum(LS_SECURITY_DEPOSIT);
          ctx.lastMonthRent = lstr(LS_LAST_MONTH);
          ctx.petRent = lnum(LS_PET_RENT);
          ctx.petPolicy = lstr(LS_PET_POLICY);
          ctx.concessions = lstr(LS_CONCESSIONS);
          ctx.lsUrl = ls.permalink_url ?? "";
          // settings context for the Draft Lease form (Brittany 2026-09-21):
          // landscaping / utilities / lease terms come off Listing Settings so
          // the agent verifies against the source, not memory
          ctx.landscaping = lstr("1217741708866530");   // Landscaping Responsibility
          ctx.utilities = lstr("1217515337017428");     // Utility Listing Description
          ctx.utilProviders = lstr("1217921018573269"); // Utility Providers
          ctx.leaseTermsText = lstr("1217446589881673"); // Lease Terms
          ctx.petDeposit = lnum("1217450833264180"); // Pet Deposit
          // Rent Credit default: the first dollar amount in Concessions
          // (Brittany 2026-09-23); "None" or no $ leaves it blank
          const ccM = ctx.concessions.match(/\$\s*([\d,]+)/);
          if (ccM) ctx.rentCreditDefault = Number(ccM[1].replace(/,/g, "")) || null;
          const netM = ctx.utilities.match(/internet:[^.\n]*\bto\s+([^.\n,;]+)/i);
          ctx.internetProvider = (netM?.[1] ?? "").trim();
        }
      }
      // Unit Settings by Unit ID (Property Settings fallback for single-unit
      // properties): Parking / Storage / Mailbox for the lease form
      // (Brittany 2026-09-23)
      if (ctx.unitId) {
        for (const proj of ["1213032009308835", "1211134623744906"]) {
          try {
            const hitsU = (await asanaCall("GET", `/workspaces/${WORKSPACE}/tasks/search?projects.any=${proj}&custom_fields.${UNIT_ID_FIELD}.value=${ctx.unitId}&opt_fields=custom_fields.name,custom_fields.display_value`)) as { custom_fields?: { name?: string; display_value?: string | null }[] }[];
            const ucf = hitsU?.[0]?.custom_fields;
            if (!ucf) continue;
            const ustr = (re: RegExp) => String(ucf.find((f) => re.test(String(f.name ?? "")))?.display_value ?? "").trim();
            const park = ustr(/^parking$/i), stor = ustr(/^storage$/i), mail = ustr(/^mailbox$/i);
            if (park && !ctx.parkingInfo) {
              const lines = park.split(/\n+/).map((x) => x.trim()).filter((x) => x && !/^building:/i.test(x));
              ctx.parkingInfo = (lines[0] ?? park.split(/\n/)[0]).slice(0, 120);
            }
            if (stor && !ctx.storageInfo) ctx.storageInfo = stor.split(/\n/)[0].trim().slice(0, 120);
            if (mail && !ctx.mailboxLocation) {
              ctx.mailboxNumber = (mail.match(/#\s*(\d+)/) ?? [])[1] ?? "";
              ctx.mailboxLocation = mail.split(/\n/)[0].replace(/^mailbox\s*#?\s*\d*[,:.]?\s*/i, "").trim().slice(0, 120);
            }
            if (ctx.parkingInfo || ctx.storageInfo || ctx.mailboxLocation) break;
          } catch { /* next project */ }
        }
      }
    } catch { /* partial context renders a partial form */ }
  }
  return ctx;
}
// ---------- runScreenTask: the whole screening pipeline as a callable ----------
// Shared by the synchronous screenTask action (compat) and the async job
// (screenStart), because the 150-second gateway cap cannot be raised.
async function runScreenTask(taskUrl: string): Promise<{ s: number; b: Record<string, unknown> }> {
  const gid = (taskUrl.match(/task\/(\d+)/) ?? taskUrl.match(/\/(\d{12,})/))?.[1];
  if (!gid) return { s: 400, b: { error: "bad_task_url", message: "Paste the full Asana task link." } };

  let task: { gid?: string; name?: string; notes?: string; permalink_url?: string; parent?: { gid?: string }; custom_fields?: { name?: string; number_value?: number | null }[] };
  try {
    task = await asanaCall("GET", `/tasks/${gid}?opt_fields=name,notes,permalink_url,parent.gid,custom_fields.name,custom_fields.number_value`) as typeof task;
  } catch {
    return { s: 404, b: { error: "task_not_found", message: "Could not open that Asana task. Check the link." } };
  }
  // Advertised rent from the LU/TP parent's Starting Price field
  let advertisedRent = "";
  if (task.parent?.gid) {
    try {
      const p = await asanaCall("GET", `/tasks/${task.parent.gid}?opt_fields=custom_fields.name,custom_fields.display_value`) as { custom_fields?: { name?: string; display_value?: string | null }[] };
      const f = (p.custom_fields ?? []).find((c) => /starting price/i.test(c.name ?? "")) ??
        (p.custom_fields ?? []).find((c) => /advertised|asking/i.test(c.name ?? ""));
      if (f?.display_value) advertisedRent = `$${Number(f.display_value).toLocaleString("en-US")}/month`;
    } catch { /* not on file */ }
  }

  const atts = (await asanaCall("GET", `/tasks/${gid}/attachments?opt_fields=name,download_url,size&limit=50`)
    .catch(() => [])) as { gid?: string; name?: string; download_url?: string; size?: number }[];
  if (!atts?.length) {
    return { s: 422, b: { error: "no_attachments", message: "The task has no attachments. Attach the credit report and income documents first." } };
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
      // 40MB total: parseDocuments batches big packets into multiple model
      // calls now (2026-09-18), so the run cap is our memory budget, not the
      // provider's per-request ceiling. Per-file stays 15MB (one file must
      // still fit a single call).
      if (totalBytes > 40 * 1024 * 1024) { failures.push(`${name}: total size cap reached, screen it in a second pass`); continue; }
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
    return { s: 422, b: { error: "nothing_readable", message: "No attachment could be read. Check the files on the task." } };
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
    // name the prime suspect so "remove the largest attachment" is actionable
    // (team 2026-09-18: the old message left them guessing)
    const sizeOf = (d: Extracted) => d.kind === "pdf" ? (d as { dataBase64: string }).dataBase64.length
      : d.kind === "images" ? (d as { pngs: string[] }).pngs.reduce((a, p) => a + p.length, 0) : 0;
    const biggest = readable.slice().sort((a, b) => sizeOf(b) - sizeOf(a))[0];
    return { s: 502, b: {
      error: "parse_failed",
      message: `Document reading failed${detail ? ` (${detail})` : ""}. The read was already retried once, so this is usually one problem file: remove the largest attachment${biggest ? ` ("${biggest.name}")` : ""} and rerun, or try again in a few minutes.`,
    } };
  }
  // Buildium application record is the deterministic source for the
  // snapshot: DesiredMoveInDate and the Animals / Mascotas section beat
  // model reads of the PDFs (pets flip-flopped between runs otherwise).
  // The task's Applicant ID field points at the group/applicant.
  {
    const refId = (task.custom_fields ?? []).find((c) => /applicant id/i.test(c.name ?? ""))?.number_value;
    if (refId != null) {
      try {
        let memberIds: number[] = [];
        try {
          const grp = await bGet(`/applicants/groups/${refId}`) as { Applicants?: { Id?: number }[] };
          memberIds = (grp.Applicants ?? []).map((m) => m.Id).filter((x): x is number => x != null);
        } catch { memberIds = [refId]; }
        const petParts: string[] = [];
        for (const applicantId of memberIds.slice(0, 6)) {
          const rec = await bGet(`/applicants/${applicantId}`) as Applicant;
          const appId = (rec.Applications ?? [])[0]?.Id;
          if (appId == null) continue;
          const app = await bGet(`/applicants/${applicantId}/applications/${appId}`) as { Application?: { SectionLabel?: string; SectionResponses?: { SectionFields?: { FieldCategoryType?: string | null; FieldLabel?: string; Value?: string }[] }[] }[] };
          for (const sec of app.Application ?? []) {
            const isAnimals = /^animals/i.test(sec.SectionLabel ?? "");
            for (const resp of sec.SectionResponses ?? []) {
              for (const f of resp.SectionFields ?? []) {
                if (f.FieldCategoryType === "DesiredMoveInDate" && f.Value && !parsed.applicationInfo?.desiredMoveInDate) {
                  parsed.applicationInfo = { ...parsed.applicationInfo, desiredMoveInDate: f.Value.slice(0, 10) };
                }
                if (isAnimals && f.Value && f.Value.trim() && !/^(yes|no|none|true|false|0)$/i.test(f.Value.trim())) {
                  const v = f.Value.trim();
                  petParts.push(/^\d{1,3}$/.test(v) ? `${v} lbs` : v);
                }
              }
            }
          }
        }
        if (petParts.length) {
          parsed.applicationInfo = { ...parsed.applicationInfo, pets: petParts.join(", ") };
        } else if (memberIds.length) {
          parsed.applicationInfo = { ...parsed.applicationInfo, pets: parsed.applicationInfo?.pets || "None declared on the application" };
        }
      } catch { /* model values stand */ }
    }
  }

  const asOf = new Date(Date.now() - 7 * 3600 * 1000).toISOString().slice(0, 10); // Seattle-ish
  const result = underwrite({ applicants: parsed.applicants, asOf });

  // v2 (2026-09-20): mirror the machine figures onto the application task's
  // fields so the Manager Review criteria card reads them. Overwritten on
  // every Generate; manager-editable in Asana afterwards. Best-effort.
  try {
    const qiSum = (result.applicants ?? []).reduce((s, a) => s + (Number(a.qualifyingMonthly) || 0), 0);
    const cfW: Record<string, number> = {};
    if (result.medianCredit != null) cfW[F_MEDIAN_CREDIT] = Math.round(Number(result.medianCredit));
    if (qiSum > 0) cfW[F_QUAL_INCOME] = Math.round(qiSum);
    if (Object.keys(cfW).length) await asanaCall("PUT", `/tasks/${gid}`, { custom_fields: cfW });
  } catch { /* the card falls back to blank fields */ }

  const integrityFlags: string[] = [];
  for (const s of skipped) {
    integrityFlags.push(isRestrictedDoc(s)
      ? `Skipped "${s}" unread. Restricted screening content is not considered.`
      : `Skipped "${s}" unread. Prior-underwriting reports have known calculation errors; figures re-derived from source documents.`);
  }
  for (const f of failures) integrityFlags.push(`Attachment not read: ${f}.`);

  const lastNames = parsed.applicants.map((a) => a.name.split(" ").at(-1) ?? "").join("-").toUpperCase().slice(0, 24);
  const reportId = `SW-${asOf.replace(/-/g, "")}-${lastNames || gid.slice(-6)}`;
  const report = renderReport(result, parsed, { reportId, date: asOf, integrityFlags, advertisedRent });

  return { s: 200, b: {
    report, reportId, result,
    warnings: parsed.warnings,
    files: { read: readable.map((d) => d.name), skipped, failed: failures },
    task: { gid, name: task.name ?? "", url: task.permalink_url ?? taskUrl },
  } };
}

// ---------- screening job state in the private screen-jobs bucket ----------
const SB_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const JOB_BUCKET = "screen-jobs";
let jobBucketReady = false;
async function ensureJobBucket() {
  if (jobBucketReady || !SB_URL || !SB_KEY) return;
  await fetch(`${SB_URL}/storage/v1/bucket`, {
    method: "POST", headers: { Authorization: `Bearer ${SB_KEY}`, apikey: SB_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ id: JOB_BUCKET, name: JOB_BUCKET, public: false }),
  }).catch(() => {}); // 409 when it already exists
  jobBucketReady = true;
}
async function jobPut(id: string, data: Record<string, unknown>) {
  await ensureJobBucket();
  await fetch(`${SB_URL}/storage/v1/object/${JOB_BUCKET}/${id}.json`, {
    method: "POST", headers: { Authorization: `Bearer ${SB_KEY}`, apikey: SB_KEY, "Content-Type": "application/json", "x-upsert": "true" },
    body: JSON.stringify(data),
  });
}
async function jobGet(id: string): Promise<Record<string, unknown> | null> {
  const r = await fetch(`${SB_URL}/storage/v1/object/${JOB_BUCKET}/${id}.json`, { headers: { Authorization: `Bearer ${SB_KEY}`, apikey: SB_KEY } });
  if (!r.ok) return null;
  return await r.json().catch(() => null) as Record<string, unknown> | null;
}
// Decision -> destination section in Leasing | Pending Applications:
//   approved as-is / negotiate / owner-exception / other -> Approved
//   approved pending Section 8                            -> Pending Docs / Co-Signer / Sec 8
//   insufficient (all options)                            -> Pending Docs / Co-Signer / Sec 8
//   declined (all options)                                -> Complete
const SEC_APPROVED = "1217174603997588";
const SEC_PENDING_DOCS = "1217174650703534";
const SEC_COMPLETE = "1217174603984367";
const SEC_MOVEIN_PENDING = "1217174739448130";
const ASANA = "https://app.asana.com/api/1.0";
const BUILDIUM = "https://api.buildium.com/v1";
const BH = { "x-buildium-client-id": B_ID, "x-buildium-client-secret": B_SECRET };
// Staff-facing Buildium UI deep link (not the API). Path shape mirrors the
// vendor links that appear in the SOPs; Buildium redirects within the app if
// the trailing segment drifts between versions.
// Verified against a real session (Brittany, 2026-08-05):
// /manager/app/leasing/applicant/{id}/summary
const B_UI = "https://sagareus.managebuilding.com/manager/app/leasing/applicant";

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
let signqCache: { at: number; data: unknown } | null = null;
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
// Recently COMPLETED LU/TP/PreLease tasks (90 days): signing completes the LU
// now (2026-09-21), so the sign/move-in queues must still match it - an open
// application on a closed cycle is normal, not "No Lease Up task matched"
let doneLuCache: { at: number; tasks: Array<{ gid: string; name: string; address: string }> } | null = null;
async function doneLuTasks(): Promise<Array<{ gid: string; name: string; address: string }>> {
  if (doneLuCache && Date.now() - doneLuCache.at < 2 * 60 * 1000) return doneLuCache.tasks;
  const out: Array<{ gid: string; name: string; address: string }> = [];
  const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  let offset = "";
  for (let page = 0; page < 12; page++) {
    const res = await fetch(
      `${ASANA}/projects/${LEASING_LU_PROJECT}/tasks?completed_since=${since}&limit=100&opt_fields=name,completed${offset ? `&offset=${encodeURIComponent(offset)}` : ""}`,
      { headers: { Authorization: `Bearer ${ASANA_PAT}` } },
    );
    const json = await res.json().catch(() => ({})) as {
      data?: Array<{ gid: string; name: string; completed?: boolean }>;
      next_page?: { offset?: string } | null;
    };
    if (!res.ok) break;
    for (const t of json.data ?? []) {
      if (!t.completed) continue;
      if (!/^(LU|TP|PreLease)\s*\|/i.test(t.name)) continue;
      const address = addressFromTaskName(t.name);
      if (!address || address.includes("<")) continue;
      out.push({ gid: t.gid, name: t.name, address });
    }
    offset = json.next_page?.offset ?? "";
    if (!offset) break;
  }
  doneLuCache = { at: Date.now(), tasks: out };
  return out;
}
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

// Fallback LU/TP parent finder: typeahead on street number + name, accept
// only a SINGLE open LU/TP/PreLease match with no conflicting unit marker.
// Catches city-label disagreements (Buildium "Tacoma" vs task "Lakewood",
// 8408 Dalton, 2026-08-05) that the strict token matcher rightly rejects.
async function findLuByTypeahead(address: string): Promise<{ gid: string; name: string } | null> {
  const toks = address.split(",")[0].trim().split(/\s+/);
  if (toks.length < 2 || !/^\d+$/.test(toks[0])) return null;
  const q = `${toks[0]} ${toks[1]}`;
  try {
    const res = await fetch(
      `${ASANA}/workspaces/${WORKSPACE}/typeahead?resource_type=task&query=${encodeURIComponent(q)}&count=20&opt_fields=name,completed`,
      { headers: { Authorization: `Bearer ${ASANA_PAT}` } },
    );
    const data = ((await res.json()) as { data?: { gid: string; name: string; completed?: boolean }[] }).data ?? [];
    const targetUnits = new Set(addrTokens(address).filter((t) => t.startsWith("#")));
    const cands = data.filter((t) => {
      if (t.completed) return false;
      if (!/^(LU|TP|PreLease)\s*\|/i.test(t.name)) return false;
      const nameToks = addrTokens(addressFromTaskName(t.name));
      if (nameToks[0] !== toks[0]) return false;
      const taskUnits = new Set(nameToks.filter((x) => x.startsWith("#")));
      // both sides claim units and they disagree -> wrong unit, reject
      if (targetUnits.size && taskUnits.size && ![...targetUnits].some((u) => taskUnits.has(u))) return false;
      return true;
    });
    return cands.length === 1 ? { gid: cands[0].gid, name: cands[0].name } : null;
  } catch {
    return null;
  }
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

  // ---------- multipart = workbench doc upload -> Asana attachments ----------
  // The widget posts FormData (taskUrl + files); everything else is JSON.
  if ((c.req.header("content-type") ?? "").includes("multipart/form-data")) {
    try {
      const form = await c.req.formData();
      const taskUrl = String(form.get("taskUrl") ?? "");
      const gid = (taskUrl.match(/task\/(\d+)/) ?? taskUrl.match(/\/(\d{12,})/))?.[1];
      if (!gid) return j(headers, 400, { error: "bad_task_url" });
      const files = form.getAll("files").filter((f): f is File => f instanceof File);
      if (!files.length) return j(headers, 400, { error: "no_files" });
      const uploaded: string[] = [];
      for (const f of files) {
        const fd = new FormData();
        fd.append("parent", gid);
        fd.append("file", f, f.name);
        const res = await fetch("https://app.asana.com/api/1.0/attachments", {
          method: "POST",
          headers: { Authorization: `Bearer ${ASANA_PAT}` },
          body: fd,
        });
        if (!res.ok) throw new Error(`asana attachment ${res.status} for ${f.name}`);
        uploaded.push(f.name);
      }
      return j(headers, 200, { uploaded });
    } catch (e) {
      console.error("upload failed:", e);
      return j(headers, 502, { error: "upload_failed", message: "Upload did not reach Asana. Try again, or attach in Asana directly." });
    }
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
      const r = await runScreenTask(taskUrl);
      return j(headers, r.s, r.b);
    }

    // ---------- screenStart / screenPoll: the async screening job ----------
    // Big packets legitimately outrun the 150-second gateway cap, so Generate
    // now answers immediately with a jobId, the screening runs as a background
    // task (EdgeRuntime.waitUntil; wall clock allows what the gateway does
    // not), and the bench polls screenPoll for the finished draft.
    if (action === "screenStart") {
      const taskUrl = String((body as { taskUrl?: unknown }).taskUrl ?? "");
      const gid0 = (taskUrl.match(/task\/(\d+)/) ?? taskUrl.match(/\/(\d{12,})/))?.[1];
      if (!gid0) return j(headers, 400, { error: "bad_task_url", message: "Paste the full Asana task link." });
      const jobId = crypto.randomUUID();
      await jobPut(jobId, { status: "running", startedAt: new Date().toISOString() }).catch(() => {});
      const run = (async () => {
        try {
          const r = await runScreenTask(taskUrl);
          await jobPut(jobId, { status: r.s === 200 ? "done" : "error", code: r.s, result: r.b });
        } catch (e) {
          await jobPut(jobId, { status: "error", code: 500, result: { error: "screen_failed", message: String((e as Error)?.message ?? e).slice(0, 200) } }).catch(() => {});
        }
      })();
      // deno-lint-ignore no-explicit-any
      const er = (globalThis as any).EdgeRuntime;
      if (er?.waitUntil) er.waitUntil(run);
      return j(headers, 200, { ok: true, jobId });
    }
    if (action === "screenPoll") {
      const jobId = String((body as { jobId?: unknown }).jobId ?? "");
      if (!/^[0-9a-f-]{36}$/.test(jobId)) return j(headers, 400, { error: "bad_job" });
      const jb = await jobGet(jobId);
      if (!jb) return j(headers, 200, { ok: true, status: "running" });
      return j(headers, 200, { ok: true, ...jb });
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
                  const bareCur = stripStatusPrefix(cur.name ?? "");
                  const parts = bareCur.split(" / ");
                  if (parts.length >= 3) {
                    const names = roster.map((r) => initialName(r.name)).join(" + ");
                    const rebuilt = `${parts[0]} / ${names} / ${parts.slice(2).join(" / ")}`;
                    if (rebuilt !== cur.name) await asanaCall("PUT", `/tasks/${h.task_gid}`, { name: rebuilt });
                  }
                } catch { /* name rebuild is best-effort */ }
                if (complete) {
                  await asanaCall("POST", `/tasks/${h.task_gid}/stories`, { text: "All applications submitted." });
                }
                await setStatus_(h.task_gid, [complete ? STATUS.pendingIncomeDocs : STATUS.pendingApps]);
                await ledgerUpdateHousehold(h.id, { roster, complete });
                await ledgerInsertApplicant(a.Id!, h.id);
                await flipUndecided(a);
                // Grow the Buildium group to cover the whole household
                try {
                  const ids = roster.map((r) => r.applicantId).filter((x): x is number => x != null);
                  if (ids.length > 1) {
                    const g = await fetch(`${BUILDIUM}/applicants/groups`, {
                      method: "POST", headers: { ...BH, "Content-Type": "application/json" },
                      body: JSON.stringify({ ApplicantIds: ids }),
                    });
                    if (g.ok) {
                      const gidNum = ((await g.json()) as { Id?: number }).Id;
                      if (gidNum != null) await asanaCall("PUT", `/tasks/${h.task_gid}`, { custom_fields: { [APPLICANT_ID_FIELD]: gidNum } }).catch(() => {});
                    }
                  }
                } catch { /* group growth is best-effort */ }
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
              if (lu.hit) luHit = lu.hit;
              else luHit = await findLuByTypeahead(address);
              if (luHit) {
                try {
                  const subs = await asanaCall("GET", `/tasks/${luHit.gid}/subtasks?limit=100&opt_fields=name`) as { name?: string }[];
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
            const taskName = `${ordinal}Application / ${displayNames} / ${titleAddress}`;
            const pendingLines = roster.filter((r) => !r.submitted).map((r) => {
              const x = r.name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
              return `<strong>${x}</strong>\nApplication pending`;
            }).join("\n\n");
            const notes = `<body><strong>Applicant contact details</strong>\n\n${contactBlock(a)}${pendingLines ? "\n\n" + pendingLines : ""}\n\nCreated automatically by the intake scanner.</body>`;

            if (!dryRun) {
              // Instantiate from the Application task template so the SOP
              // subtasks populate (Brittany, 2026-08-05). Async job: poll.
              const job = await asanaCall("POST", `/task_templates/${APPLICATION_TEMPLATE}/instantiateTask`, { name: taskName }) as { gid?: string; new_task?: { gid?: string } };
              let newGid = job.new_task?.gid;
              for (let i = 0; i < 20 && !newGid && job.gid; i++) {
                await new Promise((r) => setTimeout(r, 600));
                const jr = await asanaCall("GET", `/jobs/${job.gid}`) as { status?: string; new_task?: { gid?: string } };
                if (jr.status === "succeeded") newGid = jr.new_task?.gid;
                if (jr.status === "failed") break;
              }
              const made = { gid: newGid } as { gid?: string };
              if (!made.gid) throw new Error("template instantiation did not return a task");
              // Subtask of the LU parent when one matched (keeps project membership)
              if (luHit) await asanaCall("POST", `/tasks/${made.gid}/setParent`, { parent: luHit.gid }).catch(() => {});
              // Prepend our contact block to whatever the template carries
              try {
                const cur = await asanaCall("GET", `/tasks/${made.gid}?opt_fields=html_notes`) as { html_notes?: string };
                const existing = (cur.html_notes ?? "<body></body>").replace(/^<body>/, "").replace(/<\/body>$/, "");
                await asanaCall("PUT", `/tasks/${made.gid}`, { html_notes: notes.replace("</body>", existing ? `\n\n${existing}</body>` : "</body>") });
              } catch { /* template notes stay */ }
              // home in both boards
              await asanaCall("POST", `/tasks/${made.gid}/addProject`, { project: LEASING_HUMAN_VIEW, section: PENDING_APPLICATIONS_SECTION }).catch(() => {});
              await asanaCall("POST", `/tasks/${made.gid}/addProject`, { project: PENDING_APPS_PROJECT, section: "1217174650640615" }).catch(() => {});
              // Incoming application tasks belong to Mary (Brittany, 2026-08-07)
              await asanaCall("PUT", `/tasks/${made.gid}`, { assignee: "1203402971273034" }).catch(() => {});
              await setStatus_(made.gid, [waiting ? STATUS.pendingApps : STATUS.pendingIncomeDocs]);
              // Buildium group makes the household authoritative in Buildium;
              // the Applicant ID field stores the group id (solo households
              // fall back to the applicant id if a 1-member group is refused).
              let refId: number | null = null;
              try {
                const g = await fetch(`${BUILDIUM}/applicants/groups`, {
                  method: "POST", headers: { ...BH, "Content-Type": "application/json" },
                  body: JSON.stringify({ ApplicantIds: [a.Id] }),
                });
                if (g.ok) refId = ((await g.json()) as { Id?: number }).Id ?? null;
              } catch { /* fall back */ }
              if (refId == null) refId = a.Id ?? null;
              if (refId != null) {
                await asanaCall("PUT", `/tasks/${made.gid}`, { custom_fields: { [APPLICANT_ID_FIELD]: refId } }).catch(() => {});
              }
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

    // ---------- newQueue: intake tasks awaiting docs / screening ----------
    if (action === "newQueue") {
      try {
        const out: { name: string; url: string; due: string }[] = [];
        let offset = "";
        for (let page = 0; page < 5; page++) {
          const res = await fetch(
            `${ASANA}/sections/1217174650640615/tasks?completed=false&limit=100&opt_fields=name,permalink_url,due_on,custom_fields.gid,custom_fields.enum_value.name,custom_fields.enum_value.color,custom_fields.multi_enum_values.name,custom_fields.multi_enum_values.color${offset ? `&offset=${encodeURIComponent(offset)}` : ""}`,
            { headers: { Authorization: `Bearer ${ASANA_PAT}` } },
          );
          const json = await res.json().catch(() => ({})) as { data?: { gid?: string; name?: string; permalink_url?: string; due_on?: string; custom_fields?: { gid?: string; enum_value?: { name?: string; color?: string } | null }[] }[]; next_page?: { offset?: string } | null };
          if (!res.ok) throw new Error(`asana new-section page ${page}`);
          for (const t of json.data ?? []) {
            const ev = (t.custom_fields ?? []).find((c) => c.gid === STATUS2_FIELD)?.enum_value;
            const tri = tripleNames(t.custom_fields as never);
            if (ev?.name === "Cancelled" || tri.stage === "Cancelled") continue; // off the workbench (team 2026-09-21)
            const chips = tripleChips(t.custom_fields as never);
            const st = chips.length ? chips : (ev?.name ? [{ name: ev.name, color: ev.color ?? "" }] : []);
            out.push({ gid: t.gid ?? "", name: t.name ?? "", url: t.permalink_url ?? "", due: t.due_on ?? "", status: st } as never);
          }
          offset = json.next_page?.offset ?? "";
          if (!offset) break;
        }
        // required-docs checklist (team 2026-09-21): one of each PER APPLICANT.
        // Adults come from the title's names segment ("A + B"); coverage counts
        // distinct applicant first names in the matching file names, falling
        // back to the raw file count when names are not in the file names.
        // Application dropped from the required list (team 2026-09-21): the
        // application feeds the credit report, so credit presence covers it
        const DOC_RES: Array<[string, RegExp]> = [
          ["credit", /credit|trans ?union|experian|equifax|screening/i],
          ["income", /income|\bpoi\b|pay ?stub|bank|w-?2|offer|employ/i],
          ["id", /\bids?\b|licen[cs]e|passport|identif/i],
        ];
        for (let i0 = 0; i0 < out.length; i0 += 5) {
          await Promise.all(out.slice(i0, i0 + 5).map(async (row) => {
            const gid0 = String((row as { gid?: string }).gid ?? "");
            if (!gid0) return;
            try {
              const nameSeg = (String((row as { name?: string }).name ?? "").match(/Application \/ (.+?) \//i) ?? [])[1] ?? "";
              const firsts = nameSeg.split("+").map((x) => x.trim().split(/\s+/)[0]).filter((x) => x.length > 1);
              const need = Math.max(1, firsts.length);
              const atts = (await asanaCall("GET", `/tasks/${gid0}/attachments?limit=50&opt_fields=name`)) as Array<{ name?: string }>;
              const docs: Record<string, { got: number; need: number }> = {};
              for (const [k, re] of DOC_RES) {
                const hits = (atts ?? []).map((a) => String(a.name ?? "")).filter((n0) => re.test(n0));
                const byName = firsts.filter((f0) => hits.some((n0) => new RegExp(f0.replace(/[.*+?^${}()|[\]\\]/g, ""), "i").test(n0))).length;
                docs[k] = { got: Math.min(need, byName > 0 ? byName : hits.length), need };
              }
              (row as Record<string, unknown>).docs = docs;
            } catch { /* checklist stays hidden for this row */ }
          }));
        }
        return j(headers, 200, { queue: out });
      } catch (e) {
        console.error("newQueue failed:", e);
        return j(headers, 502, { error: "asana_failed", message: "Could not load new applications. Try again in a minute." });
      }
    }

    // ---------- requestDocs: Mary's income-documentation chase ----------
    // Same shape as decide: previewOnly builds the email; the real call posts
    // the draft to the task and pushes the due date to tomorrow. Gmail send is
    // the human's click, from the widget.
    if (action === "requestDocs") {
      const taskUrl = String((body as { taskUrl?: unknown }).taskUrl ?? "");
      const gid = (taskUrl.match(/task\/(\d+)/) ?? taskUrl.match(/\/(\d{12,})/))?.[1];
      if (!gid) return j(headers, 400, { error: "bad_task_url" });
      const previewOnly = (body as { previewOnly?: unknown }).previewOnly === true;
      try {
        const task = await asanaCall("GET", `/tasks/${gid}?opt_fields=name,permalink_url,notes,custom_fields.name,custom_fields.number_value`) as { name?: string; permalink_url?: string; notes?: string; custom_fields?: { name?: string; number_value?: number | null }[] };
        const raw = (task.name ?? "").replace(/^(WAITING ON ADD'L APPS |Pending Mgr Review \|\s*)/i, "");
        let names = "", address = "";
        const slash = raw.match(/Application \/ (.+?) \/ (.+)$/i);
        const angle = raw.match(/<([^>]+)>?/);
        if (slash) { names = slash[1]; address = slash[2]; }
        else if (angle) {
          const inner = angle[1].split("//");
          address = (inner[0] ?? "").split(" - ")[0].trim();
          names = (inner[1] ?? "").trim();
        }
        const firsts = names.split(/[+,/]|\band\b/).map((n) => n.trim().split(/\s+/)[0]).filter(Boolean);
        const first = firsts.join(" and ") || "there";

        let toEmails: string[] = [];
        const refId = (task.custom_fields ?? []).find((c) => /applicant id/i.test(c.name ?? ""))?.number_value;
        if (refId != null) {
          try {
            const grp = await bGet(`/applicants/groups/${refId}`) as { Applicants?: { Email?: string }[] };
            toEmails = (grp.Applicants ?? []).map((m) => m.Email ?? "").filter(Boolean);
          } catch {
            try {
              const rec = await bGet(`/applicants/${refId}`) as Applicant;
              if (rec.Email) toEmails = [rec.Email];
            } catch { /* fall through */ }
          }
        }
        if (!toEmails.length) toEmails = [...new Set((task.notes ?? "").match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? [])].slice(0, 6);

        const emailBody = `Hi ${first},

Thank you for submitting your application for ${address || "the property"}! We have received it and we are still pending your income documentation to begin the review.

Acceptable income documentation:

• Your last two full months of official paystubs (screenshots of banking apps, self-generated documents, and unsigned letters do not qualify)
• Or a signed offer letter on company letterhead with HR contact information
• Or platform earnings statements covering the most recent 60 days for gig or contract work
• Self-employed or 1099 applicants: previous year's full federal tax return (Form 1040 plus Schedule C, E, F, or K-1s as applicable; business returns 1120, 1120S, 1065 when personal income depends on business profitability)
• Housing voucher holders: your official voucher award letter

NEXT STEP: Reply to this email with your income documents and we will start your review right away.

Applications are reviewed in the order they are completed, so a quick reply keeps your place in line.

Best regards,
Sagareus Leasing Support Team
leasing@sagareus.com
Call/Text: 425-390-8122`;
        const emailOut = { subject: "Your Sagareus application: income documentation needed", body: emailBody, to: toEmails, cc: "leasing@sagareus.com" };

        if (previewOnly) return j(headers, 200, { preview: true, email: emailOut });

        const tomorrow = new Date(Date.now() - 7 * 3600 * 1000 + 86400000).toISOString().slice(0, 10);
        await setStatus_(gid, [STATUS.pendingIncomeDocs]);
        await asanaCall("POST", `/tasks/${gid}/stories`, { text: `INCOME DOCS REQUESTED\nSend the email below from leasing@sagareus.com (draft only; review before sending).\n\nEMAIL DRAFT\nSubject: ${emailOut.subject}\n\n${emailBody}` });
        await asanaCall("PUT", `/tasks/${gid}`, { due_on: tomorrow });
        return j(headers, 200, { requested: true, due: tomorrow, email: emailOut, task: { name: task.name ?? "", url: task.permalink_url ?? taskUrl } });
      } catch (e) {
        console.error("requestDocs failed:", e);
        return j(headers, 502, { error: "request_failed", message: "Asana did not accept the update. Check the task before retrying." });
      }
    }

    // ---------- contact: Mary's applicant-contact menu ----------
    // Generalizes requestDocs into five reasons. previewOnly builds the
    // template email + recipients; the real call accepts the (possibly
    // edited) subject/body from the widget, files the record to the task,
    // and applies the reason's status/due side effects. Gmail send is the
    // human's click, from the widget.
    if (action === "contact") {
      const taskUrl = String((body as { taskUrl?: unknown }).taskUrl ?? "");
      const gid = (taskUrl.match(/task\/(\d+)/) ?? taskUrl.match(/\/(\d{12,})/))?.[1];
      if (!gid) return j(headers, 400, { error: "bad_task_url" });
      const previewOnly = (body as { previewOnly?: unknown }).previewOnly === true;
      const reason = String((body as { reason?: unknown }).reason ?? "");

      const SIG = `Best regards,
Sagareus Leasing Support Team
leasing@sagareus.com
Call/Text: 425-390-8122`;
      const ORDER_NOTE = "Applications are reviewed in the order they are completed, so a quick reply keeps your place in line.";
      const TEMPLATES: Record<string, { label: string; status?: string[]; pushDue: boolean; subject: (address: string) => string; body: (first: string, address: string) => string }> = {
        income_docs: {
          label: "INCOME DOCS REQUESTED", status: [STATUS.pendingIncomeDocs], pushDue: true,
          subject: () => "Your Sagareus application: income documentation needed",
          body: (first, address) => `Hi ${first},

Thank you for submitting your application for ${address}! We have received it and we are still pending your income documentation to begin the review.

Acceptable income documentation:

• Your last two full months of official paystubs (screenshots of banking apps, self-generated documents, and unsigned letters do not qualify)
• Or a signed offer letter on company letterhead with HR contact information
• Or platform earnings statements covering the most recent 60 days for gig or contract work
• Self-employed or 1099 applicants: previous year's full federal tax return (Form 1040 plus Schedule C, E, F, or K-1s as applicable; business returns 1120, 1120S, 1065 when personal income depends on business profitability)
• Housing voucher holders: your official voucher award letter

NEXT STEP: Reply to this email with your income documents and we will start your review right away.

${ORDER_NOTE}

${SIG}`,
        },
        addl_applicant: {
          label: "ADDITIONAL APPLICANT REQUESTED", status: [STATUS.pendingApps], pushDue: true,
          subject: () => "Your Sagareus application: additional application needed",
          body: (first, address) => `Hi ${first},

Thank you for submitting your application for ${address}! Every adult (18 or older) who will live at the property must submit their own application, and we are still waiting on at least one adult listed on your application. We cannot begin the review until every adult's application is received.

NEXT STEP: Have each remaining adult apply through the property listing, then reply to this email to let us know their application is in.

${ORDER_NOTE}

${SIG}`,
        },
        esa_docs: {
          label: "ESA DOCUMENTATION REQUESTED", status: [STATUS.pendingAddlDocs], pushDue: true,
          subject: () => "Your Sagareus application: assistance animal documentation",
          body: (first, address) => `Hi ${first},

Thank you for submitting your application for ${address}! Your application indicates an emotional support or assistance animal. There is no pet deposit, pet rent, or pet fee for an approved assistance animal.

NEXT STEP: Reply to this email with your supporting documentation, such as a letter from your licensed health care provider, and we will process the reasonable accommodation request.

${ORDER_NOTE}

${SIG}`,
        },
        unit_leased: {
          label: "UNIT LEASED NOTICE", pushDue: false,
          subject: (address) => `Your Sagareus application: update on ${address}`,
          body: (first, address) => `Hi ${first},

Thank you for your application for ${address}. The home has been leased to another applicant, so it is no longer available.

We would love to help you find another Sagareus home.

NEXT STEP: Browse everything currently available at sagareus.com, and if you see a home you like, reply to this email and we will apply your application to it.

${SIG}`,
        },
        other: {
          label: "APPLICANT CONTACTED", pushDue: false,
          subject: () => "Your Sagareus application",
          body: (first) => `Hi ${first},

[Write your message here]

${SIG}`,
        },
      };
      const tpl = TEMPLATES[reason];
      if (!tpl) return j(headers, 400, { error: "bad_reason" });

      try {
        const task = await asanaCall("GET", `/tasks/${gid}?opt_fields=name,permalink_url,notes,custom_fields.name,custom_fields.number_value`) as { name?: string; permalink_url?: string; notes?: string; custom_fields?: { name?: string; number_value?: number | null }[] };
        const raw = (task.name ?? "").replace(/^(WAITING ON ADD'L APPS |Pending Mgr Review \|\s*)/i, "").replace(/^[A-Z0-9()' |/+&-]+\|\s*/, "");
        let names = "", address = "";
        const slash = raw.match(/Application \/ (.+?) \/ (.+)$/i);
        const angle = raw.match(/<([^>]+)>?/);
        if (slash) { names = slash[1]; address = slash[2]; }
        else if (angle) {
          const inner = angle[1].split("//");
          address = (inner[0] ?? "").split(" - ")[0].trim();
          names = (inner[1] ?? "").trim();
        }
        const firsts = names.split(/[+,/]|\band\b/).map((n) => n.trim().split(/\s+/)[0]).filter(Boolean);
        const first = firsts.join(" and ") || "there";

        let toEmails: string[] = [];
        const refId = (task.custom_fields ?? []).find((c) => /applicant id/i.test(c.name ?? ""))?.number_value;
        if (refId != null) {
          try {
            const grp = await bGet(`/applicants/groups/${refId}`) as { Applicants?: { Email?: string }[] };
            toEmails = (grp.Applicants ?? []).map((m) => m.Email ?? "").filter(Boolean);
          } catch {
            try {
              const rec = await bGet(`/applicants/${refId}`) as Applicant;
              if (rec.Email) toEmails = [rec.Email];
            } catch { /* fall through */ }
          }
        }
        if (!toEmails.length) toEmails = [...new Set((task.notes ?? "").match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? [])].slice(0, 6);

        const addr = address || "the property";
        const subject = String((body as { subject?: unknown }).subject ?? "").trim() || tpl.subject(addr);
        const emailBody = String((body as { body?: unknown }).body ?? "").trim() || tpl.body(first, addr);
        const emailOut = { subject, body: emailBody, to: toEmails, cc: "leasing@sagareus.com" };

        if (previewOnly) return j(headers, 200, { preview: true, email: emailOut });

        let due = "";
        if (tpl.pushDue) {
          due = new Date(Date.now() - 7 * 3600 * 1000 + 86400000).toISOString().slice(0, 10);
          await asanaCall("PUT", `/tasks/${gid}`, { due_on: due });
        }
        if (tpl.status) await setStatus_(gid, tpl.status);
        await asanaCall("POST", `/tasks/${gid}/stories`, { text: `${tpl.label}\nSent from the workbench Contact flow via leasing@sagareus.com.\n\nEMAIL\nTo: ${toEmails.join(", ") || "(no address on file)"}\nSubject: ${subject}\n\n${emailBody}` });
        return j(headers, 200, { contacted: true, due, email: emailOut });
      } catch (e) {
        console.error("contact failed:", e);
        return j(headers, 502, { error: "contact_failed", message: "Asana did not accept the update. Check the task before retrying." });
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
        const out: { name: string; url: string; due: string; status?: { name: string; color: string }[] }[] = [];
        const collect = async (path: string, filter: (name: string) => boolean) => {
          let offset = "";
          for (let page = 0; page < 5; page++) {
            const res = await fetch(
              `${ASANA}${path}?completed=false&limit=100&opt_fields=name,permalink_url,due_on,custom_fields.gid,custom_fields.enum_value.name,custom_fields.enum_value.color,custom_fields.multi_enum_values.name,custom_fields.multi_enum_values.color,custom_fields.date_value${offset ? `&offset=${encodeURIComponent(offset)}` : ""}`,
              { headers: { Authorization: `Bearer ${ASANA_PAT}` } },
            );
            const json = await res.json().catch(() => ({})) as { data?: { gid?: string; name?: string; permalink_url?: string; due_on?: string; custom_fields?: { gid?: string; enum_value?: { name?: string; color?: string } | null; date_value?: { date?: string; date_time?: string } | null }[] }[]; next_page?: { offset?: string } | null };
            if (!res.ok) throw new Error(`asana ${path} page ${page}`);
            for (const t of json.data ?? []) {
              if (t.gid && !seen.has(t.gid) && filter(t.name ?? "")) {
                seen.add(t.gid);
                const ev = (t.custom_fields ?? []).find((c) => c.gid === STATUS2_FIELD)?.enum_value;
                const tri = tripleNames(t.custom_fields as never);
                // Cancelled leaves the bench; a decided row belongs to step 4/5 (team 2026-09-21)
                if (ev?.name === "Cancelled" || ev?.name === "Approved") continue;
                if (tri.stage === "Cancelled" || (tri.decision && tri.decision !== "Pending")) continue;
                const chips = tripleChips(t.custom_fields as never);
                const st = chips.length ? chips : (ev?.name ? [{ name: ev.name, color: ev.color ?? "" }] : []);
                const dv = (t.custom_fields ?? []).find((c) => c.gid === F_REVIEW_READY)?.date_value;
                const ready = dv?.date_time ?? dv?.date ?? "";
                out.push({ name: t.name ?? "", url: t.permalink_url ?? "", due: t.due_on ?? "", status: st, reviewReady: ready } as never);
              }
            }
            offset = json.next_page?.offset ?? "";
            if (!offset) break;
          }
        };
        await collect(`/sections/${PENDING_MGR_SECTION}/tasks`, () => true);
        await collect(`/sections/${PENDING_APPLICATIONS_SECTION}/tasks`, (n) => /^Pending Mgr Review/i.test(n));
        // first-in-time: oldest review-ready first; unstamped rows sort last
        out.sort((a, b) => {
          const ra = (a as { reviewReady?: string }).reviewReady || "9999";
          const rb = (b as { reviewReady?: string }).reviewReady || "9999";
          return ra.localeCompare(rb);
        });
        return j(headers, 200, { queue: out });
      } catch (e) {
        console.error("mgrQueue failed:", e);
        return j(headers, 502, { error: "asana_failed", message: "Could not load the review queue. Try again in a minute." });
      }
    }

    // ---------- feedback: passthrough to site-visit-proxy plFeedback ----------
    // The sandbox bench on /wt files its Team Feedback under the same dev task
    // and bench label as the live /work-bench button.
    if (action === "feedback") {
      const svKey = Deno.env.get("SITE_VISIT_KEY") ?? "";
      const base = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
      if (!svKey || !base) return j(headers, 502, { error: "unconfigured", message: "Feedback relay not configured." });
      try {
        const r0 = await fetch(`${base}/functions/v1/site-visit-proxy`, {
          method: "POST", headers: { "Content-Type": "application/json", "x-sv-key": svKey },
          body: JSON.stringify({ action: "plFeedback", bench: "Screen + Sign", text: String((body as Record<string, unknown>).text ?? "").slice(0, 4000) }),
        });
        const j0 = await r0.json().catch(() => ({}));
        return j(headers, r0.ok ? 200 : r0.status, j0 as Record<string, unknown>);
      } catch {
        return j(headers, 502, { error: "feedback_failed", message: "Could not send the feedback." });
      }
    }

    // ---------- mailUsers / mailSend: passthrough to site-visit-proxy ----------
    // REUSE, DON'T REBUILD: the Gmail service-account machinery (moUsers roster,
    // moDraft multipart send) lives in site-visit-proxy. Secrets are project
    // wide, so this forwards with the site-visit key instead of duplicating the
    // JWT/MIME code. Applicant mail goes From leasing@sagareus.com, cc leasing@.
    if (action === "mailUsers" || action === "mailSend") {
      const svKey = Deno.env.get("SITE_VISIT_KEY") ?? "";
      const base = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
      if (!svKey || !base) return j(headers, 200, { ok: false, error: "gmail_unconfigured" });
      const b = body as Record<string, unknown>;
      const fwd = action === "mailUsers" ? { action: "moUsers" } : {
        action: "moDraft",
        userEmail: String(b.userEmail ?? ""),
        from: "leasing@sagareus.com",
        cc: "leasing@sagareus.com",
        to: String(b.to ?? ""),
        send: b.send === true,
        subject: String(b.subject ?? ""),
        textBody: String(b.textBody ?? ""),
        htmlBody: String(b.htmlBody ?? ""),
      };
      try {
        const r0 = await fetch(`${base}/functions/v1/site-visit-proxy`, {
          method: "POST", headers: { "Content-Type": "application/json", "x-sv-key": svKey },
          body: JSON.stringify(fwd),
        });
        const j0 = await r0.json().catch(() => ({}));
        return j(headers, r0.ok ? 200 : r0.status, j0 as Record<string, unknown>);
      } catch (e) {
        console.error("mail passthrough failed:", e);
        return j(headers, 200, { ok: false, error: "gmail_error" });
      }
    }

    // ---------- mailNote: correction comment when a declared send failed ----------
    // The decide/contact comments record the send optimistically (the Gmail
    // call runs after filing); when it fails, the bench posts the honest
    // correction here so the task record never claims a send that did not
    // happen (Brittany 2026-09-24).
    if (action === "mailNote") {
      const taskUrl = String((body as { taskUrl?: unknown }).taskUrl ?? "");
      const gid = (taskUrl.match(/task\/(\d+)/) ?? taskUrl.match(/\/(\d{12,})/))?.[1];
      const text = String((body as { text?: unknown }).text ?? "").slice(0, 1000);
      if (!gid || !text) return j(headers, 400, { error: "bad_note" });
      try {
        await asanaCall("POST", `/tasks/${gid}/stories`, { text: `EMAIL NOTE\n${text}` });
        return j(headers, 200, { ok: true });
      } catch { return j(headers, 502, { error: "note_failed" }); }
    }

    // ---------- enterMoveIn: the signed lease becomes a Buildium lease ----------
    // Gate: the PandaDoc document must be completed (all signatures). Writes:
    // 1) Buildium lease (fixed term, tenants from the application, rent schedule
    //    and deposit best-effort; a payment plan swaps the upfront deposit for
    //    split deposit + last-month installment charges per the SOP),
    // 2) delist the unit, 3) LU Lease Signed + Move in Date (flips the unit to
    // Move In Pending; it rides Execute + Adapt until moved in), 4) Block EFT
    // subtask on the LU assigned to Mary due today, 5) application to Complete
    // with Status Lease Signed. Every partial failure lands in notes[].
    if (action === "enterMoveIn") {
      const taskUrl = String((body as { taskUrl?: unknown }).taskUrl ?? "");
      const gid = (taskUrl.match(/task\/(\d+)/) ?? taskUrl.match(/\/(\d{12,})/))?.[1];
      if (!gid) return j(headers, 400, { error: "bad_task_url" });
      try {
        const ctx = await leaseContext(gid);
        if (!ctx.leaseDocId) return j(headers, 400, { error: "no_doc", message: "No lease document on this application; use Mark Signed for manual flows." });
        const r0 = await fetch(`${PD}/documents/${ctx.leaseDocId}/details`, { headers: pdH });
        const d0 = await r0.json().catch(() => ({})) as { status?: string; date_completed?: string };
        if (!r0.ok || d0.status !== "document.completed") {
          return j(headers, 400, { error: "not_completed", message: `The lease is ${String(d0.status ?? "unreadable").replace("document.", "")}, not completed. Enter Move In unlocks when every signature is in.` });
        }
        const leaseSigned = String(d0.date_completed ?? "").slice(0, 10) || new Date(Date.now() - 7 * 3600 * 1000).toISOString().slice(0, 10);
        const start = ctx.leaseStart;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return j(headers, 400, { error: "no_start", message: "No Lease Start Date on the application." });
        const term = ctx.termMonths ?? 12;
        const end = new Date(Date.parse(start + "T12:00:00Z") + Math.round(term / 12 * 364) * 86400000).toISOString().slice(0, 10);
        const rent = ctx.approvedRent ?? ctx.listedRent;
        const deposit = ctx.securityDeposit ?? (rent != null ? Math.round(rent) - 100 : null);
        // last month follows the Listing Settings call ("Not required" = none),
        // same rule as the Draft Lease form defaults (2026-09-21)
        const lastMonth = (ctx.tacoma || /not required|none|^no$/i.test(ctx.lastMonthRent)) ? null : (rent != null ? Math.round(rent) : null);
        const planMonths = ctx.paymentPlanMonths != null && ctx.paymentPlanMonths >= 2 ? Math.min(6, Math.round(ctx.paymentPlanMonths)) : 0;
        const namesList = ctx.names.split(",").map((x) => x.trim()).filter(Boolean);
        const emailsList = ctx.emails.split(/[,;\s]+/).map((x) => x.trim()).filter((x) => /@/.test(x));
        const notes: string[] = [];
        // ---- 1. Buildium lease ----
        let leaseId: number | null = null;
        if (!ctx.unitId) notes.push("No Unit ID on the LU: Buildium lease NOT created, enter it by hand.");
        else if (rent == null) notes.push("No rent on file: Buildium lease NOT created, enter it by hand.");
        else {
          // Applicant conversion (Brittany 2026-09-22): the applicants already
          // exist in Buildium, so the lease is created from ApplicantIds
          // (approving their applications first - ApplicantIds must refer to
          // approved applicants) and Buildium converts them to tenants. Inline
          // Tenants would duplicate the contacts; that path survives only as
          // the fallback when not every resident matches an applicant.
          const applicantIds: number[] = [];
          try {
            const aps = await bGetAll(`/applicants?unitids=${encodeURIComponent(ctx.unitId)}`) as Array<{ Id?: number; Email?: string; Applications?: Array<{ Id?: number; ApplicationStatus?: string }> }>;
            for (const em of emailsList) {
              const hitA = aps.find((a) => String(a.Email ?? "").toLowerCase() === em.toLowerCase());
              if (hitA?.Id == null) continue;
              applicantIds.push(hitA.Id);
              for (const app0 of hitA.Applications ?? []) {
                if (app0?.Id != null && app0.ApplicationStatus !== "Approved") {
                  await fetch(`${BUILDIUM}/applicants/${hitA.Id}/applications/${app0.Id}`, {
                    method: "PUT", headers: { ...BH, "Content-Type": "application/json" },
                    body: JSON.stringify({ ApplicationStatus: "Approved" }),
                  }).catch(() => null);
                }
              }
            }
          } catch { applicantIds.length = 0; }
          const convertAll = applicantIds.length === namesList.length && applicantIds.length > 0;
          if (convertAll) notes.push("Buildium applicants matched by email; converting to tenants (no duplicate contacts).");
          else notes.push("Not every resident matched a Buildium applicant; creating tenant contacts inline (check for duplicate applicant records).");
          // Buildium validation (first live run, 2026-09-22, lease 769979):
          // each tenant needs an Address, the rent charge needs a GlAccountId,
          // and the deposit needs a DueDate
          let unitAddr: Record<string, unknown> | null = null;
          try {
            const u0 = await bGet(`/rentals/units/${encodeURIComponent(ctx.unitId)}`) as { Address?: Record<string, unknown> };
            unitAddr = u0?.Address ?? null;
          } catch { /* tenants go without an address; Buildium will say so */ }
          let rentGl: number | null = null;
          try {
            const gl0 = await bGetAll(`/glaccounts`) as { Id?: number; Name?: string; Type?: string }[];
            rentGl = gl0.find((g) => g.Type === "Income" && /^rent\b/i.test(String(g.Name ?? "")) && !/insurance/i.test(String(g.Name ?? "")))?.Id ?? null;
          } catch { /* charge goes without a GL; Buildium will say so */ }
          const tenants = namesList.map((full, i) => {
            const parts = full.split(/\s+/);
            const last = parts.length > 1 ? parts.pop() ?? "" : full;
            const t0: Record<string, unknown> = { FirstName: parts.join(" ") || full, LastName: last, Email: emailsList[i] ?? undefined };
            if (unitAddr) t0.Address = unitAddr;
            return t0;
          });
          const firstOfNext = (() => {
            const d = new Date(start + "T12:00:00Z");
            return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
          })();
          const basePayload: Record<string, unknown> = {
            LeaseType: "Fixed", UnitId: Number(ctx.unitId),
            LeaseFromDate: start, LeaseToDate: end,
            SendWelcomeEmail: false,
            ...(convertAll ? { ApplicantIds: applicantIds } : { Tenants: tenants }),
          };
          const fullPayload: Record<string, unknown> = {
            ...basePayload,
            Rent: { Cycle: "Monthly", Charges: [{ Amount: Math.round(rent), ...(rentGl != null ? { GlAccountId: rentGl } : {}), NextDueDate: firstOfNext, Memo: "Rent" }] },
          };
          if (!planMonths && deposit != null) fullPayload.SecurityDeposit = { Amount: Math.round(deposit), DueDate: start };
          const mk = async (payload: Record<string, unknown>) => {
            const r1 = await fetch(`${BUILDIUM}/leases`, { method: "POST", headers: { ...BH, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            const t1 = await r1.text().catch(() => "");
            return { ok: r1.ok, status: r1.status, body: t1 };
          };
          let res1 = await mk(fullPayload);
          if (!res1.ok) {
            notes.push(`Buildium rejected the full lease payload (${res1.status}: ${res1.body.slice(0, 140)}); retried without rent/deposit schedules.`);
            res1 = await mk(basePayload);
          }
          if (res1.ok) {
            try { leaseId = (JSON.parse(res1.body) as { Id?: number }).Id ?? null; } catch { leaseId = null; }
            notes.push(`Buildium lease created${leaseId ? ` (id ${leaseId})` : ""}: ${start} to ${end}${rent != null ? ` at $${Math.round(rent).toLocaleString("en-US")}/mo` : ""}.`);
          } else {
            notes.push(`Buildium lease NOT created (${res1.status}: ${res1.body.slice(0, 160)}). Enter it by hand.`);
          }
          // ---- 4 (stage 4). payment plan: split deposit + last month charges ----
          if (leaseId && planMonths) {
            try {
              const gl = await bGetAll(`/glaccounts`) as { Id?: number; Name?: string }[];
              const find = (re: RegExp) => gl.find((g) => re.test(String(g.Name ?? "")))?.Id ?? null;
              const glDep = find(/security\s*deposit/i);
              const glLast = find(/last\s*month|prepaid\s*rent/i);
              if (!glDep || (lastMonth != null && !glLast)) {
                notes.push("Payment plan NOT entered: security deposit / last month GL accounts not found by name. Enter the split charges by hand.");
              } else {
                const perDep = deposit != null ? Math.round(deposit / planMonths) : 0;
                const perLast = lastMonth != null ? Math.round(lastMonth / planMonths) : 0;
                let entered = 0;
                for (let i = 1; i <= planMonths; i++) {
                  const d = new Date(start + "T12:00:00Z");
                  const due = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + i, 1)).toISOString().slice(0, 10);
                  const lines: { GlAccountId: number; Amount: number }[] = [];
                  if (perDep) lines.push({ GlAccountId: glDep, Amount: perDep });
                  if (perLast && glLast) lines.push({ GlAccountId: glLast, Amount: perLast });
                  for (const ln of lines) {
                    const rc = await fetch(`${BUILDIUM}/leases/${leaseId}/charges`, {
                      method: "POST", headers: { ...BH, "Content-Type": "application/json" },
                      body: JSON.stringify({ Date: due, Memo: `Payment plan ${i}/${planMonths}: ${ln.GlAccountId === glDep ? "security deposit" : "last month rent"}`, Lines: [ln] }),
                    });
                    if (rc.ok) entered++;
                  }
                }
                notes.push(`Payment plan entered: ${entered} split charges over ${planMonths} months (deposit ${perDep ? `$${perDep.toLocaleString("en-US")}/mo` : "none"}, last month ${perLast ? `$${perLast.toLocaleString("en-US")}/mo` : "none"}). Verify the ledger.`);
              }
            } catch {
              notes.push("Payment plan NOT entered (Buildium error). Enter the split charges by hand.");
            }
          }
          // ---- 2. delist ----
          try {
            const rd = await fetch(`${BUILDIUM}/rentals/units/${encodeURIComponent(ctx.unitId)}/listing`, { method: "DELETE", headers: BH });
            notes.push(rd.ok || rd.status === 404 ? "Unit delisted in Buildium." : `Delist failed (${rd.status}); delist by hand.`);
          } catch { notes.push("Delist failed; delist by hand."); }
        }
        // ---- 3. LU writes (same only-ever-sets convention as signUpdate) ----
        const moveIn = start;
        if (ctx.luGid) {
          try {
            const luFull = await asanaCall("GET", `/tasks/${ctx.luGid}?opt_fields=custom_fields.gid,custom_fields.name,custom_fields.type`) as { custom_fields?: { gid: string; name?: string; type?: string }[] };
            const lcf2 = luFull.custom_fields ?? [];
            const writeField = async (re: RegExp, label: string, iso: string) => {
              const f = lcf2.find((x) => re.test(String(x.name ?? "")));
              if (!f) { notes.push(`no ${label} field on the LU task`); return; }
              const val = f.type === "date" ? { date: iso } : iso;
              try { await asanaCall("PUT", `/tasks/${ctx.luGid}`, { custom_fields: { [f.gid]: val } }); }
              catch {
                try { await asanaCall("PUT", `/tasks/${ctx.luGid}`, { custom_fields: { [f.gid]: iso } }); }
                catch { notes.push(`could not write ${label}`); }
              }
            };
            await writeField(/lease signed/i, "Lease Signed", leaseSigned);
            await writeField(/move in date/i, "Move in Date", moveIn);
            notes.push(`LU updated: Lease Signed ${leaseSigned}, Move in Date ${moveIn} (unit now Move In Pending on the Execute bench).`);
            // ---- 4. Block EFT subtask to Mary, due today (Brittany 2026-09-20) ----
            const MARY_GID = "1203402971273034";
            const today = new Date(Date.now() - 7 * 3600 * 1000).toISOString().slice(0, 10);
            await asanaCall("POST", `/tasks`, {
              name: `Block EFT / Credit Card | ${ctx.address}`,
              parent: ctx.luGid, assignee: MARY_GID, due_on: today,
              notes: `Move-in funds are cashier's check or money order only. In Buildium: Financials > Payment Settings > Override payment methods, disallow EFT and credit card until the move-in funds are deposited, then the Resident Account Manager unblocks.\nCreated by Enter Move In (Screen + Sign bench).`,
            });
            notes.push("Block EFT subtask created on the LU, assigned to Mary, due today.");
            // signing ends the leasing cycle: the LU/TP/PreLease task completes
            // here (Brittany 2026-09-21). The Execute bench still shows it as
            // Move In Pending while the Move in Date is ahead (completed
            // pass-through, 2026-09-10 rule).
            try {
              await asanaCall("PUT", `/tasks/${ctx.luGid}`, { completed: true });
              notes.push("LU task marked complete (leasing cycle done).");
            } catch { notes.push("Could not complete the LU task; close it by hand."); }
          } catch { notes.push("LU writes or the Block EFT subtask failed; check the LU task."); }
        } else notes.push("No LU task matched; write Lease Signed / Move in Date by hand.");
        // ---- 5. application to Move In Pending, still OPEN ----
        // The application stays open until the tenant actually moves in
        // (Brittany 2026-09-21); only the section and Status move here.
        try {
          await asanaCall("POST", `/tasks/${gid}/addProject`, { project: PENDING_APPS_PROJECT, section: SEC_MOVEIN_PENDING });
          notes.push("Application moved to Move In Pending; it stays open until move in.");
        } catch { notes.push("Could not move the application to Move In Pending."); }
        // Leasing Complete, Pending MI (team 2026-09-21): lease signed AND
        // Buildium entered - only the physical move in remains
        await setStatus2_(gid, ST2_LEASING_DONE);
        const summary = `ENTER MOVE IN (Screen + Sign bench)\n${notes.join("\n")}`;
        await asanaCall("POST", `/tasks/${gid}/stories`, { text: summary }).catch(() => {});
        if (ctx.luGid) await asanaCall("POST", `/tasks/${ctx.luGid}/stories`, { text: summary }).catch(() => {});
        signqCache = null;
        return j(headers, 200, { ok: true, leaseId, leaseSigned, moveIn, notes });
      } catch (e) {
        console.error("enterMoveIn failed:", e);
        return j(headers, 502, { error: "movein_failed", message: "Enter Move In failed partway; read the task comments before retrying." });
      }
    }

    // ---------- leaseForm: prefill for the v2 lease terms panel ----------
    if (action === "leaseForm") {
      const taskUrl = String((body as { taskUrl?: unknown }).taskUrl ?? "");
      const gid = (taskUrl.match(/task\/(\d+)/) ?? taskUrl.match(/\/(\d{12,})/))?.[1];
      if (!gid) return j(headers, 400, { error: "bad_task_url" });
      try {
        const ctx = await leaseContext(gid);
        return j(headers, 200, { ok: true, ...ctx, pdConfigured: !!PD_KEY });
      } catch (e) {
        console.error("leaseForm failed:", e);
        return j(headers, 502, { error: "asana_failed", message: "Could not load the lease form." });
      }
    }

    // ---------- leaseSend: create + send the PandaDoc lease ----------
    // Template selected by NAME: "Current Sagareus Lease (N resident)" so yearly
    // revisions never break the tooling. Reviewer (listings@) signs first; the
    // document flows to the residents automatically after the reviewer completes.
    if (action === "leaseSend") {
      if (!PD_KEY) return j(headers, 200, { ok: false, error: "pandadoc_unconfigured" });
      const taskUrl = String((body as { taskUrl?: unknown }).taskUrl ?? "");
      const gid = (taskUrl.match(/task\/(\d+)/) ?? taskUrl.match(/\/(\d{12,})/))?.[1];
      if (!gid) return j(headers, 400, { error: "bad_task_url" });
      const terms = ((body as { terms?: Record<string, unknown> }).terms ?? {}) as Record<string, unknown>;
      const s = (k: string) => String(terms[k] ?? "").trim();
      const n = (k: string) => { const v = Number(terms[k]); return Number.isFinite(v) ? v : null; };
      const namesList = s("names").split(",").map((x) => x.trim()).filter(Boolean);
      const emailsList = s("emails").split(/[,;\s]+/).map((x) => x.trim()).filter((x) => /@/.test(x));
      if (!namesList.length) return j(headers, 400, { error: "bad_terms", message: "Enter the resident names (comma separated) first." });
      if (emailsList.length < namesList.length) return j(headers, 400, { error: "bad_terms", message: `Enter ${namesList.length} resident email(s), in the same order as the names.` });
      if (namesList.length > 5) return j(headers, 400, { error: "bad_terms", message: "Templates cover 1-5 residents; draft 6+ by hand in PandaDoc." });
      const leaseStart = s("leaseStart"), leaseEnd = s("leaseEnd");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(leaseStart) || !/^\d{4}-\d{2}-\d{2}$/.test(leaseEnd)) {
        return j(headers, 400, { error: "bad_terms", message: "Pick the lease start date first." });
      }
      const rent = n("rent");
      if (!rent || rent < 100) return j(headers, 400, { error: "bad_terms", message: "Enter the rent first." });
      try {
        const ctx = await leaseContext(gid);
        // template lookup (Brittany 2026-09-23): the new token-based templates
        // ("Sagareus Lease - N Resident") win when they exist; the old
        // "Current Sagareus Lease (N resident)" set stays as the fallback so
        // the team keeps working while the new ones roll out. Names are
        // squashed (case, spaces, punctuation, trailing s) so dash and
        // spacing variants all match.
        const nRes = namesList.length;
        const squash = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/residents$/, "resident");
        const wantNew = squash(`sagareus lease ${nRes} resident`);
        const wantOld = squash(`current sagareus lease ${nRes} resident`);
        let tplId = "";
        let tplOld = "";
        let page = 1;
        while (page <= 4) {
          const r0 = await fetch(`${PD}/templates?count=100&page=${page}&q=${encodeURIComponent("Sagareus Lease")}`, { headers: pdH });
          const j0 = await r0.json().catch(() => ({})) as { results?: { id?: string; name?: string }[] };
          if (!r0.ok) return j(headers, 502, { error: "pandadoc_failed", message: "PandaDoc did not answer for the template list." });
          for (const t of j0.results ?? []) {
            const sq = squash(String(t.name ?? ""));
            if (sq === wantNew && !tplId) tplId = t.id ?? "";
            if (sq === wantOld && !tplOld) tplOld = t.id ?? "";
          }
          if ((j0.results ?? []).length < 100) break;
          page++;
        }
        if (!tplId) tplId = tplOld;
        if (!tplId) return j(headers, 400, { error: "no_template", message: `No PandaDoc template named "Sagareus Lease - ${nRes} Resident" (or the older "Current Sagareus Lease (${nRes} resident)").` });
        const money = (v: number | null) => v == null ? "" : `$${Math.round(v).toLocaleString("en-US")}`;
        // token values carry NO dollar sign: the template embeds the $ next to
        // each token, so a $ here rendered doubled (team feedback 2026-09-21)
        const num = (v: number | null) => v == null ? "" : Math.round(v).toLocaleString("en-US");
        const deposit = n("deposit"), lastMonth = n("lastMonth"), petRent = n("petRent"), flatFee = n("flatFee") ?? ctx.flatFee, prorated = n("prorated"), rentCredit = n("rentCredit");
        const parkingRent = n("parkingRent"), storageRent = n("storageRent");
        const petDeposit = n("petDeposit") ?? ctx.petDeposit;
        const totalRent = rent + (petRent ?? 0) + (flatFee ?? 0) + (parkingRent ?? 0) + (storageRent ?? 0);
        const depPlusLast = (deposit ?? 0) + (lastMonth ?? 0);
        const totalMoveIn = depPlusLast + (prorated ?? 0) + (petDeposit ?? 0);
        const zip = (ctx.address.match(/\b(\d{5})(?:-\d{4})?\s*$/) ?? [])[1] ?? "";
        const tokens: { name: string; value: string }[] = [
          { name: "Property Address", value: ctx.address },
          { name: "Zip", value: zip },
          { name: "Rent", value: num(rent) },
          { name: "Total Rent", value: num(totalRent) },
          { name: "Refundable Deposit", value: num(deposit) },
          { name: "Last Month Rent", value: lastMonth != null ? num(lastMonth) : "Not collected" },
          { name: "Lease Start Date", value: leaseStart },
          { name: "Lease End Date", value: leaseEnd },
          { name: "Prorated 1st mo rent", value: num(prorated) },
          { name: "Prorated rent due", value: "Within 48 hours of lease signing" },
          { name: "Total Move-in", value: num(totalMoveIn) },
          { name: "deposit + last month rent $", value: num(depPlusLast) },
          { name: "Flat Fee Utility Charge", value: flatFee != null ? num(flatFee) : "" },
          { name: "Pet Rent", value: petRent != null ? num(petRent) : "" },
          { name: "per pet rent", value: petRent != null ? num(petRent) : "" },
          { name: "Pets at Move-In (# type)", value: s("pets") },
          { name: "Parking Type(s):", value: s("parkingTypes") },
          { name: "opt | Assigned Parking Space(s)", value: s("parkingSpaces") },
          { name: "Parking Rent", value: parkingRent != null ? num(parkingRent) : "" },
          { name: "Storage Rent", value: storageRent != null ? num(storageRent) : "" },
          { name: "opt | Storage Description", value: s("storageDesc") },
          { name: "Mailbox Location", value: s("mailboxLocation") },
          { name: "opt | Mailbox Number", value: s("mailboxNumber") },
          { name: "opt | Internet Provider", value: s("internetProvider") },
          { name: "Rent Credit", value: rentCredit != null ? num(rentCredit) : "" },
          { name: "OPTIONAL | General Addendum Terms", value: s("generalAddendum") },
          // utilities + landscaping as plain text tokens straight from Listing
          // Settings (Brittany 2026-09-23: the checkbox grid retired; the
          // template carries {Utility Description} and {Landscaping
          // Responsibility} text fields instead). Editable on the form; the
          // Settings values are the defaults.
          // both spellings ship; PandaDoc ignores tokens a template lacks
          // (the new 1-resident template uses Utility_Description and
          // Landscaping, 2026-09-23)
          { name: "Utility Description", value: s("utilities") || ctx.utilities },
          { name: "Utility_Description", value: s("utilities") || ctx.utilities },
          { name: "Landscaping Responsibility", value: s("landscaping") || ctx.landscaping },
          { name: "Landscaping", value: s("landscaping") || ctx.landscaping },
          { name: "Pet Deposit", value: petDeposit != null ? num(petDeposit) : "" },
          { name: "Pet Policy", value: ctx.petPolicy },
        ];
        namesList.forEach((full, i) => {
          const parts = full.split(/\s+/);
          const last = parts.length > 1 ? parts.pop() ?? "" : "";
          tokens.push({ name: `Resident ${i + 1}.FirstName`, value: parts.join(" ") || full });
          tokens.push({ name: `Resident ${i + 1}.LastName`, value: last });
        });
        const recipients = [
          { email: "listings@sagareus.com", role: "Reviewer" },
          ...namesList.map((full, i) => {
            const parts = full.split(/\s+/);
            const last = parts.length > 1 ? parts.pop() ?? "" : "";
            return { email: emailsList[i], first_name: parts.join(" ") || full, last_name: last, role: `Resident ${i + 1}` };
          }),
        ];
        const mk = await fetch(`${PD}/documents`, {
          method: "POST", headers: pdH,
          body: JSON.stringify({ name: `Lease | ${ctx.address || ctx.appName}`, template_uuid: tplId, recipients, tokens, metadata: { asana_task: gid } }),
        });
        const doc = await mk.json().catch(() => ({})) as { id?: string; status?: string; detail?: unknown };
        if (!mk.ok || !doc.id) {
          console.error("pandadoc create failed:", JSON.stringify(doc).slice(0, 500));
          return j(headers, 502, { error: "pandadoc_failed", message: "PandaDoc refused to create the document. Nothing was sent." });
        }
        // record the doc ID the moment the create succeeds: the processing and
        // send-failed paths below used to exit without it, orphaning the
        // document from the bench (4703 Beach Dr Lower B, 2026-09-21)
        await asanaCall("PUT", `/tasks/${gid}`, { custom_fields: { [F_LEASE_DOC_ID]: doc.id } }).catch(() => {});
        // creation is async: wait for document.draft before sending
        let status = doc.status ?? "";
        for (let i = 0; i < 12 && status !== "document.draft"; i++) {
          await new Promise((r) => setTimeout(r, 1500));
          const g0 = await fetch(`${PD}/documents/${doc.id}`, { headers: pdH });
          status = ((await g0.json().catch(() => ({}))) as { status?: string }).status ?? status;
        }
        if (status !== "document.draft") {
          return j(headers, 200, { ok: false, error: "pandadoc_processing", docId: doc.id, message: "The document is still processing in PandaDoc; open it there to send." });
        }
        const snd = await fetch(`${PD}/documents/${doc.id}/send`, {
          method: "POST", headers: pdH,
          body: JSON.stringify({ subject: `Your Lease | ${ctx.address}`, message: "Please review, complete, and sign.", silent: false }),
        });
        if (!snd.ok) {
          const st = await snd.text().catch(() => "");
          console.error("pandadoc send failed:", st.slice(0, 300));
          return j(headers, 200, { ok: false, error: "pandadoc_send_failed", docId: doc.id, message: "Created but not sent; open PandaDoc to send it." });
        }
        // record everything on the application task
        const writes: Record<string, unknown> = {
          [F_LEASE_DOC_ID]: doc.id,
          [F_APPROVED_RENT]: Math.round(rent),
          [F_APPLICANT_NAMES]: namesList.join(", "),
          [F_APPLICANT_EMAILS]: emailsList.slice(0, namesList.length).join(", "),
        };
        if (n("termMonths") != null) writes[F_TERM_MONTHS] = Math.round(n("termMonths") as number);
        if (n("paymentPlanMonths") != null) writes[F_PAYMENT_PLAN] = Math.round(n("paymentPlanMonths") as number);
        if (s("pets")) writes[F_PETS_MOVEIN] = s("pets");
        await asanaCall("PUT", `/tasks/${gid}`, { custom_fields: { [F_LEASE_START]: { date: leaseStart } } }).catch(async () => {
          await asanaCall("PUT", `/tasks/${gid}`, { custom_fields: { [F_LEASE_START]: leaseStart } }).catch(() => {});
        });
        await asanaCall("PUT", `/tasks/${gid}`, { custom_fields: writes }).catch(() => {});
        await setStatus_(gid, [STATUS.approvedLeaseSent]);
        await asanaCall("POST", `/tasks/${gid}/stories`, {
          text: `LEASE SENT (Screen + Sign bench)\nPandaDoc: Lease | ${ctx.address}\nTemplate: Current Sagareus Lease (${namesList.length} resident)\nStart ${leaseStart} to ${leaseEnd} at ${money(rent)}/mo. Deposit ${money(deposit)}${lastMonth != null ? `, last month ${money(lastMonth)}` : ", no last month (Tacoma)"}.\nReviewer listings@sagareus.com signs first, then: ${namesList.map((nm, i) => `${nm} <${emailsList[i]}>`).join(", ")}\nDocument expires after 72 hours unsigned.`,
        }).catch(() => {});
        return j(headers, 200, { ok: true, docId: doc.id, template: `Current Sagareus Lease (${namesList.length} resident)` });
      } catch (e) {
        console.error("leaseSend failed:", e);
        return j(headers, 502, { error: "lease_send_failed", message: "Lease send failed. Check PandaDoc before retrying: the document may exist unsent." });
      }
    }

    // ---------- leaseSession: embedded Reviewer session for the workbench ----------
    if (action === "leaseSession") {
      if (!PD_KEY) return j(headers, 200, { ok: false, error: "pandadoc_unconfigured" });
      const taskUrl = String((body as { taskUrl?: unknown }).taskUrl ?? "");
      const gid = (taskUrl.match(/task\/(\d+)/) ?? taskUrl.match(/\/(\d{12,})/))?.[1];
      if (!gid) return j(headers, 400, { error: "bad_task_url" });
      try {
        const t = await asanaCall("GET", `/tasks/${gid}?opt_fields=custom_fields.gid,custom_fields.text_value,custom_fields.display_value`) as { custom_fields?: { gid?: string; text_value?: string | null; display_value?: string | null }[] };
        const docId = String((t.custom_fields ?? []).find((x) => x.gid === F_LEASE_DOC_ID)?.display_value ?? "").trim();
        if (!docId) return j(headers, 400, { error: "no_doc", message: "No lease document on this application yet." });
        const r0 = await fetch(`${PD}/documents/${docId}/session`, {
          method: "POST", headers: pdH,
          body: JSON.stringify({ recipient: "listings@sagareus.com", lifetime: 3600 }),
        });
        const j0 = await r0.json().catch(() => ({})) as { id?: string };
        if (!r0.ok || !j0.id) return j(headers, 502, { error: "pandadoc_failed", message: "Could not open the reviewer session; open the document in PandaDoc instead." });
        return j(headers, 200, { ok: true, docId, sessionUrl: `https://app.pandadoc.com/s/${j0.id}` });
      } catch (e) {
        console.error("leaseSession failed:", e);
        return j(headers, 502, { error: "pandadoc_failed", message: "Could not open the reviewer session." });
      }
    }

    // ---------- leaseStatus: live document + recipient state, 72-hour math ----------
    if (action === "leaseStatus") {
      if (!PD_KEY) return j(headers, 200, { ok: false, error: "pandadoc_unconfigured" });
      const taskUrl = String((body as { taskUrl?: unknown }).taskUrl ?? "");
      const gid = (taskUrl.match(/task\/(\d+)/) ?? taskUrl.match(/\/(\d{12,})/))?.[1];
      if (!gid) return j(headers, 400, { error: "bad_task_url" });
      try {
        const t = await asanaCall("GET", `/tasks/${gid}?opt_fields=custom_fields.gid,custom_fields.display_value`) as { custom_fields?: { gid?: string; display_value?: string | null }[] };
        const docId = String((t.custom_fields ?? []).find((x) => x.gid === F_LEASE_DOC_ID)?.display_value ?? "").trim();
        if (!docId) return j(headers, 200, { ok: true, docId: "", status: "" });
        const r0 = await fetch(`${PD}/documents/${docId}/details`, { headers: pdH });
        const d0 = await r0.json().catch(() => ({})) as { status?: string; date_sent?: string; date_completed?: string; recipients?: { email?: string; role?: string; has_completed?: boolean }[] };
        if (!r0.ok) return j(headers, 200, { ok: true, docId, status: "unknown" });
        const sentAt = d0.date_sent ?? "";
        const hours = sentAt ? Math.floor((Date.now() - Date.parse(sentAt)) / 3600000) : null;
        return j(headers, 200, {
          ok: true, docId, status: d0.status ?? "", sentAt,
          completedAt: d0.date_completed ?? "",
          hoursSinceSent: hours, stale: hours != null && hours >= 72 && d0.status !== "document.completed",
          recipients: (d0.recipients ?? []).map((r) => ({ email: r.email ?? "", role: r.role ?? "", done: !!r.has_completed })),
        });
      } catch (e) {
        console.error("leaseStatus failed:", e);
        return j(headers, 502, { error: "pandadoc_failed", message: "Could not read the lease status." });
      }
    }

    // ---------- leaseCancel: void + record the reason ----------
    // The reason lands in the Lease Cancellation field (reportable) and the
    // application goes to On Hold; the PandaDoc void is best-effort since the
    // 72-hour expiration ends the document either way.
    if (action === "leaseCancel") {
      const taskUrl = String((body as { taskUrl?: unknown }).taskUrl ?? "");
      const gid = (taskUrl.match(/task\/(\d+)/) ?? taskUrl.match(/\/(\d{12,})/))?.[1];
      if (!gid) return j(headers, 400, { error: "bad_task_url" });
      const reason = String((body as { reason?: unknown }).reason ?? "");
      const opt = CANCEL_OPTS[reason];
      if (!opt) return j(headers, 400, { error: "bad_reason", message: "Pick a cancellation reason first." });
      try {
        const t = await asanaCall("GET", `/tasks/${gid}?opt_fields=custom_fields.gid,custom_fields.display_value`) as { custom_fields?: { gid?: string; display_value?: string | null }[] };
        const docId = String((t.custom_fields ?? []).find((x) => x.gid === F_LEASE_DOC_ID)?.display_value ?? "").trim();
        let voided = false;
        if (docId && PD_KEY) {
          try {
            const r0 = await fetch(`${PD}/documents/${docId}/status`, { method: "POST", headers: pdH, body: JSON.stringify({ status: 2 }) });
            voided = r0.ok;
          } catch { /* expiration handles it */ }
        }
        await asanaCall("PUT", `/tasks/${gid}`, { custom_fields: { [F_LEASE_CANCEL]: opt.gid } }).catch(() => {});
        await setStatus_(gid, [STATUS.onHold]);
        await asanaCall("POST", `/tasks/${gid}/stories`, { text: `LEASE CANCELED (Screen + Sign bench)\nReason: ${opt.label}\n${voided ? "PandaDoc document voided." : "PandaDoc void not confirmed; the 72-hour expiration ends the document."}` }).catch(() => {});
        return j(headers, 200, { ok: true, voided, reason: opt.label });
      } catch (e) {
        console.error("leaseCancel failed:", e);
        return j(headers, 502, { error: "cancel_failed", message: "Could not record the cancellation." });
      }
    }

    // ---------- mgrDocs: the application's attachments for manager review ----------
    if (action === "mgrDocs") {
      const taskUrl = String((body as { taskUrl?: unknown }).taskUrl ?? "");
      const gid = (taskUrl.match(/task\/(\d+)/) ?? taskUrl.match(/\/(\d{12,})/))?.[1];
      if (!gid) return j(headers, 400, { error: "bad_task_url" });
      try {
        const atts = (await asanaCall("GET", `/tasks/${gid}/attachments?opt_fields=name,view_url,permanent_url,download_url,created_at`)) as Array<{ gid?: string; name?: string; view_url?: string; permanent_url?: string; download_url?: string; created_at?: string }>;
        const kindOf = (n: string) => /\.pdf$/i.test(n) ? "pdf" : /\.(png|jpe?g|gif|webp|heic)$/i.test(n) ? "image" : "other";
        return j(headers, 200, {
          ok: true,
          // download_url is short-lived (minutes): the overlay fetches this fresh
          // on open and re-fetches if a preview dies
          docs: (atts ?? []).map((a) => ({
            gid: a.gid ?? "",
            name: a.name ?? "attachment",
            url: a.view_url || a.permanent_url || "",
            kind: kindOf(a.name ?? ""),
            date: (a.created_at ?? "").slice(0, 10),
          })).filter((a) => a.gid),
        });
      } catch (e) {
        console.error("mgrDocs failed:", e);
        return j(headers, 502, { error: "asana_failed", message: "Could not load the documents." });
      }
    }

    // ---------- docFile: stream an attachment's bytes for the overlay preview ----------
    // Asana's app URLs refuse iframes and the signed download URLs are short
    // lived, so the overlay previews from a blob fetched through here.
    if (action === "docFile") {
      const attGid = String((body as { attGid?: unknown }).attGid ?? "").replace(/\D/g, "");
      if (!attGid) return j(headers, 400, { error: "bad_attachment" });
      try {
        const a = await asanaCall("GET", `/attachments/${attGid}?opt_fields=name,download_url`) as { name?: string; download_url?: string };
        if (!a.download_url) return j(headers, 404, { error: "no_download", message: "No downloadable file (external link?)." });
        const fr = await fetch(a.download_url);
        if (!fr.ok) return j(headers, 502, { error: "fetch_failed", message: "The file store did not answer." });
        const bytes = new Uint8Array(await fr.arrayBuffer());
        if (bytes.byteLength > 15 * 1024 * 1024) return j(headers, 413, { error: "too_big", message: "Over 15 MB; open it in Asana instead." });
        const n = (a.name ?? "").toLowerCase();
        const ct = n.endsWith(".pdf") ? "application/pdf"
          : /\.jpe?g$/.test(n) ? "image/jpeg"
          : n.endsWith(".png") ? "image/png"
          : n.endsWith(".gif") ? "image/gif"
          : n.endsWith(".webp") ? "image/webp"
          : (fr.headers.get("content-type") ?? "application/octet-stream");
        return new Response(bytes, { status: 200, headers: { ...headers, "Content-Type": ct, "Content-Disposition": "inline" } });
      } catch (e) {
        console.error("docFile failed:", e);
        return j(headers, 502, { error: "asana_failed", message: "Could not fetch the file." });
      }
    }

    // ---------- docReview: per-document verdict from the review overlay ----------
    if (action === "docReview") {
      const taskUrl = String((body as { taskUrl?: unknown }).taskUrl ?? "");
      const gid = (taskUrl.match(/task\/(\d+)/) ?? taskUrl.match(/\/(\d{12,})/))?.[1];
      if (!gid) return j(headers, 400, { error: "bad_task_url" });
      const doc = String((body as { doc?: unknown }).doc ?? "").slice(0, 200);
      const verdict = String((body as { verdict?: unknown }).verdict ?? "");
      const comment = String((body as { comment?: unknown }).comment ?? "").trim().slice(0, 2000);
      const head = verdict === "accepted" ? "REVIEWED + ACCEPTED"
        : verdict === "insufficient" ? "INSUFFICIENT"
        : verdict === "comment" ? "COMMENT" : "";
      if (!doc || !head) return j(headers, 400, { error: "bad_verdict" });
      if (verdict === "comment" && !comment) return j(headers, 400, { error: "bad_verdict", message: "Write the comment first." });
      try {
        await asanaCall("POST", `/tasks/${gid}/stories`, { text: `DOC REVIEW | ${doc}: ${head}${comment ? `\n${comment}` : ""}\n(Screen + Sign bench, Manager Review)` });
        return j(headers, 200, { ok: true });
      } catch (e) {
        console.error("docReview failed:", e);
        return j(headers, 502, { error: "asana_failed", message: "Could not save the verdict." });
      }
    }

    // ---------- mgrDocsConfirm: stamp the manager's document review ----------
    if (action === "mgrDocsConfirm") {
      const taskUrl = String((body as { taskUrl?: unknown }).taskUrl ?? "");
      const gid = (taskUrl.match(/task\/(\d+)/) ?? taskUrl.match(/\/(\d{12,})/))?.[1];
      if (!gid) return j(headers, 400, { error: "bad_task_url" });
      try {
        const todayC = new Date(Date.now() - 7 * 3600 * 1000).toISOString().slice(0, 10);
        await asanaCall("POST", `/tasks/${gid}/stories`, { text: `MANAGER DOCUMENT REVIEW ${todayC}\nProof of income, credit reports, and rental history reviewed against the source documents (Screen + Sign bench).` });
        return j(headers, 200, { ok: true });
      } catch (e) {
        console.error("mgrDocsConfirm failed:", e);
        return j(headers, 502, { error: "asana_failed", message: "Could not post the confirmation." });
      }
    }

    // ---------- setAppStatus: the bench's editable Status pill ----------
    // Writes the Status dropdown (+ title prefix via setStatus_); Brittany's
    // Asana rules then move the task to the matching section, and the queues
    // (which read sections) follow. One field drives the board.
    // ---------- lastComments: the task's last 3 comments for the peek bubble ----------
    if (action === "lastComments") {
      const taskUrl = String((body as { taskUrl?: unknown }).taskUrl ?? "");
      const gid = (taskUrl.match(/task\/(\d+)/) ?? taskUrl.match(/\/(\d{12,})/))?.[1];
      if (!gid) return j(headers, 400, { error: "bad_task_url" });
      try {
        const all: Array<{ type?: string; text?: string; created_at?: string; created_by?: { name?: string } | null }> = [];
        let off = "";
        for (let pg = 0; pg < 5; pg++) {
          const r0 = await fetch(`${ASANA}/tasks/${gid}/stories?limit=100&opt_fields=type,text,created_at,created_by.name${off ? `&offset=${encodeURIComponent(off)}` : ""}`,
            { headers: { Authorization: `Bearer ${ASANA_PAT}` } });
          const j0 = await r0.json().catch(() => ({})) as { data?: typeof all; next_page?: { offset?: string } | null };
          if (!r0.ok) break;
          all.push(...(j0.data ?? []));
          off = j0.next_page?.offset ?? "";
          if (!off) break;
        }
        const comments = all.filter((x) => x.type === "comment").slice(-3).map((x) => ({
          by: String(x.created_by?.name ?? ""),
          at: String(x.created_at ?? ""),
          text: String(x.text ?? "").slice(0, 240),
        }));
        return j(headers, 200, { ok: true, comments });
      } catch { return j(headers, 502, { error: "asana_failed", message: "Could not load the comments." }); }
    }

    if (action === "setAppStatus") {
      const taskUrl = String((body as { taskUrl?: unknown }).taskUrl ?? "");
      const gid = (taskUrl.match(/task\/(\d+)/) ?? taskUrl.match(/\/(\d{12,})/))?.[1];
      if (!gid) return j(headers, 400, { error: "bad_task_url" });
      const want = String((body as { statusGid?: unknown }).statusGid ?? "");
      const name2 = STATUS2_NAME[want] ?? "";
      const upd = OLD2_TO_TRIPLE[want];
      if (!name2 || !upd) return j(headers, 400, { error: "bad_status", message: "Pick a status first." });
      try {
        // Status split (2026-09-24): old dropdown gids from the bench translate
        // onto the triple; applyTriple handles prefix + section filing.
        await applyTriple(gid, upd);
        // Cancelled = applicant withdrew -> task closed (team 2026-09-21);
        // Leasing Complete stays OPEN in Move In Pending until physical move in
        if (want === ST2_CANCELLED) {
          await asanaCall("PUT", `/tasks/${gid}`, { completed: true }).catch(() => {});
        }
        signqCache = null;
        return j(headers, 200, { ok: true, name: name2 });
      } catch (e) {
        console.error("setAppStatus failed:", e);
        return j(headers, 502, { error: "status_failed", message: "Could not save the status." });
      }
    }

    // ---------- setTriple: the bench's Stage / Decision / Holds editor ----------
    // stage and decision update when sent; holds REPLACE the set when the key
    // is present (an empty array clears every hold). applyTriple files the
    // section and rewrites the title prefix.
    if (action === "setTriple") {
      const taskUrl = String((body as { taskUrl?: unknown }).taskUrl ?? "");
      const gid = (taskUrl.match(/task\/(\d+)/) ?? taskUrl.match(/\/(\d{12,})/))?.[1];
      if (!gid) return j(headers, 400, { error: "bad_task_url" });
      const stage = String((body as { stage?: unknown }).stage ?? "");
      const decision = String((body as { decision?: unknown }).decision ?? "");
      const holdsIn = (body as { holds?: unknown }).holds;
      const holds = Array.isArray(holdsIn) ? holdsIn.map(String) : undefined;
      if (stage && !STAGE_OPT[stage]) return j(headers, 400, { error: "bad_stage", message: "Unknown stage." });
      if (decision && !DEC_OPT[decision]) return j(headers, 400, { error: "bad_decision", message: "Unknown decision." });
      if (holds && holds.some((h) => !HOLD_OPT[h])) return j(headers, 400, { error: "bad_hold", message: "Unknown hold." });
      const upd: TripleUpd = {};
      if (stage) upd.stage = stage;
      if (decision) upd.decision = decision;
      if (holds) upd.holds = holds;
      if (!Object.keys(upd).length) return j(headers, 400, { error: "bad_status", message: "Nothing to change." });
      try {
        const res = await applyTriple(gid, upd);
        // Cancelled = applicant withdrew -> task closed (team 2026-09-21)
        if (stage === "Cancelled") await asanaCall("PUT", `/tasks/${gid}`, { completed: true }).catch(() => {});
        signqCache = null;
        return j(headers, 200, { ok: true, ...res });
      } catch (e) {
        console.error("setTriple failed:", e);
        return j(headers, 502, { error: "status_failed", message: "Could not save the status." });
      }
    }

    // ---------- mgrCriteria: everything the review criteria card needs ----------
    // App-task figures (median credit, qualifying income, household size, the
    // pass/fail verdicts) plus the PROPERTY's criteria read live from Listing
    // Settings (Min Credit / Min Income; tiers are sunset) via the application's
    // parent LU -> Unit ID -> LS exact search. Everything best-effort: a missing
    // link renders a partial card, never an error.
    if (action === "mgrCriteria") {
      const taskUrl = String((body as { taskUrl?: unknown }).taskUrl ?? "");
      const gid = (taskUrl.match(/task\/(\d+)/) ?? taskUrl.match(/\/(\d{12,})/))?.[1];
      if (!gid) return j(headers, 400, { error: "bad_task_url" });
      try {
        const t = await asanaCall("GET", `/tasks/${gid}?opt_fields=name,parent.gid,parent.name,custom_fields.gid,custom_fields.number_value,custom_fields.enum_value.name`) as {
          name?: string; parent?: { gid?: string; name?: string } | null;
          custom_fields?: { gid?: string; number_value?: number | null; enum_value?: { name?: string } | null }[];
        };
        const cf = t.custom_fields ?? [];
        const num = (fid: string) => { const f = cf.find((x) => x.gid === fid); return f?.number_value ?? null; };
        const en = (fid: string) => cf.find((x) => x.gid === fid)?.enum_value?.name ?? "";
        const t2 = await asanaCall("GET", `/tasks/${gid}?opt_fields=custom_fields.gid,custom_fields.display_value`) as { custom_fields?: { gid?: string; display_value?: string | null }[] };
        const desiredStart = String((t2.custom_fields ?? []).find((x) => x.gid === F_DESIRED_START)?.display_value ?? "").slice(0, 10);
        const out = {
          ok: true,
          desiredStart,
          medianCredit: num(F_MEDIAN_CREDIT),
          qualIncome: num(F_QUAL_INCOME),
          passFail: { income: en(PF_FIELDS.income.field), credit: en(PF_FIELDS.credit.field), rentalhx: en(PF_FIELDS.rentalhx.field) },
          minCredit: "", minIncome: "", listedRent: null as number | null, lsUrl: "", address: "",
        };
        const luGid = t.parent?.gid ?? "";
        if (luGid) {
          out.address = String(t.parent?.name ?? "").replace(/^LU \|\s*/i, "").trim();
          try {
            const lu = await asanaCall("GET", `/tasks/${luGid}?opt_fields=custom_fields.name,custom_fields.display_value`) as { custom_fields?: { name?: string; display_value?: string | null }[] };
            const uid = String((lu.custom_fields ?? []).find((f) => /unit id/i.test(String(f.name ?? "")))?.display_value ?? "").replace(/\D/g, "");
            if (uid) {
              const hits = (await asanaCall("GET", `/workspaces/${WORKSPACE}/tasks/search?projects.any=${LS_PROJECT_ID}&custom_fields.${UNIT_ID_FIELD}.value=${uid}&opt_fields=name,permalink_url,custom_fields.gid,custom_fields.display_value,custom_fields.number_value`)) as { gid?: string; permalink_url?: string; custom_fields?: { gid?: string; display_value?: string | null; number_value?: number | null }[] }[];
              const ls = hits?.[0];
              if (ls) {
                const lcf = ls.custom_fields ?? [];
                const lstr = (fid: string) => String(lcf.find((x) => x.gid === fid)?.display_value ?? "").trim();
                const lnum = (fid: string) => { const f = lcf.find((x) => x.gid === fid); return f?.number_value ?? null; };
                out.minCredit = kvGet(lstr(LS_SCREEN_CRIT), "Credit") || lstr(LS_MIN_CREDIT);
                out.minIncome = kvGet(lstr(LS_SCREEN_CRIT), "Income") || lstr(LS_MIN_INCOME);
                out.listedRent = lnum(LS_CURRENT_RENT) ?? lnum(LS_STARTING_RENT);
                out.lsUrl = ls.permalink_url ?? "";
              }
            }
          } catch { /* criteria best-effort */ }
        }
        return j(headers, 200, out);
      } catch (e) {
        console.error("mgrCriteria failed:", e);
        return j(headers, 502, { error: "asana_failed", message: "Could not load the criteria." });
      }
    }

    // ---------- condQueue: the Conditionally Approved holding list ----------
    // Open tasks in Leasing | Pending Applications whose Status carries any
    // conditional stage. The leasing assistants chase outstanding documents
    // from this list; the manager re-decides a row when the condition clears.
    if (action === "condQueue") {
      try {
        const rows: { gid: string; name: string; url: string; due: string; status: { name: string; color: string }[] }[] = [];
        let offset = "";
        for (let page = 0; page < 4; page++) {
          const res = await fetch(
            `${ASANA}/projects/${PENDING_APPS_PROJECT}/tasks?limit=100&opt_fields=name,permalink_url,due_on,completed,custom_fields.gid,custom_fields.enum_value.gid,custom_fields.enum_value.name,custom_fields.enum_value.color,custom_fields.multi_enum_values.name,custom_fields.multi_enum_values.color${offset ? `&offset=${encodeURIComponent(offset)}` : ""}`,
            { headers: { Authorization: `Bearer ${ASANA_PAT}` } },
          );
          const json = await res.json().catch(() => ({})) as { data?: { gid?: string; name?: string; permalink_url?: string; due_on?: string; completed?: boolean; custom_fields?: { gid?: string; enum_value?: { gid?: string; name?: string; color?: string } | null }[] }[]; next_page?: { offset?: string } | null };
          if (!res.ok) throw new Error(`asana condQueue page ${page}`);
          for (const t of json.data ?? []) {
            if (t.completed) continue;
            const ev = (t.custom_fields ?? []).find((c) => c.gid === STATUS2_FIELD)?.enum_value;
            const tri = tripleNames(t.custom_fields as never);
            const late = ["Lease Sent", "Lease Signed", "Pending MI", "Cancelled"].includes(tri.stage);
            const oldCond = !!ev && COND_STATUSES2.includes(ev.gid ?? "");
            // condition holds always hold the file; a doc-chase hold only
            // counts once the file already reached Mgr Review (2026-09-25)
            const newCond = !late && (tri.decision === "Conditionally Approved"
              || tri.holds.some((h) => CONDITION_HOLDS.includes(h))
              || (tri.holds.length > 0 && tri.stage === "Mgr Review"));
            if (!oldCond && !newCond) continue;
            const chips = tripleChips(t.custom_fields as never);
            rows.push({
              gid: t.gid ?? "", name: t.name ?? "", url: t.permalink_url ?? "", due: t.due_on ?? "",
              status: chips.length ? chips : [{ name: ev?.name ?? "", color: ev?.color ?? "" }],
            });
          }
          offset = json.next_page?.offset ?? "";
          if (!offset) break;
        }
        return j(headers, 200, { queue: rows });
      } catch (e) {
        console.error("condQueue failed:", e);
        return j(headers, 502, { error: "asana_failed", message: "Could not load the holding list." });
      }
    }

    // ---------- decide: manager decision -> comment with email draft, assign Mary, due today ----------
    if (action === "decide") {
      const taskUrl = String((body as { taskUrl?: unknown }).taskUrl ?? "");
      const gid = (taskUrl.match(/task\/(\d+)/) ?? taskUrl.match(/\/(\d{12,})/))?.[1];
      if (!gid) return j(headers, 400, { error: "bad_task_url" });
      const decision = String((body as { decision?: unknown }).decision ?? "") as Decision;
      const option = String((body as { option?: unknown }).option ?? "");
      const optionsList = (Array.isArray((body as { options?: unknown }).options) ? (body as { options: unknown[] }).options : []).map(String);
      const text = String((body as { text?: unknown }).text ?? "").slice(0, 2000);
      const mgrComment = String((body as { comment?: unknown }).comment ?? "").slice(0, 3000);
      // v2 Conditionally Approved (Brittany 2026-09-20): a fourth decision that
      // reuses the EXISTING templates (sec8 -> approved/section8, cosigner and
      // docs -> insufficient/*) and parks the application on the holding list
      // via its Status stage. Automated conditional flows wait for v3.
      const isConditional = String(decision) === "conditional";
      // All six holds are conditional options (Brittany 2026-09-24): each maps
      // to the existing email template that fits, and the named Hold below.
      const CONDITIONAL_MAP: Record<string, { decision: Decision; option: string; status: string }> = {
        sec8: { decision: "approved" as Decision, option: "section8", status: STATUS.condSec8 },
        owner_exception: { decision: "approved" as Decision, option: "owner_exception", status: STATUS.condOwnerException },
        cosigner: { decision: "insufficient" as Decision, option: "cosigner", status: STATUS.pendingCosigner },
        docs: { decision: "insufficient" as Decision, option: "docs", status: STATUS.pendingAddlDocs },
        balance: { decision: "insufficient" as Decision, option: "landlord_balance", status: STATUS.pendingLandlordBalance },
      };
      if (isConditional && !CONDITIONAL_MAP[option]) {
        return j(headers, 400, { error: "bad_option", message: "Pick a conditional option first. Nothing was changed." });
      }
      const effDecision: Decision = isConditional ? CONDITIONAL_MAP[option].decision : decision;
      if (!DECISION_OPTIONS[effDecision]) return j(headers, 400, { error: "bad_decision" });
      if (!isConditional && decision === "insufficient" && !optionsList.length && !option) return j(headers, 400, { error: "bad_option", message: "Check at least one item." });
      // Validate the option BEFORE the try: buildDecision throws bad_option, and
      // the old catch dressed that up as "Asana did not accept the update" even
      // though nothing had been written (Brittany 2026-08-30: reads as the tool
      // randomly breaking). Multi-select insufficient may send only options[].
      const effOption = (isConditional ? CONDITIONAL_MAP[option].option : option) || (effDecision === "insufficient" ? (optionsList[0] ?? "") : "");
      if (!DECISION_OPTIONS[effDecision].some((o) => o.key === effOption)) {
        return j(headers, 400, { error: "bad_option", message: "Pick a decision option first. Nothing was changed." });
      }

      const previewOnly = (body as { previewOnly?: unknown }).previewOnly === true;
      let wrote = false;
      try {
        const task = await asanaCall("GET", `/tasks/${gid}?opt_fields=name,permalink_url,notes,parent.gid,custom_fields.name,custom_fields.number_value`) as { name?: string; permalink_url?: string; notes?: string; parent?: { gid?: string } | null; custom_fields?: { name?: string; number_value?: number | null }[] };
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

        // co-signer emails name the actual shortfall from the Pass/Fail card
        // (team 2026-09-25): credit fail, income fail, or both
        const pfRaw = ((body as { passFail?: Record<string, unknown> }).passFail ?? {}) as Record<string, unknown>;
        const incomeFail = String(pfRaw.income ?? "").toLowerCase() === "fail";
        const creditFail = String(pfRaw.credit ?? "").toLowerCase() === "fail";
        const cosignerNeed = incomeFail && creditFail ? "income and credit" : creditFail ? "credit" : "income";
        // co-signer template extras (Brittany 2026-09-25): the stat bullets
        // from the application task and the listing link from the parent LU
        // (the co-signer applies through the property's listing page)
        const numOf = (re: RegExp) => (task.custom_fields ?? []).find((c) => re.test(String(c.name ?? "")))?.number_value ?? null;
        const medianCredit = numOf(/median credit/i);
        const qualifyingIncome = numOf(/qualifying monthly income/i);
        let listingUrl = "";
        const wantsCosigner = option === "cosigner" || effOption === "cosigner" || optionsList.includes("cosigner");
        if (wantsCosigner && task.parent?.gid) {
          try {
            const lu = await asanaCall("GET", `/tasks/${task.parent.gid}?opt_fields=custom_fields.name,custom_fields.display_value`) as { custom_fields?: { name?: string; display_value?: string | null }[] };
            listingUrl = String((lu.custom_fields ?? []).find((f) => /sagareus listing/i.test(String(f.name ?? "")))?.display_value ?? "").trim();
          } catch { /* the template shows an editable placeholder instead */ }
        }
        const built = buildDecision({ decision: effDecision, option: effOption, options: isConditional ? [] : optionsList, text, comment: mgrComment, applicantFirst, address, cosignerNeed, medianCredit, qualifyingIncome, listingUrl });
        const headlineOut = isConditional ? `Conditionally Approved - ${built.headline}` : built.headline;

        // Recipients: Buildium group members via the Applicant ID field,
        // falling back to emails in the task description.
        let toEmails: string[] = [];
        const refId = (task.custom_fields ?? []).find((c) => /applicant id/i.test(c.name ?? ""))?.number_value;
        if (refId != null) {
          try {
            const grp = await bGet(`/applicants/groups/${refId}`) as { Applicants?: { Email?: string }[] };
            toEmails = (grp.Applicants ?? []).map((m) => m.Email ?? "").filter(Boolean);
          } catch {
            try {
              const rec = await bGet(`/applicants/${refId}`) as Applicant;
              if (rec.Email) toEmails = [rec.Email];
            } catch { /* fall through */ }
          }
        }
        if (!toEmails.length) {
          toEmails = [...new Set((task.notes ?? "").match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? [])].slice(0, 6);
        }
        // the bench preview is editable (team 2026-09-25): edited subject/body
        // ride the final call and are what gets filed and sent
        const subjOv = String((body as { emailSubject?: unknown }).emailSubject ?? "").trim();
        const bodyOv = String((body as { emailBody?: unknown }).emailBody ?? "").trim();
        const emailOut = { subject: subjOv || built.email.subject, body: bodyOv || built.email.body, to: toEmails, cc: "leasing@sagareus.com" };

        if (previewOnly) {
          return j(headers, 200, { preview: true, headline: headlineOut, email: emailOut });
        }

        const MARY = { gid: "1203402971273034", name: "Mary Galvez" };
        const dueOn = new Date(Date.now() - 7 * 3600 * 1000).toISOString().slice(0, 10);
        // The bench declares how the email leaves (Brittany 2026-09-24): with
        // Gmail direct send wired up the record says SENT; the draft
        // instruction stays for declines (vendor block is manual) and for
        // sessions without a Gmail sender. If a declared direct send then
        // fails, the bench posts a mailNote correction under this comment.
        const directSend = String((body as { emailMode?: unknown }).emailMode ?? "") === "direct";
        const emailLine = directSend
          ? `Email sent to ${toEmails.join(", ")} from leasing@sagareus.com (cc leasing@) via the workbench.`
          : `Send the email below from leasing@sagareus.com (draft only; review before sending).`;
        const comment = `MANAGER DECISION: ${headlineOut}
Assigned to ${MARY.name}, due ${dueOn}. ${emailLine}

${directSend ? "EMAIL" : "EMAIL DRAFT"}
Subject: ${emailOut.subject}

${emailOut.body}`;
        wrote = true;
        await asanaCall("POST", `/tasks/${gid}/stories`, { text: comment });
        await asanaCall("PUT", `/tasks/${gid}`, { assignee: MARY.gid, due_on: dueOn });
        // Move to the matching stage section (addProject moves within the
        // project when already homed, and homes the task when not).
        const destSection = effDecision === "declined" ? SEC_COMPLETE
          : (isConditional || effDecision === "insufficient" || effOption === "section8") ? SEC_PENDING_DOCS
          : SEC_APPROVED;
        let moved = true;
        try {
          await asanaCall("POST", `/tasks/${gid}/addProject`, { project: PENDING_APPS_PROJECT, section: destSection });
        } catch { moved = false; }
        // v2 (plan 2026-09-20): Status is written on EVERY decision, and pass/fail
        // verdicts land on their fields when the manager set them on the card.
        const pfIn = ((body as { passFail?: Record<string, unknown> }).passFail ?? {}) as Record<string, unknown>;
        const pfWrites: Record<string, string> = {};
        for (const [k, cfg] of Object.entries(PF_FIELDS)) {
          const v = String(pfIn[k] ?? "").toLowerCase();
          if (v === "pass") pfWrites[cfg.field] = cfg.pass;
          else if (v === "fail") pfWrites[cfg.field] = cfg.fail;
        }
        if (Object.keys(pfWrites).length) await asanaCall("PUT", `/tasks/${gid}`, { custom_fields: pfWrites }).catch(() => {});
        // Status split (2026-09-24): decisions write Decision + Holds directly.
        // Conditionally Approved always carries at least one named Hold
        // (Brittany's rule); a plain docs/co-signer/balance chase stays
        // Decision = Pending and only adds the Hold.
        const CONDITIONAL_HOLD: Record<string, string> = {
          sec8: "Sec 8", owner_exception: "Owner Policy Exception", cosigner: "Co-Signer",
          docs: "Income Docs", balance: "Balance Owed",
        };
        const triUpd: TripleUpd = isConditional
          ? { decision: "Conditionally Approved", addHolds: [CONDITIONAL_HOLD[option] ?? "Income Docs"] }
          : effDecision === "declined" ? { decision: "Declined" }
          : effDecision === "insufficient" ? (effOption === "cosigner" ? { addHolds: ["Co-Signer"] }
            : effOption === "landlord_balance" ? { addHolds: ["Balance Owed"] }
            : effOption === "pet_policy" ? { addHolds: ["Owner Policy Exception"] }
            : { addHolds: ["Income Docs"] })
          : effOption === "section8" ? { decision: "Conditionally Approved", addHolds: ["Sec 8"] }
          : effOption === "owner_exception" ? { decision: "Conditionally Approved", addHolds: ["Owner Policy Exception"] }
          : { decision: "Approved" };
        await applyTriple(gid, triUpd).catch(() => {});
        const destName = destSection === SEC_COMPLETE ? "Complete" : destSection === SEC_PENDING_DOCS ? "Pending Docs / Co-Signer / Sec 8" : "Approved";
        return j(headers, 200, {
          decided: true, headline: headlineOut,
          assignee: MARY.name, due: dueOn,
          moved, section: destName,
          email: emailOut,
          task: { name: task.name ?? "", url: task.permalink_url ?? taskUrl },
        });
      } catch (e) {
        console.error("decide failed:", e);
        // Honest phase reporting: before the first Asana write, nothing changed.
        if (!wrote) return j(headers, 502, { error: "decide_prep_failed", message: "Could not read the application task. Nothing was changed; check the task link and try again." });
        return j(headers, 502, { error: "decide_failed", message: "Asana did not accept the update. Check the task before retrying; the comment may or may not have posted." });
      }
    }

    // ---------- signQueue: approved applications awaiting lease signature ----------
    // Rows for the Screen + Sign bench's Sign step: every open task in the
    // Pending Applications "Approved" section, joined to its LU/TP/PreLease task
    // by address (openLuTasks + matchLu, typeahead fallback) with the LU's
    // current Lease Signed / Move in Date values so already-signed units are
    // visible. Buildium link is best-effort (screening credential may lack the
    // rentals scope).
    if (action === "signQueue") {
      if (signqCache && Date.now() - signqCache.at < 2 * 60 * 1000) return j(headers, 200, signqCache.data);
      // Approved + Lease Sent + Move In Pending sections: Brittany's Asana rules
      // (2026-09-20) mirror the Status dropdown into sections, so sent leases
      // move out of Approved and the bench must keep seeing them.
      const SIGN_SECTIONS = [SEC_APPROVED, "1217174552914951", "1217174739448130"];
      const seenSign = new Set<string>();
      const secTasks: Array<{ gid: string; name: string; permalink_url?: string; completed?: boolean; modified_at?: string }> = [];
      for (const sec of SIGN_SECTIONS) {
        const st0 = (await asanaCall("GET", `/sections/${sec}/tasks?limit=100&opt_fields=name,permalink_url,completed,modified_at,custom_fields.gid,custom_fields.enum_value.name,custom_fields.enum_value.color,custom_fields.multi_enum_values.name,custom_fields.multi_enum_values.color`).catch(() => [])) as Array<{ gid: string; name: string; permalink_url?: string; completed?: boolean; modified_at?: string; custom_fields?: { gid?: string; enum_value?: { name?: string; color?: string } | null }[] }>;
        for (const t of st0 ?? []) if (t.gid && !seenSign.has(t.gid)) { seenSign.add(t.gid); secTasks.push(t); }
      }
      // Status = Approved is the source of truth: rows whose section move has
      // not landed yet (manual pill sets, rule lag) still belong in step 5
      // (team 2026-09-21). Project scan, deduped against the section pull.
      try {
        let offA = "";
        for (let pg = 0; pg < 4; pg++) {
          const rA = await fetch(`${ASANA}/projects/${PENDING_APPS_PROJECT}/tasks?limit=100&opt_fields=name,permalink_url,completed,modified_at,custom_fields.gid,custom_fields.enum_value.gid,custom_fields.enum_value.name,custom_fields.enum_value.color,custom_fields.multi_enum_values.name,custom_fields.multi_enum_values.color${offA ? `&offset=${encodeURIComponent(offA)}` : ""}`,
            { headers: { "Authorization": `Bearer ${ASANA_PAT}` } });
          const jA = await rA.json().catch(() => ({})) as { data?: Array<{ gid: string; name: string; permalink_url?: string; completed?: boolean; modified_at?: string; custom_fields?: { gid?: string; enum_value?: { gid?: string; name?: string; color?: string } | null }[] }>; next_page?: { offset?: string } | null };
          for (const t of jA.data ?? []) {
            if (t.completed || !t.gid || seenSign.has(t.gid)) continue;
            const evA = (t.custom_fields ?? []).find((c) => c.gid === STATUS2_FIELD)?.enum_value;
            const triA = tripleNames(t.custom_fields as never);
            const preLease = !["Lease Sent", "Lease Signed", "Pending MI", "Cancelled"].includes(triA.stage);
            if (evA?.name !== "Approved" && !(triA.decision === "Approved" && preLease)) continue;
            seenSign.add(t.gid);
            secTasks.push(t);
          }
          offA = jA.next_page?.offset ?? "";
          if (!offA) break;
        }
      } catch { /* the section pull stands alone */ }
      const open = secTasks.filter((t) => {
        if (t.completed) return false;
        const evC = ((t as { custom_fields?: { gid?: string; enum_value?: { name?: string } | null }[] }).custom_fields ?? []).find((c) => c.gid === STATUS2_FIELD)?.enum_value;
        const triC = tripleNames((t as { custom_fields?: never[] }).custom_fields);
        return evC?.name !== "Cancelled" && triC.stage !== "Cancelled"; // off the workbench (team 2026-09-21)
      }).slice(0, 60);
      const luTasks = await openLuTasks().catch(() => [] as Array<{ gid: string; name: string; address: string }>);
      const rows: Array<Record<string, unknown>> = [];
      const work = open.map((t) => async () => {
        // names/address per the application task title conventions (see decide)
        const raw2 = (t.name ?? "").replace(/^Pending Mgr Review \|\s*/i, "");
        let names = "", address = "";
        const slash2 = raw2.match(/Application \/ (.+?) \/ (.+)$/i);
        const angle2 = raw2.match(/<([^>]+)>?/);
        if (slash2) { names = slash2[1]; address = slash2[2]; }
        else if (angle2) {
          const parts2 = angle2[1].split("//");
          address = (parts2[0] ?? "").split(" - ")[0].trim();
          names = (parts2[1] ?? "").trim();
        }
        let lu: { gid: string; name: string; address?: string } | null = address ? (matchLu(luTasks, address).hit ?? null) : null;
        // open LU first; a cycle completed at signing still matches (2026-09-21)
        if (!lu && address) lu = matchLu(await doneLuTasks().catch(() => []), address).hit ?? null;
        if (!lu && address) lu = await findLuByTypeahead(address).catch(() => null);
        let leaseSigned = "", moveInDate = "", unitId = "", buildiumUrl = "", sagareusUrl = "";
        if (lu) {
          try {
            const luFull = await asanaCall("GET", `/tasks/${lu.gid}?opt_fields=name,custom_fields.gid,custom_fields.name,custom_fields.display_value`) as { custom_fields?: Array<{ gid: string; name?: string; display_value?: string | null }> };
            const cf = luFull.custom_fields ?? [];
            const get2 = (re: RegExp) => String(cf.find((f) => re.test(String(f.name ?? "")))?.display_value ?? "").trim();
            leaseSigned = get2(/lease signed/i);
            moveInDate = get2(/move in date/i);
            unitId = get2(/unit id/i);
            sagareusUrl = get2(/sagareus listing/i);
            if (unitId) {
              try {
                const u2 = await bGet(`/rentals/units/${encodeURIComponent(unitId)}`) as { PropertyId?: number };
                if (u2?.PropertyId) buildiumUrl = `https://sagareus.managebuilding.com/manager/app/properties/${u2.PropertyId}/units/${unitId}/summary`;
              } catch { /* rentals scope is optional on the screening credential */ }
            }
          } catch { /* LU detail is best-effort; the row still renders */ }
        }
        const evS = ((t as { custom_fields?: { gid?: string; enum_value?: { name?: string; color?: string } | null }[] }).custom_fields ?? []).find((c) => c.gid === STATUS2_FIELD)?.enum_value;
        const chipsS = tripleChips((t as { custom_fields?: never[] }).custom_fields);
        const triS = tripleNames((t as { custom_fields?: never[] }).custom_fields);
        rows.push({
          gid: t.gid, name: t.name, url: t.permalink_url ?? `https://app.asana.com/0/0/${t.gid}`,
          status: chipsS.length ? chipsS : (evS?.name ? [{ name: evS.name, color: evS.color ?? "" }] : []),
          stage: triS.stage, decision: triS.decision, holds: triS.holds,
          names, address, approvedAround: (t.modified_at ?? "").slice(0, 10),
          luGid: lu?.gid ?? "", luName: lu?.name ?? "", luUrl: lu ? `https://app.asana.com/0/0/${lu.gid}` : "",
          leaseSigned, moveInDate, unitId, buildiumUrl, sagareusUrl,
        });
      });
      for (let i = 0; i < work.length; i += 5) await Promise.all(work.slice(i, i + 5).map((fn) => fn()));
      rows.sort((a, b) => String(a.approvedAround ?? "").localeCompare(String(b.approvedAround ?? "")));
      const data = { ok: true, rows };
      signqCache = { at: Date.now(), data };
      return j(headers, 200, data);
    }

    // ---------- signUpdate: record the signed lease on the LU + route the application ----------
    // Writes only ever SET fields, never clear them (shared with the whole
    // leasing pipeline: Lease Signed flips the unit to pre-move-in in the
    // Execute bench, WAR queue, and site-visit logic). Signing completes the
    // LU task (cycle done); the application stays OPEN in Move In Pending
    // until move in (Brittany 2026-09-21). Only the no-LU escape hatch still
    // closes the application outright.
    if (action === "signUpdate") {
      const appGid = String((body as { taskGid?: unknown }).taskGid ?? "").trim();
      const luGid = String((body as { luGid?: unknown }).luGid ?? "").trim();
      const leaseSigned = String((body as { leaseSigned?: unknown }).leaseSigned ?? "").trim();
      const moveInDate = String((body as { moveInDate?: unknown }).moveInDate ?? "").trim();
      const complete = (body as { complete?: unknown }).complete === true;
      const ISO = /^\d{4}-\d{2}-\d{2}$/;
      if (!appGid && !luGid) return j(headers, 400, { error: "missing_task" });
      if ((leaseSigned && !ISO.test(leaseSigned)) || (moveInDate && !ISO.test(moveInDate))) {
        return j(headers, 400, { error: "bad_date", message: "Dates must be YYYY-MM-DD." });
      }
      const notes: string[] = [];
      const written: string[] = [];
      if (luGid && (leaseSigned || moveInDate)) {
        const luFull = await asanaCall("GET", `/tasks/${luGid}?opt_fields=name,custom_fields.gid,custom_fields.name,custom_fields.type`) as { name?: string; custom_fields?: Array<{ gid: string; name?: string; type?: string }> };
        const cf = luFull.custom_fields ?? [];
        // per-field PUT writes (site-visit convention: batch writes reject wholesale);
        // date-type fields take {date}, text fields take the ISO string
        const writeField = async (re: RegExp, label: string, iso: string) => {
          const f = cf.find((x) => re.test(String(x.name ?? "")));
          if (!f) { notes.push(`no ${label} field on the LU task`); return; }
          const val = f.type === "date" ? { date: iso } : iso;
          try {
            await asanaCall("PUT", `/tasks/${luGid}`, { custom_fields: { [f.gid]: val } });
            written.push(`${label} = ${iso}`);
          } catch {
            // date fields on some workspaces accept only the plain string form
            try {
              await asanaCall("PUT", `/tasks/${luGid}`, { custom_fields: { [f.gid]: iso } });
              written.push(`${label} = ${iso}`);
            } catch { notes.push(`could not write ${label}`); }
          }
        };
        if (leaseSigned) await writeField(/lease signed/i, "Lease Signed", leaseSigned);
        if (moveInDate) await writeField(/move in date/i, "Move in Date", moveInDate);
        // signing ends the leasing cycle: complete the LU/TP/PreLease task
        // (Brittany 2026-09-21); the Execute bench keeps it visible as Move In
        // Pending while the Move in Date is ahead
        if (leaseSigned) {
          try {
            await asanaCall("PUT", `/tasks/${luGid}`, { completed: true });
            written.push("LU task completed");
          } catch { notes.push("could not complete the LU task"); }
        }
      }
      let movedToComplete = false;
      let movedToPending = false;
      if (appGid && complete) {
        if (luGid) {
          // normal signing: the application stays OPEN in Move In Pending
          // until the tenant actually moves in (Brittany 2026-09-21)
          try {
            await asanaCall("POST", `/tasks/${appGid}/addProject`, { project: PENDING_APPS_PROJECT, section: SEC_MOVEIN_PENDING });
            movedToPending = true;
          } catch { notes.push("could not move the application to Move In Pending"); }
          await setStatus_(appGid, [STATUS.leaseSigned]).catch(() => null);
        } else {
          // no LU matched: the file-away escape hatch keeps closing the task
          try {
            await asanaCall("POST", `/tasks/${appGid}/addProject`, { project: PENDING_APPS_PROJECT, section: SEC_COMPLETE });
            await asanaCall("PUT", `/tasks/${appGid}`, { completed: true });
            movedToComplete = true;
          } catch { notes.push("could not move the application to Complete"); }
        }
      }
      const summary = `LEASE SIGNED (Screen + Sign bench)\n${written.length ? written.join("\n") : "No LU fields written."}${movedToComplete ? "\nApplication moved to Complete." : ""}${movedToPending ? "\nApplication moved to Move In Pending; open until move in." : ""}`;
      if (written.length || movedToComplete || movedToPending) {
        if (appGid) await asanaCall("POST", `/tasks/${appGid}/stories`, { text: summary }).catch(() => null);
        if (luGid) await asanaCall("POST", `/tasks/${luGid}/stories`, { text: summary }).catch(() => null);
      }
      signqCache = null;
      return j(headers, 200, { ok: true, written, movedToComplete, movedToPending, notes });
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
        await asanaCall("PUT", `/tasks/${gid}`, { assignee: assignee.gid, due_on: dueOn });
        await setStatus_(gid, [STATUS.pendingMgr]);
        // first-complete timestamp: fill-blank-only so a revised resubmit never
        // loses the application's original place in line (FIT)
        try {
          const t9 = await asanaCall("GET", `/tasks/${gid}?opt_fields=custom_fields.gid,custom_fields.display_value`) as { custom_fields?: { gid?: string; display_value?: string | null }[] };
          const cur9 = String((t9.custom_fields ?? []).find((x) => x.gid === F_REVIEW_READY)?.display_value ?? "").trim();
          if (!cur9) {
            const nowIso = new Date().toISOString();
            await asanaCall("PUT", `/tasks/${gid}`, { custom_fields: { [F_REVIEW_READY]: { date_time: nowIso } } }).catch(async () => {
              await asanaCall("PUT", `/tasks/${gid}`, { custom_fields: { [F_REVIEW_READY]: { date: nowIso.slice(0, 10) } } }).catch(() => {});
            });
          }
        } catch { /* the queue falls back to insertion order */ }
        const cur = { name: (await asanaCall("GET", `/tasks/${gid}?opt_fields=name`) as { name?: string }).name };
        return j(headers, 200, {
          submitted: true,
          assignee: assignee.name,
          due: dueOn,
          title: cur.name ?? "",
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
        `Created from the Screening Workbench.</body>`;

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
