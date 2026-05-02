---
title: Annual Inspections // Dashboard and Metrics
service_line: inspections
sop_owner: brittany@sagareus.com
status: active
last_reviewed: 2026-05-01
visibility_tier: ic
version: 1
tags: [inspection, periodic-inspection]
created_but_never_updated: true
---

:::info
This document explains the annual inspection metrics tracked on the [analytics dashboard](https://d31czylo2z0inj.cloudfront.net/#inspections) (Annual sub-tab) and where each data point comes from.

:::

## What the Dashboard Tracks

The Annual sub-tab monitors the annual unit inspection program. Every unit must be inspected once per year. This tab answers:

* How many annual inspections are pending vs. completed?
* How much income have completed inspections generated?
* How is work distributed across staff and regions?


---

## KPI Definitions

### Pending Annual Inspections

**What it measures:** Count of annual unit inspections that have been created but not yet completed.

**Why it matters:** High pending counts may indicate the team is falling behind on the annual cycle.

### Completed Annual Inspections

**What it measures:** Count of annual inspections marked as done.

**Why it matters:** Tracks progress toward the goal of inspecting every unit once per year.

### Completed Annual Inspections Income

**What it measures:** Total income generated from completed annual inspections.

**Fee schedule:** $75 per single-family inspection, $75/unit for multi-family.

**Why it matters:** Tracks revenue from the annual inspection program.

### Created This Month

**What it measures:** Number of new annual inspection tasks created in the current month.

**Why it matters:** The `sync-annual-inspections` worker automatically creates tasks when a unit's last annual inspection date is more than one year ago. This count reflects how many new inspections the automation is generating.


---

## What the Dashboard Shows

### Stat Cards

* Pending Annual Inspections (count)
* Completed Annual Inspections (count)
* Completed Annual Inspections Income (currency)
* Created This Month (count)

### Distribution Charts

* **Staff Breakdown** — Horizontal bar showing inspection count per team member
* **Region Breakdown** — Horizontal bar showing inspection count per geographic region

### Historical Tables

Monthly rows showing annual inspection metrics by year, with YTD totals.


---

## Data Source

Dashboard data is collected daily by the `collect-inspections-analytics` worker (same worker as multifamily inspections). It reads from the Annual Inspections Asana project, computes counts and breakdowns, then writes to S3 for the dashboard to display.

Annual inspection tasks are automatically created by the `sync-annual-inspections` worker when the **Annual Inspection Completed** date field in Property Settings is more than one year old.
