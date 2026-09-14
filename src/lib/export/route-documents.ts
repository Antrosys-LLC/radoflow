import type { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { readMealPrice, summariseMeals, type MealClaimRow } from "@/lib/canteen/history";
import { dailyRate, daysInMonthOf, overtimeRate } from "@/lib/payroll/hours";
import {
  ledgerFor,
  loanBalance,
  monthOf,
  type AdjustmentRow,
  type LoanRow,
  type RecoveryRow,
} from "@/lib/payroll/ledger";
import { groupRegister, toRegisterRow, type RegisterItem } from "@/lib/payroll/register";
import type { PayslipLine } from "@/lib/payroll/types";
import { selectAllInBatches } from "@/lib/supabase/in-batches";
import { formatDate } from "@/lib/time";

import { buildPayslipPdf, buildTablePdf, rs, type TableRow } from "./pdf";
import { registerPdf, registerWorkbook } from "./payroll-documents";
import { buildWorkbook, type SheetRow } from "./xlsx";

/**
 * The downloads that read a saved record rather than recomputing one: the
 * canteen's servings, a pay run's salary register, and a payslip from a run.
 *
 * Kept out of the route so the route stays what it was — a permission check,
 * a query, and a file — and so each document here reads top to bottom.
 */

type Client = Awaited<ReturnType<typeof createClient>>;
type PayrollItem = Database["public"]["Tables"]["payroll_items"]["Row"];

export type Document =
  | { ok: true; body: Buffer; name: string; type: string }
  | { ok: false; error: string; status: number };

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PDF = "application/pdf";

interface DirectoryRow {
  id: string | null;
  full_name: string | null;
  employee_code: string | null;
  department_id: string | null;
  designation: string | null;
}

async function directory(
  supabase: Client,
  ids: readonly string[],
): Promise<Map<string, DirectoryRow>> {
  if (ids.length === 0) return new Map();
  const rows = await selectAllInBatches<DirectoryRow>(
    [...ids],
    (batch, first, last) =>
      supabase
        .from("employee_directory")
        .select("id, full_name, employee_code, department_id, designation")
        .in("id", batch)
        .order("id")
        .range(first, last),
    "Could not read the people on this document",
  );
  return new Map(rows.flatMap((row) => (row.id ? [[row.id, row] as const] : [])));
}

async function departmentNames(supabase: Client): Promise<Map<string, string>> {
  const { data } = await supabase.from("departments").select("id, name");
  return new Map((data ?? []).map((row) => [row.id, row.name]));
}

// ---------------------------------------------------------------------------
// Canteen
// ---------------------------------------------------------------------------

async function mealClaims(
  supabase: Client,
  from: string,
  to: string,
): Promise<(MealClaimRow & { claimed_at?: string })[]> {
  const claims: (MealClaimRow & { claimed_at?: string })[] = [];
  const PAGE = 1000;
  let withPrice = true;

  for (let page = 0; page < 200; page++) {
    const columns = withPrice
      ? "id, profile_id, meal_window_id, served_on, claimed_at, price_pkr"
      : "id, profile_id, meal_window_id, served_on, claimed_at";
    const { data, error } = await supabase
      .from("meal_claims")
      .select(columns)
      .gte("served_on", from)
      .lte("served_on", to)
      .order("served_on")
      .order("id")
      .range(page * PAGE, page * PAGE + PAGE - 1);

    if (error) {
      // A database without the price column still has a register to download.
      if (withPrice && page === 0) {
        withPrice = false;
        page = -1;
        continue;
      }
      throw new Error(`Could not read the canteen register: ${error.message}`);
    }

    claims.push(...((data ?? []) as unknown as (MealClaimRow & { claimed_at?: string })[]));
    if (!data || data.length < PAGE) break;
  }

  return claims;
}

export async function canteenDocument(
  supabase: Client,
  { from, to, format }: { from: string; to: string; format: "pdf" | "xlsx" },
): Promise<Document> {
  const [{ data: priceSetting }, { data: windows }, claims, deptName] = await Promise.all([
    supabase.from("app_settings").select("value").eq("key", "canteen.meal_price_pkr").maybeSingle(),
    supabase.from("meal_windows").select("id, name"),
    mealClaims(supabase, from, to),
    departmentNames(supabase),
  ]);

  const price = readMealPrice(priceSetting?.value);
  const summary = summariseMeals(claims, price);
  const people = await directory(
    supabase,
    summary.byPerson.map((row) => row.profileId),
  );
  const windowName = new Map((windows ?? []).map((row) => [row.id, row.name]));

  const departmentOf = (profileId: string) => {
    const id = people.get(profileId)?.department_id;
    return (id && deptName.get(id)) || "Unassigned";
  };

  // People by department, each department closed with its own totals.
  const byDepartment = new Map<string, typeof summary.byPerson>();
  for (const row of summary.byPerson) {
    const key = departmentOf(row.profileId);
    byDepartment.set(key, [...(byDepartment.get(key) ?? []), row]);
  }
  const departments = [...byDepartment].sort(([a], [b]) => a.localeCompare(b));

  const subtitle = `${formatDate(from)} to ${formatDate(to)}`;
  const note =
    summary.total.unpriced > 0
      ? price === null
        ? `${summary.total.unpriced} meals have no price set.`
        : `${summary.total.unpriced} meals served before a price was set are counted at ${rs(price)}.`
      : "Each meal is counted at the price it was served at.";

  if (format === "pdf") {
    const rows: TableRow[] = [];
    for (const [department, list] of departments) {
      rows.push({ group: `${department}  ·  ${list.length} people` });
      const sorted = [...list].sort((a, b) =>
        (people.get(a.profileId)?.full_name ?? "").localeCompare(
          people.get(b.profileId)?.full_name ?? "",
        ),
      );
      sorted.forEach((row, index) => {
        const who = people.get(row.profileId);
        rows.push([
          index + 1,
          who?.full_name ?? "—",
          who?.employee_code ?? "",
          row.meals,
          Math.round(row.amount),
        ]);
      });
      rows.push({
        subtotal: [
          "",
          `Total · ${department}`,
          "",
          list.reduce((t, r) => t + r.meals, 0),
          Math.round(list.reduce((t, r) => t + r.amount, 0)),
        ],
      });
    }

    return {
      ok: true,
      body: buildTablePdf({
        title: "CANTEEN REGISTER",
        subtitle,
        columns: [
          { header: "SR", width: 26, align: "center" },
          { header: "NAME", width: 200 },
          { header: "UNIQUE ID", width: 80 },
          { header: "MEALS", width: 60, align: "right" },
          { header: "AMOUNT (Rs)", width: 90, align: "right" },
        ],
        rows,
        totals: [
          "",
          `GRAND TOTAL · ${summary.byPerson.length} people`,
          "",
          summary.total.meals,
          Math.round(summary.total.amount),
        ],
        highlights: [
          { label: "Meals served", value: summary.total.meals.toLocaleString("en-PK") },
          { label: "Total cost", value: rs(summary.total.amount) },
          { label: "Price per meal", value: price === null ? "Not set" : rs(price) },
          { label: "People fed", value: summary.byPerson.length.toLocaleString("en-PK") },
        ],
        footer: note,
      }),
      name: `canteen-${from}-to-${to}.pdf`,
      type: PDF,
    };
  }

  const personRows: SheetRow[] = [];
  for (const [department, list] of departments) {
    personRows.push({ group: `${department}  ·  ${list.length} people` });
    list.forEach((row, index) => {
      const who = people.get(row.profileId);
      personRows.push([
        index + 1,
        who?.full_name ?? "",
        who?.employee_code ?? "",
        row.meals,
        row.amount,
      ]);
    });
    personRows.push({
      subtotal: [
        "",
        `Total · ${department}`,
        "",
        list.reduce((t, r) => t + r.meals, 0),
        list.reduce((t, r) => t + r.amount, 0),
      ],
    });
  }

  return {
    ok: true,
    body: buildWorkbook([
      {
        name: "By person",
        title: "CANTEEN REGISTER",
        subtitle: `${subtitle} · ${note}`,
        orientation: "portrait",
        columns: [
          { header: "SR", width: 6, format: "number" },
          { header: "NAME", width: 30, format: "text" },
          { header: "UNIQUE ID", width: 14, format: "text" },
          { header: "MEALS", width: 10, format: "number" },
          { header: "AMOUNT (Rs)", width: 15, format: "money" },
        ],
        rows: personRows,
        totals: [
          "",
          `GRAND TOTAL · ${summary.byPerson.length} people`,
          "",
          summary.total.meals,
          summary.total.amount,
        ],
      },
      {
        name: "By day",
        title: "CANTEEN — BY DAY",
        subtitle,
        orientation: "portrait",
        columns: [
          { header: "DATE", width: 14, format: "text" },
          { header: "MEALS", width: 10, format: "number" },
          { header: "AMOUNT (Rs)", width: 15, format: "money" },
        ],
        rows: summary.byDay.map((day) => [day.date, day.meals, day.amount]),
        totals: ["TOTAL", summary.total.meals, summary.total.amount],
      },
      {
        name: "Every meal",
        title: "CANTEEN — EVERY MEAL SERVED",
        subtitle,
        columns: [
          { header: "DATE", width: 12, format: "text" },
          { header: "MEAL", width: 16, format: "text" },
          { header: "NAME", width: 28, format: "text" },
          { header: "UNIQUE ID", width: 13, format: "text" },
          { header: "DEPARTMENT", width: 20, format: "text" },
          { header: "PRICE (Rs)", width: 12, format: "money" },
        ],
        rows: claims.map((claim) => {
          const who = people.get(claim.profile_id);
          const stamped =
            claim.price_pkr === null || claim.price_pkr === undefined
              ? null
              : Number(claim.price_pkr);
          return [
            claim.served_on,
            (claim.meal_window_id && windowName.get(claim.meal_window_id)) || "",
            who?.full_name ?? "",
            who?.employee_code ?? "",
            departmentOf(claim.profile_id),
            stamped ?? price ?? null,
          ];
        }),
        totals: ["", `${claims.length} meals`, "", "", "", summary.total.amount],
      },
    ]),
    name: `canteen-${from}-to-${to}.xlsx`,
    type: XLSX,
  };
}

// ---------------------------------------------------------------------------
// Salary register from a pay run
// ---------------------------------------------------------------------------

async function payrollItems(supabase: Client, periodId: string): Promise<PayrollItem[]> {
  const items: PayrollItem[] = [];
  const PAGE = 1000;
  for (let page = 0; page < 20; page++) {
    const { data, error } = await supabase
      .from("payroll_items")
      .select("*")
      .eq("period_id", periodId)
      .order("id")
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(`Could not read the pay run: ${error.message}`);
    items.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return items;
}

/** One saved pay line, in the register's terms. */
export function registerItemFromPayroll(
  item: PayrollItem,
  who: DirectoryRow | undefined,
  department: string,
  fallbackSalary: number,
): RegisterItem {
  const lines = (item.breakdown ?? []) as unknown as PayslipLine[];
  return {
    profileId: item.profile_id,
    name: who?.full_name ?? "—",
    code: who?.employee_code ?? "",
    designation: who?.designation ?? "",
    department,
    monthlySalary: item.monthly_salary == null ? fallbackSalary : Number(item.monthly_salary),
    workingDays: item.working_days == null ? Number(item.days_present) : Number(item.working_days),
    basePay: Number(item.base_pay),
    overtimeHours: Number(item.ot_hours) + Number(item.weekend_hours) + Number(item.holiday_hours),
    overtimePay: Number(item.ot_pay) + Number(item.weekend_pay) + Number(item.holiday_pay),
    gross: Number(item.gross),
    withheld: Number(item.deductions) + Number(item.tax),
    net: Number(item.net),
    lines,
  };
}

export async function registerDocument(
  supabase: Client,
  { periodId, format }: { periodId: string; format: "pdf" | "xlsx" },
): Promise<Document> {
  const { data: period } = await supabase
    .from("payroll_periods")
    .select("id, label, period_start, period_end")
    .eq("id", periodId)
    .maybeSingle();
  if (!period) return { ok: false, error: "No such pay run.", status: 404 };

  const items = await payrollItems(supabase, period.id);
  const ids = items.map((item) => item.profile_id);
  const [people, deptName] = await Promise.all([
    directory(supabase, ids),
    departmentNames(supabase),
  ]);

  // Only a run saved before the salary column existed needs the profile's.
  const needsSalary = items.some((item) => item.monthly_salary == null);
  const salaries = new Map<string, number>();
  if (needsSalary && ids.length > 0) {
    const rows = await selectAllInBatches<{ id: string; monthly_salary: number }>(
      ids,
      (batch, first, last) =>
        supabase
          .from("profiles")
          .select("id, monthly_salary")
          .in("id", batch)
          .order("id")
          .range(first, last),
      "Could not read salaries",
    ).catch(() => []);
    for (const row of rows) salaries.set(row.id, Number(row.monthly_salary));
  }

  const groups = groupRegister(
    items.map((item) => {
      const who = people.get(item.profile_id);
      const department = (who?.department_id && deptName.get(who.department_id)) || "Unassigned";
      return toRegisterRow(
        registerItemFromPayroll(item, who, department, salaries.get(item.profile_id) ?? 0),
      );
    }),
  );

  const meta = {
    title: "SALARY REGISTER",
    subtitle: `${period.label} · ${formatDate(period.period_start)} to ${formatDate(period.period_end)}`,
  };
  const month = period.period_start.slice(0, 7);

  return format === "pdf"
    ? { ok: true, body: registerPdf(groups, meta), name: `salary-register-${month}.pdf`, type: PDF }
    : {
        ok: true,
        body: registerWorkbook(groups, meta),
        name: `salary-register-${month}.xlsx`,
        type: XLSX,
      };
}

// ---------------------------------------------------------------------------
// A payslip from a pay run
// ---------------------------------------------------------------------------

export async function payslipFromRun(
  supabase: Client,
  { periodId, profileId }: { periodId: string; profileId: string },
): Promise<Document> {
  const [{ data: period }, { data: item }, people, deptName] = await Promise.all([
    supabase
      .from("payroll_periods")
      .select("id, label, period_start, period_end")
      .eq("id", periodId)
      .maybeSingle(),
    supabase
      .from("payroll_items")
      .select("*")
      .eq("period_id", periodId)
      .eq("profile_id", profileId)
      .maybeSingle(),
    directory(supabase, [profileId]),
    departmentNames(supabase),
  ]);

  if (!period || !item) {
    return {
      ok: false,
      error: "There is no payslip for this person in that pay run.",
      status: 404,
    };
  }

  const who = people.get(profileId);
  const { data: profile } = await supabase
    .from("profiles")
    .select("monthly_salary, duty_hours")
    .eq("id", profileId)
    .maybeSingle();

  const register = registerItemFromPayroll(
    item,
    who,
    (who?.department_id && deptName.get(who.department_id)) || "",
    Number(profile?.monthly_salary ?? 0),
  );
  const daysInMonth = daysInMonthOf(period.period_start);
  const lines = register.lines;

  // Loans still being paid back, with what is left after this slip.
  const loans: { label: string; installment: number; balance: number }[] = [];
  const { data: loanRows, error: loanError } = await supabase
    .from("employee_loans")
    .select("id, profile_id, principal, installment, installments, first_month, status, taken_on")
    .eq("profile_id", profileId);
  if (!loanError && loanRows && loanRows.length > 0) {
    const { data: recoveries } = await supabase
      .from("loan_recoveries")
      .select("loan_id, month, amount, source")
      .in(
        "loan_id",
        loanRows.map((loan) => loan.id),
      );
    const month = monthOf(period.period_start);
    for (const loan of loanRows) {
      const upToThisSlip = ((recoveries ?? []) as RecoveryRow[]).filter(
        (row) => row.month <= month,
      );
      const thisMonth = upToThisSlip
        .filter((row) => row.loan_id === loan.id && row.month === month)
        .reduce((total, row) => total + Number(row.amount), 0);
      if (loan.status !== "active" && thisMonth === 0) continue;
      loans.push({
        label: `Loan of ${rs(Number(loan.principal))} taken ${formatDate(loan.taken_on)}`,
        installment: thisMonth,
        balance: loanBalance(loan as LoanRow, upToThisSlip),
      });
    }
  }

  const dutyHours = Number(profile?.duty_hours ?? 8);

  return {
    ok: true,
    body: buildPayslipPdf({
      employeeName: register.name,
      employeeCode: register.code,
      department: register.department,
      designation: register.designation || undefined,
      period: period.label,
      reference: `PS-${period.period_start.slice(0, 7)}-${register.code || profileId.slice(0, 8)}`,
      facts: [
        { label: "S Rate (monthly salary)", value: rs(register.monthlySalary) },
        { label: "Days in the month", value: String(daysInMonth) },
        {
          label: "Daily rate",
          value: `Rs ${dailyRate(register.monthlySalary, daysInMonth).toLocaleString("en-PK")}`,
        },
        { label: "Days worked", value: String(register.workingDays) },
        { label: "Overtime hours", value: String(Math.round(register.overtimeHours * 100) / 100) },
        {
          label: "Overtime rate",
          value: `Rs ${overtimeRate(register.monthlySalary, daysInMonth).toLocaleString("en-PK")} / h`,
        },
        { label: "Salary covers", value: `${dutyHours} hours a day` },
        { label: "Days absent", value: String(Number(item.days_absent)) },
      ],
      earnings: lines
        .filter((line) => line.kind === "base" || line.kind === "earning")
        .map((line) => ({ label: line.label, amount: line.amount })),
      deductions: lines
        .filter((line) => line.kind === "deduction" || line.kind === "tax")
        .map((line) => ({ label: line.label, amount: line.amount })),
      net: register.net,
      paid:
        item.paid_amount == null
          ? undefined
          : {
              amount: Number(item.paid_amount),
              note: item.paid_note ?? undefined,
              on: item.paid_at ? formatDate(item.paid_at) : undefined,
            },
      loans,
      footer: `${period.label} · Sundays are not working days; hours worked on one are overtime.`,
    }),
    name: `payslip-${register.code || profileId.slice(0, 8)}-${period.period_start.slice(0, 7)}.pdf`,
    type: PDF,
  };
}

// ---------------------------------------------------------------------------
// The live salary register — before a pay run exists
// ---------------------------------------------------------------------------

export interface LiveRegisterPerson {
  id: string;
  full_name: string;
  employee_code: string;
  designation: string | null;
  department_id: string | null;
  monthly_salary: number | string;
}

export interface LiveFigures {
  person: LiveRegisterPerson;
  workingDays: number;
  overtime: number;
  base: number;
  otPay: number;
}

/** The ledger for a month, or nothing on a database that has not got one. */
async function ledgerOf(supabase: Client, ids: readonly string[], month: string) {
  const empty = {
    adjustments: [] as AdjustmentRow[],
    loans: [] as LoanRow[],
    recoveries: [] as RecoveryRow[],
  };
  if (ids.length === 0) return empty;
  try {
    const [adjustments, loans] = await Promise.all([
      selectAllInBatches<AdjustmentRow>(
        [...ids],
        (batch, first, last) =>
          supabase
            .from("salary_adjustments")
            .select("profile_id, kind, amount, label, month")
            .eq("month", month)
            .in("profile_id", batch)
            .order("id")
            .range(first, last),
        "Could not read the salary ledger",
      ),
      selectAllInBatches<LoanRow>(
        [...ids],
        (batch, first, last) =>
          supabase
            .from("employee_loans")
            .select("id, profile_id, principal, installment, installments, first_month, status")
            .eq("status", "active")
            .in("profile_id", batch)
            .order("id")
            .range(first, last),
        "Could not read loans",
      ),
    ]);
    const recoveries =
      loans.length === 0
        ? []
        : await selectAllInBatches<RecoveryRow>(
            loans.map((loan) => loan.id),
            (batch, first, last) =>
              supabase
                .from("loan_recoveries")
                .select("loan_id, month, amount, source")
                .in("loan_id", batch)
                .order("id")
                .range(first, last),
            "Could not read loan recoveries",
          );
    return { adjustments, loans, recoveries };
  } catch {
    return empty;
  }
}

export async function liveRegisterDocument(
  supabase: Client,
  {
    figures,
    from,
    to,
    scope,
    format,
  }: {
    figures: readonly LiveFigures[];
    from: string;
    to: string;
    scope: string;
    format: "pdf" | "xlsx";
  },
): Promise<Document> {
  const ids = figures.map((row) => row.person.id);
  const month = monthOf(from);

  const [ledger, deptName, personal] = await Promise.all([
    ledgerOf(supabase, ids, month),
    departmentNames(supabase),
    ids.length === 0
      ? Promise.resolve([])
      : selectAllInBatches<{
          profile_id: string;
          code: string;
          label: string;
          kind: "earning" | "deduction" | "tax";
          amount: number;
          effective_from: string;
          effective_to: string | null;
        }>(
          ids,
          (batch, first, last) =>
            supabase
              .from("profile_pay_components")
              .select("profile_id, code, label, kind, amount, effective_from, effective_to")
              .in("profile_id", batch)
              .order("id")
              .range(first, last),
          "Could not read allowances and deductions",
        ).catch(() => []),
  ]);

  const items: RegisterItem[] = figures.map((row) => {
    const own = personal
      .filter(
        (line) =>
          line.profile_id === row.person.id &&
          line.effective_from <= to &&
          (!line.effective_to || line.effective_to >= from),
      )
      .map((line) => ({
        code: line.code,
        label: line.label,
        kind: line.kind,
        amount: Number(line.amount),
      }));
    const fromLedger = ledgerFor(
      row.person.id,
      month,
      ledger.adjustments,
      ledger.loans,
      ledger.recoveries,
    ).components.map((line) => ({
      code: line.code,
      label: line.label,
      kind: line.kind,
      amount: line.amount,
    }));
    const lines: PayslipLine[] = [...own, ...fromLedger];

    const earnings = lines
      .filter((line) => line.kind === "earning")
      .reduce((t, l) => t + l.amount, 0);
    const withheld = lines
      .filter((line) => line.kind !== "earning")
      .reduce((t, l) => t + l.amount, 0);
    const gross = row.base + row.otPay + earnings;

    return {
      profileId: row.person.id,
      name: row.person.full_name,
      code: row.person.employee_code,
      designation: row.person.designation ?? "",
      department:
        (row.person.department_id && deptName.get(row.person.department_id)) || "Unassigned",
      monthlySalary: Number(row.person.monthly_salary),
      workingDays: row.workingDays,
      basePay: row.base,
      overtimeHours: row.overtime,
      overtimePay: row.otPay,
      gross,
      withheld,
      net: Math.max(0, gross - withheld),
      lines,
    };
  });

  const groups = groupRegister(items.map(toRegisterRow));
  const meta = {
    title: "SALARY REGISTER",
    subtitle: `${scope} · ${formatDate(from)} to ${formatDate(to)} · worked out from attendance so far`,
  };
  const stamp = from.slice(0, 7);

  return format === "pdf"
    ? { ok: true, body: registerPdf(groups, meta), name: `salary-register-${stamp}.pdf`, type: PDF }
    : {
        ok: true,
        body: registerWorkbook(groups, meta),
        name: `salary-register-${stamp}.xlsx`,
        type: XLSX,
      };
}
