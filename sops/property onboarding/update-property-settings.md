---
title: "Update | Property Settings"
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
**Shared "how-to" doc.** This document is the single source of truth for the `Update | Property Settings` action across SOPs. Linked from [Onboarding Asana SOP](../../docs/section-indexes/sops-2-onboarding-asana-sop.md), the Turn Over template subtask, and any other workflow that requires configuring property or unit maintenance/compliance fields.

:::

## What This Covers

Property Settings are **maintenance and compliance** fields scoped at the property or unit level: roof cleaning, pest control, HVAC servicing, appliances, heating type, parking, etc. These fields power maintenance scheduling and compliance tracking.

Utility fields are tracked separately — see [Update | Utility Settings](update-utility-settings.md).

See [Property Settings — Field Reference](../../docs/section-indexes/sops-2-property-settings.md) for field-by-field definitions and categories.


---

## Where to Work

* **Project:** [Property Settings](https://app.asana.com/1/706990140225747/project/1211134623744906)
* **Task:** `Settings // <Address>` (one per property, auto-created by sync-settings automation)
* **Unit subtasks:** Multi-unit properties get one subtask per unit (also surfaced in [Unit Settings](https://app.asana.com/1/706990140225747/project/1213032009308835)); single-unit properties use the parent task for both levels.


---

## Fields to Configure

### Property-Level Fields

Tracked on the main property task.

* **Roof Cleaning Completed** — last roof cleaning date
* **Pest Control** — provider and schedule
* **Septic Pump Date** — last septic pump
* **Landscaping Maintenance** — Which vendor, price and frequency
* **Rental Registration Expiration** — when the city registration expires
* **Backflow Testing Date** — last backflow test
* **Billing Settings** — Standard or Custom
* **Owner Preference** — free text for specific owner requests or preferred vendors

### Unit-Level Fields

Tracked on each unit subtask (multi-unit) or the property task (single-unit).

* **HVAC Servicing Completed**
* **Dryer Vent Cleaning Completed**
* **Hot Water Heater Install**
* **Heating Type**
* **HVAC Filter**
* **Annual Inspection Completed**
* **Appliances**
* **Mailbox**
* **EV Charger**
* **Internet Provider**
* **Cooling**
* **Laundry**
* **Parking** *(also tracked at property level — category "All")*
* **Storage** *(also tracked at property level — category "All")*

### Multifamily-Only Fields

Tracked on the main property task, only populated when the property has 2+ units.

* **Common Area Cleaning**
* **Coin Pickup Completed**
* **Multifamily Inspection Date**
* **Fire Inspection Date**
* **Elevator Inspection Date**


---

## When This Runs

* **New Client Onboarding** — initial property + unit data entry.
* **Turn Over (every vacancy)** — refresh unit-level condition and maintenance fields as part of the turn over assessment.
* **Annual Inspection** — post-inspection data refresh.
* **Any time** a unit condition changes materially (new appliance, new heating system, etc.).


---

## Related

* [Property Settings — Field Reference](../../docs/section-indexes/sops-2-property-settings.md) — full field definitions, categories, audit dashboard
* [Update | Client Relations Settings](#) — client/owner-level fields
* [Update | Utility Settings](#) — utility billing fields
