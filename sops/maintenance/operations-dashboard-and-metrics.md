---
title: "Operations // Dashboard and Metrics"
service_line: maintenance
sop_owner: brittany@sagareus.com
status: active
last_reviewed: 2026-05-01
visibility_tier: ic
version: 1
tags: [maintenance, maintenance-2.0]
created_but_never_updated: true
---

:::info
This document explains the operations metrics tracked on the [analytics dashboard](https://d31czylo2z0inj.cloudfront.net/#operations) and where each data point comes from. Use this as a reference when reviewing maintenance ticket performance.

:::

## What the Dashboard Tracks

The Operations tab monitors maintenance ticket throughput and SLA compliance. It answers:

* How many tickets are we creating and closing?
* Are we resolving tickets within our SLA window?
* Which tickets are aging and need attention?


---

## KPI Definitions

### Tickets Created (30d)
**What it measures:** Number of maintenance tickets created in the last 30 days.

### Tickets Closed (30d)
**What it measures:** Number of maintenance tickets completed in the last 30 days.

### Active Tickets with SLA %
**What it measures:** Percentage of currently active tickets that are within the SLA window.
**SLA threshold:** 14 days (configurable)

### Avg Days to Close
**What it measures:** Average number of days from ticket creation to completion.


---

## Data Source

Dashboard data is collected daily by the `collect-operations-analytics` worker. It reads from the Maintenance 2.0 Asana project, computes ticket counts, age distributions, and SLA metrics, then writes to S3 for the dashboard to display.

The SLA threshold (default 14 days) is configurable in the dashboard settings.
