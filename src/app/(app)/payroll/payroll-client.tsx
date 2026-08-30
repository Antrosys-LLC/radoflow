"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { AlertTriangle, BadgeCheck, Banknote, Check, FileText, Play, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Avatar, Card, SectionTitle } from "@/components/ui-kit";
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
          title="Pay periods"
          subtitle="Calculated from the attendance the terminals recorded"
          action={
            can.run ? (
              <button
                type="button"
                onClick={() => setShowNew(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-[0_10px_24px_rgb(239_86_25/0.25)] transition-all hover:-translate-y-0.5"
              >
                <Plus className="size-4" />
                New period
              </button>
            ) : null
          }
        />

        {periods.length === 0 ? (
          <div className="rounded-2xl bg-secondary p-8 text-center">
            <p className="text-sm font-semibold text-foreground">No pay periods yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create one covering the dates you want to pay for.
            </p>
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
                    <p className="text-sm font-bold text-foreground">{period.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {period.siteName} · {formatDate(period.period_start)} –{" "}
                      {formatDate(period.period_end)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide",
                      STATUS_TONE[period.status] ?? STATUS_TONE["draft"],
                    )}
                  >
                    {period.status}
                  </span>
                </div>
                {period.headcount > 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {period.headcount} paid · net{" "}
                    <span className="font-bold text-foreground">{formatPKR(period.total_net)}</span>
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">Not calculated yet</p>
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
              title={selected.label}
              subtitle={`${selected.siteName} · ${formatDate(selected.period_start)} to ${formatDate(selected.period_end)}`}
            />

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Total label="Gross pay" value={selected.total_gross} />
              <Total label="Deductions" value={selected.total_deductions} tone="danger" />
              <Total label="Tax" value={selected.total_tax} tone="danger" />
              <Total label="Net payable" value={selected.total_net} tone="primary" />
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              {can.run && !selected.locked ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => act(() => runPeriod(selected.id), "Calculating from attendance…")}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-[0_10px_24px_rgb(239_86_25/0.25)] transition-all hover:-translate-y-0.5 disabled:opacity-50"
                >
                  <Play className="size-4" />
                  {selected.headcount > 0 ? "Recalculate" : "Run payroll"}
                </button>
              ) : null}

              {can.approve && selected.status === "review" ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => act(() => approvePeriod(selected.id), "Approving…")}
                  className="inline-flex items-center gap-2 rounded-xl bg-charcoal px-4 py-2.5 text-sm font-bold text-charcoal-foreground transition-all hover:-translate-y-0.5 disabled:opacity-50"
                >
                  <BadgeCheck className="size-4" />
                  Approve
                </button>
              ) : null}

              {can.pay && selected.status === "approved" ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => act(() => markPeriodPaid(selected.id), "Closing period…")}
                  className="inline-flex items-center gap-2 rounded-xl bg-success px-4 py-2.5 text-sm font-bold text-white transition-all hover:-translate-y-0.5 disabled:opacity-50"
                >
                  <Banknote className="size-4" />
                  Mark paid &amp; lock
                </button>
              ) : null}

              {selected.locked ? (
                <p className="self-center text-xs font-semibold text-muted-foreground">
                  Locked — paid periods cannot be recalculated.
                </p>
              ) : null}
            </div>
          </Card>

          <Card className="p-4 sm:p-6">
            <SectionTitle
              icon={FileText}
              title={`Payroll lines · ${items.length}`}
              subtitle="Hours come from the biometric terminals; tap a row for the full payslip"
            />

            {(() => {
              const needsReview = items.filter((item) => item.flaggedHours > 0 || item.reviewNote);
              if (needsReview.length === 0) return null;
              return (
                <div className="mb-4 flex items-start gap-3 rounded-2xl bg-warning-soft px-4 py-3">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                  <p className="text-sm text-foreground">
                    <span className="font-bold">
                      {needsReview.length} employee{needsReview.length === 1 ? "" : "s"}
                    </span>{" "}
                    worth a look before you approve — dropped hours, an attendance anomaly, or a pay
                    swing against their recent history. Nothing is calculated wrong; check each
                    person&apos;s note on their payslip.
                  </p>
                </div>
              );
            })()}

            {items.length > 0 && (selected.status === "approved" || selected.status === "paid") ? (
              <CashPaymentTally items={items} />
            ) : null}

            {items.length === 0 ? (
              <div className="rounded-2xl bg-secondary p-8 text-center">
                <p className="text-sm font-semibold text-foreground">Nothing calculated yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Run the payroll to build the lines from attendance.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-separate border-spacing-y-2 text-sm">
                  <thead>
                    <tr className="text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 pb-2">Employee</th>
                      <th className="px-4 pb-2">Dept</th>
                      <th className="px-4 pb-2 text-right">Reg h</th>
                      <th className="px-4 pb-2 text-right">OT h</th>
                      <th className="px-4 pb-2 text-right">Gross</th>
                      <th className="px-4 pb-2 text-right">Deductions</th>
                      <th className="px-4 pb-2 text-right">Tax</th>
                      <th className="px-4 pb-2 text-right">Net</th>
                      <th className="px-4 pb-2">Paid</th>
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
                                {item.full_name}
                                {item.reviewNote ? (
                                  <span title={item.reviewNote}>
                                    <AlertTriangle className="size-3.5 shrink-0 text-warning" />
                                  </span>
                                ) : null}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {item.employee_code} · {item.pay_class}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{item.department}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{item.regular_hours}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-warning">
                          <span className="inline-flex items-center gap-1.5">
                            {item.ot_hours}
                            {item.flaggedHours > 0 ? (
                              <span
                                title={`${item.flaggedHours}h dropped by the overtime ceiling on ${item.flaggedDays.map((d) => d.workDate).join(", ")} — check before approving`}
                              >
                                <AlertTriangle className="size-3.5 text-danger" />
                              </span>
                            ) : null}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatPKR(item.gross)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-danger">
                          {item.deductions ? `- ${formatPKR(item.deductions)}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-danger">
                          {item.tax ? `- ${formatPKR(item.tax)}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-bold tabular-nums text-foreground">
                          {formatPKR(item.net)}
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
                            Payslip
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
        {formatPKR(value)}
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
        <span className="font-bold">
          {paid.length} of {items.length}
        </span>{" "}
        paid in cash · {formatPKR(paidAmount)} of {formatPKR(totalAmount)} disbursed
        {!allPaid ? (
          <span className="text-muted-foreground"> — {items.length - paid.length} left</span>
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
  if (item.paidAt) {
    return (
      <div className="flex items-center gap-2">
        <span
          title={formatDateTime(item.paidAt)}
          className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-[11px] font-bold text-success"
        >
          <Check className="size-3" />
          {formatDate(item.paidAt)}
        </span>
        {canPay ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => act(() => markItemUnpaid(item.id), "Undoing…")}
            className="text-[11px] font-semibold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
          >
            Undo
          </button>
        ) : null}
      </div>
    );
  }

  if (!canPay) {
    return <span className="text-xs text-muted-foreground">Not yet</span>;
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => act(() => markItemPaid(item.id), `Marking ${item.full_name} paid…`)}
      className="inline-flex items-center gap-1.5 rounded-xl bg-success px-3 py-1.5 text-xs font-bold text-white transition-all hover:-translate-y-0.5 disabled:opacity-50"
    >
      <Banknote className="size-3.5" />
      Mark paid
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
          <h2 className="text-lg font-bold tracking-tight text-foreground">New pay period</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-10 items-center justify-center rounded-xl bg-secondary text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <form action={formAction} className="mt-5 space-y-4">
          <div>
            <label className="text-sm font-semibold text-foreground">Factory</label>
            <select name="site_id" required defaultValue={sites[0]?.id ?? ""} className={input}>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-foreground">Label</label>
            <input name="label" placeholder="August 2026" className={input} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-semibold text-foreground">From</label>
              <input name="period_start" type="date" required className={input} />
            </div>
            <div>
              <label className="text-sm font-semibold text-foreground">To</label>
              <input name="period_end" type="date" required className={input} />
            </div>
          </div>
          <CreateButton />
        </form>
      </div>
    </div>
  );
}

function CreateButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 text-sm font-bold text-primary-foreground transition-all hover:-translate-y-0.5 disabled:opacity-60"
    >
      <Plus className="size-4" />
      {pending ? "Creating…" : "Create period"}
    </button>
  );
}

