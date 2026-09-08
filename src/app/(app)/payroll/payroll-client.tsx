"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { AlertTriangle, BadgeCheck, Banknote, Check, FileText, Play, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Fill } from "@/components/fill";
import { useDictionary } from "@/components/language-provider";
import { Latin } from "@/components/latin";
import { Avatar, Card, SectionTitle } from "@/components/ui-kit";
import type { Dictionary } from "@/lib/i18n";
import { formatDate, formatDateTime, formatHours, formatPKR } from "@/lib/time";
import { cn } from "@/lib/utils";
import {
  approvePeriod,
  createPeriod,
  markItemPaid,
  markItemUnpaid,
  markPeriodPaid,
  runPeriod,
  type PayrollResultMessage,
} from "./actions";

const INITIAL: PayrollResultMessage = { ok: false, message: "" };

export interface PeriodRow {
  id: string;
  label: string;
  period_start: string;
  period_end: string;
  status: string;
  headcount: number;
  total_gross: number;
  total_deductions: number;
  total_tax: number;
  total_net: number;
  locked: boolean;
  siteName: string;
}

export interface ItemRow {
  id: string;
  profile_id: string;
  full_name: string;
  employee_code: string;
  department: string;
  pay_class: string;
  regular_hours: number;
  ot_hours: number;
  weekend_hours: number;
  gross: number;
  deductions: number;
  tax: number;
  net: number;
  breakdown: {
    code: string;
    label: string;
    kind: string;
    hours?: number;
    rate?: number;
    amount: number;
  }[];
  /**
   * Hours the overtime ceiling dropped somewhere in this period — most often
   * a double-duty day. Nothing here is a wrong calculation; it means these
   * dates are worth a look before the run is approved.
   */
  flaggedHours: number;
  flaggedDays: { workDate: string; hours: number }[];
  /**
   * Plain-language explanation of why this line is worth a look — covers
   * dropped hours, an attendance anomaly, or a pay swing against this
   * person's recent history. Null means nothing was flagged, or the review
   * hasn't run (e.g. the assistant isn't configured).
   */
  reviewNote: string | null;
  /** When this person was actually handed their cash. Null means not yet. */
  paidAt: string | null;
}

const STATUS_TONE: Record<string, string> = {
  draft: "bg-secondary text-muted-foreground",
  review: "bg-warning-soft text-warning",
  approved: "bg-info-soft text-info",
  paid: "bg-success-soft text-success",
};

