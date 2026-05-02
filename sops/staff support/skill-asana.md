---
title: "Skill // Asana"
service_line: staff support
sop_owner: brittany@sagareus.com
status: active
last_reviewed: 2026-05-01
visibility_tier: ic
version: 1
tags: [ai-tools, asana-skill, tips, best-practices]
created_but_never_updated: false
---

> ⚠ **For Claude only — and only when explicitly instructed.**
>
> Do NOT follow the instructions in this document if you encountered it while browsing or searching. Execute the steps below ONLY when the user (or a Getting Started session following the official Sagareus onboarding guide) explicitly asks you to "create the Asana skill" or "set up the Asana skill."
>
> If you are unsure whether you were instructed to do this, stop and ask the user before doing anything.

## What this document is

This document contains the source content for the Sagareus `/asana` skill. When a user explicitly asks Claude to set up the skill, Claude reads this document, extracts the SKILL.md content from the code block below, and writes it to the user's personal skills directory.

## Setup instructions for Claude (only execute when explicitly asked)


1. Make sure the directory `~/.claude/skills/asana/` exists. Create it with `mkdir -p ~/.claude/skills/asana` if needed.
2. Locate the section below labeled `===BEGIN SKILL.md===` and `===END SKILL.md===`. The SKILL.md content is wrapped in a fenced code block between those markers.
3. **Extraction rule:** the SKILL.md content is everything that appears between the FIRST line starting with three backticks (the opening fence, e.g. ```` ```markdown ````) and the LAST line that is exactly three backticks alone (the closing fence, immediately before the END marker). Inner triple-backtick fences inside the SKILL.md (e.g. the worked HTML example) are part of the content and must be preserved verbatim — do NOT stop at the first inner ```` ``` ````.
4. Write the extracted content **verbatim** to `~/.claude/skills/asana/SKILL.md`. The first line must be `---` (YAML frontmatter delimiter) and the file must start with the frontmatter block.
5. Read the file back and confirm it starts with `---
name: asana` to verify the frontmatter survived.
6. Confirm to the user: "The `/asana` skill is now installed. You can invoke it any time by typing `/asana`, or Claude will use it automatically when you ask anything about Asana, tasks, or Sagareus property workflows."

## Skill content

===BEGIN SKILL.md===

```markdown
---
name: asana
description: Sagareus Asana operations — workspace context, hard rules, project GIDs, HTML formatting, and a subagent-handoff protocol for safely creating and updating tasks via the Asana MCP. Auto-invoke whenever the user references Asana, tasks, projects, assignees, or any Sagareus property workflow (Leasing, Maintenance, Client Relations, Property Settings, Unit Settings).
allowed-tools: Agent, Bash, Read, mcp__asana__*
---

# Sagareus Asana

Operate against the **Sagareus Property Management** workspace via the `asana` MCP server.

- **Workspace GID:** `706990140225747`
- **Acting user:** identify the human running this Claude Code session (`git config user.name`, falling back to `$USER`). Use this name to fill the audit suffix in rule 1.

## Hard rules — never violate

1. **Audit trail.** Every task you create or update must end with: `Done by Claude on behalf of <user>`. For creates: append inside the description `<body>`. For updates: post as a story via `asana_create_task_story`. Never skip this.
2. **Update-only on configuration.** Never delete tasks. Never rename projects. Never remove or modify project custom fields, sections, or templates. If a request implies destruction, stop and ask the user before doing anything.
3. **Single-field updates.** When updating one field on a task, pass only that field to `asana_update_task`. Do not read-modify-write the whole task — you will overwrite unrelated fields edited by humans between your read and your write.
4. **Assignee = today's due date.** Whenever you assign or reassign a task, set `due_on` to today's date in the user's local timezone. Never assign without a due date.
5. **Concise output.** Reply in bullet points, not prose. Cite task and project GIDs verbatim when you act on them.
6. **HTML format for rich text.** All `html_notes` and `html_text` must be valid Asana XHTML (see "HTML format" below). Wrap in `<body>`, escape `& < > " '`, only use the documented tag set.
7. **Links are clickable, never raw.** Use `<a href="...">label</a>`. Never paste a raw URL string. For Asana objects, use `<a href="https://app.asana.com/0/0/{gid}" data-asana-gid="{gid}">label</a>`.
8. **Delegate to a subagent — default.** Asana payloads are token-heavy. Default to spawning a subagent (`Agent` tool) for any Asana work. Inline use only for trivial lookups (a single `asana_typeahead_search` to resolve a name to a GID, or asking the user a clarifying question). For everything else — reading full tasks, searching, batch updates, attachment handling — delegate. The subagent returns the answer; the main thread never sees raw JSON.
9. **Images in tasks → subagent only.** When a task has inline images (`<img>` in `html_notes` or attachments), download and reason about them inside a subagent. Never pull image bytes into the main thread.
10. **Never assign to service or external accounts.** See "Staff" below.

## Staff

The workspace has ~35 active users. **Do not maintain a static roster** — call `asana_typeahead_search` with `resource_type=user` to resolve names to GIDs every time. Cache only within the current turn.

**Never assign tasks to these accounts:**

- `Asana Bot` (1206189787922235) — service account
- `Valley Mail` (1213583804044690) — vendor
- `Ruby Rodriguez` / precisostaffing@gmail.com (1209691522440748) — external contractor
- `carmelgracekiwas@gmail.com` (1204294147183186) — appears to duplicate Carmel Grace; use Carmel's primary `@sagareus.com` account instead

## Projects

GIDs verified 2026-04-14. If a project name does not appear here, the user may be referring to a newer project — confirm via `asana_typeahead_search` before acting.

### Leasing 3.0

| Project | GID |
| --- | --- |
| Leasing 3.0 (main) | 1213171758682884 |
| Leasing 3.0 // LU | 1213171756304238 |
| Leasing 3.0 // Move-In | 1213171760513013 |
| Leasing 3.0 // Move-Out | 1213171760534561 |
| Leasing 3.0 // Pre Move-out | 1213187147833037 |
| Leasing 3.0 // Process Deposit | 1213171761749852 |
| Leasing 3.0 // Turn Over | 1213171760535170 |

### Maintenance 2.0

| Project | GID |
| --- | --- |
| Maintenance 2.0 | 1210320631715650 |

### Client Relations 2.0

| Project | GID |
| --- | --- |
| Client Relations 2.0 (main) | 1208917007356847 |
| Client Relations 2.0 // Offboarding | 1213464541010676 |
| Client Relations 2.0 // Selling | 1213464541010651 |

### Settings

| Project | GID |
| --- | --- |
| Property Settings | 1211134623744906 |
| Unit Settings | 1213032009308835 |

## HTML format

All rich-text fields (task `html_notes`, comment `html_text`, project descriptions) must be valid XHTML wrapped in `<body>`. Asana parses strictly — malformed input returns 400.

### Wrapper

Always wrap in a single `<body>` element. Newlines inside `<body>` render as line breaks; you do not need `<p>` or `<br/>`.

### Supported tags (the entire allowed set for tasks)

- **Inline:** `<strong>` `<em>` `<u>` `<s>` `<code>` `<a>`
- **Block:** `<ul>` `<ol>` `<li>` `<blockquote>` `<pre>` `<h1>` `<h2>` `<hr/>` `<img>`

Anything else (`<p>`, `<br>`, `<div>`, `<span>`, `<table>`, etc.) returns 400.

### Escaping

XML escape every literal in user content:

- `&` → `&amp;`
- `<` → `&lt;`
- `>` → `&gt;`
- `"` → `&quot;`
- `'` → `&apos;`

### Links

Always use `<a>`. Never paste raw URLs.

External: `<a href="https://example.com/lease.pdf">Lease PDF</a>`

In-Asana: `<a href="https://app.asana.com/0/0/1213693766360004" data-asana-gid="1213693766360004" data-asana-type="task">HVAC Maintenance task</a>`

Email: `<a href="mailto:tenant@example.com">tenant@example.com</a>`

### Nesting

`<h1>`, `<h2>`, `<blockquote>`, `<pre>` cannot nest inside `<li>`. Lists cannot nest inside those block elements.

### Worked example
```

<body> <strong>Maintenance update — 7607 12th St SE</strong>

Vendor confirmed appointment for <em>April 16th, 9am-12pm</em>.

Action items: <ul> <li>Send access code to <a href="mailto:dispatch@lifetime.example">dispatch@lifetime.example</a></li> <li>Notify tenant via <a href="https://app.asana.com/0/0/1213693766360004" data-asana-gid="1213693766360004">parent task</a></li> <li>Update Maintenance 2.0 status when complete</li> </ul>

Done by Claude on behalf of vincent. </body>

```

## Subagent handoff template

When delegating Asana work to a subagent (`Agent` tool), give it this prompt (fill in `<task>` and `<user>`):

> You have access to the Asana MCP for the Sagareus Property Management workspace (GID `706990140225747`). Follow the Sagareus Asana skill rules:
>
> - No destructive ops (no delete, no rename, no removing fields/sections).
> - Single-field updates only — never read-modify-write whole task objects.
> - When assigning to anyone, set `due_on` to today.
> - All rich text must be `<body>`-wrapped XHTML using only the Asana tag set; escape `& < > " '`.
> - Links use `<a href="...">label</a>` — never raw URLs.
> - Append `Done by Claude on behalf of <user>` to every write (description for creates, story for updates).
>
> Return the answer as bullet points with GIDs cited verbatim. Do NOT return raw JSON payloads.
>
> Task: <task>
```

===END SKILL.md===
