---
title: "8 — Utility Onboarding"
service_line: property onboarding
sop_owner: brittany@sagareus.com
status: active
last_reviewed: 2026-05-01
visibility_tier: ic
version: 1
tags: [property-onboarding, step-8, asana, onboarding-2.0, utility-onboarding, pm-transfer]
created_but_never_updated: false
---

:::info
Part of [Onboarding Asana SOP](../../docs/section-indexes/sops-2-onboarding-asana-sop.md) — step 8 of 29.

:::

## When This Runs

A new property is being onboarded and utility accounts need to be transferred to Sagareus management — or a property transfer requires re-establishing utility account access. Start this step as early as possible in Initial Onboarding; utility transfers are often the long pole.


---

## Key Points

* **Every property, every utility** — Identify all utilities serving the property from the [owner onboarding document](https://drive.google.com/drive/folders/1kpcQqnwczmAqZ8fKkgkAAHdfYvnpJbX_)
* **Authorization varies by company** — Every utility has a different setup process. Some can be done online, others require a phone call. Always check the [Utility Company Playbook](../utilities/utility-company-playbook.md) first.
* **Four critical settings** — Every account must have: (1) Sagareus as authorized party, (2) auto-pay disabled, (3) e-billing disabled, (4) paper bills mailed to Sagareus office
* **Always confirm** — Follow up one week later to verify everything was applied. Timing and method are documented in the [Utility Company Playbook](../utilities/utility-company-playbook.md).
* **Water stays in owner's name** — Water accounts are typically non-transferable. Sagareus manages billing while the account remains under the owner.


---

## Procedure

### 1. Remove Irrelevant Utilities from Template

Review the [owner onboarding document](https://drive.google.com/drive/folders/1kpcQqnwczmAqZ8fKkgkAAHdfYvnpJbX_) to identify which utilities serve the property. Remove any utility sections from the Asana template that don't apply (e.g., if the property has no gas service, remove the Gas section).

### 2. Fill Out the Template

Work through each utility section in the template and fill in all fields:

**Per-Utility Details** (fill out for each applicable utility):

* Provider
* Number of meters
* Take over date
* Paperless billing disabled: Yes / No
* Auto payment disabled: Yes / No
* Does meter match units: Yes / No
* Account number(s) per unit

**Garbage-specific fields:** Can resident manage? Bin sizes (garbage, recycle, food/yard waste), pick-up date.

**Optional utilities:** Septic (vendor, last pump date), Oil (vendor, last refill date).

### 3. Existing Lease Audit

If there are existing leases on the property:

* Read each lease and determine what the utility terms are
* Determine whether automated pass-through needs to be enabled
* See [Configure Lease Utility](../utilities/utilities-configure-lease-utility.md) for the decision logic on pass-through vs. flat fee
* See [Pass Through Automation](../utilities/utilities-pass-through-automation.md) for how to enable automated billing

### 4. Update Property Settings

Once the template is complete:


1. **Copy the entire completed template** to the **Utilities** field on the property's task in [Property Settings](https://app.asana.com/0/1211134623744906)
2. **Set the automated pass-through settings** — configure the Auto Utility Processing Mode and any lease-level overrides. See [Pass Through Automation](../utilities/utilities-pass-through-automation.md) for details.
3. **Fill out the per-utility lease specification fields** in Property Settings:

| Field | Options |
|-------|---------|
| Utilities — Electricity | None / Tenant Account / Sagareus Account — 100% Pass Through / Sagareus Account — Flat Fee |
| Utilities — Gas | None / Tenant Account / Sagareus Account — 100% Pass Through / Sagareus Account — Flat Fee |
| Utilities — Water | None / Tenant Account / Sagareus Account — 100% Pass Through / Sagareus Account — Flat Fee |
| Utilities — Sewer / Storm Drain | None / Tenant Account / Sagareus Account — 100% Pass Through / Sagareus Account — Flat Fee |
| Utilities — Garbage | None / Tenant Account / Sagareus Account — 100% Pass Through / Sagareus Account — Flat Fee |
| Utilities — Oil | None / Tenant Account / Sagareus Account — 100% Pass Through / Sagareus Account — Flat Fee |
| Utilities — Internet | None / Tenant Account / Sagareus Account — 100% Pass Through / Sagareus Account — Flat Fee |

Determine the correct option for each utility using the [Configure Lease Utility](../utilities/utilities-configure-lease-utility.md) decision logic.

### 5. Contact the Utility Company

For each utility that needs to be transferred:


1. Look up the utility company in the [Utility Company Playbook](../utilities/utility-company-playbook.md) for contact information and setup instructions
2. Follow the playbook's instructions for that specific company — each utility has a different process (some are online, some require a phone call, some need specific forms)
3. Document completion in the Asana template as you go

### 6. Follow Up

Follow up with each utility company per the timeline specified in the [Utility Company Playbook](../utilities/utility-company-playbook.md) (typically one week) to confirm all settings are applied correctly.


---

## Best Practices

* **Auto-pay must be off** — Owner auto-payments cause double payments, overdrafts, or confusion
* **Paper bills only** — E-billing creates delays and missed bills
* Document every call (date, time, rep name, what was requested/confirmed)
* If a utility refuses to disable auto-pay or change mailing address, escalate immediately and note workaround (e.g., manual payments, owner coordination)
