"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Ban, ChefHat, MoveRight, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Fill } from "@/components/fill";
import { useDictionary } from "@/components/language-provider";
import { Latin } from "@/components/latin";
import { Card, SectionTitle } from "@/components/ui-kit";
import { formatDate, formatPKR } from "@/lib/time";
import { cn } from "@/lib/utils";

import {
  addMenuItem,
  copyScheduleToDay,
  moveMeal,
  chooseServed,
  removeMenuItem,
  setNoMeal,
  type MenuResult,
} from "../menu-actions";

const INITIAL: MenuResult = { ok: false, message: "" };

const INPUT =
  "w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/30";

export interface DayMenuView {
  date: string;
  source: "day" | "weekly" | "none" | "off" | "choose";
  /** The weekday's dishes always served, and its alternatives. */
  fixed: { name: string; price: number }[];
  options: { name: string; price: number }[];
  working: boolean;
  price: number;
  /** Ids only on a day's own menu; the schedule's dishes are edited in settings. */
  items: { id: string | null; name: string; price: number }[];
  meals: number;
  amount: number;
}

/**
 * One day's menu, what a meal of it cost, and what the day came to.
 *
 * The office picks a day and either keeps the weekly menu or gives that day
 * its own. The totals underneath are the same arithmetic the invoice prints.
 */
