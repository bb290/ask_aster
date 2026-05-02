---
title: "Registration & License // Seattle // Setup"
service_line: utilities
sop_owner: brittany@sagareus.com
status: active
last_reviewed: 2026-05-01
visibility_tier: ic
version: 1
tags: [rental-registration, business-license, municipal, seattle, registration-setup, rrio]
created_but_never_updated: false
---

:::info
Use this when Sagareus begins managing a Seattle rental property. Run as part of the onboarding Asana template.

:::

## Trigger

* Onboarding Asana template subtask: `REGISTER | Rental Registration with City` — present in both the [New Client template](https://app.asana.com/0/0/1214028176508371) and the [Adding Property template](https://app.asana.com/0/0/1214028242888486), both under the `Client Relations 2.0` project.
* Executed by: [Customer Service Specialist](../../docs/role-profiles/customer-service-specialist.md) — payment sub-step delegated to [Admin Team Lead](../../docs/role-profiles/admin-team-lead.md).

## Prerequisites

* Seattle Services Portal credentials (from 1Password).
* Buildium access to create a bill and update the property summary page.
* Property record in Buildium already created (done earlier in onboarding).

## Step 1 — Look up existing registration

* Go to [Seattle Services Portal](https://services.seattle.gov/Portal/Customization/SEATTLE/welcome.aspx).
* Click `Search All Records`.
* Enter **street number + street name only** (including the full address often returns zero results).
* Under Record Type, look for `Rental Property Registration`.
* Determine status:
  * **Active** → go to Step 2A (Transfer).
  * **Expired** → go to Step 2B (Reinstatement).
  * **Not found** → go to Step 2C (New Registration).

## Step 2A — Transfer existing registration

Only if Step 1 found an active record.

* From portal Home: `Rental Housing Registration (RRIO)` → `Transfer Existing Registration to New Owners` → `Continue Application`.
* Enter the current Rental Property Registration Record Number (example: `0001-0000101`).
* Contact list:
  * **Applicant:** Sagareus
  * **Owner:** the legal owner of the property
  * **Resident Contact for Repairs:** Sagareus
* `Continue Application` → `Review` → `Record Issuance`.


:::tip
The portal takes approximately 48 hours to reflect an ownership transfer. Return to the portal after that window to download the updated registration record PDF.

:::

## Step 2B — Reinstatement (expired registration)

Only if Step 1 found an expired record.

* Email `sci_rrio@seattle.gov` using the template below.
* Always request a waiver of overdue fees (not guaranteed; ask anyway).
* Once the city responds with next steps, follow their instructions — then update the record as you would for a transfer or new registration depending on what they require.

### Email Template — Request for Reinstatement

> **Subject:** [Rental Registration Number] // Request for Reinstatement
>
> Hi,
>
> We've recently taken over management of [Property Address] and would like to reinstate the rental registration. Could you please advise on next steps and let us know if it's possible to have the overdue fees waived?
>
> Thank you,

## Step 2C — New registration (no existing record)

* From portal Home: `Rental Housing Registration (RRIO)` → `Rental Property Registration` → `Continue Application`.
* Find the property by **street address only** (parcel numbers aren't used by the portal).
* Contact list:
  * **Applicant:** Sagareus
  * **Owner:** legal owner
  * **Resident Contact for Repairs:** Sagareus
* Add **rental units**: indicate the number of units and add each unit identifier (e.g., `Unit 101`).
* **Declaration of Compliance:** check the box confirming the property meets the RRIO Checklist standards. Select `Inspected by Owner/Owner's Agent`.
* `Continue Application` → `Add to Cart`.
* Proceed to Step 3 (Payment).

## Step 3 — Payment

Executed by [Admin Team Lead](../../docs/role-profiles/admin-team-lead.md).

* Assign an Asana subtask to the Admin Team Lead for payment processing.
* Pay with **Vincent's SAGA CC**.
* Record the bill in Buildium:
  * Navigate: `Accounting` → `Bills` → `Record Bill`.
  * `Pay To`: `City of Seattle`.
  * `Memo`: `Paid with Vincent's SAGA CC` (must match verbatim — do not paraphrase).
  * Select the property address.
  * `Unit`: `Property Level`.
  * `Account`: `Licensing and Permits`.
  * `Description`: `Seattle Rental Registration`.
  * `Amount`: total amount paid.
* Save the receipt as a bill attachment.

## Step 4 — Upload record

* Download the Rental Registration Record PDF from the portal (for transfers, after the 48-hour window).
* Upload to the Property Summary page in Buildium.

## Step 5 — Update tracking field

* Update the `Rental Registration Expiration` custom field in the [Property Settings](../../docs/section-indexes/sops-2-property-settings.md) Asana project to the new expiration date (2 years from registration).
* Full update procedure: [Update | Property Settings](../property onboarding/update-property-settings.md).

## Next

* Next action: biennial renewal. See `Registration & License // Seattle // Update` (sibling doc).
