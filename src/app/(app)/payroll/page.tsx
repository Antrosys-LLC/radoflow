import type { Metadata } from "next";

import { loadAnomalyCandidates } from "@/lib/assistant/payroll-review";
import { requireAnyPermission } from "@/lib/auth/session";
import { dictionaryFor } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

import { PayrollClient, type ContractRow, type ItemRow, type PeriodRow } from "./payroll-client";

export const metadata: Metadata = {
  title: { absolute: "Payroll | Rado Dyeing and Textile" },
  description: "Pay runs calculated from real biometric attendance, with payslips.",
};

export const dynamic = "force-dynamic";

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const session = await requireAnyPermission(["payroll.view", "payroll.run"]);
  const t = dictionaryFor(session.profile.language);
  const { period: requestedPeriod } = await searchParams;
  const supabase = await createClient();

  const [{ data: periods }, { data: sites }] = await Promise.all([
    supabase.from("payroll_periods").select("*").order("period_start", { ascending: false }),
    supabase.from("sites").select("id, name").order("name"),
  ]);

  const siteName = new Map((sites ?? []).map((s) => [s.id, s.name]));

  const periodRows: PeriodRow[] = (periods ?? []).map((p) => ({
    id: p.id,
    label: p.label,
    period_start: p.period_start,
    period_end: p.period_end,
    status: p.status,
    headcount: p.headcount,
    total_gross: Number(p.total_gross),
    total_deductions: Number(p.total_deductions),
    total_tax: Number(p.total_tax),
    total_net: Number(p.total_net),
    locked: p.locked,
    siteName: siteName.get(p.site_id) ?? "—",
  }));

  const selectedId = requestedPeriod ?? periodRows[0]?.id ?? null;

  let items: ItemRow[] = [];
  let contracts: ContractRow[] = [];
  if (selectedId) {
    /*
     * Three independent reads, so three round trips run at once rather than
     * one after another. Nothing here depends on anything else here — the
     * lines, the names and the department labels are joined in memory below —
     * and on a payroll of four hundred the difference is the whole wait.
     *
     * The directory is the pay-free view, so a payroll operator can label rows
     * without needing read access to the full profile record.
     */
    const [{ data: rows }, { data: people }, { data: departments }] = await Promise.all([
      supabase.from("payroll_items").select("*").eq("period_id", selectedId),
      supabase
        .from("employee_directory")
        .select("id, full_name, employee_code, department_id, designation"),
      supabase.from("departments").select("id, name"),
    ]);

    const personById = new Map((people ?? []).map((p) => [p.id, p]));
    const deptById = new Map((departments ?? []).map((d) => [d.id, d.name]));

    items = (rows ?? [])
      .map((row) => {
        const person = personById.get(row.profile_id);
        return {
          id: row.id,
          profile_id: row.profile_id,
          full_name: person?.full_name ?? t.payroll.unknownPerson,
          employee_code: person?.employee_code ?? "—",
          department: deptById.get(person?.department_id ?? "") ?? "—",
          pay_class: row.pay_class,
          regular_hours: Number(row.regular_hours),
          ot_hours: Number(row.ot_hours),
          weekend_hours: Number(row.weekend_hours),
          gross: Number(row.gross),
          deductions: Number(row.deductions),
          tax: Number(row.tax),
          net: Number(row.net),
          breakdown: (row.breakdown ?? []) as ItemRow["breakdown"],
          flaggedHours: Number(row.flagged_hours ?? 0),
          flaggedDays: (row.flagged_days ?? []) as ItemRow["flaggedDays"],
          reviewNote: row.review_note,
          paidAt: row.paid_at,
          /*
           * `== null`, not `=== null`: these three columns arrive with a
           * migration, and this row is `select("*")`, so on a database that
           * has not had it run they come back missing rather than null.
           * `Number(undefined)` is NaN, which reaches the screen as a payment
           * of "NaN" against somebody's name.
           */
          paidAmount: row.paid_amount == null ? null : Number(row.paid_amount),
          paidDifference: row.paid_difference == null ? null : Number(row.paid_difference),
          paidNote: row.paid_note ?? null,
          register: {
            profileId: row.profile_id,
            name: person?.full_name ?? t.payroll.unknownPerson,
            code: person?.employee_code ?? "",
            designation: person?.designation ?? "",
            department: deptById.get(person?.department_id ?? "") ?? "—",
            // Null on a run saved before the column existed; re-running fills it.
            monthlySalary: row.monthly_salary == null ? 0 : Number(row.monthly_salary),
            workingDays:
              row.working_days == null ? Number(row.days_present) : Number(row.working_days),
            basePay: Number(row.base_pay),
            overtimeHours:
              Number(row.ot_hours) + Number(row.weekend_hours) + Number(row.holiday_hours),
            overtimePay: Number(row.ot_pay) + Number(row.weekend_pay) + Number(row.holiday_pay),
            gross: Number(row.gross),
            withheld: Number(row.deductions) + Number(row.tax),
            net: Number(row.net),
            lines: (row.breakdown ?? []) as ItemRow["breakdown"] as never,
          },
        };
      })
      .sort((a, b) => b.net - a.net);

    /*
     * Every line worth a look carries its reason in plain words. The note an
     * assistant may have written is kept; where there is none, the reason is
     * read straight from the saved run, so nobody is told to "look" without
     * being told at what.
     */
    const reasons = await loadAnomalyCandidates(selectedId)
      .then((result) => new Map(result.candidates.map((c) => [c.profileId, c.note])))
      .catch(() => new Map<string, string>());
    items = items.map((item) =>
      item.reviewNote ? item : { ...item, reviewNote: reasons.get(item.profile_id) || null },
    );

    /*
     * A contract firm is billed once, from its department, and has no pay line
     * of its own — so it is read separately, or the screen shows a run that
     * is smaller than the total above it.
     */
    const { data: contractRows } = await supabase
      .from("payroll_contract_items")
      .select("id, department_id, amount, headcount, note")
      .eq("period_id", selectedId);
    contracts = (contractRows ?? [])
      .map((row) => ({
        id: row.id,
        department: deptById.get(row.department_id) ?? "—",
        amount: Number(row.amount),
        headcount: row.headcount,
        note: row.note,
      }))
      .sort((a, b) => b.amount - a.amount);
  }

  return (
    <PayrollClient
      periods={periodRows}
      items={items}
      contracts={contracts}
      selectedId={selectedId}
      sites={sites ?? []}
      can={{
        run: session.permissions.has("payroll.run"),
        approve: session.permissions.has("payroll.approve"),
        pay: session.permissions.has("payroll.pay"),
      }}
    />
  );
}