export function DayMenuCard({
  day,
  canManage,
  available,
  onPickHref,
}: {
  day: DayMenuView;
  canManage: boolean;
  available: boolean;
  /** Base URL the day picker navigates to, with `day=` appended. */
  onPickHref: string;
}) {
  const t = useDictionary();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const [moveTarget, setMoveTarget] = useState("");
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

  const own = day.source === "day";

  function run(task: () => Promise<MenuResult>) {
    startTransition(async () => {
      const result = await task();
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      router.refresh();
    });
  }

  return (
    <Card className="p-4 sm:p-6">
      <SectionTitle
        icon={ChefHat}
        title={<Fill template={t.canteenMenu.dayTitle} values={{ date: formatDate(day.date) }} />}
        subtitle={t.canteenMenu.hint}
        action={
          <label className="block">
            <span className="sr-only">{t.canteenMenu.pickDay}</span>
            <input
              type="date"
              defaultValue={day.date}
              dir="ltr"
              onChange={(event) => {
                if (event.target.value) router.push(`${onPickHref}&day=${event.target.value}`);
              }}
              className="rounded-2xl border border-input bg-background px-3 py-2 font-latin text-sm"
            />
          </label>
        }
      />

      {!available ? (
        <p className="rounded-2xl bg-warning-soft px-4 py-3 text-sm font-semibold text-warning">
          {t.canteenMenu.notMigrated}
        </p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-bold",
                own ? "bg-primary-soft text-primary" : "bg-secondary text-muted-foreground",
              )}
            >
              {own
                ? t.canteenMenu.ownMenu
                : day.source === "choose"
                  ? t.canteenMenu.notChosenBadge
                  : day.source === "off"
                    ? t.canteenMenu.noMealMarked
                    : day.source === "weekly"
                      ? t.canteenMenu.fromSchedule
                      : day.working
                        ? t.canteenMenu.noDishes
                        : t.canteenMenu.closed}
            </span>
            <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-bold text-foreground">
              <Fill template={t.canteenMenu.perMeal} values={{ amount: formatPKR(day.price) }} />
            </span>
            <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
              <Fill
                template={t.canteenMenu.mealsThatDay}
                values={{
                  meals: day.meals,
                  price: formatPKR(day.price),
                  amount: formatPKR(day.amount),
                }}
              />
            </span>
          </div>

          {day.items.length === 0 ? (
            <p className="rounded-2xl bg-secondary px-4 py-6 text-center text-sm text-muted-foreground">
              {t.canteenMenu.noDishes}
            </p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {day.items.map((item, index) => (
                <li
                  key={item.id ?? `${item.name}-${index}`}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-secondary px-4 py-2.5"
                >
                  <span className="min-w-0 truncate text-sm font-semibold text-foreground">
                    {item.name}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-sm tabular-nums text-muted-foreground">
                      <Latin>{formatPKR(item.price)}</Latin>
                    </span>
                    {canManage && own && item.id ? (
                      <button
                        type="button"
                        aria-label={t.canteenMenu.remove}
                        disabled={pending}
                        onClick={() => run(() => removeMenuItem("day", item.id!))}
                        className="rounded-lg p-1 text-muted-foreground hover:text-danger disabled:opacity-50"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {day.options.length > 0 && day.source !== "off" ? (
            <div
              className={cn(
                "mt-4 rounded-2xl p-3",
                day.source === "choose" ? "bg-warning-soft" : "bg-secondary",
              )}
            >
              <p className="text-xs font-bold text-foreground">{t.canteenMenu.whatServed}</p>
              {day.source === "choose" ? (
                <p className="mt-0.5 text-[11px] font-semibold text-warning">
                  <Fill
                    template={t.canteenMenu.notChosen}
                    values={{ amount: formatPKR(day.price) }}
                  />
                </p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2">
                {day.options.map((option) => {
                  const chosen = own && day.items.some((item) => item.name === option.name);
                  const label = (
                    <>
                      {option.name} · <Latin>{formatPKR(option.price)}</Latin>
                    </>
                  );
                  return canManage ? (
                    <button
                      key={option.name}
                      type="button"
                      disabled={pending || chosen}
                      aria-pressed={chosen}
                      onClick={() =>
                        run(() =>
                          chooseServed(day.date, [
                            ...day.fixed.map((item) => ({ name: item.name, price: item.price })),
                            { name: option.name, price: option.price },
                          ]),
                        )
                      }
                      className={cn(
                        "rounded-2xl px-4 py-2 text-sm font-bold transition-colors disabled:cursor-default",
                        chosen
                          ? "bg-primary text-primary-foreground"
                          : "bg-card text-foreground hover:text-primary disabled:opacity-50",
                      )}
                    >
                      {label}
                    </button>
                  ) : (
                    <span
                      key={option.name}
                      className={cn(
                        "rounded-2xl px-4 py-2 text-sm font-bold",
                        chosen
                          ? "bg-primary text-primary-foreground"
                          : "bg-card text-muted-foreground",
                      )}
                    >
                      {label}
                    </span>
                  );
                })}
              </div>
            </div>
          ) : null}

          {canManage ? (
            <div className="mt-4 space-y-3">
              {!own && day.items.length > 0 ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(() =>
                      copyScheduleToDay(
                        day.date,
                        day.items.map((item) => ({ name: item.name, price: item.price })),
                      ),
                    )
                  }
                  className="inline-flex items-center gap-2 rounded-2xl bg-secondary px-4 py-2 text-sm font-bold text-foreground hover:text-primary disabled:opacity-50"
                >
                  <Pencil className="size-4" aria-hidden />
                  {t.canteenMenu.changeThisDay}
                </button>
              ) : null}

              {/* Any date can be changed by hand: no meal here, or this meal
                  served on another day instead — Monday none, Thursday chicken. */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => setNoMeal(day.date, day.source !== "off"))}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-bold disabled:opacity-50",
                    day.source === "off"
                      ? "bg-success-soft text-success"
                      : "bg-danger-soft text-danger",
                  )}
                >
                  <Ban className="size-4" aria-hidden />
                  {day.source === "off" ? t.canteenMenu.serveAgain : t.canteenMenu.noMealToday}
                </button>

                {day.items.length > 0 ? (
                  <span className="inline-flex flex-wrap items-center gap-2 rounded-2xl bg-secondary px-3 py-1.5">
                    <span className="text-xs font-bold text-foreground">
                      {t.canteenMenu.moveTo}
                    </span>
                    <input
                      type="date"
                      value={moveTarget}
                      onChange={(event) => setMoveTarget(event.target.value)}
                      dir="ltr"
                      aria-label={t.canteenMenu.moveTo}
                      className="rounded-xl border border-input bg-background px-2 py-1 font-latin text-xs"
                    />
                    <button
                      type="button"
                      disabled={pending || !moveTarget || moveTarget === day.date}
                      onClick={() =>
                        run(() =>
                          moveMeal(
                            day.date,
                            moveTarget,
                            day.items.map((item) => ({ name: item.name, price: item.price })),
                          ),
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1 text-xs font-bold text-primary-foreground disabled:opacity-50"
                    >
                      <MoveRight className="size-3.5 rtl-flip" aria-hidden />
                      {t.canteenMenu.move}
                    </button>
                  </span>
                ) : null}
              </div>

              <p className="text-xs text-muted-foreground">{t.canteenMenu.dayHint}</p>
              <form
                ref={formRef}
                action={action}
                className="grid gap-2 sm:grid-cols-[1fr_8rem_auto]"
              >
                <input type="hidden" name="day" value={day.date} />
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
                <AddDish />
              </form>
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}

function AddDish() {
  const t = useDictionary();
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60"
    >
      <Plus className="size-4" aria-hidden />
      {t.canteenMenu.add}
    </button>
  );
}
