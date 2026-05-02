---
title: Utilities // Utility Pass Through Audit
service_line: utilities
sop_owner: brittany@sagareus.com
status: active
last_reviewed: 2026-05-01
visibility_tier: ic
version: 1
tags: [utilities, pass-through]
created_but_never_updated: false
---

> **Situation:** A utility pass through audit is needed — triggered by a Resident inquiry, move-out, owner request, or flat fee renegotiation. The audit compiles ledger data and supporting bills into a reviewable format.


---

## Key Points

* **Triggers** — Resident inquires about multiple pass throughs, Resident is moving out, owner requests an audit, or flat fee renegotiation requires historical data
* **Asana task template** — Use the Utility Pass Through Audit template in the Finance & Office project
* **Audit spreadsheet** — [Utility Audit Spreadsheet Template](https://docs.google.com/spreadsheets/d/1rWLTFUl8htA2_pxsXOZ-X0WOELmX7-Va_Eze5WnX0vU/edit?usp=sharing)
* **Pro-ration tool** — [Bill Input V1 Tool](https://drive.google.com/file/d/1NI3Lw6fFbkPtwXGl3bDjxlCwObL7IS6m/view?usp=drive_link) for calculating prorated amounts
* **Resident statement report** — [Resident Statement](https://sagareus.managebuilding.com/manager/app/reports/Residents/TenantStatement)


---

## Procedure

### A. Set Up Audit Task


1. **Add the Resident Ledger Link** to the Asana task body.
2. **Attach the latest lease and renewal** to the task and update the pass through rule in the task body.

### B. Create Audit Spreadsheet


3. **Create a Google Drive file** titled "Utility Audit // [Property Address]" with sharing set to "Anyone with the link can view."
4. **Duplicate the** [**Utility Audit Spreadsheet Template**](https://docs.google.com/spreadsheets/d/1rWLTFUl8htA2_pxsXOZ-X0WOELmX7-Va_Eze5WnX0vU/edit?usp=sharing) and add it to the file.
5. **Add the spreadsheet link** to the Asana task.

### C. Populate from Ledger


6. **Navigate to the Resident ledger** and filter by Accounts.
7. **Export the ledger** via Report → [Resident Statement](https://sagareus.managebuilding.com/manager/app/reports/Residents/TenantStatement). Set property, start date, and end date to match the lease. Export as spreadsheet or use Ledger by Account view.
8. **Copy utility entries** into the Audit spreadsheet.
9. **Download and upload** all supporting utility bills to the Google Drive file.

### D. Verify


10. **Any missing pass throughs?** All pass throughs should have continuous service periods with no gaps.
    * If missing: check if the bill exists in Buildium. If so, add to the Resident's ledger.
    * Memo format: `[Utility] // [Start Date] to [End Date] // [Percentage]% pass through`
11. **Any prorated first or last pass through?**
    * Use the [Bill Input V1 Tool](https://drive.google.com/file/d/1NI3Lw6fFbkPtwXGl3bDjxlCwObL7IS6m/view?usp=drive_link) to calculate.
    * If Resident is moving out, estimate the final pass through: $/day × number of days in the final service period.
    * Memo format: `[Utility] // [Start Date] to [End Date] // [Percentage]% estimated passed through`

### E. Debrief Resident (if issues found)


12. **Create a shareable Google Drive folder** for the audit materials, then send the appropriate template.

## Email Template — Missed Pass Through (Under 3 Months)

> **Subject:** Utility Pass Through Ledger Update
>
> Hi [Resident Name],
>
> During a recent ledger audit, we identified several utility pass throughs that were not added to your ledger.
>
> Backing Bills: [Google Drive Link]
>
> - [Pass Through 1 Memo]: $[Amount]
> - [Pass Through 2 Memo]: $[Amount]
>
> We apologize for the inconvenience. You will not be penalized for the outstanding balance, and we can accommodate a payment plan that works for you.
>
> Thank you,

## Email Template — Missed Pass Through (Over 3 Months)

> **Subject:** Utility Pass Through Ledger Update
>
> Hi [Resident Name],
>
> During a recent ledger audit, we identified several utility pass throughs that were not added to your ledger.
>
> Backing Bills: [Google Drive Link]
>
> - [Pass Through 1 Memo]: $[Amount]
> - [Pass Through 2 Memo]: $[Amount]
>
> We apologize for the late discovery that led to the unexpected expense: Sagareus shall reimburse you 20% of the total outstanding balance. You will not be penalized for the outstanding balance, and we can accommodate a payment plan that works for you.
>
> Thank you,