export function PayrollClient({
  periods,
  items,
  selectedId,
  sites,
  can,
}: {
  periods: PeriodRow[];
  items: ItemRow[];
  selectedId: string | null;
  sites: { id: string; name: string }[];
  can: { run: boolean; approve: boolean; pay: boolean };
}) {
  const t = useDictionary();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showNew, setShowNew] = useState(false);
  const [slip, setSlip] = useState<ItemRow | null>(null);

  const selected = periods.find((p) => p.id === selectedId) ?? null;

  function act(fn: () => Promise<PayrollResultMessage>, loading: string) {
    startTransition(async () => {
      const id = toast.loading(loading);
      const result = await fn();
      toast.dismiss(id);
      if (result.ok) toast.success(result.message, { duration: 9000 });
      else toast.error(result.message, { duration: 9000 });
      router.refresh();
    });
  }

  return (
    <div className="space-y-5 pb-6">
      <Card className="p-4 sm:p-6">
        <SectionTitle
          icon={Banknote}
          title={t.payroll.periods}
          subtitle={t.payroll.periodsHint}
          action={
            can.run ? (
              <button
                type="button"
                onClick={() => setShowNew(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-[0_10px_24px_rgb(239_86_25/0.25)] transition-all hover:-translate-y-0.5"
              >
                <Plus className="size-4" />
                {t.payroll.newPeriod}
              </button>
            ) : null
          }
        />

        {periods.length === 0 ? (
          <div className="rounded-2xl bg-secondary p-8 text-center">
            <p className="text-sm font-semibold text-foreground">{t.payroll.noPeriods}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t.payroll.noPeriodsHint}</p>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {periods.map((period) => (
              <button
                key={period.id}
                type="button"
                onClick={() => router.push(`/payroll?period=${period.id}`)}
                className={cn(
                  "rounded-2xl p-4 text-left transition-all duration-300",
                  selected?.id === period.id
                    ? "bg-primary-soft ring-2 ring-primary/40"
                    : "bg-secondary hover:bg-primary-soft",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-foreground">
                      <Latin>{period.label}</Latin>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <Latin>
                        {period.siteName} · {formatDate(period.period_start)} –{" "}
                        {formatDate(period.period_end)}
                      </Latin>
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide",
                      STATUS_TONE[period.status] ?? STATUS_TONE["draft"],
                    )}
                  >
                    {statusLabel(t, period.status)}
                  </span>
                </div>
                {period.headcount > 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    <Fill
                      template={t.payroll.paidSummary}
                      values={{
                        count: period.headcount,
                        amount: formatPKR(period.total_net),
                      }}
                    />
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">{t.payroll.notCalculated}</p>
                )}
              </button>
            ))}
          </div>
        )}
      </Card>

      {selected ? (
        <>
          <Card className="p-4 sm:p-6">
            <SectionTitle
              icon={Play}
              title={<Latin>{selected.label}</Latin>}
              subtitle={
                <Latin>{`${selected.siteName} · ${formatDate(selected.period_start)} – ${formatDate(selected.period_end)}`}</Latin>
              }
            />

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Total label={t.payroll.grossPay} value={selected.total_gross} />
              <Total label={t.payroll.deductions} value={selected.total_deductions} tone="danger" />
              <Total label={t.payroll.tax} value={selected.total_tax} tone="danger" />
              <Total label={t.payroll.netPayable} value={selected.total_net} tone="primary" />
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              {can.run && !selected.locked ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => act(() => runPeriod(selected.id), t.payroll.calculating)}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-[0_10px_24px_rgb(239_86_25/0.25)] transition-all hover:-translate-y-0.5 disabled:opacity-50"
                >
                  <Play className="size-4" />
                  {selected.headcount > 0 ? t.payroll.recalculate : t.payroll.runPayroll}
                </button>
              ) : null}

              {can.approve && selected.status === "review" ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => act(() => approvePeriod(selected.id), t.payroll.approving)}
                  className="inline-flex items-center gap-2 rounded-xl bg-charcoal px-4 py-2.5 text-sm font-bold text-charcoal-foreground transition-all hover:-translate-y-0.5 disabled:opacity-50"
                >
                  <BadgeCheck className="size-4" />
                  {t.payroll.approve}
                </button>
              ) : null}

              {can.pay && selected.status === "approved" ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => act(() => markPeriodPaid(selected.id), t.payroll.closingPeriod)}
                  className="inline-flex items-center gap-2 rounded-xl bg-success px-4 py-2.5 text-sm font-bold text-white transition-all hover:-translate-y-0.5 disabled:opacity-50"
                >
                  <Banknote className="size-4" />
                  {t.payroll.markPaidAndLock}
                </button>
              ) : null}

              {selected.locked ? (
                <p className="self-center text-xs font-semibold text-muted-foreground">
                  {t.payroll.locked}
                </p>
              ) : null}
            </div>
          </Card>

          <Card className="p-4 sm:p-6">
            <SectionTitle
              icon={FileText}
              title={<Fill template={t.payroll.lines} values={{ count: items.length }} />}
              subtitle={t.payroll.linesHint}
            />

            {(() => {
              const needsReview = items.filter((item) => item.flaggedHours > 0 || item.reviewNote);
              if (needsReview.length === 0) return null;
              return (
                <div className="mb-4 flex items-start gap-3 rounded-2xl bg-warning-soft px-4 py-3">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                  {/* One sentence with the count inside it, rather than a
                      bold fragment glued to a tail — Urdu puts the count in a
                      different place, and a sentence split in JSX cannot move
                      it. */}
                  <p className="text-sm text-foreground">
                    <Fill
                      template={t.payroll.reviewBanner}
                      values={{ count: needsReview.length }}
                    />
                  </p>
                </div>
              );
            })()}

            {items.length > 0 && (selected.status === "approved" || selected.status === "paid") ? (
              <CashPaymentTally items={items} />
            ) : null}

            {items.length === 0 ? (
              <div className="rounded-2xl bg-secondary p-8 text-center">
                <p className="text-sm font-semibold text-foreground">
                  {t.payroll.nothingCalculated}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t.payroll.nothingCalculatedHint}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-separate border-spacing-y-2 text-sm">
                  <thead>
                    <tr className="text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 pb-2">{t.common.person}</th>
                      <th className="px-4 pb-2">{t.common.department}</th>
                      <th className="px-4 pb-2 text-right">{t.payroll.colRegularHours}</th>
                      <th className="px-4 pb-2 text-right">{t.payroll.colOvertimeHours}</th>
                      <th className="px-4 pb-2 text-right">{t.payroll.colGross}</th>
                      <th className="px-4 pb-2 text-right">{t.payroll.deductions}</th>
                      <th className="px-4 pb-2 text-right">{t.payroll.tax}</th>
                      <th className="px-4 pb-2 text-right">{t.payroll.colNet}</th>
                      <th className="px-4 pb-2">{t.payroll.colPaid}</th>
                      <th className="px-4 pb-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="bg-secondary/70">
                        <td className="rounded-l-2xl px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={item.full_name} />
                            <div>
                              <p className="flex items-center gap-1.5 font-semibold text-foreground">
                                <Latin>{item.full_name}</Latin>
                                {item.reviewNote ? (
                                  <span title={item.reviewNote}>
                                    <AlertTriangle className="size-3.5 shrink-0 text-warning" />
                                  </span>
                                ) : null}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                <Latin>{item.employee_code}</Latin> ·{" "}
                                {t.status.payClass[item.pay_class as "monthly" | "hourly"] ??
                                  item.pay_class}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          <Latin>{item.department}</Latin>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          <Latin>{item.regular_hours}</Latin>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-warning">
                          <span className="inline-flex items-center gap-1.5">
                            <Latin>{item.ot_hours}</Latin>
                            {item.flaggedHours > 0 ? (
                              <span
                                title={fill(t.payroll.droppedTooltip, {
                                  hours: formatHours(item.flaggedHours),
                                  dates: item.flaggedDays.map((d) => d.workDate).join(", "),
                                })}
                              >
                                <AlertTriangle className="size-3.5 text-danger" />
                              </span>
                            ) : null}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          <Latin>{formatPKR(item.gross)}</Latin>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-danger">
                          <Latin>{item.deductions ? `- ${formatPKR(item.deductions)}` : "—"}</Latin>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-danger">
                          <Latin>{item.tax ? `- ${formatPKR(item.tax)}` : "—"}</Latin>
                        </td>
                        <td className="px-4 py-3 text-right font-bold tabular-nums text-foreground">
                          <Latin>{formatPKR(item.net)}</Latin>
                        </td>
                        <td className="px-4 py-3">
                          <PaidCell
                            item={item}
                            canPay={
                              can.pay &&
                              (selected.status === "approved" || selected.status === "paid")
                            }
                            pending={pending}
                            act={act}
                          />
                        </td>
                        <td className="rounded-r-2xl px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setSlip(item)}
                            className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground transition-all hover:-translate-y-0.5"
                          >
                            <FileText className="size-4" />
                            {t.payroll.payslip}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      ) : null}

      {showNew ? <NewPeriodDialog sites={sites} onClose={() => setShowNew(false)} /> : null}
      {slip ? <PayslipSheet item={slip} onClose={() => setSlip(null)} /> : null}
    </div>
  );
}

