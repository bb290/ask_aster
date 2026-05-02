---
title: "Registration & License // Seattle // Update"
service_line: utilities
sop_owner: brittany@sagareus.com
status: active
last_reviewed: 2026-05-01
visibility_tier: ic
version: 1
tags: [rental-registration, business-license, municipal, seattle, registration-update, rrio, inspection-required]
created_but_never_updated: false
---

:::info
Use this when Sagareus receives a Seattle RRIO expiry/renewal notice. Seattle RRIO is biennial (every 2 years).

:::

## Trigger

* City emails the renewal notice to `mgmt@sagareus.com` approximately 60 days before expiration.
* Registration validity: **2 years**.
* Executed by: [Customer Service Specialist](../../docs/role-profiles/customer-service-specialist.md) — payment sub-step delegated to [Admin Team Lead](../../docs/role-profiles/admin-team-lead.md).

## Prerequisites


:::warning
Before processing any renewal, verify the property is still under Sagareus management. If the property is being offboarded or is already offboarded, do NOT renew — follow the `Registration & License // Seattle // Cancel` procedure instead.

:::

To verify management status:

* Check the property record in Buildium (active vs. inactive).
* Check the offboarding Asana project for any in-progress offboarding task for this property.

Additional prerequisites:

* Seattle Services Portal credentials from 1Password.
* Buildium access to record the bill.

## Asana routing

* Currently, RRIO renewal payment tasks are created under the `Business License - Seattle` project (project GID `1211510838009197`) as monthly recurring parents (e.g., "April 2026 Renewals // Seattle RRIO"), with child tasks per-property.
* The task for the property-level renewal itself should be created here with title: `Pay RRIO Renewal // [Property Address]`, assigned to [Admin Team Lead](../../docs/role-profiles/admin-team-lead.md).


:::info
Asana routing for rental registration workflows is under review and may consolidate. When in doubt, follow the current-state pattern above and flag to Ops.

:::

## Procedure


 1. Log in to [Seattle Services Portal](https://services.seattle.gov/Portal/Customization/SEATTLE/welcome.aspx) (credentials in 1Password).
 2. Under `My Records`, find the record for the property.
 3. From the `Action` filter, select `Renew Application`.
 4. Select the record to renew → click `Renew Application`.
 5. Confirm the contact list is correct → `Continue Application`.
    * Applicant: Sagareus
    * Owner: legal owner
    * Resident Contact for Repairs: Sagareus
 6. **Declaration Information:** check Asana for whether an inspection by a registered inspector is on file for this property.
    * If **yes** → select `Inspector`.
    * If **no** → select `Owner/Owner's Agent`.
    * Then `Continue Application`.
 7. Review the renewal application → click `Checkout`.
 8. Create an Asana task (see Asana routing above) titled `Pay RRIO Renewal // [Property Address]`, assigned to the [Admin Team Lead](../../docs/role-profiles/admin-team-lead.md). Payment sub-procedure:
    * Pay with **Vincent's SAGA CC**.
    * Record bill in Buildium: `Accounting` → `Bills` → `Record Bill`.
      * `Pay To`: `City of Seattle`
      * `Memo`: `Paid with Vincent's SAGA CC` (verbatim)
      * Property address selected; Unit: `Property Level`
      * Account: `Licensing and Permits`
      * Description: `Seattle Rental Registration Renewal`
      * Amount: total amount paid
    * Save the receipt as a bill attachment.
 9. Download the updated Rental Registration Record PDF from the portal.
10. Upload the PDF to the Property Summary page in Buildium.
11. Update the `Rental Registration Expiration` custom field in the [Property Settings](../../docs/section-indexes/sops-2-property-settings.md) Asana project to the new expiration date (2 years forward). Full procedure: [Update | Property Settings](../property onboarding/update-property-settings.md).

## Owner inquiries

Owners sometimes forward the city's renewal notice to us once they receive a copy. Reply to reassure them that Sagareus has received the same notice and will process the renewal on their behalf — no action is needed on their end.

### Email Template — Owner Reply to Renewal Notice

> **Subject:** RRIO Renewal // [Property Address]
>
> Hi [Owner Name],
>
> Thank you for forwarding the city's renewal notice. We have received the same notice and will process the Seattle RRIO renewal on your behalf. No action is needed on your end at this time — we will update you once the renewal is complete and the updated record is on file.
>
> Thank you,

## Next

* If the property leaves Sagareus management before or during this renewal window, follow `Registration & License // Seattle // Cancel` (sibling doc; to be created).
