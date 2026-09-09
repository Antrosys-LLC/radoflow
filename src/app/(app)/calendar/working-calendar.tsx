"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { CalendarDays, CalendarPlus, Repeat, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { AskAbout } from "@/components/assistant/ask-about";
import { Fill } from "@/components/fill";
import { useDictionary } from "@/components/language-provider";
import { Latin } from "@/components/latin";
import { Card, SectionTitle } from "@/components/ui-kit";
import { formatDate, todayInPakistan } from "@/lib/time";
import { cn } from "@/lib/utils";

import {
  deleteCalendarDay,
  saveCalendarDay,
  setWeekdayWorking,
  type CalendarResult,
} from "./actions";

/**
 * The working calendar: which days the factory runs.
 *
 * Two questions, kept apart on the screen because they are kept apart in the
 * database and because confusing them is expensive. The top card is the
 * standing weekly rule — turning Sunday on there opens *every* Sunday. The
 * bottom card is one dated exception, which is what "we are working this
 * Sunday" actually means and what a manager reaches for the evening before.
 *
 * Factory names, reasons and multipliers come out of rows, so they are
 * wrapped rather than translated. Dates are `<Latin>` for the reason every
 * other screen wraps them: a date reordered by the bidirectional algorithm
 * inside an Urdu sentence reads as a different date.
 */

const INITIAL: CalendarResult = { ok: false, message: "" };

const INPUT =
  "mt-1 w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/30";

/** Dates and numbers, stated left-to-right in the Latin face. */
const NUMERIC_INPUT = cn(INPUT, "font-latin");

export type DayType = "workday" | "off" | "holiday" | "weekend_working" | "special_working";

export interface SiteRow {
  id: string;
  name: string;
}

export interface WeekdayRow {
  siteId: string;
  weekday: number;
  isWorking: boolean;
}

export interface CalendarDayRow {
  id: string;
  siteId: string;
  day: string;
  dayType: DayType;
  reason: string | null;
}

/**
 * 0–6 as `Date.getDay()` counts them, which is the same order the `work_week`
 * table stores and the same order the week is read here — Sunday first,
 * because Sunday is the day this screen exists to change.
 */
const WEEKDAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

const DAY_TYPES: readonly DayType[] = [
  "workday",
  "off",
  "holiday",
  "weekend_working",
  "special_working",
];

/** Green for a day worked, grey for a day off — the same pairing everywhere. */
function toneFor(dayType: DayType): string {
  return dayType === "off" || dayType === "holiday"
    ? "bg-secondary text-muted-foreground"
    : "bg-success-soft text-success";
}

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition-all hover:opacity-90 disabled:opacity-60"
    >
      <Save className="size-4" aria-hidden />
      {pending ? pendingLabel : label}
    </button>
  );
}