/**
 * A `payroll_status` member as a word rather than as the enum spells it. The
 * fallback is the member itself — a status added to the enum and not yet to
 * the dictionary should show as something, not as a blank badge.
 */
function statusLabel(t: Dictionary, status: string): string {
  return t.status.payroll[status as keyof Dictionary["status"]["payroll"]] ?? status;
}

/**
 * The plain-string sibling of `<Fill>`, for the two places a sentence has to
 * be a string: a `title` attribute and a toast message.
 */
function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => String(values[key] ?? ""));
}

function Total({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "danger" | "primary";
}) {
  return (
    <div className="rounded-2xl bg-secondary px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-lg font-bold tabular-nums",
          tone === "danger" && "text-danger",
          tone === "primary" && "text-primary",
          !tone && "text-foreground",
        )}
      >
        <Latin>{formatPKR(value)}</Latin>
      </p>
    </div>
  );
}

/**
 * A running tally of who has actually been handed their cash.
 *
 * Separate from the period totals above, which are what is owed — this is
 * what has actually left the office, which on a cash payroll can lag the
 * approved amount by days while the cashier works through the floor.
 */
function CashPaymentTally({ items }: { items: ItemRow[] }) {
  const t = useDictionary();
  const paid = items.filter((item) => item.paidAt !== null);
  const paidAmount = paid.reduce((total, item) => total + item.net, 0);
  const totalAmount = items.reduce((total, item) => total + item.net, 0);
  const allPaid = paid.length === items.length;

  return (
    <div
      className={cn(
        "mb-4 flex items-center gap-3 rounded-2xl px-4 py-3",
        allPaid ? "bg-success-soft" : "bg-secondary",
      )}
    >
      {allPaid ? (
        <Check className="size-4 shrink-0 text-success" />
      ) : (
        <Banknote className="size-4 shrink-0 text-muted-foreground" />
      )}
      <p className="text-sm text-foreground">
        <Fill
          template={t.payroll.cashTally}
          values={{
            paid: paid.length,
            total: items.length,
            paidAmount: formatPKR(paidAmount),
            totalAmount: formatPKR(totalAmount),
          }}
        />
        {!allPaid ? (
          <span className="text-muted-foreground">
            {" — "}
            <Fill template={t.payroll.cashLeft} values={{ count: items.length - paid.length }} />
          </span>
        ) : null}
      </p>
    </div>
  );
}

