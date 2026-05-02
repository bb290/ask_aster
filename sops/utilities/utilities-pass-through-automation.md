---
title: Utilities // Pass Through Automation
service_line: utilities
sop_owner: brittany@sagareus.com
status: active
last_reviewed: 2026-05-01
visibility_tier: ic
version: 1
tags: [utilities, utility-onboarding, pass-through]
created_but_never_updated: false
---

> **Situation:** Utility bills are entered in Buildium and need to be automatically charged to tenants' lease ledgers. The pass-through automation handles this daily — but it requires the correct property and lease settings to be configured first.


---

## Key Points

* **Runs daily at 3:57 AM** — The automation runs once per day. Bills entered today will be processed tomorrow morning.
* **Settings must be configured manually** — The automation only works if staff has set the correct pass-through mode on each property.
* **Only processes utility GL accounts** — Bills must be categorized under the correct Buildium GL accounts.
* **Suspicious amounts get flagged** — Charges under $30 or over $500 are flagged for manual review even if successfully created.


---

## How It Works

### The Daily Flow


1. The automation checks the **Bill Pass Throughs** Asana project for unassigned, incomplete tasks
2. For each task, it reads the **Bill ID** and fetches the bill from Buildium
3. It looks up the property's **Auto Utility Processing Mode** in [Property Settings](https://app.asana.com/0/1211134623744906)
4. Based on the mode, it calculates the charge amount and posts it to the tenant's lease ledger in Buildium
5. The charge appears on the **1st of the following month** on the tenant's invoice
6. The Asana task is marked complete (or assigned to someone if it needs manual review)

### What Gets Charged

The charge memo shows: `{Vendor} / {start date} to {end date} / {pct}% Passed Through`

If a tenant moved in or out mid-billing cycle, the amount is **automatically prorated** based on the number of days the lease overlapped the billing period.


---

## Common Patterns

| Property Type | Electric | Gas | Water/Sewer | Garbage | Automation Config |
|---------------|----------|-----|-------------|---------|-------------------|
| Single family, all separate meters | Tenant Account | Tenant Account | Sagareus — Pass Through | Sagareus — Pass Through | 100% Pass Through |
| Multifamily, electric separate, rest shared | Tenant Account | Flat Fee | Flat Fee    | Flat Fee | No Pass Through (Flat Fee) |
| Multifamily, all shared meters | Flat Fee | Flat Fee | Flat Fee    | Flat Fee | No Pass Through (Flat Fee) |
| Multifamily, units pay different % of water/sewer *(legacy only)* | Tenant Account | Tenant Account | Sagareus — Pass Through (50%) | Sagareus — Pass Through (50%) | Lease Override *(legacy)* |
| Single family, tenant manages all | Tenant Account | Tenant Account | Tenant Account | Tenant Account | No Pass Through   |


---

## Settings You Must Configure

### 1. Auto Utility Processing Mode (Property Settings)

**Where:** [Property Settings](https://app.asana.com/0/1211134623744906) → find the property → **Auto Utility Processing Mode** field

| Setting | What Happens |
|---------|--------------|
| **100% pass through** | Tenant pays the full utility bill amount |
| **Lease Override** *(legacy — do not use for new leases)* | Each lease has its own percentage |
| **No pass through (flat fee)** | Tenant is NOT charged |
| **Not set** | Task is flagged for manual review |

### 2. Pass Through % (Lease Settings) — Legacy: Only for "Lease Override"


:::warning
**Legacy support only.** Lease Override exists to support existing leases that were set up with a custom pass-through percentage. All new leases should use **100% Pass Through** or **No Pass Through (Flat Fee)**.

:::

### 3. Buildium GL Accounts

Bills must be entered under the correct GL account in Buildium for the automation to pick them up:

| GL Account | Utility Type |
|------------|--------------|
| Water Sewer Garbage (362896) | Water, sewer, garbage bills |
| Gas and Electricity (386371) | Gas and electric bills |
| Internet (423924) | Internet bills |


---

## What Gets Flagged for Manual Review

The automation assigns tasks to staff instead of auto-completing when:

| Situation | Assigned To | Action Needed |
|-----------|-------------|---------------|
| Property has no settings configured | Vincent     | Set Auto Utility Processing Mode |
| "No pass through" property receives an electricity/gas bill | Jody        | Confirm whether it should be passed through |
| Charge amount is under $30 or over $500 | Jody        | Verify the bill amount is correct |
| Lease Override but Pass Through % is missing | Vincent     | Set the Pass Through % on the lease |
| No matching lease found for the property/unit | Vincent     | Check that an active lease exists in Buildium |
| Duplicate Bill ID detected | Vincent     | Investigate duplicate task |


---

## Setting Up a New Property for Automation

When onboarding a new property, complete these steps to enable pass-through automation:


1. Run the daily `sync-settings` command — this creates the Property Settings and Lease Settings tasks in Asana
2. Set the **Auto Utility Processing Mode** on the property's task
3. Ensure utility bills in Buildium are categorized under the correct GL accounts
4. The automation will begin processing bills the next morning


---

## Related

* [Configure Lease Utility](utilities-configure-lease-utility.md)
* [Paying Utility Bills](utilities-paying-utility-bills.md)
* [Pass Through to Resident Ledger](utilities-pass-through-to-resident-ledger.md)
* [Calculating Prorated Pass Through](utilities-calculating-prorated-pass-through.md)
