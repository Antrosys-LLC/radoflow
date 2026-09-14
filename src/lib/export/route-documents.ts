import type { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { readMealPrice, summariseMeals, type MealClaimRow } from "@/lib/canteen/history";
import { dayPrices } from "@/lib/canteen/menu";
import { loadMenus } from "@/lib/canteen/menu-data";
import { dailyRate, daysInMonthOf, overtimeRate } from "@/lib/payroll/hours";
import { loanBalance, monthOf, type LoanRow, type RecoveryRow } from "@/lib/payroll/ledger";
import { groupRegister, toRegisterRow, type RegisterItem } from "@/lib/payroll/register";
import type { PayslipLine } from "@/lib/payroll/types";
import { selectAllInBatches } from "@/lib/supabase/in-batches";
import { formatDate } from "@/lib/time";

import { buildPayslipPdf, buildTablePdf, rs, standardFooter, type TableRow } from "./pdf";
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

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * A date range the way the office writes it: "1 to 9 September 2026",
 * "28 August to 3 September 2026", "9 September 2026".
 */
export function rangeLabel(from: string, to: string): string {
  const parse = (date: string) => ({
    day: Number(date.slice(8, 10)),
    month: MONTHS[Number(date.slice(5, 7)) - 1] ?? "",
    year: date.slice(0, 4),
  });
  const a = parse(from);
  const b = parse(to);
  if (from === to) return `${a.day} ${a.month} ${a.year}`;
  if (a.year !== b.year) return `${a.day} ${a.month} ${a.year} to ${b.day} ${b.month} ${b.year}`;
  if (a.month !== b.month) return `${a.day} ${a.month} to ${b.day} ${b.month} ${b.year}`;
  return `${a.day} to ${b.day} ${b.month} ${b.year}`;
}

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
  const [{ data: priceSetting }, { data: windows }, claims, deptName, menu] = await Promise.all([
    supabase.from("app_settings").select("value").eq("key", "canteen.meal_price_pkr").maybeSingle(),
    supabase.from("meal_windows").select("id, name"),
    mealClaims(supabase, from, to),
    departmentNames(supabase),
    loadMenus(supabase, from, to),
  ]);

  const price = readMealPrice(priceSetting?.value);
  const summary = summariseMeals(claims, price, dayPrices(menu.menus));
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
        footer: standardFooter(rangeLabel(from, to), note.replace(/\.$/, "")),
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

/**
 * What the canteen is owed for a day or a month: one line per day with what
 * was cooked, the price of one meal, how many were served and what they came
 * to — then the same total split by department, which is how it is recharged.
 */
export async function canteenInvoiceDocument(
  supabase: Client,
  { from, to, format }: { from: string; to: string; format: "pdf" | "xlsx" },
): Promise<Document> {
  const [{ data: priceSetting }, claims, deptName, menu] = await Promise.all([
    supabase.from("app_settings").select("value").eq("key", "canteen.meal_price_pkr").maybeSingle(),
    mealClaims(supabase, from, to),
    departmentNames(supabase),
    loadMenus(supabase, from, to),
  ]);

  const price = readMealPrice(priceSetting?.value);
  const prices = dayPrices(menu.menus);
  const summary = summariseMeals(claims, price, prices);
  const people = await directory(
    supabase,
    summary.byPerson.map((row) => row.profileId),
  );

  const period = rangeLabel(from, to);
  const daily = from === to;
  const title = daily ? "CANTEEN INVOICE — DAILY" : "CANTEEN INVOICE";
  const reference = `CI-${from.replace(/-/g, "")}${daily ? "" : `-${to.replace(/-/g, "")}`}`;
  const menuOf = new Map(menu.menus.map((m) => [m.date, m]));
  const servedByDay = new Map(summary.byDay.map((day) => [day.date, day]));

  const dayLines = menu.menus
    .filter((m) => m.items.length > 0 || servedByDay.has(m.date))
    .map((m) => {
      const served = servedByDay.get(m.date);
      const meals = served?.meals ?? 0;
      const amount = served?.amount ?? 0;
      const perMeal = m.items.length > 0 ? m.price : meals > 0 ? amount / meals : (price ?? 0);
      const named = (items: readonly { name: string; price: number }[]) =>
        items.map((item) => `${item.name} ${Math.round(item.price)}`);
      const dishes =
        m.source === "choose"
          ? `${[...named(m.fixed), named(m.options).join(" or ")].join(", ")} — not chosen yet, counted at ${Math.round(m.price)}`
          : m.items.length > 0
            ? named(m.items).join(", ")
            : "No menu — flat price";
      return {
        date: m.date,
        dishes,
        perMeal,
        meals,
        amount,
      };
    });

  // Days with servings the menu plan did not cover (none, normally).
  for (const day of summary.byDay) {
    if (menuOf.has(day.date)) continue;
    dayLines.push({
      date: day.date,
      dishes: "No menu — flat price",
      perMeal: day.meals > 0 ? day.amount / day.meals : 0,
      meals: day.meals,
      amount: day.amount,
    });
  }
  dayLines.sort((a, b) => a.date.localeCompare(b.date));

  const byDepartment = new Map<string, { meals: number; amount: number; people: number }>();
  for (const row of summary.byPerson) {
    const id = people.get(row.profileId)?.department_id;
    const key = (id && deptName.get(id)) || "Unassigned";
    const entry = byDepartment.get(key) ?? { meals: 0, amount: 0, people: 0 };
    entry.meals += row.meals;
    entry.amount += row.amount;
    entry.people += 1;
    byDepartment.set(key, entry);
  }
  const departments = [...byDepartment].sort(([a], [b]) => a.localeCompare(b));

  const highlights = [
    { label: "Invoice no.", value: reference },
    { label: "Meals served", value: summary.total.meals.toLocaleString("en-PK") },
    { label: "People fed", value: summary.byPerson.length.toLocaleString("en-PK") },
    { label: "Amount due", value: rs(summary.total.amount) },
  ];

  if (format === "pdf") {
    const rows: TableRow[] = [{ group: "By day" }];
    dayLines.forEach((line) =>
      rows.push([
        formatDate(line.date),
        line.dishes,
        Math.round(line.perMeal),
        line.meals,
        Math.round(line.amount),
      ]),
    );
    rows.push({ group: "By department" });
    departments.forEach(([name, entry]) =>
      rows.push([name, `${entry.people} people`, "", entry.meals, Math.round(entry.amount)]),
    );

    return {
      ok: true,
      body: buildTablePdf({
        title,
        subtitle: period,
        columns: [
          { header: "DATE", width: 70 },
          { header: "MENU", width: 250 },
          { header: "PER MEAL (Rs)", width: 70, align: "right" },
          { header: "MEALS", width: 50, align: "right" },
          { header: "AMOUNT (Rs)", width: 80, align: "right" },
        ],
        rows,
        totals: ["", "TOTAL DUE", "", summary.total.meals, Math.round(summary.total.amount)],
        highlights,
        footer: standardFooter(period, `Invoice ${reference}`),
      }),
      name: `canteen-invoice-${daily ? from : `${from}-to-${to}`}.pdf`,
      type: PDF,
    };
  }

  return {
    ok: true,
    body: buildWorkbook([
      {
        name: "Invoice",
        title,
        subtitle: `${period} · Invoice ${reference}`,
        columns: [
          { header: "DATE", width: 13, format: "text" },
          { header: "MENU", width: 46, format: "text" },
          { header: "PER MEAL (Rs)", width: 14, format: "money" },
          { header: "MEALS", width: 10, format: "number" },
          { header: "AMOUNT (Rs)", width: 15, format: "money" },
        ],
        rows: dayLines.map((line) => [
          line.date,
          line.dishes,
          line.perMeal,
          line.meals,
          line.amount,
        ]),
        totals: ["TOTAL DUE", "", "", summary.total.meals, summary.total.amount],
      },
      {
        name: "By department",
        title: `${title} — BY DEPARTMENT`,
        subtitle: period,
        orientation: "portrait",
        columns: [
          { header: "DEPARTMENT", width: 26, format: "text" },
          { header: "PEOPLE", width: 10, format: "number" },
          { header: "MEALS", width: 10, format: "number" },
          { header: "AMOUNT (Rs)", width: 15, format: "money" },
        ],
        rows: departments.map(([name, entry]) => [name, entry.people, entry.meals, entry.amount]),
        totals: ["TOTAL", summary.byPerson.length, summary.total.meals, summary.total.amount],
      },
    ]),
    name: `canteen-invoice-${daily ? from : `${from}-to-${to}`}.xlsx`,
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
    footer: standardFooter(rangeLabel(period.period_start, period.period_end)),
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

  const loans = await loansOnSlip(supabase, profileId, monthOf(period.period_start));
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
      footer: standardFooter(period.label),
    }),
    name: `payslip-${register.code || profileId.slice(0, 8)}-${period.period_start.slice(0, 7)}.pdf`,
    type: PDF,
  };
}

