---
title: "Collection // Automation"
service_line: rent collection
sop_owner: brittany@sagareus.com
status: active
last_reviewed: 2026-05-01
visibility_tier: ic
version: 1
tags: [rent-collection, outstanding-balance, collections-action, buildium]
created_but_never_updated: false
---

## Daily Collections Sync

Every morning, an automated system syncs outstanding tenant balances from Buildium into the Collection Asana project.

### When It Runs

* Every day at approximately 3:30 AM
* Only runs from the 7th through the end of the month
* The sync does **not** run on the 1st-6th to avoid creating tasks for balances that are about to be paid

### What It Does

For each tenant with an outstanding balance in Buildium:

* If no Collection task exists yet -> creates a new task from the Collections template
* If a Collection task already exists -> updates it with the latest information

When a balance reaches $0:

* The Balance field is updated to $0
* A comment is posted: "Balance is now $0. Please review and close this collection task if no further action is needed."

### What It Skips

* New move-ins (within last 5 days)
* Inactive leases
* Zero or negative balances

### What the Team Still Does Manually

* Moving tasks between sections
* Updating task status
* Logging communications and follow-ups
* Enrolling residents in HubSpot email sequence
* Executing resolution procedures
* Marking tasks complete when resolved
