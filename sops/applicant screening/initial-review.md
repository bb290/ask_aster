---
title: Initial Review
service_line: applicant screening
sop_owner: brittany@sagareus.com
outline_url: https://sagareus.getoutline.com/doc/initial-review-hBDQTgS9g9
status: active
last_reviewed: 2026-08-03
visibility_tier: ic
version: 2
tags: [applicant-screening, credit-check, background-check, criminal-check, income-verification, approval-decision, buildium, ask-aster]
created_but_never_updated: false
---

## Initial Application Processing


1. New Application notifications are received by [Leasing@sagareus.com](mailto:Leasing@sagareus.com)

### Create Asana Task


1. Leasing 2.0 Project | TASK TEMPLATE: <Application> // <names>
   * *Convert to Subtask of "LU / property address" task the prospect is applying for*


---

### Charge Application Fee // Application Fee Policy


:::warning
**Application Fee is charged immediately and is non-refundable.**

* If they submit an application, they will be charged $35/person.
* Regardless of how many applications were received
* Even if they change their mind
* This covers the Administrative costs

:::


:::info
**How to Process in Buildium:**

Buildium → Leasing → Applicants → Search Property → Choose Applicant → Click "Process Applicant Fee" button in upper right corner

:::


---

### Run Credit / Eviction / Criminal Background


:::info
**How to Order Screening in Buildium:**

Buildium → Leasing → Applicants → Search Property → Choose Applicant → Screening Tab → Click "Order Enhanced Tenant Screening"

:::


1. Complete Form
   * If current address is left blank, input Sagareus Office Address
   * If no SSN, input 111-11-1111
     * Initiate Enhanced Application Review
   * Employment: Update option
2. Click Review
3. Click Submit

#### Download / Update Screening to Application Profile


1. Within ~30 seconds, report will generate
2. Click 'View Report'
3. Click 'Print All Screening'
4. Credit / Background report will download
5. Once report is finalized, upload to Applicant Summary section


---

### Upload Income Verification Documentation


1. Download & upload all income verification documents to Buildium Applicant Summary section as received

#### Missing Income Verification

* If income verification is not uploaded to application → Request documents from applicant.

##### Email Template - Missing Income Verification


:::info
Send from leasing@sagareus.com

:::

> Hi [Applicant Name],
>
> Thank you for submitting your application! We're excited to begin the review process with you and appreciate your interest in becoming a resident.
>
> **Missing Income Verification**
> It looks like we're still missing one or more required document. Please reply to this email with the following as soon as possible:
> Your last two months of pay stubs (or alternate income verification)
>
> **How Applications Are Reviewed**
> Applications are reviewed in the order they are marked complete. If a fully qualified applicant is approved and signs the lease before your application is fully reviewed, you are not declined, it simply means another applicant secured the property first.
>
> Best regards,
> Mary + Bryan
>
> **Sagareus Leasing Support Team**
> leasing@sagareus.com
> Call/Text: 425-390-8122


---

## Initial Review


:::tip
**Summary:** Once all income verification is submitted, the Leasing Assistant completes the Initial Review looking for flags that require Enhanced Applicant Review. If no flags are found, the task is assigned to the Leasing Manager for approval.

:::


1. Once all income verification is submitted, Leasing Assistant completes the "Initial Review" of the application
2. Flags include:
   1. Credit Report
      * Mismatched or unavailable SSN
      * Mismatched name/DOB
      * Any accounts in collections
   2. Paystub Mismatch
      * Employer listed on application is different than employer listed on paystub
3. If any flags are identified, proceed to Enhanced Review


---

### Run the Screening Report (Ask Aster)


:::warning
**Ask Aster replaced the Sagareus Applicant Screening GPT and the Google Doc Underwriting Decision Report in August 2026.** Both are sunset. Do not use them.

:::


:::info
**Aster reads the Asana task, not the chat.** Every document Aster needs must be attached to the application task before you run it.

:::


1. Attach all documents to the Asana application task
   * Credit / background report
   * All proof of income documents
2. In Claude, run `/screening` and paste the Asana task URL
   * The task URL is the only input
   * Do not upload documents into the chat; if documents are missing, attach them to the task first
3. Aster reads the task, applies Sagareus screening criteria, and prints a draft report
   * Maximum approved rent is calculated for all three tiers (Lenient 2.0x, Standard 2.5x, Stringent 3.0x)
   * The report is property-agnostic; the Leasing Manager applies the tier matching the property
4. Review the draft → Did Aster flag anything you missed?
5. Aster asks once whether to add anything to Assistant Notes for Manager
   * Reply "no" to ship as-is, or paste your notes
6. Aster posts the report as a comment on the same Asana task, headed `READY FOR MANAGER REVIEW`
   * You do not create a PDF
   * You do not upload anything to Asana; Aster posts it


:::warning
**Old underwriting decision PDFs are skipped on purpose.** If a task still has an Underwriting Decision Report attached from the old workflow, Aster will ignore it and note that it did. The old system had known income calculation errors, so every figure is re-derived from source documents. Do not re-enter numbers from an old report.

:::


---

### Assign to Leasing Manager for Approval


:::warning
**Critical handoff point** — ensure all flags have been reviewed before assigning.

:::


1. If no flags are present, assign Application Task to Leasing Manager for approval / lease negotiation.
2. Leasing Manager will double check for flags
