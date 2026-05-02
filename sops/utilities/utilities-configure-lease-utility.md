---
title: Utilities // Configure Lease Utility
service_line: utilities
sop_owner: brittany@sagareus.com
status: active
last_reviewed: 2026-05-01
visibility_tier: ic
version: 1
tags: [utilities, utility-onboarding, pass-through]
created_but_never_updated: false
---

> **Situation:** A new lease is being set up and the utility configuration needs to be determined — which utilities the tenant pays directly vs. which are included in the flat fee.


---

## Key Points

* **Per-utility determination** — Each utility is evaluated independently based on whether the tenant can hold their own account
* **Flat fee scope** — Covers only utilities where the tenant cannot receive bills directly (typically water/sewer/garbage on shared or master meters)
* **Separately metered = tenant-responsible** — If a utility has a dedicated meter for the unit, the tenant sets up their own account
* **Verification required** — Contact the utility company to confirm; do not assume based on past properties or neighboring units
* **Flat fee is a rent component** — Disclosed in the listing and lease, charged monthly as part of rent. No monthly true-ups based on usage.
* **No mixed mode** — A property cannot have both pass-through AND flat fee utilities managed by Sagareus.
* **No Lease Override for new leases** — Lease Override (custom % pass-through per lease) is legacy support only for existing leases.


---

## Decision Logic

For each utility listed in the lease addendum (Electricity, Natural Gas, Water, Sewer/Septic, Garbage, Oil, Internet):

### Can the tenant set up their own account?

**Contact the utility company** and ask: *"Can the tenant set up their own account and receive bills directly at this address?"*

| Answer | Configuration | What Happens |
|--------|---------------|--------------|
| **Yes** — tenant can get their own account | **Tenant Account** | Tenant sets up account within 7 days of lease start. |
| **No** — shared meter, master meter, or no individual billing | **Sagareus Account** | Sagareus pays the bill. Choose 100% Pass Through or Flat Fee (see below). |

### If Sagareus Account — Pass Through or Flat Fee?

| Scenario | Configuration |
|----------|---------------|
| All Sagareus-managed utilities have dedicated meters per unit (no shared meters) | **Sagareus Account — 100% Pass Through** |
| Any Sagareus-managed utility has a shared or master meter | **Sagareus Account — Flat Fee** for ALL Sagareus-managed utilities |


:::warning
**Do not use Lease Override for new leases.** Some existing properties use a "Lease Override" automation mode where each lease has a custom pass-through percentage (e.g., 50%). This is legacy support only.

:::


---

## Validation Rule


:::warning
**Conflict = any property where BOTH "Sagareus — Pass-Through" AND "Sagareus — Flat Fee" exist across its utilities.**

If detected: convert the pass-through utility into flat fee (roll it into the flat fee amount). The automation does not support dual mode — a property is either 100% pass through OR flat fee.

:::


---

## Calculating the Flat Fee

The flat fee covers **all utilities that cannot be billed directly to the tenant.** To calculate:


1. Pull the **prior 12 months** of utility bills for each included utility
2. Sum the total cost across all included utilities for the 12-month period
3. Divide by 12 to get the **monthly average**
4. For multi-unit properties, allocate proportionally by bedroom count
5. Round down to the nearest **$5 increment**

### When to recalculate

* At **lease renewal** — review against updated 12-month actuals
* At **unit turnover** — recalculate for the new lease


---

## Document the Configuration


1. Update the **utility table in the lease**
2. Enter the **flat fee amount** in the lease (if applicable)
3. Update the per-utility fields in [Property Settings](https://app.asana.com/0/1211134623744906)
4. Set the **Auto Utility Processing Mode** for pass-through automation


---

## Related

* [Onboarding](../property onboarding/8-utility-onboarding.md)
* [Tenant Account Setup](utilities-tenant-account-setup.md)
* [Flat Fee Cost Recovery](/doc/utilities-flat-fee-cost-recovery-WparbiZHbZ)<!-- unresolved: doc not migrated -->
* [Pass Through Automation](utilities-pass-through-automation.md)
* [Owner Inquires About Flat Fee vs. Pass Through](utilities-owner-inquires-about-flat-fee-vs-pass-through.md)
