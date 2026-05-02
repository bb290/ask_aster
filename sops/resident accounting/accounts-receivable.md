---
title: Accounts Receivable
service_line: resident accounting
sop_owner: brittany@sagareus.com
status: active
last_reviewed: 2026-05-01
visibility_tier: ic
version: 1
tags: [accounting, finance-office, buildium, asana, returned-payment, ar, 1099]
created_but_never_updated: false
---
## Processing Application Fee Income

[Video Overview](https://www.loom.com/share/18bbb44fed45492a9f2511f6c3fb26bd)

 ![Processing Application Fee Income - Buildium banking screen](https://lh7-rt.googleusercontent.com/docsz/AD_4nXdr5SWOOnj269GOm5zbP6BKRiqH7r4RDV7xOAkyxfZ8xvcs_XhoUrxFMmGxpFHFYg4rVBJZr3U65uHk-Bl25FJyvkZ3mC9crFZbi8S4E-C3xV_v_bDXHGO-65ifc7sSvntuGgdmcztGfGn-775KcNkdy1bH?key=nnhKEmcP1_mvGVmGiinqRQ)


:::info
**Purpose**

To accurately reallocate tenant application fees received in the company operating account (Bank of America EFT account) from property-level entries to company-level **application fee income** for proper excise tax reporting and financial accuracy.

This process removes property-specific application fee transactions and consolidates them into a single company-level income entry each month.

:::

**Scope**

Applies monthly to all application fee transactions recorded in Buildium for the prior month (typically 30–40 entries).

These fees are collected from tenants/potential tenants to cover the cost of running applications through Buildium.


:::warning
**Key Principles & Rationale**

* Application fees are paid by tenants but charged to the company by Buildium — funds initially deposit into the **company operating account**.
* Transactions are automatically associated with the property the applicant applied to.
* For accurate excise tax reporting and company-level income recognition, these must be **moved out** of property-level accounts and recorded as **company application fee income**.
* The process creates a **contra transaction** (zero net cash movement) that shifts income from property level to company level.
* This does **not** affect owner-facing reports, as it is a management income account.

:::

**Prerequisites**

* Access to Buildium accounting and banking modules.
* Two screens/windows open:
  * Main **Banking → Balance Breakdown** for the Bank of America operating account.
  * **Accounting → Transactions** or **Record Transaction** screen.
* Current month-end date for accurate recording (e.g., last day of January for January fees).


---

### Step-by-Step Procedure


:::info
**1. Review Application Fee Transactions**

* Navigate to **Banking** → select **Bank of America Operating Account** (EFT account).
* Open **Balance Breakdown** or transaction list.
* Filter or review entries dated within the prior month.
* Identify all **application fee** deposits (typically 30–40 entries).
* Note the total amount of application fee income to be reallocated (e.g., $280 remaining after individual adjustments).

:::


:::info
**2. Record Individual Property-Level Offsets (Contra Entries)**

For **each** application fee transaction:


1. Click **Record Check** (or **Record Other Transaction**).
2. Set date to the **end of the month** being reconciled (ensures correct monthly reporting).
3. Payee: **Segarius** (or company name as appropriate).
4. Enter the **property address** associated with the original transaction (e.g., "1767 16th Avenue C").
5. Amount: Enter the exact application fee amount (e.g., $70).
6. Category/Account: Select **Application Fee Income** (should auto-populate after entering property).
7. Property: Select the correct property.
8. Add any necessary memo (optional, but consistent memos help tracking).
9. Save the transaction.

Repeat for **every** individual application fee entry from the month.

Keep a running total of the amounts processed (e.g., leave the total visible on screen).

:::


:::info
**3. Record the Consolidated Company-Level Income Entry**

Once all individual property-level entries are offset:


1. Go to **Record Other Transaction**.
2. Date: Same end-of-month date used above.
3. Property: Select **Company** (not a specific property).
4. Category/Account: **Application Fee Income**.
5. Amount: Enter the **total** remaining application fee income for the month (e.g., $280).
6. Memo: Optional (e.g., "January Application Fee Income – Consolidated").
7. Save the transaction.

:::


:::info
**4. Verify the Contra Effect**

* Return to the **Bank of America Operating Account** balance breakdown.
* Confirm that the net effect is **zero cash movement** (outflow from individual property offsets is exactly offset by the company-level income entry).
* The result is a clean shift of income from property-level to **company management income** accounts.

:::


:::info
**5. Reconcile Before Excise Tax Filing**

* Perform full reconciliation of all company accounts.
* Confirm no lingering application fee transactions remain tied to properties.
* Verify the total company application fee income matches expectations for excise tax reporting.

:::


---


:::tip
**Best Practices & Reminders**

* Perform this process **monthly**, ideally shortly after month-end.
* Always use the **end-of-month date** for all transactions to align with tax reporting periods.
* Track the running total of individual offsets to ensure the final consolidated entry matches exactly.
* This is a **contra process** — no actual money moves; it is purely an accounting reclassification.
* Keep the process accurate — errors can affect excise tax filings and company financial reporting.
* If unusually high volume (40+ entries), consider batching or using reports to cross-check totals.

:::

**Post-Process Actions**

* Save/export screenshots or reports of the reallocated amounts for audit trail.
* File excise tax returns using the correctly reported company-level application fee income.
* Monitor the operating account balance breakdown monthly to ensure application fees are not accumulating.

This SOP section fully captures the process demonstrated in the video, including the dual-screen workflow, the use of contra entries, and the focus on excise tax accuracy.


---

## Processing Desk Fee Income

[Video Overview](https://www.loom.com/share/b80fc2383be24187a5852639965c8961)

 ![Processing Desk Fee Income - Buildium income statement](https://lh7-rt.googleusercontent.com/docsz/AD_4nXej2Let8esR-jKSBuwOAzjLoiWOwXeO5D1RM0K35V2exKNTjX6s0mTIV-ybF_Qf9KVunXEgKnfQw9A6lokpuco8upsqIcMJ2-vgRPxC5yvqH7nczJl2IGUmaV4k_IyZMZOb2EZ5FKyDrxToihD1LFRZGg?key=nnhKEmcP1_mvGVmGiinqRQ)


:::info
**Purpose**

To properly recognize and reallocate internal **desk fees** (fees charged to Segarius real estate brokers for desk/office usage) from the default property-level income (e.g., "228" or similar placeholder) to the correct company-level income account ("Segarius Office – Desk Fees"), ensuring:

* Accurate income statement (Brokers Division shows correct income)
* No lingering "missing" or misallocated balances on placeholder properties
* Clean bank reconciliation (via contra entries)
* Proper company-level reporting without affecting owner-facing statements

:::

**Scope**

Applies to **all internal desk fee transactions** recorded in Buildium for Segarius brokers.

These fees are company income (not property-specific) and follow the same reallocation logic as application fees.

**Responsibility**

* Primary: Accounts Receivable / Bookkeeper
* Review: Manager (if large amounts or recurring discrepancies)

**Prerequisites**

* Desk fee transaction(s) visible in Buildium banking or billing (often auto-recorded under placeholder property like "228" or office address)
* Access to Buildium banking and transaction recording
* Correct line item: **Desk Fees** (under Segarius Office income accounts)


---

### Step-by-Step Procedure


:::info
**1. Identify Desk Fee Transactions**

In Buildium:

* Go to **Banking** → select the operating/checking account where fees deposit.
* Or go to **Billing** → filter for open/unpaid or recent transactions.

Look for:

* Vendor/Payee: Segarius Office, Broker name, or similar
* Description/Memo: "Desk fees," broker name, amount (e.g., $198)
* Property incorrectly assigned (e.g., "228," placeholder, or office address)

Confirm total matches expected broker desk fee (e.g., monthly/quarterly amount).

:::


:::info
**2. Offset the Incorrect Property-Level Entry (Contra – Step 1)**


1. Go to **Accounting → Record Transaction** (or **Record Other Transaction**).
2. Set date to match original transaction or month-end (for correct period).
3. **Payee**: Segarius Office (or same as original).
4. **Property**: The incorrect/placeholder property (e.g., "228" or current assignment).
5. **Amount**: Full desk fee amount (e.g., $198).
6. **Category / Account**: Desk Fees (or same income account it originally posted to).
7. **Memo**: "Contra – Reallocate desk fee from property to Segarius Office"
8. Save.

This removes the fee from the wrong property balance.

:::


:::info
**3. Record the Correct Company-Level Income (Contra – Step 2)**


1. Create a second **Other Transaction** (same date as Step 2).
2. **Payee**: Segarius Office.
3. **Property**: **Segarius Office** (company-level, not a specific property).
4. **Amount**: Same desk fee amount (e.g., $198).
5. **Category / Account**: **Desk Fees** (company income line item).
6. **Memo**: "Desk fee income – \[Broker Name\] – \[Month/Period\]"
7. Save.

Result:

* Net cash movement = $0 (contra pair).
* Income shifts from property-level → company-level Brokers Division.
* Placeholder property balance clears.
* Reconciliation shows two contra entries offsetting each other.

:::


:::info
**4. Verify Income Statement & Reconciliation**

* Run **Income Statement** (Reports → Income Statement):
  * Check Brokers Division → desk fee income should now appear correctly.
  * Placeholder property income should be $0 (or reduced).
* Go to **Banking** → select account → **Reconcile**:
  * Confirm contra entries appear and net to zero.
  * Reconcile normally — no lingering discrepancy from desk fees.

:::


---

## Processing Deposited Funds to Owner Operating

[Video Overview](https://www.loom.com/share/da1b16757ef247b49acc4ff7bfefe742)

 ![Processing Deposited Funds - Buildium balance breakdown](https://lh7-rt.googleusercontent.com/docsz/AD_4nXevLZU_eqn-irkKpyJEAzfzXzmbYQB-CE_9i-tPf3LY9UEcTLjBxqRYzv9WYQCnsvRMiAca8ktT5Y-4orPaAJSHMkfQlfHuzrJzQumVFfbtgg1zKEpLIiBEEEoFO3BQ0DeHZGMqAwqb6SASIGwkqLm1t0FH?key=nnhKEmcP1_mvGVmGiinqRQ)


:::info
**Purpose**

To transfer funds accumulated in the Mobile Deposit Account (account 106) to the correct property-specific operating bank accounts after checks/money orders have been received, deposited via mobile deposit, and recorded to the appropriate property ledgers.

:::

**Overview**

* Leasing coordinators deposit all incoming checks/money orders (regardless of property) into a single **Mobile Deposit Account**.
* They record each deposit to the correct property ledger immediately after mobile deposit.
* This causes funds to accumulate in the Mobile Deposit Account (often reaching high balances, e.g., $50,000+).
* Accounting reconciles the account first, then transfers the exact recorded amounts to each property's operating bank account.
* Goal: Clear the Mobile Deposit Account balance breakdown so only non-property or residual items remain (if any).

**Prerequisites**

* Mobile Deposit Account reconciled (statement balance matches accounting balance).
* Access to the accounting system (BXN / property management software).
* Access to online banking (usually Bank of America) for actual transfers.
* Multiple browser tabs open:
  * Balance Breakdown view of Mobile Deposit Account
  * Property search / profiles
  * Bank transfer screen


---

### Step-by-Step Procedure


:::info
**1. Confirm Reconciliation is Complete**

* Open the **Mobile Deposit Account** (account 106).
* Perform or verify a recent bank reconciliation.
* Ensure the reconciled balance matches the actual bank statement (e.g., $56,659.89 in accounting = $56,659.99 in bank, minor differences due to timing/rounding).
* All checks recorded to properties should be cleared and matched.

:::


:::info
**2. Review the Balance Breakdown**

* Navigate to the Mobile Deposit Account.
* Go to the **Balance Breakdown** tab.
* Filter to show all properties with positive balances (these are funds waiting to be transferred to their operating accounts).

:::


:::info
**3. Identify the Target Operating Account for Each Property**

For each property listed in the Balance Breakdown:

* Search for the property (e.g., "423 Second Street" or "428 First Avenue").
* Open the **Property Profile** (house icon).
* Note the **Operating Bank Account** number (e.g., 47, 433, etc.).

:::


:::info
**4. Record the Transfer in the Accounting System**


1. In the accounting system, go to **Record Other Transaction** (or equivalent).
2. Select the **Property** (e.g., 423 Second Street).
3. Set **From** account: Mobile Deposit Account (106).
4. Set **To** account: the property's Operating Bank Account (e.g., 47).
5. Enter the **Amount**: exact balance shown for that property in the Balance Breakdown (e.g., $1,900 or $1,328).
6. Leave the **Memo** line **blank**.
7. Save the transaction (use **Save and Add Another** to keep the form open for the next one).

:::


:::info
**5. Perform the Actual Bank Transfer**


1. Log in to online banking (Bank of America or relevant bank).
2. Initiate a transfer:
   * From: Mobile Deposit Account (e.g., account ending 2487).
   * To: Property's Operating Account (e.g., account 47 or 433).
   * Amount: match the exact amount recorded in step 4.
3. Double-check amounts, account numbers, and property alignment.
4. Complete the transfer.

:::


:::info
**6. Verify and Refresh**

* Return to the accounting system.
* Refresh the **Balance Breakdown** page for the Mobile Deposit Account.
  * Tip: Toggle between tabs (e.g., Reconciliation → back to Balance Breakdown) as a quick refresh alternative.
* Confirm the property's balance has disappeared (now zeroed out).

:::


:::info
**7. Repeat Until Complete**

* Work through every property shown in the Balance Breakdown.
* Continue until the Mobile Deposit Account balance breakdown shows **zero property-specific balances** (or only non-property/residual items, if applicable).

:::


---


:::warning
**Important Notes**

* Always transfer the **exact amount** shown in the Balance Breakdown — no rounding or estimation.
* Memo line remains **blank** to avoid confusion during future reconciliations.
* The funds are already correctly allocated to the property ledger when the leasing coordinator recorded the deposit — this step is purely moving cash to the right operating account.
* If a property profile shows a different operating account than expected, verify before transferring.
* Perform this process regularly (e.g., bi-weekly or monthly) to prevent excessive buildup in the Mobile Deposit Account.

:::

**Frequency**

As needed, typically when the Mobile Deposit Account balance grows significantly (e.g., every 1–2 weeks or when balance exceeds a threshold).


---

## How to Pay Company Bills

[Video Overview](https://www.loom.com/share/e2acd9ec5dfc40d3b03745572efaf349)

 ![How to Pay Company Bills - Buildium billing screen](https://lh7-rt.googleusercontent.com/docsz/AD_4nXf8pA_TwuW-GLhDsQ-5aOlc56jZeIoEbeVYkT4DhT8rHLv-LxZVEk9w_jXJ6OUJ2IXZIBZuUe5AkfjdeIpKfRe4uXkjDM_7T64aNiUgILH6fnacjDmmj_friFcf5ykMqq2SO7lEbEKTEnc-y4i0R29o4Qd0?key=nnhKEmcP1_mvGVmGiinqRQ)


:::info
**Purpose**

To accurately pay company-level bills owed to Sagarius (company-specific vendor) while correctly recording both the expense payment and the corresponding income receipt in Buildium. This ensures 100% reconciliation accuracy between bank accounts and financial statements.

:::


:::warning
**Key Principle & Important Notes**

* Segarius bills **cannot be paid via EFT** — previous attempts resulted in persistent reconciliation issues.
* All Segarius payments **must be made by physical check**, processed one by one.
* These bills require **special double-entry accounting** in Buildium:
  * Record the payment (outflow from operating account).
  * Simultaneously record the corresponding **income receipt** (to reflect company-level income).
* Accuracy is critical — these accounts are **heavily monitored**. Errors in classification or memo duplication cause reconciliation problems.
* Segarius bills typically represent company-level charges (e.g., annual property inspections, other operational or management fees).

:::

**Scope**

Applies to all open bills payable to **Segarius** appearing in the Buildium billing screen.

**Prerequisites**

* Access to the **billing screen** in Buildium.
* Access to the relevant **bank accounts** (especially the operating account, e.g., account 405).
* Physical check stock and ability to print/write checks.
* Familiarity with double-entry recording for company-level income.


---

### Step-by-Step Procedure: Paying a Segarius Bill by Check


:::info
**1. Navigate and Filter in Buildium**

* Go to the **Billing screen**.
* Filter to show only bills for the vendor **Segarius** (usually only one vendor matches).
* Review open bills (e.g., February, March, April if current month is February).

:::


:::info
**2. Select and Initiate Payment**

* Open the specific bill to pay.
* Click **Pay Bill**.
* **Do not** select EFT — payment method must be **Check**.

:::


:::info
**3. Specify Payment Details**

* Select the correct **bank account** to draw the check from (e.g., account 405 – Operating).
* Enter the payment amount (e.g., $75).
* Note: This step records the **outflow** (expense/transfer).

:::


:::warning
**4. Perform Required Double-Entry to Record Income**

This is the **critical step** where most errors occur — do not skip or misclassify.

Add line items to represent the **receipt of income** (re-declaring the funds as company income):


1. **Category / Account**: Select the appropriate income category:
   * Operations Income
   * Lease Income
   * Renewal Income
2. **Amount**: Match the exact payment amount (e.g., $75).
3. **Description / Memo**: Clearly describe the nature of the charge (e.g., "Annual property inspection").

**Duplicate the memo** exactly in both the payment and income lines for audit trail and reconciliation clarity.

:::


:::info
**5. Finalize Bank Transaction and Recording**

* Confirm the transaction reflects **both** sides correctly:
  * Payment outflow from operating account (check).
  * Income receipt into the appropriate income category.
* Save and record the bank transaction.
* Print or hand-write the physical check for the exact amount.

:::


:::info
**6. Repeat One by One**

* Process **each Segarius bill individually** — never batch or bulk.
* Work through open bills in priority order (e.g., oldest first, or up to the current month + next month if appropriate, such as paying February through April in early February).

:::


---

## Review + Process Incoming Invoices

[Video Overview](https://www.loom.com/share/15ea91924cbb4b07b640d7c61af45a7c)

 ![Review + Process Incoming Invoices - Buildium invoice entry](https://lh7-rt.googleusercontent.com/docsz/AD_4nXeH7CZflj2JjJrekT8sk3Hh9Yne3vaw23PgeYm-DnP60oV-JI4Y9C0dgofYNhX0OFgFv8Jy4Q9Pq3Wp1g4m0ZxJnUhXyNTp5NJrNZLXdE-Y8H12ZdjSC_XnlSkgiQucjubHRfYaU8XkSi4XKxRqO_sIMvXm?key=nnhKEmcP1_mvGVmGiinqRQ)


:::info
**Purpose**

To securely monitor the **billing@sagarius.com** inbox, detect and prevent fraud, accurately input legitimate vendor invoices into Buildium, initiate required approvals or escalations via Asana, notify the internal team via reply-all, and ensure no invoices are missed or duplicated — all while maintaining 100% accuracy and compliance with proof-of-work, line item, and approval standards.

:::

**Scope**

Applies to **every email** received at billing@sagarius.com containing vendor invoices, estimates, or billing-related requests.

\~80–90% of volume is from established vendors; new vendors or suspicious emails require extra scrutiny.

**Responsibility**

* Primary: Accounts Receivable / Invoice Processor (Jody)
* Fraud/Approval Escalation: Manager (you), [Lead Accountant](../../docs/role-profiles/lead-accountant.md), [Operations Manager](../../docs/role-profiles/operations-manager.md), [Office Manager](../../docs/role-profiles/office-manager.md) (as assigned)
* Oversight: Full accounting team receives reply-all confirmations

**Prerequisites**

* Access to:
  * billing@sagarius.com inbox (Gmail)
  * Buildium (Billing screen, property profiles, vendor records)
  * Asana (Outstanding Bills project + templated tasks)
* OnePassword or equivalent for secure card/banking details (if needed later)
* Four-window setup recommended: Gmail + Buildium + Asana + Downloads/Processed folder


---

### Core Principles – Fraud Prevention & Red Flags (Highest Priority)


:::warning
* This inbox is a **high-risk target for fraud** (fake invoices, BEC scams, hacked vendor emails).
* Always assume suspicious emails are fraudulent until verified.
* **Never** click links in suspicious emails — screenshot instead.
* **Never** change banking details, payment methods, or send funds based on email alone — escalate immediately.
* **Red flags** (escalate to manager/[Lead Accountant](../../docs/role-profiles/lead-accountant.md) via screenshot + forward to spam):
  * Email from personal/free domains (e.g., gmail.com, hotmail.com) for business vendors
  * Urgent requests for payment, gift cards, wire transfers, or immediate action
  * Requests to change bank account / payment method
  * BCC-only or missing expected recipients
  * Grammatical errors, odd phrasing, mismatched sender name/email
  * No proof of work (especially maintenance vendors)
  * New/unknown vendors without prior history
* If anything feels "off" → screenshot email (no links), mark as spam, forward screenshot to manager/[Lead Accountant](../../docs/role-profiles/lead-accountant.md) with note.

:::


---

### Step-by-Step Procedure – Daily Workflow


:::info
**1. Monitor & Triage Inbox**

* Check billing@sagarius.com multiple times daily (aim for real-time during work hours).
* Open each new/unread email.
* Quick fraud scan (red flags above).
  * If suspicious → screenshot, mark spam, escalate (do **not** forward original email).
  * If legitimate-looking → proceed.

:::


:::info
**2. Verify & Download Invoice**

* Confirm:
  * Recognized vendor (history in inbox / Buildium)
  * Matches expected work (property, service type)
  * Includes proof of work (photos, detailed description) – required for most maintenance vendors
* Download invoice/attachment (PDF, screenshot of email if no formal invoice).
* Move file to **Processed** folder (never leave in Downloads).

:::


:::info
**3. Input Invoice into Buildium**


1. Go to **Accounting → Bills → Record Bill**.
2. Upload PDF/screenshot.
3. Populate fields:
   * **Vendor**: Search/select existing (escalate if new – see New Vendor SOP)
   * **Reference Number**: Invoice number + " // " + date received (e.g., 12345 // 02-26-2026)
     * If no invoice number → use service address + date or email subject
   * **Property**: Search/select correct property (verify service address matches)
   * **Line Item / Account**: Choose from approved list only (default: Maintenance & Repairs)
     * Cleaning → Cleaning
     * Landscaping, exterior → Exterior
     * Fire/safety → Fire & Safety
     * Pest control → Pest Control
     * Turnover → Turnover
     * Catch-all → Maintenance & Repairs
   * **Description**: Concise, formal summary from invoice (copy key details, compress if needed)
     * Example: "Landscaping, dumping trash, pressure wash driveway, tree trimming"
     * Use AI (Gmail "Help me write", Grok, Gemini) if helpful for formalizing
   * **Amount**: Total due (ensure matches invoice)
   * **Due Date**: Vendor due date or internal priority
4. Attach invoice/proof-of-work photos.
5. Save bill.

:::


:::info
**4. Check for Duplication**

* Go to **Paid Bills** & **Unpaid Bills** reports.
* Filter: same property, recent dates, same vendor.
* Compare invoice number, amount, description, unit.
* If duplicate → launch **Bill Investigation** in Asana (attach both).

:::


:::info
**5. Apply Approval / Escalation Rules**

* **Over $800** → must have proof of work + approval
  * Launch **Asana templated task**: "Approval Needed – \[Vendor\] – \[Property\]"
  * Upload invoice/photos
  * Comment: brief summary + Buildium bill URL
  * Assign to [Operations Manager](../../docs/role-profiles/operations-manager.md) (or current approver)
* **Deposit / Partial Pay Required** → launch **Asana task** to [Office Manager](../../docs/role-profiles/office-manager.md)
* **Missing Proof of Work** (maintenance vendors) → reply to vendor: templated message requesting photos
* **Other Issues** (new vendor, suspicious, insufficient details) → launch **Bill Investigation**
* Edit Buildium bill memo

:::


:::info
**6. Notify Internal Team**

* Reply-all to original email.
* **Remove vendor** from recipients (only billing@sagarius.com + team remains).
* Attach screenshot of invoice (or full PDF if small).

:::


:::info
**7. Final Cleanup and Next Steps**

* Move email to processed folder or archive.
* Monitor Asana for approvals/resolutions.
* When approved → edit Buildium memo: "Approved for Payment – \[Date\]"
* Proceed to payment per payment SOPs (EFT, credit card link, check, etc.).

:::


---


:::tip
**Best Practices & Reminders**

* **Fraud first** — if in doubt, screenshot & escalate (never click links).
* **Proof of work mandatory** for maintenance vendors — photos/descriptions required.
* **Descriptions** → concise, formal, owner-friendly (will appear on owner statements).
* **Limit line items** → stick to approved list; default to Maintenance & Repairs.
* **Reply-all** after input → critical for team visibility and prevents duplication.
* **Asana tasks** → use templates; always paste URL in Buildium memo.
* **New vendors** → escalate before input (W9, vendor setup needed).
* **Initial goal** — 100% input + escalation when needed; process improvement comes later.

:::


---

## Fraud Prevention


:::warning
* billing@sagareus.com is a frequent target for fraud.
* Always verify the sender's email domain — be suspicious of non-business domains (e.g., Gmail, Yahoo, Outlook).
* Never change payment methods or banking information based on email alone.
  * Any request for payment changes must be independently verified by phone using a known, trusted number (not from the email).
* Do not open attachments or click links in any suspicious emails.

:::

### Review for Red Flags

* Urgent requests or pressure for immediate payment
* Poor grammar or generic greetings
* Missing property details or vague invoice descriptions
* Always confirm new vendors, updated banking details, or payment instructions with Accounting before taking action.
* If anything seems off, create a task assigned to [Accounting Manager](../../docs/role-profiles/accounting-manager.md) with an immediate due date and do not process the payment.


---

## Audit Invoice Complete


:::info
An invoice must satisfy these requirements before it can be added to Buildium without approval:


1. Invoice is less than $800
2. The invoice has proof of work - pictures or report
3. The invoice is not already in the system
   * Verify by filtering in BD by property and vendor
   * Look out for bills with similar description or similar amount
   * Escalate if existing bill has partial payment or deposit in the memo

:::


---

## Audit Vendor Profile


:::info
A vendor profile must satisfy these requirements before it can be added to Buildium:


1. The vendor exists in BD
2. The vendor has W9 on file
   * Under the vendor's profile there is a "1099" section where you can see if there is tax information entered. If it is blank, we do not have their W9.

:::

### Failed Audit


1. **IF** the vendor fails the requirements above:


   1. Create a tracking task in [Finance & Office](https://app.asana.com/1/706990140225747/project/1206627942064331/list/1206627972779236) project so we don't forget to process the bill. Assign to self with immediate due date.
   2. Send/respond to vendor with appropriate response below.
2. **IF** the bill amount exceeds $1,000, create a tracking task in the [Finance & Office](https://app.asana.com/1/706990140225747/project/1206627942064331/list/1206627972779236) project and assign it to [Operations Manager](../../docs/role-profiles/operations-manager.md) for approval.

#### Email Template — Remind Vendor of Missing W-9

> We are processing your payment and noticed that your W9 form is missing from our records. A valid W9 is required to process any payments and remain in compliance with our vendor policy.
>
> Please provide your [completed W9](https://drive.google.com/file/d/1gz-xCH0KbPIQ1KG2fjBCsixThwCQjGXW/view?usp=sharing) at your earliest convenience to avoid any delays in payment.
>
> If you have any questions or need assistance with this process, please let us know.
>
> Thank you for your attention to this matter.
>
> Best regards,

#### Email Template — Remind Vendor to Provide Proof of Work

> To process your invoice, we need proof of work (photo or brief description).
>
> If none is available for this job, please include proof with all future invoices as required by our policy.
>
> Thank you,

### Scenario: Vendor Requesting Deposit or Partial Payment

When vendors issue a bill requesting for partial payment or deposit:

* Create a tracking task in the [Finance & Office](https://app.asana.com/1/706990140225747/project/1206627942064331/list/1206627972779236) project and assign it to the [Maintenance Coordination Lead](../../docs/role-profiles/maintenance-coordination-lead.md) for approval.
* Once approved, update bill memo to indicate "Deposit requested, maintenance confirmation prior to rest of payment"
* Make the payment
* [Maintenance Coordination Lead](../../docs/role-profiles/maintenance-coordination-lead.md) continues to monitor the task, once job is complete, assign back to [Office Manager](../../docs/role-profiles/office-manager.md) to pay the remaining balance


---

## Add Invoice to Buildium


:::info
Once invoice & vendor have met all requirements for payment:


1. Enter the bill to Buildium for payment
2. Buildium → Accounting → Bills → Record Bill

:::

### Required Fields

**Due date**

Set to the due date specified on the invoice. If none specified, automatically set to 48 hours out.

**Pay To**

The vendor name.

**Reference Number**

Unique identifier for the bill:

* e.g.) Account # + Invoice Date
* e.g.) Account # + Service Period

**Property**

The property associated with the work.

**Account**

Match the job type to the corresponding account. All maintenance related line items have been consolidated into the following items:

| Account |
|---------|
| Appliance Repairs |
| Appliances |
| Cleaning |
| Electrical Repairs |
| Elevator Service |
| Exterior and Site Maintenance |
| Fire & Safety |
| HVAC    |
| Maintenance & Repairs |
| Pest Control |
| Plumbing |
| Turnover |

**Examples**

* *Labor - General Contractor (Default if no match below)*
  * *J&J Construction, OVPS*
* *5106 Cleaning*
  * *Rainier Cleaning, Monte Vista Cleaner*
* *5120 Elevator Service*
  * *West Coast Elevator*
* *5111 Fire & Sprinkler*
  * *e.g.) AAA, The Safety Team*
* *6076 - Pest Control*
  * *e.g.) Rainier Pest Control, Bulwark*
* *Appliance Repairs*
  * *e.g.) A-Fix, SPS, Arnold*
* *Labor - Electrical Repairs*
  * *e.g.) West Seattle Electric, EMS, All Region*
* *Labor - Roof / Gutters*
  * *e.g.) Diamond Roofing*
* *Labor - 6075 HVAC*
  * *e.g.) Alexander's Heating*
* *Labor - Landscaper*
  * *e.g.) Jairo, Erick's landscaping, Michael Landscaper*
* *Labor - 5110 Plumbing*
  * *e.g.) Home Services Plumbing*

**Description**

Description line is visible to property owner - make as detailed as possible to prevent questions.

* If the invoice has one liner that can fit in the line description, use it
* If the invoice work can't fit on the line, condense the description to list the work completed, order from most expensive and end with "and ..."

**Upload**

* Invoice
* All photos / documentation / proof of work

### Optional Fields

**Memo**

Can be empty if no special instructions.

* e.g.) Pay 50% deposit, maintenance confirm before paying remaining balance

**Unit**

* If a bill has multiple units, add separate line item for the different units - divide the total amount by the number of units
* If common area, no unit needs to be specified
