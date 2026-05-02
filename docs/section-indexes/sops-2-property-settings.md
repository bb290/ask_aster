---
title: Property Settings
service_line: property onboarding
doc_type: section-index
last_reviewed: 2026-05-01
---

## Action Guides

Shared "how-to" docs — one per settings category. Link to these from any workflow (Onboarding, Turn Over, Pre Move-Out, etc.) instead of duplicating field lists.

* [Update | Client Relations Settings](../../sops/property onboarding/update-client-relations-settings.md) — fees, communication preferences, property tax (Client Relations 2.0)
* [Update | Property Settings](../../sops/property onboarding/update-property-settings.md) — maintenance & compliance fields (Property Settings)
* [Update | Utility Settings](../../sops/property onboarding/update-utility-settings.md) — utility billing configuration (Property Settings)


---


:::info
Property Settings tracks key information about each property and unit we manage. This data powers maintenance scheduling, compliance tracking, and utility billing. [View the Data Audit Dashboard](https://d31czylo2z0inj.cloudfront.net/#data-audit) to see completion rates across all properties.

:::

## Field Reference

### Client Settings Fields

These fields live on the **Client Relations 2.0** project (one task per property). They are managed separately from the Property/Unit categories below.

| Field | Type | What It Tracks |
|-------|------|----------------|
| Mgmt Fee | Number | Monthly management fee percentage or amount |
| Lease Up Fee | Number | One-time fee charged when placing a new tenant |
| Renewal Fee | Number | Fee charged when a lease is renewed |
| Property Tax | Number | Annual property tax amount |
| Maintenance Comm Configured | Derived | Whether maintenance communication preferences are set |
| Renewal Comm Configured | Derived | Whether renewal communication preferences are set |

### Maintenance & Compliance Fields

These fields live on the **Property Settings** and **Unit Settings** projects. Each field belongs to one of four categories that determine where it is tracked. See [Categories](#categories) below for what each one means.

| Field | Type | Category | What It Tracks |
|-------|------|----------|----------------|
| Roof Cleaning Completed | Date | Property | Last roof cleaning date |
| Pest Control | Text | Property | Pest control provider and schedule |
| Septic Pump Date | Date | Property | Last septic system pump date |
| Landscaping Maintenance | Text | Property | Who handles landscaping (us, owner, or tenant) |
| Rental Registration Expiration | Date | Property | When the rental registration expires |
| Backflow Testing Date | Date | Property | Last backflow preventer test date |
| HVAC Servicing Completed | Date | Unit     | Last HVAC service date for this unit |
| Dryer Vent Cleaning Completed | Date | Unit     | Last dryer vent cleaning date |
| Hot Water Heater Install | Date | Unit     | Water heater installation date |
| Heating Type | Text | Unit     | Type of heating system (furnace, baseboard, etc.) |
| HVAC Filter | Text | Unit     | Filter size and replacement schedule |
| Annual Inspection Completed | Date | Unit     | Last annual unit inspection date |
| Appliances | Text | Unit     | Appliances included in the unit |
| Mailbox | Text | Unit     | Mailbox location and type |
| EV Charger | Text | Unit     | Whether an EV charger is present |
| Internet Provider | Text | Unit     | Available internet provider |
| Cooling | Text | Unit     | Type of cooling system (central air, mini-split, etc.) |
| Laundry | Options | Unit     | Laundry setup (in-unit, shared, hookups only, etc.) |
| Parking | Text | All      | Parking availability and type |
| Storage | Text | All      | Storage availability |
| Common Area Cleaning | Text | Multifamily | Cleaning schedule for shared spaces |
| Coin Pickup Completed | Date | Multifamily | Last coin-op laundry collection date |
| Multifamily Inspection Date | Date | Multifamily | Last multifamily-specific inspection |
| Fire Inspection Date | Date | Multifamily | Last fire safety inspection |
| Elevator Inspection Date | Date | Multifamily | Last elevator inspection |

### Utility Fields

These fields live on the **Property Settings** and **Unit Settings** projects.

| Field | Type | Category | What It Tracks |
|-------|------|----------|----------------|
| Auto Utility Processing Mode | Options | Property | How utility charges are billed (pass-through, flat fee, etc.) |
| Utilities | Text | Property | Utility providers and account details |
| Utilities - Electricity | Options | Unit     | Electricity billing setup for this unit |
| Utilities - Gas | Options | Unit     | Gas billing setup |
| Utilities - Water | Options | Unit     | Water billing setup |
| Utilities - Sewer / Storm Drain | Options | Unit     | Sewer billing setup |
| Utilities - Garbage | Options | Unit     | Garbage billing setup |
| Utilities - Oil | Options | Unit     | Oil billing setup |
| Utilities - Internet | Options | Unit     | Internet billing setup |


---

## Categories

The Property/Unit/Multifamily/All categories apply to the Maintenance & Compliance and Utility fields above. They determine which Asana task a field lives on.

### Property

Fields that describe the **property as a whole** — things like landscaping, roof cleaning, and rental registration that apply regardless of how many units the building has. These are tracked on the main property settings task.

### Unit

Fields that describe a **specific unit** — things like appliances, heating type, and HVAC servicing that can differ from unit to unit. For single-unit properties, these live on the main property task (since there is only one unit). For multi-unit properties, these live on each unit's subtask.

### Multifamily

Fields that **only apply to properties with 2+ units** — things like common area cleaning, coin-op laundry pickup, and fire inspections that don't exist for single-family homes. These are tracked on the main property settings task, but only when the property has more than one unit.

### All

Fields tracked on **both** the property task and every unit subtask — currently just Parking and Storage, since these can vary by unit but are also relevant at the property level.


---

## How Settings Are Organized in Asana

* **Client Relations 2.0 project** — One task per property. Tracks fees, tax, and communication preferences.
* **Property Settings project** — One task per property. The task name is "Settings // \[Address\]". Tracks maintenance, compliance, and utility fields.
* **Unit Settings project** — For multi-unit properties, each unit gets its own subtask under the property task. These subtasks also appear in the Unit Settings project.
* **Single-unit properties** — The property task serves double duty as both the property setting and the unit setting (no subtasks needed).


---

## Automation

The **sync-settings** command runs daily and keeps everything in sync:


1. **Creates tasks** — When a new property is added in Buildium, a settings task is automatically created in the Property Settings project.
2. **Creates unit subtasks** — For multi-unit properties, subtasks are created for each unit and added to the Unit Settings project.
3. **Updates task details** — Property name, owner info, unit count, and other metadata are kept current.
4. **Sets default values** — Fields that don't apply to a particular task type are automatically set to a placeholder (12/31/9999 for dates). This prevents them from showing up as "missing" on the data audit dashboard. For example:
   * A single-family property task gets defaults on Multifamily fields (fire inspection, elevator inspection, etc.) because those don't apply.
   * A multi-unit property task gets defaults on Unit fields (HVAC servicing, appliances, etc.) because that data lives on each unit's subtask instead.
   * Unit subtasks get defaults on Property and Multifamily fields because those are tracked at the property level.
5. **Never overwrites** — If a field already has a value, the automation leaves it alone. It only fills in empty fields.

### Data Audit Dashboard

The [Data Audit Dashboard](https://d31czylo2z0inj.cloudfront.net/#data-audit) tracks completion rates for every field across all properties. Use it to identify which fields still need to be filled in. The dashboard groups fields by category (Property, Unit, Multifamily) so you can focus on the ones relevant to your work.
