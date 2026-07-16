---
title: "Move In // Leasing Assistant Procedures"
service_line: lease up
sop_owner: brittany@sagareus.com
outline_url: https://sagareus.getoutline.com/doc/move-in-leasing-assistant-procedures-HoNlxQgPbc
status: active
last_reviewed: 2026-07-16
visibility_tier: ic
version: 1
tags: [leasing, move-in, leasing-assistant, email-templates, buildium]
created_but_never_updated: false
---

The Leasing Assistant's move-in tasks, from lease signing through move-in prep. Part of [Move In](https://sagareus.getoutline.com/doc/move-in-f0sLMcj1VF).

## Notify Other Applicants

1. Once a lease has been signed, notify the other applicants that this property is no longer available. They have not been declined.
2. Send the Property Leased Notification Email. If they respond back annoyed they didn't get the property, send the Applicant Challenges Why They Weren't Selected email.
3. Reassign the Applicant Asana Task back to the Leasing Agent: remove address from task title (leave just their names), remove as subtask, convert to subtask of "Leasing Agent CRM", assign to Leasing Agent due today, mention Leasing Agent in a comment ("Applicant missed out on [property address]").

## Email Template — Property Leased Notification

> Subject: Property No Longer Available – Let's Find You the Right Fit
>
> Hi [Applicant Name],
>
> Thank you for applying! This property has been leased and is no longer available.
>
> The good news? Your application can be transferred to any of our current or upcoming listings at no additional cost.
>
> Your Leasing Agent, [Leasing Agent Name], is cc'd here and will follow up with you directly to explore other options based on your needs, budget, and move-in timeline.
>
> In the meantime, feel free to browse our currently active listings: https://sagareus.managebuilding.com/Resident/rental-application/new
>
> We appreciate your interest and look forward to helping you find the right home!

## Email Template — Applicant Challenges Why They Weren't Selected for Lease

> Subject: Application Update – Property No Longer Available
>
> Hi [Applicant Name],
>
> We understand how frustrating it can be to learn that a unit has been leased, especially after you've already applied and provided supporting documents.
>
> We often receive multiple applications for a single property and process them in the order they're marked complete. An application is considered complete when all required applicants have: submitted the full application, paid the application fee, uploaded supporting documents, and responded to any follow-up questions to clarify discrepancies.
>
> If another application is completed and approved while others are still in progress, we are required to move forward with the first qualified applicant. Once a lease is signed, we're unable to proceed with additional applications for that unit.
>
> The good news is your application can be transferred to any of our available or upcoming properties at no additional cost. I've cc'd your Leasing Agent here so they can follow up with you directly and help you explore other options that may be a better fit for your timing, needs, and budget.
>
> If you'd like to submit feedback about your experience, you're welcome to do so using our customer service form at sagareus.com/contact-us. Management will review and respond within 72 business hours.
>
> Thank you again for your time. We sincerely hope we can help you find your next home.

## Send Lease Signed Notification to Owner

> Subject: Lease Signed! [Property Address]. Attachment: Signed Lease
>
> Hi [Owner Name],
>
> Attached, please find executed lease with a scheduled move-in date of [Move In Date].
>
> Next Steps: Sagareus will complete final cleaning and turn over in preparation for the move-in; meet with the Resident; conduct Move-in inspection; exchange key for the move-in fund.

## Send Pre Move In Email to Resident

> Subject: Move In [Property Address]. Attachment: Signed Lease
>
> Hi [Resident Names],
>
> We're excited to welcome you as a resident! Below are important details to help you prepare for your move-in.
>
> Resident Portal Access: your Resident Account has been created; through the Resident Portal you can make rent payments, view lease and move in condition report, submit maintenance requests and inquiries, and submit renter's insurance verification.
>
> 1st Month Rent Due: $[Amount] within 48 hours. Web: Resident Portal. Mobile App: Resident Center (iPhone and Android).
>
> Move-In Day: your Leasing Agent, cc'd here, is your primary point of contact for move-in. On move in day, our team will provide you with keys in exchange for remaining move in funds; together, you will complete the Move In Inspection. At least 1 resident must be present to sign the Move In Inspection and receive keys.
>
> Move In Funds: the remaining balance must be paid on your Move-In Date via Cashier's Check or Money Order. Bring this in exchange for keys. Pay to: Sagareus Group LLC, 2265 116th Ave NE #200-8 Bellevue, WA 98004. Important: include the property address in the memo line.
>
> [IF APPROVED for portal payment] The remaining balance must be paid on your Move-In Date via your Resident Portal. Charges post on Move In Date; do not pay early.
>
> Renter's Insurance: all residents must obtain renter's insurance within 30 days. If not acquired within 30 days, a $20/month insurance fee will be added to your ledger.

## DeList in Buildium + Mark LU Task Complete

* Buildium: Listings, search property, open Property Listings, click DeList. This removes the listing and stops leads going to the Leasing Agent.
* From the Application / Move In Task in Asana, choose the parent "LU" task and mark complete. This removes the LU task from the Active Listings section of the Leasing Project for workload management.

## Update Move In Amount / Approved to Pay on Portal? / Block EFT Payment

* Add the total Move In Cost to the Move In Task in Asana.
* Determine if residents may pay move in funds online (see [Move In // Policies](https://sagareus.getoutline.com/doc/move-in-policies-aoMfZSfGI4), the 700+ credit rule). Update the description with detail.
* If not allowed: mark due date for 48hrs to ensure we receive prorated rent, then block the EFT payment option AFTER we have received 1st month prorated rent within 48 hours. Buildium: Lease Profile, Financials tab, Payment Settings subtab, Payment Methods, click "Override payment methods", uncheck "EFT / eCheck" and "Credit Card", save.
