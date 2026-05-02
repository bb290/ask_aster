---
title: "9 — Charge Renewal Fee"
service_line: renewal & rent increase
sop_owner: brittany@sagareus.com
status: active
last_reviewed: 2026-05-01
visibility_tier: ic
version: 1
tags: [renewal, step-9, mtm, lease-renewal, buildium, automation, client-relations-2.0]
created_but_never_updated: false
---

## Fee Amount

The renewal fee is set **per property** in the [Client Relations 2.0](https://app.asana.com/0/1208917007356847) project. Each property's task has a **Renewal Fee** custom field in one of two formats:

* **Flat amount** — e.g., `$500` — charged as-is
* **Percentage of new rent** — e.g., `15%` — calculated as new total rent x percentage, rounded to nearest dollar


:::info
**Example:** If the renewal fee is `15%` and the new total rent is $2,000 → $2,000 x 15% = **$300**.

:::

To look up or change a property's renewal fee, find the property task in [Client Relations 2.0](https://app.asana.com/0/1208917007356847) and update the "Renewal Fee" field.


---

## When to Charge

| Renewal Type | Charge Fee? |
|--------------|-------------|
| MTM Renewal  | Always      |
| Termed Renewal | Only if lease is renewed |
| Short-term Renewal | First renewal per year only |

* For any short-term lease renewal, charge a renewal fee upon renewal.
* If multiple consecutive short-term renewals occur within the same year, apply the renewal fee only to the **first** renewal.


---

## Properties with $0 Renewal Fee — Notice Servicing Fee

Some properties have a renewal fee set to **$0** (or have no renewal fee configured). For these properties, a **$75 Notice Servicing Fee** is charged instead, but **only** when the renewal notice has actually been served — meaning the field agent has completed the notice servicing task.

### Why this fee exists

The $75 fee covers the cost of **in-person delivery** of the renewal notice to the resident's door plus **certified mailing** of the same notice. These are required steps in the renewal process regardless of whether the owner pays a renewal fee.

### How it works

* If a property **has a renewal fee** (any amount greater than $0) → the normal renewal fee is charged. No additional notice servicing fee applies — the renewal fee already covers it.
* If a property has **$0 or no renewal fee** → a flat **$75 Notice Servicing Fee** is charged after the notice has been served.
* The fee is only triggered once the field agent marks the notice servicing task as complete. If the notice was never served, no fee is charged.

### Summary

| Property has renewal fee? | Notice served? | What gets charged? |
|---------------------------|----------------|--------------------|
| Yes (e.g., $500 or 15%)   | Yes or No      | Renewal fee only   |
| No ($0 or blank)          | Yes            | $75 Notice Servicing Fee |
| No ($0 or blank)          | No             | Nothing            |

For more details on how this billing is handled automatically, see [Automation](renewal-automation.md).


---

## How It Works


1. The `create-renewal-tasks` worker pre-calculates the fee when the renewal task is created
2. The fee amount appears on the renewal task's **Renewal Fee** custom field
3. A **Bill Owner** subtask is auto-created with the fee amount in the [Bill Owner](https://app.asana.com/0/1213106397739874) project
4. Asana Bot processes the Bill Owner subtask and creates the bill in Buildium (GL: Renewal Fee, Vendor: Sagareus, Memo: "Renewal fee")

No manual calculation or Buildium entry is needed — verify the fee amount on the task is correct, then assign the Bill Owner subtask to Asana Bot.