/** One row's cash-handoff mark: a plain status once paid, an action while not. */
function PaidCell({
  item,
  canPay,
  pending,
  act,
}: {
  item: ItemRow;
  canPay: boolean;
  pending: boolean;
  act: (fn: () => Promise<PayrollResultMessage>, loading: string) => void;
}) {
  const t = useDictionary();

  if (item.paidAt) {
    return (
      <div className="flex items-center gap-2">
        <span
          title={formatDateTime(item.paidAt)}
          className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-[11px] font-bold text-success"
        >
          <Check className="size-3" />
          <Latin>{formatDate(item.paidAt)}</Latin>
        </span>
        {canPay ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => act(() => markItemUnpaid(item.id), t.payroll.undoing)}
            className="text-[11px] font-semibold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
          >
            {t.payroll.undo}
          </button>
        ) : null}
      </div>
    );
  }

  if (!canPay) {
    return <span className="text-xs text-muted-foreground">{t.payroll.notYet}</span>;
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        act(() => markItemPaid(item.id), fill(t.payroll.markingPaid, { name: item.full_name }))
      }
      className="inline-flex items-center gap-1.5 rounded-xl bg-success px-3 py-1.5 text-xs font-bold text-white transition-all hover:-translate-y-0.5 disabled:opacity-50"
    >
      <Banknote className="size-3.5" />
      {t.payroll.markPaid}
    </button>
  );
}

