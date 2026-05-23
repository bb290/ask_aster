---
type: decision
date: 2026-05-07
decision_owner: brittany@sagareus.com
status: active
visibility_tier: ic
service_line: general
sops_to_update:
  - sops/staff support/skill-outline.md
  - sops/staff support/notebook-lm.md
  - sops/lease up/sop-training-slide-deck-ai-tool.md
tags: [core-values, data-is-king, context-is-queen, decision]
---

# Decision — Core Value Updated to "Data is King, Context is Queen"

## Decision

The Sagareus core value previously stated as **"Data is King"** is updated to **"Data is King, Context is Queen."** Both halves are required. Neither stands alone.

## Why this decision

We spend a lot of time tracking and using data, and that's worked. Data gives us accountability, transparency, and a shared language for talking about performance. But data on its own doesn't tell the whole story.

A late rent payment is a number. The context around it — the resident's communication history, what's happening in their life, what we've already tried — is what tells us whether the right move is a notice, a phone call, or a payment plan. A maintenance ticket is a data point. The context is whether this is a one-off, a pattern, an owner-induced delay, or a habitability issue. Same data, different right answers depending on context.

We've seen this play out repeatedly in 2026. The 2301 NE 125th rat infestation looked routine in the data (a pest-control ticket) but the context (interior evidence, vendor coordination collapse, owner-directed delays) is what made it a habitability emergency. The data alone would not have surfaced that.

Data is the spine. Context is the body around it. Together they give us the full picture. Apart, either one can mislead.

## What this changes operationally

When we capture, report, decide, or train, we pair data with context as a default:

- **In Aster captures** — incidents, edge cases, and decisions already include context by design. This decision formalizes that the context is not optional color, it's half the record.
- **In team reporting** — performance metrics, leasing reports, maintenance summaries, and similar should include the relevant context (market conditions, vendor issues, tenant situations) alongside the numbers, not as a footnote.
- **In leadership briefings** — when Aster's analytics surface a trend, the trend is the data, but the recommendation needs context. Don't act on the trend alone.
- **In training and onboarding** — new staff hear both halves of the value from day one. We teach the data discipline AND the habit of capturing the context that shaped the data.
- **In tenant and owner conversations** — staff are empowered to bring context into the room, not just numbers. "Here's what the data shows, and here's what's behind it."

## Scope and boundaries

- This is a values-level change. It applies across every department, service line, and role.
- It does not change what data we track or what reports we run. It changes how we frame and present the work around them.
- The other three values (Think on Your Feet, Proactive > Reactive, Continuous Improvement) are unchanged.

## Broader rollout (outside ask-aster)

This decision affects more than just the SOPs listed below. The following also need updates, tracked separately from the Asana SOP subtasks:

- `website/modules/saga-values.module/fields.json` — public-facing values module on sagareus.com (HubSpot push workflow)
- `website/templates/about.html` and `website/templates/v2/about-page.html` — About page value cards
- `website/templates/utility/llm-info.html` and `website/llms.txt` — LLM-facing context
- `.claude/BRAND.md` — brand bible (currently draft, refresh covers this)
- Ask Aster intro page copy (captured in OpenB May 2, 2026) — needs the values section updated

## SOPs to update (manual)

These ask-aster SOPs reference "Data is King" directly and need updating to reflect the new framing. Updates are tracked manually in Asana, not auto-generated:

- `sops/staff support/skill-outline.md` — update the values bullet
- `sops/staff support/notebook-lm.md` — update the core values listing in the Sagareus overview paragraph
- `sops/lease up/sop-training-slide-deck-ai-tool.md` — update the core values listing in the Sagareus overview paragraph (note: this file currently lists three values, missing "Think on Your Feet" — fix that at the same time)

*Pending manual SOP work — see corresponding Asana task in the Roll Out project.*

## Decided by

Brittany French, May 7, 2026.
