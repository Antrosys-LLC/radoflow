"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { CalendarDays, Plus, Soup, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { Fill } from "@/components/fill";
import { useDictionary } from "@/components/language-provider";
import { Latin } from "@/components/latin";
import { Card, SectionTitle } from "@/components/ui-kit";
import { formatPKR } from "@/lib/time";
import { cn } from "@/lib/utils";

import { addMenuItem, removeMenuItem, setMealLimit, type MenuResult } from "../menu-actions";

const INITIAL: MenuResult = { ok: false, message: "" };

const INPUT =
  "w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/30";

export interface WeeklyDish {
  id: string;
  name: string;
  price: number;
  /** One of the day's alternatives: served all day instead of the others. */
  option: boolean;
}

/** Monday first, the way the factory's week runs; Sunday closes it. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function WeeklyMenuCard({
  weekly,
  available,
}: {
  weekly: Record<number, WeeklyDish[]>;
  available: boolean;
}) {
  const t = useDictionary();

  return (
    <Card className="p-4 sm:p-6">
      <SectionTitle
        icon={Soup}
        title={t.canteenMenu.weeklyTitle}
        subtitle={t.canteenMenu.weeklyHint}
      />
      {!available ? (
        <p className="rounded-2xl bg-warning-soft px-4 py-3 text-sm font-semibold text-warning">
          {t.canteenMenu.notMigrated}
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {WEEK_ORDER.map((weekday) => (
            <WeekdayMenu key={weekday} weekday={weekday} dishes={weekly[weekday] ?? []} />
          ))}
        </div>
      )}
    </Card>
  );
}

function WeekdayMenu({ weekday, dishes }: { weekday: number; dishes: WeeklyDish[] }) {
  const t = useDictionary();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState(addMenuItem, INITIAL);

  useEffect(() => {
    if (!state.message) return;
    if (state.ok) {
      toast.success(state.message);
      formRef.current?.reset();
      router.refresh();
    } else {
      toast.error(state.message);
    }
    // `state` is the only trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Alternatives are never added together: a meal is the fixed dishes and one option.
  const fixedTotal = dishes
    .filter((dish) => !dish.option)
    .reduce((sum, dish) => sum + dish.price, 0);
  const dearest = Math.max(0, ...dishes.filter((dish) => dish.option).map((dish) => dish.price));
  const total = fixedTotal + dearest;
  const hasOptions = dishes.some((dish) => dish.option);

  return (
    <div className="rounded-2xl bg-secondary p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-foreground">{t.canteenMenu.weekdays[weekday]}</p>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] font-bold",
            dishes.length > 0 ? "bg-primary-soft text-primary" : "bg-card text-muted-foreground",
          )}
        >
          {dishes.length > 0 ? (
            <Fill template={t.canteenMenu.perMeal} values={{ amount: formatPKR(total) }} />
          ) : (
            t.canteenMenu.noDishes
          )}
        </span>
      </div>

      <ul className="space-y-1.5">
        {dishes.map((dish) => (
          <li
            key={dish.id}
            className="flex items-center justify-between gap-2 rounded-xl bg-card px-3 py-2 text-sm"
          >
            <span className="min-w-0 truncate font-medium text-foreground">
              {dish.name}
              {dish.option ? (
                <span className="ms-2 rounded-full bg-warning-soft px-2 py-0.5 text-[10px] font-bold text-warning">
                  {t.canteenMenu.optionBadge}
                </span>
              ) : null}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="tabular-nums text-muted-foreground">
                <Latin>{formatPKR(dish.price)}</Latin>
              </span>
              <button
                type="button"
                aria-label={t.canteenMenu.remove}
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await removeMenuItem("weekly", dish.id);
                    if (result.ok) toast.success(result.message);
                    else toast.error(result.message);
                    router.refresh();
                  })
                }
                className="rounded-lg p-1 text-muted-foreground hover:text-danger disabled:opacity-50"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </span>
          </li>
        ))}
      </ul>

      <form ref={formRef} action={action} className="mt-2 grid grid-cols-[1fr_5.5rem_auto] gap-2">
        <input type="hidden" name="weekday" value={weekday} />
        <input name="name" required placeholder={t.canteenMenu.dish} className={INPUT} />
        <input
          name="price"
          type="number"
          min={0}
          step="1"
          required
          placeholder={t.canteenMenu.price}
          dir="ltr"
          className={cn(INPUT, "font-latin")}
        />
        <AddButton />
        <label className="col-span-3 flex items-center gap-2 text-[11px] text-muted-foreground">
          <input type="checkbox" name="option" className="size-3.5 accent-[var(--primary)]" />
          {t.canteenMenu.optionCheckbox}
        </label>
      </form>
      {hasOptions ? (
        <p className="mt-2 text-[11px] text-muted-foreground">{t.canteenMenu.optionHint}</p>
      ) : null}
    </div>
  );
}

function AddButton() {
  const t = useDictionary();
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={t.canteenMenu.add}
      className="inline-flex items-center justify-center rounded-xl bg-primary px-3 text-primary-foreground disabled:opacity-60"
    >
      <Plus className="size-4" aria-hidden />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Meals per 24 hours
// ---------------------------------------------------------------------------

export interface LimitRow {
  id: string;
  name: string;
  detail: string;
  limit: number | null;
}

export function MealLimitsCard({
  departments,
  people,
  available,
}: {
  departments: LimitRow[];
  people: LimitRow[];
  available: boolean;
}) {
  const t = useDictionary();

  return (
    <Card className="p-4 sm:p-6">
      <SectionTitle
        icon={Users}
        title={t.canteenMenu.limitsTitle}
        subtitle={t.canteenMenu.limitsHint}
      />
      {!available ? (
        <p className="rounded-2xl bg-warning-soft px-4 py-3 text-sm font-semibold text-warning">
          {t.canteenMenu.notMigrated}
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <LimitList
            icon={CalendarDays}
            title={t.canteenMenu.limitDepartments}
            scope="department"
            rows={departments}
          />
          <LimitList icon={Users} title={t.canteenMenu.limitPeople} scope="person" rows={people} />
        </div>
      )}
    </Card>
  );
}

function LimitList({
  icon: Icon,
  title,
  scope,
  rows,
}: {
  icon: typeof Users;
  title: string;
  scope: "department" | "person";
  rows: LimitRow[];
}) {
  return (
    <div className="rounded-2xl bg-secondary p-3">
      <p className="mb-2 flex items-center gap-2 text-sm font-bold text-foreground">
        <Icon className="size-4 text-primary" aria-hidden />
        {title}
      </p>
      {rows.length === 0 ? (
        <p className="px-1 py-3 text-xs text-muted-foreground">—</p>
      ) : (
        <ul className="max-h-80 space-y-1.5 overflow-y-auto pe-1">
          {rows.map((row) => (
            <LimitItem key={row.id} scope={scope} row={row} />
          ))}
        </ul>
      )}
    </div>
  );
}

function LimitItem({ scope, row }: { scope: "department" | "person"; row: LimitRow }) {
  const t = useDictionary();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <li className="flex items-center justify-between gap-3 rounded-xl bg-card px-3 py-2">
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-foreground">
          <Latin>{row.name}</Latin>
        </span>
        {row.detail ? (
          <span className="block truncate text-[11px] text-muted-foreground">
            <Latin>{row.detail}</Latin>
          </span>
        ) : null}
      </span>
      <select
        defaultValue={row.limit ?? ""}
        disabled={pending}
        aria-label={t.canteenMenu.limitsTitle}
        onChange={(event) => {
          const value = event.target.value === "" ? null : Number(event.target.value);
          startTransition(async () => {
            const result = await setMealLimit(scope, row.id, value);
            if (result.ok) toast.success(result.message);
            else toast.error(result.message);
            router.refresh();
          });
        }}
        className="rounded-xl border border-input bg-background px-2 py-1.5 font-latin text-sm disabled:opacity-50"
      >
        <option value="">{t.canteenMenu.limitDefault}</option>
        {[1, 2, 3, 4, 5, 6].map((count) => (
          <option key={count} value={count}>
            {count}
          </option>
        ))}
      </select>
    </li>
  );
}
