---
title: "Office // Dashboard and Metrics"
service_line: staff support
sop_owner: brittany@sagareus.com
status: active
last_reviewed: 2026-05-01
visibility_tier: ic
version: 1
tags: [accounting, finance-office, dashboard, kpi, office, metrics, buildium]
created_but_never_updated: true
---
:::info
This document explains the office/bill processing metrics tracked on the [analytics dashboard](https://d31czylo2z0inj.cloudfront.net/#office) and where each data point comes from. Use this as a reference when reviewing accounts payable performance.

:::

## What the Dashboard Tracks

The Office tab monitors bill processing throughput and timeliness. It answers:

* How many bills are coming in and getting paid?
* How quickly are we processing bills?
* How healthy is our overall AP workflow?
* Which bills are overdue and need attention?


---

## KPI Definitions

### Bills Received (30d)

**What it measures:** Number of bills entered into Buildium in the last 30 days.

**Why it matters:** Tracks inbound AP volume.

### Bills Paid (30d)

**What it measures:** Number of bills marked as paid in the last 30 days.

**Why it matters:** Should track with or above bills received to prevent backlog.

### Pending Bills

**What it measures:** Count of unpaid bills currently in the system.

**Why it matters:** High pending counts indicate processing delays.

### Avg Processing Days

**What it measures:** Average number of days from bill receipt to payment.

**Why it matters:** Faster processing means fewer late fees and better vendor relationships.

### Health Score

**What it measures:** Composite score (0-100%) based on processing timeliness, overdue ratio, and throughput.

**Why it matters:** A single number that summarizes overall AP health. Displayed as a circular gauge.


---

## Overdue Distribution

The dashboard breaks overdue bills into age buckets:

| Bucket | What It Means |
|--------|---------------|
| **Current** | Bills not yet past due |
| **1-7 days** | Slightly overdue, should be prioritized |
| **8-14 days** | Moderately overdue, needs attention |
| **15+ days** | Significantly overdue, requires escalation |


---

## What the Dashboard Shows

### Stat Cards

* Bills Received (30d)
* Bills Paid (30d)
* Pending Bills (count)
* Avg Processing Days

### Health Score Gauge

Circular progress indicator showing overall AP health (0-100%).

### Overdue Bills Distribution

Stacked bar showing overdue bills by age bucket (Current, 1-7d, 8-14d, 15+d).

### Bill Category Legend

Color-coded categories: Utilities, Maintenance, Sagareus, Other.

### Year-over-Year Chart

Pending Bills Over Time — Line chart comparing current year vs. previous year.

### Overdue Bills Detail Table

* Vendor Name, Amount, Days Overdue, View Bill link
* Sortable columns for prioritizing overdue bill resolution


---

## Data Source

Dashboard data is collected daily by the `collect-office-analytics` worker. It reads bill data from the Buildium API (bills, payments, aging), computes processing metrics and health scores, then writes to S3 for the dashboard to display.
