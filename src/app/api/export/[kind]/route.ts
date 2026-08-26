import { NextResponse, type NextRequest } from "next/server";

import { buildPayslipPdf, buildTablePdf } from "@/lib/export/pdf";
import { buildWorkbook, type Sheet } from "@/lib/export/xlsx";
import { getSession } from "@/lib/auth/session";
import {
  countWorkingDays,
  dailyRate,
  daysInMonthOf,
  overtimeRate,
  splitDayHours,
} from "@/lib/payroll/hours";
import { DEFAULT_PAY_RULE, type AttendanceDay, type DayType } from "@/lib/payroll/types";
import { createClient } from "@/lib/supabase/server";
import { todayInPakistan } from "@/lib/time";

/**
 * Downloads: the same figures the screens show, as a file.
 *
 * One route rather than four, because the four differ only in which query they
 * run — the permission check, the filename, the headers and the two writers are
 * identical, and duplicating them is how one of them ends up ungated.
 *
 * Every export recomputes from the payroll functions rather than reading stored
 * totals, so a downloaded file and the screen it came from cannot disagree.
 */

export const dynamic = "force-dynamic";

/** What each export needs before it will produce anything. */
const REQUIRED_PERMISSION = {
  people: "people.manage",
  pay: "rates.view",
  attendance: "attendance.view.all",
  payroll: "payroll.view",
  // A payslip is also allowed to its owner; that exception is handled below.
  payslip: "payroll.view",
} as const;

type Kind = keyof typeof REQUIRED_PERMISSION;

const money = (value: number) => Math.round(value);
const hours = (value: number) => Math.round(value * 100) / 100;

function filename(kind: string, extension: string): string {
  return `radoflow-${kind}-${todayInPakistan()}.${extension}`;
}

function fileResponse(body: Buffer, name: string, contentType: string) {
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "content-type": contentType,
      "content-disposition": `attachment; filename="${name}"`,
      // A payslip must never be served from a shared cache.
      "cache-control": "no-store, private",
      "content-length": String(body.length),
    },
  });
}

