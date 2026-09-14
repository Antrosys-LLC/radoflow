import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, CalendarRange, ListChecks, UtensilsCrossed, Users } from "lucide-react";

import { ExportButtons } from "@/components/export-buttons";
import { Fill } from "@/components/fill";
import { Latin } from "@/components/latin";
import { Card, SectionTitle } from "@/components/ui-kit";
import { requireAnyPermission } from "@/lib/auth/session";
import { readMealPrice, summariseMeals, type MealClaimRow } from "@/lib/canteen/history";
import { dayPrices } from "@/lib/canteen/menu";
import { loadMenus } from "@/lib/canteen/menu-data";
import { dictionaryFor } from "@/lib/i18n";
import { selectAllInBatches } from "@/lib/supabase/in-batches";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatPKR, todayInPakistan } from "@/lib/time";
import { cn } from "@/lib/utils";

import { DayMenuCard, type DayMenuView } from "./day-menu-card";

export const metadata: Metadata = {
  title: { absolute: "Canteen History | Rado Dyeing and Textile" },
  description: "Every meal served, by day, by meal and by person, and what it came to.",
};

export const dynamic = "force-dynamic";

/** `YYYY-MM-DD` and a real date, or null. */
function readDate(value: string | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value
    ? null
    : value;
}

function monthBounds(today: string, offset: number): { from: string; to: string } {
  const first = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  first.setUTCMonth(first.getUTCMonth() + offset);
  const last = new Date(first);
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}

/**
 * The canteen's record, over any stretch of days.
 *
 * The counter screen forgets at midnight; this is where the office goes to
 * answer "what did the canteen cost in August" and "how many meals did he
 * have". Read straight from `meal_claims`, so it is the same record the
 * counter wrote and cannot drift from it.
 */
