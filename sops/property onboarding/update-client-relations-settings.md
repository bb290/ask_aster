---
title: "Update | Client Relations Settings"
service_line: property onboarding
sop_owner: brittany@sagareus.com
status: active
last_reviewed: 2026-05-01
visibility_tier: ic
version: 1
tags: [property-onboarding, property-settings, buildium, asana]
created_but_never_updated: false
---

:::info
**Shared "how-to" doc.** This document is the single source of truth for the `Update | Client Relations Settings` action across SOPs. Linked from [Onboarding Asana SOP](../../docs/section-indexes/sops-2-onboarding-asana-sop.md), Turn Over, and any other workflow that requires configuring client-level settings.

:::

## What This Covers

Client Relations settings are **property-level** fields that describe the business relationship between Sagareus and the owner: fees, communication preferences, tax handling. They live on the **Client Relations 2.0** project (one task per property).

See [Property Settings — Field Reference](../../docs/section-indexes/sops-2-property-settings.md#client-settings-fields) for field-by-field definitions.


---

## Where to Work

* **Project:** [Client Relations 2.0](https://app.asana.com/1/706990140225747/project/1208917007356847)
* **Task:** One per property, named `(CLIENT) <Address> / <Owner Name>` or `(PROPERTY) <Address> / <Owner Name>` (for additional properties on an existing client)


---

## Fields to Configure


:::info
Source data: Onboarding Form + PM Agreement.

:::

| Field | Source |
|-------|--------|
| **PMA Signed** | Date the PM Agreement was signed |
| **Referral** | Referring broker name + email, if applicable |
| **Communication Settings** | From Onboarding Form — Maintenance Dispatch, Renewal + N2V, Leasing, Turn Over preferences |
| **Mgmt Fee** | From PM Agreement |
| **Lease Up Fee** | From PM Agreement |
| **Renewal Fee** | From PM Agreement |
| **Sagareus Managed Turnover** | Yes or No |
| **Property Tax** | Paid by Sagareus or Paid by Owner |


---

## When This Runs

* **New Client Onboarding** — during Initial Onboarding, after the property is added to Buildium.
* **Adding Property to Existing Client** — same fields, same task template.
* **Any time** client terms change (fee update, communication preference change, turnover handling change).


---

## Related

* [Property Settings — Field Reference](../../docs/section-indexes/sops-2-property-settings.md) — full field definitions and categories
* [Update | Property Settings](update-property-settings.md) — maintenance & compliance fields
* [Update | Utility Settings](update-utility-settings.md) — utility billing fields
* [Onboarding Asana SOP](../../docs/section-indexes/sops-2-onboarding-asana-sop.md) — the workflow that triggers the initial population
