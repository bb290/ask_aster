---
title: "Registration & License"
service_line: utilities
doc_type: section-index
last_reviewed: 2026-05-01
---

:::info
This document is the single source of truth for city rental registration and business license procedures across Sagareus-managed jurisdictions in Washington. Rental inspection programs are tracked separately.

:::

Many Washington jurisdictions require a rental-specific registration in addition to (or instead of) a general business license. Registration is the act of recording a rental property with a city so it is allowed to be operated as rental housing — it is distinct from a general-purpose business license and from any recurring inspection program a city may also run.

This doc covers both rental registration and business license procedures. Rental inspection programs are tracked separately. See per-city subdocs below for the actual procedure for each jurisdiction we operate in.

Authoritative external reference: [RHAWA — Rental Registration and Inspection Programs](https://rhawa.zendesk.com/hc/en-us/articles/6042396217627-Rental-Registration-and-Inspection-Programs).

## Policies


:::warning
* Never let a rental registration lapse. If expired on handover, immediately request reinstatement and ask for a fee waiver.
* Registration is owner-level (not tenant-level). Cancel promptly when a property leaves management.
* The `Rental Registration Expiration` custom field (Property Settings project) must be updated after every new registration, transfer, renewal, or cancellation.

:::

## Reference — Jurisdictions

| City | Registration cadence | Fee structure | Portal | Status in this doc |
|------|----------------------|---------------|--------|--------------------|
| Seattle | Biennial (2 years)   | $110 per property + $20 per additional unit + 5% tech fee | [Seattle RRIO](https://www.seattle.gov/sdci/codes/licensing-and-registration/rental-registration-and-inspection-ordinance) | Documented         |
| Kent | Annual (2+ unit properties only; single-family exempt) | No registration fee; $15 per inspection report | [Kent Rental Housing Inspection](https://www.kentwa.gov/departments/econ-community-dev/rental-housing-inspection-program) | Scaffolded         |
| Burien | Annual Housing Business License | $315.29 – $945.87 per property (by unit count) | [Burien Rental Housing Inspection](https://www.burienwa.gov/city_hall/laws_regulations/renting_in_burien/rental_housing_inspection_program) | Scaffolded         |
| Lakewood | Annual               | Single-family $50; Multifamily $50 base + $20 per additional unit | [Lakewood Rental Housing Safety](https://cityoflakewood.us/rental-housing-safety-program/) | Scaffolded         |
| Mountlake Terrace | Annual               | $40 + $1.50 per additional unit | [Mountlake Terrace Business Licenses](https://www.cityofmlt.com/158/Business-Licenses) | Scaffolded         |
| Olympia | Annual registration + Business License (both required since March 2024) | $35 per unit/year registration; $50 entity one-time + $30 annual endorsement + $5 annual license renewal | [Olympia Rental Registry](https://www.olympiawa.gov/community/housing___homelessness/rental_registry.php) | Scaffolded         |
| Tukwila | Annual               | $88 – $357 per property (by unit count) | [Tukwila Rental Housing](https://www.tukwilawa.gov/departments/community-development/rental-housing/) | Scaffolded         |
| Tacoma | Annual (end of December) | Varies by gross revenue | [FileLocal](https://www.filelocal-wa.gov) | Documented         |
| Kirkland | Annual               | Varies        | [Kirkland Apply for a Business License](https://www.kirklandwa.gov/Government/Departments/Finance-and-Administration/Customer-Accounts/Apply-for-a-Business-License) | Documented         |
| Renton | Annual (expires 12/31) | Not specified in source | [Renton Rental Registration Form](https://forms.rentonwa.gov/Forms/RentalRegistration) | Documented         |

## Per-City Procedures

* [Registration & License // Seattle](sops-2-registration-license-seattle.md) — fully documented (Setup / Update / Cancel procedures live)
* [Registration & License // Kent](sops-2-registration-license-kent.md) — scaffolded (procedures TBD on first execution)
* [Registration & License // Burien](sops-2-registration-license-burien.md) — scaffolded (procedures TBD)
* [Registration & License // Lakewood](sops-2-registration-license-lakewood.md) — scaffolded (procedures TBD)
* [Registration & License // Mountlake Terrace](sops-2-registration-license-mountlake-terrace.md) — scaffolded (procedures TBD)
* [Registration & License // Olympia](sops-2-registration-license-olympia.md) — scaffolded (procedures TBD; dual-requirement reg + biz license)
* [Registration & License // Tukwila](sops-2-registration-license-tukwila.md) — scaffolded (procedures TBD; pre-rent inspection required)
* [Registration & License // Tacoma](sops-2-registration-license-tacoma.md) — documented (full Setup; Update partial pending Dec renewal; Cancel stub)
* [Registration & License // Kirkland](../../sops/utilities/registration-license-kirkland.md) — documented (full Setup; Update and Cancel stubs)
* [Registration & License // Renton](sops-2-registration-license-renton.md) — documented (full Setup; Update full (same form); Cancel stub)

*Seattle is the reference pattern. Scaffolded cities reuse the same trigger / prerequisite / procedure / email / next structure; fill in city-specific procedure steps on first execution and replace the scaffolding warning.*

## Related Docs

* [Property Settings](sops-2-property-settings.md) — where the `Rental Registration Expiration` custom field lives.
* [Update | Property Settings](../../sops/property onboarding/update-property-settings.md) — single source of truth for Property Settings field updates.
* [Onboarding Asana SOP](sops-2-onboarding-asana-sop.md) — step 18 triggers Registration Setup.
* Note: Rental registration inspection procedures are being refactored separately; legacy content remains in [City Rental Registration & Inspection](../../sops/utilities/city-rental-registration-inspection.md) until that work completes.

## Roles

* [Customer Service Specialist](../role-profiles/customer-service-specialist.md) — drives Setup / Update / Cancel workflows.
* [Admin Team Lead](../role-profiles/admin-team-lead.md) — processes city payments and records bills in Buildium.
