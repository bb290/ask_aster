---
title: "Onboarding // Wizard Intake Flow"
service_line: property onboarding
sop_owner: brittany@sagareus.com
status: active
last_reviewed: 2026-08-03
visibility_tier: ic
version: 1
outline_url: https://sagareus.getoutline.com/doc/onboarding-mg8kdCfvXZ
tags: [property-onboarding, onboarding-wizard, intake, asana, client-relations-2.0, hubspot, add-property, add-unit, owner-feed]
created_but_never_updated: false
---

:::info
As of August 2026, onboarding intake is automated by the Onboarding Wizard at sagareus.com/onboard-and-update. It collects the owner's answers, creates the Asana tasks, fills the data fields, and writes back to HubSpot on its own. Staff work begins at the (CLIENT) task, not at data entry. There is no onboarding form to chase, upload, or retype.
:::

## New Client Flow

1. Owner accepts the proposal and signs the PMA in PandaDoc, which redirects them to the wizard.
2. The wizard looks them up by email and prefills their details from the HubSpot deal, including the Owner Preferences they set on the proposal page.
3. Subject Property Address is the first step. Submitting it immediately creates the Initial Onboarding data task in Client Relations // Initial Onboard, in the Wizard In Progress section, titled with an (IN PROGRESS) suffix.
4. Every answer autosaves to that task as the owner works. On final submit the wizard automatically:
   - Renames the data task and moves it to New Submissions, carrying the full question-and-answer dump, 40+ populated custom fields, one subtask per unit, and an AI-written Onboarding Summary with 30-60-90 day priorities
   - Creates the (CLIENT) task from the template, cross-linked to the data task
   - Sets Communication Settings and Owner Email(s) on the (CLIENT) task and attaches the Onboarding Summary PDF
   - Moves the HubSpot deal to Full Service PM / Onboard and writes every answer back to the deal
5. The owner finishes with the Accounting form (Jotform) and can upload photos, leases, and HOA documents directly to the task.

## Existing Client - Adding Property

1. Owner picks Existing Client, then Add Property, and enters the property address, their name, and email.
2. That immediately creates the (PROPERTY) task from the template, with the "SEND | PMA - Existing client adding property" subtask assigned to Brittany due same day, plus the Add Property data task.
3. The owner completes the same full property onboarding form as a new client, autosaving as they go.
4. The Accounting form appears with a skip option for owners keeping the same ownership entity and bank account.
5. Close out tells the owner the PM Agreement addendum will be sent for review and e-signature.

## Existing Client - Adding Unit

1. Same address-and-identity first step; creates the (UNIT) task with "VERIFY | PMA Includes All Units" assigned to Brittany due same day, plus the Add Unit data task.
2. Same full property onboarding form with autosave. No accounting form.
3. Close out tells the owner the team will review the current PMA and update property records for the new unit.

## What Staff Watch For

:::warning
Tasks in the Wizard In Progress section are live owner drafts. Do not action, edit, or complete them; the wizard is still writing to them.
:::

- A Wizard In Progress task surfacing in My Tasks means the owner has gone quiet for 3 days. The task is assigned to Brittany with a rolling due date that every autosave pushes forward; if it comes due, the owner stalled mid-wizard. Everything they answered so far is on the task. Call them.
- Submitted tasks arrive complete. The dump, custom fields, unit subtasks, and AI summary are already on the data task; the (CLIENT), (PROPERTY), or (UNIT) task already exists. Early "receive and upload the onboarding form" work in the Asana SOP is now a verification pass, not data entry.
- Owner Email(s) on the (CLIENT) task controls Owner Feed access. The wizard fills it for new clients (all authorized personnel, comma-separated). For a property to have a working Owner Feed link, the (CLIENT) task needs both the Property ID field and Owner Email(s) populated.

## Pending Development (Vincent)

The next automation phase is a staff-triggered push that carries wizard data the rest of the way once Buildium IDs exist. Until these ship, the corresponding work stays manual per the Asana SOP.

1. Phase 1: Populate the (CLIENT) task's Utility, HOA, and Transfer Request subtasks from the onboarding data (matched by Property ID, fill blanks only)
2. Phase 2: First Buildium writes: unit descriptions, Year Built, maintenance tasks from urgent repairs, Leasing task for vacant or pending units carrying the estimated market rent
3. Phase 3: Prefill Property Settings and Unit Settings tasks from the onboarding fields (fill blanks only; settings stay the operational source of truth)
4. Phase 4: Generate the Multifamily Playbook for multi-unit properties
