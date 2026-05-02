---
title: "Registration & License // Tacoma // Update"
service_line: utilities
sop_owner: brittany@sagareus.com
status: active
last_reviewed: 2026-05-01
visibility_tier: ic
version: 1
tags: [rental-registration, business-license, municipal, tacoma, registration-update]
created_but_never_updated: false
---

:::warning
This procedure is partial — documented from the known FileLocal renewal pattern but the specific portal steps are pending transcription at the next December renewal. Update this doc at the next execution.

:::

## Trigger

* City of Tacoma FileLocal renewal due annually at end of December.
* Watch for renewal notice via the FileLocal portal or to `mgmt@sagareus.com`.
* Executed by: [Customer Service Specialist](../../docs/role-profiles/customer-service-specialist.md) — payment step to **Team Lead Kat**.

## Prerequisites

* Confirm property is still under Sagareus management.
* FileLocal credentials (stored in Buildium notes per Setup convention or 1Password).
* Buildium access for bill entry.

## Procedure

* Log in to [FileLocal](https://www.filelocal-wa.gov) using the owner's `sagareus_<owner name>` account.
* Navigate to license renewal (exact path TBD — transcribe on next execution).
* Confirm active properties on the license.
* Submit renewal and proceed to payment.
* Payment handled by Team Lead Kat. Buildium coding:
  * `Pay To`: `City of Tacoma | Tax and Licensing Division`
  * `Memo`: `Paid with Vincent's SAGA CC` (verbatim)
  * `Unit`: `Property Level`
  * `Account`: `Licensing and Permits`
  * `Description`: `Tacoma Business Registration Renewal`
* Download renewed license PDF; upload to Buildium Property Summary.
* Update `Rental Registration Expiration` on [Property Settings](../../docs/section-indexes/sops-2-property-settings.md) to end of December of the new year.


:::info
Fill in the missing portal steps when processing the next Tacoma renewal.

:::

## Email templates

None.

## Next

* If the property leaves management, see `Registration & License // Tacoma // Cancel`.
* Parent: [Registration & License // Tacoma](../../docs/section-indexes/sops-2-registration-license-tacoma.md).
