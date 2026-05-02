---
title: "Registration & License // Burien // Setup"
service_line: utilities
sop_owner: brittany@sagareus.com
status: active
last_reviewed: 2026-05-01
visibility_tier: ic
version: 1
tags: [rental-registration, business-license, municipal, burien, registration-setup, inspection-required]
created_but_never_updated: false
---

:::warning
This doc was scaffolded but not executed. Procedure and email templates are TBD — document on first execution. Reference `Registration & License // Seattle // Setup` for structural pattern.

:::

## Trigger

Onboarding Asana template step `REGISTER | Rental Registration with City` when onboarding a Burien property. Owner of action: [Customer Service Specialist](../../docs/role-profiles/customer-service-specialist.md).

## Prerequisites

* Confirm the property is in Burien jurisdiction.
* Portal credentials available in 1Password (if Sagareus has an account).
* Buildium access for bill entry.
* Identify a qualified inspector from Burien's approved list — inspection must occur before renting.

## Procedure

TBD — document on first execution. Reference `Registration & License // Seattle // Setup` for structural pattern. Migrate applicable existing content from the legacy doc (see Legacy Content callout on the city parent).

## Email templates

TBD — inline on first execution. See Seattle subdocs for blockquote format conventions.

## Next

Back to [Registration & License // Burien](../../docs/section-indexes/sops-2-registration-license-burien.md).

## Business License Side (DOR MyDOR)

Burien rental operations ALSO require a WA State DOR Business License with Burien endorsement. This flows through MyDOR, separate from the City of Burien Housing Business License procedure above.

**Procedure:** Follow the Kirkland DOR MyDOR flow documented in [Registration & License // Kirkland // Setup](registration-license-kirkland-setup.md), selecting the Burien endorsement instead of Kirkland. Everything else (SAW ID `Sagareus LLC`, MFA to `mgmt@sagareus.com`, Sole Proprietorship, business activity `Apartment Rental`, Business Activity `Services`) is identical.

**Buildium bill:** Same coding as Kirkland but change `Description` to `Burien Business Registration`.
