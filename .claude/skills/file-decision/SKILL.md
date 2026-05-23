---
name: file-decision
description: File a Sagareus operational decision into the Ask Aster corpus end-to-end. Takes a decision in any format (markdown, bullets, dictation), normalizes frontmatter to match the ingest schema, writes the file to decisions/, commits and pushes to GitHub, runs the Supabase ingest, and verifies it surfaces in Aster. If the decision changes Aster's voice or routing behavior, also walks through the edge-function edit and redeploys. Triggers on "/file-decision", "file this decision", "add this to Aster", or "log this decision".
---

# File Decision (Aster corpus updater)

## What this is

A one-shot skill for landing an operational decision into Ask Aster. Replaces the manual sequence of writing a markdown file, getting the frontmatter right, committing, pushing, running ingest, and (sometimes) redeploying the edge function.

Decisions land **per-decision, not batched**. Corpus ingest is incremental and ~30 seconds. The team gets truth in real time.

## When to use

- You've made an operational decision and have draft content in any form
- You want it indexed by Aster so the team can find it via `ask_aster`
- Optionally, the decision changes how Aster routes or speaks, and the edge function needs to follow

## When NOT to use

- The thing you're filing is an SOP edit, not a decision (use git directly + run ingest)
- The thing you're filing is an incident or edge case capture (use `/incident-report` or `/edge-case` — those land in Asana for review, not directly in the corpus)
- You only want to draft the decision text but not commit yet (just write it as markdown — don't invoke this skill)

## Prerequisites

- Current working directory is `/Users/unbound24/Unbound/clients/sagareus/ask-aster` (or the skill is run from there). If invoked from elsewhere, `cd` into the repo first.
- `.env` is populated with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`
- `supabase` CLI installed and logged in (for function deploys only)
- `deno` installed (for the ingest script)
- Git working tree has no conflicting unstaged changes to `decisions/` or `supabase/functions/ask-aster/index.ts`

## Voice when responding

Casual. No em dashes (Sagareus rule). Treat the user as Brittany or another manager who knows Sagareus operations cold but doesn't want to remember frontmatter field names.

## Flow

### Step 1 — Capture the decision

Ask:
> "What's the decision? You can paste a draft markdown blob, bullet points, or just describe it. I'll structure it."

Accept:
- Fully-formatted markdown with frontmatter
- Markdown body only (no frontmatter)
- Free text / bullets / dictation

### Step 2 — Normalize the decision

Produce a complete decision document with this frontmatter shape (matches `scripts/ingest.ts` parsing):

```yaml
---
type: decision
date: YYYY-MM-DD                          # today's date if not provided
decision_owner: brittany@sagareus.com     # default; ask if a different decider
status: active                            # or "draft" if still circulating
visibility_tier: ic                       # "ic" for staff-facing; "director" for exec-only
service_line: <one value>                 # see § Service line picker below
last_reviewed: YYYY-MM-DD                 # same as date for new decisions
tags: [list, of, tags]                    # see § Tag conventions below
---
```

Body conventions:
- Title: `# Decision — <plain-language summary>` (em dash in titles is allowed; voice rule applies to body prose, not headings)
- Sections (use H2): `## Decision`, then `## What changed` (if amending prior), then any of `## Routing correction`, `## Scope note`, `## Rationale`, `## Operational impact`, `## Related`
- No em dashes in prose
- Wrap prose at ~80 chars for diff readability (matches existing decisions)

#### Service line picker

The ingest stores `service_line` as a single string column. Pick the one most relevant to where the decision will be acted on. If the decision spans many lines, pick the one inside leasing's 8-line scope (so the leasing pilot wrapper surfaces it), then add the other lines as tags.

The 25 service lines (lowercase, spaces preserved):
- Leasing's 8: `applicant screening`, `tenant placement`, `lease up`, `move in`, `premove out`, `move out`, `inspections`, `turn over`
- Other 17: `client relations`, `property onboarding`, `property offboarding`, `rent collection`, `utilities`, `maintenance`, `rodent and pest`, `resident relations`, `renewal and rent increase`, `accounting`, `business development`, `customer service`, `staff support`, `general`, etc.

#### Tag conventions

Tags are free-form lowercase kebab-case. Always include:
- Domain tags relevant to the decision (e.g., `non-conforming`, `multifamily`)
- Mechanism tags if relevant (`routing`, `co-ownership`, `intake-policy`)
- Cross-team tags if it touches multiple lines (`leasing`, `client-relations`)

Do NOT include `decision` as a tag — the ingest adds `decision` automatically from `type:`.

#### Filename

`decisions/YYYY-MM-DD-<kebab-case-summary>.md`. Summary should be short but specific enough that a human scanning `decisions/` understands what's in it.

### Step 3 — Behavior-change check

Ask:
> "Does this decision change how Aster routes questions, what voice it uses, or what it considers in-scope vs out-of-scope for the leasing team? If yes, we'll also need to update `supabase/functions/ask-aster/index.ts` and redeploy the edge function."

If yes, identify exactly what in the `VOICE_NOTE` constant needs to change. Common cases:
- New cross-team carve-out (something previously out-of-scope is now in-scope, or vice versa)
- New routing inbox or change to existing inbox scope
- Pointer to a new decision file added to the "full routing matrix lives in..." section

### Step 4 — Preview and single confirmation

Show:
1. **The decision file** in full (path + content)
2. **The git commit message** for the decision
3. **If behavior change:** the proposed edit to `index.ts` (full before/after of the changed lines), plus the commit message for that edit
4. **The execution plan:**
   - `git add <decision file> && git commit && git push`
   - `deno run --allow-read --allow-env --allow-net scripts/ingest.ts` (sources `.env` first)
   - (If behavior change) `git add <index.ts> && git commit && git push`
   - (If behavior change) `supabase functions deploy ask-aster --project-ref ahonotvcbmczrtnpajua`
   - Verification: `ask_aster` query for the decision's topic

Ask once:
> "Looks right? Reply 'go' (or 'yes' / 'ship it') and I'll run the whole sequence end-to-end. Reply anything else to revise."

### Step 5 — Execute end-to-end

After approval, run the sequence with no further prompts. Report progress as each step completes. If any step fails, stop and report the error verbatim with the partial-state summary (what landed, what didn't).

Sequence:
1. **Write** the decision file via the Write tool
2. **Stage and commit** just the decision file:
   ```bash
   git add decisions/YYYY-MM-DD-<slug>.md
   git commit -m "<commit message>"
   ```
   Do NOT use `git add .` — leave other untracked or modified files alone.
3. **Push** to `origin/main`
4. **Run ingest:**
   ```bash
   set -a && source .env && set +a && \
   deno run --allow-read --allow-env --allow-net scripts/ingest.ts
   ```
5. **If behavior change:** apply the index.ts edit via the Edit tool, then commit and push that file separately
6. **If behavior change:** deploy:
   ```bash
   supabase functions deploy ask-aster --project-ref ahonotvcbmczrtnpajua
   ```
7. **Verify** by calling `mcp__claude_ai_Ask_Aster__ask_aster` with a query that should hit the new decision. Confirm:
   - The new decision appears in top results
   - (If behavior change) the voice note reflects the new wording

### Step 6 — Report

Final summary, plain text:
- Decision filename and GitHub commit URL (or short hash)
- Ingest result (X chunks embedded)
- (If applicable) edge function deploy result
- (If applicable) voice note change confirmation
- Top result from the verification search (title + match score)

Keep under 150 words.

## Failure modes

- **Ingest fails on frontmatter:** the schema-required fields are `type`, `service_line`, `visibility_tier`. If missing, the ingest will skip the file silently. Always include all three in Step 2.
- **`service_line` value doesn't match leasing's 8:** the file still gets indexed, but the leasing pilot's auto-filter may not surface it. Flag this to the user during Step 4.
- **Git push fails:** likely auth or upstream divergence. Don't force-push. Surface the error and let the user resolve.
- **Function deploy fails with "Docker not running":** the Supabase CLI works without Docker for remote-only deploys. The warning is harmless. Look for "Deployed Functions on project ahonotvcbmczrtnpajua: ask-aster" in the output.
- **Verification search doesn't return the new decision:** wait 10 seconds and retry once (eventual consistency on Supabase). If still missing, check the ingest output for "1 files updated" — if it says "0 files updated," the file wasn't recognized as new (frontmatter parse error, likely).

## Out of scope

- SOP edits (those go through a different review process)
- Capture intake (incident reports, edge cases — those use the existing skills)
- Bulk corpus operations (deletions, schema changes — manual)
- The Aster MCP prompt skills (`incident-report`, `edge-case`, `decision-to-rollout`) — those are separate, exposed to clients via the MCP server

## Related

- `scripts/ingest.ts` — corpus ingest mechanics
- `scripts/sync-prompts.ts` — for editing MCP-exposed prompts (different workflow)
- `supabase/functions/ask-aster/index.ts` — edge function source (the VOICE_NOTE constant lives here)
- `CLAUDE.md` (repo root) — overall Aster conventions, especially the "ask before destructive/architectural changes" rule
