import { NextResponse, type NextRequest } from "next/server";

import { buildTablePdf, standardFooter } from "@/lib/export/pdf";
import {
  canteenDocument,
  canteenInvoiceDocument,
  livePayslipDocument,
  payslipFromRun,
  rangeLabel,
  registerDocument,
  registerFromItems,
  type Document,
} from "@/lib/export/route-documents";
import { buildWorkbook, type Sheet } from "@/lib/export/xlsx";
import { getSession } from "@/lib/auth/session";
import { estimateSalaries } from "@/lib/payroll/estimate";
import { countWorkingDays, splitDayHours } from "@/lib/payroll/hours";
import type { RegisterItem } from "@/lib/payroll/register";
import { DEFAULT_PAY_RULE, type AttendanceDay, type DayType } from "@/lib/payroll/types";
import { selectAllInBatches } from "@/lib/supabase/in-batches";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, pakistanDayStartUtc, todayInPakistan } from "@/lib/time";

/**
 * Downloads: the same figures the screens show, as a file.
 *
 * One route rather than four, because the four differ only in which query they
 * run — the permission check, the filename, the headers and the two writers are
 * identical, and duplicating them is how one of them ends up ungated.
 *
 * Every export recomputes from the payroll functions rather than reading stored
 * totals, so a downloaded file and the screen it came from cannot disagree.
 *
 * Every read over the factory is batched by id. These downloads once asked for
 * four hundred people's attendance in a single request, PostgREST refused the
 * request line, and the refusal came back as no rows — a register of zeros for
 * a month the whole floor worked.
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
  gate: "gate.view",
  canteen: "canteen.view",
  // What the canteen is owed for a day or a month.
  "canteen-invoice": "canteen.view",
  // The salary register of one saved pay run.
  register: "payroll.view",
} as const;

type Kind = keyof typeof REQUIRED_PERMISSION;

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const money = (value: number) => Math.round(value);
const hours = (value: number) => Math.round(value * 100) / 100;

/** The day after `date`, as `YYYY-MM-DD`. Parsed as UTC, like the rest. */
function nextDay(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

function filename(kind: string, extension: string): string {
  return `radoflow-${kind}-${todayInPakistan()}.${extension}`;
}

/** A document the helpers built, or the reason they could not. */
function documentResponse(document: Document) {
  return document.ok
    ? fileResponse(document.body, document.name, document.type)
    : NextResponse.json({ error: document.error }, { status: document.status });
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

interface DayRow {
  profile_id: string;
  work_date: string;
  regular_hours: number | string | null;
  day_type: string | null;
  status: string | null;
  minutes_late: number | null;
  is_late: boolean | null;
  hours_are_final: boolean | null;
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
  const period = rangeLabel(from, to);

  try {
    /*
     * The gate register, before the people queries below.
     *
     * It shares nothing with the others — no department scope, no payroll
     * arithmetic — so it answers early rather than loading a staff list it
     * will not use.
     */
    if (kind === "gate") {
      const { data: entries } = await supabase
        .from("gate_entries")
        .select("*")
        .gte("happened_at", pakistanDayStartUtc(from))
        .lt("happened_at", pakistanDayStartUtc(nextDay(to)))
        .order("happened_at", { ascending: true });

      const rows = (entries ?? []).map((entry) => [
        formatDateTime(entry.happened_at),
        entry.direction === "out" ? "Out" : "In",
        entry.kind,
        entry.subject,
        entry.party ?? "",
        entry.purpose ?? "",
        entry.reference ?? "",
        entry.quantity ?? "",
        entry.remarks ?? "",
      ]);

      if (format === "pdf") {
        return fileResponse(
          buildTablePdf({
            title: "Gate register",
            subtitle: `${period} · ${rows.length} entries`,
            columns: [
              { header: "When", width: 90 },
              { header: "In/Out", width: 40 },
              { header: "What", width: 50 },
              { header: "Who or what", width: 120 },
              { header: "Company", width: 90 },
              { header: "Purpose", width: 90 },
              { header: "Reference", width: 70 },
            ],
            rows: rows.map((row) => [
              row[0]!,
              row[1]!,
              row[2]!,
              row[3]!,
              row[4]!,
              row[5]!,
              row[6]!,
            ]),
            footer: standardFooter(period),
          }),
          filename("gate", "pdf"),
          "application/pdf",
        );
      }

      const sheet: Sheet = {
        name: "Gate register",
        title: "Gate register",
        subtitle: period,
        columns: [
          { header: "When", width: 20, format: "text" },
          { header: "In/Out", width: 8, format: "text" },
          { header: "What", width: 12, format: "text" },
          { header: "Who or what", width: 26, format: "text" },
          { header: "Company or destination", width: 22, format: "text" },
          { header: "Purpose", width: 22, format: "text" },
          { header: "Reference", width: 16, format: "text" },
          { header: "Quantity", width: 12, format: "text" },
          { header: "Remarks", width: 26, format: "text" },
        ],
        rows,
      };

      return fileResponse(buildWorkbook([sheet]), filename("gate", "xlsx"), XLSX);
    }

    /*
     * The documents that read a saved record rather than recomputing one: the
     * canteen register and invoice, a pay run's salary register, and a payslip
     * from a run.
     */
    if (kind === "canteen") {
      return documentResponse(await canteenDocument(supabase, { from, to, format }));
    }

    if (kind === "canteen-invoice") {
      return documentResponse(await canteenInvoiceDocument(supabase, { from, to, format }));
    }

    if (kind === "register") {
      return documentResponse(
        await registerDocument(supabase, {
          periodId: url.searchParams.get("period") ?? "",
          format,
        }),
      );
    }

    const periodId = url.searchParams.get("period");
    if (kind === "payslip" && periodId) {
      return documentResponse(await payslipFromRun(supabase, { periodId, profileId }));
    }

    const { data: departments } = await supabase.from("departments").select("id, name");
    const deptName = new Map((departments ?? []).map((d) => [d.id, d.name]));
    const departmentOf = (id: string | null) => (id ? (deptName.get(id) ?? "") : "");

    const { data: staffRows } = await supabase
      .from("profiles")
      .select(
        "id, full_name, employee_code, cnic, designation, department_id, worker_type, pay_class, monthly_salary, hourly_rate, duty_hours, sunday_policy, overtime_eligible, flexible_hours, requires_attendance, payroll_exempt, status",
      )
      .eq("status", "active")
      .order("full_name");

    const everyone = staffRows ?? [];
    const staff = deptFilter ? everyone.filter((p) => p.department_id === deptFilter) : everyone;
    const scopeNote = deptFilter ? (deptName.get(deptFilter) ?? "Department") : "Whole factory";

    // ---- People ------------------------------------------------------------
    if (kind === "people" || kind === "pay") {
      const columns = [
        { header: "Unique ID", width: 16, format: "text" as const },
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
        departmentOf(p.department_id),
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
              departmentOf(p.department_id),
              !p.requires_attendance
                ? "Fixed"
                : p.flexible_hours
                  ? "By hours"
                  : p.worker_type === "contractor"
                    ? "Contract"
                    : "Shift",
              `${Number(p.duty_hours)}h`,
              money(Number(p.monthly_salary)),
            ]),
            totals: ["Total", `${staff.length} people`, "", "", "", money(total)],
            footer: standardFooter(
              period,
              "Monthly salary is a daily rate: salary divided by the days of the month",
            ),
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
        XLSX,
      );
    }

    // ---- Attendance --------------------------------------------------------
    if (kind === "attendance") {
      const dayRows = await selectAllInBatches<DayRow>(
        staff.map((p) => p.id),
        (ids, first, last) =>
          supabase
            .from("attendance_days")
            .select(
              "profile_id, work_date, regular_hours, day_type, status, minutes_late, is_late, hours_are_final",
            )
            .in("profile_id", ids)
            .gte("work_date", from)
            .lte("work_date", to)
            .order("profile_id")
            .order("work_date")
            .range(first, last),
        `Could not read attendance for ${from} to ${to}`,
      );

      const byPerson = new Map<string, DayRow[]>();
      for (const row of dayRows) {
        byPerson.set(row.profile_id, [...(byPerson.get(row.profile_id) ?? []), row]);
      }

      const computed = staff.map((person) => {
        const rows = byPerson.get(person.id) ?? [];
        const days: AttendanceDay[] = rows.map((row) => ({
          workDate: row.work_date,
          dayType: (row.day_type ?? "workday") as DayType,
          hoursWorked: Number(row.regular_hours ?? 0),
          status: (row.status ?? "pending") as AttendanceDay["status"],
          minutesLate: row.minutes_late ?? 0,
          hoursAreFinal: row.hours_are_final ?? false,
        }));
        const buckets = days.map((d) =>
          splitDayHours(d, DEFAULT_PAY_RULE, Number(person.duty_hours), {
            overtimeEligible: person.overtime_eligible,
            sundayPolicy: person.sunday_policy,
          }),
        );
        return {
          person,
          workingDays: countWorkingDays(days),
          duty: buckets.reduce((t, b) => t + b.regular, 0),
          overtime: buckets.reduce((t, b) => t + b.overtime + b.weekend + b.holiday, 0),
          late: person.flexible_hours ? 0 : rows.filter((row) => row.is_late).length,
          lateMinutes: person.flexible_hours
            ? 0
            : rows.reduce((t, row) => t + (row.is_late ? (row.minutes_late ?? 0) : 0), 0),
          absent: rows.filter((row) => row.status === "absent").length,
        };
      });

      const columns = [
        { header: "Unique ID", width: 15, format: "text" as const },
        { header: "Name", width: 26, format: "text" as const },
        { header: "Department", width: 20, format: "text" as const },
        { header: "Working days", width: 13, format: "number" as const },
        { header: "Duty hours", width: 13, format: "hours" as const },
        { header: "Overtime hours", width: 14, format: "hours" as const },
        { header: "Late days", width: 11, format: "number" as const },
        { header: "Minutes late", width: 13, format: "number" as const },
        { header: "Absent days", width: 12, format: "number" as const },
      ];

      const rows = computed.map((c) => [
        c.person.employee_code,
        c.person.full_name,
        departmentOf(c.person.department_id),
        c.workingDays,
        hours(c.duty),
        hours(c.overtime),
        c.late,
        c.lateMinutes,
        c.absent,
      ]);

      const sum = (pick: (c: (typeof computed)[number]) => number) =>
        computed.reduce((t, c) => t + pick(c), 0);
      const totals = [
        "",
        `${computed.length} people`,
        "",
        sum((c) => c.workingDays),
        hours(sum((c) => c.duty)),
        hours(sum((c) => c.overtime)),
        sum((c) => c.late),
        sum((c) => c.lateMinutes),
        sum((c) => c.absent),
      ];

      if (format === "pdf") {
        return fileResponse(
          buildTablePdf({
            title: `Attendance — ${scopeNote}`,
            subtitle: period,
            columns: [
              { header: "Code", width: 58 },
              { header: "Name", width: 140 },
              { header: "Department", width: 100 },
              { header: "Days", width: 38, align: "right" },
              { header: "Duty h", width: 48, align: "right" },
              { header: "OT h", width: 44, align: "right" },
              { header: "Late", width: 36, align: "right" },
              { header: "Absent", width: 42, align: "right" },
            ],
            rows: computed.map((c) => [
              c.person.employee_code,
              c.person.full_name,
              departmentOf(c.person.department_id),
              c.workingDays,
              hours(c.duty),
              hours(c.overtime),
              c.late,
              c.absent,
            ]),
            totals: [
              "Total",
              `${computed.length} people`,
              "",
              totals[3]!,
              totals[4]!,
              totals[5]!,
              totals[6]!,
              totals[8]!,
            ],
            highlights: [
              { label: "People", value: String(computed.length) },
              { label: "Working days", value: String(totals[3]) },
              { label: "Overtime hours", value: String(totals[5]) },
              { label: "Late arrivals", value: String(totals[6]) },
            ],
            footer: standardFooter(period),
          }),
          filename("attendance", "pdf"),
          "application/pdf",
        );
      }

      return fileResponse(
        buildWorkbook([
          {
            name: "Attendance",
            title: `Attendance — ${scopeNote}`,
            subtitle: period,
            columns,
            rows,
            totals,
          },
        ]),
        filename("attendance", "xlsx"),
        XLSX,
      );
    }

    // ---- Payroll and payslips: priced by the payroll engine itself ---------
    const targets = kind === "payslip" ? staff.filter((p) => p.id === profileId) : staff;
    if (kind === "payslip" && targets.length === 0) {
      return NextResponse.json({ error: "No such person." }, { status: 404 });
    }

    const outcome = await estimateSalaries(
      supabase,
      targets.map((p) => p.id),
      from,
      to,
      { includeLedger: true, keepAbsent: true },
    );
    const personOf = new Map(targets.map((p) => [p.id, p]));

    const items: RegisterItem[] = outcome.estimates.map(({ employee, result }) => {
      const person = personOf.get(employee.id);
      return {
        profileId: employee.id,
        name: employee.fullName,
        code: employee.employeeCode,
        designation: person?.designation ?? "",
        department: departmentOf(person?.department_id ?? null) || "Unassigned",
        monthlySalary: employee.monthlySalary,
        workingDays: result.workingDays,
        basePay: result.basePay,
        overtimeHours: result.hours.overtime + result.hours.weekend + result.hours.holiday,
        overtimePay: result.otPay + result.weekendPay + result.holidayPay,
        gross: result.gross,
        withheld: result.deductions + result.tax,
        net: result.net,
        lines: result.lines,
      };
    });

    if (kind === "payslip") {
      const person = targets[0]!;
      const estimate = outcome.estimates[0];
      const item = items[0];
      const contractor = person.worker_type === "contractor";

      return documentResponse(
        await livePayslipDocument(supabase, {
          name: person.full_name,
          code: person.employee_code,
          department: departmentOf(person.department_id),
          designation: person.designation ?? "",
          profileId: person.id,
          from,
          to,
          monthlySalary: Number(person.monthly_salary),
          dutyHours: Number(person.duty_hours ?? 8),
          workingDays: item?.workingDays ?? 0,
          overtimeHours: item?.overtimeHours ?? 0,
          daysAbsent: estimate?.result.daysAbsent ?? 0,
          lines: contractor
            ? [
                {
                  code: "CONTRACT",
                  label: "Contract amount",
                  kind: "base",
                  amount: Number(person.monthly_salary),
                },
              ]
            : (item?.lines ?? []),
          net: contractor ? Number(person.monthly_salary) : (item?.net ?? 0),
          contractor,
        }),
      );
    }

    return documentResponse(registerFromItems(items, { from, to, scope: scopeNote, format }));
  } catch (error) {
    // A short read must never become a file of zeros: say what failed instead.
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not build this download." },
      { status: 500 },
    );
  }
}