export default async function CanteenHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; day?: string }>;
}) {
  const session = await requireAnyPermission(["canteen.view"]);
  const canManage = session.isSuperuser || session.permissions.has("canteen.manage");
  const t = dictionaryFor(session.profile.language);
  const params = await searchParams;
  const today = todayInPakistan();
  const thisMonth = monthBounds(today, 0);

  let from = readDate(params.from) ?? thisMonth.from;
  let to = readDate(params.to) ?? today;
  if (from > to) [from, to] = [to, from];

  const supabase = await createClient();

  const [{ data: priceSetting }, { data: windows }, { data: departments }] = await Promise.all([
    supabase.from("app_settings").select("value").eq("key", "canteen.meal_price_pkr").maybeSingle(),
    supabase.from("meal_windows").select("id, name, sort_order").order("sort_order"),
    supabase.from("departments").select("id, name"),
  ]);
  const currentPrice = readMealPrice(priceSetting?.value);

  /*
   * Paged, because a month of a four-hundred-person canteen is more servings
   * than one reply carries, and a short read here would understate the bill
   * without saying so. Falls back to reading without the price column on a
   * database that has not had the price migration.
   */
  const claims: MealClaimRow[] = [];
  const PAGE = 1000;
  let withPrice = true;
  for (let page = 0; page < 200; page++) {
    const columns = withPrice
      ? "id, profile_id, meal_window_id, served_on, price_pkr"
      : "id, profile_id, meal_window_id, served_on";
    const { data, error } = await supabase
      .from("meal_claims")
      .select(columns)
      .gte("served_on", from)
      .lte("served_on", to)
      .order("served_on")
      .order("id")
      .range(page * PAGE, page * PAGE + PAGE - 1);

    if (error) {
      if (withPrice && page === 0) {
        withPrice = false;
        page = -1;
        continue;
      }
      break;
    }

    claims.push(...((data ?? []) as unknown as MealClaimRow[]));
    if (!data || data.length < PAGE) break;
  }

  /*
   * Each day's menu prices that day's meals. The day shown in the menu card is
   * one the office picked, or the last day of the range; it is read on its own
   * when it falls outside the range, so its totals are still real.
   */
  const pickedDay = readDate(params.day) ?? to;
  const menu = await loadMenus(
    supabase,
    pickedDay < from ? pickedDay : from,
    pickedDay > to ? pickedDay : to,
  );
  const prices = dayPrices(menu.menus);
  const summary = summariseMeals(claims, currentPrice, prices);

  let pickedMeals = summary.byDay.find((day) => day.date === pickedDay) ?? null;
  if (!pickedMeals && (pickedDay < from || pickedDay > to)) {
    const { data: dayClaims } = await supabase
      .from("meal_claims")
      .select("profile_id, meal_window_id, served_on, price_pkr")
      .eq("served_on", pickedDay)
      .range(0, 4999);
    pickedMeals =
      summariseMeals((dayClaims ?? []) as unknown as MealClaimRow[], currentPrice, prices)
        .byDay[0] ?? null;
  }

  const plannedDay = menu.menus.find((m) => m.date === pickedDay);
  const ownDishes = menu.days.get(pickedDay) ?? [];
  const dayView: DayMenuView = {
    date: pickedDay,
    source: plannedDay?.source ?? "none",
    working: plannedDay?.working ?? true,
    fixed: (plannedDay?.fixed ?? []).map((item) => ({ name: item.name, price: item.price })),
    options: (plannedDay?.options ?? []).map((item) => ({ name: item.name, price: item.price })),
    price: plannedDay?.price ?? 0,
    items:
      plannedDay?.source === "day"
        ? ownDishes.map((dish) => ({ id: dish.id, name: dish.name, price: dish.price }))
        : (plannedDay?.items ?? []).map((item) => ({
            id: null,
            name: item.name,
            price: item.price,
          })),
    meals: pickedMeals?.meals ?? 0,
    amount: pickedMeals?.amount ?? 0,
  };
  const monthOfDay = monthBounds(pickedDay, 0);
  // Days of alternatives in the range, already past, that nobody has recorded.
  const needChoice = menu.menus.filter(
    (m) => m.source === "choose" && m.date >= from && m.date <= to && m.date <= today,
  );

  const profileIds = summary.byPerson.map((person) => person.profileId);
  const people =
    profileIds.length > 0
      ? await selectAllInBatches<{
          id: string | null;
          full_name: string | null;
          employee_code: string | null;
          department_id: string | null;
        }>(
          profileIds,
          (ids, first, last) =>
            supabase
              .from("employee_directory")
              .select("id, full_name, employee_code, department_id")
              .in("id", ids)
              .order("id")
              .range(first, last),
          "Could not read the names of the people served",
        ).catch(() => [])
      : [];

  const person = new Map(people.map((row) => [row.id, row]));
  const deptName = new Map((departments ?? []).map((row) => [row.id, row.name]));
  const windowName = new Map((windows ?? []).map((row) => [row.id, row.name]));
  const lastMonth = monthBounds(today, -1);

  const ranges = [
    { label: t.canteenHistory.today, from: today, to: today },
    { label: t.canteenHistory.thisMonth, from: thisMonth.from, to: today },
    { label: t.canteenHistory.lastMonth, from: lastMonth.from, to: lastMonth.to },
  ];

  const maxDay = Math.max(1, ...summary.byDay.map((day) => day.meals));

  return (
    <div className="space-y-5 pb-6">
      <Card className="p-4 sm:p-6">
        <SectionTitle
          icon={CalendarRange}
          title={t.canteenHistory.title}
          subtitle={t.canteenHistory.subtitle}
          action={<ExportButtons kind="canteen" params={{ from, to }} />}
        />

        <form className="flex flex-wrap items-end gap-3" method="get">
          <label className="block">
            <span className="text-xs font-bold text-muted-foreground">{t.canteenHistory.from}</span>
            <input
              type="date"
              name="from"
              defaultValue={from}
              dir="ltr"
              className="mt-1 block rounded-2xl border border-input bg-background px-4 py-2.5 font-latin text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-muted-foreground">{t.canteenHistory.to}</span>
            <input
              type="date"
              name="to"
              defaultValue={to}
              dir="ltr"
              className="mt-1 block rounded-2xl border border-input bg-background px-4 py-2.5 font-latin text-sm"
            />
          </label>
          <button
            type="submit"
            className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-all hover:opacity-90"
          >
            {t.canteenHistory.show}
          </button>
          <div className="flex flex-wrap gap-2">
            {ranges.map((range) => (
              <Link
                key={range.label}
                href={`/canteen/history?from=${range.from}&to=${range.to}`}
                className={cn(
                  "rounded-2xl px-3 py-2.5 text-xs font-bold transition-all",
                  range.from === from && range.to === to
                    ? "bg-primary-soft text-primary"
                    : "bg-secondary text-muted-foreground hover:text-foreground",
                )}
              >
                {range.label}
              </Link>
            ))}
          </div>
        </form>
      </Card>

      {needChoice.length > 0 ? (
        <p className="rounded-2xl bg-warning-soft px-4 py-3 text-sm font-semibold text-warning">
          <Fill template={t.canteenMenu.needChoice} values={{ count: needChoice.length }} />{" "}
          {needChoice.map((m, index) => (
            <span key={m.date}>
              {index > 0 ? ", " : null}
              <Link
                href={`/canteen/history?from=${from}&to=${to}&day=${m.date}`}
                className="underline underline-offset-2"
              >
                <Latin>{formatDate(m.date)}</Latin>
              </Link>
            </span>
          ))}
        </p>
      ) : null}

      <DayMenuCard
        day={dayView}
        canManage={canManage}
        available={menu.available}
        onPickHref={`/canteen/history?from=${from}&to=${to}`}
      />

      <Card className="p-4 sm:p-6">
        <SectionTitle
          icon={Banknote}
          title={`${t.canteenHistory.invoiceDaily} · ${t.canteenHistory.invoiceMonthly}`}
          subtitle={t.canteenHistory.invoiceHint}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-secondary p-4">
            <p className="text-sm font-bold text-foreground">
              {t.canteenHistory.invoiceDaily} · <Latin>{formatDate(pickedDay)}</Latin>
            </p>
            <div className="mt-3">
              <ExportButtons
                kind="canteen-invoice"
                params={{ from: pickedDay, to: pickedDay }}
                label={t.canteenHistory.invoiceDaily}
              />
            </div>
          </div>
          <div className="rounded-2xl bg-secondary p-4">
            <p className="text-sm font-bold text-foreground">
              {t.canteenHistory.invoiceMonthly} ·{" "}
              <Latin>{`${formatDate(monthOfDay.from)} – ${formatDate(monthOfDay.to)}`}</Latin>
            </p>
            <div className="mt-3">
              <ExportButtons
                kind="canteen-invoice"
                params={{ from: monthOfDay.from, to: monthOfDay.to }}
                label={t.canteenHistory.invoiceMonthly}
              />
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile
          icon={UtensilsCrossed}
          label={t.canteenHistory.mealsServed}
          value={<Latin>{summary.total.meals.toLocaleString("en-PK")}</Latin>}
        />
        <Tile
          icon={Banknote}
          label={t.canteenHistory.totalCost}
          value={<Latin>{formatPKR(summary.total.amount)}</Latin>}
          tone="primary"
        />
        <Tile
          icon={ListChecks}
          label={t.canteenHistory.pricePerMeal}
          value={
            currentPrice === null ? (
              <Link href="/canteen/settings" className="text-base text-primary underline">
                {t.canteenHistory.setPrice}
              </Link>
            ) : (
              <Latin>{formatPKR(currentPrice)}</Latin>
            )
          }
        />
        <Tile
          icon={Users}
          label={t.canteenHistory.peopleFed}
          value={<Latin>{summary.byPerson.length.toLocaleString("en-PK")}</Latin>}
        />
      </div>

      {summary.total.unpriced > 0 ? (
        <p className="rounded-2xl bg-warning-soft px-4 py-3 text-sm font-semibold text-warning">
          {currentPrice === null ? (
            <Fill
              template={t.canteenHistory.unpricedNoPrice}
              values={{ count: summary.total.unpriced }}
            />
          ) : (
            <Fill
              template={t.canteenHistory.unpricedNote}
              values={{ count: summary.total.unpriced, price: formatPKR(currentPrice) }}
            />
          )}
        </p>
      ) : null}

      {summary.total.meals === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm font-bold text-foreground">{t.canteenHistory.noMeals}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t.canteenHistory.noMealsHint}</p>
        </Card>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="p-4 sm:p-6">
              <SectionTitle
                icon={CalendarRange}
                title={t.canteenHistory.byDay}
                subtitle={t.canteenHistory.byDayHint}
              />
              <ul className="space-y-1.5">
                {summary.byDay.map((day) => (
                  <li key={day.date} className="grid grid-cols-[7rem_1fr_auto] items-center gap-3">
                    <span className="text-xs font-semibold text-foreground">
                      <Latin>{formatDate(day.date)}</Latin>
                    </span>
                    <span className="h-2.5 overflow-hidden rounded-full bg-secondary">
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{ width: `${(day.meals / maxDay) * 100}%` }}
                      />
                    </span>
                    <span className="text-end text-xs tabular-nums text-muted-foreground">
                      <Latin>{`${day.meals} · ${formatPKR(day.amount)}`}</Latin>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="p-4 sm:p-6">
              <SectionTitle icon={UtensilsCrossed} title={t.canteenHistory.byMeal} />
              <ul className="grid gap-2 sm:grid-cols-2">
                {summary.byWindow.map((row) => (
                  <li key={row.windowId ?? "none"} className="rounded-2xl bg-secondary px-4 py-3">
                    <p className="text-sm font-bold text-foreground">
                      <Latin>{(row.windowId && windowName.get(row.windowId)) || "—"}</Latin>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      <Latin>{`${row.meals.toLocaleString("en-PK")} · ${formatPKR(row.amount)}`}</Latin>
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <Card className="p-4 sm:p-6">
            <SectionTitle
              icon={Users}
              title={t.canteenHistory.byPerson}
              subtitle={t.canteenHistory.byPersonHint}
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-start text-xs text-muted-foreground">
                    <th className="px-3 py-2 text-start font-bold">{t.canteenHistory.person}</th>
                    <th className="px-3 py-2 text-start font-bold">
                      {t.canteenHistory.department}
                    </th>
                    <th className="px-3 py-2 text-end font-bold">{t.canteenHistory.meals}</th>
                    <th className="px-3 py-2 text-end font-bold">{t.canteenHistory.amount}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byPerson.map((row, index) => {
                    const who = person.get(row.profileId);
                    return (
                      <tr key={row.profileId} className={cn(index % 2 === 1 && "bg-secondary/60")}>
                        <td className="px-3 py-2">
                          <span className="font-semibold text-foreground">
                            <Latin>{who?.full_name ?? "—"}</Latin>
                          </span>
                          <span className="ms-2 text-xs text-muted-foreground">
                            <Latin>{who?.employee_code ?? ""}</Latin>
                          </span>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          <Latin>
                            {(who?.department_id && deptName.get(who.department_id)) || "—"}
                          </Latin>
                        </td>
                        <td className="px-3 py-2 text-end tabular-nums">
                          <Latin>{row.meals}</Latin>
                        </td>
                        <td className="px-3 py-2 text-end font-semibold tabular-nums">
                          <Latin>{formatPKR(row.amount)}</Latin>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  tone?: "neutral" | "primary";
}) {
  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_rgb(0_0_0/0.05)]">
      <span
        className={cn(
          "flex size-11 items-center justify-center rounded-2xl",
          tone === "primary"
            ? "bg-primary text-primary-foreground"
            : "bg-primary-soft text-primary",
        )}
      >
        <Icon className="size-5" />
      </span>
      <p className="mt-3 text-2xl font-bold tracking-tight tabular-nums text-foreground">{value}</p>
      <p className="text-sm font-semibold text-muted-foreground">{label}</p>
    </div>
  );
}
