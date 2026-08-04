// Sagareus underwriting engine.
//
// Deterministic implementation of skills/screening/SCREENING_CRITERIA.md
// (the source of truth; if this file and that one disagree, the markdown
// wins and this file has a bug). Replaces the arithmetic previously done
// by the model inside the /screening skill; the human manager review is
// unchanged and decisions still post to Asana by the manager.
//
// Pure functions, no I/O, no Date.now (callers pass asOf). Every rule
// carries a comment naming the criteria section it encodes.
//
// The report is property-agnostic (SCREENING_CRITERIA "How the three
// tiers work"): instead of judging against one property's rent, it
// computes the maximum approved rent per tier; the manager applies the
// tier that matches the property.

// ---------------------------------------------------------------- types

export type IncomeType =
  | "w2" // avg of last 2 months gross paystubs, or signed offer letter
  | "voucher" // gross monthly income from voucher award letter (SKILL.md income table)
  | "self_employed_gig" // default self-employed path: gig rule at 70%
  | "self_employed_tax_return" // escalation path: prior-year federal return, no 70% discount
  | "gig" // 70% of 2-month average gross
  | "court_ordered" // actually-received amount across 60 days
  | "education" // stipend/fellowship paid as taxable income
  | "trust" // guaranteed distributions only
  | "ltd" // long-term disability award
  | "assets_in_lieu" // single-account liquid balance; handled per tier, not summed
  | "other"; // verified monthly amount with a note

export interface IncomeSource {
  type: IncomeType;
  /** Verified gross monthly amount (w2/voucher/tax-return/court/education/trust/ltd/other). */
  monthlyGross?: number;
  /** Two-month gross amounts for gig-rule types. */
  month1Gross?: number;
  month2Gross?: number;
  /** court_ordered: the ordered monthly amount, for the inconsistency trigger. */
  orderedMonthly?: number;
  /** assets_in_lieu: largest SINGLE liquid account balance (no combining accounts). */
  singleAccountBalance?: number;
  /** False when documentation does not meet the standard; excluded from totals and flagged. */
  verified?: boolean;
  note?: string;
}

export interface AdverseProfile {
  evictionWithin7Years?: boolean;
  evictionOlderThan7Years?: boolean;
  fundsOwedToLandlord?: boolean;
  bankruptcy?: "none" | "active_ch7" | "active_ch13" | "discharged";
  /** ISO date, for the discharged-within-2-years manager trigger. */
  bankruptcyDischargedDate?: string;
  /** Fewer than 3 tradelines triggers the thin-file manager flag. */
  tradelineCount?: number;
  identityUnverified?: boolean;
  docInconsistencies?: boolean;
}

export interface ApplicantInput {
  name: string;
  incomes: IncomeSource[];
  /** Equifax FICO 300-850. The only score that matters (Credit criteria / Score source). */
  equifax?: number | null;
  adverse?: AdverseProfile;
  /** Free-form manager-review flags gathered upstream (recent job change, multi-state addresses, ...). */
  managerFlags?: string[];
}

export interface HouseholdInput {
  applicants: ApplicantInput[];
  /** Evaluation date for date math; ISO. Required so the engine stays deterministic. */
  asOf: string;
}

export type TierKey = "lenient" | "standard" | "stringent";
export type TierDecision = "approved" | "approved_cosigner" | "denied";

export interface TierResult {
  tier: TierKey;
  multiplier: number;
  creditMin: number;
  decision: TierDecision;
  /** Max approved base rent, whole dollars; null when denied. */
  maxRent: number | null;
  /** True when the assets-in-lieu extension raised maxRent; carries modification language. */
  assetsApplied: boolean;
  /** Exact phrase-bank strings. */
  reasons: string[];
}

export interface ApplicantResult {
  name: string;
  qualifyingMonthly: number;
  equifax: number | null;
  incomeLines: string[];
  unverifiedIncome: boolean;
}

