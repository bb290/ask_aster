---
title: Leasing // Dashboard and Metrics
service_line: lease up
sop_owner: brittany@sagareus.com
status: active
last_reviewed: 2026-05-01
visibility_tier: ic
version: 1
tags: [leasing, showing, application, security-deposit, vacant-unit, listing, buildium, leasing-2.0]
created_but_never_updated: false
---

:::info
This document explains the leasing KPIs tracked on the [analytics dashboard](https://d31czylo2z0inj.cloudfront.net/#leasing) and where each data point lives in Asana. Use this as a reference when entering data or reviewing monthly performance.

:::

## Why We Track KPIs

Every turnover is an opportunity to measure how efficiently we lease a unit. KPIs help us answer:

* How long did the unit sit empty?
* How quickly did the agent find a tenant?
* How effective was our marketing?
* How fast did we complete the turnover and return the deposit?


---

## KPI Definitions

### Total Vacancy

**What it measures:** Total days a unit was empty between tenants.

**Formula:** Move-In Date minus Move-Out Date

**Example:** Move-out Oct 31, move-in Jan 1 = 62 days vacant

**Why it matters:** This is the bottom line. Every vacant day is lost rent for the owner. Lower is better.


---

### Days on Market

**What it measures:** How quickly the leasing agent secures a signed lease after listing.

**Formula:** Lease Signed Date minus List Date

**Example:** Listed Nov 14, lease signed Dec 2 = 18 days on market

**Why it matters:** This measures leasing agent performance specifically. Unlike Total Vacancy, it only captures the time the agent controls (listing to signed lease), not turnover delays or move-in scheduling.


---

### Conversion Funnel

The funnel tracks how prospects move through the leasing pipeline:

| Stage | What It Counts |
|-------|----------------|
| **Inquiries** | People who contacted us about the listing |
| **Showings** | People who scheduled and attended a showing |
| **Applications** | People who submitted a rental application |

**Conversion 1** = Showings / Inquiries (what % of inquiries convert to showings?)

**Conversion 2** = Applications / Showings (what % of showings convert to applications?)

**Why it matters:** Low Conversion 1 may signal pricing or listing quality issues. Low Conversion 2 may signal showing experience or unit condition issues.


---

### Turnover Completion

**What it measures:** Days to prepare the unit after the tenant moves out.

**Formula:** Turnover Completion Date minus Move-Out Date

**Current SLA:** 21 days

The Turnover Completion date is set in Step 8 — Update Metrics when the vendor first reports work is complete (before punch list resolution).

**Why it matters:** Faster turnovers mean shorter vacancy. This tracks vendor and coordination efficiency.


---

### Deposit Return

**What it measures:** Days to process and return the security deposit.

**Formula:** Deposit Return Date minus Move-Out Date

**Why it matters:** Washington state requires deposit return within 21 days. This tracks compliance.


---

## What the Dashboard Shows

### Current Month KPI Cards

* Move-Outs / Move-Ins count
* Avg Days on Market
* Avg Vacancy Days
* Avg Turnover Completion Days
* Avg Deposit Return Days

### Year-over-Year Charts

* Move-Ins Trend (current vs. previous year)
* Days Vacant (current vs. previous year)
* Turnover Completion Days (current vs. previous year)
* Deposit Return Days (current vs. previous year)

### Historical Tables

Monthly rows with: Move-Outs, Move-Ins, Avg Turnover, Avg Deposit Return, Days on Market, Total Vacancy. Clicking a month opens the per-unit detail view.

### Monthly Detail Report

The per-month detail view shows every turnover for a given month:

* **Per-unit table** with all fields above, sortable by agent, vacancy, or days on market
* **Summary KPIs** including median vacancy and conversion rates
* **Per-agent summary** showing each agent's move-in count, average vacancy, and conversion rates


---

## Where to Enter Data in Asana

Each KPI pulls from a specific Asana project. The parent "Leasing |" task ties everything together through its subtasks.

### Leasing 3.0 // LU (Lease-Up)

This is where most leasing agent data lives.

| Field | Who Enters It | When |
|-------|---------------|------|
| List Date | Leasing Agent | When unit is listed |
| Lease Signed Date | Leasing Agent | When lease is signed |
| # of Inquiries | Leasing Agent | After lease is signed |
| # of Showings | Leasing Agent | After lease is signed |
| # of Applications | Leasing Agent | After lease is signed |
| Metric Inclusion | Leasing Manager | If turnover should be excluded from averages |

### Leasing 3.0 // Move-Out

| Field | Who Enters It | When |
|-------|---------------|------|
| Move-Out Date | Auto-populated | From Buildium lease data |

### Leasing 3.0 // Move-In

| Field | Who Enters It | When |
|-------|---------------|------|
| Move-In Date | Auto-populated | From Buildium lease data |

### Leasing 3.0 // Turn Over

| Field | Who Enters It | When |
|-------|---------------|------|
| Turnover Completion Date | Field Team / Leasing Manager | When unit is ready |
| Turn Over Vendor | Leasing Manager | When vendor is assigned |
| Turn Over Cost | Leasing Manager | After turnover is complete |

### Leasing 3.0 // Process Deposit

| Field | Who Enters It | When |
|-------|---------------|------|
| Deposit Return Date | Accounting Manager | When deposit is mailed/sent |
| Deposit Withheld | Accounting Manager | Amount withheld from deposit |


---

## Metric Exclusion

Some turnovers have unusual circumstances (e.g., extended owner renovations, legal holds) that would skew the averages. These can be excluded from KPI calculations.

**How to exclude:** On the LU task, set the **Metric Inclusion** field to **Exclude**. Turn overs can also be excluded by setting the **Metric Exclusion** field on the task in the [Leasing 3.0 // Turn Over](https://app.asana.com/1/706990140225747/project/1213171760535170) Asana project.

**What it affects:** Excluded turnovers still count toward move-in/move-out totals, but are removed from average calculations (vacancy, days on market, conversions, turnover completion).

**When to use:** Only when the turnover does not reflect normal leasing performance. Requires Leasing Manager approval.


---

## Data Source

Dashboard data is collected daily by the `collect-leasing-analytics` worker. It reads from the Leasing 3.0 Asana project and writes metrics to S3 for the dashboard to display.
