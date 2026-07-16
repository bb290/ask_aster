---
name: weekly-leasing-report
description: Compose the weekly leasing activity email a leasing agent sends to a property owner. Aster pulls owner first name and email plus list date and listing URLs from Asana custom fields on the LU/TP sub-task, then asks the agent one batched question for this week's activity numbers, any prospect or agent feedback, and optionally up to two comparable Zillow listings. Recommends activity-boosting strategies if numbers are soft. Creates a Gmail draft (HTML formatted with bold + underline section headers and bullet lists) addressed to the owner. Also posts a copy of the email to the property's "Send weekly activity report" sub-task in Asana for the record. Both writes happen after the agent approves the draft. Use when an agent says "weekly leasing report," "weekly update for [property]," or invokes /weekly-leasing-report. Sagareus standard send-day at the agent level is Tuesday. (The customer-facing SOP says Wednesday as a safeguard so the manager has a buffer day if an agent misses Tuesday. Agents should always aim for Tuesday.) Requires Gmail and Asana MCPs connected.
---

# Weekly Leasing Activity Report — agent composer

## What this is

The leasing agent's weekly client-update composer. Optimized for low friction: Aster pulls list date and last week's report from Asana for context, then asks the agent one batched question for this week's numbers and any optional comps. Outputs the email as formatted text for the agent to copy-paste into Gmail. If Asana MCP is connected, also posts a copy of the email body to the right sub-task as a record.

Sagareus standard cadence: weekly. Agents send on **Tuesday**. The SOP `cs-owner-leasing-activity-inquiry.md` says Wednesday because that's the customer-facing promise (manager has a buffer day to catch any missed reports). At the agent level, target Tuesday.

## When to use

- Agent says "weekly leasing report," "weekly update for [property address]," "weekly activity for [property]"
- Agent invokes `/weekly-leasing-report`
- Owner asked mid-week and the agent is composing a one-off update; same flow, just label it "off-cycle update" in the body

## When NOT to use

- The unit is leased — that's a "lease finalized" notification, not a weekly report
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

1. Agent gives the property address (often in the opener).
2. Aster pulls from Asana: parent task by address → LU or TP sub-task → list date custom field and last week's "Send weekly activity report" story.
3. Aster confirms what it found and asks a single batched question for this week's activity + optional comps.
4. Aster judges activity. If soft, proposes 1 to 3 strategies and lets the agent pick which to include.
5. Aster drafts the email and outputs it as formatted text in a clean copy-paste block.
6. If Asana MCP is connected, also posts a copy of the email body as a story on the "Send weekly activity report" sub-task. Agent copy-pastes the email into Gmail manually.

## Asana lookup (do this first, before any questions)

The Asana MCP is required for this skill to do its job well. If it isn't connected, fall back to the manual flow at the bottom of this file.

### Step 1: find the property's parent task

Property tasks live in the **Leasing** project. Each parent task is named with the property address.

> ⚠ TODO: paste the Leasing project GID here once provided. Until then, use `mcp__asana__asana_search_tasks` with the property address as the query and filter results to tasks in a project whose name contains "Leasing." If multiple matches, ask the agent to disambiguate.

### Step 2: find the LU or TP sub-task

Under the parent task, look for a sub-task named "LU" (lease up) or "TP" (tenant placement). Use `mcp__asana__asana_get_subtasks_for_task` (or whichever Asana tool surfaces sub-tasks) on the parent task GID. Some properties have LU, some have TP, some may have both. Prefer LU if both exist, otherwise TP.

### Step 3: pull the data we need

From the LU/TP sub-task, pull these custom fields:

- **Owner First Name** — used in the email greeting ("Hi [First Name],").
- **Owner Email** — used as the Gmail draft recipient.
- **List Date** — used to calculate days on market.
- **Zillow Link**, **Redfin Link**, **Sagareus Link** — used in the "Listing links" footer of the email.
- **Days on market** — calculated, not stored. `today() - list_date`.

All listed fields are pulled. If any are missing, the batched-ask in the next step surfaces the missing field inline so the agent fills it and remembers to update the Asana custom field for next week's run.

### Step 3b: fallback if the custom fields aren't populated

The custom-field approach is the primary path. If a property hasn't been backfilled yet (the LU/TP sub-task is missing one or more of Zillow Link / Redfin Link / Sagareus Link), use a two-step fallback:

1. Try to scrape any URL labeled "Zillow," "Redfin," or "Sagareus" from last week's "Send weekly activity report" story. The historical format is loose, find lines with the platform name + "link" or "listing" and grab the URL from the same line or the next 1-3 non-empty lines. URLs may be tracking redirects (e.g. `sagareus.com/e3t/...` that resolves to Zillow), accept any `https://` URL associated with the label.
2. If a URL still can't be found, ask the agent inline in the batched-question prompt: "Couldn't find the [Zillow/Redfin/Sagareus] link in Asana. Paste it when you reply, and I'll also remind you to add it to the LU sub-task's custom field so we don't have to ask again."

If the agent overrides any URL (listing got relisted with a new URL, or Asana has stale data), use the override and remind them to update the custom field.

