import type { Metadata } from "next";
import { Banknote, Clock, Coins } from "lucide-react";

import { ExportButtons } from "@/components/export-buttons";
import { FilterBar } from "@/components/filter-bar";
import { matchesPerson } from "@/lib/people/match";
import { Card, SectionTitle } from "@/components/ui-kit";
import { requireAnyPermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { todayInPakistan } from "@/lib/time";

import { PeoplePay, type PayPerson } from "./people-pay";
import { LateRulesEditor, RatesForm, type LateRule, type RateValues } from "./rates-forms";

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
  const canManage = session.permissions.has("rates.manage");
  const supabase = await createClient();

  const [
    { data: sites },
    { data: rules },
    { data: lateRules },
    { data: departments },
    { data: staff },
    { data: components },
  ] = await Promise.all([
    supabase.from("sites").select("id, name").order("name"),
    supabase.from("pay_rules").select("*").order("effective_from", { ascending: false }),
    supabase.from("late_penalty_rules").select("*").order("from_minutes"),
    supabase.from("departments").select("id, name").order("name"),
    supabase
      .from("profiles")
      .select(
        "id, full_name, employee_code, cnic, department_id, worker_type, pay_class, monthly_salary, hourly_rate, duty_hours, sunday_policy, requires_attendance, flexible_hours, overtime_eligible",
      )
      .eq("status", "active")
      .order("full_name"),
    supabase.from("profile_pay_components").select("id, profile_id, label, kind, amount"),
  ]);

  const today = todayInPakistan();

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
      ? (deptName.get(row.department_id) ?? "Unassigned")
      : "Unassigned",
    workerType: row.worker_type,
    payClass: row.pay_class,
    monthlySalary: Number(row.monthly_salary),
    hourlyRate: Number(row.hourly_rate),
    dutyHours: Number(row.duty_hours),
    sundayPolicy: row.sunday_policy,
    requiresAttendance: row.requires_attendance,
    flexibleHours: row.flexible_hours,
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
          title={`Pay by person · ${everyone.length}`}
          subtitle="What each person earns, how many hours their salary covers, and the lines attached to them. Grouped by department."
          action={<ExportButtons kind="pay" params={{ dept: filters.dept }} />}
        />

        <FilterBar
          placeholder="Search by name, employee code or CNIC"
          total={everyone.length}
          showing={people.length}
          filters={[
            {
              name: "dept",
              label: "Department",
              allLabel: "Every department",
              options: (departments ?? []).map((d) => ({ value: d.id, label: d.name })),
            },
            {
              name: "type",
              label: "Paid as",
              allLabel: "Employees and contractors",
              options: [
                { value: "employee", label: "Employees" },
                { value: "contractor", label: "Contractors" },
              ],
            },
          ]}
        />

        {canManage ? (
          <PeoplePay people={people} />
        ) : (
          <p className="rounded-2xl bg-secondary px-4 py-3 text-sm text-muted-foreground">
            You can see pay rules but not change them. Editing needs the &ldquo;Manage pay
            rules&rdquo; capability.
          </p>
        )}
      </Card>

      {(sites ?? []).map((site) => {
        // Effective-dated: the newest row that has already taken effect.
        const current = (rules ?? [])
          .filter((r) => r.site_id === site.id && r.effective_from <= today)
          .at(0) as RateValues | undefined;

        const siteLateRules = (lateRules ?? []).filter((r) => r.site_id === site.id) as LateRule[];

        return (
          <div key={site.id} className="space-y-5">
            <Card className="p-4 sm:p-6">
              <SectionTitle
                icon={Coins}
                title={`Pay rates — ${site.name}`}
                subtitle="Rupees per hour for each kind of worked time"
              />
              {canManage ? (
                <RatesForm
                  siteId={site.id}
                  siteName={site.name}
                  current={current ?? null}
                  today={today}
                />
              ) : (
                <ReadOnlyRates current={current ?? null} />
              )}
            </Card>

            <Card className="p-4 sm:p-6">
              <SectionTitle
                icon={Clock}
                title="Late arrival penalties"
                subtitle="Deducted automatically when someone checks in after their shift start"
              />
              {canManage ? (
                <LateRulesEditor siteId={site.id} rules={siteLateRules} />
              ) : (
                <ReadOnlyLateRules rules={siteLateRules} />
              )}
            </Card>
          </div>
        );
      })}
    </div>
  );
}

function ReadOnlyRates({ current }: { current: RateValues | null }) {
  if (!current) {
    return <p className="text-sm text-muted-foreground">No rates configured for this factory.</p>;
  }
  const rows = [
    ["Overtime", current.ot_hourly_rate],
    ["Weekend / off-day", current.weekend_hourly_rate],
    ["Holiday", current.holiday_hourly_rate],
    ["Night shift", current.night_hourly_rate],
  ] as const;

  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-2xl bg-secondary px-4 py-3">
          <dt className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            {label}
          </dt>
          <dd className="mt-0.5 text-lg font-bold text-foreground">₨ {value} / hour</dd>
        </div>
      ))}
    </dl>
  );
}

function ReadOnlyLateRules({ rules }: { rules: LateRule[] }) {
  if (rules.length === 0) {
    return <p className="text-sm text-muted-foreground">No late penalty configured.</p>;
  }
  return (
    <ul className="space-y-2">
      {rules.map((rule) => (
        <li key={rule.id} className="rounded-2xl bg-secondary px-4 py-3 text-sm">
          <span className="font-semibold text-foreground">{rule.label}</span>
          <span className="text-muted-foreground">
            {" "}
            — {rule.from_minutes} to {rule.to_minutes ?? "∞"} min ·{" "}
          </span>
          <span className="font-bold text-danger">
            {rule.penalty_percent}% of {rule.basis === "month" ? "monthly" : "daily"} pay
          </span>
        </li>
      ))}
    </ul>
  );
}
