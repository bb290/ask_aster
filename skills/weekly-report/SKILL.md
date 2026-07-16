---
name: weekly-report
description: Compose the weekly owner update emails a leasing agent sends for their vacant properties, move-out to move-in. FIRST RESPONSE on invocation is always exactly two questions with no preamble ("Batch, or one at a time?" and "Whose reports are you writing? Yourself and...?"), never "which property" — the property worklist is pulled from Asana by assignee. The report has three states, each with its own template. Turnover (move-out to list date, CC the Turn Over Coordinator), Leasing (list date to lease signed, the full activity report), and Pre-Move-In (lease signed to move-in, readiness update). Aster detects the state from Asana, pulls owner name and email plus list date and listing URLs from custom fields on the LU/TP sub-task, plus the latest site-visit comment, then asks the agent one batched question tailored to the state. In the Leasing state it recommends activity-boosting strategies if numbers are soft. Creates a Gmail draft (HTML formatted) addressed to the owner and posts a copy of the email to the property's "Send weekly activity report" sub-task in Asana, rolling the due date forward. Both writes happen after the agent approves the draft. Use when an agent says "weekly report," "weekly update for [property]," or invokes /weekly-report (formerly /weekly-leasing-report). Sagareus standard send-day at the agent level is Tuesday. (The customer-facing SOP says Wednesday as a safeguard so the manager has a buffer day if an agent misses Tuesday. Agents should always aim for Tuesday.) Requires Gmail and Asana MCPs connected.
---

# Weekly Report — agent composer

## FIRST RESPONSE — read this before anything else

When this skill is invoked, your ENTIRE first message is these two questions, immediately, with no preamble, no explanation of how the skill works, and no other questions:

> Weekly reports. Two quick things:
>
> 1. Batch, or one at a time?
> 2. Whose reports are you writing? Yourself and...?

**Never ask "which property."** You find the properties yourself: pull every incomplete Weekly Activity Report sub-task assigned to the named user(s) from Asana. Asking for an address wastes the agent's time and defeats the point of the skill.

The ONLY exception: the agent already named a specific property in their opening message ("weekly report for 1537 Valentine"). Then skip both questions and run the single-property flow on it. If they already answered one of the two questions in their opener, don't re-ask it; ask only the missing one.

Do not narrate what the skill is about to do, that it has three states, or that it pulls from Asana. Just ask the two questions, get the answers, pull the worklist, and go.

## What this is

The leasing agent's weekly owner-update composer, covering the whole vacancy from **move-out to move-in**. The report changes shape with the property's state, three states, three templates (per the Email | Owner - Weekly Activity Report SOP):

1. **Turnover** — between move-out and list date. Site-visit update. CC the Turn Over Coordinator.
2. **Leasing** — between list date and lease signed. The full activity report (numbers, comps, recommendations). This is the original weekly-leasing-report flow, unchanged.
3. **Pre-Move-In** — between lease signed and move-in. Move-in readiness update.

