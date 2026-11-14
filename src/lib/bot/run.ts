import type { Session } from "@/lib/auth/session";
import { buildRegister, summarise, type RegisterDay } from "@/lib/attendance/register";
import { mayReceivePay, type ChatClass } from "@/lib/bot/auth";
import { HELP_TEXT, type Command } from "@/lib/bot/parse";
import { matchesPerson } from "@/lib/people/match";
import {
  canteenCardDepartmentIds,
  withoutCanteenCards,
  withoutCardDepartments,
} from "@/lib/people/canteen-cards";
import { selectInBatches } from "@/lib/supabase/in-batches";
import { createServiceClient } from "@/lib/supabase/service";
import { formatDate, formatTime } from "@/lib/time";

/**
 * Runs one command for one person and says what to send back.
 *
 * Every command checks the permission the matching website screen checks, with
 * the sender's own permissions — so asking the bot is never a way round the
 * rules, only a different place to ask. Files are not built here: a reply names
 * the `/api/export` downloads to fetch, and that route applies its own checks
 * again.
 */

export interface BotDownload {
  kind: string;
  query: Record<string, string>;
}

export interface BotReply {
  text: string;
  downloads?: BotDownload[];
}

const LINE_CAP = 60;

function can(session: Session, permission: string): boolean {
  return session.isSuperuser || session.permissions.has(permission);
}

const refuse = (what: string): BotReply => ({
  text: `You are not allowed to ${what}. Ask the office if you need it.`,
});

type Service = ReturnType<typeof createServiceClient>;

interface Department {
  id: string;
  name: string;
}

/** A department named loosely: the exact name wins, otherwise a unique partial match. */
function findDepartment(
  query: string,
  departments: readonly Department[],
): { found: Department } | { many: Department[] } | null {
  const needle = query.trim().toLowerCase();
  if (!needle) return null;
  const exact = departments.find((d) => d.name.toLowerCase() === needle);
  if (exact) return { found: exact };
  const partial = departments.filter((d) => d.name.toLowerCase().includes(needle));
  if (partial.length === 1) return { found: partial[0]! };
  if (partial.length > 1) return { many: partial };
  return null;
}

async function loadScope(supabase: Service) {
  const [{ data: allDepartments }, { data: allStaff }, cardDepartments] = await Promise.all([
    supabase.from("departments").select("id, name").order("name"),
    supabase
      .from("profiles")
      .select("id, full_name, employee_code, cnic, department_id, requires_attendance")
      .eq("status", "active")
      .order("full_name"),
    canteenCardDepartmentIds(supabase),
  ]);

  // Kitchen cards are counted at the canteen and nowhere else.
  return {
    departments: withoutCardDepartments(allDepartments ?? [], cardDepartments),
    staff: withoutCanteenCards(allStaff ?? [], cardDepartments),
  };
}

async function registerFor(
  supabase: Service,
  date: string,
  people: Awaited<ReturnType<typeof loadScope>>["staff"],
  names: Map<string, string>,
) {
  const rows = await selectInBatches(
    people.map((p) => p.id),
    (ids) =>
      supabase
        .from("attendance_days")
        .select("profile_id, first_in, last_out, regular_hours, minutes_late, is_late")
        .eq("work_date", date)
        .in("profile_id", ids),
    `Could not read attendance for ${date}`,
  );

  const days: RegisterDay[] = (rows ?? []).map((row) => ({
    profileId: row.profile_id,
    firstIn: row.first_in,
    lastOut: row.last_out,
    hoursWorked: Number(row.regular_hours ?? 0),
    minutesLate: Number(row.minutes_late ?? 0),
    isLate: Boolean(row.is_late),
  }));

  return buildRegister(
    people.map((p) => ({
      id: p.id,
      fullName: p.full_name,
      employeeCode: p.employee_code,
      department: p.department_id ? (names.get(p.department_id) ?? null) : null,
      requiresAttendance: p.requires_attendance,
    })),
    days,
  );
}

