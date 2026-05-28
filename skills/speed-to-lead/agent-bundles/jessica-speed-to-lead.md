---
name: speed-to-lead
description: Scans my Gmail for new Zillow leads (unread emails from `*@convo.zillow.com` with subject pattern "is requesting information about"), parses each one, looks up the property in Asana for the listing URLs and preferred showing slots, drafts a personalized in-thread reply with my signature attached, and creates a Gmail draft per lead for me to review and send. Never auto-sends. Use when I say "check Zillow leads," "respond to my new leads," "speed to lead," or invoke /speed-to-lead. Requires Gmail and Asana connectors enabled.
---

# Speed to Lead — Jessica Angel

## What this is

My inbound-lead response composer. Reads unread Zillow inquiries from Gmail, drafts personalized replies grounded in the Speed to Lead SOP, files them as in-thread Gmail drafts, and logs each one as a sub-task in Asana under the property's `Respond | ⚡ Speed to Lead`. I review and send each draft. Nothing auto-sends.

## Voice rules

- **Never use em dashes.** Commas, periods, or semicolons.
- Plain English, warm but not gushy.
- The draft replies are addressed to the PROSPECT (a stranger), not internal.

## Workflow

### Step 1: find unread Zillow leads in Gmail

Use `mcp__claude_ai_Gmail__search_threads` with:

```
is:unread from:convo.zillow.com subject:"is requesting information about" newer_than:7d
```

The `newer_than:7d` filter is intentional. Anything older should be handled manually.

If no leads come back, say so and stop.

### Step 2: parse each lead

For each thread, use `mcp__claude_ai_Gmail__get_thread` with `messageFormat: "FULL_CONTENT"`. Extract:

| Field | Where it lives |
|---|---|
| Prospect first name | First word of subject, before "is requesting" |
| Prospect full name | Sender line |
| Convo email (Zillow relay) | The `<hash@convo.zillow.com>` address |
| **Message ID** | The `id` of the most recent message in the thread, needed for in-thread reply |
| Property address | Subject line, after "is requesting information about " |
| Prospect message | Body line(s) right after "<Full Name> says:" |
| Phone (if shown) | Inside "See [name]'s phone contact info" link, `&phone=...` URL param, URL-decode |
| Move-in date, credit, pets, lease length, occupants | "About <name>" block if present (Zillow Renter Profile) |

### Step 2.5: dedup check

For each thread, examine the message list:

- **1 message:** clean lead, proceed.
- **2+ messages, one has `DRAFT` label:** already drafted in a prior run. Skip drafting + skip Asana sub-task. Report under "already drafted."
- **2+ messages, none have `DRAFT` label:** agent or prospect already engaged. Skip. Report under "already engaged."

### Step 3: look up the property in Asana

Use `mcp__asana__asana_search_tasks` to find the listing by the address. Returns the LU sub-task directly. From LU, pull:

- 🤖 Sagareus Listing Link
- Video Walkthrough (write "Pending" if empty)
- Preferred Showing Slot 1 + Preferred Showing Slot 2

If property isn't found, surface to me and ask whether to proceed without listing info.

### Step 4: draft the reply

```
Hi <<GREETING>>,

Thanks for your interest in <<ADDRESS>>! Let me know if you have any questions about the property.

   - Listing & Application       (hyperlink: <<LISTING LINK>>)
   - Video Walkthrough           (hyperlink: <<VIDEO WALKTHROUGH>>, or plain text "Video Walkthrough (Pending)" if empty)

In-Person Showing                (bold)

If you're ready to see it in person, I have openings:

   - <<SLOT A>>
   - <<SLOT B>>

If neither works, send a few times that do and I'll do my best to accommodate.

Best,
```

**Rules:**
- **Greeting:** `Hi <First Name>,` when the prospect's name parses cleanly. Otherwise `Hi there,`.
- **No em dashes.** En dashes (U+2013) ARE allowed inside time ranges (`10am–12pm`).
- **SLOT A / SLOT B:** next upcoming occurrences of Preferred Showing Slot 1 and 2, rendered chronologically (sooner is A). Format: `Day, Month Date, time–time`. Example: `Saturday, May 30, 10am–12pm`.
- **Video Walkthrough fallback:** if empty in Asana, render as plain text `Video Walkthrough (Pending)` with no link.
- **In-Person Showing** is bold (`<strong>` in HTML).
- **Specific question** (pet policy, parking, etc.): draft the standard template AND surface the question for me to answer manually before sending.

