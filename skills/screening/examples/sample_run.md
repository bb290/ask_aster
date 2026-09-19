# Sample Run: The Glynn household

A worked example showing how a `/screening` run flows end-to-end on a
real Asana task. For reference and onboarding only. Not loaded at
runtime by the deployed skill.

The task has actual sensitive PII; treat the figures in this example
as illustrative training data, not as content to republish.

---

## The assistant pastes a task URL

```
/screening https://app.asana.com/1/706990140225747/project/1208297375044026/task/1215182714098623
```

Aster runs the whole flow without pausing until the single gate at
step 5. The numbered phases below are what Aster does internally; the
assistant doesn't see narration between them.

---

## Phase 1: Fetch the task + attachments (silent)

Aster calls the Asana MCP and reads:

- **Task name:** `Glynn - 2BR application`
- **Task description (excerpt):**
  > Application for a 2BR. Move-in target is July 15. Ryan and Natalia
  > are married; Ryan recently accepted a position at Tulane and is
  > relocating from California. Natalia works at Virginia Mason
  > Franciscan. Credit reports and POI bundles attached.

- **Attachments listed via `get_attachments`:** 6 files
  1. `Natalia Glynn's POI.pdf` → fetched, parsed via mupdf-text (12 pages of STATHealth reimbursement letters)
  2. `Natalia & Ryan's Ledger.pdf` → fetched, rendered to PNG via mupdf (scanned, no text layer)
  3. `Ryan Glynn's POI.pdf` → fetched, rendered to PNG via mupdf (scanned, no text layer)
  4. `UNDERWRITING DECISION REPORT _ Application ID_GLYNN-RN-2026 Report Date_ May 27, 2026.pdf` → **SKIPPED** by filename pattern (prior-underwriting report)
  5. `Credit Score - Ryan Glynn.pdf` → fetched, parsed via mupdf-text
  6. `Credit Score - Natalia Glynn.pdf` → fetched, parsed via mupdf-text

Sanity checks pass (attachments present, applicant names in title). No
hard-stop conditions fire. Aster proceeds without confirming the task
name back to the assistant.

## Phase 2: Extract data per applicant (silent)

**Natalia Glynn**
- Source: Independent contractor physician income (Natalia Glynn MD INC, billed at PMC Escondido via STATHealth)
- Calculation: gig rule per SCREENING_CRITERIA.md self-employed default
  - December 2025 total compensation: $16,380.90
  - January 2026 total compensation: $15,196.56
  - 2-month average: $15,788.73
  - 70% gig rule: $11,052.11/month qualifying
- Equifax FICO from credit report: 760
- No adverse items, no bankruptcy, no evictions, no landlord debt.

**Ryan Glynn**
- Source: POI rendered to PNG (scanned). Vision-read the rendered pages to confirm paystubs from Tulane offer letter showing $66,294 annual base.
- Calculation: W-2 rule, 2-month paystub average
  - Monthly: $5,524.50
- Equifax FICO from credit report: 761
- No adverse items, no bankruptcy, no evictions, no landlord debt.

Criminal background and sex-offender sections on both On-Site credit
reports show `Pending`. Aster silently skips these (Seattle Fair Chance
Housing). They are not mentioned in any list.

## Phase 3: Compute totals + apply tier criteria (silent)

- Total household income: $11,052.11 + $5,524.50 = **$16,576.61/month**
- Median credit score: (761 + 760) / 2 = **760.5**

Auto-denial checks: all clear.

Per-tier max approved rent (income ÷ multiplier):
- Lenient (2.0x): $16,576.61 / 2.0 = **$8,288/month**
- Standard (2.5x): $16,576.61 / 2.5 = **$6,631/month**
- Stringent (3.0x): $16,576.61 / 3.0 = **$5,526/month**

Credit 760.5 is well above all three tier minimums (600 / 650 / 700);
no co-signer needed at any tier.

## Phase 4: Generate the draft report (silent)

Aster builds the full report per TEMPLATE.md. The Manager Review
block at the top contains a single combined list of judgment flags
and data integrity flags:
- Natalia's income is contractor/1099 and was computed under the gig
  rule (70%). If the target property's rent exceeds the Standard-tier
  max ($6,631), request prior-year federal tax return per the
  self-employment escalation in SCREENING_CRITERIA.md.
- Ryan's role at Tulane is less than 2 months old; recent-job-change
  trigger.
- Multi-state address history likely (Natalia's POI shows San Diego,
  CA; application is for Bellevue, WA).
- Skipped one prior-underwriting report PDF by filename pattern
  (transition policy).

Assistant Notes for Manager: placeholder pending step 5.

## Phase 5: Show the draft and ask once

Aster prints the complete draft report in chat, ending with:

> **"Anything you want me to add to the Assistant Notes for Manager
> section before I post? Reply 'no' to ship as-is, or paste your notes."**

The assistant replies:

> "Add a note that we verified Ryan's offer letter from Tulane by phone
> with HR on 2026-05-28, confirmed by CS."

## Phase 6: Ship to Asana and hand off

Aster inserts the assistant's note verbatim into the Assistant Notes
for Manager section, then posts a comment on the same Asana task
(`1215182714098623`):

```
READY FOR MANAGER REVIEW

# SAGAREUS PROPERTY MANAGEMENT
## Applicant Screening Summary
Completed on May 30, 2026 · Report ID 30022

## Manager Review
- Natalia's income is contractor/1099, computed under the gig rule (70%) ...
- Ryan's role at Tulane is less than 2 months old ...
- Multi-state address history likely ...
- Skipped one prior-underwriting report PDF by filename pattern.

## Tier Results
...

## Headline Numbers
...

## Underwriting
...

## Show the Math
...

## Assistant Notes for Manager
Ryan's offer letter from Tulane verified by phone with HR on 2026-05-28
by CS.

## Notices
...
```

Aster returns one line to the assistant:

> Posted. Approved up to $8,288/month at Lenient, $6,631/month at Standard,
> $5,526/month at Stringent.

No follow-up email is drafted, no notifications fire.
