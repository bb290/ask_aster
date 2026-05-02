---
title: "Mailing"
service_line: renewal & rent increase
sop_owner: brittany@sagareus.com
status: active
last_reviewed: 2026-05-01
visibility_tier: ic
version: 1
tags: [renewal, rent-increase, notice-servicing, mailing, deadline, automation]
created_but_never_updated: false
---

Certified mailing of rent increase and renewal notices.

**Asana Project:** [Notice Mailing](https://app.asana.com/1/706990140225747/project/1213206896639105/list/1213209323219174)


---

## How It Works

* Mail notice tasks are created automatically by the [Automation](renewal-automation.md) worker and multi-homed into the Notice Mailing project
* Each task includes the address and mailing deadline
* Notices are mailed via certified mail to comply with WA service requirements

## Mailing Servicer - Valley Mail

* Contact Information
  * [info@valleymailduvall.com](mailto:info@valleymailduvall.com)
  * (425) 788 7441

**1. Document Preparation**

* Ensure all notices are finalized and saved in **PDF format**.
* File names must clearly match the corresponding tenant records.

**2. Address Collection & Formatting**

* Compile all recipient addresses in an **Excel spreadsheet** (one row per mailing record).
* Required columns:
  * Tenant Name(s)
  * Street Address Line 1
  * Street Address Line 2 (if applicable)
  * Apt/Unit Number
  * City
  * State
  * ZIP+4
  * PDF File Name(s)

**3. Address Verification (Critical Step)**

* Verify all addresses using: <https://tools.usps.com/zip-code-lookup.htm?byaddress>
* Ensure compliance with USPS standards:
  * Use abbreviations (e.g., **N instead of North**)
  * Include **Apt/Unit** (avoid using "#")
  * Provide **complete ZIP+4 codes**
* Note: Unverified or improperly formatted addresses may cause delays and additional processing time.

**4. Batch Scheduling**

* Notices must be grouped into **two (2) batches per month only**:
  * **1st batch:** 15th of the month
  * **2nd batch:** 30th of the month
* Ensure all notices are prepared and included **before the cutoff date** for each batch.

**5. Deadline Compliance**

* Carefully review each notice's **service deadline**.
* Assign the notice to the appropriate batch to ensure **mailing occurs in advance of the required service date**.
* If a deadline falls between batch dates, include the notice in the **earlier batch** to avoid late service.

**6. Batch Preparation**

* Upload all PDFs into a **shared folder** (Google Drive, Dropbox, etc.).
* Ensure files can be **downloaded in one click**.

**7. Submission to Valley Mail**

* Provide:
  * Link to the shared folder (PDF notices)
  * Completed Excel spreadsheet (verified addresses)
* For near-term shipments:
  * Continue submitting via **Asana** if needed

**8. Mailing & Tracking**

* Valley Mail will:
  * Process printing and postage through automation
  * Return the Excel file with an added **tracking number column** after mailing

**9. Task Completion**

* Wait for tracking information from Valley Mail.
* Update records with tracking details as needed.
* Complete the corresponding mailing task in **Asana**.

**10. Important Notes**

* Manual correction of unverified addresses may result in **additional charges** going forward.
* Standardized formatting and batching are required to support **efficient processing and cost control**.


:::success
**TODO:** [Renewal & Rent Increase Coordinator](../../docs/role-profiles/renewal-rent-increase-coordinator.md) to add detail about our primary mailing servicer — name, contact info, process, turnaround time. [Asana task](https://app.asana.com/0/1213774146836272/1213812831992791).

:::

## Backup Mailing Servicer — Paper Pusher

* Any documents that require proper service will be assigned to Paper Pusher via email.
  * Contact Information
    * [paperpushers@gmail.com](mailto:paperpushers@gmail.com)
    * (206) 779-0721


1. Prepare the document in PDF format.
2. Confirm the tenant's correct mailing address.
3. Identify the required service deadline.
4. Draft an email to Paper Pusher at **paperpushers@gmail.com** with clear instructions.
5. Attach the PDF document to the email.
6. Include the tenant's mailing address and service deadline in the email.
7. Send the request and retain a copy for records.
8. Monitor and wait for Service Declaration and attach to the Asana task.
9. Complete.


:::success
**TODO:** [Renewal & Rent Increase Coordinator](../../docs/role-profiles/renewal-rent-increase-coordinator.md) to add detail about Paper Pusher as our backup mailing servicer — when to use, contact info, process differences. [Asana task](https://app.asana.com/0/1213774146836272/1213812852317639).

:::
