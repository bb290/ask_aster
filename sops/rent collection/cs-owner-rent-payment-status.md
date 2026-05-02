---
title: "CS // Owner Rent Payment Status"
service_line: rent collection
sop_owner: brittany@sagareus.com
status: active
last_reviewed: 2026-05-01
visibility_tier: ic
version: 1
tags: [customer-service, cs, resident-relations-2.0, buildium, asana]
created_but_never_updated: false
---
> **Situation:** Owner asks about the rent payment status of their tenant.


---

## Key Points

* **Attach current ledger** — Pull the most current ledger from Buildium and attach to the response
* **If paid in full** — No further action needed
* **If outstanding balance** — Assign to [Resident Account Manager](../../docs/role-profiles/resident-account-manager.md) for follow-up and status update


---

## Response

> Hi \[Owner's Name\],
>
> Thank you for reaching out! I've received your inquiry regarding \[Property Unit\] rent payments. I've attached the most current ledger for your review, which outlines all rent charges and payments to date.
>
> The most recent payment of \[$XXX\] was made on \[Date\]; ==\[however, the unit still carries an outstanding balance.\]== OR ==\[The account is paid in full.\]==
>
> ==OPTIONAL \[I've assigned this matter to Verna, our Resident Account Manager, who will follow up and provide a more detailed status update. She will also outline any next steps we're taking to resolve the balance.\]==
>
> Thank you,


:::info
This template contains ==highlighted sections== that are optional or need customization. Review and remove highlighted sections that don't apply before sending.

:::

## Action


1. If the account is paid in full, no further action is needed
2. If account has outstanding balance:


   1. Search for Existing Asana Task
      * Project: Collections — Collection / Property Address Unit #
   2. Create subtask: "Owner Inquiry // Property Address Unit #"
      * Assigned to: [Resident Account Manager](../../docs/role-profiles/resident-account-manager.md)
      * Due: Today
      * Copy / paste or Screenshot Original email + response for context

### Example Owner Questions

* "Has my tenant paid rent?"
* "Is the rent current on my property?"
* "What's the status of the outstanding balance?"