Optimized for low friction: Aster detects the state, pulls context from Asana (list date, last week's report, the latest site-visit comment), then asks the agent one batched question tailored to the state. If Asana MCP is connected, also posts a copy of the email body to the right sub-task as a record.

Sagareus standard cadence: weekly. Agents send on **Tuesday**. The SOP `cs-owner-leasing-activity-inquiry.md` says Wednesday because that's the customer-facing promise (manager has a buffer day to catch any missed reports). At the agent level, target Tuesday.

## When to use

- Agent says "weekly report," "weekly leasing report," "weekly update for [property address]," "weekly activity for [property]"
- Agent invokes `/weekly-report` (or the legacy `/weekly-leasing-report`)
- Any vacancy state between move-out and move-in, including after the lease is signed
- Owner asked mid-week and the agent is composing a one-off update; same flow, just label it "off-cycle update" in the body

## When NOT to use

- The resident has moved in — the weekly report closes at move-in. Anything after that is regular owner communication, not this skill.
- The property is occupied (not vacant)
- The agent is reporting a one-off incident (use `/incident-report`)
- The agent is preparing the listing for the first time (use `/listing-prep`, once that skill exists)

## Voice — Aster speaking to the agent

- Plain English. Casual coworker tone.
- **Never use em dashes.** Use commas, periods, or semicolons.
- No "investor" or "maximize returns" language.
- Don't grill. Ask one batched question, not ten one-by-ones.
- Acknowledge anything the agent already gave in their opening message.

## Voice — the drafted email to the owner

- Same Sagareus rules. No em dashes, plain English, no jargon.
- Warm and matter-of-fact.
- Lead with the activity numbers. Then market context (the two comps). Then recommendations or status. Close with a clear next step or "we'll update again next Tuesday."
- Comparable listings are included as live Zillow links so the owner can click through.

## How it works (high level)

1. Ask the two opening questions (batch or one at a time; whose reports). Properties come from the assignee worklist pull, never from asking for an address. (Exception: a property named in the opener goes straight to single-property flow.)
2. Aster pulls from Asana: the user's incomplete Weekly Activity Report sub-tasks → each property's leasing task → list date custom field, last week's report story, and the latest site-visit comments.
3. Aster determines the state (Turnover, Leasing, or Pre-Move-In) and confirms it with the agent.
4. Aster asks a single batched question tailored to the state (activity numbers + optional comps in Leasing; site-visit details in Turnover and Pre-Move-In).
5. Leasing state only: Aster judges activity. If soft, proposes 1 to 3 strategies and lets the agent pick which to include.
6. Aster drafts the email using the state's template and shows it for review.
7. After approval: Gmail draft to the owner (CC Turn Over Coordinator in the Turnover state), plus the Asana writes (email copy posted to the sub-task, due date rolled to next Tuesday).

## Opening questions (mode select)

The exact opener lives in FIRST RESPONSE at the top of this skill: batch or one at a time, and whose reports (yourself and...?). If the agent names other people, include their vacancies in the pull.

Then pull the worklist: find all **incomplete "Send weekly activity report" sub-tasks assigned to the agent** (plus anyone they're covering for) in the Leasing project, due this week or overdue. That list is the set of vacancies needing a report. Show it to the agent before starting ("You've got 4 this week: [addresses]"). If the pull finds nothing, ask the agent to list their vacancies manually.

### Batch mode (experienced users)

- Run the full Asana lookup (steps 1-5 below) for **every** property on the list first.
- Ask ONE consolidated message: per property, 3-4 lines showing detected state, prefilled site-visit date, pulled comments summary, and only the fields that are actually missing. The agent replies once with everything (numbers for Leasing-state units, corrections, punch-list status).
- Draft ALL emails, present them in one review pass (clearly separated, one preview per property).
- On approval ("all good" or per-property corrections), execute all writes: one Gmail draft per property, one Asana story + due-date roll per property.
- Report completion as a checklist: property, state, draft created, Asana updated.

### One-by-one mode (newer users, coach a little)

- Same worklist pull, then work through properties sequentially, full single-property flow each time.
- Go slower and teach as you go: one short "why" per property, tied to what's in front of them (why the threshold says no price drop this week, why the Turnover state CCs the coordinator, why the subtask never closes at lease signing). One beat of coaching per property, not a lecture.
- Nudge them toward fluency: after a couple of properties, note what they'll be able to skip once they're comfortable ("next time, batch mode will do these three in one pass").
- Between properties, give a one-line progress marker ("2 of 4 done, next up: [address]").

## Asana lookup (do this first, before any questions)

The Asana MCP is required for this skill to do its job well. If it isn't connected, fall back to the manual flow at the bottom of this file.

### Step 1: find the property's leasing task

Real structure (verified 2026-07-16): each property has a parent task **"Leasing | [address]"**, and under it a state-prefixed leasing task, **"LU | [address]"** (lease up), **"TP | [address]"** (tenant placement), or **"PreLease | [address]"** (listed before the outgoing tenant moves out; the Asana Bot renames LU ↔ PreLease based on the `💁 Pre Lease` field). The leasing task lives in project **"Leasing | LU"** (GID `1213171756304238`) and **"Leasing | Human View"** (GID `1208297375044026`).

Fastest lookup: typeahead search for the address, then pick the task whose name starts with `LU |`, `TP |`, or `PreLease |`. Prefer LU/PreLease if both LU and TP exist. If multiple properties match the address fragment, ask the agent to disambiguate.

### Step 2: locate the companion tasks

- The **weekly-report sub-task** sits directly under the leasing task. Two name variants exist in the wild: **"Email | Owner - Weekly Activity Report"** (current template) and **"Send Weekly Activity Report"** (older, sometimes with a trailing space). Match loosely on "Weekly Activity Report".
- **Name suffixes are standing instructions.** A sub-task named "... (no price drop)" means the owner has declined price drops: never recommend one for that property, and lean on comps and non-price levers instead. Surface any suffix to the agent in the confirmation.
- Also locate the **Turn Over task** for the property, named "Turn Over | [address]" (linked from the parent "Leasing | [address]" task or findable by typeahead). Needed for the comment pull: site-visit comments live there until the Turnover Completion Inspection is complete.

### Step 3: pull the data we need

From the leasing task, pull these custom fields. Real field names carry emoji prefixes; match on the name substring, not exact text:

- **`🙆 Owner Name(s)`** — email greeting ("Hi [First Name],"; use first name only).
- **`🙆 Owner e-mail(s)`** — Gmail draft recipient(s).
- **`💁 List Date`** — days on market. Calculated, not stored: `today() - list_date`.
- **`🙆 Preferred Showing Slot 1`** and **`🙆 Preferred Showing Slot 2`** — the standing weekly windows (e.g. "Tuesday 10-11"). Slot 1 drives the site-visit date autofill below.
- **`🙌 Zillow`**, **`🙌 Redfin`**, **`🤖 Sagareus Listing Link`** — the "Listing Links" footer.
- **`🙌 Lease Signed Date`**, **`🙌 Move in Date`**, **`🙌 Tenant Move-Out Date`**, **`💁 Pre Lease`** — state detection (next step).
- **`🤖 # of Inquiries`**, **`🤖 # of Showings`**, **`🤖 # of Applications`** — if populated, prefill this week's numbers in the batched question and ask the agent to confirm rather than re-type.

If any needed field is missing, the batched-ask in the next step surfaces it inline so the agent fills it and remembers to update the Asana custom field for next week's run.

### Step 3b: fallback if the custom fields aren't populated

The custom-field approach is the primary path. If a property hasn't been backfilled yet (the LU/TP sub-task is missing one or more of Zillow Link / Redfin Link / Sagareus Link), use a two-step fallback:

1. Try to scrape any URL labeled "Zillow," "Redfin," or "Sagareus" from last week's "Send weekly activity report" story. The historical format is loose, find lines with the platform name + "link" or "listing" and grab the URL from the same line or the next 1-3 non-empty lines. URLs may be tracking redirects (e.g. `sagareus.com/e3t/...` that resolves to Zillow), accept any `https://` URL associated with the label.
2. If a URL still can't be found, ask the agent inline in the batched-question prompt: "Couldn't find the [Zillow/Redfin/Sagareus] link in Asana. Paste it when you reply, and I'll also remind you to add it to the LU sub-task's custom field so we don't have to ask again."

If the agent overrides any URL (listing got relisted with a new URL, or Asana has stale data), use the override and remind them to update the custom field.

### Step 3c: determine the state (which of the three templates)

The state decides the template, the batched question, and the recipients. Work it out from the custom fields, in this order:

1. **Pre-Move-In** — **`🙌 Lease Signed Date` is set** (and move-in hasn't happened). `🙌 Move in Date` gives the scheduled date for the email.
2. **Leasing** — no lease signed, and **`💁 List Date` is set and is today or in the past**. The unit is on the market. This includes tasks named "PreLease | [address]": the PreLease prefix means listed before the outgoing tenant moved out, and those get the full Leasing activity report. Do NOT confuse the PreLease task prefix with the Pre-Move-In state; they are unrelated.
3. **Turnover** — neither of the above. Move-out has happened (or is imminent) but the unit is not listed yet; turnover work is in progress.

The task-name prefix (`LU |` / `PreLease |` / `TP |`) corroborates but the fields decide. State the conclusion in the confirmation message ("This one looks like it's in **Turnover**, not listed yet") and let the agent correct it in the same reply. The agent's word wins over the inference; if the signals genuinely conflict, just ask which state it is in instead of guessing.

### Step 3d: pull the latest site-visit comments

Per the Weekly Site Visit SOP (updated 2026-07-16), site visits are documented as comments on the dedicated **"Weekly Site Visit / Inspection" sub-task** under the LU task: the agent pastes the Rent Ready checklist from the sub-task description, marks it up, and attaches photos. Pull the most recent user comments (roughly the last 7 days) from that sub-task first with `mcp__asana__asana_get_stories_for_task`. Transition fallback: older properties may still carry site-visit comments directly on the LU/TP task or the TO (Turn Over) task, so if the dedicated sub-task is missing or empty, check both of those too. Ignore system stories (assignments, due-date changes); user comments only.

These comments are the raw material for the site-visit portion of the email; use their substance, not their verbatim text. If comments exist on both tasks this week, use both and note where each came from when confirming with the agent.

### Step 3e: autofill the site-visit date from Preferred Slot 1

The **Site Visit** date in the email autofills from the Preferred Slot 1 custom field. Slot 1 holds a weekday plus a time window (e.g. "Tuesday 10-11"):

1. Parse the weekday out of Slot 1.
2. The site-visit date = the **most recent past occurrence of that weekday, counting today**. (Slot is Tuesday and today is Tuesday? Use today. Today is Friday? Use this past Tuesday.)
3. Prefill that date in the batched question as an assumption the agent can correct ("Site visit: assuming [Tue, Jul 14] from your Slot 1. Correct me if you went a different day.").
4. If Slot 1 is empty or unparseable, ask for the visit date inline and remind the agent to fill the Preferred Slot 1 custom field (see the Scheduling Preferred Slots SOP).

Sanity check: if the latest site-visit comment carries a date, and it disagrees with the computed date by more than a day, prefer the comment's date and say so in the confirmation.

### Step 4: pull last week's report

The "Send weekly activity report" sub-task lives under the LU or TP sub-task. Use `mcp__asana__asana_get_subtasks_for_task` on the LU/TP sub-task GID, find the one named "Send weekly activity report" (or close variant). Then use `mcp__asana__asana_get_stories_for_task` on that sub-task GID to fetch the most recent story (comment). That story is last week's email body.

Use last week's report for context when drafting this week's. Specifically:
- Track week-over-week trends ("showings up from 1 to 3").
- Notice if a strategy was proposed last week and surface its outcome ("price drop suggested last week, did it happen?").
- Don't repeat last week's exact phrasing in this week's email. Reference it lightly.
- **Scrape the owner's greeting name** from prior reports ("Hi Todd,") when the `🙆 Owner Name(s)` field is empty. Owner email cannot be scraped; if the field is empty, ask inline.

**Also read any comments posted since the last report.** Team Leads leave instructions there ("send comps this week," "mention the washer/dryer estimate"). Surface them to the agent in the confirmation ("Courtney asked for comps on this one") and fold them into the draft. Those instructions outrank the default template contents.

### Step 5: confirm to the agent and ask the batched question

After the lookup, surface what you found in 2-3 lines (including the detected state) and ask the agent one batched question. The question depends on the state.

**Leasing state** (the original flow, unchanged):

```
Got it. Looking at Asana for 1537 Valentine Place S, Seattle:
  • List date: [date], so [N] days on market
  • Listing links pulled from custom fields:
      Zillow:   [URL or "(missing — paste when you reply)"]
      Redfin:   [URL or "(missing — paste when you reply)"]
      Sagareus: [URL or "(missing — paste when you reply)"]
  • Last week's report mentioned [one-line summary of the prior story]

If anything is wrong or missing, paste corrections in your reply.

Tell me about this week (funnel order, top to bottom):
  • Inquiries (count)
  • Showings (count)
  • Applications (count)
  • Any prospect feedback or your own observations you'd like to include?

[If days on market < 30:]
Optional: paste up to 2 comparable Zillow listings if you have them. For each:
  URL + bed/bath + sqft + asking rent + days on market + why it's comparable

[If days on market >= 30:]
Required (30+ days on market): paste 2 comparable Zillow listings so we can
sanity-check the pricing is still right. For each:
  URL + bed/bath + sqft + asking rent + days on market + why it's comparable
```

**Turnover state:**

```
Got it. Looking at Asana for [address]:
  • State: Turnover (not listed yet). Correct me if that's wrong.
  • Latest site-visit comment ([date]): [one-line summary]
  • Last week's report: [one-line summary or "none, first report"]

Tell me about this week:
  • Site visit: assuming [Weekday, Mon D] from your Slot 1 ([slot value]).
    Correct me if you went a different day.
  • What you saw on your walk (condition, anything needing attention; I'll
    also lean on your site-visit comments. Observations only, the Turn Over
    Coordinator reports turnover progress.)
  • Any subtasks you created from the visit (or confirm the ones I saw)
  • Who is the Turn Over Coordinator to CC? (skip if I already have it)

Reminder: the email needs at least 2 photos from the visit. I can't attach
them to the draft, so add them in Gmail before sending.
```

**Pre-Move-In state:**

```
Got it. Looking at Asana for [address]:
  • State: Pre-Move-In. Move-in scheduled [date or "(missing — paste when you reply)"].
  • Latest site-visit comment ([date]): [one-line summary]
  • Last week's report: [one-line summary]

Tell me about this week:
  • Site visit: assuming [Weekday, Mon D] from your Slot 1 ([slot value]).
    Correct me if you went a different day.
  • Cleaning: scheduled or completed?
  • Open punch list items and their status
  • Anything new found this week, and the subtasks you created for it
    (I'll also lean on the comments I found on the TO and LU tasks)
```

No activity numbers and no comps in the Turnover and Pre-Move-In states; those belong to Leasing only.

If any of the lookup fields came back empty, the confirmation message above shows "(missing — paste when you reply)" inline so the agent fills it in. Don't ask separately.

If the agent overrides the list date or any of the three URLs, use the override and don't try to update the Asana custom field automatically. Remind them once: "Heads up, that override won't update the Asana custom field. Worth pasting it in there too so we don't have to ask again."

If the days-on-market threshold is hit (30+) and the agent only provides one comp, push for a second before drafting. Two comps is a hard requirement at that age. If they truly cannot find a second after a real attempt, accept it but note in the email body that we recommend pulling fresh comps next week.

## Strategy recommendations — driven by hard activity thresholds (Leasing state only)

Sourced from `sops/lease up/email-owner-weekly-activity-report.md` and `2-email-owner-market-rent-prelisting.md`. The SOP defines clear thresholds, no judgment-call vibes.

### Threshold logic

Look at the week's numbers and apply this gate:

- **More than 10 inquiries OR more than 5 showings:** activity is adequate. Do NOT recommend a price drop or any other strategy. Email is a clean status report.
- **More than 10 inquiries AND fewer than 5 showings:** likely an agent-conversion issue. Recommend a response-template review (see `sops/lease up/11-respond-speed-to-lead.md`). Don't drop the price.
- **10 or fewer inquiries AND 5 or fewer showings:** activity is soft. **Default recommendation: drop the asking rent by at least $100.** Then offer the agent a menu of additional moves to include.

### The full recommendations menu (offer when activity is soft)

Always present the price drop as the default move when the threshold triggers it. Then ask the agent which of the following to also include in the email. The agent picks any combo (or none beyond the price drop):

- **Drop the asking rent by $100 or more** (default when soft activity, see threshold above)
- **Decrease the security deposit** (recommend half of one month's rent; standard is one month rent less $100)
- **Add a rent incentive / move-in special** (default $500 at lease signing; alternatives are $1,000 or 1 month free rent). Note: rent credits cannot be applied to security deposit or last month's rent under WA trust-fund law.
- **Drop the last month's rent requirement** (already not collected in Tacoma; can be dropped elsewhere with owner approval)
- **Increase the pet weight limit** (default cap is 30 lbs; recommend doubling to 60 lbs)
- **Expand pet policy** (allow pets where currently disallowed, or expand pet types)
- **Reduce income requirement** (3x rent → 2.5x → 2x)
- **Reduce credit requirement** (700 → 650 → 600)
- **Property improvements** (LVP flooring, interior paint, minor upgrades). Owner cost, longer timeline.
- **Photo refresh** (re-shoot or re-stage; especially if listing is older than 14 days with no inquiries)
- **Listing copy refresh** (rewrite to emphasize differentiated features)
- **Video tour add** (request from Brandtegic, see `sops/lease up/13-request-video-from-brandtegic.md`)
- **Open house** (schedule a Saturday slot to compress showings into one window)

### Triple-check listing (when fewer than 5 showings)

Per SOP, if showings are below 5, also remind the agent to verify the listing itself before recommending strategies. The skill should mention this once and move on (the agent does the actual check):

> "Heads up, with fewer than 5 showings this week, double-check the listing fundamentals: Zillow active, Redfin active, photos quality, amenities checked in Buildium (Washer/Dryer, Cats, Dogs, Pet Friendly), and listing remarks follow the Rental Listing Standards template."

### Format for proposing strategies to the agent

After the agent answers the batched question, evaluate the threshold and respond.

**Primary format: numbered list.** Most Sagareus agents use Claude.ai web or Claude Desktop, which don't reliably render interactive multi-select UI. Use a numbered list and ask the agent to reply with the numbers they want included.

Example response:

```
Looks soft this week (4 inquiries, 1 showing, 0 apps).
Default: drop the asking rent by $100.

Pick any additional moves to include in the email. Reply with the numbers
(e.g. "2, 5, 8") or say "default only":

  1. Decrease the security deposit (half of one month's rent)
  2. Add a $500 move-in rent credit (or $1,000 or 1 month free)
  3. Drop the last month's rent requirement
  4. Increase pet weight limit to 60 lbs (double the standard 30 lb cap)
  5. Expand pet policy
  6. Reduce income requirement (3x → 2.5x → 2x)
  7. Reduce credit requirement (700 → 650 → 600)
  8. Photo refresh
  9. Listing copy refresh
  10. Video tour add (Brandtegic)
  11. Open house

(Heads up: with 1 showing, also worth double-checking the listing
fundamentals before next week. Zillow + Redfin active, photos sharp,
amenities checked in Buildium, listing copy follows the template.)
```

**Optional upgrade: interactive multi-select.** If the calling assistant has access to a real multi-select UI tool (such as `AskUserQuestion` in Claude Code), use it instead of the numbered list. Same options, rendered as checkboxes. Default option (price drop) pre-checked if the tool supports defaults. This will only fire for Claude Code users for now; treat it as a nice-to-have, not the main path.

The "triple-check listing" reminder fires whenever showings are below 5, regardless of which format you used to present the menu.

If activity is adequate (>10 inquiries OR >5 showings), do not recommend strategies. Don't manufacture concerns.

## Comparable Zillow listings — conditional

Already requested in the batched question. Two rules:

- **Days on market < 30:** comps are optional. Agent can provide zero, one, or two. Include whatever they give you in the email's market context section, or omit the section entirely if they gave zero.
- **Days on market >= 30:** comps are required, minimum 2. The 30-day age makes pricing the most likely lever, so we always cross-check against the market at that point. Push for two before drafting. If the agent truly can't find two after looking, accept it but note in the email body that fresh comps are needed next week.

## The drafted email

After everything is gathered, compose the email as HTML using the template for the property's state. Show the rendered preview to the agent for review before any writes. The email goes out as a Gmail draft via `mcp__claude_ai_Gmail__create_draft`. The body uses HTML for bold + underline section headers and bullet lists (same pattern as listing-prep).

### Turnover template (move-out to list date)

**Subject:** `Site Visit | [Date Range] | [Property Address]`
**CC:** the Turn Over Coordinator, always.

```html
<p>Hi <<Owner First Name>>,</p>

<p><b><u>Site Visit: <<Date Visited>></u></b></p>

<p><<What the agent SAW on the walk, 2-4 plain sentences: condition of the unit, anything that needs attention, anything that changed since last week. Observations only.>></p>

<p><<If any subtasks were created from the visit:>></p>
<ul>
  <li><<Subtask 1, plain language, e.g. "Flagged a slow drain in the hall bath, subtask created, due July 24.">></li>
  <li><<Subtask 2>></li>
</ul>

<p>Photos from this week's visit are attached.</p>

<p>Next update: Tuesday, <<next Tuesday's date>>.</p>

<p>Thanks,</p>
```

**Hard rule for this template: the Leasing Agent reports what they saw, nothing more.** Turnover progress, schedules, vendor status, and completion estimates belong to the Turn Over Coordinator (who is CC'd and provides those updates separately). Never write "turnover is on track," an expected list date, or any other status claim in this email; if the agent's answer includes turnover-status content, keep only the direct observations.

The photos line is a promise the agent fulfills in Gmail; always remind them at hand-off that the draft needs at least 2 photos attached before sending.

### Pre-Move-In template (lease signed to move-in)

**Subject:** `Site Visit | [Property Address]`

```html
<p>Hi <<Owner First Name>>,</p>

<p><b>Move In Scheduled:</b> <<Date>></p>

<p><b>Site Visit:</b> <<Date Visited>></p>

<p><b><u>Move-In Readiness</u></b></p>
<ul>
  <li>Cleaning: <<scheduled or completed, with date>></li>
  <li><<Open punch list items and their status>></li>
  <li><<Anything new found this week and the subtasks created to address it. Omit if nothing new.>></li>
</ul>

<p>Thanks,</p>
```

### Leasing template (list date to lease signed) — the original flow, unchanged

**Subject:**

```
Weekly Leasing Update | [Property Address] | Week ending [Date]
```

**HTML body template (Leasing):**

```html
<p>Hi <<Owner First Name>>,</p>

<p>Quick update on <<Property Address>> for the week ending <<Date>>.</p>

<p><b><u>This Week's Activity</u></b></p>
<ul>
  <li>Inquiries: <<count>></li>
  <li>Showings: <<count>></li>
  <li>Applications: <<count>></li>
  <li>Days on market: <<days>></li>
</ul>

<p><<Optional: prospect feedback or agent observations from the batched answer. Omit this paragraph if the agent skipped this field.>></p>

<p><b><u>Market Context</u></b></p>
<p>Comparable rentals:</p>
<ul>
  <li><<Comp 1 summary>>. <a href="<<Comp 1 link>>"><<Comp 1 link>></a></li>
  <li><<Comp 2 summary, if provided>>. <a href="<<Comp 2 link>>"><<Comp 2 link>></a></li>
</ul>

<<Omit Market Context entirely if zero comps were provided.>>

<p><b><u>Listing Update</u></b></p>

<<Pick the form that matches activity:>>

<<If activity is adequate (>10 inquiries OR >5 showings):>>
<p>Holding price another week. Activity is healthy.</p>

<<If activity is soft (<=10 inquiries AND <=5 showings):>>
<p>We're dropping the asking rent by $<<delta>> to drive activity.</p>

<<If the agent picked any additional strategies, include this block:>>
<p>We also recommend the following moves, pending your approval:</p>
<ul>
  <li><<Strategy 1 in plain language, e.g. "Decreasing the security deposit to half of one month's rent.">></li>
  <li><<Strategy 2 in plain language>></li>
  <li><<Strategy 3 in plain language>></li>
</ul>
<p>Reply with which of these you'd like us to implement.</p>

<<If conversion problem (>10 inquiries AND <5 showings):>>
<p>Plenty of inquiries this week but showings didn't keep pace. Reviewing how we respond to leads to make sure prospects are getting on the calendar quickly.</p>

<p>Next update: Tuesday, <<next Tuesday's date>>.</p>

<p><b><u>Listing Links</u></b></p>
<ul>
  <li>Zillow: <a href="<<Zillow URL>>"><<Zillow URL>></a></li>
  <li>Redfin: <a href="<<Redfin URL>>"><<Redfin URL>></a></li>
  <li>Sagareus: <a href="<<Sagareus URL>>"><<Sagareus URL>></a></li>
</ul>

<p>Thanks,</p>
```

### Plain-text fallback (for the Gmail `body` field)

Same content, with `<b><u>HEADER</u></b>` rendered as `HEADER` on its own line, lists rendered as `• item`, paragraphs separated by blank lines. The plain-text version is for clients that don't render HTML.

### Rules

Universal (all three templates): no em dashes, no corporate filler, end with `<p>Thanks,</p>` and stop (no name, no "Sagareus" footer; the Gmail signature handles it), and the "Next update: Tuesday" line is present unless this is an off-cycle update less than 4 days from the regular Tuesday cadence. The rest of these rules are for the Leasing template:

- **Section headers** (This Week's Activity / Market Context / Listing Update / Listing Links) are bold + underlined via `<b><u>...</u></b>`.
- **Lists** use `<ul><li>...</li></ul>`.
- **No em dashes** anywhere in the prose.
- **No corporate filler.**
- The **Listing Links** section at the bottom is always present. All three URLs come from LU/TP custom fields. If any URL is missing in Asana, the batched-question prompt asks the agent to paste it.
- End with `<p>Thanks,</p>` and stop. No agent name, no "Sagareus" footer. Gmail signature handles that.
- The "Next update: Tuesday" line is always present (unless this is an off-cycle update less than 4 days from the regular Tuesday cadence).
- The "Listing update" section is **always present**. Healthy weeks read "Holding price another week. Activity is healthy." Soft weeks declare the price drop as automatic ("We're dropping the asking rent by $X") and then list any additional agent-picked strategies as recommendations pending owner approval.
- **Price drop is automatic.** All other strategy moves require owner approval and must be presented as recommendations, not as things already happening.
- Comps are optional below 30 days on market, required at 30+ days. Include whatever the agent provided.
- Price strategies are described as **dollar changes** ("drop $100"), not target rents ("$2,400/mo").
- End with `Thanks,` (or `Best,`). No name, no "Sagareus" line. The agent's Gmail signature appends below.
- The "Next update: Tuesday" line is always present (unless this is an off-cycle update less than 4 days from the regular Tuesday cadence).

## Show the assembled email to the agent for review

Display the full draft (rendered preview, not raw HTML). Ask:

> "Look good? If yes, I'll create the Gmail draft addressed to [owner email], post a copy on the Asana sub-task, and roll the sub-task's due date to next Tuesday. Tell me what to change otherwise."

Wait for explicit confirmation. Do NOT proceed to writes until the agent confirms.

## Gmail draft (after agent approves)

1. Confirm Gmail MCP is connected (look for `mcp__claude_ai_Gmail__create_draft` or equivalent).
2. Call `mcp__claude_ai_Gmail__create_draft` with:
   - `to`: [Owner Email pulled from Asana custom field, or the agent's inline override]
   - `cc`: the Turn Over Coordinator's email, **Turnover state only** (from the agent's batched answer; no CC in the other two states)
   - `subject`: per the state's template (Turnover: "Site Visit | [Date Range] | [Property Address]"; Leasing: "Weekly Leasing Update | [Property Address] | Week ending [Date]"; Pre-Move-In: "Site Visit | [Property Address]")
   - `htmlBody`: the state's HTML template filled in
   - `body`: the plain-text fallback version
3. Capture the draft creation timestamp and the draft ID returned.
4. Turnover state: remind the agent that the draft needs at least 2 site-visit photos attached in Gmail before sending.

If Gmail MCP isn't connected, surface the issue ("Can't create the draft without Gmail connected, here's the email body for manual paste") and proceed to the Asana step.

## Asana writes (after agent approves)

The "Send weekly activity report" sub-task is **recurring**, not one-off. The same sub-task is reused every week, in all three states, until the resident moves in. Two writes per run:

### Write 1: post the email body as a story (comment)

1. Use the "Send weekly activity report" sub-task GID (located during the Asana lookup).
2. Post the email body using `mcp__asana__asana_create_task_story` with the plain-text version (Asana stories don't render HTML well).
3. Format the story as:

```
Weekly activity report drafted [timestamp, agent's local TZ if known]
Gmail draft: [link if available]

---

[Full email body, plain-text version]
```

### Write 2: roll the sub-task due date to next Tuesday

1. Use `mcp__asana__asana_update_task` with:
   - `task_id`: the "Send weekly activity report" sub-task GID
   - `due_on`: next Tuesday's date in YYYY-MM-DD format

2. **Do NOT mark the sub-task complete.** The agent doesn't mark it complete either. The same sub-task lives through the entire vacancy, with the due date rolling forward each Tuesday until the resident moves in. It does NOT close at lease signing or when a move-in is scheduled (changed 2026-07-15); the move-in workflow closes it, not this skill.

3. Confirm to the agent: "Posted the email body as a comment and rolled the due date to [next Tuesday's date]. The sub-task stays open for next week's report."

If any Asana step fails, surface a one-liner ("Couldn't update Asana automatically, here's what to do manually") and re-output what the agent needs to do by hand.

## Edge cases

- **State is ambiguous or the signals conflict:** ask the agent which of the three states the property is in. Never guess between templates; the wrong one reads badly to the owner.
- **State changed mid-week (listed yesterday, lease signed this morning):** use the state as of the moment the report is drafted.
- **No site-visit comment found this week:** flag it to the agent ("I don't see a site-visit comment this week; per the Weekly Site Visit SOP every visit gets one"). Draft from their answers anyway, and remind them to add the comment.
- **Turn Over Coordinator email unknown (Turnover state):** ask inline in the batched question; don't send the state's report without the CC.
- **List date not in Asana:** ask the agent inline.
- **Last week's report missing (first ever weekly update for this property):** mention it ("first weekly update on this one") and skip the comparison.
- **Multiple parent tasks match the address:** ask the agent which one is correct.
- **Parent task doesn't exist for the property:** "Couldn't find a parent task for [property] in the Leasing project. Either it hasn't been onboarded for leasing, or the task name doesn't include the address. Please check Asana." Then offer to do the manual flow.
- **Activity is zero in a healthy market:** still send the email. Don't bury bad news. Recommend strategies.
- **Agent provides zero or one comp:** fine, comps are optional. Use whatever they gave you. If zero, omit the market context section from the email entirely.
- **Off-cycle update mid-week:** swap the opening line with "Quick update on where things stand for [Property]." Drop "Next update: Tuesday" if the regular update is more than 4 days out.

## Manual flow (if Asana MCP isn't connected)

If the calling assistant doesn't have Asana, the skill still works, just with more questions:

1. Ask for list date.
2. Compute days on market.
3. Ask the same batched question for this week's activity + comps.
4. Ask if there was a prior weekly report and any context worth pulling forward.
5. Output the email body for manual paste. No Asana write.

## New AI users (non-negotiable behavior)

Most of the team is new to working with AI. The fastest way to lose them is to feel like a form or a flaky robot. So:

- **Do the work, then talk.** Look things up before asking. Never ask for anything Asana, Gmail, or the SOPs can tell you.
- **One batched ask, maximum.** When you genuinely need input, gather it in a single short message, never a series of one-at-a-time questions.
- **No narration.** Don't announce what you're about to do ("Let me search Asana..."). No walls of text, no raw IDs, no error traces.
- **Fail gracefully.** If a connector is missing, one line: what to connect (claude.ai Settings, then Connectors) plus the manual path meanwhile. If something errors twice, stop retrying and give the manual next step in a line or two.
- **Never make anyone repeat themselves.** Anything said earlier in the conversation counts as answered.

## Out of scope

- Sending the email. Aster only drafts. Agent reviews and sends.
- Marking the "Send weekly activity report" sub-task complete. The sub-task is recurring and stays open through the entire vacancy. The lease-up workflow handles closing it after the lease signs.
- Posting to any project other than Leasing.
- Composing multi-property batch updates. One property per skill invocation.

## Limitations to flag if asked

- v0. The skill does not pull live activity numbers from Buildium or Zillow APIs. Agent provides this week's numbers from their own tracking.
- Asana lookup is limited to list date and the prior week's report story. Owner email is not pulled (was bug-prone, dropped in v0).
- Strategy recommendations are heuristic. Brittany has final say on price changes or fee waivers.
- Aster outputs the email as text. Agent copy-pastes into Gmail and sends manually.
