// Tests for the underwriting engine. The Glynn household fixture comes from
// skills/screening/examples/sample_run.md (illustrative training data); its
// expected numbers were hand-verified against SCREENING_CRITERIA.md.
// Run: deno test engine_test.ts

import { assertEquals, assertAlmostEquals } from "jsr:@std/assert@1";
import { underwrite, medianCredit, qualifyingMonthly, type HouseholdInput } from "./engine.ts";

const ASOF = "2026-08-03";

Deno.test("Glynn fixture: gig rule + w2, all tiers approved", () => {
  const input: HouseholdInput = {
    asOf: ASOF,
    applicants: [
      {
        name: "Natalia Glynn",
        incomes: [{ type: "self_employed_gig", month1Gross: 16380.90, month2Gross: 15196.56 }],
        equifax: 760,
      },
      {
        name: "Ryan Glynn",
        incomes: [{ type: "w2", monthlyGross: 5524.50 }],
        equifax: 761,
        managerFlags: ["recent job change (less than 2 months at current employer), offer letter verification"],
      },
    ],
  };
  const r = underwrite(input);
  // ((16380.90 + 15196.56) / 2) * 0.70 = 11052.11
  assertAlmostEquals(r.applicants[0].qualifyingMonthly, 11052.11, 0.01);
  assertAlmostEquals(r.householdMonthlyIncome, 16576.61, 0.01);
  assertEquals(r.medianCredit, 760.5);
  assertEquals(r.autoDenial.denied, false);
  assertEquals(r.tiers.lenient.decision, "approved");
  assertEquals(r.tiers.lenient.maxRent, 8288);
  assertEquals(r.tiers.standard.maxRent, 6631);
  assertEquals(r.tiers.stringent.maxRent, 5526);
  // gig-rule escalation hint + passthrough flag both present
  const mr = r.managerReview.join(" | ");
  if (!/70% gig rule/.test(mr)) throw new Error("missing gig escalation hint");
  if (!/recent job change/.test(mr)) throw new Error("missing passthrough flag");
});

Deno.test("co-signer window: 620 median is approved at Lenient, co-signer at Standard, denied at Stringent", () => {
  const r = underwrite({
    asOf: ASOF,
    applicants: [{ name: "A", incomes: [{ type: "w2", monthlyGross: 5000 }], equifax: 620 }],
  });
  assertEquals(r.tiers.lenient.decision, "approved");
  assertEquals(r.tiers.standard.decision, "approved_cosigner");
  assertEquals(r.tiers.standard.reasons[0], "Co-signer required, meeting the 2.5x rent income standard.");
  assertEquals(r.tiers.stringent.decision, "denied");
  assertEquals(r.tiers.stringent.reasons[0], "Household median credit score more than 50 points below the Stringent minimum.");
  // divergence trigger fires
  if (!r.managerReview.some((m) => /Tier results differ/.test(m))) throw new Error("missing divergence trigger");
});

Deno.test("boundary: exactly 50 below the minimum still allows a co-signer; 51 below denies", () => {
  const at50 = underwrite({ asOf: ASOF, applicants: [{ name: "A", incomes: [{ type: "w2", monthlyGross: 4000 }], equifax: 600 }] });
  assertEquals(at50.tiers.standard.decision, "approved_cosigner"); // 650 - 50 = 600
  const at51 = underwrite({ asOf: ASOF, applicants: [{ name: "A", incomes: [{ type: "w2", monthlyGross: 4000 }], equifax: 599 }] });
  assertEquals(at51.tiers.standard.decision, "denied");
});

Deno.test("auto-denial: eviction within 7 years denies every tier with the phrase-bank reason", () => {
  const r = underwrite({
    asOf: ASOF,
    applicants: [{
      name: "A", incomes: [{ type: "w2", monthlyGross: 9000 }], equifax: 780,
      adverse: { evictionWithin7Years: true },
    }],
  });
  assertEquals(r.autoDenial.denied, true);
  for (const k of ["lenient", "standard", "stringent"] as const) {
    assertEquals(r.tiers[k].decision, "denied");
    assertEquals(r.tiers[k].reasons, ["Eviction filing within the prior 7 years."]);
    assertEquals(r.tiers[k].maxRent, null);
  }
});

Deno.test("auto-denial: active ch13 + landlord debt collects both reasons, deduped", () => {
  const r = underwrite({
    asOf: ASOF,
    applicants: [
      { name: "A", incomes: [], equifax: 700, adverse: { bankruptcy: "active_ch13", fundsOwedToLandlord: true } },
      { name: "B", incomes: [], equifax: 700, adverse: { fundsOwedToLandlord: true } },
    ],
  });
  assertEquals(r.autoDenial.reasons, [
    "Outstanding balance owed to a prior landlord.",
    "Active bankruptcy (Chapter 13) at the time of application.",
  ]);
});

Deno.test("median method: odd count takes middle, even count averages two middle", () => {
  assertEquals(medianCredit([700, 600, 650]).median, 650);
  assertEquals(medianCredit([600, 650, 700, 750]).median, 675);
  assertEquals(medianCredit([720]).median, 720);
  assertEquals(medianCredit([]).median, null);
});

