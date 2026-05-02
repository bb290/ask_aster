---
title: "1 — Update | move_out_date metric"
service_line: move out
sop_owner: brittany@sagareus.com
status: active
last_reviewed: 2026-05-01
visibility_tier: ic
version: 1
tags: [move-out, abandonment]
created_but_never_updated: false
---

**When to Use This Page**

> *Use this page if:*
>
> * *you've been assigned the* `*Update | move_out_date metric*` *subtask*
> * *a resident has given notice, a vacant property is being onboarded, or a resident has abandoned*
> * *the resident is asking to change or extend a previously set move-out date*

**Situation Summary**

The `move_out_date` custom field on the parent `Leasing | <address>` task is the trigger for every downstream Move Out, Turn Over, Lease Up, and Security Deposit workflow. It also feeds Leasing Dashboard KPIs (vacancy days, lease-up time). Record it as soon as notice is received.


---

## Procedure


1. Open the parent `Leasing | <address>` task in Asana.
2. Set the `move_out_date` custom field to the confirmed move-out date from the resident's notice.
3. Mark this subtask complete.


---

## Date Changes

If the resident later asks for more time or wants to change the date, follow:

* [Move Out // Tenant Needs More Time or Wants to Change Their Move-Out Date](move-out-tenant-needs-more-time-or-wants-to-change-their-move-out-date.md)

Do not silently edit the date without reading that doc first — the change may require owner notification and has downstream scheduling impact.


---

## Reference

* Parent lifecycle doc: [Move Out](../../docs/section-indexes/sops-2-move-out.md)