export interface EngineResult {
  householdMonthlyIncome: number;
  medianCredit: number | null;
  medianExplanation: string;
  applicants: ApplicantResult[];
  /** Household-wide auto-denial (criteria 2-5). When set, every tier is denied with these reasons. */
  autoDenial: { denied: boolean; reasons: string[] };
  tiers: Record<TierKey, TierResult>;
  managerReview: string[];
}

// ------------------------------------------------------------- constants

/** "How the three tiers work" table. */
export const TIERS: { key: TierKey; label: string; multiplier: number; creditMin: number }[] = [
  { key: "lenient", label: "Lenient", multiplier: 2.0, creditMin: 600 },
  { key: "standard", label: "Standard", multiplier: 2.5, creditMin: 650 },
  { key: "stringent", label: "Stringent", multiplier: 3.0, creditMin: 700 },
];

/** Co-signer window: within 50 points below the tier minimum ("Co-signer eligibility"). */
const COSIGNER_WINDOW = 50;

const round2 = (n: number) => Math.round(n * 100) / 100;

// --------------------------------------------------------------- income

/** Qualifying monthly income for one source, per "Verification standards per income type". */
export function qualifyingMonthly(src: IncomeSource): { amount: number; line: string } {
  const t = src.type;
  if (t === "gig" || t === "self_employed_gig") {
    // ((Month 1 + Month 2) / 2) x 0.70 (Gig and contract work; self-employed default)
    const m1 = src.month1Gross ?? 0, m2 = src.month2Gross ?? 0;
    const avg = (m1 + m2) / 2;
    const amt = round2(avg * 0.70);
    return {
      amount: amt,
      line: `${t === "gig" ? "Gig" : "Self-employed (gig rule)"}: (($${m1.toFixed(2)} + $${m2.toFixed(2)}) / 2) x 0.70 = $${amt.toFixed(2)}/mo`,
    };
  }
  if (t === "w2" && src.month1Gross != null && src.month2Gross != null) {
    // W-2: average gross monthly income across the last two months
    const amt = round2((src.month1Gross + src.month2Gross) / 2);
    return { amount: amt, line: `W-2: ($${src.month1Gross.toFixed(2)} + $${src.month2Gross.toFixed(2)}) / 2 = $${amt.toFixed(2)}/mo` };
  }
  if (t === "assets_in_lieu") {
    // Not monthly income; applied per tier against the shortfall. Zero here.
    return { amount: 0, line: `Assets in lieu: $${(src.singleAccountBalance ?? 0).toFixed(2)} single-account balance (applied per tier)` };
  }
  const amt = round2(src.monthlyGross ?? 0);
  const label: Record<string, string> = {
    w2: "W-2", voucher: "Voucher (gross monthly from award letter)",
    self_employed_tax_return: "Self-employed (tax return, no discount)",
    court_ordered: "Court-ordered (actually received)", education: "Education stipend",
    trust: "Trust distribution", ltd: "Long-Term Disability", other: "Other verified",
  };
  return { amount: amt, line: `${label[t] ?? t}: $${amt.toFixed(2)}/mo` };
}

// --------------------------------------------------------------- credit

/** Household median, "Household credit score (median method)". Null when no scores. */
export function medianCredit(scores: number[]): { median: number | null; explanation: string } {
  const s = scores.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return { median: null, explanation: "No Equifax scores on file." };
  if (s.length === 1) return { median: s[0], explanation: `Single applicant: ${s[0]}.` };
  if (s.length === 2) {
    const m = round2((s[0] + s[1]) / 2);
    return { median: m, explanation: `Two applicants: (${s[0]} + ${s[1]}) / 2 = ${m}.` };
  }
  if (s.length % 2 === 1) {
    const m = s[(s.length - 1) / 2];
    return { median: m, explanation: `${s.length} applicants: middle value of [${s.join(", ")}] = ${m}.` };
  }
  const a = s[s.length / 2 - 1], b = s[s.length / 2];
  const m = round2((a + b) / 2);
  return { median: m, explanation: `${s.length} applicants: average of two middle values (${a}, ${b}) of [${s.join(", ")}] = ${m}.` };
}

