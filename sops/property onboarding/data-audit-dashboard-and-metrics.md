---
title: Data Audit // Dashboard and Metrics
service_line: property onboarding
sop_owner: brittany@sagareus.com
status: active
last_reviewed: 2026-05-01
visibility_tier: ic
version: 1
tags: [property-onboarding, property-settings, buildium, asana]
created_but_never_updated: true
---

:::info
This document explains the data audit metrics tracked on the [analytics dashboard](https://d31czylo2z0inj.cloudfront.net/#data-audit) and where each data point comes from. Use this as a reference when reviewing property settings completion across the portfolio.

:::

## What the Dashboard Tracks

The Data Audit tab monitors how completely property and unit settings fields have been filled in across all managed properties. It answers:

* Which fields are missing data across our portfolio?
* How complete are we in each category (Client Settings, Property Settings, Utilities)?
* Which properties need attention?
* Is completion improving over time?


---

## Segments

The dashboard groups tracked fields into three segments:

### Client Settings

**Source:** Client Relations 2.0 Asana project

**What it tracks:** 6 fields related to client/owner account configuration. These fields ensure owner preferences and account details are fully documented.

### Property Settings

**Source:** Property Settings + Unit Settings Asana projects

**What it tracks:** 26 fields covering maintenance schedules, compliance dates, and property details. See the [Property Settings field reference](../../docs/section-indexes/sops-2-property-settings.md) for the complete list of tracked fields and their categories (Property, Unit, Multifamily, All).

### Utilities

**Source:** Property Settings + Unit Settings Asana projects

**What it tracks:** 9 fields covering utility billing configuration per unit (Electricity, Gas, Water, Sewer, Garbage, Oil, Internet, Auto Utility Processing Mode, and Utilities provider info).


---

## How Completion Is Calculated

A field counts as "complete" when it has any non-empty value set on the Asana task. Fields that don't apply to a particular task type are automatically set to a placeholder value (12/31/9999 for dates) by the `sync-settings` worker, so they don't show up as missing.

**Per-field completion rate** = (tasks with field filled) / (total tasks where field applies) x 100%

**Segment completion rate** = Average of all per-field rates in that segment


---

## What the Dashboard Shows

### Per-Field Completion Rates

For each segment, every tracked field is listed with a progress bar showing its completion percentage across all properties.

### Completion Trend Chart

Line chart showing segment completion rates over time (current year vs. previous year). Tracks whether the team is making progress on filling in missing data.

### Properties Needing Attention

For each segment, a list of properties with the most incomplete fields. Use this to prioritize which properties to update next.

### 30-Day Delta

Shows how completion rates have changed in the last 30 days, highlighting areas of progress or regression.


---

## Data Source

Dashboard data is collected daily by the `collect-data-audit-analytics` worker. It reads from the Property Settings and Unit Settings Asana projects, computes per-field completion rates across all properties, and writes to S3 for the dashboard to display.

The `sync-settings` worker (runs daily) keeps property tasks in sync with Buildium and sets default placeholder values for non-applicable fields, which prevents false "missing" counts on the data audit dashboard.
