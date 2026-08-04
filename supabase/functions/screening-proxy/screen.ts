// Document screening pipeline: PDFs in, structured household out, report
// rendered per skills/screening/TEMPLATE.md.
//
// Division of labor (the whole point of this design):
//   - extractPdf: deterministic text extraction (pdfjs -> mupdf text ->
//     mupdf raster), ported from the ask-aster function's proven cascade.
//   - parseDocuments: the ONLY model step. The model reads documents and
//     transcribes figures into the engine's input shape. It never computes.
//   - engine.ts computes. renderReport formats. Both deterministic.
//
// Prior-underwriting PDFs are skipped by filename pattern before extraction
// (SKILL.md: the old system has known calculation errors; never read them).
// Criminal / sex-offender / restricted-person content is never extracted or
// mentioned (Fair Chance Housing; SKILL.md).

import { getDocument } from "pdfjs-dist/legacy";
import * as mupdf from "mupdf";
import type { EngineResult, HouseholdInput } from "./engine.ts";
import { TIERS } from "./engine.ts";

const OR_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
// Fable 5 for document transcription (Brittany, 2026-08-04); verified live on
// OpenRouter. Override per-deploy with PARSE_MODEL if it ever needs rolling back.
const PARSE_MODEL = Deno.env.get("PARSE_MODEL") ?? "anthropic/claude-fable-5";

// SKILL.md filename patterns for prior-underwriting artifacts, plus
// restricted-screening documents Sagareus does not use (Fair Chance
// Housing / restricted-person policy): never read them at all.
const UNDERWRITING_PATTERN = /(underwriting decision|underwriting report|underwriting summary|decision report|decision summary)/i;
const RESTRICTED_PATTERN = /(sanction|ofac|criminal|background check|sex.?offender|restricted.?person)/i;

export function isPriorUnderwritingDoc(name: string): boolean {
  return UNDERWRITING_PATTERN.test(name) || RESTRICTED_PATTERN.test(name);
}

function bytesToBase64(buf: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    bin += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(bin);
}

type MupdfDocument = {
  countPages(): number;
  loadPage(i: number): unknown;
  destroy?(): void;
};

export type Extracted =
  | { kind: "text"; name: string; pages: number; text: string }
  | { kind: "images"; name: string; pages: number; pngs: string[] }
  | { kind: "pdf"; name: string; pages: number; dataBase64: string }
  | { kind: "failed"; name: string; error: string };

/** PDFs pass through to the model natively (it reads text AND scanned pages
 * itself). This replaced the local pdfjs/mupdf cascade as the primary path
 * after real-world scans repeatedly blew the edge worker's memory/CPU
 * (2026-08-04); the cascade below remains as a fallback tool. */
export function pdfAsExtracted(bytes: Uint8Array, name: string): Extracted {
  return { kind: "pdf", name, pages: 0, dataBase64: bytesToBase64(bytes) };
}

const PDF_TEXT_MAX_CHARS = 60000;
// Raster limits sized for the edge function's memory budget: the "not enough
// compute resources" failure (2026-08-04) was scanned multi-page PDFs blowing
// the isolate. Memory scales with dpi^2 x pages, so both are kept tight and
// callers pass a shared budget across ALL files in a run.
const MAX_PAGES_RENDERED = 6;
const RENDER_DPI = 110;

