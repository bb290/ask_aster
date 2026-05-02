---
title: "Getting Started"
service_line: staff support
sop_owner: brittany@sagareus.com
status: active
last_reviewed: 2026-05-01
visibility_tier: ic
version: 1
tags: [ai-tools, outline-skill, asana-skill, claude-status-line, tips, best-practices]
created_but_never_updated: false
---

This guide gets Claude Code running on your Mac and connected to Asana, Outline, Gmail, Calendar, and Google Drive. Follow each step in order. Total time: about 15 minutes.

## 1. Create your Anthropic account

You need a **personal Pro plan ($20/month)** to use Claude Code.


1. Go to https://claude.ai
2. Click **Sign up** and use your `@sagareus.com` email
3. **Do not** join an organization or upgrade to Team / Enterprise — you want a personal account
4. After signup, go to **Settings → Plans** and subscribe to **Pro** ($20/month). Pro includes Claude Code access.
5. While you're still signed into claude.ai, go to https://claude.ai/settings/connectors and enable these three connectors:
   * **Gmail**
   * **Google Calendar**
   * **Google Drive**

   For each one, click **Connect** (or **Add**) and complete the Google sign-in with your `@sagareus.com` account. You'll use these from Claude Code later — enabling them here is what makes them show up there.

## 2. Install iTerm2

iTerm2 is a free terminal app that works better with Claude Code than the built-in macOS Terminal. You need it for desktop notifications when Claude finishes thinking, and for typing multi-line messages with `Shift + Enter`.


1. Go to https://iterm2.com and click **Download**
2. Open the downloaded `.zip`, then drag **iTerm** into your **Applications** folder
3. Launch **iTerm** (press `Cmd + Space`, type "iTerm", press `Enter`). Click **Open** if macOS warns the app was downloaded from the internet.
4. Turn on notifications so Claude can ping you when it's waiting:
   * In the menu bar, click **iTerm2 → Settings → Profiles → Terminal**
   * Check **"Notification Center Alerts"**
   * Click **"Filter Alerts"** and check **"Send escape sequence-generated alerts"**

From now on, whenever this guide says "Terminal", use **iTerm**.

## 3. Install Claude Code

Open **iTerm**. Copy and paste this command, then press `Enter`:

```
curl -fsSL https://claude.ai/install.sh | bash
```

Wait about a minute. When you see your prompt again, Claude Code is installed.

> **If you see a ⚠ Setup notes message** saying something like `~/.local/bin is not in your PATH`, copy the command it gives you (it will look like `echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc`), paste it into iTerm, and press `Enter`. It's safe — it just makes the `claude` command findable. No output means it worked.

## 4. Create your workspace folder and launch Claude

In iTerm, run these three commands one at a time:

```
mkdir ~/Sagareus
cd ~/Sagareus
claude
```

The first time Claude Code runs, it opens a browser window asking you to log in. Use the same `@sagareus.com` account from Step 1.

> **Tip:** Open Finder, press `Cmd + Shift + H` to go to your Home folder, find the **Sagareus** folder, and drag it into the **Favorites** section of the Finder sidebar. Now you can find it instantly without typing terminal commands.

## 5. Add the Asana and Outline connectors

Once you see the Claude prompt (`>`), copy and paste this into Claude Code, then press `Enter`:

```javascript
Please run these two commands for me:
1. claude mcp add --transport http outline https://sagareus.getoutline.com/mcp
2. claude mcp add --transport sse asana https://mcp.asana.com/sse
```

Wait until Claude reports both commands succeeded. (Gmail, Calendar, and Google Drive don't need to be added here — you enabled those in Step 1, and they'll appear automatically once Claude restarts.)

## 6. Restart Claude and authorize Asana and Outline

The new Asana and Outline connectors only become active after a restart. After that, you'll authorize them through Claude Code's `/mcp` UI. (Gmail, Calendar, and Drive should already show as connected because you enabled them on claude.ai in Step 1.)


1. Type `exit` and press `Enter` to close Claude.
2. Start it again:

```
cd ~/Sagareus
claude
```


3. Type `/mcp` and press `Enter`. You'll see a list that looks like this:

 ![/mcp list showing claude.ai Gmail connected and Google Calendar / Google Drive needing authentication](/api/attachments.redirect?id=bb2dbb6e-c2a1-4863-b489-3b0ff5ecf73b)

You should see five entries:

* **outline** — the Sagareus Outline workspace
* **asana** — the Sagareus Asana workspace
* **claude.ai Gmail** — your email
* **claude.ai Google Calendar** — your calendar
* **claude.ai Google Drive** — your files


4. For every entry that shows **"needs authentication"** (yellow ⚠ icon), use the arrow keys to select it and press `Enter`. Claude will open a browser window — log in with your `@sagareus.com` account and approve.

Repeat for each unauthorized connector. When all five show as **connected** (green ✓ icon), you're done with this step.

## 7. Set up Sagareus Workspace

This step installs the Sagareus Asana skill and the Sagareus status line.

Paste this into Claude:

```javascript
Set up my Sagareus workspace by doing all three of these tasks, in order:
Fetch the Outline document at https://sagareus.getoutline.com/doc/asana-zO0c9UVboM and follow its setup instructions to create the personal Asana skill at ~/.claude/skills/asana/SKILL.md.
Fetch the Outline document at https://sagareus.getoutline.com/doc/skill-outline-MNg4BvEnh5 and follow its setup instructions to create the personal Outline skill at ~/.claude/skills/outline/SKILL.md.
Fetch the Outline document at https://sagareus.getoutline.com/doc/status-line-ukseNydl4P and follow its setup instructions to install the Sagareus status line.
Confirm when all three are done.
```

Claude will read both docs, write the necessary files, and confirm. Restart Claude Code afterward to see the status line at the bottom of your session.

## 8. Test

Paste this into Claude:

```javascript
Show me three things, one after the other:
The first email in my inbox from today
My open Asana tasks assigned to me
My calendar schedule for today
```

You should see all three. If any connector prompts for re-authorization, follow the browser flow.

## Stuck?

Ask Claude itself. Type your question into Claude Code as if you were chatting with a colleague — it will help you debug.
