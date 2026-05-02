---
title: Resident Request for Late Fee Refund
service_line: resident accounting
sop_owner: brittany@sagareus.com
status: active
last_reviewed: 2026-05-01
visibility_tier: ic
version: 1
tags: [accounting, finance-office, late-fee, buildium, resident-ledger]
created_but_never_updated: true
---
> **Situation:** Resident requests a refund or removal of late fees, claiming they paid on time or have no outstanding balance.


---

## Key Points

* **Ledger split issue** — Buildium tracks balances per charge category (rent, utilities, pet rent) separately. A payment or credit applied to the wrong category can leave one category unpaid, triggering a late fee even though the total balance is correct.
* **Always check "By Account" view** — Sort the ledger "By Account" instead of by date to see category-level balances.
* **Fix the root cause first** — Correct the payment split before removing late fees.


---

## Procedure


1. Review Resident ledger
2. Click "By Account" view
   * Look for categories with a credit balance alongside categories with an outstanding balance
   * Select line items with credit balance and apply them to line items with outstanding balance using the Edit Transaction feature
3. Return to "By Date" view
   * Delete late fees as applicable
4. Send template email within Buildium to Resident


---

## Email Template — Late Fee Correction

> **Subject: Late Fee Correction // \[Property Address\]**
>
> Hi \[Resident Name\],
>
> Thank you, we appreciate you bringing this matter to our attention. Upon reviewing your ledger, we identified the line item entry error that resulted in the late fees. We have since corrected the error and removed the recent late fees. Should you observe any further discrepancies in the future, please do not hesitate to inform us.
>
> Thank you,

## Email Template — Incorrect Late Fee Correction

> **Subject: Late Fee Correction // \[Property Address\]**
> **Attachment:** Last 3 months ledger
>
> Hi \[Resident Name\],
>
> We identified an issue with our accounting software that resulted in an incorrect late fee being charged to your account. The error has been corrected and the late fee has been removed. We apologize for the inconvenience.
>
> Thank you,
