"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { formatPKR } from "@/lib/time";
import { deleteLateRule, saveLateRule, saveRates, type RatesResult } from "./actions";

const INITIAL: RatesResult = { ok: false, message: "" };

const INPUT =
  "mt-1.5 w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/30";

function useToast(state: RatesResult, onOk?: () => void) {
  const router = useRouter();
  useEffect(() => {
    if (!state.message) return;
    if (state.ok) {
      toast.success(state.message);
      onOk?.();
      router.refresh();
    } else {
      toast.error(state.message);
    }
    // onOk is a stable inline callback from the caller; excluding it keeps this
    // from re-firing the toast on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, router]);
}

export interface RateValues {
  site_id: string;
  effective_from: string;
  standard_hours_per_day: number;
  standard_days_per_month: number;
  ot_hourly_rate: number;
  weekend_hourly_rate: number;
  holiday_hourly_rate: number;
  night_hourly_rate: number;
  ot_threshold_minutes: number;
  round_to_minutes: number;
}

export function RatesForm({
  siteId,
  siteName,
  current,
  today,
}: {
  siteId: string;
  siteName: string;
  current: RateValues | null;
  today: string;
}) {
  const [state, formAction] = useActionState(saveRates, INITIAL);
  useToast(state);

  const [ot, setOt] = useState(current?.ot_hourly_rate ?? 0);
  const [weekend, setWeekend] = useState(current?.weekend_hourly_rate ?? 0);
  const [holiday, setHoliday] = useState(current?.holiday_hourly_rate ?? 0);
  const [hours, setHours] = useState(current?.standard_hours_per_day ?? 8);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="site_id" value={siteId} />

      <div className="rounded-2xl bg-primary-soft p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-primary">{siteName}</p>
        <p className="mt-1 text-sm text-foreground">
          Rates are rupees <strong>per hour</strong>, not a multiple of the basic wage. Changing
          someone&apos;s basic pay leaves these untouched.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Money
          name="ot_hourly_rate"
          label="Overtime rate"
          hint="Per hour beyond the standard day"
          value={ot}
          onChange={setOt}
        />
        <Money
          name="weekend_hourly_rate"
          label="Weekend / off-day rate"
          hint="Per hour on an activated rest day"
          value={weekend}
          onChange={setWeekend}
        />
        <Money
          name="holiday_hourly_rate"
          label="Holiday rate"
          hint="Per hour on a declared holiday"
          value={holiday}
          onChange={setHoliday}
        />
        <Money
          name="night_hourly_rate"
          label="Night shift rate"
          hint="Per hour on the night rotation"
          value={current?.night_hourly_rate ?? 0}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Standard hours / day">
          <input
            name="standard_hours_per_day"
            type="number"
            step="0.5"
            min="1"
            max="24"
            defaultValue={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className={INPUT}
          />
        </Field>
        <Field label="Working days / month">
          <input
            name="standard_days_per_month"
            type="number"
            step="0.5"
            defaultValue={current?.standard_days_per_month ?? 26}
            className={INPUT}
          />
        </Field>
        <Field label="Overtime starts after (min)">
          <input
            name="ot_threshold_minutes"
            type="number"
            min="0"
            defaultValue={current?.ot_threshold_minutes ?? 30}
            className={INPUT}
          />
        </Field>
        <Field label="Round hours to (min)">
          <input
            name="round_to_minutes"
            type="number"
            min="1"
            defaultValue={current?.round_to_minutes ?? 15}
            className={INPUT}
          />
        </Field>
      </div>

      <Field
        label="Effective from"
        hint="A new date creates a new rate set; past payroll keeps the old rates."
      >
        <input
          name="effective_from"
          type="date"
          defaultValue={today}
          className={`${INPUT} max-w-xs`}
        />
      </Field>

      <div className="rounded-2xl bg-secondary p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          What this pays
        </p>
        <ul className="mt-2 space-y-1 text-sm text-foreground">
          <li>
            An 8-hour weekend shift: <strong>{formatPKR(weekend * 8)}</strong>
          </li>
          <li>
            4 hours of overtime: <strong>{formatPKR(ot * 4)}</strong>
          </li>
          <li>
            An 8-hour holiday shift: <strong>{formatPKR(holiday * 8)}</strong>
          </li>
        </ul>
      </div>

      <SaveButton label="Save rates" />
    </form>
  );
}

export interface LateRule {
  id: string;
  label: string;
  from_minutes: number;
  to_minutes: number | null;
  penalty_percent: number;
  basis: string;
}

export function LateRulesEditor({ siteId, rules }: { siteId: string; rules: LateRule[] }) {
  const [state, formAction] = useActionState(saveLateRule, INITIAL);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  useToast(state);

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteLateRule(id);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <p className="rounded-2xl bg-secondary p-4 text-sm text-foreground">
        Bands are a ladder, not cumulative — arriving 90 minutes late costs the 1–2 hour penalty
        only. Lateness is measured from shift start <strong>after</strong> the grace period.
      </p>

      {rules.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-separate border-spacing-y-2 text-sm">
            <thead>
              <tr className="text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
                <th className="px-4 pb-2">Band</th>
                <th className="px-4 pb-2">Late from</th>
                <th className="px-4 pb-2">Late until</th>
                <th className="px-4 pb-2">Deduction</th>
                <th className="px-4 pb-2" />
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="bg-secondary/70">
                  <td className="rounded-l-2xl px-4 py-3 font-semibold text-foreground">
                    {rule.label}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{rule.from_minutes} min</td>
                  <td className="px-4 py-3 tabular-nums">
                    {rule.to_minutes === null ? "and beyond" : `${rule.to_minutes} min`}
                  </td>
                  <td className="px-4 py-3 font-bold tabular-nums text-danger">
                    {rule.penalty_percent}% of {rule.basis === "month" ? "monthly" : "daily"} pay
                  </td>
                  <td className="rounded-r-2xl px-4 py-3 text-right">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => remove(rule.id)}
                      aria-label={`Remove ${rule.label}`}
                      className="flex size-9 items-center justify-center rounded-xl bg-card text-muted-foreground transition-all hover:text-danger disabled:opacity-50"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-2xl bg-warning-soft p-4 text-sm font-semibold text-warning">
          No late-arrival penalty is configured — lateness currently costs nothing.
        </p>
      )}

      <form
        action={formAction}
        className="grid gap-3 rounded-2xl bg-secondary p-4 sm:grid-cols-2 lg:grid-cols-6"
      >
        <input type="hidden" name="site_id" value={siteId} />
        <div className="lg:col-span-2">
          <Field label="Band name">
            <input name="label" required placeholder="Late 15–30 minutes" className={INPUT} />
          </Field>
        </div>
        <Field label="Late from (min)">
          <input
            name="from_minutes"
            type="number"
            min="0"
            required
            defaultValue={15}
            className={INPUT}
          />
        </Field>
        <Field label="Late until (min)">
          <input
            name="to_minutes"
            type="number"
            min="1"
            placeholder="blank = beyond"
            className={INPUT}
          />
        </Field>
        <Field label="Deduct (%)">
          <input
            name="penalty_percent"
            type="number"
            step="0.5"
            min="0"
            max="100"
            required
            defaultValue={5}
            className={INPUT}
          />
        </Field>
        <Field label="Of">
          <select name="basis" defaultValue="day" className={INPUT}>
            <option value="day">One day&apos;s pay</option>
            <option value="month">Monthly pay</option>
          </select>
        </Field>
        <div className="lg:col-span-6">
          <SaveButton label="Add band" icon="plus" />
        </div>
      </form>
    </div>
  );
}

function Money({
  name,
  label,
  hint,
  value,
  onChange,
}: {
  name: string;
  label: string;
  hint: string;
  value: number;
  onChange?: (v: number) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">
          ₨
        </span>
        <input
          name={name}
          type="number"
          step="1"
          min="0"
          required
          defaultValue={value}
          onChange={onChange ? (e) => onChange(Number(e.target.value)) : undefined}
          className={`${INPUT} pl-9 text-base font-bold`}
        />
      </div>
    </Field>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-sm font-semibold text-foreground">{label}</label>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {children}
    </div>
  );
}

function SaveButton({ label, icon }: { label: string; icon?: "plus" }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-[0_10px_24px_rgb(239_86_25/0.25)] transition-all hover:-translate-y-0.5 disabled:opacity-60"
    >
      {icon === "plus" ? <Plus className="size-4" /> : <Save className="size-4" />}
      {pending ? "Saving…" : label}
    </button>
  );
}
