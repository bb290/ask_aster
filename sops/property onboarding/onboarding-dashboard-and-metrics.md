---
title: "Onboarding // Dashboard and Metrics"
service_line: property onboarding
sop_owner: brittany@sagareus.com
status: active
last_reviewed: 2026-05-01
visibility_tier: ic
version: 1
tags: [property-onboarding, dashboard, metrics, kpi, asana, onboarding-2.0, pma, client-relations-2.0]
created_but_never_updated: false
---

:::info
This document explains the onboarding metrics tracked on the [analytics dashboard](https://d31czylo2z0inj.cloudfront.net/#onboarding) and where each data point comes from. Use this as a reference when reviewing new client onboarding performance.

:::

## What the Dashboard Tracks

The Onboarding tab monitors the new client onboarding pipeline. It answers:

* How many properties are currently being onboarded?
* How long does onboarding take on average?
* Are we meeting our SLA targets at each stage?
* Which properties are over SLA and need attention?


---

## KPI Definitions

### Pipeline Count

**What it measures:** Number of properties currently in the onboarding pipeline (active onboardings).

**Why it matters:** Tracks current workload. High pipeline counts may require additional staffing or prioritization.

### Median Onboard Days

**What it measures:** Median number of days from onboard start to completion across all onboardings.

**Why it matters:** Uses median instead of average to avoid skew from outliers (e.g., properties with legal complications).

### SLA %

**What it measures:** Percentage of active onboardings that are meeting their stage-level SLA targets.

**Why it matters:** The headline compliance metric. Low SLA % means onboardings are taking longer than expected.


---

## Onboarding Stages and SLA Targets

| Stage | SLA Target | What Happens |
|-------|------------|--------------|
| **Initial** | 2 days     | PMA signed, Buildium setup, settings configured, initial communication |
| **Reports** | 21 days    | Initial owner reports prepared and sent |
| **Finalized** | 60 days    | All systems configured, accounting complete, owner fully onboarded |


---

## What the Dashboard Shows

### Stat Cards

* Pipeline Count (active onboardings)
* Median Onboard Days
* SLA % (percentage meeting targets)

### Stage Duration Chart

Grouped bar chart showing actual duration vs. SLA target for each of the 3 stages, broken down by month.

### Pipeline Detail Table

* Address, Owners, Days in Pipeline, Current Stage, SLA Status
* Sortable columns
* Footer shows total count and over-SLA count


---

## Data Source

Dashboard data is collected daily by the `collect-onboarding-analytics` worker. It reads from the Client Relations 2.0 Asana project, computes pipeline counts, stage durations, and SLA compliance, then writes to S3 for the dashboard to display.

### KPI Date Fields

These date fields on the onboarding task drive the dashboard calculations:

* **PMA Signed** — Date PM Agreement is signed by client. Set during `UPDATE | Client Relations Settings`.
* **Onboard Received** — Date Sagareus receives Onboarding Form. Set during `UPLOAD | Onboarding Form & UPDATE | Onboard Received`.
* **Initial Onboard Complete** — Date Sagareus sends Onboarding Progress Update email. Set during `SEND | Onboarding Progress Update & UPDATE | Initial Onboard Complete`.
* **Initial Reports Sent** — Date Sagareus sends Initial Owner Reports. Set during `SEND | Initial Owner Reports & UPDATE | Initial Reports Sent` (inside FINALIZE | Accounting).
* **Onboarding Finalized** — Date Sagareus sends Onboarding Complete email. Set during `SEND | Onboard Complete! & UPDATE | Onboarding Finalized`.
