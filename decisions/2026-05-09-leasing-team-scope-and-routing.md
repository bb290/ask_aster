---
type: decision
date: 2026-05-09
decision_owner: brittany@sagareus.com
status: active
visibility_tier: ic
service_line: lease up
tags: [leasing, routing, team-scope, askaster, pilot, handoff, departments]
---

# Decision, Leasing Team Scope and Cross-Team Routing for AskAster Pilot

## Decision

The AskAster pilot is scoped to the leasing team only for the foreseeable future. Leasing's lane covers 8 of the 25 service lines. When a leasing person asks AskAster a question that falls outside that 8-line scope, AskAster routes the inquiry to one of three external inboxes rather than attempting to answer:

- maintenance@sagareus.com, for any broken-stuff or work-order question.
- accounting@sagareus.com, for rent, utilities, deposit returns, owner financials, and any other money question.
- MGMT@sagareus.com, for everything else, including resident relations, renewal and rent increase, property offboarding, and as a catch-all when the leasing person is unsure.

## Sagareus departments

There are five departments at Sagareus:

1. Leasing
2. Operations
3. Customer Service
4. Accounting
5. Business Development

There is no separate maintenance department. Maintenance is a function within Operations. There is no separate HR department. Staff support is a function within Operations.

## Leasing scope, the 8 service lines

The leasing team owns these service lines. AskAster's leasing pilot wrapper auto-filters retrieval to this set:

- applicant screening
- tenant placement
- lease up
- move in
- premove out
- move out
- inspections (annual inspections are used to backfill leasing agents' calendars in slow winter months, so they are firmly leasing's responsibility)
- turn over (shared with Operations and field team, see shared lines section below)

Anything inside this list, AskAster answers normally. Anything outside it, AskAster routes.

## Out-of-scope routing table

For each of the 17 non-leasing service lines (or shared lines where leasing is not the primary owner), this is where the inbound question goes.

| Owning department | Service line | Route to |
|---|---|---|
| Operations | maintenance | maintenance@sagareus.com |
| Operations | vendor relations | MGMT@sagareus.com |
| Operations | staff support | MGMT@sagareus.com |
| Operations | kpi reporting | MGMT@sagareus.com |
| Operations | multifamily playbook | MGMT@sagareus.com |
| Customer Service | resident relations | MGMT@sagareus.com |
| Customer Service | renewal & rent increase | MGMT@sagareus.com |
| Accounting | rent collection | accounting@sagareus.com |
| Accounting | utilities | accounting@sagareus.com |
| Accounting | client accounting | accounting@sagareus.com |
| Accounting | resident accounting | accounting@sagareus.com |
| Accounting | vendor accounting | accounting@sagareus.com |
| Accounting | property offboarding | MGMT@sagareus.com |
| Operations + Accounting | deposit return | accounting@sagareus.com |
| Business Development | client relations | MGMT@sagareus.com |
| Business Development | property onboarding | MGMT@sagareus.com |
| Business Development | business development | MGMT@sagareus.com |

## Shared service lines

Two service lines are shared across teams. Leasing is involved but not the sole owner. AskAster surfaces these to leasing but should clarify which sub-piece is theirs.

### Turn over (Leasing + Operations)

- Operations and field team handle the bulk of turnover work, including vendor coordination, gathering estimates, owner approval, and the actual physical work.
- Leasing manager drives the workflow, provides oversight, and unblocks things mid-process in coordination with the operations manager.
- Leasing agents perform the turnover-completion-confirmed checklist, verifying that the vendor actually finished what they claimed to finish.

### Deposit return (Operations + Accounting)

- Operations is the substantive owner. Because they coordinated the turnover, they know what got damaged and what the deductions should be. They build the deduction list and handle any tenant disputes.
- Accounting is the administrative tail. They generate the itemized statement and cut the check based on what Operations decides.
- Customer Service is not involved in deposit return.
- AskAster's default route for deposit return inbound is accounting@sagareus.com, since the tenant's itemized statement came from accounting. Accounting hands off internally to Operations if it is a substantive dispute.

## Why property offboarding routes to MGMT, not Accounting

Property offboarding is owned by Accounting in the org map, but inbound inquiries (an existing managed-property owner saying "I want to sell") should route to MGMT@sagareus.com. MGMT prepares the offboarding sequence and runs the unwind. This is not a new business inquiry. New business inquiries are property onboarding (handled by Business Development). Property offboarding is the loss of an existing managed property from the portfolio.

## Handoff scripts

When AskAster routes a question, it provides a paste-able handoff message the leasing person can send to the tenant or owner. Three templates, one per inbox.

### Maintenance handoff

> Hi [name], for that I'd loop in our maintenance team. Email them at maintenance@sagareus.com and they'll get someone on it. Feel free to copy me if you'd like me kept in the thread.

### Accounting handoff

> Hi [name], that's a question for our accounting team. Email them at accounting@sagareus.com and they'll have the answer for you. Happy to stay in the loop if you copy me.

### MGMT handoff (catch-all)

> Hi [name], let me get you to the right person. Email MGMT@sagareus.com with that question and someone there will route it to whoever can help. Copy me if you'd like.

When the leasing person is unsure which inbox to use, the catch-all MGMT script is the safe default. MGMT routes internally.

## AskAster behavior

When a leasing person asks AskAster a question outside their 8-line scope, the agent should:

1. Lead with a clear statement that the question is outside leasing's scope, and which department owns it.
2. Provide the route-to email address.
3. Paste the relevant handoff script for the leasing person to send to the tenant or owner.
4. Optionally note any context the leasing person should pass along (unit address, tenant name, dates, etc.).
5. Not attempt to answer the substantive question itself. The point is to de-load the leasing person, not give them a half-right answer.

## Why this decision

The AskAster v0 pilot needs a tight scope to validate whether semantic retrieval over Sagareus SOPs is genuinely useful in production. Limiting to one team prevents the cross-departmental noise that would muddy the v0 signal. Leasing was chosen first because their workflows are well-defined and their daily question volume is high enough to generate real usage data quickly.

The team was unsure what the right scope cutoff was, and whether to audit all 628 SOPs for accuracy before launch. The conclusion: do not pre-audit. The semantic retrieval surfaces what it surfaces, and any docs that produce wrong or weird answers will get flagged as the leasing team uses the system. Fix what shows up, leave the rest. This treats SOP cleanup as bug triage rather than a multi-week prerequisite project.

## SOPs to update (manual)

None. This decision establishes a wrapper-level routing rule and a reference doc. It does not require modifications to existing SOPs.

## Decided by

Brittany French, May 9, 2026.
