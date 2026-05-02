---
title: "Collection // Days 14-21: Tenant Not Responding"
service_line: rent collection
sop_owner: brittany@sagareus.com
status: active
last_reviewed: 2026-05-01
visibility_tier: ic
version: 1
tags: [rent-collection, buildium]
created_but_never_updated: false
---

If a tenant has not responded after 2 weeks of outreach (email sequence + follow up calls & texts), the following subtasks are automatically triggered on the Collection task.


---

## 1. Call, Text & Email Emergency Contact

**When:** 12 days after Collection task is created

Contact the tenant's emergency contact to attempt to re-establish communication.

**Find emergency contact:** Buildium -> Lease -> Tenant -> Emergency Contact

### Phone Script, Emergency Contact

> Hi, this is \[Name\] from Sagareus Property Management. We manage the property where \[Tenant Name\] lives. You are listed as their emergency contact.
> 
> We've been trying to reach \[Tenant Name\] regarding their account but have been unable to get in touch. Would you be able to share an updated phone number or email for them?

### Action

1. Call emergency contact, call twice to punch through do not disturb
2. Follow up with text if no answer
3. Send email if email address is available
4. Document all attempts in the Collection parent task comments


---

## 2. Start Abandonment Procedure

**When:** 15 days after Collection task is created (if still no response)

If there is still no communication from the tenant after the emergency contact outreach, initiate abandonment detection.


1. Create "Abandonment // \[Address\]" templated task in the Abandonment project
2. Assign to Operations Manager
3. Link the Abandonment task in the Collection task comments
4. Monitor the Abandonment task:
   * **IF abandonment is confirmed** and premise retained, cancel eviction
   * **IF tenant is still present**, proceed to Days 21+: Start Eviction
