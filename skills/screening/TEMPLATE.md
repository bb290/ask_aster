# Screening Report Template

This file pins the Google Doc template ID, the Drive Applications folder
ID, the full output report markdown, and the placeholder map Aster uses
when filling the report.

## Section 1: Doc and folder IDs

```
GOOGLE_DOC_TEMPLATE_ID: 1aQV1rw07ATNA623STsDhuCFfb2gu7UDW9YhrJ08txDs
APPLICATIONS_FOLDER_ID: [TO BE FILLED BY BRITTANY]
```

How to retrieve each ID:

- **Doc ID** is the URL segment between `/d/` and `/edit` on the template
  Doc's share URL. Example: in
  `https://docs.google.com/document/d/1aB2cDeFgHiJkLmN0pQrS/edit`, the
  Doc ID is `1aB2cDeFgHiJkLmN0pQrS`.
- **Folder ID** is the URL segment after `/folders/` on the Applications
  folder's share URL. Example: in
  `https://drive.google.com/drive/folders/1xYz0aB2cDeFgHiJkLmN`, the
  folder ID is `1xYz0aB2cDeFgHiJkLmN`.

Paste each ID inline in the block above, replacing the bracketed
placeholder. No quotes, no extra whitespace.

## Section 2: Output report markdown

This is the exact structure Aster posts as the Asana comment in step 10
and the structure the Google Doc template mirrors. Every bracketed
token is a placeholder that Aster fills per Section 3 below.

```markdown
# SAGAREUS PROPERTY MANAGEMENT

## Applicant Screening Summary

Completed on **[GENERATION DATE]** · Report ID **[XXXXX]**

---

## TIER RESULTS

**Lenient** (600 credit · 2.0x income)
**[APPROVED] / [APPROVED WITH MODIFICATION] / [DENIED]**
[Conditions or reasons, if applicable. Leave blank for clean approvals. For modifications, list each on its own line. For denials, cite the specific reason from the adverse action phrase bank.]

**Standard** (650 credit · 2.5x income)
**[APPROVED] / [APPROVED WITH MODIFICATION] / [DENIED]**
[Conditions or reasons, if applicable.]

**Stringent** (700 credit · 3.0x income)
**[APPROVED] / [APPROVED WITH MODIFICATION] / [DENIED]**
[Conditions or reasons, if applicable.]

---

## HEADLINE NUMBERS

| **HOUSEHOLD INCOME** | **MEDIAN CREDIT SCORE** |
|---|---|
| **$[X,XXX]** | **[XXX]** |
| _combined verified monthly gross_ | _Equifax FICO, across [N] applicants_ |

---

## UNDERWRITING

### Application Detail

_Each applicant is screened on income, credit, and rental history. The fields below show what was reviewed and where it came from._

### Applicant 1: [APPLICANT 1 FULL NAME]

| | |
|---|---|
| **Monthly qualifying income** | $[X,XXX] |
| **Income source** | [W-2 / Voucher / Self-employed / Gig / Court-ordered / Education / Trust / LTD / Assets in lieu] |
| **Income verification** | [Document type reviewed, calculation method applied, any verification calls made by (staff member) on (date)] |
| **Equifax FICO score** | [XXX] |
| **Adverse credit items** | [None on file] OR [List items: open collections, charge-offs, judgments, with dates and amounts] |
| **Bankruptcy** | [None] / [Discharged Chapter 7 on MM/YYYY] / [Discharged Chapter 13 on MM/YYYY] / [Active] |
| **Eviction history** | [None within 7 years] / [Filing on MM/YYYY: factual description] |
| **Funds owed to prior landlord** | [None] / [Amount and creditor] |
| **Rental history** | [Prior landlords contacted, both confirmed on-time payment and clean move-out] OR [Findings: factual description] |
| **Notes** | [Free-text observations from underwriting, e.g., recent job change verified with offer letter] |

### Applicant 2: [APPLICANT 2 FULL NAME]

| | |
|---|---|
| **Monthly qualifying income** | $[X,XXX] |
| **Income source** | [...] |
| **Income verification** | [...] |
| **Equifax FICO score** | [XXX] |
| **Adverse credit items** | [...] |
| **Bankruptcy** | [...] |
| **Eviction history** | [...] |
| **Funds owed to prior landlord** | [...] |
| **Rental history** | [...] |
| **Notes** | [...] |

_For households of three to six applicants, duplicate the applicant block and renumber sequentially._

---

## SHOW THE MATH

### Household income

_Sum of each applicant's verified monthly qualifying income, calculated per the source-specific rules in SCREENING_CRITERIA.md (2-month paystub average for W-2, 70% of gig earnings, tenant-portion math for vouchers, etc.)._

| | |
|---|---|
| Applicant 1 monthly qualifying income | $[X,XXX] |
| Applicant 2 monthly qualifying income | + $[X,XXX] |
| **Total household income (monthly, gross)** | **$[X,XXX]** |

### Median credit score

_Each applicant's Equifax FICO score sorted low to high, then the middle value taken. For two applicants the median is the average of the two scores._

| | |
|---|---|
| Applicant 1 Equifax FICO | [XXX] |
| Applicant 2 Equifax FICO | [XXX] |
| **Median credit score** | **[XXX]** |

---

## MANAGER SECOND LOOK

_Items that meet criteria but warrant the manager's judgment. These do not change the tier results above; they are flagged here for review._

- [Item or "None on file"]
- [Item]

## ASSISTANT NOTES FOR MANAGER

[Free-text notes the leasing assistant added for the manager during the screening run.]

---

## NOTICES

**Generation:** This report was produced by Aster, the Sagareus leasing assistant, with AI assistance, then reviewed and finalized by the leasing assistant. All application decisions are made by the Sagareus Leasing Manager.

**FCRA:** If this report contributed to an adverse decision, the applicant has the right to dispute inaccuracies with the screening vendor and to request a free copy of the underlying consumer report within 60 days under the Fair Credit Reporting Act.

**Fair Housing:** Sagareus Property Management evaluates every application on the same objective criteria. Decisions are not based on race, color, creed, national origin, sex, sexual orientation, gender identity, disability, marital status, HIV or hepatitis C status, families with children, use of a dog guide or service animal, honorably-discharged veteran or military status, immigration or citizenship status, or source of income. Sagareus accepts all lawful sources of income, including housing vouchers and other rental assistance programs.

**Questions:** leasing@sagareus.com

_Sagareus Property Management_
```

