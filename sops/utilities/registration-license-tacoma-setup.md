---
title: "Registration & License // Tacoma // Setup"
service_line: utilities
sop_owner: brittany@sagareus.com
status: active
last_reviewed: 2026-05-01
visibility_tier: ic
version: 1
tags: [rental-registration, business-license, municipal, tacoma, registration-setup]
created_but_never_updated: false
---

:::info
Use this when Sagareus begins managing a Tacoma property. Sets up or adds the property to a City of Tacoma Business License via FileLocal.

:::

## Trigger

* Onboarding Asana template subtask `REGISTER | Rental Registration with City` when onboarding a Tacoma property.
* Executed by: [Customer Service Specialist](../../docs/role-profiles/customer-service-specialist.md) — payment step delegated to **Team Lead Kat**.

## Prerequisites

* Verify property is within Tacoma limits via [Tacoma Parcel Analysis](https://parcelanalysis.cityoftacoma.org/). If outside, skip this entire procedure.
* Check onboarding documents: does the property already have a business license? If yes, request the license info from the owner and skip to Step 5 (update Buildium notes + tracking field).
* Pierce County deed lookup via [Pierce County ATIP](https://atip.piercecountywa.gov/) for the legal owner name.

## Procedure


 1. Check and confirm from the onboarding documents if the property already has a business license. If already registered, get the license info from the owner.
 2. If the property is not yet registered, check if the property is within Tacoma limits via [Tacoma Parcel Analysis](https://parcelanalysis.cityoftacoma.org/). If outside Tacoma limits, no action required.
 3. If within Tacoma limits, go to [FileLocal](https://www.filelocal-wa.gov) to create a new account for the owner:
    * Account name: `sagareus_<owner name>`
    * One account per owner; an account can hold multiple properties
    * Legal business name must match the owner on the deed — look up via [Pierce County ATIP](https://atip.piercecountywa.gov/)
    * Mailing address: Sagareus address
    * User info: Sagareus info
    * Business type: Sole Proprietorship
 4. Click `Apply for License`.
 5. Check rent roll in Buildium for expected revenue.
 6. List all properties owned by the same owner, then click `Save & Next`.
 7. Add the log-in details in the notes section in Buildium.
 8. Advise **Team Lead - Kat** that the application has been entered.
 9. Kat processes the payment in FileLocal; after payment, saves the receipt and enters the bill in Buildium. Buildium entry:
    * `Accounting` → `Bills` → `Record Bill`
    * `Pay To`: `City of Tacoma | Tax and Licensing Division`
    * `Memo`: `Paid with Vincent's SAGA CC` (verbatim)
    * Select property address; `Unit`: `Property Level`
    * `Account`: `Licensing and Permits`
    * `Description`: `Tacoma Business Registration`
    * `Amount`: total amount paid
10. After 2 days from payment, log in to FileLocal to get a copy of the business license: `My License Forms` → `Print License` → select business location → `Print`. Save the license PDF to the Property Summary page in Buildium.

## Step 5 — Update tracking

* Update `Rental Registration Expiration` on [Property Settings](../../docs/section-indexes/sops-2-property-settings.md) to end of December of the current year.

## Email templates

None required for Setup.

## Next

* Next action: annual renewal at end of December. See `Registration & License // Tacoma // Update` (sibling; link added after all docs exist).
* Parent: [Registration & License // Tacoma](../../docs/section-indexes/sops-2-registration-license-tacoma.md).
