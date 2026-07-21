---
title: "2 — Email | Owner - Market Rent & PreListing"
service_line: lease up
sop_owner: brittany@sagareus.com
outline_url: https://sagareus.getoutline.com/doc/2-email-owner-market-rent-prelisting-NyzOO6MKXO
status: active
last_reviewed: 2026-07-21
visibility_tier: ic
version: 2
tags: [leasing, security-deposit, listing, buildium, leasing-2.0, prelisting, field-tools]
created_but_never_updated: false
---

Set a data-backed rent price and listing strategy, generate the draft listing, and send the PreListing Email to gain owner alignment before the listing goes live.

This step runs through the **PreListing tool** on the Team Hub: **https://www.sagareus.com/field** (changed 2026-07-21; it replaces the manual comp pull, strategy math, and draft writing). Tool down? Follow [PreListing Report // Manual Fallback](prelisting-report-manual-fallback.md): same outputs, done by hand.

Pricing methodology behind the numbers: [Market Rent & Listing Strategy](market-rent-listing-strategy.md).

## Run the Report

1. Open the PreListing tool and enter the **Unit ID** (the number on the property's Unit Settings task), then tap **Populate**: address, type, sqft, beds, and baths fill from Buildium, and the tool imports the unit's existing listing description and checks the matching rental policies for you.
2. Tap **Run Report**. The tool pulls nearby comps and builds the full report.
3. **Previous lease banner**: a yellow banner shows what the departing resident actually paid; keep that price point in mind, and frame the owner conversation delicately if the market has moved down. A grey banner means the unit has no lease history.

## Review and Adjust

Work top to bottom. Everything cascades: edits flow into the strategy, the draft listing, and the output report automatically.

1. **Estimated Market Rent**: tap the number to override it. Market position, strategy defaults, and the draft update on their own.
2. **Nearby Comparables**: x out comps that do not belong; switch the time window if needed.
3. **Listing Strategy**: six fields, pre-filled with the standard defaults (Starting Rent = market rent + $200; Minimum = starting − $700; Deposit = starting − $100; Weekly Adjustment rules; Last Month Rent; Move-In Special dropdown). Edit any field; hand-edited fields keep your numbers.
4. **Rental Policies**: confirm the auto-checked policies, adjust as needed. ESA is always included under Pet Policy automatically.
5. **Applicant Criteria**: pick exactly one tier (selecting one clears the others). The tier's income and credit numbers flow into the draft's criteria block.
6. **Draft Listing**: tap **Generate Draft Listing** for AI narrative with researched location facts, then edit inline. The Lease Details, Disclosures, and criteria sections attach automatically.

:::warning
**Verify before publishing:** the generated narrative researches distances and features, but the agent owns accuracy. Check the yellow verify note above the draft, confirm distances and amenities, and read the narrative once against Fair Housing (no tenant-targeting language, ever).
:::

## Place the Listing and Post the Report

1. Tap **Copy Listing** and paste the draft into the Buildium unit listing description. (Post to Buildium directly from the tool is coming soon.)
2. Tap **Build Text Report**, review, then **Copy & Post to Asana**: the full report posts to this subtask automatically.
3. Download the PDF if the owner conversation needs an attachment.

## Send the PreListing Email to Owner

Send to the owner, CC the Team Lead. Then upload the sent email PDF to this subtask and mark it complete.

:::info
**Subject:** Market Rent & Listing Strategy | [Property Address]

Hi [Owner Name],

We have completed the market analysis for [Property Address] and want to align with you on pricing and strategy before the listing goes live.

**Estimated Market Rent:** $[estimate]/mo (range $[low] to $[high], based on [#] nearby comparables)

**Previous Lease:** $[amount]/mo [Remove if no lease history]

**Listing Strategy**

* Starting Rent: $[starting rent]
* Weekly Review: if activity is below target for the week, we reduce the asking rent by $100 to $200
* Minimum Price: $[minimum]
* Security Deposit: $[deposit]
* Move-In Special: [None / $[amount] rent credit at lease signing]

**Draft Listing**

[Paste the full draft listing here so you can review exactly what prospects will see.]

The full PreListing report with comparables is attached. If we do not hear back from you within one week, we will proceed with our proposal.

**Attachment:** PreListing report PDF
:::