## Section 3: Placeholder map

Every bracketed token in the markdown above, what fills it, and any
special handling.

- **[GENERATION DATE]**: today's date in `Month DD, YYYY` format
  (e.g., `May 29, 2026`).
- **[XXXXX]**: a 5-digit report ID. Generate from the current UTC
  unix timestamp's last 5 digits, or any 5-digit value that is unique
  within a given day. Format: zero-padded to 5 digits.
- **[APPLICANT N FULL NAME]**: the applicant's full legal name as it
  appears on identity documents and the credit report. Match
  capitalization to the source documents (not all caps unless that's
  how the doc renders it).
- **[APPROVED] / [APPROVED WITH MODIFICATION] / [DENIED]**: the tier
  result. Keep only the applicable token and remove the slashes and
  other options. Render the chosen result bolded on its own line.
- **$[X,XXX]**: dollar amount formatted with comma thousands separator
  and no decimals. Round to the nearest whole dollar (round half up).
- **[XXX]**: integer credit score in the 300-850 range. If the median
  is a half-point (two-applicant household with an odd sum), round half
  up for the headline number but show the exact median in the math
  section (e.g., `760.5`).
- **[N]**: total number of adult applicants in the household.
- **Conditions or reasons block** (under each tier result):
  - APPROVED clean: leave the block blank (delete the placeholder).
  - APPROVED WITH MODIFICATION: list each modification on its own line
    using the modification language verbatim from
    `SCREENING_CRITERIA.md`'s adverse action phrase bank.
  - DENIED: cite the specific reason verbatim from the phrase bank in
    `SCREENING_CRITERIA.md`. One line per reason; if multiple apply,
    list each.

### Per-row placeholder rules in the applicant blocks

- **Income source**: pick exactly one label from the bracketed list.
  Do not combine; pick the dominant qualifying source. If the applicant
  has multiple sources contributing to qualification, use the highest
  contributor as the label and capture the rest in `Notes`.
- **Income verification**: short factual phrase noting the document
  type reviewed, the calculation rule applied, and any verification
  calls made (with staff initials and date). Examples:
  - `Two months of paystubs from Tulane University; 2-month average per the W-2 rule. Offer letter confirmed by phone with HR on 2026-05-28 by CS.`
  - `HCV award letter from Seattle Housing Authority; tenant portion confirmed at $325/mo against $2,200 contract rent. Active through 2027-03.`
- **Adverse credit items**: `None on file` for a clean report. For
  items, list each as `Type, MM/YYYY, $amount, creditor` on its own
  line. Do not editorialize. Do not summarize as "minor" or "significant."
- **Bankruptcy**: exactly one of: `None`, `Discharged Chapter 7 on
  MM/YYYY`, `Discharged Chapter 13 on MM/YYYY`, `Active Chapter 7`,
  `Active Chapter 13`.
- **Eviction history**: `None within 7 years` for clean. For filings,
  list each as `MM/YYYY: factual description from the public record`.
  Filings older than 7 years should be noted as
  `Outside 7-year window, no further action`.
- **Funds owed to prior landlord**: `None` for clean. For balances:
  `$amount owed to [creditor name from credit report]`.
- **Rental history**: factual phrase from the screening report or the
  assistant's verification calls. Examples:
  - `Two prior landlords contacted; both confirmed on-time payment and clean move-out.`
  - `Prior landlord could not be reached; verified via 24 months of payment records on screening report.`
- **Notes**: free-text observations the assistant or Aster added during
  underwriting. Keep factual. Multiple notes go on separate lines.

### Multi-applicant duplication (Doc template)

The Google Doc template ships with two applicant blocks (Applicant 1
and Applicant 2). For households of three to six applicants:

1. In the Doc, copy the entire Applicant 2 block, from the
   `### Applicant 2:` header row through the `Notes` table row
   (inclusive).
2. Paste below Applicant 2 to create Applicant 3. Update the header
   number.
3. Repeat for Applicant 4, 5, 6 as needed. The Sagareus Drive API
   approach: use `batchUpdate` with `insertTable` and `insertText`
   requests to duplicate the table rows, then `replaceAllText` for
   the placeholders.
4. If the household has more than six applicants, stop and tell the
   assistant to split the screening into two reports. Do not produce
   a partial report.

### Manager Second Look (bullet list rules)

- If no triggers fire, write `None on file` as the only bullet and
  leave the rest of the section empty.
- If triggers fire, list each as a short factual bullet. Do not
  summarize, do not paraphrase the underlying trigger rule from
  `SCREENING_CRITERIA.md`. Examples:
  - `Discharged Chapter 7 bankruptcy on 2024-08-12, within the 2-year window.`
  - `Self-employment income meets threshold; tax return shows declining year-over-year revenue (2024: $112,400; 2025: $89,200).`
  - `Multi-state address history within prior 12 months (WA, OR, CA).`

### Assistant Notes for Manager

Paste verbatim what the assistant provided in step 6 of the workflow.
If the assistant did not add notes, write
`No additional notes from the leasing assistant.` as a single line.
