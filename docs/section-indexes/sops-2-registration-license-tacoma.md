---
title: "Registration & License // Tacoma"
service_line: utilities
doc_type: section-index
last_reviewed: 2026-05-01
---

:::info
Tacoma has **no rental registration program**. Sagareus's only obligation for Tacoma properties is the **City of Tacoma Business License** via FileLocal, renewed annually at the end of December.

:::

## Program Basics

* **Program type:** City of Tacoma Business License (not rental-specific)
* **Portal:** [FileLocal](https://www.filelocal-wa.gov) — shared tax and licensing portal for Tacoma and other WA cities
* **Renewal cadence:** Annual; renewal due end of December
* **License grouping:**


:::tip
One license per owner covers all their Tacoma properties. When onboarding a new Tacoma property for an existing owner, check whether the owner already has a FileLocal account before creating a new one.

:::

* **Administering agency:** City of Tacoma, Tax and Licensing Division

## Verifying Tacoma Jurisdiction

Before any action, confirm the property is within Tacoma city limits via [Tacoma Parcel Analysis](https://parcelanalysis.cityoftacoma.org/). If outside Tacoma limits, no action required.

## FileLocal Account Convention

* **Account name:** `sagareus_<owner name>`
* **Legal business name:** must match owner on deed. Look up via [Pierce County Assessor-Treasurer Information Portal](https://atip.piercecountywa.gov/).
* **Mailing address:** Sagareus address.
* **User info:** Sagareus info.
* **Business type:** Sole Proprietorship.

## Payment


:::warning
Pay with **Vincent's SAGA CC** via FileLocal. Buildium bill entry memo must match verbatim: `Paid with Vincent's SAGA CC`.

:::

Buildium coding:

* `Pay To`: `City of Tacoma | Tax and Licensing Division`
* `Account`: `Licensing and Permits`
* `Unit`: `Property Level`
* `Description`: `Tacoma Business Registration`

Payment executed by **Team Lead — Kat** (Katrina Cabanela). She processes the payment in FileLocal and enters the bill.

> Note: future refactor should replace the hardcoded "Kat" reference with a Staff Directory role link.

## Tracking

* Update the `Rental Registration Expiration` custom field on [Property Settings](sops-2-property-settings.md). For Tacoma this tracks the business license expiration date (end of December).
* See [Update | Property Settings](../../sops/property onboarding/update-property-settings.md).

## Procedures

* [Setup](../../sops/utilities/registration-license-tacoma-setup.md) — new onboarding
* [Update](../../sops/utilities/registration-license-tacoma-update.md) — annual renewal (end of December)
* [Cancel](../../sops/utilities/registration-license-tacoma-cancel.md) — property leaves management

## Related Docs

* [Registration & License](sops-2-registration-license.md) parent
* [Property Settings](sops-2-property-settings.md)
* [Update | Property Settings](../../sops/property onboarding/update-property-settings.md)
