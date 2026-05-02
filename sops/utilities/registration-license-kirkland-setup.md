---
title: "Registration & License // Kirkland // Setup"
service_line: utilities
sop_owner: brittany@sagareus.com
status: active
last_reviewed: 2026-05-01
visibility_tier: ic
version: 1
tags: [rental-registration, business-license, municipal, kirkland, registration-setup]
created_but_never_updated: false
---

:::info
Use this when onboarding a Kirkland property. Sets up (or adds endorsement to) a WA State DOR Business License for the owner with Kirkland endorsement.

:::

## Trigger

* Onboarding Asana template subtask `REGISTER | Rental Registration with City` when onboarding a Kirkland property.
* Executed by: [Customer Service Specialist](../../docs/role-profiles/customer-service-specialist.md) — payment step delegated to [Admin Team Lead](../../docs/role-profiles/admin-team-lead.md).

## Prerequisites

* 1Password credentials for MyDOR.
* Someone monitoring `mgmt@sagareus.com` for MFA codes during login.
* King County owner lookup info (eRealProperty).
* Buildium access for bill entry.
* Buildium rent roll for gross annual income estimate.

## Procedure


 1. Go to [Kirkland Apply for a Business License](https://www.kirklandwa.gov/Government/Departments/Finance-and-Administration/Customer-Accounts/Apply-for-a-Business-License).
 2. Click `Apply for your business license`.
 3. Log in to the DOR website; credentials in 1Password. SAW ID: **Sagareus LLC**.
 4. MFA code will be sent to [mgmt@sagareus.com](mailto:mgmt@sagareus.com). Retrieve and enter.
 5. In the MyDOR homepage, select `Apply for New Business License`.
 6. Select `I want to start a business with WA State`.
 7. Select `Sole Proprietorship` → `Confirm`.
 8. Under Purpose Questions, answer `No` to all then click `Next`.
 9. Enter owner details on the Sole Proprietor Information page. Match the owner information exactly as it appears on county records: [King County eRealProperty](https://blue.kingcounty.com/Assessor/eRealProperty/default.aspx).
10. Enter spouse details if available.
11. On DBA Name, skip and proceed.
12. On `Optional Coverage for Owners and Officers`: `No`.
13. Enter physical address (property address).
14. Business Mailing Address: `2265 116th Ave NE #200-8 Bellevue, WA 98004`.
15. Enter first date of business (first tenant move-in date from Buildium).
16. Enter estimated gross annual income (from Buildium rent roll).
17. Enter Sagareus information under Business Contact.
18. On additional business information, city, county, and business info pages, respond `No`.
19. Under the Kirkland Endorsement page, check Buildium for first move-in date and gross annual income.
20. On Activity Search, select `Apartment Rental`.
21. On Business Activity, select `Services`.
22. Independent Contractor Endorsement: `No`.
23. Pay registration fee.
24. [Admin Team Lead](../../docs/role-profiles/admin-team-lead.md) saves the receipt and enters the bill in Buildium. Buildium entry:
    * `Accounting` → `Bills` → `Record Bill`
    * `Pay To`: `State of Washington`
    * `Memo`: `Paid with Vincent's SAGA CC` (verbatim)
    * Select property address; `Unit`: `Property Level`
    * `Account`: `Licensing and Permits`
    * `Description`: `Kirkland Business Registration`
    * `Amount`: total amount paid

## Step — Update tracking

* Update `Rental Registration Expiration` on [Property Settings](../../docs/section-indexes/sops-2-property-settings.md) to the license expiration date.
* See [Update | Property Settings](../property onboarding/update-property-settings.md).

## Email templates

None required.

## Next

* Annual renewal. See [Registration & License // Kirkland // Update](registration-license-kirkland-update.md).
* Parent: [Registration & License // Kirkland](registration-license-kirkland.md).