export function extractPdf(bytes: Uint8Array, name: string, rasterBudget = MAX_PAGES_RENDERED): Promise<Extracted> {
  return (async () => {
    let totalPages = 0;
    // Tier 1: pdfjs text
    try {
      const pdfDoc = await getDocument({
        data: bytes, password: "", verbosity: 0,
        useSystemFonts: false, disableFontFace: true, isEvalSupported: false, stopAtErrors: false,
      }).promise;
      totalPages = pdfDoc.numPages;
      const pages: string[] = [];
      for (let i = 1; i <= totalPages; i++) {
        const page = await pdfDoc.getPage(i);
        const content = await page.getTextContent();
        pages.push(content.items
          .map((it: unknown) => typeof it === "object" && it !== null && "str" in it ? String((it as { str: unknown }).str) : "")
          .join(" ").trim());
      }
      if (pages.some((p) => p.length > 0)) {
        return { kind: "text" as const, name, pages: totalPages, text: pages.map((p, i) => `--- Page ${i + 1} ---\n${p}`).join("\n\n").slice(0, PDF_TEXT_MAX_CHARS) };
      }
    } catch { /* fall through */ }
    // Tier 2: mupdf text
    try {
      const doc = (mupdf as unknown as { Document: { openDocument(b: Uint8Array, m: string): MupdfDocument } }).Document.openDocument(bytes, "application/pdf");
      totalPages = doc.countPages();
      const pages: string[] = [];
      for (let i = 0; i < totalPages; i++) {
        // deno-lint-ignore no-explicit-any
        const page = doc.loadPage(i) as any;
        // deno-lint-ignore no-explicit-any
        const stext: any = page.toStructuredText("preserve-whitespace");
        pages.push((typeof stext.asText === "function" ? String(stext.asText()) : "").trim());
        page.destroy?.();
      }
      doc.destroy?.();
      if (pages.some((p) => p.length > 0)) {
        return { kind: "text" as const, name, pages: totalPages, text: pages.map((p, i) => `--- Page ${i + 1} ---\n${p}`).join("\n\n").slice(0, PDF_TEXT_MAX_CHARS) };
      }
    } catch { /* fall through */ }
    // Tier 3: rasterize for vision
    try {
      const doc = (mupdf as unknown as { Document: { openDocument(b: Uint8Array, m: string): MupdfDocument } }).Document.openDocument(bytes, "application/pdf");
      if (!totalPages) totalPages = doc.countPages();
      const limit = Math.min(totalPages, Math.max(0, Math.min(MAX_PAGES_RENDERED, rasterBudget)));
      if (!limit) {
        doc.destroy?.();
        return { kind: "failed" as const, name, error: "scanned document skipped: page-render budget for this run is used up; screen it in a second pass" };
      }
      // deno-lint-ignore no-explicit-any
      const Matrix = (mupdf as any).Matrix;
      // deno-lint-ignore no-explicit-any
      const ColorSpace = (mupdf as any).ColorSpace;
      const matrix = Matrix.scale(RENDER_DPI / 72, RENDER_DPI / 72);
      const pngs: string[] = [];
      for (let i = 0; i < limit; i++) {
        // deno-lint-ignore no-explicit-any
        const page = doc.loadPage(i) as any;
        const pixmap = page.toPixmap(matrix, ColorSpace.DeviceGray, false);
        pngs.push(bytesToBase64(pixmap.asPNG()));
        pixmap.destroy?.();
        page.destroy?.();
      }
      doc.destroy?.();
      return { kind: "images" as const, name, pages: totalPages, pngs };
    } catch (e) {
      return { kind: "failed" as const, name, error: (e as Error).message.slice(0, 200) };
    }
  })();
}

/** Raster images (jpeg/png uploads) pass straight through to vision. */
export function imageAsExtracted(bytes: Uint8Array, name: string): Extracted {
  return { kind: "images", name, pages: 1, pngs: [bytesToBase64(bytes)] };
}

// ------------------------------------------------------------- parsing

const PARSE_SYSTEM = `You transcribe rental application documents for Sagareus Property Management into structured JSON. You TRANSCRIBE ONLY; you never compute, average, discount, or decide anything. A deterministic engine does all math.

Return ONLY a JSON object, no markdown fences, matching:

{
  "applicants": [
    {
      "name": "Full Name",
      "incomes": [
        {
          "type": "w2" | "voucher" | "self_employed_gig" | "gig" | "court_ordered" | "education" | "trust" | "ltd" | "assets_in_lieu" | "other",
          "month1Gross": number,        // gig/self_employed_gig/w2: most recent full month gross
          "month2Gross": number,        // the month before it
          "monthlyGross": number,       // when the doc states a single monthly amount (salary letter, voucher, LTD, court receipts actually received)
          "orderedMonthly": number,     // court_ordered only: the ordered amount
          "singleAccountBalance": number, // assets_in_lieu only: ONE account's balance
          "verified": boolean,          // false when the document does not meet standards (screenshots, self-generated, unsigned, payment apps)
          "note": "employer / platform / program name and doc type"
        }
      ],
      "equifax": number | null,         // Equifax FICO 300-850 ONLY. Never any AI score (RealPage AI Score or similar). Never another bureau's score.
      "adverse": {
        "evictionWithin7Years": boolean,
        "evictionOlderThan7Years": boolean,
        "fundsOwedToLandlord": boolean,
        "bankruptcy": "none" | "active_ch7" | "active_ch13" | "discharged",
        "bankruptcyDischargedDate": "YYYY-MM-DD",
        "tradelineCount": number,
        "identityUnverified": boolean,
        "docInconsistencies": boolean
      },
      "managerFlags": ["short factual observations warranting manager judgment: recent job change, multi-state addresses, declining income trend, collections items with amounts and dates"]
    }
  ],
  "warnings": ["anything you could not read or reconcile"]
}

Hard rules:
- Equifax FICO is the only score. If a report shows multiple scores, take Equifax; if none is labeled Equifax, set equifax to null and add a warning.
- NEVER extract, summarize, or mention criminal background, sex-offender, or restricted-person sections. Skip them entirely; they must not appear anywhere in your output.
- If a document contains prior-underwriting language (decision matrices, "Approved As-Is", precomputed maximum rents), ignore those figures entirely; transcribe only source figures from paystubs, letters, and credit report fields.
- Income documents that do not meet standards (payment-app screenshots, self-generated invoices, unsigned offer letters) get verified: false with the reason in note.
- For paystubs: transcribe the last two full months of GROSS pay as month1Gross/month2Gross. Do not average them.
- For gig or contractor platform statements: transcribe the two monthly gross totals. Do not apply any percentage.
- Collections, charge-offs, judgments: list them factually in managerFlags with amounts and dates.
- Never include protected-class information of any kind.
- No em dashes anywhere.`;

