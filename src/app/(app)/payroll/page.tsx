import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { PayrollClient, type ItemRow, type PeriodRow } from "./payroll-client";

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
  const session = await requirePermission("payroll.view");
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
  if (selectedId) {
    const { data: rows } = await supabase
      .from("payroll_items")
      .select("*")
      .eq("period_id", selectedId);

    // The directory is the pay-free view, so a payroll operator can label rows
    // without needing read access to the full profile record.
    const { data: people } = await supabase
      .from("employee_directory")
      .select("id, full_name, employee_code, department_id");
    const { data: departments } = await supabase.from("departments").select("id, name");

    const personById = new Map((people ?? []).map((p) => [p.id, p]));
    const deptById = new Map((departments ?? []).map((d) => [d.id, d.name]));

    items = (rows ?? [])
      .map((row) => {
        const person = personById.get(row.profile_id);
        return {
          id: row.id,
          profile_id: row.profile_id,
          full_name: person?.full_name ?? "Unknown",
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
        };
      })
      .sort((a, b) => b.net - a.net);
  }

  return (
    <PayrollClient
      periods={periodRows}
      items={items}
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
