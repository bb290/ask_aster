# Sample Run: The Glynn household

A worked example showing how a `/screening` run flows end-to-end on a
real Asana task. For reference and onboarding only. Not loaded at
runtime by the deployed skill.

The task has actual sensitive PII; treat the figures and screenshots
in this example as illustrative training data, not as content to
republish elsewhere.

---

## Step 1: Assistant pastes a task URL

```
/screening https://app.asana.com/1/706990140225747/project/1208297375044026/task/1215182714098623
```

## Step 2: Aster fetches the task and confirms

Aster calls the Asana MCP and reads:

- **Task name:** `Glynn - 2BR application`
- **Task description (excerpt):**
  > Application for a 2BR. Owner's property is Standard tier and base
  > rent will be $5,495. Move-in target is July 15. Ryan and Natalia
  > are married; Ryan accepted a position at Tulane and is relocating
  > from California. Natalia works at Virginia Mason Franciscan.
  > Credit reports and POI bundles attached.

- **Attachments listed via `get_attachments`:** 6 files
  1. `Natalia Glynn's POI.pdf`
  2. `Natalia & Ryan's Ledger.pdf`
  3. `Ryan Glynn's POI.pdf`
  4. `UNDERWRITING DECISION REPORT _ Application ID_GLYNN-RN-2026 Report Date_ May 27, 2026.pdf`
  5. `Credit Score - Ryan Glynn.pdf`
  6. `Credit Score - Natalia Glynn.pdf`

Aster's chat message:

> Confirmed. Reading task **Glynn - 2BR application**. I see base rent
> at $5,495 and a Standard tier note; I'll still run all three tiers
> since the screening is portable. Move on?

The assistant replies `yes` and Aster proceeds.

## Step 3: Sanity-check

- Six attachments present (more than zero), check.
- Task name contains both applicant last names (Glynn), check.

No blockers. Aster proceeds.

## Step 4: Parse the task description

Aster extracts from the prep notes:

- **Applicants:** Ryan Glynn, Natalia Glynn
- **Household type:** married couple
- **Property base rent:** $5,495 (Standard tier mentioned, but Aster
  evaluates all three tiers either way)
- **Move-in date target:** July 15
- **Other context:** Ryan relocating from CA, recent offer at Tulane;
  Natalia at Virginia Mason Franciscan

Held as parsed values for the step 6 confirmation list.

## Step 5: Fetch every attachment

Aster calls `fetch_asana_attachment` once per attachment GID.

For each PDF, Aster extracts text and matches it to an applicant:

- `Natalia Glynn's POI.pdf` → Natalia's POI bundle
- `Natalia & Ryan's Ledger.pdf` → household financial ledger
- `Ryan Glynn's POI.pdf` → Ryan's POI bundle
- `UNDERWRITING DECISION REPORT...` → prior underwriting summary
  (treated as reference context, not as the authoritative input)
- `Credit Score - Ryan Glynn.pdf` → Ryan's On-Site credit report
- `Credit Score - Natalia Glynn.pdf` → Natalia's On-Site credit report

## Step 6: Extract data per applicant

### Per applicant: income

**Ryan Glynn**
- Source: W-2 employment, new role at Tulane University
- POI bundle includes an offer letter showing $66,294 annual base
  salary and a separate page summarizing $795,000 of supplemental
  income. The supplemental figure does not have paystub support yet.
- Documentation gap: no 2-month paystub average available from the new
  employer; the offer letter is the only base-salary source.
- Calculation pending verification: $66,294 / 12 = $5,524.50/month
  qualifying from offer letter alone. The $795K figure is flagged as
  unsupported and NOT included in the qualifying income.

**Natalia Glynn**
- Source: W-2 employment at Virginia Mason Franciscan
- POI bundle includes 2 months of paystubs.
- Calculation: 2-month average gross = $18,000/month.

### Per applicant: credit (Equifax FICO only)

**Ryan Glynn**
- Equifax FICO: **761**
- Adverse items: none on file in the 7-year window
- Bankruptcy: none
- Eviction: none within 7 years
- Funds owed to prior landlord: none
- The report also shows a **RealPage AI Score of 810**, which Aster
  notes and ignores per `SCREENING_CRITERIA.md`.

**Natalia Glynn**
- Equifax FICO: **760**
- Adverse items: none on file
- Bankruptcy: none
- Eviction: none within 7 years
- Funds owed to prior landlord: none
- The report shows a RealPage AI Score of 809, also ignored.

### Sections deliberately skipped

Both On-Site reports include "Criminal Background" and "Sex Offender
Search" sections, both showing `Pending`. Aster skips these entirely
per Seattle Fair Chance Housing. They do not appear on any list and
are not mentioned in chat.

### Aster's step 6 message to the assistant

