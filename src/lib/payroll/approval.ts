/**
 * Putting a finished payroll run in front of someone who can sign it.
 *
 * Accounts calculates payroll but deliberately does not hold `payroll.approve`.
 * Leaving the period in `review` and hoping an admin notices is not an approval
 * step — it is a status. A row in `public.approvals`, which already exists for
 * exactly this and is what the C-level panels read, is.
 *
 * Kept pure and separate from the action so the wording and the amounts can be
 * tested without a database.
 */

export interface ApprovalInput {
  periodId: string;
  siteId: string;
  /** The period's human label, e.g. "August 2026". */
  label: string;
  requestedBy: string;
  headcount: number;
  net: number;
}

export interface ApprovalRow {
  entity_type: string;
  entity_id: string;
  site_id: string;
  title: string;
  summary: string;
  amount: number;
  requested_by: string;
  required_permission: string;
  status: "pending";
}

/**
 * True when the person who ran payroll cannot sign it off themselves.
 *
 * Superuser expansion has already been applied to the set by the session
 * loader, so an unrestricted role holds `payroll.approve` here and correctly
 * queues nothing.
 */
export function needsApproval(permissions: ReadonlySet<string>): boolean {
  return !permissions.has("payroll.approve");
}

/** Rupees with thousands separators and no decimals — the payslip convention. */
function money(amount: number): string {
  return `Rs ${Math.round(amount).toLocaleString("en-US")}`;
}

export function approvalRowFor(input: ApprovalInput): ApprovalRow {
  const people = input.headcount === 1 ? "1 person" : `${input.headcount} people`;

  return {
    entity_type: "payroll_period",
    entity_id: input.periodId,
    site_id: input.siteId,
    title: `Payroll for ${input.label}`,
    summary: `${people}, net ${money(input.net)}. Calculated and awaiting sign-off.`,
    amount: input.net,
    requested_by: input.requestedBy,
    required_permission: "payroll.approve",
    status: "pending",
  };
}
