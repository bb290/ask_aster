// Manager decision flows for the Screening Workbench (Brittany, 2026-08-04).
//
// Three decisions, each with fixed options. Every decision:
//   1. posts a MANAGER DECISION comment on the application task containing a
//      ready-to-send email draft (DRAFT ONLY; a human sends from leasing@,
//      per the standing external-email rule),
//   2. assigns the task to Mary Galvez, due today (Seattle date).
//
// Declines carry the adverse action notice as the email draft, built from the
// SCREENING_CRITERIA.md phrase bank. The screening vendor's contact block is
// a marked placeholder: it must come off the actual report cover page, never
// invented here.
//
// Templates are deterministic strings, not model output. Sagareus voice:
// no em dashes, leasing signature.

export type Decision = "approved" | "insufficient" | "declined";

export interface DecideInput {
  decision: Decision;
  option: string;
  text?: string; // counter offer / other detail
  applicantFirst: string; // greeting name(s), best-effort from task name
  address: string; // property address, best-effort from task name
}

export const DECISION_OPTIONS: Record<Decision, { key: string; label: string; needsText?: boolean }[]> = {
  approved: [
    { key: "as_is", label: "Approved as is - please send lease" },
    { key: "negotiate", label: "Approved - negotiate terms", needsText: true },
    { key: "owner_exception", label: "Sagareus approved - pending owner policy exception" },
    { key: "section8", label: "Sagareus approved - pending Section 8 approval" },
    { key: "other", label: "Other", needsText: true },
  ],
  insufficient: [
    { key: "cosigner", label: "Request co-signer" },
    { key: "docs", label: "Insufficient documentation" },
    { key: "landlord_balance", label: "Balance owed to landlord" },
  ],
  declined: [
    { key: "income", label: "Income does not meet minimum" },
    { key: "credit", label: "Credit score does not meet minimum" },
    { key: "docs", label: "Failure to provide valid documentation" },
  ],
};

const SIGNATURE = `Best regards,
Sagareus Leasing Support Team
leasing@sagareus.com
Call/Text: 425-390-8122`;

const REVIEW_ORDER_NOTE = "Applications are reviewed in the order they are completed, so a quick reply keeps your place in line.";

function approvedEmail(opt: string, first: string, address: string, text: string): { subject: string; body: string } {
  const hi = `Hi ${first},`;
  if (opt === "as_is") {
    return {
      subject: "Your Sagareus application is approved",
      body: `${hi}

Great news! Your application for ${address} has been approved. We will send the lease for electronic signature shortly. Please review and sign promptly; the unit is held once the lease is fully signed and the move-in funds are received.

We are excited to welcome you home.

${SIGNATURE}`,
    };
  }
  if (opt === "negotiate") {
    return {
      subject: "Your Sagareus application: approved with adjusted terms",
      body: `${hi}

Good news! Your application for ${address} has been approved with the following adjusted terms:

${text || "[Manager: enter the counter offer terms]"}

Reply to this email to accept these terms or to discuss. Once we hear back, we will prepare the lease.

${SIGNATURE}`,
    };
  }
  if (opt === "owner_exception") {
    return {
      subject: "Your Sagareus application: approved, one confirmation pending",
      body: `${hi}

Good news! Sagareus has approved your application for ${address}. One property-specific policy exception still needs confirmation before we can send the lease. We expect to have an answer shortly and will follow up the moment we do.

No action is needed from you right now.

${SIGNATURE}`,
    };
  }
  if (opt === "section8") {
    return {
      subject: "Your Sagareus application: approved, Housing Authority steps next",
      body: `${hi}

Good news! Sagareus has approved your application for ${address}. The next steps run through your Housing Authority: the Request for Tenancy Approval (RFTA) paperwork and the Housing Authority inspection. We will start the paperwork on our side and coordinate with your case worker.

These steps can take a little time, so the sooner your portion of the RFTA is submitted, the better. Reply here with your case worker's name and contact if you have not sent it already.

${SIGNATURE}`,
    };
  }
  return {
    subject: "Your Sagareus application: update",
    body: `${hi}

${text || "[Manager: enter the message to the applicant]"}

${SIGNATURE}`,
  };
}

