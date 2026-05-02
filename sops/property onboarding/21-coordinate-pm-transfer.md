---
title: "21 — COORDINATE | PM Transfer"
service_line: property onboarding
sop_owner: brittany@sagareus.com
status: active
last_reviewed: 2026-05-01
visibility_tier: ic
version: 1
tags: [property-onboarding, step-21, asana, onboarding-2.0, messy-middle, pm-transfer, occupied-onboarding, buildium]
created_but_never_updated: true
---

:::info
Part of [Onboarding Asana SOP](../../docs/section-indexes/sops-2-onboarding-asana-sop.md) — step 21 of 29.

:::

## When This Runs

Runs during the Messy Middle phase for occupied properties transferring from a previous management firm (or self-managing owner). Coordinates tenant notification, document handover, lease re-entry into Buildium, liability funds transfer, and renter's insurance audit. Timeline varies based on previous firm cooperation.

## Procedure

### POST | Change in Management Notice

* Create notice using PandaDoc Template — **Change of Management Notice**
* **MAKE SURE** to create a new doc, DO NOT modify the template
* Email notice to the tenants using **BD Communication → Email**
* Mail notice to tenants using **Mailform.io** using First Class
* Post notice on units — Assign to **Ops Manager (Vincent)** to dispatch

### RECEIVE | Docs from previous firm / owner

* Transitioning from some firms will be seamless
* Most will be difficult → There is a reason our client is switching firms
* Follow up weekly for necessary documents or until we receive written confirmation they do not have the documents

### ENTER | Lease + Resident Detail to Buildium

Organize the files prior to inputting the lease details. Rename all the files for each unit:

* `Lease - <start year> to <end year>`
* `Renewal - <start year> to <end year>`
* `Rent Increase - <start year> to <end year>`
* `Change of notice - <effective date>`
* `Ledger from Previous PM`
* `Move-in inspection report`
* `Tenant contacts`
* `Tenant Application - <name>`

Use Gemini to process the earliest lease. Start in BD Unit page, click on **"Add Lease."**

**Enter the Lease Type & Dates:**

* IF lease has expired with no renewal → **Lease Type** = At Will (Month-to-Month), **Start Date** = start date in the earliest lease
* IF lease has continuous renewals → **Lease Type** = Fixed w/rollover, **Start Date** = start date in the earliest lease, **End Date** = end date in the latest lease or renewal

**Enter the tenant contacts** — Usually provided in a separate file. Add as much info as possible: phone number, emails.

**Enter the rents** — Use Gemini prompt to extract the info from the latest Renewal or lease. Click **"Split rent charge"** to add different rent types. Make sure the **Account** & **Memo** match:

* Rent → Rent
* Pet Rent → Pet Rent
* Utility Recovery → Utilities
* Parking Income → Parking Rent
* Storage Income → Storage Rent

**Enter Security Deposit** — Use the number from the initial lease. **Due Date** is the Lease Start Date.

**Upload files & Enable portal access:**

* Upload all the renamed files
* **Moving Services Access** = OFF
* **Resident Center Welcome Email** = ON

**Add Pet Deposit (Optional)** — If the lease specifies a pet deposit, add a new charge. **Date** = Lease Start Date, **Memo** = Pet Deposit.

**Add Credit for deposit transfer** — Since tenant paid the security deposit + pet deposit when they initially moved in, we need to zero out the ledger to track the deposit transfer from previous PM. Issue credit from the ledger:

* **Date** = onboarding date
* **Amount** = Total of security deposit + pet deposit
* **Credit Action** = Issue credit for payments previously deposited — Owner Draw
* **Memo** = Deposit transferred from previous PM
* **Account** = Security Deposit Liability or Pet Deposit Liability

**Add outstanding balance from previous PM** — IF ledger from previous PM exists, check if there is an outstanding balance. IF YES — add a charge for the total outstanding balance:

* **Date** = Onboarding date
* **Amount** = Outstanding Balance
* **Memo** = Outstanding balance from previous PM

**Final Review checklist:**

* Does deposit in initial lease match ledger?
* Are deposits zeroed out with transfer from the previous PM?
* Does rent (rent + utilities, pet, etc) match the latest renewal or latest lease?
* Are all the files uploaded and shared with both owners and tenants?
* Calculate total security deposit & last month deposit funds on all ledgers.

### REQUEST | Liability Funds Transfer

Request transfer of liability funds (security deposits, prepaid rent) from previous firm or owner.

### RECEIVE | Liability Funds Transfer

Liability funds can be transferred in multiple ways and are subject to the property owner's discretion. Since the tenant's liabilities are recorded as an owner draw on their ledger, the funds are withheld from the owner's initial reports. This is our default transfer.

### AUDIT | Renter's Insurance

If occupied at onboarding, audit existing renter's insurance. Follow up for compliance.
