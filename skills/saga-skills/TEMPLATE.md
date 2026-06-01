# Output SKILL.md Template

This is the shape of the SKILL.md you produce at step 8 of the Saga Skills coaching flow. Every section is required unless explicitly marked optional.

Fill in the bracketed placeholders with content gathered during the coaching session. Sections marked **(verbatim)** are pasted from `SAGAREUS_BRAND.md` and applied to every output skill without modification (other than the audience swap when applicable).

When you show the draft to the author in chat, show ALL of this as a single markdown block they can copy. Do NOT include this template's instructional comments in the output; only the SKILL.md body.

---

## The output structure

```markdown
---
name: [LOWERCASE-HYPHENATED-SKILL-NAME]
description: [ONE OR TWO SENTENCES: what the skill does, when to invoke it, what it returns. Include 2 to 4 example trigger phrases the author would actually say or type to start it, e.g., "/listing-tour-followup", "follow up with last week's tour prospects", "draft tour follow-ups". The MCP server uses this description to expose the skill, so be specific.]
---

# [Skill Display Name]

[ONE PARAGRAPH: what this skill is for, in plain English. Who runs it, what it does, what it produces. Avoid jargon.]

## Roles to keep clear

- **The author (and any other staff who use the skill):** [WHO USES THIS. e.g., "Leasing agents on the showing-day schedule." If multiple roles use it, list each and how their use differs.]
- **You (Aster running [skill name]):** compile, parse, draft, log. You do not make the final [decision / send / post]. The human approves.
- **[Other roles if any — manager, owner, tenant, vendor]:** [WHAT THEIR ROLE IS in the workflow.]

## When to use

- [BULLET: a specific signal that this skill should fire. Use plain language.]
- [BULLET: another trigger.]
- [BULLET: another trigger.]

## When NOT to use

- [BULLET: a situation that LOOKS like it should fire this skill but actually shouldn't. Be specific.]
- [BULLET: another negative trigger.]

## Voice rules

[IF THIS SKILL IS OWNER-FACING (the Sagareus default):]
- Audience: property owners. Professional, trustworthy, locally knowledgeable. Confident without being salesy.

[IF THIS SKILL IS RESIDENT-FACING:]
- Audience: residents. Plain English, warm but not gushy, respectful. Switch off the owner voice deliberately.

[IF THIS SKILL IS VENDOR-FACING:]
- Audience: vendors. Clear, direct, transactional. No flowery language.

[IF THIS SKILL IS INTERNAL ONLY:]
- Audience: Sagareus internal staff. Casual, conversational, like a coworker who has been at Sagareus a while. Dry humor in moderation is welcome.

[ALWAYS, REGARDLESS OF AUDIENCE — pasted verbatim:]
- **No em-dashes (U+2014).** Use commas, periods, or semicolons.
- Lists scan faster than paragraphs. Use them where they help.
- Lead with the outcome when reporting back to the user. Result first, details second.
- Concise. Respect the user's time.
- Factual. No editorializing, no salesy adjectives, no superlatives in any external output.

## Workflow

[NUMBERED STEPS, 4 to 7 of them, in the order Aster executes them. For each step, include a short heading and 1 to 4 sentences (or bullets) describing what Aster does, what input it needs, and what it produces. Example shape:]

### (1) [Step name, e.g., "Trigger and parse"]

[What Aster does in this step. Be specific about tool calls (e.g., "Use `mcp__claude_ai_Gmail__search_threads` with this query: ..."). If the step has an input, name where it comes from. If it has an output, name what gets produced.]

### (2) [Step name]

[Same shape.]

### (3) [Step name]

[Same shape.]

### (4) [Step name — usually the single confirmation gate if the skill produces external output]

Show the draft to the author. Ask for approval. Wait. Do not proceed without explicit "ship it" / "looks good" / "go" / similar approval.

### (5) [Step name — usually the ship-it step]

[Post / send / log the final output to the destination identified in step 2 of the coaching flow.]

### (6) [Step name — usually the hand-off]

[Return a one-line summary to the user. Include the URL or GID of anything that was created. Stop.]

## Behavioral guardrails (non-negotiable)

[SKILL-SPECIFIC GUARDRAILS FIRST — what makes THIS skill safe to use. Examples:]
- [SKILL-SPECIFIC: e.g., "Do not search outside the leasing@sagareus.com inbox."]
- [SKILL-SPECIFIC: e.g., "If a prospect's renter profile shows information that could be construed as protected-class, flag it for Fair Housing review and do NOT include it in the draft."]

[STANDING SAGAREUS GUARDRAILS — pasted verbatim from SAGAREUS_BRAND.md. These appear in every skill. Do not remove them:]
- Never use em-dashes. Use commas, periods, or semicolons.
- For any external email, draft only; a human reviews before send.
- For any money movement, draft only; never initiate a payment, refund, disbursement, or owner payout.
- For any fee number, do not publish or quote without Brittany's confirmation.
- Apply criteria uniformly across applicants and situations. Same rule every time.
- Never reference protected classes (federal, WA state, Seattle local) in any output. Sagareus does not discriminate on race, color, creed, national origin, sex, sexual orientation, gender identity, disability, marital status, HIV or hepatitis C status, families with children, use of a dog guide or service animal, honorably-discharged veteran or military status, immigration or citizenship status, or source of income.
- Never treat voucher income, Social Security, child support, or any other lawful income source as inferior to wages. Source of income is fair-housing-protected.
- If the skill touches confidential data (owner, applicant, resident financials, identity, screening data, lease terms), keep that data inside Sagareus tooling. Do not paste it into public examples or external prompts.

## Edge cases

- [BULLET: a thing that could go sideways. State the trigger and the response. Example: "If no leads match the query, tell the user 'No fresh leads in your inbox right now' and stop. Do not loop searching."]
- [BULLET: another edge case.]
- [BULLET: another edge case.]
- [BULLET: connector missing. Example: "If Gmail MCP is not connected, surface a clear message telling the user to enable it in claude.ai Settings → Connectors and stop."]

## Out of scope

- [BULLET: what this skill does NOT do. Example: "Sending the email. The skill always drafts; the user sends."]
- [BULLET: another out-of-scope item.]
- [BULLET: another out-of-scope item.]

## Required connectors

This skill needs the following claude.ai connectors enabled in the user's account before it works:

- [LIST EACH CONNECTOR NEEDED, e.g., "Gmail", "Asana", "Ask Aster (already at org level)"]

If a connector is missing, the skill surfaces a clear message instead of failing silently.
```

## Notes on filling in the template

- **Skill name:** lowercase, hyphenated. Examples: `weekly-rent-collection-followup`, `move-out-checklist-builder`, `vendor-invoice-categorizer`. The MCP server uses this name as the slash command, so keep it short.
- **Description in frontmatter:** include 2 to 4 example trigger phrases the author would actually say. The MCP search ranking on the description is how staff discover the skill.
- **Workflow steps:** target 5 to 6 numbered steps. If you find yourself writing 8 or more, the workflow is too granular; combine. If you find yourself writing 3 or fewer, you may have skipped a discovery, parse, or hand-off step.
- **One confirmation gate, always (for external output skills).** Lock it in at step 4 or 5, never step 2 or 3 (too early to have a useful draft) and never the last step (no point gating something that has already shipped).
- **Required connectors block** goes at the bottom so deployment is unambiguous. List every connector the skill touches, including Ask Aster.
