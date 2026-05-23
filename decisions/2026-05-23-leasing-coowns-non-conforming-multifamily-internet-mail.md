---
type: decision
date: 2026-05-23
decision_owner: brittany@sagareus.com
status: active
visibility_tier: ic
service_line: move in
last_reviewed: 2026-05-23
tags: [non-conforming, multifamily, internet, mail, leasing, client-relations, routing, co-ownership]
---

# Decision — Leasing Co-Owns Non-Conforming Multifamily Internet & Mail Policy Adherence

## Decision
Leasing co-owns adherence to the internet and mail policies for non-conforming
multifamily properties, alongside client relations. These two issues are a
major source of friction on non-conforming multifamily, and they surface
directly inside leasing's workflows (lease up, move in, move out), so leasing
is a legitimate owner of enforcement, not a pass-through.

## What changed
The policy itself did not change. It already lives in
`sops/client relations/non-conforming-properties.md` and is correct as written.
What changed is ownership labeling: this policy was previously treated as
client-relations-only, which caused Aster to route leasing questions about it
to accounting as out-of-lane. That routing was wrong.

## Routing correction
This supersedes the relevant line in
`decisions/2026-05-09-leasing-team-scope-and-routing.md`.
Non-conforming multifamily internet and mail policy questions are IN leasing's
lane. Leasing should answer adherence questions directly rather than punting to
accounting@sagareus.com. Accounting still owns utility billing mechanics (flat
fee, pass-throughs, ledgers); leasing owns policy adherence on internet and
mail for non-conforming multifamily.

## Scope note
Co-ownership means both teams enforce. Client relations owns the owner-facing
policy relationship; leasing owns adherence at the tenant-facing touchpoints
(move in documentation, SSID/password distribution, confirming service is
active prior to move-in).

## Related
- sops/client relations/non-conforming-properties.md
- decisions/2026-05-09-leasing-team-scope-and-routing.md
- decisions/2026-05-05-no-onboarding-non-conforming-multifamily.md
- incidents/2026-04-29-unit-confusion-13337-30th-ave-ne.md