export interface ParsedHousehold {
  applicants: HouseholdInput["applicants"];
  warnings: string[];
}

export async function parseDocuments(docs: Extracted[], contextText: string): Promise<ParsedHousehold> {
  if (!OR_KEY) throw new Error("openrouter_not_configured");
  type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
  const parts: Part[] = [];
  parts.push({
    type: "text",
    text: `${contextText}\nDocuments follow. Attribute income and credit to the right applicant by the names inside each document.`,
  });
  for (const d of docs) {
    if (d.kind === "text") {
      parts.push({ type: "text", text: `\n===== DOCUMENT: ${d.name} (${d.pages} pages, extracted text) =====\n${d.text}` });
    } else if (d.kind === "images") {
      parts.push({ type: "text", text: `\n===== DOCUMENT: ${d.name} (${d.pages} pages, scanned; page images follow) =====` });
      for (const png of d.pngs) {
        parts.push({ type: "image_url", image_url: { url: `data:image/png;base64,${png}` } });
      }
    } else if (d.kind === "pdf") {
      parts.push({ type: "text", text: `\n===== DOCUMENT: ${d.name} (PDF, attached) =====` });
      parts.push({ type: "file", file: { filename: d.name, file_data: `data:application/pdf;base64,${d.dataBase64}` } } as unknown as Part);
    }
  }
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${OR_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: PARSE_MODEL,
      max_tokens: 6000,
      temperature: 0,
      messages: [
        { role: "system", content: PARSE_SYSTEM },
        { role: "user", content: parts },
      ],
    }),
  });
  const jr = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`openrouter ${r.status}`);
  const raw = String(
    (jr as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content ?? "",
  ).trim();
  const jsonText = raw.replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  let parsed: ParsedHousehold;
  try {
    parsed = JSON.parse(jsonText) as ParsedHousehold;
  } catch {
    throw new Error("parse_not_json");
  }
  if (!Array.isArray(parsed.applicants) || !parsed.applicants.length) throw new Error("parse_no_applicants");
  parsed.warnings = Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : [];
  // Model-derived fraud signals must NEVER feed the automatic-denial path
  // (plan of record: probabilistic detections route to Manager Review; a
  // fraud denial requires a human confirming an objective fact). Missing or
  // incomplete documents are not fraud. Convert to manager flags.
  for (const a of parsed.applicants) {
    if (a.adverse?.identityUnverified || a.adverse?.docInconsistencies) {
      a.adverse.identityUnverified = false;
      a.adverse.docInconsistencies = false;
      a.managerFlags = [
        ...(a.managerFlags ?? []),
        "Document reading flagged a possible identity or document inconsistency. Verify by hand; a fraud denial requires human confirmation per the SOP.",
      ];
    }
  }
  return parsed;
}

// ------------------------------------------------------------- report