Deno.test("assets in lieu: single account extends max rent with modification language", () => {
  // income 3000/mo; standard maxRent = 1200. With a 60k account:
  // (3000*12 + 60000) / (12*2.5) = 96000/30 = 3200
  const r = underwrite({
    asOf: ASOF,
    applicants: [{
      name: "A", equifax: 700,
      incomes: [
        { type: "w2", monthlyGross: 3000 },
        { type: "assets_in_lieu", singleAccountBalance: 60000 },
      ],
    }],
  });
  assertEquals(r.tiers.standard.maxRent, 3200);
  assertEquals(r.tiers.standard.assetsApplied, true);
  assertEquals(r.tiers.standard.reasons.includes("Assets in lieu of income qualifying applied; documentation on file."), true);
  // household monthly income does NOT include the asset balance
  assertEquals(r.householdMonthlyIncome, 3000);
});

Deno.test("discharged bankruptcy within 2 years is a manager flag, not a denial", () => {
  const r = underwrite({
    asOf: ASOF,
    applicants: [{
      name: "A", incomes: [{ type: "w2", monthlyGross: 5000 }], equifax: 700,
      adverse: { bankruptcy: "discharged", bankruptcyDischargedDate: "2025-06-01" },
    }],
  });
  assertEquals(r.autoDenial.denied, false);
  assertEquals(r.tiers.standard.decision, "approved");
  if (!r.managerReview.some((m) => /discharged within the prior 2 years/.test(m))) throw new Error("missing discharge flag");
});

Deno.test("court-ordered received below ordered triggers the inconsistency flag; received amount is what counts", () => {
  const r = underwrite({
    asOf: ASOF,
    applicants: [{
      name: "A", equifax: 700,
      incomes: [{ type: "court_ordered", monthlyGross: 800, orderedMonthly: 1200 }],
    }],
  });
  assertEquals(r.householdMonthlyIncome, 800);
  if (!r.managerReview.some((m) => /receipts inconsistent/.test(m))) throw new Error("missing inconsistency flag");
});

Deno.test("below-standard income is COUNTED and flagged, never zeroed (policy 2026-08-04)", () => {
  const r = underwrite({
    asOf: ASOF,
    applicants: [{
      name: "A", equifax: 700,
      incomes: [
        { type: "w2", monthlyGross: 4000 },
        { type: "other", monthlyGross: 2000, verified: false, note: "payment-app screenshots only" },
      ],
    }],
  });
  assertEquals(r.householdMonthlyIncome, 6000);
  assertEquals(r.applicants[0].unverifiedIncome, true);
  if (!r.applicants[0].incomeLines.some((l) => /BELOW DOCUMENTATION STANDARD \(counted/.test(l))) throw new Error("missing counted label");
  if (!r.managerReview.some((m) => /below Sagareus standards/.test(m))) throw new Error("missing flag");
});

Deno.test("zero income never yields approved-up-to-\$0; tiers deny with the verification phrase", () => {
  const r = underwrite({
    asOf: ASOF,
    applicants: [{ name: "A", equifax: 700, incomes: [] }],
  });
  assertEquals(r.tiers.lenient.decision, "denied");
  assertEquals(r.tiers.lenient.reasons, ["Income could not be verified to Sagareus documentation standards."]);
});

Deno.test("thin file and old eviction are manager flags", () => {
  const r = underwrite({
    asOf: ASOF,
    applicants: [{
      name: "A", incomes: [{ type: "w2", monthlyGross: 5000 }], equifax: 700,
      adverse: { tradelineCount: 2, evictionOlderThan7Years: true },
    }],
  });
  assertEquals(r.tiers.standard.decision, "approved");
  if (!r.managerReview.some((m) => /thin credit file \(2 tradelines\)/.test(m))) throw new Error("missing thin file flag");
  if (!r.managerReview.some((m) => /outside the 7-year/.test(m))) throw new Error("missing old eviction flag");
});

Deno.test("w2 from two monthly grosses averages them", () => {
  const q = qualifyingMonthly({ type: "w2", month1Gross: 6000, month2Gross: 5000 });
  assertEquals(q.amount, 5500);
});

Deno.test("no credit score on file: all tiers denied, manager flagged", () => {
  const r = underwrite({
    asOf: ASOF,
    applicants: [{ name: "A", incomes: [{ type: "w2", monthlyGross: 5000 }], equifax: null }],
  });
  assertEquals(r.tiers.lenient.decision, "denied");
  if (!r.managerReview.some((m) => /No Equifax score/.test(m))) throw new Error("missing no-score flag");
});

Deno.test("single documented month is used alone, never averaged with zero, and flagged", () => {
  const q = qualifyingMonthly({ type: "w2", month1Gross: 16153.85 });
  assertEquals(q.amount, 16153.85);
  if (!/ONLY ONE MONTH DOCUMENTED/.test(q.line)) throw new Error("missing single-month marker");
  const r = underwrite({
    asOf: "2026-08-04",
    applicants: [{ name: "A", incomes: [{ type: "w2", month1Gross: 16153.85 }], equifax: 703 }],
  });
  assertEquals(r.householdMonthlyIncome, 16153.85);
  if (!r.managerReview.some((m) => /two-month requirement is not met/.test(m))) throw new Error("missing manager flag");
});
