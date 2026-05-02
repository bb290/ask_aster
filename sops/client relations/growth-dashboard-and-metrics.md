---
title: "Growth // Dashboard and Metrics"
service_line: client relations
sop_owner: brittany@sagareus.com
status: active
last_reviewed: 2026-05-01
visibility_tier: ic
version: 1
tags: [client-relations, pma, portfolio-owner]
created_but_never_updated: true
---

:::info
This document explains the growth metrics tracked on the analytics dashboard.

:::

## What the Dashboard Tracks

The Growth tab monitors portfolio size and capacity over time.


---

## KPI Definitions

### Portfolio Metrics

| Metric | What It Counts |
|--------|----------------|
| **Active Properties** | Total managed properties in Buildium |
| **Active Units** | Total managed units across all properties |
| **Active Tenants** | Total active tenants with current leases |
| **Active Owners** | Total property owners with active management agreements |

For each metric, the dashboard displays:

* **Value**, Current count
* **30d Change**, Net change over the last 30 days
* **1y Change**, Net change over the last 12 months
* **Per-Employee**, Metric divided by current headcount

### Unit Movement

| Metric | What It Measures |
|--------|------------------|
| **New Units** | Units added to the portfolio this month |
| **Departed Units** | Units removed from the portfolio this month |
| **Net Units Added** | New minus Departed (positive = growth) |


---

## Data Source

Dashboard data is collected daily by the `collect-growth-analytics` worker. It reads portfolio counts from the Buildium API.