function money(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

function tierLine(t: EngineResult["tiers"][keyof EngineResult["tiers"]]): { verdict: string; reasons: string } {
  if (t.decision === "approved") return { verdict: `Approved up to ${money(t.maxRent ?? 0)}/month`, reasons: t.reasons.join(" ") };
  if (t.decision === "approved_cosigner") return { verdict: `Approved up to ${money(t.maxRent ?? 0)}/month with co-signer`, reasons: t.reasons.join(" ") };
  return { verdict: "DENIED at this tier", reasons: t.reasons.join(" ") };
}

// Criteria checklist: every check the engine ran and how it came out, so the
// manager sees the full inventory without opening SCREENING_CRITERIA.md
// (Brittany, 2026-08-04). Statuses: PASS / FAIL / REVIEW / INFO.
function criteriaChecklist(result: EngineResult, parsed: ParsedHousehold): string {
  const lines: string[] = [];
  const mark = (status: string, text: string) => lines.push(`  [${status}] ${text}`);
  const anyAdv = (k: keyof NonNullable<ParsedHousehold["applicants"][number]["adverse"]>) =>
    parsed.applicants.some((a) => (a.adverse as Record<string, unknown> | undefined)?.[k] === true);

  lines.push("INCOME");
  for (const a of result.applicants) {
    mark(a.unverifiedIncome ? "REVIEW" : "PASS",
      `${a.name}: income verified per source rules (${a.unverifiedIncome ? "one or more sources excluded, see Manager Review" : "all sources met documentation standards"})`);
  }
  mark("INFO", `Household qualifying income: $${Math.round(result.householdMonthlyIncome).toLocaleString("en-US")}/month, gross, source-neutral (vouchers and all lawful income count fully)`);
  mark("INFO", "Max approved rent per tier = income / multiplier (2.0x / 2.5x / 3.0x), base rent only");

  lines.push("");
  lines.push("CREDIT");
  mark("INFO", `Equifax FICO only; AI risk scores disregarded. Household median: ${result.medianCredit ?? "not on file"} (${result.medianExplanation})`);
  for (const t of TIERS) {
    const r = result.tiers[t.key];
    const med = result.medianCredit;
    const status = med == null ? "FAIL" : med >= t.creditMin ? "PASS" : r.decision === "approved_cosigner" ? "REVIEW" : "FAIL";
    const detail = med == null
      ? "no score on file"
      : med >= t.creditMin
      ? `${med} meets the ${t.creditMin} minimum`
      : r.decision === "approved_cosigner"
      ? `${med} is within 50 below the ${t.creditMin} minimum; co-signer path`
      : `${med} is more than 50 below the ${t.creditMin} minimum`;
    mark(status, `${t.label} credit minimum (${t.creditMin}): ${detail}`);
  }

  lines.push("");
  lines.push("AUTOMATIC DENIAL CHECKS");
  mark(anyAdv("fundsOwedToLandlord") ? "FAIL" : "PASS", "Funds owed to a previous landlord");
  mark(anyAdv("evictionWithin7Years") ? "FAIL" : "PASS", "Eviction within the prior 7 years");
  const activeBk = parsed.applicants.some((a) => a.adverse?.bankruptcy === "active_ch7" || a.adverse?.bankruptcy === "active_ch13");
  mark(activeBk ? "FAIL" : "PASS", "Open (active) bankruptcy");
  const fraudFlag = parsed.applicants.some((a) => (a.managerFlags ?? []).some((f) => /identity or document inconsistency/.test(f)));
  mark(fraudFlag ? "REVIEW" : "PASS", `Fraud indicators (identity verification, document consistency)${fraudFlag ? ": possible inconsistency flagged for manual verification; fraud denial requires human confirmation" : ""}`);
  mark("INFO", "Credit more than 50 points below a tier minimum denies that tier (evaluated per tier above)");

  lines.push("");
  lines.push("PROCESS");
  mark("INFO", "Same criteria applied to every applicant; no protected-class or source-of-income factors considered (Fair Housing baseline)");
  mark("INFO", "Prior-underwriting reports and restricted-screening files skipped unread; all figures re-derived from source documents");
  mark(result.managerReview.length ? "REVIEW" : "PASS", `Manager review triggers scanned: ${result.managerReview.length ? result.managerReview.length + " item(s) listed above" : "none fired"}`);
  return lines.join("\n");
}

/** Render the report as clean plain text (Asana comments do not render
 * markdown, so headers are caps + rule lines, not # and **). Deterministic.
 * Section order follows skills/screening/TEMPLATE.md, plus the criteria
 * checklist at the end. */
export function renderReport(
  result: EngineResult,
  parsed: ParsedHousehold,
  opts: { reportId: string; date: string; assistantNotes?: string; integrityFlags?: string[] },
): string {
  const RULE = "=".repeat(52);
  const thin = "-".repeat(52);
  const H = (title: string) => `${title.toUpperCase()}\n${thin}`;

  const tiers = TIERS.map((t) => ({ meta: t, r: result.tiers[t.key], ...tierLine(result.tiers[t.key]) }));
  const managerItems = [...(opts.integrityFlags ?? []), ...result.managerReview, ...parsed.warnings.map((w) => `Data integrity: ${w}`)];
  const managerBlock = managerItems.length ? managerItems.map((m) => `  * ${m}`).join("\n") : "  * None on file";

  const applicantBlocks = result.applicants.map((a, i) => {
    const src = parsed.applicants[i];
    const adv = src?.adverse ?? {};
    const bk = adv.bankruptcy === "active_ch7" ? "Active (Chapter 7)"
      : adv.bankruptcy === "active_ch13" ? "Active (Chapter 13)"
      : adv.bankruptcy === "discharged" ? `Discharged${adv.bankruptcyDischargedDate ? " on " + adv.bankruptcyDischargedDate : ""}`
      : "None";
    const ev = adv.evictionWithin7Years ? "Filing within the prior 7 years"
      : adv.evictionOlderThan7Years ? "History outside the 7-year window (see Manager Review)"
      : "None within 7 years";
    return `Applicant ${i + 1}: ${a.name}
  Monthly qualifying income .... ${money(a.qualifyingMonthly)}
  Income verification .......... ${a.incomeLines.join("\n                                 ") || "No income documents provided"}
  Equifax FICO score ........... ${a.equifax ?? "Not on file"}
  Bankruptcy ................... ${bk}
  Eviction history ............. ${ev}
  Funds owed prior landlord .... ${adv.fundsOwedToLandlord ? "Yes (see Manager Review)" : "None"}
  Notes ........................ ${(src?.managerFlags ?? []).join("; ") || "None"}`;
  }).join("\n\n");

  const incomeSum = result.applicants.map((a, i) => `  ${i === 0 ? " " : "+"} ${money(a.qualifyingMonthly)}  (${a.name})`).join("\n");
  const ficoLines = result.applicants.map((a) => `  ${a.equifax ?? "n/a"}  (${a.name})`).join("\n");

  return `${RULE}
SAGAREUS PROPERTY MANAGEMENT
APPLICANT SCREENING REPORT
Completed ${opts.date} | Report ID ${opts.reportId}
${RULE}

${H("Tier Results")}
${tiers.map((t) => `${t.meta.label.toUpperCase()} (${t.meta.creditMin} credit, ${t.meta.multiplier.toFixed(1)}x income)
  >>> ${t.verdict.toUpperCase()} <<<${t.reasons ? `\n  ${t.reasons}` : ""}`).join("\n\n")}

${H("Headline Numbers")}
  Household income ...... ${money(result.householdMonthlyIncome)}/month (combined verified monthly gross)
  Median credit score ... ${result.medianCredit ?? "n/a"} (Equifax FICO, ${result.applicants.length} applicant${result.applicants.length === 1 ? "" : "s"})

${H("Manager Review")}
Items that meet criteria but warrant the manager's judgment.
They do not change the tier results above.

${managerBlock}

${H("Underwriting Detail")}
${applicantBlocks}

${H("Show The Math")}
Household income (sum of verified monthly qualifying income):
${incomeSum}
  = ${money(result.householdMonthlyIncome)}/month total

Max approved rent per tier (income / multiplier):
${tiers.map((t) => `  ${t.meta.label.padEnd(10)} (${t.meta.multiplier.toFixed(1)}x): ${t.r.maxRent != null ? money(t.r.maxRent) + "/month" : "n/a (denied)"}`).join("\n")}

Median credit score (Equifax FICO, median method):
${ficoLines}
  = ${result.medianCredit ?? "n/a"}  (${result.medianExplanation})

${H("Assistant Notes For Manager")}
${opts.assistantNotes?.trim() || "No additional notes from the leasing assistant."}

${H("Screening Criteria Checklist")}
Every criterion checked on this application and how it came out.
Full definitions: SCREENING_CRITERIA.md (Sagareus screening SOP).

${criteriaChecklist(result, parsed)}

${H("Notices")}
Generation: This report was produced by the Sagareus Screening
Workbench with AI-assisted document reading and deterministic
underwriting math, then reviewed by the leasing assistant. All
application decisions are made by the Sagareus Leasing Manager.

FCRA: If this report contributed to an adverse decision, the
applicant has the right to dispute inaccuracies with the screening
vendor and to request a free copy of the underlying consumer report
within 60 days under the Fair Credit Reporting Act.

Fair Housing: Sagareus Property Management evaluates every
application on the same objective criteria. Decisions are not based
on race, color, creed, national origin, sex, sexual orientation,
gender identity, disability, marital status, HIV or hepatitis C
status, families with children, use of a dog guide or service
animal, honorably-discharged veteran or military status, immigration
or citizenship status, or source of income. Sagareus accepts all
lawful sources of income, including housing vouchers and other
rental assistance programs.

Questions: leasing@sagareus.com
Sagareus Property Management`;
}