### Step 4: pull last week's report

The "Send weekly activity report" sub-task lives under the LU or TP sub-task. Use `mcp__asana__asana_get_subtasks_for_task` on the LU/TP sub-task GID, find the one named "Send weekly activity report" (or close variant). Then use `mcp__asana__asana_get_stories_for_task` on that sub-task GID to fetch the most recent story (comment). That story is last week's email body.

Use last week's report for context when drafting this week's. Specifically:
- Track week-over-week trends ("showings up from 1 to 3").
- Notice if a strategy was proposed last week and surface its outcome ("price drop suggested last week, did it happen?").
- Don't repeat last week's exact phrasing in this week's email. Reference it lightly.

### Step 5: confirm to the agent and ask the batched question

After the lookup, surface what you found in 2-3 lines and ask the agent one batched question. Format:

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

[If days on market < 28:]
Optional: paste up to 2 comparable Zillow listings if you have them. For each:
  URL + bed/bath + sqft + asking rent + days on market + why it's comparable

[If days on market >= 28:]
Required (28+ days on market): paste 2 comparable Zillow listings so we can
sanity-check the pricing is still right. For each:
  URL + bed/bath + sqft + asking rent + days on market + why it's comparable
```

If any of the lookup fields came back empty, the confirmation message above shows "(missing — paste when you reply)" inline so the agent fills it in. Don't ask separately.

If the agent overrides the list date or any of the three URLs, use the override and don't try to update the Asana custom field automatically. Remind them once: "Heads up, that override won't update the Asana custom field. Worth pasting it in there too so we don't have to ask again."

If the days-on-market threshold is hit (28+) and the agent only provides one comp, push for a second before drafting. Two comps is a hard requirement at that age. If they truly cannot find a second after a real attempt, accept it but note in the email body that we recommend pulling fresh comps next week.

## Strategy recommendations — driven by hard activity thresholds

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

- **Days on market < 28:** comps are optional. Agent can provide zero, one, or two. Include whatever they give you in the email's market context section, or omit the section entirely if they gave zero.
- **Days on market >= 28:** comps are required, minimum 2. The 28-day age makes pricing the most likely lever, so we always cross-check against the market at that point. Push for two before drafting. If the agent truly can't find two after looking, accept it but note in the email body that fresh comps are needed next week.

## The drafted email

After everything is gathered, compose the email as HTML. Show the rendered preview to the agent for review before any writes.

The email goes out as a Gmail draft via `mcp__claude_ai_Gmail__create_draft`. The subject is `Weekly Leasing Update — [Property Address] — Week ending [Date]`. The body uses HTML for bold + underline section headers and bullet lists (same pattern as listing-prep).

### Subject line

```
Weekly Leasing Update | [Property Address] | Week ending [Date]
```

### HTML body template

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

- **Section headers** (This Week's Activity / Market Context / Listing Update / Listing Links) are bold + underlined via `<b><u>...</u></b>`.
- **Lists** use `<ul><li>...</li></ul>`.
- **No em dashes** anywhere in the prose.
- **No corporate filler.**
- The **Listing Links** section at the bottom is always present. All three URLs come from LU/TP custom fields. If any URL is missing in Asana, the batched-question prompt asks the agent to paste it.
- End with `<p>Thanks,</p>` and stop. No agent name, no "Sagareus" footer. Gmail signature handles that.
- The "Next update: Tuesday" line is always present (unless this is an off-cycle update less than 4 days from the regular Tuesday cadence).
- The "Listing update" section is **always present**. Healthy weeks read "Holding price another week. Activity is healthy." Soft weeks declare the price drop as automatic ("We're dropping the asking rent by $X") and then list any additional agent-picked strategies as recommendations pending owner approval.
- **Price drop is automatic.** All other strategy moves require owner approval and must be presented as recommendations, not as things already happening.
- Comps are optional below 28 days on market, required at 28+ days. Include whatever the agent provided.
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
   - `subject`: "Weekly Leasing Update | [Property Address] | Week ending [Date]"
   - `htmlBody`: the HTML template filled in
   - `body`: the plain-text fallback version
3. Capture the draft creation timestamp and the draft ID returned.

If Gmail MCP isn't connected, surface the issue ("Can't create the draft without Gmail connected, here's the email body for manual paste") and proceed to the Asana step.

## Asana writes (after agent approves)

The "Send weekly activity report" sub-task is **recurring**, not one-off. The same sub-task is reused every week until the property is leased. Two writes per run:

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

2. **Do NOT mark the sub-task complete.** The agent doesn't mark it complete either. The same sub-task lives through the entire vacancy, with the due date rolling forward each Tuesday until the property is leased. When the lease signs, the lease-up sub-task workflow handles closing it out (not this skill).

3. Confirm to the agent: "Posted the email body as a comment and rolled the due date to [next Tuesday's date]. The sub-task stays open for next week's report."

If any Asana step fails, surface a one-liner ("Couldn't update Asana automatically, here's what to do manually") and re-output what the agent needs to do by hand.

## Edge cases

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
