---
title: "CS // Resident Vacated Before Lease End"
service_line: lease up
sop_owner: brittany@sagareus.com
status: active
last_reviewed: 2026-05-01
visibility_tier: ic
version: 1
tags: [customer-service, cs, resident-relations-2.0, asana, early-termination]
created_but_never_updated: false
---
:::danger
**This is NOT an Early Termination or Notice to Vacate.** The resident has physically vacated (or plans to vacate) before the lease end date, but the lease remains active. No early termination fee applies — the resident is still liable for rent through the original lease end date. For lease breaks with early termination fees, see [CS // Lease Break — Early Termination](../premove out/cs-lease-break-early-termination.md). For all notice to vacate scenarios, see [Notice to Vacate Scenarios](../../docs/section-indexes/sops-2-notice-to-vacate-scenarios.md).

:::

> **Situation:** Resident reaches out to notify that they have already moved out or plan to move out before the end of their current lease. They are not requesting to break the lease — they are informing us the unit is or will be vacant early.


---

## Key Points

* **No early termination fee** — The resident is not breaking the lease. The lease remains active through the original end date.
* **Rent still due through lease end** — The resident is liable for rent through the original lease end date per their lease agreement.
* **Thank them for early notification** — Early notice allows us to begin turn-over prep sooner and reduce vacancy between tenants.
* **Update move-out date in Asana** — The actual move-out date must be updated across all related Leasing 3.0 tasks so downstream workflows start from the correct date.


---

## Response — Already Vacated

Use when the resident has already moved out and is notifying after the fact.

> **Re: \[Original Subject\]**
>
> Hi \[Resident Name\],
>
> Thank you for letting us know — we appreciate the notification.
>
> We've noted your move-out. Our team will be in touch shortly to coordinate next steps.
>
> As a reminder, your lease runs through **\[Lease End Date\]**, and rent remains due through that date per your lease agreement.
>
> To ensure timely deposit return, [please submit your forwarding address here.](https://docs.google.com/forms/d/e/1FAIpQLSdDZBjXMh0KQLWy38NBIJsfrVv3F_bGxdvPj5A2uybbZ9-TEw/viewform?usp=header)
>
> Deposits are returned within 30 days of move-out.
>
>
> Thank you,


---

## Response — Planning to Vacate Soon

Use when the resident is notifying in advance that they plan to move out before the lease end date.

> **Re: \[Original Subject\]**
>
> Hi \[Resident Name\],
>
> Thank you for the early notification — we appreciate you letting us know ahead of time.
>
> We've noted your planned move-out. Our team will be in touch to coordinate next steps as your move-out date approaches.
>
> As a reminder, your lease runs through **\[Lease End Date\]**, and rent remains due through that date per your lease agreement.
>
> To ensure timely deposit return, [please submit your forwarding address here.](https://docs.google.com/forms/d/e/1FAIpQLSdDZBjXMh0KQLWy38NBIJsfrVv3F_bGxdvPj5A2uybbZ9-TEw/viewform?usp=header)
>
> Deposits are returned within 30 days of move-out.
>
> Thank you,


---

## Action


1. **Check Asana** for an existing "Leasing 3.0 | \[Address\]" task
2. **If Leasing 3.0 task EXISTS:**
   * Update the **Move-Out Date** custom field to the resident's actual move-out date on the following tasks:
     * Leasing 3.0 (parent task)
     * Pre Move-out
     * Move-out
     * Turn Over
     * Process Deposit
     * LU
   * Add a comment on the parent task with context (screenshot/copy of the resident's email)
   * Update Move-out task due date to today so leasing agent is notified
3. **If NO Leasing 3.0 task exists:**
   * Escalate to [Renewal & Rent Increase Coordinator](../../docs/role-profiles/renewal-rent-increase-coordinator.md) — the lease may not have been set up for move-out processing yet


---

### Example Resident Questions

* "The apartment is now empty and I'm fully moved out"
* "I'm planning to leave the key and the unit empty this weekend"
* "Wanted to let you know I've vacated the unit early"
* "I've already moved everything out — how do I return the keys?"
* "I took a video of the place before I left, the unit is empty"
