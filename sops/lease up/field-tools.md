---
title: "/field Tools"
service_line: lease up
sop_owner: brittany@sagareus.com
outline_url: https://sagareus.getoutline.com/doc/field-tools-bDa7ScAbvH
status: active
last_reviewed: 2026-07-22
visibility_tier: ic
version: 1
tags: [leasing, field-tools, site-visit, activity-report, prelisting, change-log, team-hub]
created_but_never_updated: false
---

The Team Hub at **https://www.sagareus.com/field** hosts the three leasing field tools. Phone-first, one tap per action, and everything they produce lands in Asana automatically. Every tool has a by-hand fallback SOP for when it is down; the deadline and format never change.

## The Tools

* **Site Visit** — the weekly walk-through checklist. Pass/Fail every item (Essentials, Appliances + Systems, Move-In Ready), snap photos, and one SUBMIT posts the marked-up checklist to the property's inspection subtask, creates an assigned ticket for every Fail, and attaches a shareable inspection PDF. SOP: [Weekly Site Visit](https://sagareus.getoutline.com/doc/weekly-site-visit-yjZFdeB9EC) · [Manual Fallback](https://sagareus.getoutline.com/doc/weekly-site-visit-manual-fallback-bdcObUreW9)
* **Activity Report** — builds the weekly owner report for all three states (Turnover / Leasing / Pre-Move-In) from Asana pre-fill plus your inputs: verify listings, activity numbers, feedback, rent comps, listing updates, and it can push the Buildium listing (description, rent, availability date) directly. SOP: [Email | Owner - Weekly Activity Report](https://sagareus.getoutline.com/doc/email-owner-weekly-activity-report-VDE6GnaYef) · [Manual Fallback](https://sagareus.getoutline.com/doc/weekly-activity-report-manual-fallback-7xyhYD91cY)
* **PreListing Report** — market rent analysis from a Unit ID or address: live comps, market position, pricing strategy defaults, and a Buildium-ready draft listing, all in one report for the owner. SOP: [Market Rent & Listing Strategy](https://sagareus.getoutline.com/doc/market-rent-listing-strategy-qMikxE9WOV) · [Manual Fallback](https://sagareus.getoutline.com/doc/prelisting-report-manual-fallback-Mbs8Hbagju)

## Change Log — Site Visit

* **07-17** — Launched: tap-through checklist on your phone replaces manual comment copy/paste; checklist, photos, and tickets post to Asana in one submit.
* **07-19** — Checklist rebuilt into Essentials / Appliances + Systems / Move-In Ready with Pass/Fail, common-issue dropdowns, per-item photos, Add Task for open-ended work, and the shareable inspection PDF.
* **07-22** — Bug fix: visits could file into Property Settings when the leasing task was hidden from the picker. Visits now always anchor to the leasing task when one exists.
* **07-22** — Occupied-property and unlisted-address visits now file to a "Site Visits // address" task in the Maintenance 2.0 project (briefly Client Relations earlier the same day), with tickets nested under it so coordinators can tell the property from the name.
* **07-22** — Picker covers pre-move-in: leasing tasks closed within the past 60 days stay searchable until the move-in date passes.
* **07-22** — Tickets created by a visit are now due the next day (was 3 days out).
* **07-22** — The checklist comment header now includes the property address (was only in the PDF, which does not always finish uploading).

## Change Log — Activity Report

* **07-19** — Launched: builds all three state-based weekly reports (Turnover / Leasing / Pre-Move-In) with Asana pre-fill, posts to the Weekly Activity Report subtask, and rolls the due date to next Tuesday.
* **07-20** — Rent Comps card: pull live comparables, remove bad ones, pick a 3/6/12-month window, and include the snapshot in the report.
* **07-21** — Buildium from the widget: Listing Preview with your pending changes highlighted, AI Rewrite Listing, availability date autofill (following Saturday, forward only), and Update Listing pushes description, rent, and date. Verify Listings buttons (Zillow/Redfin) with troubleshooting help. Renames: Listing Revised, Pricing Review, Hold Price.
* **07-22** — Write Comments became Polish Comment: write at least 12 words of your own Agent Comments first; the AI cleans up grammar and tone but keeps your facts and voice.
* **07-22** — Bug fix: leased-but-not-moved-in properties were missing from the picker. The picker now runs to move-in, including tasks closed within the past 60 days.
* **07-22** — Bug fix: "Daily lookup limit reached" on rent comps. Team tools no longer share the public rent widget's daily cap.

## Change Log — PreListing Report

* **07-19** — Launched: Unit ID or address in; live comps, market position, listing strategy defaults, and the owner report out.
* **07-21** — Draft Listing pipeline: AI Generate Draft Listing, selected policies and criteria flow into the draft, structured pricing strategy that cascades when you edit the market rent estimate, real previous-lease history, and Copy Listing / Post to Buildium buttons.
* **07-22** — Draft diff highlights: any line that differs from the current Buildium description highlights yellow so you can see exactly what changed; highlights clear after posting.
* **07-22** — Bug fix: "Daily lookup limit reached" (same fix as Activity Report).

## Change Log — Turn Over Inspection (in the workshop, /wt only)

Field tool #4, not yet on /field. Testing at https://www.sagareus.com/wt.

* **07-22** — Built: Turn Over Complete mode live (Move Out and Occupied Inspection modes coming soon). Pick a Turn Over task (open or closed within 30 days), walk the 22-item rent-ready checklist, and SUBMIT posts one inspection subtask on the Turn Over task — "PASSED 🙌 / FAILED 😩 || Turn Over Complete Inspection - date / address" — with the full checklist, photos, and PDF.
* **07-22** — Renamed to Inspections; mode buttons stacked like the Activity Report states. FAILED now runs the full reset: punch list due TODAY assigned to the coordinator, Turn Over task reopened, Turn Over Completion field cleared, Confirm | Turn Over Complete subtask reopened with its due date removed, coordinator @mentioned. PASSED closes the loop: Turn Over Verified (and Completion, if blank) stamped today, Turn Over task and Confirm subtask completed, task hearted, coordinator @mentioned with thanks.
* **07-22** — Checklist v2: Repairs + Turn Work comes first with a turn-scope text box auto-filled from the Turn Over task's Special Note (editable on site). Essentials / Big Tickets / Move-In Ready mirror the Site Visit checklist, minus cleaning items. New Cleaning section with the A+–F+ grading scale from the Move-Out Inspection SOP — required, included in the report, never part of the PASS/FAIL verdict — and the grade posts to the Schedule | Move Out Cleaning subtask: assigned to the LU task's assignee due today when the inspection PASSED, comment only when it FAILED (the inspection repeats).
* **07-22** — Turn scope v2: the scope pulls from the Turn Over task's description (the Approved Scope custom field takes over automatically once it exists) and renders as checkboxes with a progress count. Checking every item auto-passes Turn Scope Completed; unchecking reverts it. Agents can add or remove scope items on site, and the checked/unchecked marks print in the report and PDF. Picker now shows one entry per address (open beats closed, newest wins).
