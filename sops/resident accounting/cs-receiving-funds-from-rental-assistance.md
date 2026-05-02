---
title: "CS // Receiving Funds from Rental Assistance"
service_line: resident accounting
sop_owner: brittany@sagareus.com
status: active
last_reviewed: 2026-05-01
visibility_tier: ic
version: 1
tags: [customer-service, cs, resident-relations-2.0, section-8, voucher, housing-authority, rent-assistance, nonprofit, unit-transfer]
created_but_never_updated: false
---
[Office Manager](../../docs/role-profiles/office-manager.md) coordinates all Non Profit / Section 8 funds. Office Manager is tasked with providing necessary information & determining if the rental assistance should be accepted or rejected. Before making this determination, the Office Manager needs to confirm the amount the agency will provide.


---

## When a Resident is Approved Rental Assistance

The agency will reach out to obtain documentation required for their program. Required documents are typically all or some of the following:

* Completion of Intake or other verification Form
* Current Lease Ledger
* Copy of Lease
* Notice to Vacate
* Sagareus W-9
* Sagareus Payment Details


---

## When Request is Received

### Response

> Attached, please find requested documents.
>
> Can you please confirm the total amount & estimated date we should expect payment?

### Action


1. Locate existing Collections task, if available
2. **If present** → Resident is past due → Further investigation needed before accepting rental assistance
   * Transfer information to main Collections task & close "Non-Profit Requesting Docs" Task
   * Assign Collection task to Office Manager (self)
   * Due Date: 2 days
   * Status Field: Section 8 / Agency
3. **If not present** → Resident is not past due → We will accept rental assistance
   * Update Current "Non-Profit Requesting Docs" Task
   * Due Date: 2 days
   * Status Field: Section 8 / Agency
4. Confirm receipt of agency response; note comments; update due date


---

## Follow Up — Once Total Assistance Amount is Confirmed

**Will the total amount cover 100% (or more) of the outstanding balance?**

### If Yes — Accept Rental Assistance

* Confirm receipt of agency response
* Note comments
* Update due date; Follow up until funds received

### If No

#### Response

> Thank you for confirming; This account has already started eviction proceedings and the amount pledged does not cover the total outstanding balance.
>
> We cannot accept less than \[Full Outstanding Balance\] at this time. Please advise if your agency can provide this level of assistance to stop eviction.

**If agency can cover full amount** → Accept rental assistance. Confirm receipt, note comments, update due date; follow up until funds received.

**If agency cannot cover full amount** → Reject rental assistance.

#### Rejection Response

> Thank you for confirming; Sagareus must reject this partial payment to maintain the integrity of the eviction proceedings.

* Document all communication per usual
* Assign task back to [Resident Account Manager](../../docs/role-profiles/resident-account-manager.md)
* Continue with Eviction


---

## Once Funds Are Received

* Update task with notes
* Assign to [Resident Account Manager](../../docs/role-profiles/resident-account-manager.md)
* Cancel eviction
