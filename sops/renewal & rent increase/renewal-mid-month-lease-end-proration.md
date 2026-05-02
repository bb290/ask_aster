---
title: "Renewal // Mid-Month Lease End — Proration"
service_line: renewal & rent increase
sop_owner: brittany@sagareus.com
status: active
last_reviewed: 2026-05-01
visibility_tier: ic
version: 1
tags: [renewal, proration, buildium, lease-renewal]
created_but_never_updated: false
---

## 1. Add Proration Subtask in Asana

When a lease ends mid-month:


1. Go to the Renewal Task
2. Add Subtask:
   * Title: Prorate end month and first month of renewal
   * Assigned to: [Renewal & Rent Increase Coordinator](../../docs/section-indexes/sops-2-staff-directory.md)
   * Due Date: 4 days before the 1st day of the last month of the current lease
     * Example: Lease ends May 13 → First day of last month: May 1 → Due April 26


---

## 2. Once Renewal is Signed → Calculate Proration

When the subtask becomes due and renewal is confirmed:


1. Open:
   * Buildium Ledger
   * Tool → [Renewal Proration Calculator](https://docs.google.com/spreadsheets/d/1GS7l05cSgAcqGwwaw_33oSJfjKDhhf-4pLk_LIkgWIQ/edit?gid=0#gid=0)
2. Fill out only the blue fields in the calculator:
   * Previous Rent Rate Section:
     * Start Date + End Date under old rent rate
     * Rent + any add-ons (Utilities, Pet Rent, Parking, Others)
   * New Rent Rate Section:
     * Rent + any add-ons
3. Calculator auto-computes number of days, daily rate, and prorated totals


---

## 3. Post Charges to Ledger in Buildium

* Enter charges separately for each rate period
* Both charges must be dated on the 1st day of the last month of the current lease

**Charge #1 — Last Month of Current Term (Old Rate)**


1. Ledger → Enter Charge
2. Date: 1st day of the last month of current lease
3. Amount: Old-rate prorated amount from calculator
4. Memo format:
   * Pro-rated rent from MM/DD/YY to MM/DD/YY @ $X/day
5. Account selection based on component:
   * Rent → RENT
   * Utilities → Utility Recovery
   * Pet Rent → Pet Rent
   * Parking → Parking Income
   * Others → Landscaping Recovery, etc.
6. Confirm total matches calculator
7. Save

**Charge #2 — Remaining Days of the Month Under New Rent Rate**


1. Repeat all steps above using the new-rate prorated amount
2. Charge date: Same as Charge #1 (1st day of the last month of current term)
3. Mark Subtask as Complete once done.
