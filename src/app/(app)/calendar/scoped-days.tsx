"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Save, Trash2, UserRound, UsersRound, X, CalendarPlus } from "lucide-react";
import { toast } from "sonner";

import { useDictionary } from "@/components/language-provider";
import { Latin } from "@/components/latin";
import { Card, SectionTitle } from "@/components/ui-kit";
import { formatDate, todayInPakistan } from "@/lib/time";
import { cn } from "@/lib/utils";

import type { CalendarResult } from "./actions";
import { deleteCalendarOverride, saveCalendarOverride } from "./override-actions";

/**
 * Days that belong to one department or one person.
 *
 * Below the factory's own calendar, because that is the order they are
 * consulted in reverse: a person's day beats their department's, and a
 * department's beats the factory's.
 */

export type ScopedDayType = "workday" | "off" | "holiday" | "weekend_working" | "special_working";

export interface OverrideRow {
  id: string;
  siteId: string;
  scope: "department" | "person";
  departmentId: string | null;
  profileId: string | null;
  day: string;
  dayType: ScopedDayType;
  reason: string | null;
}

export interface DepartmentOption {
  id: string;
  name: string;
  siteId: string | null;
}

export interface CalendarPerson {
  id: string;
  name: string;
  code: string;
  departmentId: string | null;
}

const INITIAL: CalendarResult = { ok: false, message: "" };
const DAY_TYPES: readonly ScopedDayType[] = [
  "holiday",
  "off",
  "workday",
  "weekend_working",
  "special_working",
];

const INPUT =
  "mt-1 w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/30";

function toneFor(dayType: ScopedDayType): string {
  return dayType === "off" || dayType === "holiday"
    ? "bg-secondary text-muted-foreground"
    : "bg-success-soft text-success";
}

