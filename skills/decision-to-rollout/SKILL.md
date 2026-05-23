---
name: decision-to-rollout
description: Manager skill — turn a reviewed staff capture (incident or edge case) into Asana rollout work. Pulls the source capture task, asks for the decision and which SOPs to update, generates proposed SOP modifications using current SOP content from Aster's corpus, and creates a parent task plus subtasks in the Roll Out project under "Ready for Roll Out". Use after reviewing a New captures task and deciding it needs SOP updates and team training. Triggers on "/decision-to-rollout", "roll out this capture", or "create rollout tasks for this".
---

# Decision → Roll Out (manager skill)

## What this is

This is the manager's skill for promoting a reviewed staff capture into actual rollout work. Staff filed an incident or edge case via `/incident-report` or `/edge-case`, it landed in **Roll Out → New captures**, you reviewed it and decided "yes, this needs SOPs updated and the team trained." This skill takes you from there to a parent task with itemized subtasks ready for execution.

**Important:** This skill does NOT modify SOPs. It creates the *work items* for the SOP work. The proposed SOP changes appear in each subtask description as ready-to-paste markdown the human (you) finalizes when actually editing the SOP.

## When to use

- A New captures task in the Roll Out project has been reviewed and the next step is "update SOPs + train the team"
- You're forming a decision from scratch (no source capture) and want the rollout scaffolding

## When NOT to use

- The capture is informational only (close the task, no rollout)
- The capture should become a write-up or recognition rather than an SOP change
- You haven't reviewed the capture yet

## Voice

Plain English. No em dashes. Casual but professional. You're the manager, the staff capture is in front of you. Aster is helping you efficiently produce the rollout artifacts.

## How it works (high level)

1. Ask which capture task you're rolling out (or whether you're starting from scratch)
2. Pull the capture task from Asana (if provided)
3. Ask you to state the decision in your words
4. Ask which SOPs need updating (paths)
5. For each SOP, retrieve current content from Aster's corpus
6. Generate proposed modifications
7. Show a summary, ask for confirmation
8. Create parent task in Roll Out → Ready for Roll Out + subtasks (one per SOP, plus audit and training)
9. Return the URLs

## Step-by-step

### Step 1 — Identify the source

Ask:
> "Which capture are you rolling out? Give me the Asana URL or task GID. Or say 'no source' if you're forming this decision from scratch."

If a URL/GID is provided, fetch the task with `mcp__asana__asana_get_task` (use `opt_fields: name,notes,permalink_url,created_at,assignee.name`).

If "no source," skip to Step 3 with the source-context blank.

### Step 2 — Parse the capture

The capture task description follows a predictable structure (created by `/incident-report` or `/edge-case`). Extract:
- Reporter name, capture date
- "What happened" / "Situation"
- Property + unit + who's involved
- Service line
- Timeline / status (incident) or "what was unclear" (edge case)

Hold this context for the parent task description.

### Step 3 — Ask for the decision

> "What's the decision you're rolling out? In your words — the policy or operational change that addresses this. Don't worry about polishing it, I'll structure it."

Capture the manager's decision text verbatim. This becomes the canonical decision statement.

### Step 4 — Ask for SOPs to update

> "Which SOPs need updating? Give me paths from the ask-aster repo (e.g. `sops/maintenance/cs-high-priority-maintenance.md`). One per line. If you want to think it through with me, say 'help' and I'll search the corpus for relevant SOPs."

If the manager says "help":
- Use the `ask_aster` tool with a query built from the decision summary + service line
- Show the top 5 results with titles, file paths, and 1-line descriptions
- Ask the manager to pick which to update (or add new ones not in the list)

For each SOP path the manager lists:
- Mark it as either "existing" (already in the corpus) or "new" (does not exist yet, needs to be written)

### Step 5 — Retrieve current SOP content for proposed modifications

For each existing SOP path:
- Use the `ask_aster` tool with a query like the SOP's filename or topic, filtered by service line
- Capture the relevant chunks
- Identify which H2 section the modification should land in

