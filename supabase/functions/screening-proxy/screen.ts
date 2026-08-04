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
const PARSE_MODEL = "anthropic/claude-sonnet-5"; // same model the sibling proxies use

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
  | { kind: "failed"; name: string; error: string };

const PDF_TEXT_MAX_CHARS = 60000;
const MAX_PAGES_RENDERED = 10;
const RENDER_DPI = 150;

export function extractPdf(bytes: Uint8Array, name: string): Promise<Extracted> {
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
      const limit = Math.min(totalPages, MAX_PAGES_RENDERED);
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

/** Render the report per skills/screening/TEMPLATE.md. Deterministic. */
export function renderReport(
  result: EngineResult,
  parsed: ParsedHousehold,
  opts: { reportId: string; date: string; assistantNotes?: string; integrityFlags?: string[] },
): string {
  const tiers = TIERS.map((t) => ({ meta: t, r: result.tiers[t.key], ...tierLine(result.tiers[t.key]) }));
  const managerItems = [...(opts.integrityFlags ?? []), ...result.managerReview, ...parsed.warnings.map((w) => `Data integrity: ${w}`)];
  const managerBlock = managerItems.length ? managerItems.map((m) => `- ${m}`).join("\n") : "- None on file";

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
    return `### Applicant ${i + 1}: ${a.name}

- **Monthly qualifying income:** ${money(a.qualifyingMonthly)}
- **Income verification:** ${a.incomeLines.join("; ") || "No income documents provided"}
- **Equifax FICO score:** ${a.equifax ?? "Not on file"}
- **Bankruptcy:** ${bk}
- **Eviction history:** ${ev}
- **Funds owed to prior landlord:** ${adv.fundsOwedToLandlord ? "Yes (see Manager Review)" : "None"}
- **Notes:** ${(src?.managerFlags ?? []).join("; ") || "None"}`;
  }).join("\n\n");

  const incomeSum = result.applicants.map((a, i) => `- Applicant ${i + 1} monthly qualifying income: ${i === 0 ? "" : "+ "}${money(a.qualifyingMonthly)}`).join("\n");
  const ficoLines = result.applicants.map((a, i) => `- Applicant ${i + 1} Equifax FICO: ${a.equifax ?? "n/a"}`).join("\n");

  return `# SAGAREUS PROPERTY MANAGEMENT

## Applicant Screening Summary

Completed on **${opts.date}** · Report ID **${opts.reportId}**

## Manager Review

_Items that meet criteria but warrant the manager's judgment. These do not change the tier results below; they are flagged here for quick reference._

${managerBlock}

## Tier Results

${tiers.map((t) => `**${t.meta.label}** (${t.meta.creditMin} credit · ${t.meta.multiplier.toFixed(1)}x income)
**${t.verdict}**
${t.reasons}`.trim()).join("\n\n")}

## Headline Numbers

Household income: **${money(result.householdMonthlyIncome)}/month** (combined verified monthly gross)
Median credit score: **${result.medianCredit ?? "n/a"}** (Equifax FICO, across ${result.applicants.length} applicant${result.applicants.length === 1 ? "" : "s"})

## Underwriting

${applicantBlocks}

## Show the Math

### Household income

${incomeSum}
- **Total household income (monthly, gross): ${money(result.householdMonthlyIncome)}**

### Max approved rent per tier (income ÷ multiplier)

${tiers.map((t) => `- ${t.meta.label} (${t.meta.multiplier.toFixed(1)}x): ${t.r.maxRent != null ? money(t.r.maxRent) + "/month" : "n/a (denied)"}`).join("\n")}

### Median credit score

${ficoLines}
- **Median credit score: ${result.medianCredit ?? "n/a"}** (${result.medianExplanation})

## Assistant Notes for Manager

${opts.assistantNotes?.trim() || "No additional notes from the leasing assistant."}

## Notices

**Generation:** This report was produced by the Sagareus Screening Workbench with AI-assisted document reading and deterministic underwriting math, then reviewed by the leasing assistant. All application decisions are made by the Sagareus Leasing Manager.

**FCRA:** If this report contributed to an adverse decision, the applicant has the right to dispute inaccuracies with the screening vendor and to request a free copy of the underlying consumer report within 60 days under the Fair Credit Reporting Act.

**Fair Housing:** Sagareus Property Management evaluates every application on the same objective criteria. Decisions are not based on race, color, creed, national origin, sex, sexual orientation, gender identity, disability, marital status, HIV or hepatitis C status, families with children, use of a dog guide or service animal, honorably-discharged veteran or military status, immigration or citizenship status, or source of income. Sagareus accepts all lawful sources of income, including housing vouchers and other rental assistance programs.

**Questions:** leasing@sagareus.com

_Sagareus Property Management_`;
}