function NewPeriodDialog({
  sites,
  onClose,
}: {
  sites: { id: string; name: string }[];
  onClose: () => void;
}) {
  const t = useDictionary();
  const [state, formAction] = useActionState(createPeriod, INITIAL);
  const router = useRouter();

  useEffect(() => {
    if (!state.message) return;
    if (state.ok) {
      toast.success(state.message);
      onClose();
      router.refresh();
    } else {
      toast.error(state.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, router]);

  const input =
    "mt-1 w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-charcoal/40 p-3 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-lg rounded-3xl bg-card p-6 shadow-[0_18px_40px_rgb(0_0_0/0.18)]">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-bold tracking-tight text-foreground">
            {t.payroll.newPeriodTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="flex size-10 items-center justify-center rounded-xl bg-secondary text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <form action={formAction} className="mt-5 space-y-4">
          <div>
            <label className="text-sm font-semibold text-foreground">{t.common.site}</label>
            <select name="site_id" required defaultValue={sites[0]?.id ?? ""} className={input}>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-foreground">{t.payroll.periodLabel}</label>
            <input name="label" placeholder={t.payroll.periodLabelPlaceholder} className={input} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-semibold text-foreground">{t.payroll.from}</label>
              <input name="period_start" type="date" required dir="ltr" className={input} />
            </div>
            <div>
              <label className="text-sm font-semibold text-foreground">{t.payroll.to}</label>
              <input name="period_end" type="date" required dir="ltr" className={input} />
            </div>
          </div>
          <CreateButton />
        </form>
      </div>
    </div>
  );
}

function CreateButton() {
  const t = useDictionary();
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 text-sm font-bold text-primary-foreground transition-all hover:-translate-y-0.5 disabled:opacity-60"
    >
      <Plus className="size-4" />
      {pending ? t.payroll.creating : t.payroll.createPeriod}
    </button>
  );
}

function PayslipSheet({ item, onClose }: { item: ItemRow; onClose: () => void }) {
  const t = useDictionary();
  const earnings = item.breakdown.filter((l) => l.kind === "base" || l.kind === "earning");
  const deductions = item.breakdown.filter((l) => l.kind === "deduction" || l.kind === "tax");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-charcoal/40 p-3 backdrop-blur-sm sm:items-center">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-card p-6 shadow-[0_18px_40px_rgb(0_0_0/0.18)]">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Avatar name={item.full_name} className="size-12" />
            <div>
              <p className="text-lg font-bold tracking-tight text-foreground">
                <Latin>{item.full_name}</Latin>
              </p>
              <p className="text-xs text-muted-foreground">
                <Latin>{`${item.employee_code} · ${item.department}`}</Latin> ·{" "}
                {t.status.payClass[item.pay_class as "monthly" | "hourly"] ?? item.pay_class}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.payroll.closePayslip}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Mini label={t.payroll.regular} value={formatHours(item.regular_hours)} />
          <Mini label={t.payroll.overtime} value={formatHours(item.ot_hours)} />
          <Mini label={t.payroll.weekend} value={formatHours(item.weekend_hours)} />
        </div>

        {item.reviewNote ? (
          <div className="mt-4 flex items-start gap-3 rounded-2xl bg-warning-soft px-4 py-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <div className="text-sm text-foreground">
              <p className="font-bold">{t.payroll.worthLook}</p>
              {/* Written by the review pass, in English. Passed through rather
                  than translated: an invented Urdu sentence around it would
                  hide what was actually flagged. */}
              <p className="mt-0.5 text-muted-foreground">
                <Latin>{item.reviewNote}</Latin>
              </p>
            </div>
          </div>
        ) : item.flaggedHours > 0 ? (
          <div className="mt-4 flex items-start gap-3 rounded-2xl bg-warning-soft px-4 py-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <div className="text-sm text-foreground">
              <p className="font-bold">
                <Fill
                  template={t.payroll.droppedTitle}
                  values={{ hours: formatHours(item.flaggedHours) }}
                />
              </p>
              <p className="mt-0.5 text-muted-foreground">
                <Fill
                  template={t.payroll.droppedBody}
                  values={{
                    dates: item.flaggedDays
                      .map((d) => `${d.workDate} (${formatHours(d.hours)})`)
                      .join(", "),
                  }}
                />
              </p>
            </div>
          </div>
        ) : null}

        <Section title={t.payroll.earnings} lines={earnings} />
        <Section title={t.payroll.deductions} lines={deductions} negative />

        <div className="mt-4 rounded-2xl bg-primary-soft p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-primary">
            {t.payroll.netPay}
          </p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-foreground">
            <Latin>{formatPKR(item.net)}</Latin>
          </p>
        </div>

        <button
          type="button"
          onClick={() => typeof window !== "undefined" && window.print()}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-secondary px-4 py-3 text-sm font-semibold text-foreground transition-all hover:bg-muted"
        >
          {t.payroll.printPayslip}
        </button>
      </div>
    </div>
  );
}

function Section({
  title,
  lines,
  negative,
}: {
  title: string;
  lines: ItemRow["breakdown"];
  negative?: boolean;
}) {
  if (lines.length === 0) return null;
  return (
    <div className="mt-5">
      <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
        {title}
      </p>
      <div className="space-y-2">
        {lines.map((line, index) => (
          <div
            key={`${line.code}-${index}`}
            className="flex items-center justify-between gap-3 rounded-2xl bg-secondary px-4 py-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                <Latin>{line.label}</Latin>
              </p>
              {line.hours != null && line.rate != null ? (
                <p className="text-xs text-muted-foreground">
                  <Latin>{`${line.hours} h × ${formatPKR(line.rate)}`}</Latin>
                </p>
              ) : null}
            </div>
            <span
              className={cn(
                "shrink-0 text-sm font-bold tabular-nums",
                negative ? "text-danger" : "text-foreground",
              )}
            >
              <Latin>{`${negative ? "- " : ""}${formatPKR(line.amount)}`}</Latin>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-secondary px-2 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-foreground">
        <Latin>{value}</Latin>
      </p>
    </div>
  );
}
