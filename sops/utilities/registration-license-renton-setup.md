---
title: "Registration & License // Renton // Setup"
service_line: utilities
sop_owner: brittany@sagareus.com
status: active
last_reviewed: 2026-05-01
visibility_tier: ic
version: 1
tags: [rental-registration, business-license, municipal, renton, registration-setup]
created_but_never_updated: false
---

:::info
Use this when Sagareus begins managing a Renton property. Registers the property via the Renton rental registration form.

:::

## Trigger

* Onboarding Asana template subtask `REGISTER | Rental Registration with City` for a Renton property.
* Executed by: [Customer Service Specialist](../../docs/role-profiles/customer-service-specialist.md).

## Prerequisites

* **VPN connection** (if working remotely).
* Property details available from Buildium.

## Procedure


1. Go to [Renton Rental Registration Form](https://forms.rentonwa.gov/Forms/RentalRegistration).
2. Complete the `Checklist of Compliance` — answer **NO** to each item.
3. Complete the `Declaration of Compliance`.
4. Click `Submit`.
5. Get the reference number from the submission confirmation.
6. Send an email to [rentalregistration@rentonwa.gov](mailto:rentalregistration@rentonwa.gov) requesting a copy of the license.
7. Under [Property Settings](../../docs/section-indexes/sops-2-property-settings.md), update the `Rental Registration Expiration` custom field to **12/31 of the current renewal year**.

## Email templates

None explicitly templated in source. The license-copy-request email is short and ad-hoc.

## Next

* Annual renewal. See [Registration & License // Renton // Update](registration-license-renton-update.md).
* Parent: [Registration & License // Renton](../../docs/section-indexes/sops-2-registration-license-renton.md).
