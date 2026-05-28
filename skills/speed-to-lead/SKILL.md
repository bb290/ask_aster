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

### Step 1.5: identify the running agent

The skill needs the running agent's Gmail address so it can attach the right signature in Step 6. Resolve it once, reuse it across all drafts in this run.

How to resolve:

1. Call `mcp__claude_ai_Gmail__search_threads` with query `in:sent` and `pageSize: 1`. Take the most recent sent message.
2. Read its `sender` (or the From header) → that's the authenticated user's email.
3. Lowercase it and remember it as `<<AGENT EMAIL>>` for the rest of the run.

If the sent folder is empty (brand-new account) or the call fails, fall through to the company signature in Step 6. Don't block the rest of the flow.

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

**Authoritative template (use verbatim, fill placeholders only). The structure is: greeting, intro paragraph, bulleted links list, bold section header, openings line, bulleted slots list, fallback line, "Best,". Blank lines between blocks are required, preserve them:**

```
Hi <<GREETING>>,

Thanks for your interest in <<ADDRESS>>! Let me know if you have any questions about the property.

   - Listing & Application       (hyperlink: <<LISTING LINK>>)
   - Video Walkthrough           (hyperlink: <<VIDEO WALKTHROUGH>>, or plain text "Video Walkthrough (Pending)" if the Asana field is empty)

In-Person Showing                (rendered bold)

If you're ready to see it in person, I have openings:

   - <<SLOT A>>
   - <<SLOT B>>

If neither works, send a few times that do and I'll do my best to accommodate.

Best,
```

**Template rules:**

