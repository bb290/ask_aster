---
title: "/field Tools"
service_line: lease up
sop_owner: brittany@sagareus.com
outline_url: https://sagareus.getoutline.com/doc/field-tools-bDa7ScAbvH
status: active
last_reviewed: 2026-07-24
visibility_tier: ic
version: 1
tags: [leasing, field-tools, site-visit, activity-report, prelisting, change-log, team-hub]
created_but_never_updated: false
---

The Team Hub at **https://www.sagareus.com/field** hosts the three leasing field tools. Phone-first, one tap per action, and everything they produce lands in Asana automatically. Every tool has a by-hand fallback SOP for when it is down; the deadline and format never change.

:::info
**Asana mobile shows stale values after a tool posts.** If a field, due date, or completion state looks wrong right after using a tool, pull down to refresh (or close and reopen the task) before assuming something failed — the app caches what it showed you last.
:::

## The Tools

* **Site Visit** — the weekly walk-through checklist. Pass/Fail every item (Essentials, Appliances + Systems, Move-In Ready), snap photos, and one SUBMIT posts the marked-up checklist to the property's inspection subtask, creates an assigned ticket for every Fail, and attaches a shareable inspection PDF. SOP: [Weekly Site Visit](https://sagareus.getoutline.com/doc/weekly-site-visit-yjZFdeB9EC) · [Manual Fallback](https://sagareus.getoutline.com/doc/weekly-site-visit-manual-fallback-bdcObUreW9)
* **Activity Report** — builds the weekly owner report for all three states (Turnover / Leasing / Pre-Move-In) from Asana pre-fill plus your inputs: verify listings, activity numbers, feedback, rent comps, listing updates, and it can push the Buildium listing (description, rent, availability date) directly. SOP: [Email | Owner - Weekly Activity Report](https://sagareus.getoutline.com/doc/email-owner-weekly-activity-report-VDE6GnaYef) · [Manual Fallback](https://sagareus.getoutline.com/doc/weekly-activity-report-manual-fallback-7xyhYD91cY)
* **PreListing Report** — market rent analysis from a Unit ID or address: live comps, market position, pricing strategy defaults, and a Buildium-ready draft listing, all in one report for the owner. SOP: [Market Rent & Listing Strategy](https://sagareus.getoutline.com/doc/market-rent-listing-strategy-qMikxE9WOV) · [Manual Fallback](https://sagareus.getoutline.com/doc/prelisting-report-manual-fallback-Mbs8Hbagju)

## Change Log — Site Visit

* **07-17** — Launched: phone checklist posts the comment, photos, and tickets to Asana in one submit.
* **07-19** — Checklist rebuilt into three sections with Pass/Fail, issue dropdowns, per-item photos, and the inspection PDF.
* **07-22** — Fixes: visits always anchor to the leasing task; occupied and unlisted visits file to a "Site Visits // address" task in Maintenance 2.0; the address prints in the comment header.
* **07-22** — Picker runs through move-in (closed tasks stay searchable 60 days); tickets are due next day.
* **07-23** — "Hang Tight!" overlay while posting; Inspected By name buttons (required, prints in the comment and PDF).

## Change Log — Activity Report

* **07-19** — Launched: builds all three weekly reports (Turnover / Leasing / Pre-Move-In) with Asana pre-fill and posts to the report subtask.
* **07-20** — Rent Comps card: pull live comparables into the report.
* **07-21** — Buildium built in: listing preview with your changes highlighted, AI rewrite, and Update Listing pushes description, rent, and availability date.
* **07-22** — Polish Comment (write 12+ words first, AI tidies it); picker runs through move-in; rent-comp lookup limit fixed.
* **07-23** — "Hold Up!" overlay while posting.

## Change Log — PreListing Report

* **07-19** — Launched: Unit ID or address in; comps, market position, strategy, and the owner report out.
* **07-21** — Draft Listing pipeline: AI draft, structured pricing strategy, Copy Listing and Post to Buildium.
* **07-22** — Draft lines that differ from the current listing highlight yellow; lookup limit fixed.
* **07-23** — "Hold Up!" overlay while posting.
* **07-23** — Lease Details bullets are single-spaced in the draft and report. New card below the rent comps: View Listing in Buildium (opens the unit profile) and a photo review — the Buildium photos load automatically, click through and grade them Meets Photo Standard or Does Not Meet Standard. A pass prints in the report as "Photos meet our listing standard"; a fail prints "We'll coordinate photos post turn over & cleaning."
* **07-23** — Polish Comment on Agent Comments (write 12+ words first, AI tidies it — same as the Activity Report). The text report now opens with an owner intro: analysis complete, review and reply, we proceed in one week if we don't hear back. The intro is editable in the page editor.
* **07-23** — The polish button now shows "Keep typing... N more words" until you hit the 12-word minimum (both here and on the Activity Report). Post to Buildium completes the "Prepare | BD Listing" subtask; Copy & Post to Asana completes "Email | Owner - Market Rent & PreListing" — both stamped with today as the due date so the done-day is visible. Posting also writes Starting Price, Minimum Price, and the new 🤖 Estimated Market Rent field on the LU task, so we can compare our estimate to the actual lease later.
* **07-24** — Bug fix: the AI's commentary (location research notes, verify-before-publishing reminders) could land inside the draft listing text and travel to Buildium. It now lives in its own "AI Notes" box under the Generate button and can never enter the draft, the report, or a posted listing.
* **07-24** — Staff feedback round: comp links now open the actual Zillow listing (no more hand-fixing links before sending); security deposit prints "$100 less than 1 month rent" instead of a dollar amount (draft listing + strategy); comps pull on bedroom count only for a wider pool; new Radius selector (Auto to 10 mi) for thin markets; "Active only" filter chip next to the month chips, on by default; and Agent Comments now insert themselves into the owner email even if you edited the text before writing them. Requested for later (logged in the Improvements task): add a comp by pasting a Zillow link.

## Change Log — Inspections (in the workshop, /wt only)

Field tool #4, not yet on /field. Testing at https://www.sagareus.com/wt.

* **07-22** — Built: Turn Over Complete inspection posts a PASSED 🙌 / FAILED 😩 subtask on the Turn Over task with the full checklist, photos, punch list, and PDF.
* **07-22** — Asana choreography: FAILED reopens the turn over (punch list due today, fields reset, coordinator @mentioned); PASSED closes it out (Turn Over Verified stamped, tasks completed, coordinator thanked).
* **07-22** — Checklist: Repairs + Turn Work scope cards pulled from the Approved Scope field, Site Visit sections minus cleaning, and a graded Cleaning section that posts to the cleaning subtask.
* **07-23** — Polish: "Hang Tight!" overlay, All Pass passes the whole section, Start Over reset, Inspected By, and every label is editable in the page editor.
* **07-23** — New Rent Ready section at the top: the 13 standard vendor items (rekey + keys, smoke/CO, Affresh runs, furnace filter, water heater, appliances, heaters, drains, leaks), open by default with the same fail options as Repairs + Turn Work. Duplicates removed from the sections below (front keys, detectors, drains/leaks); Big Tickets untouched.
* **07-23** — Essentials section retired: Mailbox Keys and Pests + Mold moved into Move-In Ready. Checklist is now Rent Ready → Repairs + Turn Work → Big Tickets → Move-In Ready → Cleaning. Inspector name buttons now match the Site Visit roster.
* **07-23** — Move Out mode is live (on /wt). Lean neutral documentation, not a full survey: per-area All Good / Document Issue, a photo required for every finding, cleaning grade, keybox + video link. One submit posts the report to the move-out inspection subtask (completed, dated), stamps Move Out Completion Date, adds the findings to the Turn Over Approved Scope (the initial work order — they come back as scope cards at the Turn Over Complete inspection), attaches a client-facing Move Out Condition Report PDF with photos embedded, and preps the owner notification email as a one-tap Gmail draft. Deductions are assessed later against the Move In report; nothing in this report argues charges.
* **07-24** — Move Out mode removed from the widget: the draft was not right and is not rolling out, so it is back to "Coming soon" while it gets re-scoped. Turn Over Complete is unaffected. The draft work (guided steps, trade-grouped report, video upload, client-facing PDF) is preserved in version history for the rebuild.

## Change Log — Onboarding Wizard (in the workshop, /wt only)

Owner-facing multi-step onboarding. Writes to the new **Client Relations // Initial Onboard** Asana project only; data pushes to Property/Unit Settings later via a staff step (fill blanks, never overwrite).

* **07-24** — Built and live on /wt: Welcome → New Client or Existing Client. New Client: encrypted Accounting form embedded first (separate for security), then the PM Onboarding sections as tap-open dropdowns mirroring the current Jotform with its branching (multifamily, occupancy, key transfer, PM transfer, HOA, non-conforming), policies acknowledgment with initials, save-and-come-back, and a close-out with next steps + downloadable onboarding doc. Existing Client: Add Property / Add Unit quick requests, or the secure Account Update form embedded. Every submission lands as a task with custom fields, unit subtasks, and an AI-compiled Onboarding Summary with 30-60-90 day priorities.
* **07-24** — Flow reshaped: New Client opens a 3-step roadmap card (Accounting Onboarding → Property Onboarding → Close Out, each explained) with a Take Me To Accounting Form button. The accounting skip option is removed — accounting comes first. Every step button now matches the accounting form's Save/Next style.
* **07-24** — Sections rebuilt: Owner Details is now Authorized Personnel — contact cards (Name, Phone, Email, Relationship) with an info popup explaining who belongs there, add as many as needed. Communication Preferences options are short labels with "i" popups defining each. Property Details moved up under Communication Preferences; vacancy is renamed Vacancy Status and sits last in Transfer Details with new branches: pending move out reveals Current Occupant cards, a deposit-refund dropdown, and a green leasing-procedures card; fully occupied reveals occupant cards plus a tenant docs upload spot. Construction is a required Yes/No with timeline + site plan; urgent repairs moved to Transfer Details with a photo upload spot.
* **07-24** — Dropdowns everywhere: Property Type, Heating Type (with notes), Garage Details (1-4 car), HOA "What Does HOA Manage?" checkboxes, an EV "open to install" option, and all seven utility providers pull from the Resident Hub list with an Other type-in. Preferred Vendors are contact cards with a vendor-type dropdown. Utility Management choosing "Sagareus to manage" reveals the disable-auto-pay reminder card.
* **07-24** — Policies acknowledged now include the 72-hour response policy and the Construction Addendum ($200/mo rent credit during construction). Filled fields turn and stay green across the whole widget so progress is visible at a glance.
* **07-24** — Prefill upgraded: entering your email pulls the property address from the HubSpot deal card, not just the contact card. Internal deal data (fees, notes) never reaches the form.
* **07-24** — For editors: every piece of wizard copy is editable in the page editor, organized into 8 screen-by-screen groups with a plain-English note on each field.
* **07-24** — Feedback home: the "Field Tools | Bugs & Feature Requests" task in the Improvements project has a subtask per tool — drop bugs and requests there.
