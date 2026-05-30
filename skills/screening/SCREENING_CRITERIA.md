# Sagareus Applicant Screening Criteria

Aster reads this file at the start of every screening run. Treat it as
the source of truth, not memory. If anything here conflicts with
training-data assumptions, this file wins.

## Fair housing baseline

Sagareus complies with the federal Fair Housing Act, the Washington Law
Against Discrimination, and Seattle's local ordinances including Source
of Income protections, Fair Chance Housing, and First-in-Time.

Aster applies the criteria below uniformly to every applicant.
Decisions are based on factual, verifiable findings only. Aster never
references race, color, creed, national origin, sex, sexual orientation,
gender identity, disability, marital status, HIV or hepatitis C status,
families with children, use of a dog guide or service animal,
honorably-discharged veteran or military status, immigration or
citizenship status, or source of income as a basis for denial or
modification in any draft, document, or comment.

Full policy: www.sagareus.com/fair-housing

## How the three tiers work

Sagareus uses three property tiers that combine income and credit
requirements. Each Sagareus property is assigned one tier by
ownership.

| Tier      | Income multiplier | Credit minimum | Typical use                          |
|-----------|-------------------|----------------|--------------------------------------|
| Lenient   | 2.0x base rent    | 600            | Workforce housing, slower markets    |
| Standard  | 2.5x base rent    | 650            | Most Sagareus properties             |
| Stringent | 3.0x base rent    | 700            | Premium properties, owner-requested  |

**Aster evaluates every applicant against all three tiers and reports
all three results.** Aster does not need to know which tier applies to
the current property. The manager reads the tier that matches the
property and uses that result. This makes the report portable if the
application is later transferred to a different property at a different
tier.

The automatic denial criteria below apply uniformly across all three
tiers. If any are met, all three tier results return DENIED with the
same factual reason.

## Income criteria

### Calculation basis

- Use gross (pre-tax) monthly income, summed across all adult applicants
- Compare against **base rent only**. Exclude utilities, pet rent or
  fees, parking, storage, and any other recurring charges. If the task
  description shows a combined or total rent figure, ask the assistant
  for base rent before computing.
- Required total household income at each tier = base rent × tier
  multiplier (2.0x, 2.5x, or 3.0x)

### Source-of-income neutrality

Sagareus accepts all lawful sources of income. Aster does not weight or
discount income by source beyond the verification rules below.
Vouchers, Social Security, child support, retirement income, and
stipends count as fully as wages when they meet the verification
standard.

### Verification standards per income type

**W-2 employment**
- Two months of paystubs OR a signed offer letter on company letterhead
- Paystubs must show full legal name, employer name and address, pay
  period dates, gross earnings, YTD earnings, and HR contact info
- Offer letter must be signed, include start date within 60 days,
  position title, salary, and HR contact with company email domain
- Verbal offers, unsigned drafts, text messages, and informal emails
  do not qualify
- Calculation: average gross monthly income across the last two months

**Housing vouchers and rental assistance**
- Voucher income changes the math: the income multiplier applies to
  the **tenant portion of rent**, not the contract rent
- Required: official voucher award letter showing applicant name,
  approved assistance amount, payment structure, program contact, and
  active status with current expiration or recertification date
- Formula: gross monthly income ÷ tenant portion = income ratio; that
  ratio must meet the tier multiplier
- Accepted programs include Section 8 HCV, TBRA, RRH, VASH, Sound
  Families, Solid Ground, Catholic Community Services, and other
  government or nonprofit subsidies

**Self-employed and 1099**
- Default verification: gig rule. Use platform or service-provider
  pay statements covering the most recent 60 days, then calculate
  qualifying income at 70% of the 2-month average gross. Same math
  as the Gig and contract work section. Acceptable monthly
  documentation includes physician reimbursement letters, contractor
  payment statements, 1099-K platform reports, marketplace earnings
  dashboards, and similar platform-issued documents.
- Escalation: if the gig-rule qualifying income is too low for the
  target property's tier, request the prior year's full federal tax
  return (Form 1040 plus relevant schedules C, E, F, or K-1s for
  partnership, LLC, or S-Corp income; business returns 1120, 1120S,
  1065 where personal income depends on business profitability). The
  tax return supports a higher qualifying figure because the 70%
  discount no longer applies.
- Self-generated invoices, P&L statements, and payment-app screenshots
  (Venmo, Cash App, Zelle) without a platform-issued document do not
  meet the standard at either tier.
- Bank statements may support asset-based qualification but are not
  standalone income verification.

**Gig and contract work**
- Earnings reports from each platform covering the most recent 60 days
- Reports must show applicant name, gross earnings, payout dates,
  weekly or monthly totals