/**
 * Loans still being paid back, with what came off this month and what is
 * left after it — the table at the foot of a payslip.
 *
 * `planned` is this month's installment for a slip worked out before the run
 * has recorded one; a slip from a run passes nothing and reads the recovery.
 */
export async function loansOnSlip(
  supabase: Client,
  profileId: string,
  month: string,
  planned: ReadonlyMap<string, number> = new Map(),
): Promise<{ label: string; installment: number; balance: number }[]> {
  const loans: { label: string; installment: number; balance: number }[] = [];
  const { data: loanRows, error: loanError } = await supabase
    .from("employee_loans")
    .select("id, profile_id, principal, installment, installments, first_month, status, taken_on")
    .eq("profile_id", profileId);
  if (loanError || !loanRows || loanRows.length === 0) return loans;

  const { data: recoveries } = await supabase
    .from("loan_recoveries")
    .select("loan_id, month, amount, source")
    .in(
      "loan_id",
      loanRows.map((loan) => loan.id),
    );

  for (const loan of loanRows) {
    const upToThisSlip = ((recoveries ?? []) as RecoveryRow[]).filter((row) => row.month <= month);
    const recorded = upToThisSlip
      .filter((row) => row.loan_id === loan.id && row.month === month)
      .reduce((total, row) => total + Number(row.amount), 0);
    const thisMonth = recorded > 0 ? recorded : (planned.get(loan.id) ?? 0);
    if (loan.status !== "active" && thisMonth === 0) continue;
    const balance = loanBalance(loan as LoanRow, upToThisSlip);
    loans.push({
      label: `Loan of ${rs(Number(loan.principal))} taken ${formatDate(loan.taken_on)}`,
      installment: thisMonth,
      balance: Math.max(0, recorded > 0 ? balance : balance - thisMonth),
    });
  }
  return loans;
}