**HTML wire format:**

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

### Step 5: print batch summary, proceed immediately

Print a one-line summary per fresh lead, then fire Step 6 + Step 6.5 for every lead. **Do not pause for confirmation.** Gmail draft itself is the review gate.

### Step 6: create the Gmail draft (in-thread, with my signature)

For each draft:

1. Build HTML body per Step 4, ending with `<p>Best,</p>`.
2. **Append my signature** (this exact HTML block) after `<p>Best,</p>`:

```html
<br>
<br>
<table cellpadding="0" cellspacing="0" border="0" style="font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #1a1a1a;">
  <tr>
    <td style="border-left: 3px solid #0B4F42; padding: 0 0 0 12px;">
      <div style="font-weight: bold; font-size: 14px; color: #1a1a1a; line-height: 1.4;">Jessica Angel</div>
      <div style="color: #0B4F42; font-size: 13px; line-height: 1.4;">Leasing Agent</div>
      <div style="font-size: 13px; line-height: 1.4; color: #1a1a1a;">
        <a href="tel:+14259193159" style="color: #1a1a1a; text-decoration: none;">(425) 919-3159</a>
        &nbsp;|&nbsp;
        <a href="mailto:jessica@sagareus.com" style="color: #1a1a1a; text-decoration: none;">jessica@sagareus.com</a>
      </div>
    </td>
  </tr>
</table>
```

3. Build plain-text body the same way, with this signature appended after `Best,`:

```
Jessica Angel
Leasing Agent
(425) 919-3159 | jessica@sagareus.com
```

4. Call `mcp__claude_ai_Gmail__create_draft` with:
   - `to`: the Zillow relay address
   - `subject`: `Re: <original subject>`
   - `htmlBody`: HTML version with signature
   - `body`: plain-text version with signature
   - **`replyToMessageId`: the parsed Message ID from Step 2**

`replyToMessageId` is what makes the draft land IN the original thread. Without it, the reply floats loose in Drafts.

**Never auto-send.** Always draft.

### Step 6.5: log each draft as an Asana sub-task

Every property has a sub-task called `Respond | ⚡ Speed to Lead` under its LU sub-task. Log each draft there.

1. Use `mcp__asana__asana_get_task` on the LU GID with `opt_fields: subtasks.name,subtasks.gid` to list LU's sub-tasks.
2. Find the one whose name contains `Speed to Lead` (case-insensitive). That's the container.
3. **Fallback:** if LU has no Speed to Lead container, look under TP. If neither, surface to me and keep going.

**Sub-task fields:**
- **Parent:** the container GID.
- **Name:** `<Prospect Full Name> | <YYYY-MM-DD> | <Phone>`. Normalize phone to `XXX-XXX-XXXX`. If no phone, drop that segment: `<Name> | <YYYY-MM-DD>`.
- **No assignee. No due date. No custom fields.**
- **Description (plain text via `notes` field, NOT `html_notes`):**

```
Prospect: <Full Name>
Zillow relay: <hash@convo.zillow.com>
Phone: <XXX-XXX-XXXX>
Specific question: <short phrase>
Renter profile: <move-in date, credit, pets, lease, occupants>
```

Include only lines that have values. Skip blanks.

### Step 7: close-out report

```
Drafted N replies in Gmail. Review and send when ready.
Logged N entries under Speed to Lead in Asana.

Stubs to address before sending:
  • <Prospect> asked about <topic>.

Skipped because a draft already exists (dedup, safe to re-run):
  • (none, or list)

Skipped because the thread already has activity:
  • (none, or list)

Skipped because property wasn't found in Asana:
  • (none, or list)

Skipped because Speed to Lead container missing on LU/TP:
  • (none, or list)
```

Show every bucket. Empty buckets render as `(none)`.

## Edge cases

- **No unread leads:** tell me, suggest retry later.
- **Property not in Asana:** ask before drafting without listing info.
- **Specific question from prospect:** stub the standard reply AND flag for me to answer.
- **Renter profile red flags (low credit, etc.):** still send standard reply (Fair Housing). Flag for my awareness only.
- **Gmail or Asana connector not connected:** surface a clear message telling me to enable it.

## Out of scope

- Sending replies. Always draft, never send.
- Auto-scheduling on Google Calendar.
- Following up after no response.
- Pre-screening based on Renter Profile.
