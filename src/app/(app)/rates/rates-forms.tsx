"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Fill } from "@/components/fill";
import { useDictionary } from "@/components/language-provider";
import { Latin } from "@/components/latin";
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
  const t = useDictionary();
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
        <p className="text-xs font-bold uppercase tracking-wide text-primary">
          <Latin>{siteName}</Latin>
        </p>
        <p className="mt-1 text-sm text-foreground">{t.rates.perHourNote}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Money
          name="ot_hourly_rate"
          label={t.rates.otRate}
          hint={t.rates.otRateHint}
          value={ot}
          onChange={setOt}
        />
        <Money
          name="weekend_hourly_rate"
          label={t.rates.weekendRate}
          hint={t.rates.weekendRateHint}
          value={weekend}
          onChange={setWeekend}
        />
        <Money
          name="holiday_hourly_rate"
          label={t.rates.holidayRate}
          hint={t.rates.holidayRateHint}
          value={holiday}
          onChange={setHoliday}
        />
        <Money
          name="night_hourly_rate"
          label={t.rates.nightRate}
          hint={t.rates.nightRateHint}
          value={current?.night_hourly_rate ?? 0}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t.rates.standardHours}>
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
        <Field label={t.rates.workingDaysMonth}>
          <input
            name="standard_days_per_month"
            type="number"
            step="0.5"
            defaultValue={current?.standard_days_per_month ?? 26}
            className={INPUT}
          />
        </Field>
        <Field label={t.rates.otAfter}>
          <input
            name="ot_threshold_minutes"
            type="number"
            min="0"
            defaultValue={current?.ot_threshold_minutes ?? 30}
            className={INPUT}
          />
        </Field>
        <Field label={t.rates.roundTo}>
          <input
            name="round_to_minutes"
            type="number"
            min="1"
            defaultValue={current?.round_to_minutes ?? 15}
            className={INPUT}
          />
        </Field>
      </div>

      <Field label={t.rates.effectiveFrom} hint={t.rates.effectiveFromHint}>
        <input
          name="effective_from"
          type="date"
          defaultValue={today}
          dir="ltr"
          className={`${INPUT} max-w-xs`}
        />
      </Field>

      <div className="rounded-2xl bg-secondary p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {t.rates.whatThisPays}
        </p>
        {/* Each example is one sentence with the figure inside it: Urdu puts
            the amount before the description, and a bold <strong> glued to a
            tail cannot move. */}
        <ul className="mt-2 space-y-1 text-sm text-foreground">
          <li>
            <Fill
              template={t.rates.weekendShiftExample}
              values={{ amount: formatPKR(weekend * 8) }}
            />
          </li>
          <li>
            <Fill template={t.rates.overtimeExample} values={{ amount: formatPKR(ot * 4) }} />
          </li>
          <li>
            <Fill
              template={t.rates.holidayShiftExample}
              values={{ amount: formatPKR(holiday * 8) }}
            />
          </li>
        </ul>
      </div>

      <SaveButton label={t.rates.saveRates} />
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
  const t = useDictionary();
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
      <p className="rounded-2xl bg-secondary p-4 text-sm text-foreground">{t.rates.ladderNote}</p>

      {rules.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-separate border-spacing-y-2 text-sm">
            <thead>
              <tr className="text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
                <th className="px-4 pb-2">{t.rates.colBand}</th>
                <th className="px-4 pb-2">{t.rates.colLateFrom}</th>
                <th className="px-4 pb-2">{t.rates.colLateUntil}</th>
                <th className="px-4 pb-2">{t.rates.colDeduction}</th>
                <th className="px-4 pb-2" />
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="bg-secondary/70">
                  <td className="rounded-l-2xl px-4 py-3 font-semibold text-foreground">
                    <Latin>{rule.label}</Latin>
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    <Fill template={t.rates.minutes} values={{ minutes: rule.from_minutes }} />
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {rule.to_minutes === null ? (
                      t.rates.beyond
                    ) : (
                      <Fill template={t.rates.minutes} values={{ minutes: rule.to_minutes }} />
                    )}
                  </td>
                  <td className="px-4 py-3 font-bold tabular-nums text-danger">
                    <Fill
                      template={
                        rule.basis === "month" ? t.rates.penaltyOfMonthly : t.rates.penaltyOfDaily
                      }
                      values={{ percent: rule.penalty_percent }}
                    />
                  </td>
                  <td className="rounded-r-2xl px-4 py-3 text-right">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => remove(rule.id)}
                      aria-label={fill(t.rates.removeBand, { name: rule.label })}
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
          {t.rates.noBands}
        </p>
      )}

      <form
        action={formAction}
        className="grid gap-3 rounded-2xl bg-secondary p-4 sm:grid-cols-2 lg:grid-cols-6"
      >
        <input type="hidden" name="site_id" value={siteId} />
        <div className="lg:col-span-2">
          <Field label={t.rates.bandName}>
            <input
              name="label"
              required
              placeholder={t.rates.bandNamePlaceholder}
              className={INPUT}
            />
          </Field>
        </div>
        <Field label={t.rates.lateFromField}>
          <input
            name="from_minutes"
            type="number"
            min="0"
            required
            defaultValue={15}
            className={INPUT}
          />
        </Field>
        <Field label={t.rates.lateUntilField}>
          <input
            name="to_minutes"
            type="number"
            min="1"
            placeholder={t.rates.lateUntilPlaceholder}
            className={INPUT}
          />
        </Field>
        <Field label={t.rates.deductPercent}>
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
        <Field label={t.rates.basis}>
          <select name="basis" defaultValue="day" className={INPUT}>
            <option value="day">{t.rates.basisDay}</option>
            <option value="month">{t.rates.basisMonth}</option>
          </select>
        </Field>
        <div className="lg:col-span-6">
          <SaveButton label={t.rates.addBand} icon="plus" />
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

/**
 * The plain-string sibling of `<Fill>`, for an `aria-label` — an attribute
 * cannot hold JSX, so the slot is substituted here instead.
 */
function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => String(values[key] ?? ""));
}

function SaveButton({ label, icon }: { label: string; icon?: "plus" }) {
  const t = useDictionary();
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-[0_10px_24px_rgb(239_86_25/0.25)] transition-all hover:-translate-y-0.5 disabled:opacity-60"
    >
      {icon === "plus" ? <Plus className="size-4" /> : <Save className="size-4" />}
      {pending ? t.common.saving : label}
    </button>
  );
}
