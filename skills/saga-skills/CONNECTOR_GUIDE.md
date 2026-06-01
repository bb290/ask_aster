# Connector Guide

Quick reference for what each MCP connector lets a Sagareus skill do, written for staff who have never built a skill before. Use this when recommending connectors in step 3 of the Saga Skills coaching flow.

The author may not know what an "MCP connector" is. The first time you mention it in a coaching session, define it:

> A connector is the link between Aster and another tool like Gmail or Asana. If your skill needs to read or write something in that tool, it needs the connector enabled in your claude.ai settings.

## Gmail connector

**What it lets the skill do:** read the staff member's inbox, search threads, read full messages, create draft replies (Aster never sends; the staff member sends).

**Common skill ideas that need it:**
- Drafting replies to inbound leads, owner emails, vendor follow-ups
- Searching the inbox for a specific thread by sender or subject
- Building a weekly digest of unread messages
- Logging communication patterns (with the staff member's permission)

**Enable it:** claude.ai → Settings → Connectors → enable Gmail with the Sagareus Google account.

**Heads-up:** Gmail signatures don't get auto-inserted into API-created drafts. If the skill drafts an email, the signature line either gets baked into the skill or the staff member inserts it manually when reviewing.

## Google Calendar connector

**What it lets the skill do:** read upcoming events, propose meeting times, create calendar events, respond to invites.

**Common skill ideas that need it:**
- Showing scheduling (find the agent's next free slot, propose times to a prospect)
- Owner call scheduling
- Team meeting setup
- Pulling the day's events to draft a morning brief

**Enable it:** claude.ai → Settings → Connectors → enable Google Calendar.

## Google Drive connector

**What it lets the skill do:** search files, read file content (PDFs, Docs, Sheets), create new Google Docs from plain text or HTML, copy templates, get share URLs.

**Common skill ideas that need it:**
- Generating a Google Doc from a chat conversation (reports, summaries, briefs)
- Reading a template Doc and producing a filled copy
- Pulling content from an owner's file or photo report

**Enable it:** claude.ai → Settings → Connectors → enable Google Drive.

**Heads-up:** The Drive connector creates Docs by uploading text and letting Drive auto-convert (text/plain becomes a Google Doc). The connector does NOT do placeholder-replacement on existing template Docs; if a skill needs a template-fill pattern, it has to generate the content fresh.

## Asana connector

**What it lets the skill do:** search tasks, read task details, read attachments (via Aster's fetch_asana_attachment server-side tool), create tasks and sub-tasks, post comments, update custom fields.

**Common skill ideas that need it:**
- Logging a record of work performed (sub-task per draft, per call, per showing)
- Pulling property details from the LU or TP sub-tasks for use in outbound communication
- Posting a summary report as a comment on a task for manager review
- Reading documents the team has uploaded to a task (POIs, credit reports, ledgers)

**Enable it:** claude.ai → Settings → Connectors → enable Asana with the Sagareus Asana account.

**Heads-up:** Asana's API expects html_notes to use a narrow allowed-element list. If the skill writes formatted notes, plain-text `notes` is usually the safest choice.

## Ask Aster connector

**What it lets the skill do:** semantic search across all Sagareus SOPs, decisions, incidents, and edge cases. Pulls back the relevant chunks of the playbook so the skill can ground its answers in actual Sagareus policy rather than guessing.

**Common skill ideas that need it:**
- Looking up Sagareus's position on a specific scenario before drafting a reply
- Pulling a related SOP to embed in a brief or training material
- Reminding the agent of the current policy when something feels uncertain

**Enable it:** Already connected at the org level. If a staff member's claude.ai doesn't show Ask Aster as a connector, have them sign in with their @sagareus.com Google account; org connectors only appear on the workspace login.

**Heads-up:** Ask Aster also exposes other Sagareus skills as slash commands (Speed to Lead, Screening, Listing Prep, Market Rent Analysis, Listing Copywriter, Weekly Leasing Report, Shout Out, Incident Report, Edge Case, Decision to Rollout, Meet Aster, and Saga Skills). Staff invoke these from the same chat as the Ask Aster search tool.

## Other tools (no MCP yet)

Sagareus uses other systems that do NOT have an Aster MCP connector today. If a staff member's skill idea depends on one of these, flag the gap honestly and offer a manual-step workaround.

- **Buildium** (property management software, rent collection, accounting, owner statements, work orders): no direct connector. If a skill needs Buildium data, the staff member has to copy the relevant numbers into Asana or paste them into chat. Worth mentioning a Buildium connector is on the longer-term roadmap.
- **HubSpot** (CMS and CRM): there is a HubSpot connector but it mostly covers CRM objects (contacts, companies, leads). The Sagareus website CMS itself is not directly accessible.
- **PandaDoc** (proposals and signed agreements): no connector.
- **RingCentral** (phone and SMS): no connector. SMS automation is out of scope for now.
- **GetOutline** (SOPs): SOPs are mirrored into Ask Aster, so use Ask Aster for semantic search of SOPs. Direct GetOutline edits are not available via Aster.

## How to choose connectors during the coaching flow

When recommending connectors in step 3 of `SKILL.md`, follow this order:

1. **Identify the trigger surface.** Where does the skill start? If the staff member says "I want to type something to Aster," the trigger surface is the Aster chat. No connector is needed for that.
2. **Identify the input data.** Where does the skill READ from? That tells you which connectors to read with.
3. **Identify the output destination.** Where does the skill WRITE to? That tells you which connectors to write with.
4. **Always include Ask Aster** if the skill needs to know any Sagareus policy or playbook material to do its job well. Most skills do.

Bias toward fewer connectors when you can. A skill with two connectors is simpler to maintain and explain than a skill with five.
