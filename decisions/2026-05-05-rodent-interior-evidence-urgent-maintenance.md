---
type: decision
date: 2026-05-05
decision_owner: brittany@sagareus.com
status: active
visibility_tier: ic
service_line: maintenance
triggered_by:
  - incidents/2026-01-19-rat-infestation-2301-ne-125th-unit-102.md
sops_to_update:
  - sops/maintenance/cs-high-priority-maintenance.md
  - sops/maintenance/pest-control.md
tags: [rodent, urgent-maintenance, habitability, pest-control, decision]
---

# Decision — Rodent Infestation with Interior Evidence Classified as Urgent Maintenance

## Decision

Rodent infestations (rats, mice) with evidence of interior presence — droppings, active sightings, sounds in walls — are classified as **Urgent Maintenance** under the High Priority Maintenance SOP.

## Why this decision

The 2301 NE 125th St Unit 102 incident (January 19, 2026 onward) demonstrated that rodent infestation is a habitability concern requiring same-day response. Treating it as a normal-priority pest control issue led to vendor coordination delays, owner-vendor confusion, and an unresolved infestation extending across multiple months while a tenant lived with active rodent presence.

## What this changes operationally

When a Resident reports rodent activity inside their unit:

- Classified at intake as **High Priority** (same path as water leaks, heat failure, structural damage)
- Same-day vendor dispatch
- Daily field-tech review until resolution is confirmed
- Authority to override owner-induced delays under the Property Conditions Policy where habitability is at risk
- Reduced reliance on prolonged owner-approval cycles

## Scope and boundaries

- Applies to **interior** evidence in occupied units
- Does not change rules for exterior pest activity, single-family non-Seattle homes (where the Resident is responsible per the existing pest-control SOP), or non-rodent pests
- Wasps remain on the existing 24-hour dispatch rule per the Pest Control SOP

## SOPs to update (manual)

These SOPs should be updated to reflect this decision. Updates are tracked manually, not auto-generated:

- `sops/maintenance/cs-high-priority-maintenance.md` — add rodent interior evidence to High Priority criteria
- `sops/maintenance/pest-control.md` — add a "Rodents (Rats/Mice) — Interior Evidence" section

*Pending manual SOP work — see corresponding Asana task in the Roll Out project.*

## Decided by

Brittany French, May 5, 2026.
