---
title: "Registration & License // Seattle // Cancel"
service_line: utilities
sop_owner: brittany@sagareus.com
status: active
last_reviewed: 2026-05-01
visibility_tier: ic
version: 1
tags: [rental-registration, business-license, municipal, seattle, registration-cancel, rrio]
created_but_never_updated: false
---

:::info
Use this when a Seattle property leaves Sagareus management. Removes Sagareus from the RRIO contact list and transfers responsibility back to the owner. Does NOT cancel the underlying registration — the owner remains responsible.

:::

## Trigger

* **Offboarding:** a property is being offboarded from Sagareus management. Run this procedure as part of offboarding.
* **Renewal notice for an already-offboarded property:** the city sends a renewal notice to `mgmt@sagareus.com` for a property Sagareus no longer manages. Use this doc to remove Sagareus from the record.
* Executed by: [Customer Service Specialist](../../docs/role-profiles/customer-service-specialist.md).

## Prerequisites

* Confirm the property is no longer under Sagareus management (check Buildium + the offboarding Asana project).
* Seattle Services Portal credentials from 1Password.
* Property's Rental Property Registration Record Number (format example: `0001-0000101`) — found by searching the portal or in the original registration PDF stored on Buildium Property Summary.

## Procedure


1. Send an email to [sci_rrio@seattle.gov](mailto:sci_rrio@seattle.gov) using the template below, asking the city to remove Sagareus from the property's contact list.
2. Log in to [Seattle Services Portal](https://services.seattle.gov/Portal/Customization/SEATTLE/welcome.aspx) (credentials in 1Password).
3. From portal Home: `Rental Housing Registration (RRIO)` → `Transfer Existing Registration to New Owners` → `Continue Application`.
4. Enter the Rental Property Registration Record Number (example: `0001-0000101`).
5. Update the contact list to transfer responsibility back to the owner:
   * **Applicant:** Owner
   * **Owner:** the legal owner of the property
   * **Resident Contact for Repairs:** Owner
6. `Continue Application` → `Review` → `Record Issuance`.
7.
:::tip
   The portal takes approximately 48 hours to reflect the updated contact list. You do not need to return to download a record — once the city acknowledges the email and the portal update is submitted, Sagareus is no longer the contact on file.

   :::
8. Clear the `Rental Registration Expiration` custom field from the [Property Settings](../../docs/section-indexes/sops-2-property-settings.md) Asana project for this property (the field is no longer Sagareus's responsibility to track). Full procedure: [Update | Property Settings](../property onboarding/update-property-settings.md).

### Email Template — No Longer Under Sagareus Management

> **Subject:** [Rental Registration Number] // No Longer Under Sagareus Management
>
> Hi,
>
> [Property Address] is no longer managed by Sagareus. Please remove Sagareus from the contact list for this property's rental registration.
>
> Thank you,

## Next

* If this cancellation is part of a full offboarding, return to the offboarding Asana task list and mark this step complete.
* If this was triggered by a stray renewal notice for an already-offboarded property, no further action is needed.
* Parent: [Registration & License // Seattle](../../docs/section-indexes/sops-2-registration-license-seattle.md).