- Calculation: 70% of the average monthly gross across two months
- Formula: ((Month 1 + Month 2) ÷ 2) × 0.70 = qualifying monthly income
- Covers Uber, Lyft, DoorDash, Grubhub, Instacart, Shipt, Rover, Wag,
  TaskRabbit, Amazon Flex, Upwork, Fiverr, Etsy, freelance and
  short-term 1099 contract work

**Court-ordered income (child support, alimony, structured settlements)**
- Court order showing applicant name, monthly amount, payment
  frequency, duration of at least 12 months, case reference, court or
  agency contact
- Proof of actual receipt within the last 60 days: bank statements,
  state disbursement records, case ledger, copies of checks
- Calculation uses actually-received amount, not the ordered amount.
  If the order says $1,200/mo but receipts show $800/mo, $800 is the
  qualifying figure.
- Inconsistent payments may require additional documentation or result
  in denial
- One-time court awards and lump-sum settlements do not qualify as
  recurring income but may contribute to Assets in Lieu

**Education income (RA/TA stipends, fellowships, vocational training)**
- Official award or appointment letter on institution letterhead
  showing applicant name, role (TA, RA, Fellow), monthly stipend or
  payment structure, start and end dates (must cover 12+ months),
  department or HR contact
- Stipends paid to the student as taxable income qualify
- Fellowship money applied to tuition does not qualify

**Trust fund disbursements**
- Trust documentation showing applicant as beneficiary, payment amount
  and frequency, start date, 12-month guarantee, trustee or attorney
  contact
- Proof of receipt: two months of bank deposits, OR distribution
  checks, OR trustee-issued payment statements
- Discretionary trusts require a trustee letter confirming the minimum
  guaranteed amount for the next 12 months
- Trust account balances without a guaranteed distribution schedule
  do not count
- Anticipated inheritances and future trust payouts do not count
- Brokerage accounts held inside a trust do not count as income unless
  distributions are documented and guaranteed

**Long-Term Disability (LTD)**
- Official LTD award or approval letter showing applicant name,
  monthly benefit, payment frequency, active status, duration of 12+
  months, employer HR or carrier contact
- Proof of receipt: two months of bank deposits, OR carrier statements,
  OR employer HR pay detail
- Short-Term Disability does not qualify
- Pending LTD claims do not qualify
- Letters without benefit amounts or clear duration do not qualify
- Benefits with an end date inside the lease term do not qualify

**Assets in lieu of income**
- For applicants who don't meet the income multiplier through earnings
- Liquid assets held in a single account (no combining multiple
  accounts to meet the requirement)
- Eligible: checking, savings, brokerage, vested stock
- Not eligible: vehicles, jewelry, business equipment, non-liquid
  holdings
- Calculation:
  - Annual income requirement = base rent × tier multiplier × 12
  - Income shortfall = annual requirement − verified annual income
  - Single-account asset balance must exceed the shortfall
- Assets in lieu can apply per tier: an applicant may have enough
  assets to cover the Lenient shortfall but not the Stringent shortfall

### Documentation standards

All income documents must:
- Be clear, legible, and complete (no missing pages, cut-off text,
  or obscuring screenshots)
- Match the applicant's full legal identity
- Reflect authentic, unaltered records
- Be verifiable through an employer, agency, financial institution,
  or official platform
- Include sufficient detail for income calculation (dates, pay
  periods, gross amounts, account holder name)

Documents that may result in denial or additional verification
requests:
- Documents that appear altered, edited, or modified
- Self-produced or handwritten documents not from an official source
- Documents that appear forged, inconsistent, or do not match known
  format standards
- Screenshots lacking identifying information or context
- Documents that appear incomplete, contradictory, or mathematically
  inconsistent
- Income that cannot be independently verified
- Password-protected files with no provided password

Sagareus reserves the right to request additional documentation,
require multiple forms of verification, verify income directly with
employers or agencies, and deny the application if income cannot be
verified to standard.

## Credit criteria

### Score source

Primary score: **Equifax FICO (300-850 scale)**.

Aster ignores any AI-derived risk score (RealPage AI Score or similar),
even when present on the screening report.

### Household credit score (median method)

- Pull each adult applicant's individual Equifax score
- Order numerically
- Two applicants: median = average of the two scores
- Three or more applicants:
  - Odd count: middle value
  - Even count: average of the two middle values
- Compare the household median to each tier's minimum (600 / 650 / 700)

### Per-applicant credit review

In addition to the score, Aster reviews each applicant's credit report
for:
- Payment history (any 30/60/90+ days late)
- Tradeline count and types
- Derogatory flags: collections, charge-offs, bankruptcies, evictions
- Outstanding balances and balance-to-limit ratios

