---
title: "PreListing Report // Manual Fallback"
service_line: lease up
sop_owner: brittany@sagareus.com
outline_url: https://sagareus.getoutline.com/doc/prelisting-report-manual-fallback-Mbs8Hbagju
status: active
last_reviewed: 2026-07-21
visibility_tier: ic
version: 1
tags: [leasing, prelisting, manual-fallback, market-rent, listing]
created_but_never_updated: false
---

> **Situation:** The PreListing tool (https://www.sagareus.com/field) is down or comp data will not load. The market rent analysis, listing strategy, draft listing, and PreListing Email still ship on schedule. This is the by-hand version of everything the tool automates.

Process and cadence: [2 — Email | Owner - Market Rent & PreListing](2-email-owner-market-rent-prelisting.md). Pricing methodology: [Market Rent & Listing Strategy](market-rent-listing-strategy.md).

---

## Key Points

- **Same outputs, same deadline** — a down tool changes the how, never the what or the when.
- **Two deliverables** — the draft listing (pasted into Buildium) and the PreListing report (posted to Asana and emailed to the owner).
- **Data first, judgment second** — comps and math set the numbers; your Agent Comments carry the judgment.

---

## Procedure

### 1 — Pull Comps and Set Market Rent

1. Follow the methodology in [Market Rent & Listing Strategy](market-rent-listing-strategy.md).
2. Pull comparables by hand: on Zillow, search rentals near the property with the same bedroom count and property type, listed in the last 3 months, within about half a mile (widen the radius if you find fewer than 5).
3. For each comp record: address, rent, beds/baths, sqft, $/sqft, distance, and whether it is an active listing or off market.
4. Set the market rent estimate from the comp set: lean on the median and the $/sqft of the closest matches, then adjust for condition and season.
5. Note the previous lease rent from Buildium (Leases tab on the unit). If the unit has never been leased, write "No lease history" — do not substitute the Market Rent field, it is a hand-typed figure, not a lease.

### 2 — Set the Listing Strategy (the tool's math, by hand)

| Field | Default |
|---|---|
| Starting Rent | Market rent estimate + $200 (round to the nearest $5) |
| Weekly Adjustment | 6-10 inquiries in reporting week: reduce rent by $100. 1-5 inquiries: reduce by $200. |
| Minimum Price | Starting Rent minus $700 |
| Security Deposit | Starting Rent minus $100 |
| Last Month Rent | $0 unless required |
| Move-In Special | None by default. Options: 1 month, 1/2 month, $1,500, $1,000, or $500 rent credit. |

Defaults are the floor, not a straitjacket: adjust with reasons, and put the reasons in Agent Comments.

### 3 — Write the Draft Listing

The listing description is **pure narrative**: never include the street address, bed/bath counts, or square footage (they display in the listing's data fields). Sell the experience of living there; vary sentence openings; no em dashes; no emojis.

:::warning
**Fair Housing:** describe the property and the lifestyle it offers, never the people. Never name who the home suits: no "family", "kids", "couples", "professionals", "students", "seniors", "perfect for", "ideal for".
:::

Structure, top to bottom:

1. **Move-In Special first line** (only if offering one), advertised as a seasonal special: "[Season] Special! $500 Rent Credit applied at lease signing!"
2. **Narrative** — opener with a hook, living experience, comfort and convenience, location with real named places and distances (nearest freeway, a notable park, shopping), closing with exactly "Don't wait, schedule your tour today!" or "Showings by appointment only, schedule today!"
3. **Boilerplate** — copy the block below, fill the brackets, delete lines that do not apply:

```
Lease Details:
• Pet Policy: [choice]; ESA always allowed, no restriction

• Utilities: [choice]

• Landscaping: [choice]

• Parking: [choice(s)]

• Laundry: [choice]

• Special Terms: [Construction Addendum / short lease / other, if any]

• Security Deposit: $[Starting Rent - 100] (refundable)
• Last Month Rent: $[amount, only if charged]
• Move In Special: $[amount] rent credit applied at lease signing [only if offered]
• Prorated 1st month rent + 1 month refundable security deposit
• Prorated 1st month rent due within 48 hours of lease signing
• Remaining balance due on or before Move In Date
• Renter's Insurance: $100,000 liability insurance required

Disclosures:
• Sq ft and features are approximate, applicant to verify
• Scam Alert! Sagareus DOES NOT charge a fee to view a property
• Application fee $35 / person
• Every person on lease over the age of 18 must apply
• Application Fee is charged immediately and is non-refundable

APPLICANT CRITERIA
All applicants must meet the following minimum qualifications for tenancy:
• Income: Gross income must be at least [2.5]x rent amount. Employment/Income must be verified with past 2 months pay stubs or other financial statement.
• Credit: [650]+ credit score with 5 or less late payments or collection notices on record
• Rental History: Current and/or prior rental references must be favorable. Eviction Records within the past 3 years will not be considered for occupancy. Applicants who received 3 or more lease violation notices from their previous landlord will not be considered for occupancy.
• All necessary documents are to be furnished in person directly to the Leasing Manager or via e-mail to leasing@sagareus.com

Fair Housing Provider.
```

Criteria tiers (pick exactly one, and fill its numbers into the Income and Credit lines):

| Tier | Income | Credit | Use for |
|---|---|---|---|
| Stringent | 3.0x | 700+ | High-end properties, premium neighborhoods, HOA/condo risk factors |
| Standard | 2.5x | 650+ | Most Sagareus properties |
| Lenient | 2.0x | 600+ | Accessible housing, slower-leasing areas, broader applicant pools |

If construction is planned on site, add this paragraph at the end of the narrative: "Please note: construction is planned on site during the lease term. A $200/mo rent credit applies for each month of the construction period." and provide full detail before publishing.

### 4 — Build and Post the Report

Assemble the PreListing report in this order and post it as a comment on the **Email | Owner - Market Rent & PreListing** subtask:

1. **ESTIMATED MARKET RENT** — estimate, range, beds/baths/sqft, $/sqft, previous lease rent (or "No lease history: first lease for this unit")
2. **MARKET POSITION** — median, mean, and where the estimate sits as a percentile of the comp set
3. **AGENT COMMENTS** — required, at least 2 sentences for the owner
4. **LISTING STRATEGY** — the six fields from step 2
5. **NEARBY COMPARABLES** — each comp with rent, bd/ba, sqft, $/sqft, distance, and a Zillow link
6. **DRAFT LISTING** — the entire draft from step 3
7. **DISCLAIMER** — the standard disclaimer from the PreListing report

### 5 — Send the PreListing Email

Use the email template in [2 — Email | Owner - Market Rent & PreListing](2-email-owner-market-rent-prelisting.md), then complete the Asana documentation steps there.
