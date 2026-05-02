---
title: Accounts Payable
service_line: vendor accounting
sop_owner: brittany@sagareus.com
status: active
last_reviewed: 2026-05-01
visibility_tier: ic
version: 1
tags: [accounting, finance-office, buildium, asana, late-fee, utility-passthrough, returned-payment]
created_but_never_updated: false
---
## How to record a paper bill

[VIDEO OVERVIEW](https://www.loom.com/share/b21b3c3c94cc4a83a029fe58ed410b33)

 ![Bill recording overview](https://lh7-rt.googleusercontent.com/docsz/AD_4nXeb7g79JBiuhPnxv4xiguMy72KBPmgBUTzYlr_jt33AW7UeiAx0hvx7bVvWD2k3aZVmjxOBtunDEXAdD4bcdm1bIFOdQmqK0pvvr7P_mOiWjGFZvoyjwj9GJBFTYG-9cZio4dUsLF7kMn7xpsCu_mfaxtK3?key=nnhKEmcP1_mvGVmGiinqRQ)

**Purpose**

To accurately and efficiently convert paper utility bills (and other mailed bills) received at the Segarius office into digital records in Buildium, attach them correctly to the right property, set internal due dates, queue them for payment, and automatically route tenant pass-through charges via Asana — all with 100% accuracy to prevent duplicate payments, missed charges, late fees, or incorrect tenant billing.

**Scope**

Applies to **all paper-mailed bills**, with \~95% being utility bills (water, sewer, garbage, gas, electric, etc.).

Covers \~30–35 bills per day (\~1,000 per month).

**Responsibility**

* Primary: Accounts Payable / Bill Processing Specialist
* Escalation: Launch "Bill Investigation" task in Asana for any anomalies

**Prerequisites**

* Four windows open and visible on screen (optimal screen management):
  * **Sagarius Office Scans** Google Drive folder (source of unprocessed bills)
  * **Buildium** – Accounting → Bills → Record Bill screen
  * **Asana** – Utility Pass-Through / Bill Intake form/tool
  * **Downloads** folder (clean/empty at start of session)
* Company internal rule: All utility bills have an **internal due date exactly 7 days before** the utility's stated due date (e.g., utility due 3/16 → internal due 3/9).


:::info
### Step-by-Step Procedure (One Bill at a Time – 100% Accuracy Rule)


1. **Prepare Workspace**
   * Clear **Downloads** folder completely (delete or move old files).
   * Keep all four windows visible and arranged for minimal clicking/toggling.
2. **Select & Download Next Bill**
   * In **Sagarius Office Scans** folder, locate next unprocessed bill.
   * Download it (appears instantly in Downloads folder).
   * Immediately **move** the file from Downloads → **Processed Files** subfolder (prevents re-processing).
   * Confirm move (click Yes if prompted).
3. **Create New Bill in Buildium**
   * In Buildium, go to **Accounting → Bills → Record Bill**.
   * Drag the downloaded PDF from Downloads (or Processed Files) into the **Upload** section.
   * Click **Preview File** to view bill contents immediately.
4. **Populate Bill Header Fields (Top to Bottom)**
   * **Due Date** (internal):
     * Find utility due date on bill.
     * Subtract exactly 7 days → enter that date (e.g., 3/16 utility due → 3/9 internal due).
   * **Vendor**:
     * Search/type vendor name (e.g., "Cole Creek Utility District" or "Puget Sound Energy").
     * 95–98% of utility vendors already exist → select match.
     * **If vendor does NOT exist**: Stop. Do **not** create vendor. Download bill, move to Processed, and immediately launch **Bill Investigation** task in Asana (SOP: New Vendor / Unknown Utility Bill Investigation).
   * **Reference Number**:
     * Enter account number from bill + " // " + bill date (e.g., 20240-01 // 12-26-2025).
   * **Memo**: Leave blank (internal notes only — not required here).
5. **Add Line Item(s)**
   * **Property**: Search and select correct property address (must match bill service address).
     * If property does **not** appear → stop, launch **Bill Investigation** in Asana.
   * **Unit**: Select "Property Level" if no unit specified (most utilities).
   * **Account / Category**: Choose correct utility bucket:
     * Water Sewer Garbage
     * Gas and Electricity
     * Utilities (catch-all for storm drain, internet, other)
   * **Description**: Enter service period exactly as shown on bill (e.g., 12/1/2025 – 2/10/2026 or 1/6/2026 – 2/5/2026).
   * **Amount**: Enter **total amount due** only if bill is "perfect":
     * Previous balance = $0 or paid in full
     * No late fees, credits, adjustments, or anomalies
     * If **any** abnormality → stop, launch **Bill Investigation** in Asana.
6. **Save & Stay on Bill**
   * Click **Save and View** (critical — keeps you on the newly created bill record).
   * Copy the **Bill ID** from the URL (long numeric code after /bills/, e.g., 7016593).
7. **Queue Tenant Pass-Through in Asana**
   * Open **Asana Utility Pass-Through / Bill Intake** form/tool.
   * Paste:
     * **Bill ID** (from Buildium URL)
     * **Start Date** and **End Date** of service period
     * **Account Number** (from bill / reference field)
   * Click **Submit** → **Reload** (refreshes tool).
   * (Backend bot processes pass-through rules, creates tenant charges/tasks as applicable.)
8. **Clean Up & Move to Next Bill**
   * Return to **Downloads** folder → confirm bill is no longer there (moved to Processed).
   * If still visible → manually move to trash or Processed.
   * Repeat from Step 2 for next bill.

:::


:::warning
### Key Decision Rules – When to Stop & Launch Investigation

* Vendor not found in Buildium
* Property not found in Buildium
* Any anomaly on bill: late fees, credit balance, unpaid prior balance, unusual charges, adjustments
* Service address does not match known properties → Action: Download bill, move to Processed, create **Bill Investigation** task in Asana with bill attached.

:::


:::tip
### Best Practices & Reminders

* Process **one bill at a time** — never batch-upload or multi-task.
* Maintain **four-window visibility** — reduces errors from toggling.
* Internal due date **always** 7 days before utility due date.
* Use **Save and View** every time — prevents searching for newly created bills.
* 100% accuracy required — when in doubt, launch investigation (better to investigate than input wrong).
* Volume expectation: 30–35 bills/day — take time initially to build speed with perfection.

:::


---

## How to pay a bill OVERVIEW

**Purpose**

To define the core responsibility of the accounts payable position (paying bills on time and correctly) and outline the standard methods for handling the two main categories of bills in Buildium: **vendor bills** and **utility bills**.

**Key Principle**

The most important aspect of the accounts payable position is **paying bills**. All bills are recorded in the bookkeeping platform: **Buildium**.

**Types of Bills**

We manage two distinct categories of bills:

* **Vendor Bills**
  * These are the majority of bills and include services, maintenance, repairs, management fees, etc.
  * Preferred and standard payment methods (in order of recommendation):
    * **a. EFT (Electronic Funds Transfer) initiated directly in Buildium**
      * **Best and preferred method** whenever possible.
      * Fast, trackable, and fully integrated into the system.
    * **b. Payment via vendor-provided payment link**
      * Vendor emails a secure payment link (e.g., through their portal or invoicing system).
      * Locate the email/link, make the payment, then mark the bill as paid in Buildium.
    * **c. Physical check (discouraged)**
      * Only used when EFT or link payment is not an option.
      * Outside of standard operating procedure — minimize use.
    * **d. Direct bank transfer (e.g., Zelle) (strongly discouraged)**
      * Not integrated with Buildium.
      * Increases risk of tracking errors and reconciliation issues.
      * Avoid unless no other method is available.
* **Utility Bills**
  * Unfortunately, **cannot be paid via EFT** from Buildium.
  * Must be paid manually every time.
  * Consistent and repeatable process:
    * **Step-by-step Utility Bill Payment Process**
      * Pay the utility bill using the **company credit card**.
      * Record the payment in Buildium as paid with the company credit card.
      * Reimburse the company credit card from the **specific property's operating account**. → This ensures proper allocation of expense to the correct property.


:::tip
### General Notes & Best Practices

* All bill payments (vendor and utility) must be properly recorded and marked as paid in Buildium to maintain accurate books and property-level financials.
* EFT is the gold standard for vendor bills — use it whenever the vendor supports it.
* Utility bills follow a single, reliable workflow using the company credit card + reimbursement — no exceptions.
* Minimize non-integrated methods (checks, Zelle, etc.) to reduce errors and streamline reconciliation.
* Accounts payable work is repetitive but critical — and surprisingly satisfying when done efficiently and accurately.

:::


---

## How to make a bulk payment to EFT enabled Vendors

[VIDEO OVERVIEW OF ENTIRE PROCESS](https://www.loom.com/share/1c5e3a3f18cf48de99da2399b8bc2559)

 ![Bulk EFT payment overview](https://lh7-rt.googleusercontent.com/docsz/AD_4nXdliGV7mkJ63D5H_WaoocZwjpLxl6DvpWLRrNNd0kz7gyE9IXEihQZz2_6uQ-_kSzTzPXKFVVQoRpRmUq4Bt8zCarYkGbmhYg4hs6TXq9rQ4SSfvqK6oyaaQbUwvDf37q7u30n0G8RG2oTOwI2MKRFC3wUT?key=nnhKEmcP1_mvGVmGiinqRQ)

**Purpose**

To efficiently and safely process bulk Electronic Funds Transfer (EFT) payments for hundreds of vendor bills while adhering to strict financial controls to prevent overdrafts, duplicate payments, and payments from unfunded temporary accounts.

**Scope**

Applies to all EFT-eligible vendor bills visible on the main billing screen in Buildium when performing bulk payments across all properties, units, and vendors.


:::warning
### Prerequisites / Important Standards & Rules

* **Maximum bill amount per EFT in bulk**: No bill over **$800** may be included in a bulk EFT payment.
  * Bills > $800 require individual review and separate payment.
  * Rationale: Typical property reserve balance is \~$1,000 → avoid overdraft risk.
* **Temporary / new-property bank accounts**: Never include any bill in bulk EFT if the property is linked to the **901 temporary account**.
  * These are new properties with likely insufficient funds.
  * Require individual review and confirmation of available funds.
* **Duplication Consideration:** Review of potential duplications comparing bank account, property amount and invoice numbers.
* **Timing consideration**: Bulk payments near the end of the month require extra verification of available funds in each linked bank account.

:::


:::info
### Step-by-Step Procedure


1. **Navigate to the correct screen**
   * Go to the **main Billing screen** in Buildium.
   * Set filters to broadest scope:
     * All Properties
     * All Units
     * All Vendors
     * All Statuses (or appropriate open/approved status)
2. **Initiate bulk payment selection**
   * Click **Pay Bills** (or equivalent tool/button).
   * Select the **EFT** dropdown / option to filter to EFT-eligible bills.
   * This opens the EFT payment preparation screen.
3. **Fix / verify filters if needed**
   * Ensure filters show **all properties**, **all vendors**, **all statuses**.
   * Confirm total number of available EFT bills (e.g., "139 bills available").
4. **Initial bulk selection**
   * Select **all** displayed bills (bulk select).
   * Note: There may be a slight mismatch between "matches" and "selected" count — proceed anyway.
5. **Apply primary financial control – Remove high-value bills**
   * Deselect **every bill > $800**.
   * Scan amounts quickly and uncheck any bill exceeding the $800 threshold.
   * Common large vendors/examples: roofing, remodeling, construction, large energy/management services.
6. **Second review – Check for duplicate payments**
   * Focus on bills grouped by **vendor**.
   * Look for red flags within the same vendor:
     * Same property address + same exact amount → high duplication risk → deselect and flag for review.
     * Same invoice number (direct duplication).
     * Multiple identical charges for what appears to be the same service.
   * Acceptable cases (leave selected):
     * Same vendor, same property, but clearly different invoice numbers and/or different service descriptions.
     * Same vendor, different properties/units, even if bank account is the same.
7. **Third & final control – Exclude temporary / new-property accounts**
   * Scan for any bills tied to the **901 temporary bank account**.
   * Deselect **all** such bills — regardless of amount.
   * Common in: new property onboarding costs (photography, initial maintenance/turnover, etc.).
8. **Final verification before payment**
   * Review the remaining selected bills (target: significantly reduced number, e.g., 45 out of 139).
   * Quick scan:
     * No bills > $800 remaining
     * No obvious duplicates by vendor/property/amount
     * No 901 temporary accounts
   * If payment is being run near month-end, additionally:
     * Check available balance in each unique bank account tied to the selected bills.
9. **Execute payment**
   * Proceed with EFT bulk payment for the remaining selected bills.
   * Record / document the batch (date, number of bills paid, total amount, any manually excluded large bills for follow-up).

:::

**Post-Payment Actions**

* Individually process all deselected bills > $800 (one-by-one review).
* Individually process all bills tied to 901 temporary accounts after confirming funds.
* Handle any flagged potential duplicates (reach out to vendor / property manager if needed).


:::tip
### Key Reminders / Best Practices

* Always err on the side of caution: when in doubt about duplication or funding, deselect and handle separately.
* The process is intentionally conservative to protect cash flow and prevent errors.
* Bulk EFT is a time-saving tool, but never at the expense of financial controls.

:::


---

## How to pay a utility bill

### How to prepare for Payment

[VIDEO OVERVIEW](https://www.loom.com/share/716b7095e4e34866927091213b55d2d0)

 ![Utility bill payment preparation](https://lh7-rt.googleusercontent.com/docsz/AD_4nXdy1qCYHXyns6-V3RRQrLYx7_LS9IKtqo7Mn9HOPW1b3ABPlVKeYmA7GELI7AFz-bnxsbtnKBUO5IQ9f54QGsD-DyvhW4Z5YMtKNJCHPRtos9v6YKh9EknREMBSUXRu40URDw1vTzxdYIHkdksuJYEF5mB1?key=nnhKEmcP1_mvGVmGiinqRQ)

**Purpose**

To ensure all utility bills are paid promptly, accurately, and without late fees or overdue status, maintaining zero overdue utility bills and minimizing the number of unpaid bills in the system at any time.


:::warning
### Core Principle

* Utility bills **must never be overdue**.
* There should be **very few (ideally close to zero) unpaid utility bills** in Buildium at any given moment.
* Paying utilities is a high-priority, time-sensitive task.

:::

**Accessing Utility Bills in Buildium**

* Log in to **Buildium** (bookkeeping platform).
* Navigate to **Accounting** (sidebar).
* Expand the **Bills** dropdown. → All bills (vendor + utility) appear together in this section.

**Overall Workflow Philosophy**

* Prioritize **overdue bills** first.
* Group payments by **utility vendor** — pay all bills for the same utility provider at the same time (across multiple properties).
* Perform a quick **sanity check** on each bill before payment.
* Every utility payment process is unique to the provider, but follows the **same fundamental goal**: locate the correct online portal or payment method and complete payment using the company credit card.


:::info
### Step-by-Step Procedure: Paying a Utility Bill


1. **Identify and Prioritize Bills**
   * Start with **overdue bills** (highest urgency).
   * Use filters to narrow down:
     * Filter by **due date** (focus on oldest/overdue first).
     * Then filter by **vendor** (e.g., "Silver Lake Water and Sewer District").
   * Goal: View **all open bills** for that specific utility provider at once.
2. **Perform Bill Sanity Check**
   * Open the individual bill.
   * Review:
     * **Total amount due**
     * Confirm **no unexpected late fees** have been added
     * Compare to previous bill (was it paid on time? Any adjustments?)
     * Note the **service address** (helps identify property and context)
     * Check the **bank account** the payment will be drawn from (e.g., account 421)
     * Verify any pass-through charges (e.g., resident-reimbursed items)
   * Confirm the bill is straightforward and ready to pay.
3. **Determine Payment Method**
   * Refer to the **paper copy** or scanned bill (always visible on screen).
   * Look for payment instructions: usually a website URL for online payment (credit/debit card).
   * Common example: "Pay online at [www.slwsd.com](http://www.slwsd.com)".
4. **Navigate to Utility Payment Portal**
   * Go to the provided website.
   * Locate the **"Pay Online"**, "Make a Payment", or similar button/link.
   * Every utility website is different — explore calmly to find the payment section.
5. **Enter Required Account Information**
   * Use details **exactly as printed on the paper bill**.
   * Common fields:
     * 10-digit **account number** (include or exclude dashes as instructed)
     * **Last name** or **business name**
   * Enter the name **precisely as it appears** on the bill.
   * If search fails, **troubleshoot creatively** (see Troubleshooting below).

:::

### Completing the Payment

[Video Overview of Payment and Recording](https://www.loom.com/share/a51caadcadff447889579030456baa66)

 ![Payment and recording overview](https://lh7-rt.googleusercontent.com/docsz/AD_4nXcYiRYiHRh3OWIpqZh9w7orxRk2R-i9lgKCzcFPRWF6jn5ewQ8xgpNGUCXSOhf4pkFXPJwA_1AizXnTO1GbWZ-nYPbg7tD6tAjnjr0smKYPXmo3PSI2kf7-uKH4POtF0igglyEFKa2HRlauoe7ojlLKev8e?key=nnhKEmcP1_mvGVmGiinqRQ)


:::info

6. **Complete the Payment**
   * Use the **company credit card, contact info below**.
   * BofA Account - Use 103.BOFA CC
   * Chase Account - Use 102.Chase CC
     * Cooper Bouvia
     * 206 468 1405
     * 2265 116th Ave NE Bellevue WA 98004
     * [Utility@sagareus.com](mailto:Utility@sagareus.com)
     * 425-333-7997
   * Pay the full amount due.
   * Record the payment in Buildium immediately after:
     * Mark the bill as **paid**
     * Select **company credit card** as payment method
7. **Repeat for All Bills from the Same Vendor**
   * Return to Buildium.
   * Pay the remaining bills for that utility provider (same process).
   * Group payments by vendor to improve efficiency.

:::

**Troubleshooting Common Issues (Portal / Login Problems)**

* If the account number + name combination fails to find the invoice:
  * Try variations of the business name (e.g., drop "LLC", try partial name).
  * Use the **property address** as a search term.
  * Check the **property owner's name** in Buildium → try the owner's last name (many utilities register under the property owner, not the management company).
* If still unsuccessful:
  * Perform a quick investigation in Buildium (owner name, property details).
  * Call the utility company directly:
    * Ask: "I'm trying to pay via the portal — what exact name or details should I use?"
    * If portal access fails, request to **make payment over the phone**.
    * Utilities almost always accept phone payments with basic verification.
* **Key mindset**: 100% of utility bills are payable — there is always a way.


---

## Adding a Utility Surcharge

[VIDEO OVERVIEW](https://www.loom.com/share/181cad3fe12e47e68a9848537653ded9)

 ![Utility surcharge overview](https://lh7-rt.googleusercontent.com/docsz/AD_4nXfMN0Jx0lnDRv5lZGrsuAv4x8ehcEvDDEqjkUjS5t7xS1CIMPIyQhU9c9eaTfLQOi9kLySGY9eZgX0DRbuT7xERztdHHgjtYBELc8nzj1FvfVYRml08bxmt0puHUT3_H7tER_43xZrDQyDsLzKA7F3csomA?key=nnhKEmcP1_mvGVmGiinqRQ)

**Purpose**

To ensure the full amount charged by the utility company (including any added surcharge/convenience/service fee) is accurately recorded in Buildium so that:

* The books reconcile correctly
* The correct total is expensed to the property
* The owner's account reflects the true cost of payment
* No discrepancies occur during bank reconciliation or owner reporting

**Scope**

Applies to **all online utility bill payments** made via a utility company's payment portal where a surcharge/convenience fee is added (occurs \~10–20% of the time).

Common with utilities that charge a flat fee (e.g., $3.95) for credit/debit card or online payments.

**Responsibility**

* Primary: Accounts Payable / Utility Payment Specialist
* Review: If fee seems unusually high or recurring → flag for manager

**Prerequisites**

* Utility bill already entered in Buildium (via paper bill input SOP)
* Payment being made via utility's online portal (not EFT from Buildium)
* Company Chase credit card (or designated utility card) ready
* Buildium bill is still open/editable (not yet marked paid)


:::info
### Step-by-Step Procedure


1. **Initiate Payment in Utility Portal**
   * Log in to utility payment portal using account number and service address from bill.
   * Search invoices → locate and select the correct bill.
   * Proceed to payment screen.
   * Enter full balance shown on bill (ignore surcharge for now).
2. **Identify Surcharge / Convenience Fee**
   * On the final review / confirmation screen, note if a service fee, convenience fee, or surcharge is automatically added (e.g., +$3.95).
   * Compare:
     * Original bill amount (e.g., $213.81)
     * Total charged to card (e.g., $217.76)
   * If surcharge exists → **do not** complete payment yet.
   * Cancel / back out of payment process (do not submit).
3. **Edit Original Bill in Buildium to Add Surcharge Line Item**
   * Return to Buildium → locate the original open bill (search by vendor, property, amount, or bill ID).
   * Click **Edit** on the bill.
   * Add a **new line item**:
     * **Property**: Same property / service address (e.g., 11806 – property level)
     * **Description**: "Utility Surcharge Fee" or "Convenience Fee – Online Payment"
     * **Amount**: Exact surcharge amount shown in portal (e.g., $3.95)
     * **Account/Category**: Use same utility category as main line (e.g., Water Sewer Garbage, Gas and Electricity, or Utilities catch-all)
   * New total bill amount should now match the portal total (e.g., $217.76).
   * Save the edited bill.
4. **Return to Utility Portal & Complete Payment**
   * Re-enter payment portal (re-search invoice if needed).
   * Proceed to payment again.
   * Confirm total now matches edited Buildium amount (e.g., $217.76).
   * Select **Chase utility credit card** (account 102).
   * Fill any required billing details:
     * State: Washington
     * ZIP: 98004
     * Email: utility@sagarius.com (or designated utility email)
     * City: Bellevue (if prompted)
5. **Critical checkboxes to watch**:
   * **Never** select "Enroll in Paperless Billing"
   * **Never** select "Enroll in Auto-Pay" or "Recurring Payments"
   * If pre-checked → **uncheck** both to ensure continued receipt of paper bills to office address
   * Agree to terms → review final amount → **Proceed to Payment**.
   * Complete transaction → copy **confirmation code / receipt number**.
6. **Record Payment in Buildium**
   * Return to the (now edited) bill in Buildium.
   * Click **Pay Bill** or **Record Payment**.
   * Select **Bank Account**: Chase utility account (102).
   * Enter payment amount: full total including surcharge (e.g., $217.76).
   * Paste **confirmation code** / reference number in memo or reference field.
   * Mark as paid → save.
   * Reimburse credit card from property operating account per standard utility reimbursement SOP.
7. **Final Verification**
   * Confirm bill total in Buildium = amount charged on card.
   * Attach portal receipt/screenshot to bill record if helpful.
   * Proceed to next bill.

:::


:::warning
### Key Decision Rules

* If surcharge appears → **always** back out, edit Buildium bill first, then re-pay.
* Never record only the base bill amount — books will be off by the surcharge.
* Never enroll in paperless or auto-pay — preserve paper bill delivery to office.

:::


:::tip
### Best Practices & Reminders

* Surcharge occurs \~10–20% of the time — expect it and pause before finalizing payment.
* Owner ultimately pays the surcharge → it must be expensed to the property.
* Always double-check **paperless** and **auto-pay** boxes — many portals pre-check them.
* Use consistent description ("Utility Surcharge Fee") for easy filtering/reporting.
* If surcharge is unusually high or changes frequently → flag for manager review (possible vendor negotiation).

:::


---

## How to pay a Utility bill using Direct Checking Account payment

[VIDEO OVERVIEW](https://www.loom.com/share/2056566adf8e485aaefcc60d99091295)

 ![Direct checking account payment overview](https://lh7-rt.googleusercontent.com/docsz/AD_4nXc6FdqtkO-vHUVxRKmJwGIMAXi5IQx9Sq9FJpWFUWlvzTljP0_8Vuaydeyl17kcyIbnpudvfD0XFBKmImBFNuyv4CymPuxqJHqrp3InrhJg3EBqYv7W8-1YZest1q1G9AcsHygHG74h0eNI2g4EqGSmxy6K?key=nnhKEmcP1_mvGVmGiinqRQ)

**Purpose**

To successfully complete payment of PSE utility bills when the vendor portal blocks credit card transactions due to PSE's daily limit (maximum 2 credit card transactions per day), by switching to **direct ACH / bank account payment** and accurately recording the transaction in Buildium without duplicating or misallocating the expense.

**Scope**

Applies specifically to **PSE (Puget Sound Energy)** bills when:

* Attempting payment via credit card results in "Duplicate payment method" or similar error
* Daily credit card limit (2 transactions) has been reached
* Bill is otherwise ready to pay (approved, correct amount, no other issues)

**Responsibility**

* Primary: Accounts Payable / Utility Payment Specialist
* No escalation needed unless ACH option is also blocked (rare)

**Prerequisites**

* PSE bill already entered/edited in Buildium (per utility bill input SOP)
* Payment portal open (pay as guest or logged in)
* Bank of America checking account details accessible in Buildium (e.g., account 363)
* Company name on account: **Segarius Group**


:::info
### Step-by-Step Procedure


1. **Attempt Credit Card Payment & Identify Block**
   * In PSE payment portal:
     * Enter account number and service ZIP code (from bill).
     * Verify amount due matches Buildium bill.
     * Select credit/debit card → fill details (Bank of America card preferred).
   * Proceed to final review/confirmation screen.
   * If error appears: **"Duplicate payment method"** or similar → credit card limit reached.
   * **Do not** retry card → cancel/back out of payment.
2. **Switch to Direct ACH / Bank Account Payment**
   * In same portal:
     * Change payment method to **ACH / Bank Account** / **Direct Payment** (not credit card).
     * Enter bank details:
       * **Routing Number**
       * **Account Number**
       * **Account Holder Name**: Segarius Group
     * Quickest source:
       * In Buildium → **Accounting → Banking** → select the property's Bank of America checking account (e.g., 363).
       * Click **Edit** → view routing and account numbers (visible in account settings).
       * Copy/paste directly — no need to log into bank portal.
   * Confirm billing info:
     * Name: Your name or authorized user
     * Email: utility@sagarius.com (or designated)
     * Address: Segarius office
     * **Never** enroll in paperless billing or auto-pay — uncheck if pre-selected.
   * Review final amount → **Submit / Pay**.
   * Note **confirmation number** / receipt (on screen or emailed).
3. **Record Payment in Buildium**
   * Return to the open bill in Buildium.
   * Click **Pay Bill** or **Record Payment**.
   * **Bank Account**: Leave as default (property's Bank of America checking account — e.g., 363).
     * Do **not** change to credit card (no card was used).
   * Enter **confirmation number** in **Check Number** / **Reference** field (even though it's ACH).
   * Amount: Full amount paid (matches portal total).
   * Click **Prepare** → **Confirm** → save.
   * Bill is now marked paid — payment pulls directly from checking via ACH.
4. **Post-Payment Cleanup**
   * Attach portal receipt/confirmation to bill record (screenshot or PDF).
   * No credit card reimbursement needed (ACH direct from checking).
   * Move email/invoice to processed folder.
   * If multiple PSE bills hit limit same day → repeat ACH method or delay non-urgent ones.

:::


:::warning
### Key Decision Rules

* PSE limit = **2 credit card transactions per day** — switch to ACH immediately on block.
* **Never** force credit card retry — wastes time and risks errors.
* Use **Buildium banking screen** to pull routing/account numbers — fastest method.
* **Never** enroll in paperless or auto-pay — preserve paper bill delivery to office.

:::


:::tip
### Best Practices & Reminders

* Expect this \~10–20% of PSE payments (especially high-volume days).
* ACH is reliable backup — no daily limit issue.
* Keep PSE portal login saved in OnePassword if frequent.
* If ACH also blocked (very rare) → escalate to manager (possible vendor coordination).
* Document in bill memo if helpful: "Paid via ACH due to PSE credit card daily limit."

:::


---

## How to pay a non-EFT enabled vendor using Vendor Portal

[VIDEO OVERVIEW](https://www.loom.com/share/8495367707614d378cf0ac6b31440bf0)

 ![Non-EFT vendor payment overview](https://lh7-rt.googleusercontent.com/docsz/AD_4nXeK_hm4wlQ-ZFQuo64fJtnI4eeMaD4nWqBpTSef0F1vNqCJtbaIPA9rM0ifjVTfjGzd6d6k_8FA4U06-WPU6a0gKrLAWg2hAoqY_vFbUhdQeUlR9s3dFuHNKpH0P29JjjHey_vYQD85CP4f1lTwZb43kgK6?key=nnhKEmcP1_mvGVmGiinqRQ)

**Purpose**

To securely and accurately pay vendors who are **not** set up for EFT in Buildium by locating and using their provided online payment link (usually sent via email), prioritizing credit card payment when available, while ensuring the correct amount, address, and confirmation details are recorded in Buildium.

**Scope**

Applies to any open vendor bill in Buildium where:

* No "Pay by EFT" option is visible
* Vendor has sent a payment link (via email to billing@sagarius.com or similar)
* \~50% of vendors fall into this category (non-EFT)

**Responsibility**

* Primary: Accounts Payable Specialist
* Payment method priority:
  * Credit card (Bank of America or Chase utility card)
  * ACH / direct bank payment (if offered and approved)
  * Paper check (last resort – see separate SOP)

**Prerequisites**

* Open bill in Buildium billing screen
* Gmail open (side-by-side with Buildium for efficiency)
* OnePassword (or equivalent password manager) with saved Bank of America / Chase card details
* Vendor portal link present in email (most recent invoice email)


:::info
### Step-by-Step Procedure


1. **Confirm Bill Requires Non-EFT Payment**
   * In Buildium **Billing** screen, open the bill (sorted by due date).
   * Check: No "Pay by EFT" button/dropdown visible.
   * Vendor name appears (e.g., All Region Electric PLLC).
   * Proceed only if bill is legitimate and due/urgent.
2. **Locate Vendor Payment Link in Gmail**
   * Open Gmail (billing@sagarius.com inbox).
   * Search by **invoice number** (e.g., 2292) – most reliable method.
   * Look for the most recent email from the vendor containing the invoice.
   * Open email → click **"Pay Invoice"**, **"Pay Now"**, or similar link.
   * Confirm:
     * Invoice number & amount match Buildium bill
     * Service address matches property in Buildium
     * Billing address is Segarius office (if shown)
3. **Process Payment in Vendor Portal**
   * In portal:
     * Verify total amount due (should match Buildium bill).
     * Select payment method: **Credit/Debit Card** (preferred)
       * If only ACH/direct bank offered → use only if approved (separate video/SOP).
     * Enter card details via OnePassword autofill (Bank of America preferred).
       * Name: Your name or authorized user
       * No need to "save for future use" – credentials are managed in OnePassword.
     * Billing info: Use Segarius office address, utility@sagarius.com email, WA state, Bellevue 98004 ZIP if prompted.
   * **Critical checkboxes**:
     * **Never** enroll in auto-pay/recurring
     * **Never** enroll in paperless billing
     * Uncheck if pre-selected → preserve paper invoice delivery.
   * Review final amount → **Submit / Pay**.
   * Note confirmation number / receipt (if shown on screen or emailed).
4. **Record Payment in Buildium**
   * Return to open bill in Buildium.
   * Click **Pay Bill**.
   * Select the invoice.
   * Change **Bank Account** to correct credit card:
     * Bank of America credit card (no "C" suffix for general use)
     * Or Chase if utility-specific (confirm beforehand).
   * Enter **confirmation number** (from portal/email) in **Check Number** or **Reference** field (even if not a check – Buildium uses this field generically).
   * If no confirmation number provided → leave blank or note "Portal payment – receipt emailed".
   * Click **Prepare** → review amount matches portal total → **Confirm**.
   * Bill is now marked paid.
5. **Post-Payment Cleanup**
   * Save portal receipt / confirmation email (attach to Buildium bill or move to processed folder).
   * Reimburse credit card from property operating account (standard reimbursement SOP).
   * Move invoice email/PDF to archived or processed folder.
   * Proceed to next bill.

:::


:::warning
### Key Decision Rules

* **Credit card first** — always default unless portal forces ACH.
* **Never** assume EFT if not visible — always check Gmail for link.
* Invoice number search in Gmail is fastest/most accurate method.
* If no payment link found → escalate to **Bill Investigation** in Asana (possible vendor follow-up needed).
* Preserve paper billing — uncheck auto-enroll boxes every time.

:::


:::tip
### Best Practices & Reminders

* \~50% of vendors are non-EFT — expect this workflow frequently.
* Keep Gmail + Buildium side-by-side — improves speed and reduces errors.
* Always confirm service address matches Buildium property before paying.
* Use OnePassword for card details — never manually enter.
* If portal adds surcharge/convenience fee → back out, edit bill in Buildium first (see separate SOP).
* If vendor repeatedly lacks link/EFT → flag for manager (consider encouraging EFT setup).

:::


---

## How to Pay EFT enabled Vendors for Bills Requiring Approval

[VIDEO OVERVIEW](https://www.loom.com/share/491f5eec98bb42bda738e24003cf940d)

 ![EFT vendor bills requiring approval](https://lh7-rt.googleusercontent.com/docsz/AD_4nXcznNBFAB9fsh9G3E9x1KY279Azscooa8RyZC7ii87mX_w2Lv3g82LKLExUnNSCPL_iZh49uipWyXATFDOFwOHYJ6LZRR4k3SF9c8Y34rWI8ukTBQa34m8-LD1-zUFmdnHKODgeXhnPLiBkBQ3oI8pJLlSN?key=nnhKEmcP1_mvGVmGiinqRQ)

**Purpose**

To safely and accurately process one-off EFT payments for vendor bills exceeding $800 (ineligible for bulk processing), after approval, while:

* Confirming no duplication
* Verifying sufficient funds in the property operating account
* Avoiding overdrafts
* Making informed decisions: pay immediately, delay, request temporary funding, or seek owner contribution
* Documenting via Asana bill investigation when needed

**Scope**

Applies to any approved bill > $800 that is **not** eligible for bulk EFT (per bulk payment standards).

These bills receive **one-by-one attention** for risk management.

**Responsibility**

* Primary: Accounts Payable Specialist
* Escalation: [Lead Accountant](../../docs/role-profiles/lead-accountant.md) (owner communications), or self-assign for new/901 temporary accounts

**Prerequisites**

* Bill status = **Approved for Payment**
* Access to Buildium billing, property profiles, paid bills report
* Asana access for bill investigation tasks


:::info
### Step-by-Step Procedure


1. **Confirm Bill Eligibility & Approval**
   * In **Billing** screen, locate the bill (filter by due date or vendor).
   * Verify:
     * Amount > $800
     * Status = Approved for Payment
   * If not approved → stop and follow approval workflow (separate SOP).
2. **Check for Duplication (Quick Review)**
   * Go to **Paid Bills** report.
   * Filter:
     * Property = same property as current bill
     * All vendors
     * Recent period (last 30–60 days)
   * Scan for:
     * Same vendor + similar amount/description
     * Same unit/service
   * Review descriptions/invoices:
     * Acceptable: Separate phases of work (e.g., initial inspection vs. full turnover)
     * Red flag: Identical service + amount → potential duplicate
   * If duplicate suspected → launch **Bill Investigation** in Asana before proceeding.
3. **Verify Sufficient Funds in Property Account**
   * Search property address in Buildium.
   * Click the **house icon** property profile (not unit).
   * Review key balances:
     * **Property Reserve** (target $1,000)
     * **Current Available** / cash balance
     * **Deficit** amount (negative = shortfall)
     * **Bank Account** type (e.g., 901 temporary = new property, likely low/no funds)
   * Decision tree:
     * **Funds sufficient** (available ≥ bill amount) → proceed to payment (Step 5).
     * **Funds insufficient** → go to Step 4.
4. **Handle Insufficient Funds (Judgment Call)**
   * Evaluate options based on context:

   **a. Temporary Funding** (max $2,000)
   * If deficit ≤ $2,000 and temporary fix is appropriate
   * Launch **Bill Investigation** in Asana
   * Task description: "Not enough funds in owner's account to pay approved bill. Please temporarily fund \[amount\]."
   * Assign to [Lead Accountant](../../docs/role-profiles/lead-accountant.md) (or self for new/901 accounts)

   **b. Owner Contribution**
   * If deficit > $2,000, 901 temporary account, new property, no upcoming rent income
   * Launch **Bill Investigation**
   * Description: "Brand new property – 901 temp account – insufficient funds for approved vendor bill(s). No upcoming rent income. Please request owner contribution."
   * Attach screenshot of property profile + unpaid bills list
   * Assign to self (new clients) or [Lead Accountant](../../docs/role-profiles/lead-accountant.md) (established)

   **c. Delay Payment** (preferred when low risk)
   * If vendor relationship allows delay (e.g., recurring vendor, bill received recently)
   * Edit bill **due date** → push to early next month (e.g., March 6)
   * Rationale: Rent due March 1 → likely funds incoming; avoids unnecessary owner/team communication
   * Bill disappears from main billing screen (sorted by due date)
   * Revisit on new due date → funds often resolved naturally
   * Document decision in bill memo (e.g., "Delayed to 3/6 due to low funds – expected rent income March 1").
5. **Process EFT Payment (When Funds Are Sufficient)**
   * Return to bill → click **Pay Bill**.
   * Select EFT method.
   * Confirm:
     * Bank account = correct property operating account
     * Amount matches approved bill
   * Click **Prepare** → **Confirm** payment.
   * Save confirmation (screenshot or reference number).
6. **Final Documentation & Follow-Up**
   * Add memo to bill:
     * Approval confirmation
     * Duplicate check result
     * Funds decision (pay/delay/investigation)
     * Asana task link (if created)
   * If delayed: Set calendar reminder or note in Asana to revisit on new due date.
   * If investigation launched: Monitor Asana for resolution (funding/contribution) before retrying payment.

:::


:::warning
### Key Decision Rules

* **> $800 bills** = individual attention — no bulk.
* **Always** check paid bills for duplicates before paying.
* **Never** pay from negative/low-balance accounts → overdraft risk.
* **Delay** is often best short-term option near month-end (rent cycle incoming).
* **901 temporary accounts** → high likelihood of owner contribution needed (new properties).
* **Temporary funding** capped at $2,000 — larger shortfalls → owner contribution.

:::


:::tip
### Best Practices & Reminders

* Vendor relationships matter — recurring vendors tolerate short delays better.
* Timing near month-end (e.g., Feb 25) → often better to wait 5–10 days for rent income.
* Document **every** decision in bill memo and Asana — creates audit trail.
* Link Asana task in bill memo — easy reference if revisited later.
* If multiple bills on same low-fund property → batch investigation (screenshot unpaid list).

:::


---

## How to launch an investigation on a bill

[VIDEO OVERVIEW](https://www.loom.com/share/79f4c46482d44061ad8ac168411f4252)

 ![Bill investigation overview](https://lh7-rt.googleusercontent.com/docsz/AD_4nXcyTNiqpoRWstAmYxlrjLJ0FNdG3Fwu0HX5LcP_plHi6V6xM43MVnBT2AalhlkGit87lCAkyDwsqdllIStZC8YhApdWo9ZjUgbip8KuvXisABT7MUwKzse5WDifpoZwCCf2OJhG5tu70YdXdx_B6AJhETva?key=nnhKEmcP1_mvGVmGiinqRQ)


:::info
### Steps


1. **Pause Payment**
   * Stop attempting to pay the bill in Buildium if any issue is stopping from a uniform/normal resolution.
2. **Defer Due Date**
   * Edit the bill in Buildium.
   * Extend due date by **5 Days** (or enough time to resolve).
3. **Create Asana Task - Template**
   * Go to **Asana Outstanding Bills Project**
   * Create a **Bill Investigation**
   * Title: e.g., "Xfinity Bill – \[Property/Unit\] – Obtain Owner Login & Add to 1Password"
   * Description: Include:
     * Property details
     * Bill upload/screenshot
     * Issue summary (e.g., "No pay-as-guest; requires owner Xfinity login; no 1Password entry")
     * Previous payment history if known
     * Request: Obtain owner login credentials, add to 1Password, test payment process.
   * Attach bill PDF/screenshot.
4. **Link & Capitalize in Buildium**
   * Edit bill again.
   * In notes/memo: "Investigation // Asana task \[paste link\]."
5. **Move On**
   * Continue processing other bills.
   * [Office Manager](../../docs/role-profiles/office-manager.md) resolves → updates 1Password → future bills pay normally.
   * If recurring, they set up long-term fix (e.g., owner portal access or alternative payment method).
6. **Resolution**
   * With the one week delay the bill will appear as an issue, the next time you try to make payment.
   * Follow the link to the Asana task where the issue should be noted as resolved.
   * You should now be able to resolve the bill.

:::


:::warning
**Key Rule:** Do NOT spend time troubleshooting logins yourself. Escalate immediately to keep payables flowing. Issues repeat monthly if unresolved.

:::

**Assigned To:** Accounts Payable team

**Escalation Contact:** [Office Manager](../../docs/role-profiles/office-manager.md)

**Tools:** Buildium, Asana, 1Password


---

## Reimbursement of the Credit Card for Property Expenses

[Video Overview](https://www.loom.com/share/94e4ba72414b43c881d41cd76aad3a0c)

 ![Credit card reimbursement overview](https://lh7-rt.googleusercontent.com/docsz/AD_4nXfdHtkdEzJMwf3Q_7jo97iIckYFvzUbDUJR2D26r-ft8xyT6KQskpVNrMid1bFP6268x5E6ocV4eQX773ZzeGUu0gkWRB56xADcw999k1taXVfZ-04ciVJq8A7BZHqfekJZv2woKGxP1fQNbJKNXw_X9DXl?key=nnhKEmcP1_mvGVmGiinqRQ)

**Purpose**

To reimburse the Bank of America credit card (Bova CC, account 103) for expenses that were originally charged to individual properties, ensuring the credit card balance is cleared for property-specific items and the negative balance is reduced to only non-property (Segerius) expenses.

**Overview**

* Property expenses appear as a negative balance on the credit card.
* Each property with a balance must be reimbursed from its own designated bank account.
* Transactions are recorded in the accounting system (BXN) and matched with actual bank transfers.
* The goal is to clear all property-related balances from the credit card balance breakdown.

**Prerequisites**

* Access to the accounting system (BXN).
* Access to Bank of America online banking.
* Current credit card balance breakdown showing property-level negative balances.


:::info
### Step-by-Step Procedure


1. **Review the Credit Card Balance Breakdown**
   * Navigate to the Bank of America credit card account in the accounting system.
   * Go to the **Balance Breakdown** tab.
   * Filter for **All Properties**.
   * Identify every property showing a negative balance (these are the amounts to be reimbursed).
2. **Identify the Reimbursing Bank Account for Each Property**
   * For each property with a balance:
     * Use the Bildium tab (or property search) to locate the property profile.
     * Note the property's designated bank account number (e.g., 334, 206, etc.).
3. **Record the Reimbursement Transaction in the Accounting System**
   * In BXN, go to the property's banking page (or use **Record Other Transactions**).
   * Select the property (e.g., 128 37th Avenue East).
   * Set the **From** account: the property's bank account (e.g., 334 Wilson).
   * Set the **To** account: Bova CC (account 103) — type "Bova CC" or "103".
   * Enter the **Amount**: the exact balance due shown in the Balance Breakdown for that property (e.g., $390.20, $159.50).
   * Leave the **Memo** line **blank** (to avoid questions during bank reconciliation; the expense is already reflected on the owner's statement).
   * Save / Record the transaction.
4. **Perform the Actual Bank Transfer**
   * Log in to Bank of America online banking.
   * Initiate a transfer:
     * From: the property's bank account (e.g., account ending in 334).
     * To: Bank of America credit card.
     * Amount: match the exact amount recorded in step 3.
   * Complete and confirm the transfer.
5. **Verify Completion**
   * Return to the accounting system.
   * Refresh the **Balance Breakdown** for the credit card (All Properties filter).
   * Confirm the property's balance has disappeared (now zeroed out for that property).
6. **Repeat for All Properties**
   * Work through every property listed in the Balance Breakdown.
   * Continue until **only Segerius expenses** remain on the credit card (non-property items).

:::


:::warning
### Important Notes

* Always use the exact balance amount shown in the Balance Breakdown — do not round or estimate.
* Memo line must remain blank for these reimbursement transfers to prevent confusion during reconciliation.
* The utility/property expense is already correctly reflected on the owner's statement; the transfer is purely to settle the credit card.
* If the process changes in the future (e.g., adding memos), update this SOP accordingly.

:::


---

## How to issue a paper check to a Vendor

[VIDEO OVERVIEW](https://www.loom.com/share/706fcf5f271048959811420ab2635602)

 ![Paper check issuance overview](https://lh7-rt.googleusercontent.com/docsz/AD_4nXdOyhQ9oZGYs6fO70MZIKYr0PZpxiA0cx0GGL5kIk7_5bMcXbv9EKIYpyjIdQqfPj_9mKjz2ogqvY1GAoz5Zhils2WEbSnbCjoZtXNlgphbWG7AlO6V0nxl5qaDxZ_TPQkG9443__t4qiAcpS91XnQX0ZDq?key=nnhKEmcP1_mvGVmGiinqRQ)

**Scope**

Applies to any outstanding vendor bill in Buildium where:

* No "Pay by EFT" option appears
* No vendor-provided online payment link is available
* Vendor has explicitly declined electronic payments (e.g., refuses $10/month fee for ACH)

**Responsibility**

* Primary: Accounts Payable Specialist
* Escalation: If check is reported lost/never received → Accounts Payable Manager (void & re-issue process)

**Prerequisites**

* Vendor profile in Buildium contains correct physical mailing address (PO Box or street address)
* BXN bank account is active and set up for check printing
* Third-party check printing/mailing service is integrated with Buildium
* Invoice email or PDF is available for address confirmation


:::info
### Step-by-Step Procedure


1. **Confirm No Electronic Payment Option Exists**
   * Open the outstanding bill in Buildium (**Accounting → Bills**).
   * Check for:
     * "Pay by EFT" button/dropdown
     * Any note or link in vendor profile or invoice indicating online payment portal
   * Search vendor name + "payment" or invoice number in Gmail (billing@sagarius.com inbox) to confirm no payment link was sent.
   * If any electronic option is found → use it instead.
   * Proceed to paper check **only** if no electronic method is possible.
2. **Double-Confirm Vendor Mailing Address**
   * In the bill view, note the payee name and any address shown.
   * Click the vendor name link → opens vendor profile in new tab.
   * Verify **Address** field matches the invoice/expected billing address (e.g., PO Box 937, Port Orchard, WA 98366).
   * Cross-check against recent invoice email/PDF if needed.
   * If address mismatch or missing → do **not** proceed. Update vendor profile first or launch investigation.
3. **Record Payment as Check**
   * Return to the bill → click **Pay Bill**.
   * Select the bill/invoice to pay.
   * Change **Bank Account** to **BXN** (type "B X" or "BXN" — it should appear first in dropdown).
     * This is the only account that enables check printing.
   * Click **Prepare Payment**.
   * In the payment method dropdown, select **Queue Check for Printing**.
     * This option appears **only** for BXN account.
     * A check number prompt and print preview may appear — this is normal.
   * Confirm and save the payment.
   * The check is now queued (status = waiting to print/mail).
4. **Generate & Submit Check for Printing/Mailing**
   * Navigate to **Accounting → Banking**.
   * Select the **BXN** account (usually top of list if sorted numerically).
   * Click **Print Checks** (or "Queue Checks" / "Generate Checks" button).
   * Review queued items:
     * Confirm vendor name, amount, invoice reference, address.
   * Select the check(s) to process.
   * Click **Generate and Print Checks** (or equivalent final submit button).
   * The third-party service now:
     * Prints the check
     * Stuffs envelope
     * Mails via USPS
   * No physical printing or mailing is done in-office.
5. **Post-Process & Monitoring**
   * Mark bill as paid in Buildium (already done in Step 3).
   * Save confirmation (screenshot of queued check or print job ID if available).
   * Monitor vendor follow-up:
     * If vendor reports non-receipt after reasonable mailing time (10–14 business days) → initiate **Check Void & Re-issue** process (SOP: Voiding Checks & Alternative Payment).
     * Strongly prefer switching vendor to electronic payment for future invoices.

:::


:::warning
### Key Decision Rules

* Paper check = **last option only**.
* Always confirm address twice (invoice + vendor profile).
* Use **only BXN account** for check queuing — no other account has "Queue Check for Printing" option.
* Never hand-write or print checks in-office — third-party service handles everything.

:::


:::tip
### Best Practices & Reminders

* Mailed checks have \~25% non-delivery risk — vendors may claim non-receipt even when sent correctly.
* Document every step — especially address confirmation and queue submission.
* Encourage vendors to accept EFT/direct deposit to avoid this process in future.
* If vendor repeatedly refuses electronic options, escalate to manager for potential vendor review.
* Track check queue in BXN account weekly to ensure no backlog.

:::


---

## How to Process Property with Pay No Bills tag

[VIDEO OVERVIEW](https://www.loom.com/share/a3d99b7ce17e4d52b4304f3b6e2e06c6)

 ![Pay No Bills tag processing](https://lh7-rt.googleusercontent.com/docsz/AD_4nXddo9tMLwYG50FJoGx9ddaxChn13uXtecw6E9jN7X9nYE94ElAzOLMEQ4DGSor0LnOnXAOEzOa_4T6g-7SE8oUw0Cd5TAkKm2LLv4Oxo-mmKGz1evPAZEp85-n8zoTcf2jxNNOOsi6tmQfjBe6wv8Ecctkc?key=nnhKEmcP1_mvGVmGiinqRQ)

**Purpose**

To correctly identify and prevent payment of any bills associated with a property that the owner has instructed should incur **no further financial obligations** (e.g., during property offboarding, sale, or explicit owner directive), while ensuring proper escalation and documentation to avoid accidental payments or financial exposure.

**Scope**

Applies to **any open or incoming bill** in Buildium where the property address displays as **"Pay No Bills"** (or similar placeholder text) instead of the actual service/property address.

**Responsibility**

* Primary: Accounts Payable Specialist
* Escalation: [Office Manager](../../docs/role-profiles/office-manager.md) (or designated team lead) via Bill Investigation task

**Prerequisites**

* Bill visible in Buildium (Accounts Payable → Bills or Paid Bills screen)
* Access to Asana for launching investigations
* Google Drive / shared folder for bill attachments


:::info
### Step-by-Step Procedure


1. **Identify the "Pay No Bills" Flag**
   * While reviewing or attempting to pay a bill, check the **property address / name** field.
   * If it displays **"Pay No Bills"** (instead of the normal street address, e.g., "1808 Minor Avenue"), **do not proceed with payment**.
   * This flag is intentionally set by management when:
     * The property is being offboarded
     * The owner has directed no further charges be incurred on the property
     * Any other situation where payments should be paused or stopped
2. **Do Not Pay or Record Payment**
   * Immediately **cancel / close** any payment screen.
   * Do **not** mark the bill as paid, queue payment, or initiate EFT/check.
   * Leave the bill in its current open/unpaid status.
3. **Launch Bill Investigation in Asana**
   * Download or save the bill PDF (from email, vendor portal, or scanned copy).
   * In Asana, create a new **Bill Investigation** task (use the standard template/form).
   * Assign to [**Office Manager**](../../docs/role-profiles/office-manager.md) (or current designated reviewer).
   * Fill required fields:
     * Property name/address as shown ("Pay No Bills")
     * Vendor name
     * Invoice number / date / amount
     * Brief description: "Bill received for property flagged 'Pay No Bills' – likely offboarding or owner no-charge directive"
   * Attach the bill PDF.
   * Add any relevant context (e.g., "Appears to be final utility bill during offboarding").

:::


:::warning
### Key Decision Rules

* **"Pay No Bills" = immediate stop** — never pay these bills without explicit approval.
* Always launch **Bill Investigation** — even if it seems obvious (creates documentation chain).
* Never remove or override the "Pay No Bills" flag yourself — that is a management-level change.

:::


:::tip
### Best Practices & Reminders

* This flag is a deliberate safeguard — treat it as a hard block.
* The placeholder "Pay No Bills" instantly affects **all** bills for that property once set.
* Document every step (screenshot of flag, Asana task ID, memo entry) — protects against disputes.
* If multiple bills appear with this flag in a short period → likely offboarding in progress → notify team lead.
* Common context: final utility bills, late vendor invoices, or owner-directed stop-work

:::


---

## Processing Prepaid Credit Card Transactions

[VIDEO OVERVIEW](https://www.loom.com/share/50e9aa29984848faa5da008b6906ffa9)

 ![Prepaid credit card transaction processing](https://lh7-rt.googleusercontent.com/docsz/AD_4nXfwjDREIDsRN4bLmA55EPoy6katVB7bR6xy-kRIQh_eW1zW0nvHBG5LFz7zIKjpX3ICFzA8mxf815LDeh8rHWQnUVOCHoup_i3dnFPk9YIMmEYAskn_ZiSC1IfIP4l1jAZ9P3pTM0bnnAKahE1a8rs5aMSz?key=nnhKEmcP1_mvGVmGiinqRQ)

**Purpose**

To correctly record and mark as paid any vendor invoices that were prepaid by the Operations team using Vincent's credit card, ensuring:

* The bill is closed without duplicate payment
* The expense is properly routed to the correct credit card account
* Reimbursement or allocation occurs accurately
* No financial discrepancies arise during reconciliation

**Scope**

Applies to any invoice in Buildium where:

* Memo or notes indicate "Paid by Vincent's CC," "Prepaid," "Paid in Advance," or similar
* Payment was already made by Operations (Vincent's credit card) ahead of invoice receipt
* Vendor requires prepayment (common with certain vendors)

**Responsibility**

* Primary: Accounts Payable Specialist
* Coordination: Operations team (for confirmation if needed)

**Prerequisites**

* Invoice already entered in Buildium by Accounts Receivable (or verified by AP)
* Memo field clearly states "Paid by Vincent's CC" or equivalent
* Vincent's credit card is set up as a sub-account under the main **Bank of America credit card** in Buildium


:::info
### Step-by-Step Procedure


1. **Identify Prepaid Invoice**
   * While reviewing open bills, locate invoice with:
     * Memo / notes: "Paid by Vincent's CC," "Prepaid – Vincent's CC," or similar
     * Status still open/unpaid (entered but not yet marked paid)
   * Confirm no duplicate entry exists (search by vendor, amount, invoice number).
2. **Verify Details Before Payment**
   * Open the bill → review:
     * Vendor name & invoice number
     * Amount matches what was prepaid
     * Property / line items correct
     * Memo confirms prepayment by Vincent's CC
   * If anything unclear or missing → launch **Bill Investigation** in Asana with screenshot/attachment.
3. **Mark Bill as Paid (Quick Process)**
   * Click **Pay Bill**.
   * Select the bill/invoice.
   * Change **Bank Account** to **Vincent's CC** (sub-account under Bank of America credit card).
     * Search/type "Vincent" or "Bank of America" → select the correct sub-account.
   * Click **Prepare**.
   * Review:
     * Amount matches invoice
     * Payment method = credit card sub-account
   * Click **Confirm** / **Save** to mark paid.
   * No actual funds move — this is a **recording-only** step (payment already occurred via Operations).

:::


:::warning
### Key Decision Rules

* **Never** issue a second payment (EFT, check, etc.) — treat as already satisfied.
* **Always** use **Vincent's CC sub-account** under Bank of America credit card — never Chase or other cards for these.
* If memo is missing or unclear → do **not** assume prepayment; launch **Bill Investigation**.
* Prepayments are "nice" because payment step is skipped — just record and close.

:::


---

## Paying SCL and SPU using Seattle Services Portal

[VIDEO OVERVIEW](https://www.loom.com/share/720f3d88ef8c49a4aee5066233136d0a)

 ![Seattle Services Portal payment](https://lh7-rt.googleusercontent.com/docsz/AD_4nXfAahgwLdN03XY79EviH4qPeL6h4YLi4YmsAnanRsDhGDX94N7hJRz54ftk5A5dr15dQqLWDWiBtlAvrTfqCiVE37_E9AgPvzqIioK86Bp6UrVtkstP7ox2kb25YlRVbHESoUGS8MmM2dsc8NhBEa0imfME?key=nnhKEmcP1_mvGVmGiinqRQ)

### SOP Section: Paying Seattle City Light & Seattle Public Utilities Bills via Shared Online Portal (Preferred Method)

**Purpose**

To process payments for Seattle City Light and Seattle Public Utilities bills quickly and efficiently by using their shared registered online portal (pay multiple bills feature), minimizing navigation between sites, reducing guest payment friction (e.g., ZIP code issues), and grouping payments across multiple properties in one session — saving 30–60 minutes per batch compared to guest payments.

**Scope**

Applies to **all** open bills from:

* Seattle City Light
* Seattle Public Utilities

When the property/account is registered in the portal.

Unregistered accounts fall back to guest payment (separate SOP).

**Responsibility**

* Primary: Accounts Payable / Utility Payment Specialist
* Credentials managed in OnePassword (shared team access)

**Prerequisites**

* OnePassword with saved login for **Seattle Public Utilities online account** (auto-logs in)
* Buildium bills already entered/edited for these vendors
* Multiple open bills filtered in Buildium (Seattle City Light + Seattle Public Utilities)
* Chase (102) or Bank of America (160) credit card ready (preferred)


:::info
### Step-by-Step Procedure


1. **Filter Bills in Buildium**
   * Go to **Billing** screen.
   * Set filters:
     * Vendors → Seattle City Light **and** Seattle Public Utilities only
     * All properties, all statuses (focus on open/unpaid)
   * Sort by due date or property.
   * Note open bills → plan to pay in portal batches.
2. **Access the Shared Portal**
   * Navigate to: **paypal.com → Seattle Public Utilities Bills and Payments** (or direct link: seattle.gov/utilities → pay online)
   * Click **Online Utility Account** / **Log In**.
   * Use OnePassword dropdown to autofill credentials → auto-login.
   * Land on account dashboard.
3. **Select Pay Multiple Bills**
   * Click **Pay Multiple Bills** (main efficiency feature).
   * This screen shows all registered accounts/properties.
   * Use **Show Filter** / search:
     * Copy/paste account number from Buildium bill.
     * Apply filter → locates exact bill instantly.
   * Verify:
     * Amount matches Buildium bill
     * Service address/property matches
   * Check **Select** / **Pay** for that bill.
4. **Process Payment (Credit Card Preferred)**
   * Select credit card:
     * Chase 102 (default for many utilities)
     * Or Bank of America 160
   * Enter CVV if prompted.
   * Review amount → **Continue** / **Submit**.
   * Enter **authorization code** (if sent via text/email) → **Confirm**.
   * Note **Payment ID** / confirmation number (on screen or emailed).
   * Click **Continue** → returns to Pay Multiple Bills screen.
5. **Repeat for All Registered Bills**
   * Use filter again → next account number from Buildium.
   * Select → pay → confirm → repeat.
   * Groove: Filter → pay → confirm → next (very fast once in rhythm).
   * If bill **does not appear** in portal → skip → pay as guest later (fallback SOP).
6. **Record Payments in Buildium**
   * Return to each bill in Buildium.
   * Click **Pay Bill** / **Record Payment**.
   * Select correct **Bank Account** (Chase 102 or Bank of America 160 — matches what was used).
   * Paste **Payment ID / confirmation number** into **Check Number** / **Reference** field.
   * Confirm amount → **Prepare** → **Confirm** → save.
   * Repeat for each paid bill.
7. **Handle Unregistered Accounts (Fallback)**
   * After clearing all registered bills → switch to guest payment for remaining:
     * Go to public guest pay page (same site).
     * Pay as guest → enter account number, ZIP, etc.
     * Use same credit card.
     * Record in Buildium as above.
   * Circle back only after registered batch is complete.

:::


:::warning
### Key Decision Rules

* **Always** attempt portal first (registered = faster, fewer errors).
* **Credit card preferred** — Chase 102 or Bank of America 160.
* **Never** enroll in paperless or auto-pay — uncheck if prompted.
* If portal shows no bills → confirm account registration; pay guest if needed.
* Batch by vendor → pay all Seattle City Light / SPU bills together.

:::


:::tip
### Best Practices & Reminders

* Portal login saved in OnePassword → use autofill every time.
* Filter by account number = fastest way to locate bills.
* Pay multiple in one session → huge time saver (30–60 min vs. individual guest payments).
* Save confirmation numbers → attach screenshot/receipt to Buildium bill.
* Reimburse credit card from property operating account (standard utility reimbursement).
* If portal access issues → escalate to manager (possible credential reset).

:::
