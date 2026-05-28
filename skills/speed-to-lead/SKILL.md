---
name: speed-to-lead
description: Scans the agent's Gmail for new Zillow leads (unread emails from `*@convo.zillow.com` with subject pattern "is requesting information about"), parses each one, looks up the property in Asana for the listing URLs and preferred showing slots, drafts a personalized reply per the Speed to Lead SOP, and creates a Gmail draft per lead for the agent to review and send. v0 is draft-only, never auto-sends. Use when an agent says "check Zillow leads," "respond to my new leads," "speed to lead," or invokes /speed-to-lead. Requires Gmail and Asana MCPs connected.
---

# Speed to Lead — lead response skill

## What this is

The leasing agent's inbound-lead response composer. Reads unread Zillow inquiries from Gmail, drafts personalized replies grounded in the Speed to Lead SOP, and queues them as Gmail drafts the agent reviews and sends. The point: cut response time from "when I get to my inbox" to a 2-minute review pass per batch.

Aster never sends. The agent reviews each draft, edits if needed, hits send.

## When to use

- Agent invokes `/speed-to-lead`
- Agent says "check Zillow leads," "respond to my Zillow leads," "speed to lead," "any new leads," or similar
- Realistic cadence: a few times a day, or whenever Gmail pings the agent with a new Zillow inquiry

## When NOT to use

- Agent wants to respond to an existing thread mid-conversation (e.g., prospect asked a question after the first reply) — that's a one-off, just answer directly
- Agent is scheduling showings (use a separate showing-coordination flow, future skill)
- Lead came from a non-Zillow source (Redfin, Sagareus direct inquiry, referral) — different parsing pattern, not handled in v0

## Voice rules

- **Never use em dashes.** Commas, periods, or semicolons.
- Plain English, casual but professional.
- The draft replies are addressed to the PROSPECT (a stranger), not internal. Warm but not gushy.
- One question at a time when talking to the agent.

## Workflow

### Step 1: find unread Zillow leads in the agent's Gmail

Use `mcp__claude_ai_Gmail__search_threads` with this query:

```
is:unread from:convo.zillow.com subject:"is requesting information about"
```

Or, if the agent specified a property filter ("/speed-to-lead for 1537 Valentine"):

```
is:unread from:convo.zillow.com subject:"is requesting information about" subject:"<address fragment>"
```

If no leads come back, say so: "No unread Zillow leads in your inbox right now. Try again after the next one comes in."

If 1 or more leads come back, proceed.

### Step 2: parse each lead

For each thread, use `mcp__claude_ai_Gmail__get_thread` with `messageFormat: "FULL_CONTENT"` to pull the body. Extract:

| Field | Where it lives in the email |
|---|---|
| Prospect first name | First word of subject, before "is requesting" |
| Prospect full name | Sender line (e.g., "Mariah Barlow <hash@convo.zillow.com>") |
| Convo email (Zillow relay) | The `<hash@convo.zillow.com>` address. Reply lands here, Zillow forwards to the prospect. |
| Property address | Subject line, after "is requesting information about " |
| Prospect message | Body line(s) right after "<Full Name> says:" up to the "Send Application" or "Reply directly" marker |
| Phone (if shown) | Inside the "See [name]'s phone contact info" link, look for `&phone=...` URL param, URL-decode it |
| Move-in date | "Move in" field under "About <name>" block, if present |
| Credit score range | "Credit score" field, if present |
| Pets | "Pets" field, if present |
| Lease length | "Lease Length" field, if present |
| Number of occupants | "Number of Occupants" field, if present |

The "About <name>" block (move-in, credit, pets, lease, occupants) only appears when the prospect has filled in their Zillow Renter Profile. Treat it as a bonus: surface to the agent but don't require it.

### Step 3: look up the property in Asana

For each parsed lead, use `mcp__asana__asana_search_tasks` to find the listing by the address from the subject line. The search returns the LU sub-task directly (within `Leasing 3.0 // LU`). From the LU sub-task, pull these custom fields. TP exists later in the workflow for tenant placement and does not carry these listing fields:

- **🤖 Sagareus Listing Link** (the canonical "Listing Link" that goes in the prospect-facing email; points at the Sagareus-owned Buildium listing page)
- **Video Walkthrough** (optional, write "Pending" if empty per template rules)
- **Preferred Showing Slot 1** + **Preferred Showing Slot 2** (used to determine the next upcoming slot to offer)

If the property isn't found in Asana, surface to the agent: "Couldn't find [address] in Asana. The reply will go out with the listing link as 'Pending', do you want to proceed?" Let them say yes/no.

### Step 4: draft the reply per the Speed to Lead SOP

**Authoritative template (use verbatim, fill placeholders only). Blank lines between sections are intentional, preserve them:**

```
Hi there, thank you for your interest in <<ADDRESS>>!

Here is a link to the Listing to review details & a video walkthrough of the property to confirm it feels like a good fit:
 🎥 <<Video Walkthrough or "Pending">>
 📄 <<Listing Link>>

Do you have any questions about the property? I have available time at <<DATE/TIME>> if you would like to see it in person. Or is there another time that works better?

Thanks,
```

**Template rules:**

- Greeting is always **"Hi there,"** never "Hi [First Name]". The Sagareus convention is generic, not personalized. Don't override.
- Emojis 🎥 and 📄 are **required** in this template, overriding the general no-emoji rule. They're functional icons, not decoration.
- **Blank lines** between the intro, the links block, the questions/showing line, and "Thanks," are required for readability. Don't collapse them.
- If the **Video Walkthrough field is missing** in Asana, write `Pending` as the value after 🎥 (do not omit the line). Keeps the structure consistent and visually flags the missing asset.
- **DATE/TIME** is the **next upcoming Preferred Showing Slot** from Asana, calculated from now. If today is Tuesday before noon, that's today's 12-2pm slot. If Tuesday afternoon is past, the next slot is the upcoming Saturday 3-5pm. Skip ahead to the next future occurrence either way.
- Use a concrete date and time, not a recurring description. "Saturday May 16, 3-5pm" beats "Saturdays 3-5pm" because the prospect needs a specific moment to confirm against their schedule.
- End with single "Thanks," or "Best," — no agent name (Gmail signature handles that).
- Subject line for the reply: keep the original subject prefixed with "Re:" (set manually since we're creating a fresh draft, not replying inline).

**Adapt the template based on what the prospect said in their message:**

- **Prospect just asked for general info or a tour** (most common): use the template verbatim with the next slot filled in.
- **Prospect asked a specific question** (e.g., "Is it pet friendly?", "What's the parking?"): flag for the agent to answer manually. Draft the standard template but ALSO surface the question to the agent: "Mariah asked about pet policy, you'll want to answer that before sending."

**Important formatting rules for the draft:**

- No em dashes (except where unavoidable inside the template's own punctuation, which uses "&" instead).
- In the HTML version, render the URLs as proper `<a>` tags with the URL itself as both href and visible text. Keep the emoji prefix inline.
- In plain text, the emojis render natively in Gmail.

### Step 5: show all drafts to the agent for review

Before creating any Gmail drafts, summarize what's about to go out. Format:

```
Found N new Zillow leads. Here's the draft set:

──────────────────────────────────────────
Lead 1: Mariah Barlow → 8037 Brooklyn Ave NE #2, Seattle
  Phone: 720-227-7450
  Their message: "I would like to schedule a tour for sometime
  next week. What days/times do you have available?"

  Draft reply:
  [paste the drafted body]

──────────────────────────────────────────
Lead 2: Maero Matthew → 12529 14th Ave NE, Seattle
  Phone: 716-397-2589
  Renter profile: move-in May 22, credit 660-719, no pets,
  12 months, 3 occupants.
  Their message: "I would like to schedule a tour."

  Draft reply:
  [paste the drafted body]

──────────────────────────────────────────

Want me to create all N drafts in Gmail, or skip any?
```

Wait for agent confirmation. If they say "skip lead 2" or similar, drop that one. If "looks good," create all.

### Step 6: create the Gmail drafts

For each approved draft, call `mcp__claude_ai_Gmail__create_draft` with:

- `to`: the `<hash@convo.zillow.com>` address (the Zillow relay)
- `subject`: `Re: <original subject>`
- `htmlBody`: HTML version of the draft
- `body`: plain-text version

**Do NOT auto-send.** Always draft.

### Step 7: confirm and close

```
Created N drafts in your Gmail. Review and send when ready.

Heads up on any leads that needed a stub (specific questions
asked, missing Asana property, etc.):
  • Lead 2 asked about pet policy, I left a stub for you to fill in.

Anything that didn't draft cleanly:
  • Lead 3 property not found in Asana, sent the reply without
    a listing link.
```

## Asana custom fields used

On the LU sub-task within `Leasing 3.0 // LU` (search by address returns it directly). TP sub-task exists later in the workflow for tenant placement but does not carry these listing fields:

| Field | Type | Used for |
|---|---|---|
| 🤖 Sagareus Listing Link | Text | The 📄 "Listing Link" in the prospect-facing email. Sagareus-owned Buildium listing page, source of truth. |
| Video Walkthrough | Text | The 🎥 link. Write "Pending" if empty. |
| Preferred Showing Slot 1 | Text | First preferred recurring window (e.g., "Tuesdays 12-2pm") |
| Preferred Showing Slot 2 | Text | Second preferred recurring window (e.g., "Saturdays 3-5pm") |

The skill calculates the next upcoming concrete date and time from the two preferred slots and offers ONE in the template's DATE/TIME placeholder.

If a showing-slot field is empty, fall back to the other. If both are empty, the draft becomes "Do you have any questions about the property? What days and times work for you, and I'll match my availability."

## Edge cases

- **No unread leads.** Tell the agent, suggest they retry later.
- **Property not in Asana.** Confirm with the agent before drafting, send without listing-link info if they say go.
- **Prospect asked a specific question.** Stub the draft, surface the question to the agent. Don't try to answer property-specific questions from generic knowledge (could be wrong, hurts trust).
- **Renter profile shows red flags.** If credit < 600 or there's clearly going to be a screening issue, still send the standard reply (Fair Housing rules). Don't try to pre-screen at this stage. Flag for the agent's awareness only.
- **Prospect already replied in the same thread** (e.g., they sent a follow-up before we ever responded). Treat as "unread, multiple messages." Read the most recent message for parsing, but include awareness of the earlier ones in the agent's review.
- **Same prospect inquired about multiple properties.** Each lead drafts separately.
- **Lead is over a week old.** Surface it to the agent: "This one's been sitting for 7+ days. Want me to still draft, or skip?"
- **Gmail MCP not connected.** Surface a clear message: "Can't read your inbox without Gmail connected. Go to Settings then Connectors in claude.ai to connect Gmail, then re-run." Don't try a fallback, this skill is Gmail-dependent.
- **Asana MCP not connected.** Skill can still draft, just without the property-specific URLs. Tell the agent: "Replying without Asana lookups. The listing link and showing slots will be missing from each draft, paste them in manually before sending."

## Voice rules for the prospect-facing draft

- No em dashes.
- Plain English, warm but not gushy.
- One sentence per concept, no run-ons.
- End with "Thanks," or "Best," and stop. No agent name, no "Sagareus" footer. Gmail signature handles that.
- Keep replies under 100 words. Speed-to-lead is about momentum, not a wall of text.

## Out of scope

- Sending the replies. Always draft.
- Auto-adding showings to Google Calendar (that happens after the prospect confirms a slot, future flow).
- Following up after 24 hours with no response (the SOP says RingCentral text follow-up, that's a future skill or manual for v0).
- Group-showing logic. v0 offers individual slots. Grouping logic can come in v1.
- Handling leads from sources other than Zillow.
- Pre-screening based on Renter Profile data. Fair Housing requires consistent response, not selective.

## Limitations to flag if asked

- v0. Skill is agent-invoked, not scheduled. Run it manually a few times a day.
- The "About [prospect]" block only appears when the prospect filled their Zillow Renter Profile. About half the time. Treat as bonus info.
- Property lookup depends on the address in the Zillow subject matching the address on the Asana parent task. If the spelling/formatting differs, the skill falls back to "property not found, proceed without?"
- Drafts only, never auto-sends.
