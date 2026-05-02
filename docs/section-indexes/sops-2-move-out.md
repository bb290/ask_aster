---
title: "Move Out"
type: section-index
sop_owner: brittany@sagareus.com
status: active
last_reviewed: 2026-05-01
visibility_tier: ic
version: 1
tags: [section-index, move-out]
created_but_never_updated: false
---

**When to Use This Page**

> *Use this page if:*
>
> * *you've been assigned a move-out task*
> * *you need to know the full move-out process start to finish*
> * *you're not sure what subtasks to complete or when*
> * *you're installing a lockbox or conducting an inspection for the first time*

**Situation Summary**

Move-outs are assigned when a resident gives notice, a vacant property is onboarded, or a resident abandons a property. This is a high-visibility process — the move-out inspection triggers TurnOver, Lease Up, and Security Deposit workflows, and must be completed within 48 hours of the move-out date. Leasing Agents are the primary staff assigned; Operations Team supports when needed for workload balance.


---

## Subtask Schedule

| Subtask | When Due |
|---------|----------|
| Update `move_out_date` metric | When notice is received |
| Calendar block — keybox install & inspection | \~14 days before move-out |
| Text outgoing resident/owner with schedule | \~14 days before move-out |
| Install keybox; confirm mailbox location | \~7 days before move-out |
| Update 1Password with keybox code | \~7 days before move-out |
| Complete Move-Out Inspection | Move-out date |
| Record & upload Move-Out Video | Move-out date |
| Change lockbox code; update 1Password | Move-out date |
| Confirm mailbox key present and working | Move-out date |


---

## Policies

* **Lockbox codes.** Tenant code is 2001; internal codes (1994, 3119) must never be shared with tenants. See [Key Management](../../sops/maintenance/key-management.md) for the canonical code rules and rotation schedule.
* **Missing keys at move-out.** If we communicated properly and the resident still didn't leave the key, the cost comes out of their security deposit. If we failed to communicate, that's a Sagareus expense. Communicate.
* **Missing mailbox key.** Do not dispatch the locksmith yourself — reassign the subtask to the Turn Over Coordinator (Bart) so the cost can be properly deducted from the security deposit.
* **Inspection turnaround.** The Move-Out Inspection must be completed within 48 hours of the move-out date and emailed to leasing@sagareus.com the same day it's completed.


---

## Reference

* [Key Management](../../sops/maintenance/key-management.md) — canonical lockbox code rules (tenant vs internal)
* [Property Settings](sops-2-property-settings.md) — Mailbox field definition used in step 4
* [Move Out // Tenant Needs More Time or Wants to Change Their Move-Out Date](../../sops/move out/move-out-tenant-needs-more-time-or-wants-to-change-their-move-out-date.md) — date-change playbook


---

## Move Out Asana SOP

Follow the [Move Out Asana SOP](../../sops/move out/move-out-asana-sop.md) for step-by-step procedures. Each step maps to a subtask on the parent `Leasing | <address>` task.


1. [1 — Update | move_out_date metric](/doc/1-update-move_out_date-metric-Uzf1YZ3Q39)
2. [2 — Text | Tenant - Schedule Move Out](../../sops/move out/2-text-tenant-schedule-move-out.md)
3. [3 — Install | Key box on property](../../sops/move out/3-install-key-box-on-property.md)
4. [4 — Confirm | Mailbox Location](../../sops/move out/4-confirm-mailbox-location.md)
5. [5 — Conduct | Move-out inspection & share report](../../sops/move out/5-conduct-move-out-inspection-share-report.md)
6. [6 — Record | Move-out video](../../sops/move out/6-record-move-out-video.md)
7. [7 — Change | Lockbox code & Update 1Password](../../sops/move out/7-change-lockbox-code-update-1password.md)
8. [8 — Confirm | Mailbox Key Available & Works](../../sops/move out/8-confirm-mailbox-key-available-works.md)


---

## Required Documentation

* Move-Out Inspection submitted via Inspector App to [leasing@sagareus.com](mailto:leasing@sagareus.com)
* Move-Out Video uploaded to link in subtask
* 1Password updated with lockbox code changes
