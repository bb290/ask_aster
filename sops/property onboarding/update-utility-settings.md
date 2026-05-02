---
title: "Update | Utility Settings"
service_line: property onboarding
sop_owner: brittany@sagareus.com
status: active
last_reviewed: 2026-05-01
visibility_tier: ic
version: 1
tags: [property-onboarding, property-settings, asana, automation]
created_but_never_updated: false
---

:::info
**Shared "how-to" doc.** This document is the single source of truth for the `Update | Utility Settings` action across SOPs. Linked from [Onboarding Asana SOP](../../docs/section-indexes/sops-2-onboarding-asana-sop.md), Pre Move-Out, and any other workflow that requires configuring utility billing for a property or unit.

:::

## What This Covers

Utility Settings configure how each utility is billed — pass-through to tenant, flat fee, paid directly by tenant, etc. These fields drive the Pass Through Automation and lease utility configuration.

See [Property Settings — Field Reference → Utility Fields](../../docs/section-indexes/sops-2-property-settings.md) for field-by-field definitions.


---

## Where to Work

* **Project:** [Property Settings](https://app.asana.com/1/706990140225747/project/1211134623744906)
* **Task:** `Settings // <Address>` for property-level fields
* **Unit subtasks:** For per-unit billing mode (multi-unit). For single-unit properties, both levels live on the parent task.


---

## Fields to Configure

### Property-Level

* **Auto Utility Processing Mode** — how charges are billed (pass-through, flat fee, none)
* **Utilities** — provider names and account numbers

### Unit-Level (per-unit billing configuration)

* **Utilities - Electricity**
* **Utilities - Gas**
* **Utilities - Water**
* **Utilities - Sewer / Storm Drain**
* **Utilities - Garbage**
* **Utilities - Oil**
* **Utilities - Internet**


---

## When This Runs

* **New Client Onboarding** — initial utility billing configuration for every unit.
* **Pre Move-Out (every vacancy)** — re-verify utility billing before listing; update if provider or rate structure has changed.
* **Anytime** a utility provider changes or the billing model shifts (e.g., switching from flat fee to pass-through).


---

## Related Procedures

* [Utilities // Pass Through Automation](../utilities/utilities-pass-through-automation.md) — how pass-through charges are calculated and applied to ledgers
* [Utilities // Configure Lease Utility](../utilities/utilities-configure-lease-utility.md) — how utility terms are written into the lease at signing


---

## Related

* [Property Settings — Field Reference](../../docs/section-indexes/sops-2-property-settings.md) — full field definitions and categories
* [Update | Client Relations Settings](#) — client/owner-level fields
* [Update | Property Settings](#) — maintenance & compliance fields
