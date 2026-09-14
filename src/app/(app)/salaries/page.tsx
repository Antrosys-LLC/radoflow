import type { Metadata } from "next";

import { SchemaOutOfDate } from "@/components/schema-out-of-date";
import { requireAnyPermission } from "@/lib/auth/session";
import { dictionaryFor } from "@/lib/i18n";
import { LEDGER_CODES, loanBalance, type LoanRow, type RecoveryRow } from "@/lib/payroll/ledger";
import type { PayslipLine } from "@/lib/payroll/types";
import { isSchemaOutOfDate } from "@/lib/supabase/schema-error";
import { createClient } from "@/lib/supabase/server";
import { todayInPakistan } from "@/lib/time";

import {
  SalariesScreen,
  type AdjustmentView,
  type LoanView,
  type PaymentView,
  type PersonOption,
} from "./salaries-screen";

export const metadata: Metadata = {
  title: { absolute: "Salaries | Rado Dyeing and Textile" },
  description: "Salaries handed over, advances and deductions, and loans paid back from pay.",
};

export const dynamic = "force-dynamic";

function monthParam(value: string | undefined, today: string): string {
  return value && /^\d{4}-\d{2}$/.test(value) ? value : today.slice(0, 7);
}

function shiftMonth(month: string, by: number): string {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + by);
  return date.toISOString().slice(0, 7);
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** A pay line's breakdown, sorted into the columns a person asks about. */
function breakdownOf(lines: readonly PayslipLine[]) {
  const sum = (pick: (line: PayslipLine) => boolean) =>
    round2(lines.filter(pick).reduce((total, line) => total + Number(line.amount ?? 0), 0));
  const withheld = (line: PayslipLine) => line.kind === "deduction" || line.kind === "tax";

  return {
    allowances: sum(
      (line) => line.kind === "earning" && !["OT", "WEEKEND", "HOLIDAY"].includes(line.code),
    ),
    advances: sum(
      (line) =>
        withheld(line) &&
        (line.code === LEDGER_CODES.advance || line.code === LEDGER_CODES.advance_2),
    ),
    suit: sum((line) => withheld(line) && line.code === LEDGER_CODES.suit),
    loan: sum((line) => withheld(line) && line.code === LEDGER_CODES.loan),
    late: sum((line) => withheld(line) && line.code.startsWith("LATE")),
    other: sum(
      (line) =>
        withheld(line) &&
        !line.code.startsWith("LATE") &&
        !(
          [
            LEDGER_CODES.advance,
            LEDGER_CODES.advance_2,
            LEDGER_CODES.suit,
            LEDGER_CODES.loan,
          ] as string[]
        ).includes(line.code),
    ),
  };
}

/**
 * Salaries: the money side of a month, after the calculation.
 *
 * Payroll works out what each person earned. This is what happens next — what
 * was actually handed over and how far it was from the figure, the advances
 * and suits and allowances the office enters through the month, and the loans
 * being paid back a month at a time. All three feed the next payroll run.
 */
