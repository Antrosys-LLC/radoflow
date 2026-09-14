import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/session";
import { loadMenus } from "@/lib/canteen/menu-data";
import { createClient } from "@/lib/supabase/server";
import { todayInPakistan } from "@/lib/time";

import { readMealPrice } from "@/lib/canteen/history";

import { MealPriceCard } from "./meal-price-card";
import { MealWindowSettings, type MealWindowRow, type TerminalRow } from "./meal-window-settings";
import { MealLimitsCard, WeeklyMenuCard, type LimitRow, type WeeklyDish } from "./weekly-menu-card";

export const metadata: Metadata = {
  title: { absolute: "Canteen Settings | Rado Dyeing and Textile" },
  description: "The weekly menu, meal limits, serving times, and which terminals scan for meals.",
};

export const dynamic = "force-dynamic";

export default async function CanteenSettingsPage() {
  await requirePermission("canteen.manage");
  const supabase = await createClient();
  const today = todayInPakistan();

  const [
    { data: sites },
    { data: windows },
    { data: devices },
    { data: priceSetting },
    menu,
    departmentsRead,
    contractorsRead,
  ] = await Promise.all([
    supabase.from("sites").select("id, name").order("name"),
    supabase
      .from("meal_windows")
      .select("id, site_id, code, name, starts_at, ends_at, is_active, sort_order")
      .order("sort_order"),
    supabase.from("devices").select("id, name, site_id, purpose, is_active").order("name"),
    supabase.from("app_settings").select("value").eq("key", "canteen.meal_price_pkr").maybeSingle(),
    loadMenus(supabase, today, today),
    supabase
      .from("departments")
      .select("id, name, meals_per_day, default_worker_type, is_active")
      .eq("default_worker_type", "contractor")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("profiles")
      .select("id, full_name, employee_code, meals_per_day, department_id")
      .eq("worker_type", "contractor")
      .eq("status", "active")
      .order("full_name"),
  ]);

  const rows: MealWindowRow[] = (windows ?? []).map((w) => ({
    id: w.id,
    siteId: w.site_id,
    code: w.code,
    name: w.name,
    // Postgres `time` comes back as HH:MM:SS; the input wants HH:MM.
    startsAt: String(w.starts_at).slice(0, 5),
    endsAt: String(w.ends_at).slice(0, 5),
    isActive: w.is_active,
    sortOrder: w.sort_order,
  }));

  const terminals: TerminalRow[] = (devices ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    siteId: d.site_id,
    purpose: d.purpose === "canteen" ? "canteen" : "attendance",
    isActive: d.is_active,
  }));

  const weekly: Record<number, WeeklyDish[]> = {};
  for (const [weekday, dishes] of menu.weekly) {
    weekly[weekday] = dishes.map((dish) => ({
      id: dish.id,
      name: dish.name,
      price: dish.price,
      option: dish.option,
    }));
  }

  // The limit columns arrive with the same migration as the menus.
  const limitsAvailable = !departmentsRead.error && !contractorsRead.error;
  const departmentRows = (departmentsRead.data ?? []) as unknown as {
    id: string;
    name: string;
    meals_per_day: number | null;
  }[];
  const deptName = new Map(departmentRows.map((row) => [row.id, row.name]));

  const departmentLimits: LimitRow[] = departmentRows.map((row) => ({
    id: row.id,
    name: row.name,
    detail: "",
    limit: row.meals_per_day ?? null,
  }));

  const personLimits: LimitRow[] = (
    (contractorsRead.data ?? []) as unknown as {
      id: string;
      full_name: string;
      employee_code: string;
      meals_per_day: number | null;
      department_id: string | null;
    }[]
  ).map((row) => ({
    id: row.id,
    name: row.full_name,
    detail: [row.employee_code, row.department_id ? deptName.get(row.department_id) : null]
      .filter(Boolean)
      .join(" · "),
    limit: row.meals_per_day ?? null,
  }));

  return (
    <div className="space-y-5">
      <WeeklyMenuCard weekly={weekly} available={menu.available} />
      <MealLimitsCard
        departments={departmentLimits}
        people={personLimits}
        available={limitsAvailable}
      />
      <MealPriceCard price={readMealPrice(priceSetting?.value)} />
      <MealWindowSettings sites={sites ?? []} windows={rows} terminals={terminals} />
    </div>
  );
}
