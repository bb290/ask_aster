---
title: "Renewal // Automation"
service_line: renewal & rent increase
sop_owner: brittany@sagareus.com
status: active
last_reviewed: 2026-05-01
visibility_tier: ic
version: 1
tags: [renewal, automation, notice-servicing, mailing, dashboard, metrics, kpi, deadline]
created_but_never_updated: false
---

The `create-renewal-tasks` worker automates the creation and maintenance of notice servicing and mailing tasks in Asana.


---

## Worker Overview

| Property | Value |
|----------|-------|
| **Command** | `create-renewal-tasks` |
| **Cadence** | Daily at 3:51 AM PST |
| **Data sources** | Buildium API (leases, rent schedules, properties, units, owners) + Asana API (existing renewal tasks, vacating leases) |

## What Gets Updated

The worker creates renewal tasks with subtasks that are **multi-homed** into the [Notice Servicing](https://app.asana.com/1/706990140225747/project/1212998012800658/list/1213034139918485) and [Notice Mailing](https://app.asana.com/1/706990140225747/project/1213206896639105/list/1213209323219174) Asana projects.

### Notice Servicing Fields

| Field | Description |
|-------|-------------|
| Address | Normalized property address from Buildium |
| Deadline | Calculated service deadline based on jurisdiction rules |
| Notice Type | Rent Increase, Renewal, TC 180-day, or TC 90-day |
| Unit ID | Buildium unit identifier |
| Lease ID | Buildium lease identifier |

### Notice Mailing Fields

| Field | Description |
|-------|-------------|
| Address | Normalized property address from Buildium |
| Deadline | Calculated mailing deadline based on jurisdiction rules |

### Idempotency

The worker only populates fields that are currently empty. It will **not** overwrite values that have already been set by staff.

## Analytics

A second worker, `collect-renewal-analytics`, runs daily at 4:27 AM PST and reads from three projects:

* **Renewal & Rent Increase** — pipeline status, rent increase progress, renewal fees
* **Notice Servicing** — pending vs. completed counts and staff-level breakdowns
* **Bill Owner** — completed "Bill Notice Servicing" tasks (assigned to Bot) to compute notice servicing income per renewal

The worker traces the parent chain (Bill Owner task → Notice Servicing task → Renewal task) to attribute NS income to the correct renewal month. These metrics power the [Renewal // Dashboard and Metrics](renewal-dashboard-and-metrics.md).


---

## Notice Servicing Fee — Automatic Billing

When a field agent completes the "Serve Notice" subtask in Asana (marks it done), the system automatically handles billing for the notice servicing fee. Here is how it works:

### When Does the Fee Get Charged?

The fee is charged **only when the notice is actually served** — meaning:

* The notice servicing subtask is marked **complete**
* The subtask is assigned to a **real team member** (a field agent)
* The subtask is **not** assigned to the bot, Carmel, or left unassigned

If the notice is never served (the task is incomplete, unassigned, or assigned to the bot or Carmel), **nothing happens** — no fee is created.

### Which Properties Get Charged?

The fee depends on the **Renewal Fee** setting in Client Relations 2.0 for that property:

| Renewal Fee Setting | What Happens |
|---------------------|--------------|
| **$0** (no renewal fee) | A $75 notice servicing fee **is charged** to the owner |
| **Has a renewal fee** (e.g., $500, 15%) | No separate notice servicing fee is charged — the renewal fee already covers it |

In short: properties that do not pay a renewal fee are charged $75 for notice servicing. Properties that already pay a renewal fee are not double-charged.

### What Happens Automatically

Once the notice is served and the fee applies, the system does the following:


1. **Creates a bill in Buildium** — The $75 fee appears as a vendor bill under the **Mailing and Notices** GL account, billed to the property owner through the Sagareus vendor account
2. **Closes the "Charge renewal fee" subtask** — The Asana subtask is automatically marked complete
3. **Posts a comment with a link** — A comment is added to the subtask with a direct link to the newly created Buildium bill, so you can verify it anytime

If the bill amount is $0 (because the property has a renewal fee and no separate charge is needed), the subtask is simply closed with a note that no fee was required.

### Where to Find the Bill

* **In Buildium:** Go to the owner's property and look under vendor bills. The bill will show as "Renewal fee" under the **Mailing and Notices** GL account
* **In Asana:** Open the "Charge renewal fee" subtask on the renewal task. The comment will contain a clickable link directly to the Buildium bill

### Edge Cases

* **Fee could not be determined** — If the system cannot find the property's renewal fee setting in Client Relations 2.0, the subtask is assigned to Vincent for manual review with a due date of today
* **Invalid or missing data** — If required information (property ID, bill amount) is missing or invalid, the subtask is assigned to Vincent for manual review
* **Parent task already closed** — If the main renewal task is already completed and the billing subtask was never processed, it gets automatically cleaned up and closed