Non-score findings inform the Manager Second Look list and may trigger
the automatic denial criteria below.

### Co-signer eligibility (evaluated per tier)

A co-signer is permitted when:
- The household median is within 50 points of the tier minimum, AND
- No automatic denial criteria are present, AND
- Income requirements for that tier are fully met

Examples:
- Standard tier (650 minimum): household median 600-649 may qualify
  with co-signer
- Stringent tier (700 minimum): household median 650-699 may qualify
  with co-signer

A co-signer is NOT permitted when:
- The household median is more than 50 points below the tier minimum
  (this is an automatic denial at that tier)
- Any automatic denial criterion is met (no tier permits co-signer
  mitigation in these cases)

The same household may need a co-signer at one tier and not another.
Aster evaluates co-signer eligibility independently for each tier and
includes it in the result for that tier.

## Automatic denial criteria

These bypass judgment. If any are present, all three tier results
return DENIED with the specific factual reason cited. The Manager
Second Look list is not used for these; the SOP is determinative.

### 1. Credit score more than 50 points below tier minimum

Evaluated per tier:
- Lenient (600): household median 549 or below = automatic denial at
  Lenient
- Standard (650): household median 599 or below = automatic denial at
  Standard
- Stringent (700): household median 649 or below = automatic denial at
  Stringent

Note: a household can be auto-denied at Stringent but eligible at
Lenient or Standard. Report each tier independently.

### 2. Funds owed to a previous landlord

Any outstanding balance owed to a prior landlord, property management
company, or apartment complex is an automatic denial across all tiers
until fully resolved. Includes:
- Unpaid rent
- Damages beyond deposit
- Legal judgments
- Lease-break fees in collections
- Payment plans in default

Resolved only with proof of payment or settlement.

### 3. Eviction within the prior 7 years

Any of the following within 7 years of application is an automatic
denial across all tiers:
- Formal eviction judgments
- Writs of restitution
- Unlawful detainer filings that resulted in tenant removal

Evictions older than 7 years may be reviewed but do not automatically
clear; flag for Manager Second Look.

### 4. Open (active) bankruptcy

Active Chapter 7 or Chapter 13 bankruptcy at the time of application
is an automatic denial across all tiers.

Discharged bankruptcies do not automatically deny; flag for Manager
Second Look if discharge was within the prior 2 years.

### 5. Fraud indicators

Any of the following is an automatic denial across all tiers:
- Suspected or confirmed identity fraud
- Forged or altered documentation
- Mismatched personal information across documents
- Inability to verify identity through provided documentation

## Adverse action phrase bank

Use the exact phrasings below in the "Conditions or reasons" block of
the report when the recommendation at a given tier is DENIED. These
are factual, verifiable, and fair-housing-compliant. Do not paraphrase
in ways that introduce protected-class language or imply judgment
about the applicant as a person.

### Auto-denial reasons (apply to all tiers)
- "Outstanding balance owed to a prior landlord."
- "Eviction filing within the prior 7 years."
- "Active bankruptcy (Chapter 7) at the time of application."
- "Active bankruptcy (Chapter 13) at the time of application."
- "Identity could not be verified."
- "Documentation inconsistencies prevent verification."

### Tier-specific denial reasons
- "Household median credit score more than 50 points below the
  [Tier] minimum."
- "Income below the [2.0x / 2.5x / 3.0x] rent threshold and shortfall
  not resolvable through assets or co-signer."
- "Income could not be verified to Sagareus documentation standards."

### Modification language (for APPROVED WITH MODIFICATION at a tier)
- "Co-signer required, meeting the [2.0x / 2.5x / 3.0x] rent income
  standard."
- "Additional security deposit equal to one month's rent."
- "Assets in lieu of income qualifying applied; documentation on file."
- "Both modifications: co-signer plus additional security deposit."

## Manager Second Look triggers

Items that meet criteria above but warrant the manager's judgment.
These do not change a tier result; they appear in a separate notes
list for the manager:

- Recent job change (less than 2 months at current employer) with
  offer letter verification
- Verified income unusually high or low for the reported role
- Discharged bankruptcy within the prior 2 years
- Thin credit file (fewer than 3 tradelines)
- Eviction outside the 7-year automatic-denial window
- Voucher income still pending vendor confirmation of award amount
- Self-employment income that meets the threshold but shows declining
  year-over-year trend on tax returns
- Court-ordered income where receipts are inconsistent across the
  60-day verification window
- Multiple addresses across multiple states within the prior 12 months
- Tier results that diverge sharply (e.g., Approved at Lenient,
  Denied at Stringent due to income gap), where the manager may want
  to discuss the application before responding
- Anything Aster could compute but feels uncertain about
