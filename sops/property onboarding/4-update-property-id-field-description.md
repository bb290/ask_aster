---
title: "4 — UPDATE | property_id Field + Description"
service_line: property onboarding
sop_owner: brittany@sagareus.com
status: active
last_reviewed: 2026-05-01
visibility_tier: ic
version: 1
tags: [property-onboarding, step-4, asana, onboarding-2.0, buildium]
created_but_never_updated: true
---

:::info
Part of [Onboarding Asana SOP](../../docs/section-indexes/sops-2-onboarding-asana-sop.md) — step 4 of 29.

:::

## When This Runs

Immediately after the property is created in Buildium. Wiring the Buildium Property ID into Asana is what makes the two systems talk to each other — any further automation (maintenance sync, billing, leasing, Client Relations subtask population) depends on this being set correctly.

## Procedure

Once the property is created in Buildium, copy / paste the Buildium Property ID into the `**property_id**` field on the Asana task.

The `**property_id**` is what allows Buildium & Asana to speak to each other, and what lets Asana populate other tasks based on Client Relations Task settings. This is vitally important to ensure proper data transfer — it informs maintenance, billing, and leasing.

Also update the task description with:

* Owner Name & Contact Info
* Unit Count = Total number of units
