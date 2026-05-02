---
title: "Registration & License // Seattle"
service_line: utilities
doc_type: section-index
last_reviewed: 2026-05-01
---

:::info
Seattle's rental registration program is called RRIO (Rental Registration & Inspection Ordinance). This doc covers the registration side; inspection is being refactored separately.

:::

RRIO is a biennial program administered by the Seattle Department of Construction and Inspections (SDCI). It applies to all rental properties located in Seattle and requires owners to register every two years. A subset of registered properties is selected each cycle through a lottery-based inspection program (inspection docs TBD).

## Program Basics

| Field | Value |
|-------|-------|
| **Cadence** | Registration valid for 2 years; renewal required every 2 years |
| **Fees** | `$110 per property + $20 per additional unit` plus `5% technology fee` |
| **Record Number format** | `0001-0000101` (4 digits / 7 digits, with hyphen) |
| **Administering agency** | Seattle Department of Construction and Inspections (SDCI) |
| **Authoritative reference** | [Seattle RRIO program page](https://www.seattle.gov/sdci/codes/licensing-and-registration/rental-registration-and-inspection-ordinance) |
| **RHAWA summary** | [RHAWA Rental Registration and Inspection Programs](https://rhawa.zendesk.com/hc/en-us/articles/6042396217627-Rental-Registration-and-Inspection-Programs) |

## City Portal

* Portal: [Seattle Services Portal](https://services.seattle.gov/Portal/Customization/SEATTLE/welcome.aspx)
* Login credentials are stored in 1Password.


:::tip
When searching for a property, enter only the street number and street name. Including the full address (with unit, city, ZIP) often returns zero results.

:::

## City Contact

* Email: [sci_rrio@seattle.gov](mailto:sci_rrio@seattle.gov)
* Used for: reinstatement requests, removal-from-portfolio requests, and general RRIO correspondence.

## Payment


:::warning
All Seattle RRIO fees are paid with **Vincent's SAGA CC**. The Buildium bill entry memo MUST match verbatim: `Paid with Vincent's SAGA CC`.

:::

* **Pay To:** `City of Seattle`
* **Account coding:** `Licensing and Permits`
* **Unit:** `Property Level` (not unit-level)
* **Description suffix:** `Seattle Rental Registration` (new) or `Seattle Rental Registration Renewal` (renewal)

The [Admin Team Lead](../role-profiles/admin-team-lead.md) role processes all Buildium bill entries.

## Record Storage

After every successful registration, transfer, or renewal:


1. Download the Rental Registration Record PDF from the city portal.
2. Upload it to the **Property Summary page in Buildium**.


:::tip
After an ownership transfer, the portal takes approximately 48 hours to reflect the updated record. Return to the portal after that window to download the updated registration record PDF.

:::

## Tracking

* The `Rental Registration Expiration` custom field lives on the [Property Settings](sops-2-property-settings.md) Asana project.
* It must be updated after every Setup, Update, or Cancel action.
* The canonical procedure for updating it is [Update | Property Settings](../../sops/property onboarding/update-property-settings.md).

## Compliance Declaration

The portal's `Declaration Information` step requires a compliance selection:

* **New registrations:** always pick `Inspected by Owner/Owner's Agent`.
* **Renewals:** branch on whether an inspection by a registered inspector is on file in Asana.
  * If yes → `Inspector`.
  * If no → `Owner/Owner's Agent`.

## Procedures

* [Registration & License // Seattle // Setup](../../sops/utilities/registration-license-seattle-setup.md) — covers new onboarding and takeover of a property (including expired-registration reinstatement).
* [Registration & License // Seattle // Update](../../sops/utilities/registration-license-seattle-update.md) — covers biennial renewal triggered by the city's expiry email to `mgmt@sagareus.com`.
* [Registration & License // Seattle // Cancel](../../sops/utilities/registration-license-seattle-cancel.md) — covers removal of Sagareus from the property's contact list when a property leaves management.

See the Setup / Update / Cancel subdocs under this page.

## Related Docs

* [Registration & License](sops-2-registration-license.md) — parent topic doc
* [Property Settings](sops-2-property-settings.md)
* [Update | Property Settings](../../sops/property onboarding/update-property-settings.md)
* [Onboarding Asana SOP](sops-2-onboarding-asana-sop.md)
