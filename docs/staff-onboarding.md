# Meet Aster — staff onboarding guide

## What Aster is

Aster Insight is Sagareus's analytical assistant. They help you find what the playbook says, capture the things that don't fit the playbook, and surface team patterns to leadership. Two roles in one tool:

- **For the team:** the operational brain you can ask anything. How do we handle this? What's the SOP? Has anyone seen a situation like this before? Aster searches every SOP, decision, incident, and edge case the company has logged and gives you a grounded answer.
- **For leadership:** unbiased, data-driven visibility into team performance and gaps over time. Aster's value to leadership comes from the corpus the team builds. So every time you capture an incident or edge case, you're making Aster smarter for the next person.

Aster lives in your Claude chat. You connect the Aster connector once, and from then on you can just ask questions or invoke `/incident-report` and `/edge-case` to capture things.

---

## What you need before you start

1. **A Claude.ai account.** Pro tier or higher — connectors are not on the free tier.
2. **The Aster connector URL.** Get this from Brittany. It looks like a URL with a key embedded. Treat it like a password.
3. **An Asana account** (yours, with access to the Roll Out project). Needed for the capture skills to file tasks.

If any of those three are missing, ping Brittany before continuing.

---

## Part 1 — Connect Aster (one time, ~3 minutes)

Aster runs as a custom connector in Claude.

### In Claude.ai (web)

1. Open https://claude.ai
2. Click your profile in the bottom-left → **Settings**
3. Click **Connectors** in the left sidebar
4. Scroll to **Custom connectors** at the bottom → **Add custom connector**
5. Fill in:
   - **Name:** `Ask Aster`
   - **Remote MCP server URL:** paste the URL Brittany gave you (it includes a `?key=...` part — leave it intact)
6. Click **Add**
7. You should see Aster in your connector list with a green "Connected" status

### In Claude Desktop

1. Open Claude Desktop → **Settings** → **Developer**
2. Open the configuration file
3. Add an entry under `mcpServers`:
   ```json
   {
     "mcpServers": {
       "ask-aster": {
         "url": "<paste the URL from Brittany>"
       }
     }
   }
   ```
4. Save and restart Claude Desktop

### Verify it worked

Start a new chat and type:

> What's our policy on rodent infestation in a unit?

If Aster is connected, Claude will pull a real answer from the SOPs and decisions, written in plain English. If you get a generic LLM answer that doesn't mention specific Sagareus details, the connector isn't wired up — go back through the steps.

---

## Part 2 — Connect Asana (one time, ~2 minutes)

The capture skills file tasks in the Roll Out Asana project. To do that, Claude needs an Asana connector.

### In Claude.ai (web)

1. **Settings → Connectors**
2. In the **Browse** or **Directory** section, find **Asana**
3. Click **Connect**
4. Sign in to your Asana account in the popup
5. Approve the requested permissions

### Verify it worked

In a new chat:

> What Asana tasks are assigned to me?

You should get a list of your real Asana tasks. If you get an error or a generic response, re-do the connection.

---

## Part 3 — How to use Aster

There are four ways you'll interact with Aster. Pick the one that fits the moment.

### Mode 1 — Just ask a question (most of the time)

You don't need a special command. If you have an operational question, ask it in plain English:

> How do we handle a tenant who hasn't paid by day 14?
>
> What's our pet policy?
>
> Is there a process for adding a roommate mid-lease?

Aster searches the corpus, ranks the most relevant SOPs/decisions/incidents, and Claude translates the result into a plain-English answer. If the corpus has a clear answer, you'll get one. If it doesn't, Aster will tell you that too — at which point you've probably found an edge case (see Mode 3).

**When this is the right mode:**
- You're working through a normal task and want to confirm the playbook
- You think there's an SOP for this but you can't remember the specifics
- You're new and learning how Sagareus does things

