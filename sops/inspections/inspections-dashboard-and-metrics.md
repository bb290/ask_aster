---
title: Inspections // Dashboard and Metrics
service_line: inspections
sop_owner: brittany@sagareus.com
status: active
last_reviewed: 2026-05-01
visibility_tier: ic
version: 1
tags: [inspection]
created_but_never_updated: true
---

:::info
This document explains the multifamily inspection metrics tracked on the [analytics dashboard](https://d31czylo2z0inj.cloudfront.net/#inspections) (Multifamily sub-tab) and where each data point comes from.

:::

## What the Dashboard Tracks

The Inspections (Multifamily) sub-tab monitors the multifamily building inspection pipeline. It answers:

* How many inspections are pending vs. completed?
* How much income have completed inspections generated?
* How is work distributed across staff and regions?


---

## KPI Definitions

### Pending Inspections

**What it measures:** Count of multifamily inspections that have been created but not yet completed.

**Why it matters:** High pending counts may indicate scheduling bottlenecks or staffing gaps.

### Completed Inspections

**What it measures:** Count of multifamily inspections marked as done.

**Why it matters:** Tracks throughput. Goal is to inspect every multifamily building every 3 months.

### Completed Inspections Income

**What it measures:** Total income generated from completed inspections (inspection fees billed to owners).

**Fee schedule:** $100 per multifamily building inspection.

**Why it matters:** Tracks revenue from the inspection program.

### Created This Month

**What it measures:** Number of new inspection tasks created in the current month.

**Why it matters:** Measures how actively new inspections are being scheduled.


---

## What the Dashboard Shows

### Stat Cards

* Pending Inspections (count)
* Completed Inspections (count)
* Completed Inspections Income (currency)
* Created This Month (count)

### Distribution Charts

* **Staff Breakdown** — Horizontal bar showing inspection count per team member
* **Region Breakdown** — Horizontal bar showing inspection count per geographic region

### Historical Tables

Monthly rows showing inspection metrics by year, with YTD totals.


---

## Data Source

Dashboard data is collected daily by the `collect-inspections-analytics` worker. It reads from the Inspections Asana project, computes counts and breakdowns, then writes to S3 for the dashboard to display.
