---
title: "Renewal // Dashboard and Metrics"
service_line: renewal & rent increase
sop_owner: brittany@sagareus.com
status: active
last_reviewed: 2026-05-01
visibility_tier: ic
version: 1
tags: [renewal, dashboard, metrics, kpi, rent-increase, notice-servicing, mailing, deadline]
created_but_never_updated: false
---

Track renewal and rent increase metrics on the [Renewal & Rent Increase Dashboard](https://d31czylo2z0inj.cloudfront.net/#renewals).

## What the Dashboard Tracks

* **Renewal pipeline** — upcoming renewals by month, status breakdown (pending owner approval, notice served, renewed, terminated)
* **Rent increase progress** — notices served vs. pending, by jurisdiction
* **Income** — total income per renewal month, broken down into renewal fees and notice servicing fees. Includes $/renewal (total income divided by renewed count) and YTD income with the same breakdown
* **Notice servicing** — in-person service completion rates and staff breakdown
* **Timelines** — days remaining before deadlines, overdue tasks

### Income Breakdown

The dashboard tracks two revenue streams that sum to total income:

| Source | Description |
|--------|-------------|
| **Renewal fees** | Fee charged to owners on renewal (set per-property in Client Relations 2.0) |
| **Notice servicing fees** | $75 fee charged to owners whose renewal fee is $0, when a field agent serves the rent increase notice |

Income is attributed to the **renewal month** (the YYYY-MM section of the renewal task), not the billing date. This means NS fees billed in April for a July renewal appear under July's income.

The historical table shows Renewal and NS as separate sub-columns alongside the total Income column. YTD footers show the breakdown as well.


:::info
Notice servicing income only exists from **late March 2026** onward. Earlier months correctly show $0 for NS income.

:::

## Data Source

Dashboard data is collected daily by the `collect-renewal-analytics` worker (runs at 4:27 AM PST). It reads from three Asana projects:

* [**Renewal & Rent Increase**](https://app.asana.com/1/706990140225747/project/1205087214629788) — renewal tasks, pipeline status, rent increase amounts
* [**Notice Servicing**](https://app.asana.com/1/706990140225747/project/1212998012800658/list/1213034139918485) — notice service completion rates and staff breakdown
* [**Bill Owner**](https://app.asana.com/1/706990140225747/project/1213106397739874) — billed notice servicing fees (traced back to renewal tasks via parent chain)

Metrics are written to S3 for the dashboard to display.