export function WorkingCalendar({
  sites,
  weekdays,
  days,
  canManage,
}: {
  sites: SiteRow[];
  weekdays: WeekdayRow[];
  days: CalendarDayRow[];
  canManage: boolean;
}) {
  const t = useDictionary();
  const [siteId, setSiteId] = useState(sites[0]?.id ?? "");
  const [editing, setEditing] = useState<CalendarDayRow | null>(null);
  const [adding, setAdding] = useState(false);

  const pattern = new Map(
    weekdays.filter((row) => row.siteId === siteId).map((row) => [row.weekday, row.isWorking]),
  );
  const exceptions = days.filter((row) => row.siteId === siteId);

  return (
    <div className="space-y-5 pb-6">
      {sites.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {sites.map((site) => (
            <button
              key={site.id}
              type="button"
              onClick={() => setSiteId(site.id)}
              aria-pressed={siteId === site.id}
              className={cn(
                "rounded-2xl px-4 py-2 text-sm font-bold transition-all",
                siteId === site.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground",
              )}
            >
              <Latin>{site.name}</Latin>
            </button>
          ))}
        </div>
      ) : null}

      <Card className="p-4 sm:p-6">
        <SectionTitle
          icon={Repeat}
          title={t.calendar.weeklyPattern}
          subtitle={t.calendar.weeklyPatternHint}
        />

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {WEEKDAY_KEYS.map((key, weekday) => (
            <WeekdayToggle
              key={key}
              siteId={siteId}
              weekday={weekday}
              label={t.calendar.weekday[key]}
              // A site seeded before the pattern existed has no row at all.
              // The database resolves that to a working day, so the screen
              // has to say the same thing rather than guess "off".
              isWorking={pattern.get(weekday) ?? true}
              canManage={canManage}
            />
          ))}
        </div>

        {!canManage ? (
          <p className="mt-3 text-xs text-muted-foreground">{t.calendar.readOnly}</p>
        ) : null}
      </Card>

      <Card className="p-4 sm:p-6">
        <SectionTitle
          icon={CalendarDays}
          title={t.calendar.exceptions}
          subtitle={t.calendar.exceptionsHint}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <AskAbout
                context={{
                  surface: "calendar",
                  subject: t.calendar.exceptions,
                  facts: {
                    workingWeekdays: WEEKDAY_KEYS.filter(
                      (_key, weekday) => pattern.get(weekday) ?? true,
                    ).join(", "),
                    datedChanges: exceptions.length,
                  },
                }}
              />
              {canManage ? (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-all hover:opacity-90"
                >
                  <CalendarPlus className="size-4" aria-hidden />
                  {t.calendar.addException}
                </button>
              ) : null}
            </div>
          }
        />

        {exceptions.length === 0 ? (
          <div className="mt-4 rounded-2xl bg-secondary px-5 py-8 text-center">
            <p className="text-sm font-bold text-foreground">{t.calendar.noExceptions}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t.calendar.noExceptionsHint}</p>
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {exceptions.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-3 rounded-2xl bg-secondary px-4 py-3"
              >
                <span className="text-sm font-bold text-foreground">
                  <Latin>{formatDate(row.day)}</Latin>
                </span>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[11px] font-bold",
                    toneFor(row.dayType),
                  )}
                >
                  {t.calendar.dayType[row.dayType]}
                </span>
                {row.reason ? (
                  <span className="text-xs text-muted-foreground">
                    <Latin>{row.reason}</Latin>
                  </span>
                ) : null}

                {canManage ? (
                  <span className="ms-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing(row)}
                      className="rounded-xl bg-card px-3 py-1.5 text-xs font-bold text-foreground transition-colors hover:bg-background"
                    >
                      {t.calendar.edit}
                    </button>
                    <RemoveButton id={row.id} label={t.calendar.remove} />
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {adding || editing ? (
        <ExceptionDialog
          siteId={siteId}
          row={editing}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * One weekday of the standing pattern.
 *
 * Submits on the click rather than behind a Save button: there is one field,
 * and a toggle that needs confirming is a toggle nobody trusts.
 */
function WeekdayToggle({
  siteId,
  weekday,
  label,
  isWorking,
  canManage,
}: {
  siteId: string;
  weekday: number;
  label: string;
  isWorking: boolean;
  canManage: boolean;
}) {
  const t = useDictionary();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  /*
   * Optimistic, for the same reason the language switch is: the round trip
   * revalidates the whole layout, and a toggle that waits for that reads as
   * broken. Reset only on failure — on success the server agrees.
   */
  const [chosen, setChosen] = useState<boolean | null>(null);
  const working = chosen ?? isWorking;

  function toggle() {
    if (!canManage || pending) return;

    const next = !working;
    setChosen(next);

    const data = new FormData();
    data.set("site_id", siteId);
    data.set("weekday", String(weekday));
    data.set("is_working", String(next));

    startTransition(async () => {
      const result = await setWeekdayWorking(INITIAL, data);
      if (result.ok) {
        toast.success(next ? t.calendar.nowWorking : t.calendar.nowOff);
      } else {
        setChosen(null);
        toast.error(result.message || t.calendar.saveFailed);
      }
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={!canManage || pending}
      aria-pressed={working}
      className={cn(
        "rounded-2xl px-3 py-4 text-center transition-all disabled:opacity-60",
        working ? "bg-success-soft text-success" : "bg-secondary text-muted-foreground",
        canManage && "hover:opacity-90",
      )}
    >
      <span className="block text-sm font-bold">{label}</span>
      <span className="mt-0.5 block text-[11px] font-semibold">
        {working ? t.calendar.working : t.calendar.off}
      </span>
    </button>
  );
}

function RemoveButton({ id, label }: { id: string; label: string }) {
  const t = useDictionary();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      aria-label={label}
      title={label}
      onClick={() => {
        const data = new FormData();
        data.set("id", id);
        startTransition(async () => {
          const result = await deleteCalendarDay(INITIAL, data);
          if (result.ok) toast.success(t.calendar.removed);
          else toast.error(result.message || t.calendar.saveFailed);
          router.refresh();
        });
      }}
      className="rounded-xl bg-danger-soft px-3 py-1.5 text-danger transition-colors hover:opacity-90 disabled:opacity-60"
    >
      <Trash2 className="size-4" aria-hidden />
    </button>
  );
}

/** Adding or rewriting one dated exception. */
function ExceptionDialog({
  siteId,
  row,
  onClose,
}: {
  siteId: string;
  row: CalendarDayRow | null;
  onClose: () => void;
}) {
  const t = useDictionary();
  const router = useRouter();
  const [state, action] = useActionState(saveCalendarDay, INITIAL);

  useEffect(() => {
    if (!state.message) return;
    if (state.ok) {
      toast.success(t.calendar.saved);
      router.refresh();
      onClose();
    } else {
      toast.error(state.message);
    }
    // `state` is the only trigger. Listing the callbacks would re-fire the
    // toast on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-charcoal/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl border border-border bg-card p-5 shadow-[0_24px_60px_rgb(0_0_0/0.25)] sm:max-w-lg sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-bold text-foreground">
            {row ? (
              <Fill template={t.calendar.editException} values={{ date: formatDate(row.day) }} />
            ) : (
              t.calendar.addExceptionTitle
            )}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.cancel}
            className="rounded-xl bg-secondary p-2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <form action={action} className="mt-4 space-y-4">
          <input type="hidden" name="site_id" value={siteId} readOnly />

          <label className="block">
            <span className="text-xs font-bold text-muted-foreground">{t.calendar.date}</span>
            <input
              type="date"
              name="day"
              required
              defaultValue={row?.day ?? todayInPakistan()}
              className={NUMERIC_INPUT}
              dir="ltr"
            />
          </label>

          <fieldset>
            <legend className="text-xs font-bold text-muted-foreground">{t.calendar.kind}</legend>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {DAY_TYPES.map((dayType) => (
                <label
                  key={dayType}
                  className="flex cursor-pointer items-start gap-3 rounded-2xl bg-secondary px-4 py-3 text-sm font-semibold text-foreground has-[:checked]:bg-primary-soft has-[:checked]:text-primary"
                >
                  <input
                    type="radio"
                    name="day_type"
                    value={dayType}
                    defaultChecked={(row?.dayType ?? "weekend_working") === dayType}
                    className="mt-1 accent-primary"
                  />
                  <span>
                    {t.calendar.dayType[dayType]}
                    <span className="block text-[11px] font-normal text-muted-foreground">
                      {t.calendar.dayTypeHint[dayType]}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block">
            <span className="text-xs font-bold text-muted-foreground">{t.calendar.reason}</span>
            <input
              type="text"
              name="reason"
              defaultValue={row?.reason ?? ""}
              placeholder={t.calendar.reasonPlaceholder}
              className={INPUT}
            />
            <span className="mt-1 block text-[11px] text-muted-foreground">
              {t.calendar.reasonHint}
            </span>
          </label>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl bg-secondary px-5 py-3 text-sm font-bold text-muted-foreground transition-colors hover:text-foreground"
            >
              {t.common.cancel}
            </button>
            <SubmitButton label={t.common.save} pendingLabel={t.common.saving} />
          </div>
        </form>
      </div>
    </div>
  );
}