// ---------------------------------------------------------------------------
// A payslip worked out live — before a pay run exists
// ---------------------------------------------------------------------------

export interface LiveSlip {
  name: string;
  code: string;
  department: string;
  designation: string;
  profileId: string;
  from: string;
  to: string;
  monthlySalary: number;
  dutyHours: number;
  workingDays: number;
  overtimeHours: number;
  daysAbsent: number;
  lines: readonly PayslipLine[];
  net: number;
  /** A contractor's firm is billed, not the person — the slip says so. */
  contractor?: boolean;
}

export async function livePayslipDocument(supabase: Client, slip: LiveSlip): Promise<Document> {
  const daysInMonth = daysInMonthOf(slip.from);
  const period = rangeLabel(slip.from, slip.to);
  const month = monthOf(slip.from);
  const loans = slip.contractor ? [] : await loansOnSlip(supabase, slip.profileId, month);

  return {
    ok: true,
    body: buildPayslipPdf({
      employeeName: slip.name,
      employeeCode: slip.code,
      department: slip.department,
      designation: slip.designation || undefined,
      period,
      reference: `PS-${slip.from.slice(0, 7)}-${slip.code || slip.profileId.slice(0, 8)}`,
      facts: slip.contractor
        ? [{ label: "Paid as", value: "Contractor — agreed amount, flat" }]
        : [
            { label: "S Rate (monthly salary)", value: rs(slip.monthlySalary) },
            { label: "Days in the month", value: String(daysInMonth) },
            {
              label: "Daily rate",
              value: `Rs ${dailyRate(slip.monthlySalary, daysInMonth).toLocaleString("en-PK")}`,
            },
            { label: "Days worked", value: String(slip.workingDays) },
            {
              label: "Overtime hours",
              value: String(Math.round(slip.overtimeHours * 100) / 100),
            },
            {
              label: "Overtime rate",
              value: `Rs ${overtimeRate(slip.monthlySalary, daysInMonth).toLocaleString("en-PK")} / h`,
            },
            { label: "Salary covers", value: `${slip.dutyHours} hours a day` },
            { label: "Days absent", value: String(slip.daysAbsent) },
          ],
      earnings: slip.lines
        .filter((line) => line.kind === "base" || line.kind === "earning")
        .map((line) => ({ label: line.label, amount: line.amount })),
      deductions: slip.lines
        .filter((line) => (line.kind === "deduction" || line.kind === "tax") && line.amount > 0)
        .map((line) => ({ label: line.label, amount: line.amount })),
      net: slip.net,
      loans,
      footer: standardFooter(period),
    }),
    name: `payslip-${slip.code || slip.profileId.slice(0, 8)}-${slip.from.slice(0, 7)}.pdf`,
    type: PDF,
  };
}

/** A salary register from items already priced — live, or from anywhere else. */
export function registerFromItems(
  items: readonly RegisterItem[],
  { from, to, scope, format }: { from: string; to: string; scope: string; format: "pdf" | "xlsx" },
): Document {
  const groups = groupRegister(items.map(toRegisterRow));
  const meta = {
    title: "SALARY REGISTER",
    subtitle: `${scope} · ${formatDate(from)} to ${formatDate(to)} · worked out from attendance so far`,
    footer: standardFooter(rangeLabel(from, to)),
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