function insufficientEmail(opt: string, first: string, address: string): { subject: string; body: string } {
  const hi = `Hi ${first},`;
  if (opt === "cosigner") {
    return {
      subject: "Your Sagareus application: co-signer needed to move forward",
      body: `${hi}

Thank you for applying for ${address}. Based on our screening criteria, your application can move forward with a co-signer who meets the income standard for the property.

To continue, have your co-signer submit an application and their income documentation. Reply to this email and we will send the co-signer application link.

${REVIEW_ORDER_NOTE}

${SIGNATURE}`,
    };
  }
  if (opt === "docs") {
    return {
      subject: "Your Sagareus application: documentation needed",
      body: `${hi}

Thank you for applying for ${address}. We need income documentation that meets our verification standards to complete your screening. Acceptable documents include:

- Your last two full months of official paystubs (screenshots of banking apps, self-generated documents, and unsigned letters do not qualify)
- Or a signed offer letter on company letterhead with HR contact information
- Or platform earnings statements covering the most recent 60 days for gig or contract work

Reply to this email with the documents and we will complete your review right away.

${REVIEW_ORDER_NOTE}

${SIGNATURE}`,
    };
  }
  return {
    subject: "Your Sagareus application: prior balance must be resolved",
    body: `${hi}

Thank you for applying for ${address}. Our screening shows an outstanding balance owed to a previous landlord. Per our criteria, this must be resolved before an application can be approved.

Your application can move forward if you provide either:

- Proof the balance has been paid or settled, or
- Documentation of an established payment plan in good standing with the previous landlord

Reply to this email with the documentation and we will rerun your screening.

${REVIEW_ORDER_NOTE}

${SIGNATURE}`,
    };
}

// SCREENING_CRITERIA.md adverse action phrase bank
const DECLINE_REASON: Record<string, string> = {
  income: "Income below the rent threshold for the property's screening tier and shortfall not resolvable through assets or co-signer.",
  credit: "Household median credit score below the minimum for the property's screening tier.",
  docs: "Income could not be verified to Sagareus documentation standards.",
};

function declineEmail(opt: string, first: string, address: string): { subject: string; body: string } {
  return {
    subject: "Your rental application with Sagareus Property Management",
    body: `Hi ${first},

Thank you for your application for ${address}. After careful review against our published screening criteria, we are unable to approve your application at this time.

ADVERSE ACTION NOTICE

Reason for this decision:
- ${DECLINE_REASON[opt] ?? DECLINE_REASON.docs}

This decision was based in whole or in part on information obtained through a consumer screening report. The screening vendor did not make this decision and cannot explain why it was made.

Screening vendor (consumer reporting agency):
[STAFF: copy the vendor name, address, and phone from the cover page of the screening report before sending. Do not send with this placeholder.]

Your rights under the Fair Credit Reporting Act:
- You may request a free copy of your consumer report from the screening vendor within 60 days of this notice.
- You have the right to dispute directly with the screening vendor the accuracy or completeness of any information in the report.

Sagareus Property Management evaluates every application against the same objective criteria. We accept all lawful sources of income. If your circumstances change, you are welcome to apply again.

${SIGNATURE}`,
  };
}

export function buildDecision(input: DecideInput): {
  headline: string;
  email: { subject: string; body: string };
} {
  const opts = DECISION_OPTIONS[input.decision];
  const opt = opts.find((o) => o.key === input.option);
  if (!opt) throw new Error("bad_option");
  const first = input.applicantFirst || "there";
  const address = input.address || "the property";
  if (input.decision === "approved") {
    return { headline: opt.label, email: approvedEmail(input.option, first, address, (input.text ?? "").trim()) };
  }
  if (input.decision === "insufficient") {
    return { headline: opt.label, email: insufficientEmail(input.option, first, address) };
  }
  return { headline: opt.label, email: declineEmail(input.option, first, address) };
}