For new SOPs (path doesn't match anything in corpus):
- Use `ask_aster` to find 1-2 sibling SOPs in the same service-line folder for structural reference
- Note their H2 structure for the starter outline

### Step 6 — Generate proposed modifications

For each SOP, produce ready-to-paste markdown:

**Existing SOP — pick the form that fits:**
- **Insert section:** "Add a new H2 section `## <heading>` after `## <existing heading>` with the following content: ..."
- **Modify section:** "In the `## <heading>` section, change ... to ..."
- **Add criterion to a list:** "In the `## <heading>` section's bulleted list, add: `- ...`"

Pull the operational language directly from the manager's decision — don't paraphrase. The SOP and decision should stay tightly aligned.

**New SOP — generate a starter outline:**
```yaml
---
type: sop
service_line: <decision service line>
status: draft
last_reviewed: <today>
---

# <H1 title>

## Purpose
## When this applies
## Procedure
## Escalation / Exceptions
## Related decisions
- <link or reference back to the decision>
```

Always end the proposed modification with: `Source decision: <one-line summary> · Source capture: <Asana URL of original capture, if provided>`.

### Step 7 — Show summary, ask for confirmation

```
Here's what I'll create:

PARENT TASK
Decision: <decision title from manager input>
Source capture: <URL or "no source">
Project: Roll Out → Ready for Roll Out
Assignee: B French

SUBTASKS:
1. Update SOP: sops/maintenance/cs-high-priority-maintenance.md (existing — insert section)
2. Update SOP: sops/maintenance/pest-control.md (existing — modify section)
3. Write new SOP: sops/resident relations/cs-tenant-requests-escalation.md (starter outline)
4. Audit open <service line> tasks against this decision
5. Train relevant teams on this decision

Proceed? (yes / edit / cancel)
```

If "edit," walk through what to change. If "cancel," exit without filing.

### Step 8 — Create the Asana tasks

#### 8a. Resolve "Ready for Roll Out" section GID

Call `mcp__asana__asana_get_project_sections` with `project_id: "1214554387439282"`. Find the section named "Ready for Roll Out" (case-insensitive). If missing, error and stop — same pattern as the capture skills.

#### 8b. Create parent task

`mcp__asana__asana_create_task` with:
- `name`: `Decision: <short title from manager input>`
- `project_id`: `1214554387439282` (Roll Out)
- `section_id`: `<Ready for Roll Out GID>`
- `assignee`: `1203784854198936` (B French)
- `notes`: see template below

**Parent task description template:**
```
DECISION ROLLOUT
Captured: <today's date> via /decision-to-rollout skill
Source capture: <URL of source task, or "no source — formed directly">

== Decision ==
<manager's decision text, lightly cleaned but not paraphrased>

== Source context ==
<bullet summary of the source capture: who reported, what happened, service line — only if source provided>

== SOPs to update ==
<list of SOP paths, each marked "(existing)" or "(new)">

Each SOP modification is broken out as a subtask below with proposed markdown ready to paste.

Service line: <from decision>
```

#### 8c. Create subtasks

For each SOP, one subtask:
- `name`: `Update SOP: <path>` or `Write new SOP: <path>`
- `parent`: `<parent task GID>`
- `assignee`: `1203784854198936` (B French)
- `notes`:
  ```
  Proposed modification for <path>:
  Source decision: <decision title>
  Source capture: <URL or "n/a">
  
  ---
  
  <proposed markdown — ready to paste>
  ```

Plus two more subtasks under the parent:

**Audit subtask:**
- `name`: `Audit open <service line> tasks against this decision`
- `notes`: "Review currently open Asana tasks under <service line> projects to confirm any in-flight work follows the new decision; flag any that don't."

**Training subtask:**
- `name`: `Train relevant teams on this decision`
- `notes`: "Identify which roles touch this workflow, schedule a brief training, confirm acknowledgment. The decision text in the parent task is the canonical source until SOPs are updated."

### Step 9 — Report back

```
Filed.

Parent: <parent task URL>
Subtasks (<n>):
  - <subtask 1 name> → <url>
  - <subtask 2 name> → <url>
  ...

If you also want to:
- Mark the source capture (<source URL>) as "Rolled out" — close it or move to a "Promoted" section
- Add this decision to Aster's corpus, that's a separate step (write-up + ingest)
```

If a source capture was used, do NOT auto-close it. Brittany decides whether to close, comment, or leave open for staff visibility.

## Edge cases

- **Asana MCP not connected:** "Asana isn't connected. Connect via /mcp and try again."
- **Source task GID doesn't resolve:** "Can't find that Asana task. Double-check the URL or GID."
- **Manager provides 0 SOPs to update:** Ask: "No SOPs to update — was this just a write-up or training decision? If so, no rollout work is needed; close the source capture with notes." Exit if confirmed.
- **Manager provides >10 SOPs:** "That's a lot of SOPs. Want me to split this into multiple decision rollouts (one per service line, say) for cleaner tracking? Or proceed as one parent?"
- **`ask_aster` returns nothing for a listed SOP path:** "I couldn't find that SOP in the corpus. Treating it as a new SOP — I'll generate a starter outline. Confirm or correct the path."
- **Already rolled out (idempotency):** This skill does NOT check for an existing parent task with the same name. If you re-run it, you'll get duplicates. If a rollout exists already, edit it directly in Asana.
- **No source capture (Step 1 = "no source"):** Skip the source-context block in the parent description; everything else proceeds normally.

## What this skill INTENTIONALLY does NOT do

- Does not modify any SOPs on disk or in the corpus.
- Does not push to the ask-aster repo.
- Does not re-run ingest.
- Does not create tasks in any project other than Roll Out.
- Does not auto-close the source capture task.
- Does not promote the decision to Aster's corpus. That's a separate manager action (capture as decision markdown, run ingest).
- Does not @-mention staff. You can on the parent task or subtasks if you want.

## Reference

- Roll Out project GID: `1214554387439282`
- "Ready for Roll Out" section: resolved at runtime by name
- "New captures" section (where source captures live): resolved at runtime
- Default assignee: B French, GID `1203784854198936`
- Companion (staff) skills: `/incident-report`, `/edge-case` — these create the source captures this skill consumes.
- Tools used: `mcp__asana__asana_get_task`, `mcp__asana__asana_get_project_sections`, `mcp__asana__asana_create_task`, `ask_aster` (this MCP server's own retrieval tool).