export function ScopedDays({
  siteId,
  approverId,
  canManage,
  departments,
  people,
  overrides,
}: {
  siteId: string;
  approverId: string;
  canManage: boolean;
  departments: DepartmentOption[];
  people: CalendarPerson[];
  overrides: OverrideRow[];
}) {
  const t = useDictionary();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);

  const deptName = useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments]);
  const person = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const rows = overrides.filter((row) => row.siteId === siteId);

  return (
    <Card className="p-4 sm:p-6">
      <SectionTitle
        icon={UsersRound}
        title={t.calendarScope.scopedTitle}
        subtitle={t.calendarScope.scopedHint}
        action={
          canManage ? (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-all hover:opacity-90"
            >
              <CalendarPlus className="size-4" aria-hidden />
              {t.calendarScope.addScoped}
            </button>
          ) : null
        }
      />

      {rows.length === 0 ? (
        <p className="rounded-2xl bg-secondary px-5 py-8 text-center text-sm text-muted-foreground">
          {t.calendarScope.noScoped}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const who =
              row.scope === "department"
                ? (row.departmentId && deptName.get(row.departmentId)) || "—"
                : row.profileId && person.get(row.profileId)
                  ? `${person.get(row.profileId)!.name} · ${person.get(row.profileId)!.code}`
                  : "—";
            const Icon = row.scope === "department" ? UsersRound : UserRound;

            return (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-3 rounded-2xl bg-secondary px-4 py-3"
              >
                <span className="text-sm font-bold text-foreground">
                  <Latin>{formatDate(row.day)}</Latin>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-2.5 py-0.5 text-[11px] font-bold text-foreground">
                  <Icon className="size-3.5" aria-hidden />
                  <Latin>{who}</Latin>
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
                  <button
                    type="button"
                    disabled={pending}
                    aria-label={t.calendar.remove}
                    onClick={() => {
                      const data = new FormData();
                      data.set("id", row.id);
                      data.set("approver_id", approverId);
                      startTransition(async () => {
                        const result = await deleteCalendarOverride(INITIAL, data);
                        if (result.ok) toast.success(result.message);
                        else toast.error(result.message || t.calendar.saveFailed);
                        router.refresh();
                      });
                    }}
                    className="ms-auto rounded-xl bg-danger-soft px-3 py-1.5 text-danger transition-colors hover:opacity-90 disabled:opacity-60"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {adding ? (
        <ScopedDayDialog
          siteId={siteId}
          approverId={approverId}
          departments={departments.filter((d) => !d.siteId || d.siteId === siteId)}
          people={people}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </Card>
  );
}

function SubmitButton() {
  const t = useDictionary();
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition-all hover:opacity-90 disabled:opacity-60"
    >
      <Save className="size-4" aria-hidden />
      {pending ? t.common.saving : t.common.save}
    </button>
  );
}

function ScopedDayDialog({
  siteId,
  approverId,
  departments,
  people,
  onClose,
}: {
  siteId: string;
  approverId: string;
  departments: DepartmentOption[];
  people: CalendarPerson[];
  onClose: () => void;
}) {
  const t = useDictionary();
  const router = useRouter();
  const [state, action] = useActionState(saveCalendarOverride, INITIAL);
  const [scope, setScope] = useState<"department" | "person">("department");
  const [departmentId, setDepartmentId] = useState("");
  const [profileId, setProfileId] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!state.message) return;
    if (state.ok) {
      toast.success(state.message);
      router.refresh();
      onClose();
    } else {
      toast.error(state.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (
      q
        ? people.filter((p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q))
        : people
    ).slice(0, 200);
  }, [people, query]);

  const scopeName =
    scope === "department"
      ? (departments.find((d) => d.id === departmentId)?.name ?? "")
      : (() => {
          const p = people.find((row) => row.id === profileId);
          return p ? `${p.name} (${p.code})` : "";
        })();

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-charcoal/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl border border-border bg-card p-5 shadow-[0_24px_60px_rgb(0_0_0/0.25)] sm:max-w-lg sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-bold text-foreground">{t.calendarScope.addScoped}</h2>
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
          <input type="hidden" name="approver_id" value={approverId} readOnly />
          <input type="hidden" name="scope" value={scope} readOnly />
          <input type="hidden" name="scope_name" value={scopeName} readOnly />

          <fieldset>
            <legend className="text-xs font-bold text-muted-foreground">
              {t.calendarScope.scope}
            </legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(["department", "person"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setScope(option)}
                  aria-pressed={scope === option}
                  className={cn(
                    "rounded-2xl px-4 py-3 text-sm font-bold transition-all",
                    scope === option
                      ? "bg-primary-soft text-primary"
                      : "bg-secondary text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option === "department" ? t.calendarScope.department : t.calendarScope.person}
                </button>
              ))}
            </div>
          </fieldset>

          {scope === "department" ? (
            <label className="block">
              <span className="text-xs font-bold text-muted-foreground">
                {t.calendarScope.department}
              </span>
              <select
                name="department_id"
                required
                value={departmentId}
                onChange={(event) => setDepartmentId(event.target.value)}
                className={INPUT}
              >
                <option value="" disabled>
                  {t.calendarScope.chooseDepartment}
                </option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="block">
              <span className="text-xs font-bold text-muted-foreground">
                {t.calendarScope.person}
              </span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t.calendarScope.searchPerson}
                className={INPUT}
              />
              <select
                name="profile_id"
                required
                value={profileId}
                onChange={(event) => setProfileId(event.target.value)}
                className={cn(INPUT, "mt-2")}
              >
                <option value="" disabled>
                  {t.calendarScope.choosePerson}
                </option>
                {matches.map((row) => (
                  <option key={row.id} value={row.id}>
                    {`${row.name} · ${row.code}`}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block">
            <span className="text-xs font-bold text-muted-foreground">{t.calendar.date}</span>
            <input
              type="date"
              name="day"
              required
              defaultValue={todayInPakistan()}
              dir="ltr"
              className={cn(INPUT, "font-latin")}
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
                    defaultChecked={dayType === "holiday"}
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
              placeholder={t.calendar.reasonPlaceholder}
              className={INPUT}
            />
          </label>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl bg-secondary px-5 py-3 text-sm font-bold text-muted-foreground transition-colors hover:text-foreground"
            >
              {t.common.cancel}
            </button>
            <SubmitButton />
          </div>
        </form>
      </div>
    </div>
  );
}
