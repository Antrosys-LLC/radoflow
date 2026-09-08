import type { Metadata } from "next";

import { requireAnyPermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { todayInPakistan } from "@/lib/time";

import {
  WorkingCalendar,
  type CalendarDayRow,
  type DayType,
  type SiteRow,
  type WeekdayRow,
} from "./working-calendar";

export const metadata: Metadata = {
  title: { absolute: "Working Calendar | Rado Dyeing and Textile" },
  description: "Which days the factory works, and the dated exceptions to that.",
};

export const dynamic = "force-dynamic";

/**
 * The working calendar.
 *
 * Readable by anyone who can see attendance — the calendar is the explanation
 * for a board reporting an entire shift absent, so hiding it from the people
 * reading that board would be perverse — and editable only with
 * `calendar.manage`.
 *
 * Only exceptions from a month back are loaded. Older ones are history payroll
 * has already priced, and a list that grows forever is one nobody scrolls to
 * the useful end of.
 */
export default async function CalendarPage() {
  const session = await requireAnyPermission([
    "calendar.manage",
    "attendance.view",
    "attendance.view.all",
  ]);
  const canManage = session.permissions.has("calendar.manage") || session.isSuperuser;
  const supabase = await createClient();

  const from = new Date(`${todayInPakistan()}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 30);

  const [{ data: sites }, { data: pattern }, { data: exceptions }] = await Promise.all([
    supabase.from("sites").select("id, name").order("name"),
    supabase.from("work_week").select("site_id, weekday, is_working"),
    supabase
      .from("calendar_days")
      .select("id, site_id, day, day_type, reason, rate_multiplier")
      .gte("day", from.toISOString().slice(0, 10))
      .order("day"),
  ]);

  const siteRows: SiteRow[] = (sites ?? []).map((site) => ({ id: site.id, name: site.name }));

  const weekdays: WeekdayRow[] = (pattern ?? []).map((row) => ({
    siteId: row.site_id,
    weekday: row.weekday,
    isWorking: row.is_working,
  }));

  const days: CalendarDayRow[] = (exceptions ?? []).map((row) => ({
    id: row.id,
    siteId: row.site_id,
    day: row.day,
    dayType: row.day_type as DayType,
    reason: row.reason,
    rateMultiplier: row.rate_multiplier === null ? null : Number(row.rate_multiplier),
  }));

  return <WorkingCalendar sites={siteRows} weekdays={weekdays} days={days} canManage={canManage} />;
}