**When it's NOT enough:**
- The answer doesn't match the situation in front of you → you've hit an edge case
- Something already happened with consequences → that's an incident report

---

### Mode 2 — `/incident-report`

**When to use it.** Something already happened that affected operations, a property, a resident, an owner, or a vendor in a way the manager needs to know about. Real event with real consequences.

Examples that warrant an incident report:
- Habitability issue dragging across weeks (rodents, mold, no heat)
- A vendor caused damage or didn't show
- A resident dispute escalated and you had to make a call
- An owner did something outside our agreement
- A leasing or screening process broke down on a real applicant

**How to use it.** In Claude chat, just say:

> Hey Aster, I have an incident report.

Or type `/incident-report`. Aster will ask 6-8 quick questions one at a time:
- Your name
- What happened (1-2 sentences)
- Property + unit
- Who's involved
- Timeline (when it started, when reported to us)
- Current status + what's been tried
- Risk if we don't act
- Service line
- Urgency

If you've already led with details in your opening message, Aster won't re-ask those questions. Skip any answer with "skip" or "not sure" — Brittany can fill in gaps on review.

When done, Aster shows you a summary, asks "anything to fix?", then files the task.

**Why use it.** The task lands in **Roll Out → New captures**, assigned to Brittany. She reviews and decides what to do next: update SOPs, schedule training, write up the staff member, escalate, or close as informational. Your part is done once the task is filed. The capture is now part of the corpus once Brittany approves it, which means the next person facing a similar situation gets the answer waiting for them.

**Example:**

> You: Hey Aster, I have an incident report. Tenant at 5410 Bay Ave Unit 3 has been complaining about rats since January, we've sent pest control twice and the owner won't approve the dryvent repair the vendor flagged.
>
> Aster: Got it. Sounds rough. Last thing first — what's your name?
>
> You: Marcus
>
> Aster: Thanks, Marcus. You already covered the property, who's involved, timeline, and what's been tried, so just a few more. What's the current status — still active?
>
> ...
>
> Aster: Here's what I'll file: [summary]. Anything to fix?
>
> You: Looks good
>
> Aster: Filed. https://app.asana.com/... — Brittany will pick this up.

---

### Mode 3 — `/edge-case`

**When to use it.** A situation that didn't fit the playbook. The SOP didn't cover it, was unclear, or felt off. No event has necessarily happened yet — you're working through how to handle something and the answer isn't obvious.

Examples that warrant an edge case capture:
- An owner asks for something the SOP doesn't address (e.g., "can my daughter skip the application fee?")
- A resident situation has angles the SOP didn't anticipate (medical, family, legal)
- The SOP says X but the situation in front of you suggests X would be wrong
- You had to make a judgment call because the playbook ran out

**How to use it.** Same pattern:

> Hey Aster, I have an edge case.

