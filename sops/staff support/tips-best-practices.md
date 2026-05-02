---
title: "Tips & Best Practices"
service_line: staff support
sop_owner: brittany@sagareus.com
status: active
last_reviewed: 2026-05-01
visibility_tier: ic
version: 1
tags: [ai-tools, asana-skill, tips, best-practices]
created_but_never_updated: true
---

Small adjustments that make Claude Code more pleasant to use day-to-day. None of these are required — pick the ones that help.

## Make iTerm easier to read

The default font size in iTerm is small. If you're squinting:


1. In iTerm's menu bar, click **iTerm2 → Settings → Profiles → Text**
2. Click **Change Font** and bump the size to **16pt or 18pt**
3. Close the settings window — it applies immediately

A clean, readable font like **Menlo** or **Monaco** works well. Avoid script or display fonts.

## Match Claude Code's theme to your terminal

Claude Code has its own light/dark theme, separate from iTerm's. If they don't match (e.g. dark iTerm + light Claude theme), code blocks and diffs become hard to read.


1. In Claude Code, type `/config` and press `Enter`
2. Use arrow keys to find **Theme**
3. Pick **Light** if your iTerm background is light, **Dark** if it's dark
4. Press `Esc` to save

## Use Shift+Enter for multi-line messages

When you want to write a longer message to Claude with paragraph breaks, press **Shift + Enter** to add a new line without sending. Press **Enter** alone to send.

This is the difference between dashing off a quick "what's the status of task 1234" and writing out a multi-step request.

## Let Claude help you debug Claude

If something feels off — a connector won't authorize, a command fails, output looks wrong — just describe it to Claude in plain English. It can read your settings, run diagnostic commands, and walk you through fixes.

Example:

> The Asana connector keeps showing "needs authentication" even after I authorize it. Can you help me figure out why?

## Restart Claude after config changes

Whenever you add a new MCP connector, install a skill, or change `~/.claude/settings.json`, **exit and relaunch Claude** (`exit`, then `claude` again). Most config is loaded once at startup.

## Keep messages focused

Claude works best when each message has one clear ask. If you have several unrelated things to do (check email, then update a task, then schedule a meeting), it's usually faster to send them as separate messages than to bundle them — Claude can focus on one thing at a time and you can course-correct sooner.