const ambiguous = (list: readonly Department[]): BotReply => ({
  text: `Which department? ${list
    .slice(0, 8)
    .map((d) => d.name)
    .join(", ")}`,
});

export async function runCommand(
  command: Command,
  session: Session,
  chat: ChatClass,
): Promise<BotReply> {
  if (command.kind === "help") return { text: HELP_TEXT };
  if (command.kind === "unknown") {
    return { text: `I did not understand "${command.text}".\n\n${HELP_TEXT}` };
  }

  const supabase = createServiceClient();

  // ---- Attendance headcount ------------------------------------------------
  if (command.kind === "attendance") {
    if (!can(session, "attendance.view.all")) return refuse("see the factory's attendance");

    const scope = await loadScope(supabase);
    const names = new Map(scope.departments.map((d) => [d.id, d.name]));
    let people = scope.staff;
    let where = "Whole factory";

    if (command.query) {
      const match = findDepartment(command.query, scope.departments);
      if (!match) return { text: `No department called "${command.query}".` };
      if ("many" in match) return ambiguous(match.many);
      people = people.filter((p) => p.department_id === match.found.id);
      where = match.found.name;
    }

    const rows = await registerFor(supabase, command.date, people, names);
    const totals = summarise(rows);

    const byDept = new Map<string, { in: number; absent: number }>();
    for (const row of rows) {
      const entry = byDept.get(row.person.department ?? "No department") ?? { in: 0, absent: 0 };
      if (row.state === "present" || row.state === "working") entry.in += 1;
      if (row.state === "absent") entry.absent += 1;
      byDept.set(row.person.department ?? "No department", entry);
    }

    const lines = [
      `*Attendance — ${formatDate(command.date)}* (${where})`,
      `In: ${totals.present + totals.working} (still in: ${totals.working}) · Absent: ${totals.absent} · Late: ${totals.late} · Expected: ${totals.expected}`,
    ];
    if (!command.query) {
      lines.push("", "*By department*");
      for (const [name, entry] of [...byDept]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(0, 30)) {
        lines.push(`${name}: ${entry.in} in, ${entry.absent} absent`);
      }
    }
    return { text: lines.join("\n") };
  }

  // ---- One department's check-ins -------------------------------------------
  if (command.kind === "checkins") {
    if (!can(session, "attendance.view.all")) return refuse("see the factory's attendance");
    if (!command.query) return { text: "Which department? For example: checkins dyeing" };

    const scope = await loadScope(supabase);
    const names = new Map(scope.departments.map((d) => [d.id, d.name]));
    const match = findDepartment(command.query, scope.departments);
    if (!match) return { text: `No department called "${command.query}".` };
    if ("many" in match) return ambiguous(match.many);

    const people = scope.staff.filter((p) => p.department_id === match.found.id);
    const rows = await registerFor(supabase, command.date, people, names);

    const lines = [`*${match.found.name} — ${formatDate(command.date)}*`];
    for (const row of rows.slice(0, LINE_CAP)) {
      const inTime = row.checkIn ? formatTime(row.checkIn) : "—";
      const outTime = row.checkOut ? formatTime(row.checkOut) : "—";
      const flag =
        row.state === "absent" ? " (absent)" : row.state === "working" ? " (still in)" : "";
      lines.push(
        `${row.person.fullName} · ${row.person.employeeCode}: ${inTime} → ${outTime}${flag}`,
      );
    }
    if (rows.length > LINE_CAP) {
      lines.push(
        `…and ${rows.length - LINE_CAP} more. Ask for "report ${match.found.name}" for the full file.`,
      );
    }
    if (rows.length === 0) lines.push("Nobody in this department.");
    return { text: lines.join("\n") };
  }

  // ---- Canteen ----------------------------------------------------------------
  if (command.kind === "canteen") {
    if (!can(session, "canteen.view")) return refuse("see the canteen");

    if (command.file) {
      const formats = command.format === "both" ? ["pdf", "xlsx"] : [command.format];
      const when =
        command.date === command.to
          ? formatDate(command.date)
          : `${formatDate(command.date)} – ${formatDate(command.to)}`;
      return {
        text: `Canteen history for ${when}. Sending ${formats.join(" and ")}…`,
        downloads: formats.map((format) => ({
          kind: "canteen",
          query: { from: command.date, to: command.to, format },
        })),
      };
    }

    const counts = new Map<string, number>();
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase
        .from("meal_claims")
        .select("meal_window_id")
        .eq("served_on", command.date)
        .order("id")
        .range(from, from + 999);
      for (const row of data ?? []) {
        const id = String(row.meal_window_id);
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      if ((data ?? []).length < 1000) break;
    }

    const { data: windows } = await supabase.from("meal_windows").select("id, name");
    const nameOf = new Map((windows ?? []).map((w) => [w.id, w.name]));
    const total = [...counts.values()].reduce((sum, n) => sum + n, 0);

    const lines = [`*Canteen — ${formatDate(command.date)}*`, `Meals served: ${total}`];
    for (const [id, n] of counts) lines.push(`${nameOf.get(id) ?? "Meal"}: ${n}`);
    return { text: lines.join("\n") };
  }

  // ---- The check-in / check-out file -------------------------------------------
  if (command.kind === "report") {
    if (!can(session, "attendance.view.all")) return refuse("download attendance");

    const query: Record<string, string> = {
      from: command.from,
      to: command.to,
      order: "date",
    };
    if (command.till) query["report"] = "till";

    let subject = "the whole factory";
    if (command.query) {
      const scope = await loadScope(supabase);
      const dept = findDepartment(command.query, scope.departments);

      if (dept && "found" in dept) {
        query["dept"] = dept.found.id;
        subject = dept.found.name;
      } else if (dept) {
        return ambiguous(dept.many);
      } else {
        const people = scope.staff.filter((p) => matchesPerson(p, command.query));
        if (people.length === 0)
          return { text: `No department or person matches "${command.query}".` };
        if (people.length > 1) {
          return {
            text: `Which person? ${people
              .slice(0, 8)
              .map((p) => `${p.full_name} (${p.employee_code})`)
              .join(", ")}`,
          };
        }
        query["person"] = people[0]!.id;
        subject = people[0]!.full_name;
      }
    }

    const formats = command.format === "both" ? ["pdf", "xlsx"] : [command.format];
    const when = command.till
      ? `${formatDate(command.from)} until now`
      : command.from === command.to
        ? formatDate(command.from)
        : `${formatDate(command.from)} – ${formatDate(command.to)}`;

    return {
      text: `Check-in/out ${command.till ? "till now" : "report"} for ${subject}, ${when}. Sending ${formats.join(" and ")}…`,
      downloads: formats.map((format) => ({
        kind: "attendance-log",
        query: { ...query, format },
      })),
    };
  }

  // ---- Payroll -------------------------------------------------------------------
  if (command.kind === "payroll") {
    if (!mayReceivePay(chat)) {
      return {
        text: "Pay is not shared in this group. Message me privately, or ask in the payroll group.",
      };
    }
    if (!can(session, "payroll.view")) return refuse("see payroll");

    const { data: periods } = await supabase
      .from("payroll_periods")
      .select("id, label, status, total_net, total_gross, headcount")
      .order("period_start", { ascending: false })
      .limit(1);
    const period = periods?.[0];
    if (!period) return { text: "There is no pay run yet." };

    const rs = (value: number | null) =>
      `Rs ${Math.round(Number(value ?? 0)).toLocaleString("en-PK")}`;
    return {
      text: [
        `*Payroll — ${period.label}* (${period.status})`,
        `People: ${period.headcount ?? 0}`,
        `Gross: ${rs(period.total_gross)}`,
        `Net: ${rs(period.total_net)}`,
        "Sending the salary register…",
      ].join("\n"),
      downloads: [
        { kind: "register", query: { period: period.id, format: "pdf" } },
        { kind: "register", query: { period: period.id, format: "xlsx" } },
      ],
    };
  }

  return { text: HELP_TEXT };
}