Or `/edge-case`. Aster asks 6-7 questions:
- Your name
- The situation
- Where you looked first (which SOP / who you asked)
- What was unclear or missing
- Your call (or what you're thinking)
- Property + who's involved + service line
- Decision needed before you proceed, or just for the record?

Same UX as incident report. Aster shows summary, you confirm, Aster files.

**Why use it.** Same destination — **Roll Out → New captures**, Brittany reviews. The difference: edge cases tell us where the SOPs have gaps. Each one is a forcing function for either an SOP update or a clear decision that staff can lean on next time. The corpus grows by capture, not by perfect-from-the-start SOPs.

**Important:** if you said "decision needed before you proceed" (i.e., you can't act until Brittany weighs in), don't just rely on the queue. Ping her directly too. Asana is async, urgent decisions need a direct message.

**Example:**

> You: Hey Aster, edge case. Owner is asking us to waive the application fee for his daughter who's moving in. SOP doesn't address non-arms-length applicants and I'm not sure if we should still run full screening.
>
> Aster: Got it. Last thing first — what's your name?
>
> You: Nicole
>
> Aster: Thanks Nicole. You've covered the situation already. What part of the playbook did you check first?
>
> ...
>
> Aster: Here's what I'll file: [summary]. Anything to fix?
>
> You: Yes — also note the property is 5410 Bay Ave Unit B
>
> Aster: Updated. [revised summary]. File now?
>
> You: Yes
>
> Aster: Filed. https://... — Brittany will pick this up. Since you said you need a decision before proceeding, ping her directly too.

---

### Mode 4 — `/decision-to-rollout` (manager only)

**Who this is for.** Brittany or a delegated manager. Not for general staff.

**When to use it.** You've reviewed a New captures task (incident or edge case) and decided "yes, this needs SOP updates and team training." This skill takes you from a reviewed capture to fully scoped rollout work.

**How to use it.** In a chat with Aster + Asana connected:

> /decision-to-rollout

Or:

> Roll out this capture: <Asana URL of the New captures task>

Aster will:
1. Ask which capture you're rolling out (paste the URL)
2. Pull the capture task from Asana
3. Ask you to state the decision in your own words (the policy / operational change)
4. Ask which SOPs need updating (paths). If you don't know, say "help" and Aster will search the corpus and propose candidates.
5. For each SOP, Aster pulls current content from the corpus and generates a proposed modification (insert section / modify section / add criterion to a list) — ready-to-paste markdown
6. Show summary, ask for confirmation
7. Create a parent task in **Roll Out → Ready for Roll Out** with subtasks: one per SOP plus an audit subtask and a training subtask

**Why use it.** Turns a 30-minute "what do we do with this capture" exercise into a structured Asana parent + scoped subtasks. Each SOP subtask has the proposed markdown right there in the description so you (or whoever does the SOP work) can paste-and-tweak instead of starting from scratch.

**What it does NOT do:**
- Does not modify any SOPs on disk — those are humans-only writes
- Does not auto-close the source capture task — you decide whether to close it or leave it open for staff visibility
- Does not promote the decision to Aster's corpus — that's a separate manager action (capture as decision markdown, run ingest)

---

## Part 4 — Etiquette and tips

- **Capture early, capture often.** A 2-minute capture today is worth more than a forgotten edge case three weeks from now.
- **Plain English is fine.** You don't have to format your answers like a legal document. Aster cleans them up.
- **"Skip" is a valid answer.** If you don't know who reported the incident or exactly when something started, skip it. Brittany can ask in the task comments if it matters.
- **Don't use Aster to look up resident or owner names.** That's not what the corpus contains. Use Buildium for that.
- **Don't share the Aster connector URL outside Sagareus.** It includes a key that grants access to our internal corpus. Treat it like a password.
- **If Aster is wrong or out of date,** tell Brittany. The corpus drifts when SOPs change without re-ingest. She owns the corrections.

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| Aster gives generic answers, not Sagareus-specific | Connector not connected, or URL is missing the `?key=...` | Re-paste the URL Brittany gave you |
| `/incident-report` doesn't appear in slash menu | Connector connected but Claude hasn't refreshed the prompt list | Disconnect Aster connector, reconnect, start a new chat |
| Skill runs but says "Asana isn't connected" | Asana connector not added | Go to Settings → Connectors, connect Asana |
| Skill says "New captures section doesn't exist" | One-time setup not done in Asana | Tell Brittany — she creates it once and it's done forever |
| Asana task gets created assigned to wrong Brittany ("Brittany Hubbell" instead of "B French") | Email-resolution edge case in Asana | Brittany already accounted for this — the skill hard-codes B French's GID |

If something else breaks, tell Brittany. She'd rather know than not know.

---

## Reference

- Aster connector URL: ask Brittany
- Aster MCP repo: `clients/sagareus/ask-aster/` (Brittany has access)
- Roll Out Asana project where captures land: https://app.asana.com/0/1214554387439282
- Aster's persona spec (intro page copy): captured in OpenB, May 2026