function PayslipSheet({ item, onClose }: { item: ItemRow; onClose: () => void }) {
  const earnings = item.breakdown.filter((l) => l.kind === "base" || l.kind === "earning");
  const deductions = item.breakdown.filter((l) => l.kind === "deduction" || l.kind === "tax");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-charcoal/40 p-3 backdrop-blur-sm sm:items-center">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-card p-6 shadow-[0_18px_40px_rgb(0_0_0/0.18)]">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Avatar name={item.full_name} className="size-12" />
            <div>
              <p className="text-lg font-bold tracking-tight text-foreground">{item.full_name}</p>
              <p className="text-xs text-muted-foreground">
                {item.employee_code} · {item.department} · {item.pay_class}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close payslip"
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Mini label="Regular" value={formatHours(item.regular_hours)} />
          <Mini label="Overtime" value={formatHours(item.ot_hours)} />
          <Mini label="Weekend" value={formatHours(item.weekend_hours)} />
        </div>

        {item.reviewNote ? (
          <div className="mt-4 flex items-start gap-3 rounded-2xl bg-warning-soft px-4 py-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <div className="text-sm text-foreground">
              <p className="font-bold">Worth a look before approving</p>
              <p className="mt-0.5 text-muted-foreground">{item.reviewNote}</p>
            </div>
          </div>
        ) : item.flaggedHours > 0 ? (
          <div className="mt-4 flex items-start gap-3 rounded-2xl bg-warning-soft px-4 py-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <div className="text-sm text-foreground">
              <p className="font-bold">
                {formatHours(item.flaggedHours)} dropped by the overtime ceiling
              </p>
              <p className="mt-0.5 text-muted-foreground">
                Likely a double-duty day, not a wrong number — check the punches for{" "}
                {item.flaggedDays.map((d) => `${d.workDate} (${formatHours(d.hours)})`).join(", ")}{" "}
                before approving.
              </p>
            </div>
          </div>
        ) : null}

        <Section title="Earnings" lines={earnings} />
        <Section title="Deductions" lines={deductions} negative />

        <div className="mt-4 rounded-2xl bg-primary-soft p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-primary">Net pay</p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-foreground">
            {formatPKR(item.net)}
          </p>
        </div>

        <button
          type="button"
          onClick={() => typeof window !== "undefined" && window.print()}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-secondary px-4 py-3 text-sm font-semibold text-foreground transition-all hover:bg-muted"
        >
          Print payslip
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
              <p className="truncate text-sm font-medium text-foreground">{line.label}</p>
              {line.hours != null && line.rate != null ? (
                <p className="text-xs text-muted-foreground">
                  {line.hours} h × {formatPKR(line.rate)}
                </p>
              ) : null}
            </div>
            <span
              className={cn(
                "shrink-0 text-sm font-bold tabular-nums",
                negative ? "text-danger" : "text-foreground",
              )}
            >
              {negative ? "- " : ""}
              {formatPKR(line.amount)}
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
      <p className="mt-0.5 text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}
