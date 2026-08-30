import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { MealWindowSettings, type MealWindowRow, type TerminalRow } from "./meal-window-settings";

export const metadata: Metadata = {
  title: { absolute: "Canteen Settings | Rado Dyeing and Textile" },
  description: "Serving times, and which terminals scan for meals.",
};

export const dynamic = "force-dynamic";

export default async function CanteenSettingsPage() {
  await requirePermission("canteen.manage");
  const supabase = await createClient();

  const [{ data: sites }, { data: windows }, { data: devices }] = await Promise.all([
    supabase.from("sites").select("id, name").order("name"),
    supabase
      .from("meal_windows")
      .select("id, site_id, code, name, starts_at, ends_at, is_active, sort_order")
      .order("sort_order"),
    supabase.from("devices").select("id, name, site_id, purpose, is_active").order("name"),
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

  return <MealWindowSettings sites={sites ?? []} windows={rows} terminals={terminals} />;
}