export async function GET(request: NextRequest, context: { params: Promise<{ kind: string }> }) {
  const { kind: rawKind } = await context.params;
  const kind = rawKind as Kind;

  if (!(kind in REQUIRED_PERMISSION)) {
    return NextResponse.json({ error: "Unknown export." }, { status: 404 });
  }

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const url = request.nextUrl;
  const format = url.searchParams.get("format") === "pdf" ? "pdf" : "xlsx";
  const profileId = url.searchParams.get("person") ?? "";

  /*
   * A payslip is the one export someone can take without the payroll
   * capability — their own. Anyone else's still needs it.
   */
  const ownPayslip = kind === "payslip" && profileId === session.userId;
  const permitted =
    session.isSuperuser || ownPayslip || session.permissions.has(REQUIRED_PERMISSION[kind]);

  if (!permitted) {
    return NextResponse.json({ error: "Not allowed to download this." }, { status: 403 });
  }

  const supabase = await createClient();
  const today = todayInPakistan();
  const from = url.searchParams.get("from") || `${today.slice(0, 7)}-01`;
  const to = url.searchParams.get("to") || today;
  const deptFilter = url.searchParams.get("dept") ?? "";

  const { data: departments } = await supabase.from("departments").select("id, name");
  const deptName = new Map((departments ?? []).map((d) => [d.id, d.name]));

  const { data: staffRows } = await supabase
    .from("profiles")
    .select(
      "id, full_name, employee_code, cnic, designation, department_id, worker_type, pay_class, monthly_salary, hourly_rate, duty_hours, sunday_policy, overtime_eligible, flexible_hours, requires_attendance, status",
    )
    .eq("status", "active")
    .order("full_name");

  const everyone = staffRows ?? [];
  const staff = deptFilter ? everyone.filter((p) => p.department_id === deptFilter) : everyone;

  const scopeNote = deptFilter ? (deptName.get(deptFilter) ?? "Department") : "Whole factory";

  // ---- People ------------------------------------------------------------
  if (kind === "people" || kind === "pay") {
    const columns = [
      { header: "Employee code", width: 16, format: "text" as const },
      { header: "Name", width: 26, format: "text" as const },
      { header: "Department", width: 20, format: "text" as const },
      { header: "Designation", width: 18, format: "text" as const },
      { header: "Paid as", width: 12, format: "text" as const },
      { header: "Monthly salary", width: 16, format: "money" as const },
      { header: "Salary covers (h)", width: 15, format: "number" as const },
      { header: "Earns overtime", width: 14, format: "text" as const },
      { header: "Sunday", width: 15, format: "text" as const },
      { header: "Paid from attendance", width: 18, format: "text" as const },
      { header: "Fixed in/out time", width: 15, format: "text" as const },
      { header: "CNIC", width: 18, format: "text" as const },
    ];

    const rows = staff.map((p) => [
      p.employee_code,
      p.full_name,
      p.department_id ? (deptName.get(p.department_id) ?? "") : "",
      p.designation ?? "",
      p.worker_type === "contractor" ? "Contractor" : "Employee",
      Number(p.monthly_salary),
      Number(p.duty_hours),
      p.overtime_eligible ? "Yes" : "No",
      p.sunday_policy,
      p.requires_attendance ? "Yes" : "No",
      p.flexible_hours ? "No" : "Yes",
      p.cnic ?? "",
    ]);

    const total = staff.reduce((t, p) => t + Number(p.monthly_salary), 0);

    if (format === "pdf") {
      return fileResponse(
        buildTablePdf({
          title: `People and pay — ${scopeNote}`,
          subtitle: `${staff.length} active · generated ${today}`,
          columns: [
            { header: "Code", width: 60 },
            { header: "Name", width: 150 },
            { header: "Department", width: 110 },
            { header: "Paid as", width: 60 },
            { header: "Duty", width: 40, align: "right" },
            { header: "Salary", width: 80, align: "right" },
          ],
          rows: staff.map((p) => [
            p.employee_code,
            p.full_name,
            p.department_id ? (deptName.get(p.department_id) ?? "") : "",
            p.worker_type === "contractor" ? "Contract" : "Employee",
            `${Number(p.duty_hours)}h`,
            money(Number(p.monthly_salary)),
          ]),
          totals: ["Total", `${staff.length} people`, "", "", "", money(total)],
          footer: "Monthly salary is a daily rate: salary divided by the days of the month.",
        }),
        filename("people", "pdf"),
        "application/pdf",
      );
    }

    return fileResponse(
      buildWorkbook([
        {
          name: "People",
          title: `People and pay — ${scopeNote}`,
          columns,
          rows,
          totals: ["", `${staff.length} people`, "", "", "", total, "", "", "", "", "", ""],
        },
      ]),
      filename("people", "xlsx"),
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  }

  // ---- Attendance and payroll both need the computed figures -------------
  const ids = staff.map((p) => p.id);
  const { data: dayRows } =
    ids.length > 0
      ? await supabase
          .from("attendance_days")
          .select("profile_id, work_date, regular_hours, day_type, status, minutes_late, is_late")
          .in("profile_id", ids)
          .gte("work_date", from)
          .lte("work_date", to)
          .order("work_date")
      : { data: [] };

  const byPerson = new Map<string, AttendanceDay[]>();
  for (const row of dayRows ?? []) {
    const list = byPerson.get(row.profile_id) ?? [];
    list.push({
      workDate: row.work_date,
      dayType: (row.day_type ?? "workday") as DayType,
      hoursWorked: Number(row.regular_hours ?? 0),
      status: (row.status ?? "pending") as AttendanceDay["status"],
      minutesLate: row.minutes_late ?? 0,
    });
    byPerson.set(row.profile_id, list);
  }

  const rule = DEFAULT_PAY_RULE;
  const daysInMonth = daysInMonthOf(from);

  const computed = staff.map((person) => {
    const days = byPerson.get(person.id) ?? [];
    const terms = {
      overtimeEligible: person.overtime_eligible,
      sundayPolicy: person.sunday_policy,
    };
    const buckets = days.map((d) => splitDayHours(d, rule, Number(person.duty_hours), terms));

    const workingDays = countWorkingDays(days);
    const overtime = buckets.reduce((t, b) => t + b.overtime, 0);
    const duty = buckets.reduce((t, b) => t + b.regular, 0);

    const salary = Number(person.monthly_salary);
    const contractor = person.worker_type === "contractor";
    const perDay = dailyRate(salary, daysInMonth);
    const perOt = overtimeRate(salary, daysInMonth);

    const base = contractor || !person.requires_attendance ? salary : perDay * workingDays;
    const otPay = contractor ? 0 : overtime * perOt;

    return { person, days, workingDays, overtime, duty, perDay, perOt, base, otPay, contractor };
  });

  // ---- Payslip -----------------------------------------------------------
  if (kind === "payslip") {
    const found = computed.find((c) => c.person.id === profileId);
    if (!found) return NextResponse.json({ error: "No such person." }, { status: 404 });

    const { data: extras } = await supabase
      .from("profile_pay_components")
      .select("label, kind, amount")
      .eq("profile_id", profileId);

    const earnings = [
      found.contractor
        ? { label: "Contract amount", amount: money(found.base) }
        : !found.person.requires_attendance
          ? { label: "Monthly salary", amount: money(found.base) }
          : { label: `Salary for ${found.workingDays} working days`, amount: money(found.base) },
      ...(found.otPay > 0
        ? [{ label: `Overtime — ${hours(found.overtime)} h`, amount: money(found.otPay) }]
        : []),
      ...(extras ?? [])
        .filter((e) => e.kind === "earning")
        .map((e) => ({ label: e.label, amount: money(Number(e.amount)) })),
    ];

    const deductions = (extras ?? [])
      .filter((e) => e.kind !== "earning")
      .map((e) => ({ label: e.label, amount: money(Number(e.amount)) }));

    const gross = earnings.reduce((t, e) => t + e.amount, 0);
    const taken = deductions.reduce((t, d) => t + d.amount, 0);

    return fileResponse(
      buildPayslipPdf({
        employeeName: found.person.full_name,
        employeeCode: found.person.employee_code,
        department: found.person.department_id
          ? (deptName.get(found.person.department_id) ?? "")
          : "",
        designation: found.person.designation ?? undefined,
        period: `${from} to ${to}`,
        facts: found.contractor
          ? [{ label: "Paid as", value: "Contractor — agreed amount, flat" }]
          : [
              {
                label: "Monthly salary",
                value: money(Number(found.person.monthly_salary)).toLocaleString("en-PK"),
              },
              { label: "Days in the month", value: String(daysInMonth) },
              { label: "Daily rate", value: found.perDay.toLocaleString("en-PK") },
              { label: "Working days attended", value: String(found.workingDays) },
              { label: "Salary covers", value: `${Number(found.person.duty_hours)} hours a day` },
              { label: "Overtime hours", value: hours(found.overtime).toLocaleString("en-PK") },
              { label: "Overtime rate", value: `${found.perOt.toLocaleString("en-PK")} an hour` },
            ],
        earnings,
        deductions,
        // Never negative: nothing can be taken from pay that was not earned.
        net: Math.max(0, gross - taken),
        footer:
          "Computer generated. Sundays are not working days; hours worked on one are overtime.",
      }),
      `payslip-${found.person.employee_code}-${from.slice(0, 7)}.pdf`,
      "application/pdf",
    );
  }

  // ---- Attendance --------------------------------------------------------
  if (kind === "attendance") {
    const columns = [
      { header: "Employee code", width: 15, format: "text" as const },
      { header: "Name", width: 26, format: "text" as const },
      { header: "Department", width: 20, format: "text" as const },
      { header: "Working days", width: 13, format: "number" as const },
      { header: "Duty hours", width: 13, format: "hours" as const },
      { header: "Overtime hours", width: 14, format: "hours" as const },
      { header: "Late days", width: 11, format: "number" as const },
    ];

    const rows = computed.map((c) => [
      c.person.employee_code,
      c.person.full_name,
      c.person.department_id ? (deptName.get(c.person.department_id) ?? "") : "",
      c.workingDays,
      hours(c.duty),
      hours(c.overtime),
      (dayRows ?? []).filter((d) => d.profile_id === c.person.id && d.is_late).length,
    ]);

    const totals = [
      "",
      `${computed.length} people`,
      "",
      computed.reduce((t, c) => t + c.workingDays, 0),
      hours(computed.reduce((t, c) => t + c.duty, 0)),
      hours(computed.reduce((t, c) => t + c.overtime, 0)),
      null,
    ];

    if (format === "pdf") {
      return fileResponse(
        buildTablePdf({
          title: `Attendance — ${scopeNote}`,
          subtitle: `${from} to ${to}`,
          columns: [
            { header: "Code", width: 60 },
            { header: "Name", width: 160 },
            { header: "Department", width: 110 },
            { header: "Days", width: 45, align: "right" },
            { header: "Duty", width: 55, align: "right" },
            { header: "Overtime", width: 60, align: "right" },
          ],
          rows: rows.map((r) => [r[0], r[1], r[2], r[3], r[4], r[5]] as (string | number)[]),
          totals: ["Total", `${computed.length} people`, "", totals[3]!, totals[4]!, totals[5]!],
          footer: "Sundays are never working days; every hour worked on one is overtime.",
        }),
        filename("attendance", "pdf"),
        "application/pdf",
      );
    }

    return fileResponse(
      buildWorkbook([
        {
          name: "Attendance",
          title: `Attendance — ${scopeNote} · ${from} to ${to}`,
          columns,
          rows,
          totals,
        },
      ]),
      filename("attendance", "xlsx"),
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  }

  // ---- Payroll -----------------------------------------------------------
  const columns = [
    { header: "Employee code", width: 15, format: "text" as const },
    { header: "Name", width: 26, format: "text" as const },
    { header: "Department", width: 20, format: "text" as const },
    { header: "Paid as", width: 12, format: "text" as const },
    { header: "Monthly salary", width: 15, format: "money" as const },
    { header: "Daily rate", width: 13, format: "money" as const },
    { header: "Working days", width: 13, format: "number" as const },
    { header: "Base pay", width: 14, format: "money" as const },
    { header: "Overtime hours", width: 14, format: "hours" as const },
    { header: "Overtime pay", width: 14, format: "money" as const },
    { header: "Earned", width: 15, format: "money" as const },
  ];

  const rows = computed.map((c) => [
    c.person.employee_code,
    c.person.full_name,
    c.person.department_id ? (deptName.get(c.person.department_id) ?? "") : "",
    c.contractor ? "Contractor" : "Employee",
    Number(c.person.monthly_salary),
    c.contractor ? null : c.perDay,
    c.contractor ? null : c.workingDays,
    money(c.base),
    hours(c.overtime),
    money(c.otPay),
    money(c.base + c.otPay),
  ]);

  const earnedTotal = computed.reduce((t, c) => t + c.base + c.otPay, 0);

  if (format === "pdf") {
    return fileResponse(
      buildTablePdf({
        title: `Payroll — ${scopeNote}`,
        subtitle: `${from} to ${to} · before deductions`,
        columns: [
          { header: "Code", width: 55 },
          { header: "Name", width: 150 },
          { header: "Department", width: 100 },
          { header: "Days", width: 40, align: "right" },
          { header: "Base", width: 70, align: "right" },
          { header: "Overtime", width: 60, align: "right" },
          { header: "Earned", width: 75, align: "right" },
        ],
        rows: computed.map((c) => [
          c.person.employee_code,
          c.person.full_name,
          c.person.department_id ? (deptName.get(c.person.department_id) ?? "") : "",
          c.contractor ? "-" : c.workingDays,
          money(c.base),
          money(c.otPay),
          money(c.base + c.otPay),
        ]),
        totals: ["Total", `${computed.length} people`, "", "", "", "", money(earnedTotal)],
        footer: "Base pay is the daily rate times days attended. Sundays are overtime.",
      }),
      filename("payroll", "pdf"),
      "application/pdf",
    );
  }

  return fileResponse(
    buildWorkbook([
      {
        name: "Payroll",
        title: `Payroll — ${scopeNote} · ${from} to ${to}`,
        columns,
        rows,
        totals: [
          "",
          `${computed.length} people`,
          "",
          "",
          null,
          null,
          null,
          null,
          null,
          null,
          earnedTotal,
        ],
      },
    ]),
    filename("payroll", "xlsx"),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
}