> Here's what I parsed. Confirm anything that looks wrong before I
> apply criteria.
>
> **(a) PARSED FROM TASK**
> - Applicants: Ryan Glynn, Natalia Glynn (married couple)
> - Ryan: qualifying income $5,524.50/mo (W-2, Tulane offer letter,
>   $66,294 annual base ÷ 12). Equifax FICO 761.
> - Natalia: qualifying income $18,000/mo (W-2, Virginia Mason
>   Franciscan, 2-month paystub average). Equifax FICO 760.
> - **Total household income (so far): $23,524.50/mo**
> - **Median credit score: 760.5**
> - Base rent: $5,495 (from prep notes)
> - Move-in target: July 15
>
> **(b) MISSING OR INCONSISTENT**
> - Ryan's POI bundle includes a $795,000 supplemental income figure
>   that is not backed by paystubs. I excluded it from qualifying
>   income; the household still qualifies at all three tiers without
>   it. Confirm whether to chase paystub documentation or leave it out.
> - Ryan has no 2 months of paystubs from Tulane yet (he's new). The
>   offer letter is the standalone source for his base salary. Per
>   `SCREENING_CRITERIA.md`, a signed offer letter on company
>   letterhead is acceptable; I'll note it.
>
> **(c) MANAGER SECOND LOOK**
> - Multi-state address history within the prior 12 months for both
>   applicants (CA → WA for Ryan, WA only for Natalia per docs).
> - Ryan's role change is less than 2 months old; flagged for
>   manager judgment per the recent-job-change trigger.
>
> Any notes you want me to add for the manager to review?

### Assistant response

> Add a note that we already verified Ryan's offer letter from Tulane
> and confirmed by phone with HR on 2026-05-28. Confirmed by CS. Drop
> the $795K from qualifying income.

Aster acknowledges and proceeds.

## Step 7: Apply criteria across all three tiers

### Auto-denial checks

1. Credit > 50 below tier minimum?
   - Lenient (600): household median 760.5, not within 50 below. Clear.
   - Standard (650): 760.5 well above 650. Clear.
   - Stringent (700): 760.5 above 700. Clear.
2. Funds owed to prior landlord? None. Clear.
3. Eviction in prior 7 years? None. Clear.
4. Active bankruptcy? None. Clear.
5. Fraud indicators? None. Clear.

No auto-denial triggers. Proceed with per-tier evaluation.

### Tier-by-tier

Income requirement at $5,495 base rent:
- Lenient (2.0x) = $10,990/mo. Household: $23,524.50. Meets.
- Standard (2.5x) = $13,737.50/mo. Household: $23,524.50. Meets.
- Stringent (3.0x) = $16,485/mo. Household: $23,524.50. Meets.

Credit at or above tier minimum:
- Lenient (600): 760.5 ≥ 600. Meets.
- Standard (650): 760.5 ≥ 650. Meets.
- Stringent (700): 760.5 ≥ 700. Meets.

**Tier results:**
- Lenient: **APPROVED** (clean)
- Standard: **APPROVED** (clean)
- Stringent: **APPROVED** (clean)

## Step 8: Show the full draft in chat

Aster prints the complete report markdown using the structure in
`TEMPLATE.md`, filled with the figures above. Filename preview:
`R. Glynn _ N. Glynn - Screening Summary - 2026-05-29`.

The assistant reviews and replies `looks good, ship it`.

## Step 9: Generate the Google Doc

Aster:
1. Copies the template Doc via the Google Drive MCP using the
   `GOOGLE_DOC_TEMPLATE_ID` from `TEMPLATE.md`.
2. Fills every placeholder per the placeholder map.
3. Renames the copy: `R. Glynn _ N. Glynn - Screening Summary - 2026-05-29`.
4. Moves the copy into the Applications folder using
   `APPLICATIONS_FOLDER_ID`.
5. Leaves the Doc editable so the manager can amend it directly.

Aster captures the new Doc's share URL.

## Step 10: Post the Asana comment

Aster posts a comment on the same task (`1215182714098623`) using the
Asana MCP. The comment starts:

```
READY FOR MANAGER REVIEW

Doc: https://docs.google.com/document/d/[new-doc-id]/edit
```

Followed by a blank line and the full markdown report from
`TEMPLATE.md`, all placeholders filled. The task description and
existing attachments are not modified.

## Step 11: Hand off

Aster returns to the assistant:

> Done. Posted to the same Asana task and saved a Doc.
>
> - Doc: https://docs.google.com/document/d/[new-doc-id]/edit
> - Asana: https://app.asana.com/1/706990140225747/project/1208297375044026/task/1215182714098623
> - Tier summary: Approved at Lenient, Standard, and Stringent.
>
> The Doc is editable; the manager reviews on the Asana comment and
> makes the call.

Aster stops here. No follow-up email is drafted, no notifications fire.