export default async function SalariesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await requireAnyPermission(["payroll.view", "payroll.pay", "payroll.run"]);
  const t = dictionaryFor(session.profile.language);
  const today = todayInPakistan();
  const month = monthParam((await searchParams).month, today);
  const first = `${month}-01`;
  const next = `${shiftMonth(month, 1)}-01`;

  const supabase = await createClient();

  const [
    { data: adjustments, error: ledgerError },
    { data: loans },
    { data: periods },
    { data: people },
    { data: departments },
  ] = await Promise.all([
    supabase
      .from("salary_adjustments")
      .select("id, profile_id, kind, amount, label, note, given_on, month, created_at")
      .eq("month", first)
      .order("created_at", { ascending: false }),
    supabase
      .from("employee_loans")
      .select(
        "id, profile_id, principal, installment, installments, first_month, taken_on, status, note, created_at",
      )
      .order("status")
      .order("taken_on", { ascending: false }),
    supabase
      .from("payroll_periods")
      .select("id, label, status, period_start, period_end")
      .gte("period_start", first)
      .lt("period_start", next)
      .order("period_start", { ascending: false })
      .limit(1),
    supabase
      .from("employee_directory")
      .select("id, full_name, employee_code, department_id")
      .order("full_name"),
    supabase.from("departments").select("id, name"),
  ]);

  if (isSchemaOutOfDate(ledgerError)) {
    return <SchemaOutOfDate t={t} detail={ledgerError?.message} />;
  }

  const deptName = new Map((departments ?? []).map((row) => [row.id, row.name]));
  const personOptions: PersonOption[] = (people ?? []).flatMap((row) =>
    row.id
      ? [
          {
            id: row.id,
            name: row.full_name ?? "",
            code: row.employee_code ?? "",
            department: (row.department_id && deptName.get(row.department_id)) || "",
          },
        ]
      : [],
  );
  const personById = new Map(personOptions.map((person) => [person.id, person]));

  const loanIds = (loans ?? []).map((loan) => loan.id);
  const { data: recoveries } = loanIds.length
    ? await supabase
        .from("loan_recoveries")
        .select("loan_id, month, amount, source")
        .in("loan_id", loanIds)
    : { data: [] };

  const loanViews: LoanView[] = (loans ?? []).map((loan) => {
    const mine = ((recoveries ?? []) as RecoveryRow[]).filter((row) => row.loan_id === loan.id);
    const balance = loanBalance(loan as LoanRow, mine);
    return {
      id: loan.id,
      profileId: loan.profile_id,
      person: personById.get(loan.profile_id) ?? null,
      principal: Number(loan.principal),
      installment: Number(loan.installment),
      installments: loan.installments,
      paidCount: mine.filter((row) => Number(row.amount) > 0).length,
      repaid: round2(Number(loan.principal) - balance),
      balance,
      firstMonth: loan.first_month,
      takenOn: loan.taken_on,
      status: loan.status as LoanView["status"],
      note: loan.note,
    };
  });

  const adjustmentViews: AdjustmentView[] = (adjustments ?? []).map((row) => ({
    id: row.id,
    person: personById.get(row.profile_id) ?? null,
    kind: row.kind,
    amount: Number(row.amount),
    label: row.label,
    note: row.note,
    givenOn: row.given_on,
  }));

  const period = periods?.[0] ?? null;
  let payments: PaymentView[] = [];
  if (period) {
    const { data: items } = await supabase
      .from("payroll_items")
      .select(
        "id, profile_id, net, gross, working_days, days_present, base_pay, ot_pay, weekend_pay, holiday_pay, ot_hours, weekend_hours, holiday_hours, breakdown, paid_amount, paid_difference, paid_note, paid_at",
      )
      .eq("period_id", period.id)
      .range(0, 4999);

    payments = (items ?? [])
      .map((item) => {
        const lines = ((item.breakdown ?? []) as unknown as PayslipLine[]) ?? [];
        return {
          id: item.id,
          profileId: item.profile_id,
          person: personById.get(item.profile_id) ?? null,
          net: Number(item.net),
          gross: Number(item.gross),
          workingDays:
            item.working_days == null ? Number(item.days_present) : Number(item.working_days),
          basePay: Number(item.base_pay),
          overtimeHours:
            Number(item.ot_hours) + Number(item.weekend_hours) + Number(item.holiday_hours),
          overtimePay: Number(item.ot_pay) + Number(item.weekend_pay) + Number(item.holiday_pay),
          ...breakdownOf(lines),
          paidAmount: item.paid_amount == null ? null : Number(item.paid_amount),
          paidDifference: item.paid_difference == null ? null : Number(item.paid_difference),
          paidNote: item.paid_note ?? null,
          paidAt: item.paid_at,
        };
      })
      .sort((a, b) => (a.person?.name ?? "").localeCompare(b.person?.name ?? ""));
  }

  const canManage =
    session.isSuperuser ||
    session.permissions.has("payroll.pay") ||
    session.permissions.has("payroll.run");

  return (
    <SalariesScreen
      month={month}
      previousMonth={shiftMonth(month, -1)}
      nextMonth={shiftMonth(month, 1)}
      period={
        period
          ? {
              id: period.id,
              label: period.label,
              payable: period.status === "approved" || period.status === "paid",
            }
          : null
      }
      payments={payments}
      adjustments={adjustmentViews}
      loans={loanViews}
      people={personOptions}
      canManage={canManage}
      canPay={session.isSuperuser || session.permissions.has("payroll.pay")}
    />
  );
}