// --------------------------------------------------------------- engine

export function underwrite(input: HouseholdInput): EngineResult {
  const asOf = new Date(input.asOf);
  const managerReview: string[] = [];

  // Per-applicant income and credit
  const applicants: ApplicantResult[] = input.applicants.map((a) => {
    const lines: string[] = [];
    let total = 0;
    let unverified = false;
    for (const src of a.incomes) {
      if (src.verified === false) {
        unverified = true;
        lines.push(`EXCLUDED (does not meet documentation standard): ${qualifyingMonthly(src).line}${src.note ? ` [${src.note}]` : ""}`);
        continue;
      }
      const q = qualifyingMonthly(src);
      if (src.type !== "assets_in_lieu") total = round2(total + q.amount);
      lines.push(q.line + (src.note ? ` [${src.note}]` : ""));
      // Court-ordered inconsistency trigger (Manager Review triggers)
      if (src.type === "court_ordered" && src.orderedMonthly != null && (src.monthlyGross ?? 0) < src.orderedMonthly) {
        managerReview.push(`${a.name}: court-ordered income received ($${(src.monthlyGross ?? 0).toFixed(2)}/mo) is below the ordered amount ($${src.orderedMonthly.toFixed(2)}/mo); receipts inconsistent across the verification window.`);
      }
      // Self-employment escalation hint (Verification standards, self-employed)
      if (src.type === "self_employed_gig" || src.type === "gig") {
        managerReview.push(`${a.name}: income computed under the 70% gig rule. If the target property's rent exceeds the qualifying tier, request the prior-year federal tax return per the self-employment escalation.`);
      }
    }
    if (unverified) {
      managerReview.push(`${a.name}: one or more income sources excluded; documentation does not meet Sagareus standards.`);
    }
    return {
      name: a.name,
      qualifyingMonthly: total,
      equifax: a.equifax ?? null,
      incomeLines: lines,
      unverifiedIncome: unverified,
    };
  });

  const householdMonthlyIncome = round2(applicants.reduce((s, a) => s + a.qualifyingMonthly, 0));
  const med = medianCredit(applicants.map((a) => a.equifax).filter((x): x is number => x != null));

  // Assets in lieu: largest single account across the household ("no
  // combining multiple accounts" is per account, not per household member;
  // the shortfall must be covered by ONE account).
  const assetBalances = input.applicants.flatMap((a) =>
    a.incomes.filter((s) => s.type === "assets_in_lieu" && s.verified !== false)
      .map((s) => s.singleAccountBalance ?? 0)
  );
  const bestSingleAccount = assetBalances.length ? Math.max(...assetBalances) : 0;

  // ---- Automatic denial criteria 2-5 (household-wide, all tiers)
  const autoReasons: string[] = [];
  for (const a of input.applicants) {
    const adv = a.adverse ?? {};
    if (adv.fundsOwedToLandlord) autoReasons.push("Outstanding balance owed to a prior landlord.");
    if (adv.evictionWithin7Years) autoReasons.push("Eviction filing within the prior 7 years.");
    if (adv.bankruptcy === "active_ch7") autoReasons.push("Active bankruptcy (Chapter 7) at the time of application.");
    if (adv.bankruptcy === "active_ch13") autoReasons.push("Active bankruptcy (Chapter 13) at the time of application.");
    if (adv.identityUnverified) autoReasons.push("Identity could not be verified.");
    if (adv.docInconsistencies) autoReasons.push("Documentation inconsistencies prevent verification.");
  }
  const autoDenial = { denied: autoReasons.length > 0, reasons: [...new Set(autoReasons)] };

  // ---- Manager Review triggers (non-determinative; "Manager Review triggers")
  for (const a of input.applicants) {
    const adv = a.adverse ?? {};
    if (adv.bankruptcy === "discharged" && adv.bankruptcyDischargedDate) {
      const d = new Date(adv.bankruptcyDischargedDate);
      const twoYears = 2 * 365.25 * 86400000;
      if (asOf.getTime() - d.getTime() < twoYears) {
        managerReview.push(`${a.name}: bankruptcy discharged within the prior 2 years (${adv.bankruptcyDischargedDate}).`);
      }
    }
    // Thin-file flag only makes sense when a credit report was actually read;
    // with no score on file the no-score handling covers it.
    if (adv.tradelineCount != null && adv.tradelineCount < 3 && a.equifax != null) {
      managerReview.push(`${a.name}: thin credit file (${adv.tradelineCount} tradeline${adv.tradelineCount === 1 ? "" : "s"}).`);
    }
    if (adv.evictionOlderThan7Years) {
      managerReview.push(`${a.name}: eviction history outside the 7-year automatic-denial window.`);
    }
    for (const f of a.managerFlags ?? []) managerReview.push(`${a.name}: ${f}`);
  }

  // ---- Per-tier evaluation
  const tiers = {} as Record<TierKey, TierResult>;
  for (const t of TIERS) {
    const base: TierResult = {
      tier: t.key, multiplier: t.multiplier, creditMin: t.creditMin,
      decision: "denied", maxRent: null, assetsApplied: false, reasons: [],
    };
    if (autoDenial.denied) {
      base.reasons = [...autoDenial.reasons];
      tiers[t.key] = base;
      continue;
    }
    if (med.median == null) {
      // Not an adverse-action phrase: this is a pending state, not a denial
      // decision. The manager issues any actual denial with bank language.
      base.reasons = ["No Equifax score on file; credit report pending. Denied until credit is on file."];
      managerReview.push("No Equifax score could be read; every tier returns denied until credit is on file.");
      tiers[t.key] = base;
      continue;
    }
    // Auto-denial criterion 1, evaluated per tier: more than 50 below minimum
    if (med.median < t.creditMin - COSIGNER_WINDOW) {
      base.reasons = [`Household median credit score more than 50 points below the ${t.label} minimum.`];
      tiers[t.key] = base;
      continue;
    }
    // Max approved rent = income / multiplier, nearest dollar (SKILL.md tier table)
    let maxRent = Math.round(householdMonthlyIncome / t.multiplier);
    let assetsApplied = false;
    if (bestSingleAccount > 0) {
      // Assets in lieu: single-account balance must exceed the annual
      // shortfall (annual requirement - verified annual income). Solving for
      // rent: rent <= (annual income + balance) / (12 x multiplier).
      const extended = Math.floor((householdMonthlyIncome * 12 + bestSingleAccount) / (12 * t.multiplier));
      if (extended > maxRent) { maxRent = extended; assetsApplied = true; }
    }
    if (med.median >= t.creditMin) {
      base.decision = "approved";
      base.maxRent = maxRent;
      base.assetsApplied = assetsApplied;
      if (assetsApplied) base.reasons.push("Assets in lieu of income qualifying applied; documentation on file.");
    } else {
      // Within 50 below: co-signer path ("Co-signer eligibility")
      base.decision = "approved_cosigner";
      base.maxRent = maxRent;
      base.assetsApplied = assetsApplied;
      base.reasons.push(`Co-signer required, meeting the ${t.multiplier.toFixed(1)}x rent income standard.`);
      if (assetsApplied) base.reasons.push("Assets in lieu of income qualifying applied; documentation on file.");
    }
    tiers[t.key] = base;
  }

  // Sharp tier divergence trigger
  const decisions = TIERS.map((t) => tiers[t.key].decision);
  if (!autoDenial.denied && new Set(decisions).size > 1 && decisions.includes("denied")) {
    managerReview.push("Tier results diverge sharply; consider discussing the application before responding.");
  }

  return {
    householdMonthlyIncome,
    medianCredit: med.median,
    medianExplanation: med.explanation,
    applicants,
    autoDenial,
    tiers,
    managerReview: [...new Set(managerReview)],
  };
}