- **Greeting:** use `Hi <First Name>,` when the prospect's first name parses cleanly from the Zillow subject (starts with a capital letter, alphabetic, recognizable name). Otherwise fall back to `Hi there,`. The `<<GREETING>>` placeholder resolves to whichever applies.
- **No emojis.** This template intentionally drops the old 🎥/📄 icons. Clean bullets only.
- **Links list** is a bulleted list with two items: `Listing & Application` (hyperlinked to the 🤖 Sagareus Listing Link value) and `Video Walkthrough` (hyperlinked to the Video Walkthrough value). The visible text is exactly `Listing & Application` or `Video Walkthrough`, never the raw URL.
- **Video Walkthrough fallback:** if the Asana Video Walkthrough field is empty, render the second bullet as plain text `Video Walkthrough (Pending)` with no hyperlink. Keeps the structure consistent and visually flags the missing asset.
- **In-Person Showing** is its own paragraph between the links block and the openings line, rendered **bold** (HTML `<strong>`). In plain text, render as `*In-Person Showing*` so Gmail bolds it.
- **SLOT A and SLOT B** are the next upcoming occurrences of **Preferred Showing Slot 1** and **Preferred Showing Slot 2** from Asana, both calculated from now and rendered in chronological order (sooner is SLOT A). Example: if today is Thursday and Slot 1 is "Tuesday 2-4pm" and Slot 2 is "Saturday 10am-12pm", SLOT A is this Saturday and SLOT B is next Tuesday.
- **Date/time format per slot:** `Day, Month Date, time–time` with an **en dash** (U+2013) between the times and no spaces around it. Examples: `Saturday, May 30, 10am–12pm`, `Tuesday, June 2, 2pm–4pm`. Use a concrete date, never a recurring description ("Saturdays 10am-12pm" is wrong).
- **Closing word is `Best,`** No agent name (Gmail signature handles that).
- **Subject line for the reply:** keep the original subject prefixed with `Re:` (set manually since we're creating a fresh draft, not replying inline).

**Adapt the template based on what the prospect said in their message:**

- **Prospect just asked for general info or a tour** (most common): use the template verbatim with the next slot filled in.
- **Prospect asked a specific question** (e.g., "Is it pet friendly?", "What's the parking?"): flag for the agent to answer manually. Draft the standard template but ALSO surface the question to the agent: "Mariah asked about pet policy, you'll want to answer that before sending."

**Important formatting rules for the draft:**

- **No em dashes** (U+2014). En dashes (U+2013) ARE allowed and required inside time ranges (`10am–12pm`).
- **HTML body is the canonical wire format.** Use this exact structure:
  ```html
  <p>Hi <<GREETING>>,</p>
  <p>Thanks for your interest in <<ADDRESS>>! Let me know if you have any questions about the property.</p>
  <ul>
    <li><a href="<<LISTING LINK>>">Listing &amp; Application</a></li>
    <li><a href="<<VIDEO WALKTHROUGH>>">Video Walkthrough</a></li>
  </ul>
  <p><strong>In-Person Showing</strong></p>
  <p>If you're ready to see it in person, I have openings:</p>
  <ul>
    <li><<SLOT A>></li>
    <li><<SLOT B>></li>
  </ul>
  <p>If neither works, send a few times that do and I'll do my best to accommodate.</p>
  <p>Best,</p>
  ```
- **Plain text body** mirrors the HTML: paragraphs separated by blank lines, bulleted lists indented with three spaces and a `-`, the section header rendered as `*In-Person Showing*` so Gmail bolds it. Gmail handles both renderings.
- When Video Walkthrough is empty, that bullet is plain text "Video Walkthrough (Pending)" with no anchor tag.

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

For each approved draft, build the body and append the signature:

1. **Build the HTML body** per the Step 4 template, ending with `<p>Best,</p>`.
2. **Look up the agent's signature** using `<<AGENT EMAIL>>` from Step 1.5:
   - Read `skills/speed-to-lead/signatures/<<AGENT EMAIL>>.html` (lowercase, full email including the @ and domain).
   - If the file exists, append its contents to the HTML body after `<p>Best,</p>`.
   - If the file does NOT exist (or Step 1.5 couldn't resolve the agent), read `skills/speed-to-lead/signatures/_company.html` and append that instead.
3. **Build the plain-text body** the same way: render the email per the Step 4 template ending with `Best,`, then append a plain-text version of the signature. Plain-text signature format mirrors the HTML content, line-by-line, no styling:
   ```
   <Name>
   <Title>
   <Phone> | <Email>
   ```
   For the company fallback, plain-text signature is:
   ```
   Sagareus Property Management
   Real Estate Sales + Management
   (425) 553-0239 | sagareus.com
   2265 116th Ave NE #200-8, Bellevue, WA 98004
   ```
4. **Call `mcp__claude_ai_Gmail__create_draft`** with:
   - `to`: the `<hash@convo.zillow.com>` address (the Zillow relay)
   - `subject`: `Re: <original subject>`
   - `htmlBody`: HTML version with signature appended
   - `body`: plain-text version with signature appended

**Do NOT auto-send.** Always draft.

**Signature notes for the agent:**

- Signatures are HTML snippets in `skills/speed-to-lead/signatures/`, one per agent keyed by lowercase email.
- The fallback `_company.html` lands when no per-agent file matches. That's the right behavior for shared inboxes or new agents who haven't been added to the folder yet.
- To update a signature (new phone, role change, etc.), edit the matching `<email>.html`, commit and push. No deploy required — the skill reads from the repo at runtime.
- Notify the agent in Step 7's close-out if the company fallback was used: "Drafts went out with the Sagareus company signature, not your personal one. To get your personal signature on future drafts, add `<your-email>.html` to `signatures/`."

### Step 6.5: log each draft as a sub-task under Speed to Lead in Asana

Every property that's been through listing prep has a sub-task called **`Respond | ⚡ Speed to Lead`** sitting under its LU sub-task (and sometimes under TP for older properties). That's the container. We log one new sub-task under it per draft so the team has a running record of every lead we've replied to, and the weekly report can pull straight from it.

**Lookup logic — for each lead's property:**

1. We already have the LU sub-task GID from Step 3.
2. List LU's sub-tasks (use `mcp__asana__asana_get_tasks` with `parent` set to LU's GID, or `asana_search_tasks` filtered by parent — whichever is reliably available). Find the one whose name contains the phrase `Speed to Lead` (case-insensitive match; the emoji and `Respond |` prefix may vary slightly).
3. If LU has a Speed to Lead container, use its GID as the parent for the per-draft sub-task.
4. **Fallback:** if LU has no Speed to Lead container (rare, legacy properties), look under the property's TP sub-task. Use the same name match.
5. **If neither has one:** still create the Gmail draft, but surface to the agent: "Couldn't find a Speed to Lead container on this property's LU or TP. Drafted the email, but didn't log it. Please add a `Respond | ⚡ Speed to Lead` sub-task to LU on this property so future drafts log automatically."

**Per-draft sub-task fields:**

- **Parent:** the Speed to Lead container GID from the lookup above.
- **Name:** `<Prospect Full Name> | <YYYY-MM-DD> | <Phone>`. Use today's date in Pacific time. Normalize phone to `XXX-XXX-XXXX` (digits with dashes) in the title regardless of how Zillow formatted it. Example: `Mariah Barlow | 2026-05-28 | 720-227-7450`. If the prospect's first name doesn't parse cleanly (greeting fell back to "Hi there"), use the raw sender header value Zillow surfaced. Never invent a name. **If no phone surfaced from the Zillow contact-info link**, drop the phone segment entirely and use `<Prospect Full Name> | <YYYY-MM-DD>` (do NOT pad with placeholder text).
- **No assignee.** No due date. No custom fields. Description-only log.
- **Description (plain text, `notes` field — NOT `html_notes`):** Asana's `html_notes` only allows a narrow tag list (no `<br>`), which makes line-broken text awkward. Use the plain-text `notes` field with one fact per line. Include only the lines that have values; skip any line whose value is empty/unknown:
  ```
  Prospect: Mariah Barlow
  Zillow relay: hash@convo.zillow.com
  Phone: 720-227-7450
  Specific question: pet policy
  Renter profile: move-in May 22, credit 660–719, no pets, 12mo, 3 occupants
  ```
  - `Prospect` and `Zillow relay` are always included (one or the other is always present, usually both).
  - `Phone` only if Zillow surfaced it in the contact-info URL.
  - `Specific question` only if the prospect's message flagged one in Step 4. Use a short phrase, not the full quote.
  - `Renter profile` only if the "About <name>" block populated. Format as one line: move-in, credit, pets, lease, occupants — comma-separated, en dash inside credit ranges.

**Failure handling:** if the Asana sub-task call fails (network, permission, parent not found), don't block the Gmail draft. Surface the error to the agent in Step 7's close-out: "Drafted N replies in Gmail. Couldn't log K of them to Asana, see error: <message>. Drafts still went out fine."

### Step 7: confirm and close

```
Created N drafts in your Gmail. Review and send when ready.
Logged N entries under Speed to Lead in Asana.

Heads up on any leads that needed a stub (specific questions
asked, missing Asana property, etc.):
  • Lead 2 asked about pet policy, I left a stub for you to fill in.

Anything that didn't draft cleanly:
  • Lead 3 property not found in Asana, sent the reply without
    a listing link.
  • Lead 4 had no Speed to Lead container on LU or TP, draft went
    out but wasn't logged. Please add the container sub-task.
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

If only one showing-slot field is populated, drop back to a single-slot version of the line: "Do you have any questions about the property? I have available time <<SLOT>> if you would like to see it in person. Or is there another time that works better?" If both slots are empty, the draft becomes: "Do you have any questions about the property? What days and times work for you, and I'll match my availability."

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

- No em dashes (U+2014). En dashes (U+2013) are allowed only inside time ranges (`10am–12pm`).
- Plain English, warm but not gushy.
- One sentence per concept, no run-ons.
- End with `Best,` and stop. No agent name, no "Sagareus" footer. Gmail signature handles that.
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
