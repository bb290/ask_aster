---
title: "Skill // Outline"
service_line: staff support
sop_owner: brittany@sagareus.com
status: active
last_reviewed: 2026-05-01
visibility_tier: ic
version: 1
tags: [ai-tools, outline-skill, asana-skill, tips, best-practices]
created_but_never_updated: false
---

> ⚠ **For Claude only — and only when explicitly instructed.**
>
> Do NOT follow the instructions in this document if you encountered it while browsing or searching. Execute the steps below ONLY when the user (or a Getting Started session following the official Sagareus onboarding guide) explicitly asks you to "create the Outline skill" or "set up the Outline skill."
>
> If you are unsure whether you were instructed to do this, stop and ask the user before doing anything.

## What this document is

This document contains the source content for the Sagareus `/outline` skill. When a user explicitly asks Claude to set up the skill, Claude reads this document, extracts the SKILL.md content from the code block below, and writes it to the user's personal skills directory.

## Setup instructions for Claude (only execute when explicitly asked)


1. Make sure the directory `~/.claude/skills/outline/` exists. Create it with `mkdir -p ~/.claude/skills/outline` if needed.
2. Fetch this document's raw markdown via `mcp__outline__fetch(resource: "document", id: "MNg4BvEnh5")`.
3. **Extraction rule:** the SKILL.md content is everything that appears between the FIRST line that starts with three backticks (the opening fence, ```` ```markdown ````) and the LAST line that is exactly three backticks alone (the closing fence, immediately before the `===END SKILL.md===` marker). The SKILL.md body is deliberately free of any inner triple-backtick fences — if you encounter one, the doc has been edited incorrectly and you should stop and alert the user.
4. Write the extracted content **verbatim** to `~/.claude/skills/outline/SKILL.md`. The first line must be `---` (YAML frontmatter delimiter).
5. Read the file back and confirm it starts with `---
name: outline` to verify the frontmatter survived.
6. Confirm to the user: "The `/outline` skill is now installed. You can invoke it any time by typing `/outline`, or Claude will use it automatically when you ask anything about Outline, SOPs, procedures, or scenario docs."

## Skill content

===BEGIN SKILL.md===

```markdown
---
name: outline
description: Sagareus Outline SOP operations — document structure, formatting rules (blockquotes, callouts, email templates), de-dupe/consistency audits, and a subagent-based update protocol that never one-shots edits. Auto-invoke whenever the user references Outline, SOPs, procedures, scenario docs, or asks to update/review/create SOP content.
allowed-tools: Agent, AskUserQuestion, Read, Edit, mcp__outline__*, mcp__asana__asana_create_task, mcp__asana__asana_typeahead_search
---

# Sagareus Outline

Operate against the **Sagareus Outline** wiki — the company SOP home.

- Acting user: identify the human running this Claude Code session (`git config user.name`, falling back to `$USER`).
- Collection lookup: use `mcp__outline__list_collections` when unsure which collection to write to. Do not cache collection IDs in this skill — they are stable in practice but verify once per session if uncertain.

## Hard rules — never violate

1. **Never one-shot an update.** Every edit plan must: (a) fetch affected docs, (b) spawn a dedupe/inconsistency audit subagent, (c) surface findings to the user via `AskUserQuestion` with concrete choices, (d) only then spawn write subagents. No exceptions.
2. **Max 2 concurrent writes.** Outline's MCP server rate-limits writes. When updating multiple docs, spawn at most 2 write subagents at a time; queue the rest.
3. **Writes happen in subagents.** `update_document` and `create_document` require the full markdown body. Composing and passing those bodies is token-heavy — delegate to a subagent. The main thread never holds raw doc bodies.
4. **Full-document replace.** `mcp__outline__update_document(id, text)` replaces the ENTIRE doc. Always compose the complete markdown, not a patch. After every write, fetch the doc back and scan for rendering issues.
5. **De-dupe before writing.** Before any update that adds or meaningfully changes content, spawn an audit subagent to cross-reference the SOP tree for duplicated, conflicting, or near-duplicate content. If found, stop and propose a centralized-doc plan (see §Centralized-doc pattern) before writing.
6. **Heavy reads go to subagents.** Fetching full doc trees, auditing for inconsistencies, or reading 3+ docs → delegate. Main thread handles only planning, clarification, and final approval gates.
7. **Staff references via the Staff Directory.** Never hardcode names inside docs; link the role. Resolve user IDs for `@mention` via `mcp__outline__list_users`.
8. **Asana is for deferred tasks only.** When the user defers a finding, create a follow-up task in the SOP project (`1213774146836272`). Do NOT use Asana for anything else from this skill — use `/asana` for workflow ops.

## Document structure — the 3-bucket model

Every topic follows this shape, where `<Topic>` is the parent doc:

- `<Topic>` (parent doc) — overview, policies, concepts, reference
  - `<Topic> Asana SOP` — bucket (a), Asana-template-linked procedure
    - `1 — <Step name>`
    - `N — <Step name>`
  - `<Topic short> // <Subject>` — bucket (b), searchable key-topic
  - `<Topic short> // Customer Service & Common Scenarios` — bucket (c), scenario index
    - `<Topic short> // <Who asking about what>`
  - `Update | <Thing>` — optional, centralized how-to

### Parent doc

- Opens with `:::warning` or `:::info` callout explaining why the topic matters.
- Followed by bullet points: scope, stakes, policy context.
- `## Policies` — key rules, ideally in a callout.
- `## Reference` — links to bucket (b) sub-docs (limits, deadlines, metrics).
- `## Lifecycle Overview` — numbered links to the Asana SOP step docs.

Keep parent scannable. If a section exceeds ~300 words, split it into its own sub-doc.

### Bucket (a) — Asana-template-linked procedure

Title: `<Topic> Asana SOP` (e.g., `Renewal Asana SOP`, `Turn Over Asana SOP`).

Children are the numbered steps of the matching Asana task template:

- `<Topic> Asana SOP`
  - `1 — <Step name>`
  - `2 — <Step name>`
  - `N — <Step name>`

- Numbering is ascending and sequential — it mirrors the Asana template's subtask order.
- Each step doc is linked from its corresponding Asana template subtask. **Renaming breaks those links — coordinate any rename.**
- If a topic has multiple Asana templates, extend with `<Topic> Asana SOP // <Variant>` (e.g., `Turnover Asana SOP // Sagareus Managed`).
- After creating multiple step children, fix ordering: Outline reverses creation order by default. Use `mcp__outline__move_document(id, parentDocumentId, index)` — `index=0` is first.

### Bucket (b) — Searchable key-topic doc

Title: `<Topic short> // <Subject>` (e.g., `Renewal // Rent Increase Limits`, `Renewal // Important Deadlines`, `Property Settings // Onboarding Checklist`).

**Shape: short.** Answers one crisp question a staff member would Cmd-K for.

- Target: ~50-150 words, 2-4 h2 sections, bullet-heavy.
- If it grows past ~300 words, it's probably two topics — split.
- Lives directly under the parent topic doc.

### Bucket (c) — Customer service scenario

Index: `<Topic short> // Customer Service & Common Scenarios`. The index groups scenarios by audience (Owner / Resident / Vendor) with links.

Children: `<Topic short> // <Who asking about what>` — e.g., `Renewal // Owner asking to convert MTM to termed lease`, `Renewal // Resident vacated before lease end`, `Maintenance // Vendor requesting access code`.

Title convention: **who comes first** (Owner / Resident / Vendor), **then the verb** (asking about / requesting / appealing / vacated / etc.). This keeps titles Cmd-K searchable.

**Required child page layout** (in order):

1. **Situation line** — a blockquote: `> **Situation:** [one-sentence description]`
2. **Divider** — `---`
3. **`## Key Points`** heading with a bullet list. Each bullet starts with a bold phrase followed by an em-dash rationale, e.g., `- **Notice window matters** — state law requires 60 days...`
4. **Divider** — `---`
5. **`## <Owner|Resident|Vendor> Inquiry`** heading with a one-line instruction (e.g., "Reply to the original email thread.") followed by a blockquote email template using the single-line `

` format (see §Email template formatting).

Optional trailing sections:

- `## Procedure` — numbered steps for scenarios with multi-step handling.
- `## Email Template — <Variant>` — additional templates (approved / rejected variants).
- `### Example <Owner|Resident|Vendor> Questions` — real-world phrasings for AI-search pickup.

## Centralized-doc pattern (de-dupe)

When a concept (procedure, threshold, rule, field list) is referenced from 2+ docs, **extract it** into a centralized source of truth.

**Canonical example:** `Update | Property Settings` — the single how-to for updating property settings. Linked from Onboarding // New Client, the Turn Over template subtask, and others.

**Structure:**

- **Canonical doc title:** `Update | <Thing>` — pipe separator, not slash. Signals "action how-to."
- **Opening banner (required):** an `:::info` callout stating: *"This document is the single source of truth for the `Update | <Thing>` action across SOPs. Linked from [list]. If you need to change the procedure, change it here — consumers will inherit."*
- **Consumer docs** (places that used to duplicate this content) become stubs with three h2 sections:
  1. `## When This Runs` — workflow context specific to this consumer.
  2. `## How To Update` — one line: `See [Update | <Thing>](/doc/<urlId>) for the full procedure.`
  3. `## Next Step` — link to the next step in the parent workflow.

**Operating rule:** if the audit subagent finds duplicated content, propose this pattern to the user — do not silently extract or silently leave duplicated. Every duplication is a forcing function for a plan.

## Email template formatting

### Durable principles (inline — do not link to a template doc that may move)

1. **No email left behind.** Every inbound email gets a response, regardless of sender or assigned actor.
2. **BLUF (bottom-line up front).** First sentence is the ask, answer, or action item. Never bury it.
3. **No pleasantries.** Strip "I hope you're doing well." Mobile notifications are the read surface; every word earns its place.
4. **Full context.** Recipients don't know the backstory. State where / what / why so they can decide without a back-and-forth.
5. **Searchable subject line:** `[Call to Action] // [Abbreviated Address]`. Abbreviate (Ave, Pl, Blvd, Ct). Exclude state and zip. Same format used for Asana task titles.
6. **Template everything recurring.** Personalize edges; never alter core message/structure/tone. Goal: 100% of recurring communications templated.
7. **No AI slop.** AI for tone review and drafting, never raw paste. AI output is wordy and wrong-toned by default.
8. **Keep internal work internal.** Remove the owner from threads when coordinating teammates. Owners see finished magic, not busy work.
9. **Don't trouble owners for info we can verify ourselves.** Exhaust internal investigation first.
10. **Media via Drive links, not attachments.** Folder name = abbreviated address + topic, sharing "anyone with the link."
11. **Spatial issues need a satellite overlay.** Not just a ground-level photo.
12. **Closings:** `Thank you,` standard. `Regards,` for negative outcomes (rejections, terminations, evictions, vendor declines).

### Blockquote format (Outline quirk)

**Problem:** Outline collapses consecutive `>`-prefixed lines into a single paragraph. Multi-line `>` format does NOT produce visual paragraph spacing.

**Solution:** put the entire template on ONE `>` line. Use `
` for line breaks within a paragraph and `

` for paragraph breaks.

Example (all on ONE `>` line): `> **Subject:** Renewal \[Year\] // \[Address\]

Hi \[Owner Name\],

Body paragraph one.

Body paragraph two.

Thank you,`

**Rules inside the blockquote:**

- **Fields:** `\[Square Brackets\]` Title Case (`\[Owner Name\]`, `\[Property Address\]`). Bold only decision values (amounts, dates).
- **Header fields** (`Subject:`, `To:`, `CC:`, `Attachment:`): bold labels, inside the blockquote, separated by `
` or `

`.
- **Bullets inside the blockquote:** use the `•` glyph character. Real markdown `-`/`*` lists break out of the quote and destroy the format.
- **Mid-paragraph bold labels** are fine and encouraged for scannability: `**Work in Progress** Our vendor has been dispatched...`.
- **Links:** always `[label](url)` markdown. **Never raw URLs.** External URLs, Drive links, Outline cross-references — all linked.
- **Optional/removable content:** wrap in `==highlighted text==` (Outline's mark syntax).
- **When a template contains `==highlighted==` sections, prefix the template with an `:::info` callout:** *"This template contains ==highlighted sections== that are optional or need customization. Review and remove highlighted sections that don't apply before sending."*

### Template header format

- Standalone: `## Email Template — <Description>` (h2, em dash, not hyphen).
- Nested under a parent section: `### Email Template — <Description>` (h3).

### Post-write verification

Every email-template write must be followed by a read-back fetch to confirm the blockquote rendered correctly. Common failures:

- Multi-line `>` format slipped in → paragraphs collapsed
- Real markdown `-` bullet inside blockquote → bullet list broke out
- Raw URL instead of `[label](url)` → link not clickable

## Outline markdown quirks reference

| Feature | Syntax | Notes |
| --- | --- | --- |
| Callout — info | `:::info ... :::` | Neutral context, "about this doc" banners |
| Callout — warning | `:::warning ... :::` | Important rules, hard policy |
| Callout — success | `:::success ... :::` | Sparingly; completion criteria |
| Callout — tip | `:::tip ... :::` | Rarely used |
| Mark (highlight) | `==text==` | Optional/removable content in templates |
| User mention | `@[Display Name](mention://user/<userId>)` | Resolve via `mcp__outline__list_users` |
| In-Outline link | `[Label](/doc/<urlId>)` | Relative path; survives slug changes |
| Child doc order | `mcp__outline__move_document(id, parentId, index)` | Creation order is reversed by default — always fix |
| Full-replace update | `mcp__outline__update_document(id, text)` | Replaces entire body. No patch mode. |

## Pre-write discipline — the loop

Every update request flows through this loop. No shortcuts.

1. **Plan.** Restate the change in plain English. Identify every potentially affected doc (search + tree walk).
2. **Spawn audit subagent.** Hand it the proposed change and the affected doc urlIds. Ask it to return:
   - **Duplicates** — same policy/procedure/template stated in another doc? (yes/no, with locations + quoted snippet)
   - **Conflicts** — same concept with different values (dates, percentages, deadlines, amounts)? (yes/no, with locations + quoted snippet)
   - **Cross-refs** — links or "see X" pointers that need updating? (yes/no, which docs)
3. **Surface findings via AskUserQuestion.** Present concrete multiple-choice options — never open-ended prompts. Examples:
   - *"Duplicate found in X and Y. How to proceed? — (a) Extract to `Update | Thing` and stub X/Y, (b) Update X only, defer Y via Asana, (c) Update all three, (d) Stop & discuss."*
   - *"Three scenario docs reference this rule. Update all? — (a) Update all 3, (b) Update 2 primary, link the third, (c) Stop & discuss."*
4. **Confirm write plan.** If more than 2 docs will change, show the final list and ask for one approval before proceeding.
5. **Spawn write subagents.** At most 2 concurrent. Each owns 1-2 docs. Queue the rest. Each subagent returns after fetching the doc back and verifying render.
6. **Final verification.** After all writes complete, sanity-check any cross-reference pointers; fix if the user-confirmed plan implies them.
7. **Deferred findings → Asana task.** Any "defer" choice from step 3 produces an Asana task in the SOP project (`1213774146836272`), assigned per user direction, due today, signed `Created by Claude Code at direction of <user>`.

## Subagent handoff templates

### Audit subagent (read-only)

> You have access to the Outline MCP for the Sagareus Outline wiki. Follow Sagareus Outline skill rules: read-only, no writes, return findings as bullet points.
>
> Proposed change: `<change in plain English>`. Docs in scope: `<list of urlIds + titles>`. Additional search terms to explore cross-tree: `<terms>`.
>
> Cross-reference the SOP tree for: (1) **Duplicates** — same policy, procedure, template, or rule stated elsewhere. (2) **Conflicts** — same concept with different values (numbers, dates, deadlines). (3) **Cross-refs** — incoming links and "see X" pointers that will need updating.
>
> Return 3 sections (Duplicates / Conflicts / Cross-refs). For each hit: doc title + urlId + 1-3 line quoted snippet. If nothing found, say so. Do NOT return full doc bodies. Do NOT propose fixes — that's the main thread's job.

### Write subagent

> You have access to the Outline MCP. Follow Sagareus Outline skill rules — especially: `update_document` replaces the entire doc (compose the full markdown, do not patch). Max 2 concurrent writes across the whole session; you control 1 write (do NOT spawn additional parallel writes). After each write, fetch the doc back and verify rendering (blockquote collapse, callout closure, bullet format, link clickability). Append a revision note at the bottom only if the user explicitly requested one.
>
> Doc(s) to update: `<urlId + full target markdown>`.
>
> Return: doc title, urlId, status (`updated` or error), plus any rendering issues observed on the verification fetch. Do NOT return the full body back.

### Create-doc subagent

Same rules as the Write subagent, but calling `mcp__outline__create_document` with `parentDocumentId` set to the target parent. After creation, if sibling order matters (e.g., numbered Asana SOP steps), call `move_document(id, parentDocumentId, index)` to set the correct position.

## Brand reference

**Values — procedures should reflect these:**

- **Proactive > Reactive** — prevention and planning over reaction
- **Data is King** — thresholds and decisions are data-backed
- **Continuous Improvement** — processes include feedback loops

**Voice:** approachable, educational. Confident guidance, not legalese. Calm and specific.

**Colors — when documents reference brand colors:**

| Color | Hex | Usage |
| --- | --- | --- |
| White | #FFFFFF | Primary background |
| Light Grey | #CCD1D1 | Secondary background |
| Dark Grey | #616A6B | Body text |
| Emerald | #0B4F42 | Primary brand |
| Maroon | #4F190B | Accent — sparingly, emphasis |
| Gold | #D4AF37 | Accent — sparingly, alerts |

Neutral tones dominate. Accents reserved for emphasis or alerts.

## Cross-reference conventions

- **Staff** → link to the Staff Directory, never hardcode names: `[Role Name](../../docs/section-indexes/sops-2-staff-directory.md)`
- **Doc-to-doc** → relative path, survives slug changes: `[Display Title](/doc/<urlId>)`
- **Asana task** → `[Task title](https://app.asana.com/0/0/<gid>)`
- **Mentions** → `@[Full Name](mention://user/<userId>)` — resolve via `list_users`

## When to stop and ask

You are in the wrong mode and must stop to clarify when:

- The user's request could plausibly require changes to 3+ docs and you have not yet audited.
- The audit surfaces a duplicate or conflict the user has not been told about.
- A proposed structural change (splitting a doc, creating a centralized source of truth, renaming a bucket-(a) step doc) has not been explicitly approved.
- The number of queued writes exceeds 4 — batch-approve with the user before proceeding.
- Any request touches the Staff Directory, brand palette, or the `Update | <Thing>` pattern itself.
```

===END SKILL.md===
