---
title: Utilities // Flat Fee Renegotiation
service_line: utilities
sop_owner: brittany@sagareus.com
status: active
last_reviewed: 2026-05-01
visibility_tier: ic
version: 1
tags: [utilities, pass-through]
created_but_never_updated: false
---

> **Situation:** A currently leased property has variable pass-through utility billing that needs to be converted to a flat fee. The [Utility Coordinator](../../docs/role-profiles/utility-coordinator.md) initiates and owns this process end-to-end.


:::warning
**Eligibility.** Renegotiation can only happen during months 1-4 of a new lease or recent renewal. If outside this window, wait until the next renewal cycle.

:::


---

## Key Points

* **Goal** -- Convert 100% of Sagareus managed properties to flat fee billing
* **Owner** -- [Utility Coordinator](../../docs/role-profiles/utility-coordinator.md) handles all steps
* **Effective date** -- Always the 1st of a future month
* **Not a rent increase** -- Flat fee is based on historical pass-through data; total monthly obligation should not increase
* **Flat fee calculation** -- See [Configure Utilities for New Leases](utilities-configure-lease-utility.md) for methodology
* **Owner pushback** -- If an owner questions flat fee policy, see [Owner Inquires About Flat Fee vs. Pass Through](utilities-owner-inquires-about-flat-fee-vs-pass-through.md)
* **Asana project** -- [Resident Relations 2.0](https://app.asana.com/1/706990140225747/project/1201903129380625)


---

## Procedure

### Create Asana Task


1. Create task in Resident Relations 2.0
   * **Template:** "Utility Addendum Renegotiation // [Property Address]"
   * **Section:** Negotiations
   * **Assigned to:** Utility Coordinator
   * **Due:** 3 days
2. Fill in the task description:
   * Buildium Lease Link
   * Utility Audit File Link
   * Accounting Recommended Monthly Utility Flat Fee: $
   * Effective Date: <YYYY-MM-DD>
3. Create subtasks:
   * Tenant Facing Utility Audit
   * Renegotiate Utility Addendum with Tenant
   * Send Lease Addendum
   * Update Recurring Charges on Lease Ledger
   * Update Asana Property Settings


---

### Tenant Facing Utility Audit


1. Create a shared Google Drive folder titled "Utility Audit // [Property Address]." Set folder sharing to "Anyone with the link can view."
2. Create a utility audit worksheet using the [Utility Audit Spreadsheet Template](https://docs.google.com/spreadsheets/d/1rWLTFUl8htA2_pxsXOZ-X0WOELmX7-Va_Eze5WnX0vU/edit?usp=sharing).
3. Upload all supporting utility bills to the folder.
4. Complete the utility audit worksheet from the tenant ledger data.
5. Add the folder link and recommended monthly flat fee to the parent Asana task description.


---

### Renegotiate Utility Addendum with Tenant

Contact all tenants via email using the template below. Follow up for a response.

**If Resident agrees:** Proceed to Send Lease Addendum.

**If Resident declines:** Document the response in the Asana task. The property remains on pass-through billing until the next lease renewal.

#### Email Template -- Proposal to Simplify Utilities

> **Subject:** Proposal to Simplify Utilities // [Property Address]
>
> Hi Residents,
>
> Would you be interested in changing your monthly utilities to a flat fee?
>
> We propose updating your utilities to a monthly fee of **$[Amount]**. This is calculated by looking at your historical utility payments, extrapolated to a fixed monthly amount. You can view the calculation [here]([Utility Audit Link]) along with all backing bills. This change will not impact the net you pay each year. You will likely pay the same or less than the previous year.
>
> By switching to a flat fee, you benefit from stable monthly expenditure (predictable) and simplified accounting for all parties.
>
> This offer is optional. You are welcome to stay on your current pass-through configuration.
>
> Thank you,


---

### Send Lease Addendum


1. Navigate to the Buildium lease.
2. Click **Add Addendum**.
3. Select **"Addendum -- Utility Term Update."**
4. Fill out the following fields: Effective Date, Flat Utility Fee, Unit Address Line 2 (as needed)
5. Fill out the utility table. Every active utility must have a check mark.
6. Review and send the agreement for signing.


---

### Update BD Rent


:::warning
This must be done on the effective date, not before.

:::


1. Navigate to the Buildium lease, then **Financials**, then **Rent**.
2. Update Current Rent, then Edit, then **Split Rent Charge:**
   * Account: Utility Recovery
   * Memo: Utilities
3. Update Future Rent if any.
4. Add the first utility charge to the ledger. Future charges will be handled by the Rent configuration.


---

### Update Asana Property Settings


1. Search [Unit Settings](https://app.asana.com/1/706990140225747/project/1213032009308835) first. If the unit has a settings task, update the Utilities field there.
2. If no unit settings exist, update the [Property Settings](https://app.asana.com/1/706990140225747/project/1211134623744906) Utilities field instead.


---

### Pass Through Final Bills


1. Keep the Asana task open after the addendum is signed.
2. Monitor for remaining bills that cover service periods before the effective date.
3. Pass through those bills prorated up to the effective date, then close the task.
