import type { Metadata } from "next";
import { Banknote } from "lucide-react";

import { ExportButtons } from "@/components/export-buttons";
import { Fill } from "@/components/fill";
import { Latin } from "@/components/latin";
import { FilterBar } from "@/components/filter-bar";
import { matchesPerson } from "@/lib/people/match";
import { Card, SectionTitle } from "@/components/ui-kit";
import { requireAnyPermission } from "@/lib/auth/session";
import { dictionaryFor, type Dictionary } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

import { ContractFirms } from "./contract-firms";
import { PeoplePay, type PayPerson } from "./people-pay";

export const metadata: Metadata = {
  title: { absolute: "Pay Rates | Rado Dyeing and Textile" },
  description:
    "Overtime, weekend and holiday rates in rupees per hour, plus late-arrival penalties.",
};

export const dynamic = "force-dynamic";

export default async function RatesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; dept?: string; type?: string }>;
}) {
  const filters = await searchParams;
  const session = await requireAnyPermission(["rates.view", "rates.manage"]);
  const t = dictionaryFor(session.profile.language);
  const canManage = session.permissions.has("rates.manage");
  const supabase = await createClient();

  const [{ data: departments }, { data: contractFirms }, { data: staff }, { data: components }] =
    await Promise.all([
      supabase.from("departments").select("id, name").order("name"),
      supabase
        .from("departments")
        .select("id, name, contract_amount, site_id")
        .eq("default_worker_type", "contractor")
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("profiles")
        .select(
          "id, full_name, employee_code, cnic, department_id, worker_type, pay_class, monthly_salary, hourly_rate, duty_hours, sunday_policy, requires_attendance, flexible_hours, payroll_exempt, overtime_eligible",
        )
        .eq("status", "active")
        .order("full_name"),
      supabase.from("profile_pay_components").select("id, profile_id, label, kind, amount"),
    ]);

  const deptName = new Map((departments ?? []).map((d) => [d.id, d.name]));

  const componentsByPerson = new Map<string, PayPerson["components"]>();
  for (const row of components ?? []) {
    const list = componentsByPerson.get(row.profile_id) ?? [];
    list.push({ id: row.id, label: row.label, kind: row.kind, amount: Number(row.amount) });
    componentsByPerson.set(row.profile_id, list);
  }

  const everyone: PayPerson[] = (staff ?? []).map((row) => ({
    id: row.id,
    fullName: row.full_name,
    employeeCode: row.employee_code,
    cnic: row.cnic,
    departmentId: row.department_id,
    // Unassigned people still need somewhere to appear, or they are invisible
    // on the one screen that decides what they are paid.
    departmentName: row.department_id
      ? (deptName.get(row.department_id) ?? t.common.unassigned)
      : t.common.unassigned,
    workerType: row.worker_type,
    payClass: row.pay_class,
    monthlySalary: Number(row.monthly_salary),
    hourlyRate: Number(row.hourly_rate),
    dutyHours: Number(row.duty_hours),
    sundayPolicy: row.sunday_policy,
    requiresAttendance: row.requires_attendance,
    flexibleHours: row.flexible_hours,
    payrollExempt: row.payroll_exempt,
    overtimeEligible: row.overtime_eligible,
    components: componentsByPerson.get(row.id) ?? [],
  }));

  const people = everyone.filter((person) => {
    if (filters.dept && person.departmentId !== filters.dept) return false;
    if (filters.type && person.workerType !== filters.type) return false;
    return matchesPerson(
      { full_name: person.fullName, employee_code: person.employeeCode, cnic: person.cnic },
      filters.q ?? "",
    );
  });

  return (
    <div className="space-y-5 pb-6">
      <Card className="p-4 sm:p-6">
        <SectionTitle
          icon={Banknote}
          title={<Fill template={t.rates.payByPerson} values={{ count: everyone.length }} />}
          subtitle={t.rates.payByPersonHint}
          action={<ExportButtons kind="pay" params={{ dept: filters.dept }} />}
        />

        <FilterBar
          placeholder={t.rates.searchPlaceholder}
          total={everyone.length}
          showing={people.length}
          filters={[
            {
              name: "dept",
              label: t.common.department,
              allLabel: t.common.everyDepartment,
              // Department names are rows, so they are listed as stored.
              options: (departments ?? []).map((d) => ({ value: d.id, label: d.name })),
            },
            {
              name: "type",
              label: t.rates.paidAs,
              allLabel: t.rates.everyone,
              options: [
                { value: "employee", label: t.rates.employees },
                { value: "contractor", label: t.rates.contractors },
              ],
            },
          ]}
        />

        {canManage ? (
          <PeoplePay people={people} />
        ) : (
          <p className="rounded-2xl bg-secondary px-4 py-3 text-sm text-muted-foreground">
            {t.rates.readOnly}
          </p>
        )}
      </Card>

      {canManage ? (
        <ContractFirms
          firms={(contractFirms ?? []).map((firm) => ({
            id: firm.id,
            name: firm.name,
            contractAmount: Number(firm.contract_amount ?? 0),
            // Headcount is a property of the firm, not of whatever search or
            // filter the operator currently has typed in — count from the
            // unfiltered roster.
            headcount: everyone.filter(
              (p) => p.departmentId === firm.id && p.workerType === "contractor",
            ).length,
          }))}
        />
      ) : null}
    </div>
  );
}
