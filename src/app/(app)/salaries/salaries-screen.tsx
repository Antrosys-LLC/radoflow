"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  Check,
  HandCoins,
  Landmark,
  Plus,
  ReceiptText,
  Trash2,
  Undo2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { Fill } from "@/components/fill";
import { useDictionary } from "@/components/language-provider";
import { Latin } from "@/components/latin";
import { Card, SectionTitle } from "@/components/ui-kit";
import { planLoan } from "@/lib/payroll/ledger";
import { formatDate, formatPKR } from "@/lib/time";
import { cn } from "@/lib/utils";

import {
  addAdjustment,
  addLoan,
  cancelLoan,
  deleteAdjustment,
  markSalaryPaid,
  recordRepayment,
  unmarkSalaryPaid,
  type SalaryResult,
} from "./actions";

export interface PersonOption {
  id: string;
  name: string;
  code: string;
  department: string;
}

export interface PaymentView {
  id: string;
  person: PersonOption | null;
  net: number;
  paidAmount: number | null;
  paidDifference: number | null;
  paidNote: string | null;
  paidAt: string | null;
}

export interface AdjustmentView {
  id: string;
  person: PersonOption | null;
  kind: "advance" | "advance_2" | "suit" | "allowance" | "deduction";
  amount: number;
  label: string | null;
  note: string | null;
  givenOn: string | null;
}

export interface LoanView {
  id: string;
  person: PersonOption | null;
  principal: number;
  installment: number;
  installments: number;
  paidCount: number;
  repaid: number;
  balance: number;
  firstMonth: string;
  takenOn: string;
  status: "active" | "settled" | "cancelled";
  note: string | null;
}

const INITIAL: SalaryResult = { ok: false, message: "" };
const KINDS = ["advance", "advance_2", "suit", "allowance", "deduction"] as const;

const INPUT =
  "mt-1 w-full rounded-2xl border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/30";

function monthName(month: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
}

function useToastResult(state: SalaryResult, onSuccess?: () => void) {
  const router = useRouter();
  useEffect(() => {
    if (!state.message) return;
    if (state.ok) {
      toast.success(state.message);
      onSuccess?.();
      router.refresh();
    } else {
      toast.error(state.message, { duration: 9000 });
    }
    // `state` is the only trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}

function Submit({ label, icon: Icon = Plus }: { label: string; icon?: typeof Plus }) {
  const t = useDictionary();
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-all hover:opacity-90 disabled:opacity-60"
    >
      <Icon className="size-4" aria-hidden />
      {pending ? t.common.saving : label}
    </button>
  );
}

/** A person, chosen by typing part of a name or unique ID. */
function PersonPicker({ people, name = "profile_id" }: { people: PersonOption[]; name?: string }) {
  const t = useDictionary();
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? people.filter(
          (person) =>
            person.name.toLowerCase().includes(q) || person.code.toLowerCase().includes(q),
        )
      : people;
    return list.slice(0, 200);
  }, [people, query]);

  return (
    <label className="block">
      <span className="text-xs font-bold text-muted-foreground">{t.salaries.person}</span>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t.salaries.search}
        className={INPUT}
      />
      <select name={name} required className={cn(INPUT, "mt-2")} defaultValue="">
        <option value="" disabled>
          {t.salaries.choosePerson}
        </option>
        {matches.map((person) => (
          <option key={person.id} value={person.id}>
            {`${person.name} · ${person.code}${person.department ? ` · ${person.department}` : ""}`}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SalariesScreen({
  month,
  previousMonth,
  nextMonth,
  period,
  payments,
  adjustments,
  loans,
  people,
  canManage,
  canPay,
}: {
  month: string;
  previousMonth: string;
  nextMonth: string;
  period: { id: string; label: string; payable: boolean } | null;
  payments: PaymentView[];
  adjustments: AdjustmentView[];
  loans: LoanView[];
  people: PersonOption[];
  canManage: boolean;
  canPay: boolean;
}) {
  const t = useDictionary();

  const netToPay = payments.reduce((total, row) => total + row.net, 0);
  const handedOver = payments.reduce((total, row) => total + (row.paidAmount ?? 0), 0);
  const paidNet = payments
    .filter((row) => row.paidAmount !== null)
    .reduce((total, row) => total + row.net, 0);
  const advances = adjustments
    .filter((row) => row.kind === "advance" || row.kind === "advance_2")
    .reduce((total, row) => total + row.amount, 0);
  const outstanding = loans
    .filter((loan) => loan.status === "active")
    .reduce((total, loan) => total + loan.balance, 0);

  return (
    <div className="space-y-5 pb-6">
      <Card className="p-4 sm:p-6">
        <SectionTitle
          icon={Wallet}
          title={t.salaries.title}
          subtitle={t.salaries.subtitle}
          action={
            <div className="flex items-center gap-2">
              <Link
                href={`/salaries?month=${previousMonth}`}
                aria-label={t.salaries.previousMonth}
                className="flex size-10 items-center justify-center rounded-xl bg-secondary text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="size-4" />
              </Link>
              <span className="min-w-[9rem] text-center text-sm font-bold text-foreground">
                <Latin>{monthName(month)}</Latin>
              </span>
              <Link
                href={`/salaries?month=${nextMonth}`}
                aria-label={t.salaries.nextMonth}
                className="flex size-10 items-center justify-center rounded-xl bg-secondary text-muted-foreground hover:text-foreground"
              >
                <ArrowRight className="size-4" />
              </Link>
            </div>
          }
        />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Figure label={t.salaries.netToPay} value={formatPKR(netToPay)} />
          <Figure label={t.salaries.handedOver} value={formatPKR(handedOver)} />
          <Figure
            label={t.salaries.difference}
            value={formatPKR(handedOver - paidNet)}
            tone={Math.round(handedOver - paidNet) === 0 ? "neutral" : "warning"}
          />
          <Figure label={t.salaries.loansOutstanding} value={formatPKR(outstanding)} />
        </div>
      </Card>

      <Payments period={period} payments={payments} canPay={canPay} />

      <Ledger
        month={month}
        adjustments={adjustments}
        advances={advances}
        people={people}
        canManage={canManage}
      />

      <Loans month={month} loans={loans} people={people} canManage={canManage} />
    </div>
  );
}

function Figure({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "warning";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl px-4 py-3",
        tone === "warning" ? "bg-warning-soft" : "bg-secondary",
      )}
    >
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-xl font-bold tabular-nums",
          tone === "warning" ? "text-warning" : "text-foreground",
        )}
      >
        <Latin>{value}</Latin>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Salaries handed over
// ---------------------------------------------------------------------------

function Payments({
  period,
  payments,
  canPay,
}: {
  period: { id: string; label: string; payable: boolean } | null;
  payments: PaymentView[];
  canPay: boolean;
}) {
  const t = useDictionary();
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? payments.filter(
          (row) =>
            row.person?.name.toLowerCase().includes(q) ||
            row.person?.code.toLowerCase().includes(q),
        )
      : payments;
  }, [payments, query]);

  return (
    <Card className="p-4 sm:p-6">
      <SectionTitle icon={HandCoins} title={t.salaries.paidTitle} subtitle={t.salaries.paidHint} />

      {!period ? (
        <div className="rounded-2xl bg-secondary px-5 py-8 text-center">
          <p className="text-sm font-bold text-foreground">{t.salaries.noRun}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t.salaries.noRunHint}</p>
          <Link
            href="/payroll"
            className="mt-3 inline-flex rounded-2xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
          >
            {t.salaries.openPayroll}
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">
              <Latin>{period.label}</Latin>
            </p>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t.salaries.search}
              className="w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm sm:w-72"
            />
          </div>
          {!period.payable ? (
            <p className="mb-3 rounded-2xl bg-warning-soft px-4 py-3 text-xs font-semibold text-warning">
              {t.salaries.notApproved}
            </p>
          ) : null}
          <ul className="space-y-2">
            {visible.map((row) => (
              <PaymentRow key={row.id} row={row} canPay={canPay && period.payable} />
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function PaymentRow({ row, canPay }: { row: PaymentView; canPay: boolean }) {
  const t = useDictionary();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [given, setGiven] = useState(String(Math.round(row.paidAmount ?? row.net)));
  const [note, setNote] = useState(row.paidNote ?? "");

  const paid = row.paidAmount !== null;
  const difference = row.paidDifference ?? 0;
  const typedDifference = Math.round(Number(given || 0) - row.net);

  function run(action: () => Promise<SalaryResult>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(result.message);
      else toast.error(result.message, { duration: 9000 });
      router.refresh();
    });
  }

  return (
    <li className="grid gap-3 rounded-2xl bg-secondary p-3 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-foreground">
          <Latin>{row.person?.name ?? "—"}</Latin>
          <span className="ms-2 text-xs font-normal text-muted-foreground">
            <Latin>{[row.person?.code, row.person?.department].filter(Boolean).join(" · ")}</Latin>
          </span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t.salaries.salary}: <Latin>{formatPKR(row.net)}</Latin>
          {paid ? (
            <>
              {" · "}
              {t.salaries.given}: <Latin>{formatPKR(row.paidAmount ?? 0)}</Latin>
              {" · "}
              <span className={cn("font-bold", difference === 0 ? "text-success" : "text-warning")}>
                {difference === 0 ? (
                  t.salaries.exact
                ) : (
                  <Fill
                    template={difference < 0 ? t.salaries.short : t.salaries.over}
                    values={{ amount: formatPKR(Math.abs(difference)) }}
                  />
                )}
              </span>
              {row.paidAt ? (
                <>
                  {" · "}
                  <Latin>{formatDate(row.paidAt)}</Latin>
                </>
              ) : null}
              {row.paidNote ? (
                <>
                  {" · "}
                  <Latin>{row.paidNote}</Latin>
                </>
              ) : null}
            </>
          ) : null}
        </p>
      </div>

      {canPay ? (
        paid ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => unmarkSalaryPaid(row.id))}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-card px-3 py-2 text-xs font-bold text-muted-foreground ring-1 ring-border hover:text-foreground disabled:opacity-50"
          >
            <Undo2 className="size-3.5" aria-hidden />
            {t.salaries.undoPaid}
          </button>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="text-[10px] font-bold text-muted-foreground">
                {t.salaries.given}
              </span>
              <input
                type="number"
                min={0}
                value={given}
                onChange={(event) => setGiven(event.target.value)}
                dir="ltr"
                className="block w-28 rounded-xl border border-input bg-card px-2 py-2 font-latin text-sm"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-bold text-muted-foreground">{t.salaries.note}</span>
              <input
                type="text"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="block w-36 rounded-xl border border-input bg-card px-2 py-2 text-sm"
              />
            </label>
            <button
              type="button"
              disabled={pending || given === ""}
              onClick={() => run(() => markSalaryPaid(row.id, Number(given), note))}
              className="inline-flex items-center gap-1.5 rounded-xl bg-success px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
            >
              <Check className="size-3.5" aria-hidden />
              {t.salaries.markPaid}
            </button>
            {typedDifference !== 0 ? (
              <span className="w-full text-end text-[10px] font-bold text-warning">
                <Fill
                  template={typedDifference < 0 ? t.salaries.short : t.salaries.over}
                  values={{ amount: formatPKR(Math.abs(typedDifference)) }}
                />
              </span>
            ) : null}
          </div>
        )
      ) : null}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Advances, suits and allowances
// ---------------------------------------------------------------------------

function Ledger({
  month,
  adjustments,
  advances,
  people,
  canManage,
}: {
  month: string;
  adjustments: AdjustmentView[];
  advances: number;
  people: PersonOption[];
  canManage: boolean;
}) {
  const t = useDictionary();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formKey, setFormKey] = useState(0);
  const [state, action] = useActionState(addAdjustment, INITIAL);
  useToastResult(state, () => setFormKey((key) => key + 1));

  return (
    <Card className="p-4 sm:p-6">
      <SectionTitle
        icon={ReceiptText}
        title={t.salaries.ledgerTitle}
        subtitle={
          <>
            {t.salaries.ledgerHint} · {t.salaries.advancesThisMonth}:{" "}
            <Latin>{formatPKR(advances)}</Latin>
          </>
        }
      />

      {canManage ? (
        <form
          key={formKey}
          action={action}
          className="mb-4 grid gap-3 rounded-2xl bg-secondary p-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <input type="hidden" name="month" value={month} />
          <PersonPicker people={people} />
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-bold text-muted-foreground">{t.salaries.kind}</span>
              <select name="kind" required className={INPUT} defaultValue="advance">
                {KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {t.salaries.kinds[kind]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-bold text-muted-foreground">{t.salaries.amount}</span>
              <input
                type="number"
                name="amount"
                min={1}
                step="1"
                required
                dir="ltr"
                className={cn(INPUT, "font-latin")}
              />
            </label>
          </div>
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-bold text-muted-foreground">{t.salaries.label}</span>
              <input type="text" name="label" className={INPUT} />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-muted-foreground">{t.salaries.givenOn}</span>
              <input type="date" name="given_on" dir="ltr" className={cn(INPUT, "font-latin")} />
            </label>
            <input type="hidden" name="note" value="" />
            <Submit label={t.salaries.add} />
          </div>
        </form>
      ) : null}

      {adjustments.length === 0 ? (
        <p className="rounded-2xl bg-secondary px-4 py-8 text-center text-sm text-muted-foreground">
          {t.salaries.noLedger}
        </p>
      ) : (
        <ul className="space-y-2">
          {adjustments.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl bg-secondary px-4 py-3"
            >
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-bold",
                  row.kind === "allowance"
                    ? "bg-success-soft text-success"
                    : "bg-danger-soft text-danger",
                )}
              >
                {t.salaries.kinds[row.kind]}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                <Latin>{row.person?.name ?? "—"}</Latin>
                <span className="ms-2 text-xs font-normal text-muted-foreground">
                  <Latin>
                    {[row.person?.code, row.label, row.givenOn ? formatDate(row.givenOn) : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </Latin>
                </span>
              </span>
              <span className="text-sm font-bold tabular-nums text-foreground">
                <Latin>{`${row.kind === "allowance" ? "+" : "−"} ${formatPKR(row.amount)}`}</Latin>
              </span>
              {canManage ? (
                <button
                  type="button"
                  disabled={pending}
                  aria-label={t.salaries.remove}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await deleteAdjustment(row.id);
                      if (result.ok) toast.success(result.message);
                      else toast.error(result.message);
                      router.refresh();
                    })
                  }
                  className="rounded-xl bg-danger-soft p-2 text-danger disabled:opacity-50"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Loans
// ---------------------------------------------------------------------------

function Loans({
  month,
  loans,
  people,
  canManage,
}: {
  month: string;
  loans: LoanView[];
  people: PersonOption[];
  canManage: boolean;
}) {
  const t = useDictionary();
  const [formKey, setFormKey] = useState(0);
  const [state, action] = useActionState(addLoan, INITIAL);
  useToastResult(state, () => setFormKey((key) => key + 1));

  const [principal, setPrincipal] = useState("");
  const [mode, setMode] = useState<"installment" | "months">("installment");
  const [planValue, setPlanValue] = useState("");
  const [firstMonth, setFirstMonth] = useState(month);

  const plan = planLoan(
    Number(principal),
    mode === "months" ? { months: Number(planValue) } : { installment: Number(planValue) },
  );
  const last = plan
    ? Math.round((Number(principal) - plan.installment * (plan.installments - 1)) * 100) / 100
    : 0;

  return (
    <Card className="p-4 sm:p-6">
      <SectionTitle icon={Landmark} title={t.salaries.loansTitle} subtitle={t.salaries.loansHint} />

      {canManage ? (
        <form
          key={formKey}
          action={action}
          className="mb-4 grid gap-3 rounded-2xl bg-secondary p-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <PersonPicker people={people} />
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-bold text-muted-foreground">
                {t.salaries.principal}
              </span>
              <input
                type="number"
                name="principal"
                min={1}
                required
                value={principal}
                onChange={(event) => setPrincipal(event.target.value)}
                dir="ltr"
                className={cn(INPUT, "font-latin")}
              />
            </label>
            <fieldset>
              <legend className="text-xs font-bold text-muted-foreground">
                {t.salaries.repayBy}
              </legend>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {(["installment", "months"] as const).map((option) => (
                  <label
                    key={option}
                    className={cn(
                      "cursor-pointer rounded-xl px-3 py-2 text-center text-xs font-bold",
                      mode === option
                        ? "bg-primary text-primary-foreground"
                        : "bg-card text-muted-foreground",
                    )}
                  >
                    <input
                      type="radio"
                      name="mode"
                      value={option}
                      checked={mode === option}
                      onChange={() => setMode(option)}
                      className="sr-only"
                    />
                    {option === "installment" ? t.salaries.byInstallment : t.salaries.byMonths}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="block">
              <span className="text-xs font-bold text-muted-foreground">
                {mode === "installment" ? t.salaries.installment : t.salaries.months}
              </span>
              <input
                type="number"
                name="plan_value"
                min={1}
                required
                value={planValue}
                onChange={(event) => setPlanValue(event.target.value)}
                dir="ltr"
                className={cn(INPUT, "font-latin")}
              />
            </label>
          </div>
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-bold text-muted-foreground">
                {t.salaries.firstMonth}
              </span>
              <input
                type="month"
                name="first_month"
                required
                value={firstMonth}
                onChange={(event) => setFirstMonth(event.target.value)}
                dir="ltr"
                className={cn(INPUT, "font-latin")}
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-muted-foreground">{t.salaries.takenOn}</span>
              <input type="date" name="taken_on" dir="ltr" className={cn(INPUT, "font-latin")} />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-muted-foreground">{t.salaries.note}</span>
              <input type="text" name="note" className={INPUT} />
            </label>
            {plan ? (
              <p className="rounded-xl bg-card px-3 py-2 text-xs font-semibold text-foreground">
                <Fill
                  template={t.salaries.plan}
                  values={{
                    count: plan.installments,
                    amount: formatPKR(plan.installment),
                    month: /^\d{4}-\d{2}$/.test(firstMonth) ? monthName(firstMonth) : "—",
                  }}
                />
                {last > 0 && last !== plan.installment ? (
                  <>
                    {" — "}
                    <Fill template={t.salaries.planLast} values={{ amount: formatPKR(last) }} />
                  </>
                ) : null}
              </p>
            ) : null}
            <Submit label={t.salaries.addLoan} icon={Banknote} />
          </div>
        </form>
      ) : null}

      {loans.length === 0 ? (
        <p className="rounded-2xl bg-secondary px-4 py-8 text-center text-sm text-muted-foreground">
          {t.salaries.noLoans}
        </p>
      ) : (
        <ul className="space-y-2">
          {loans.map((loan) => (
            <LoanRowView key={loan.id} loan={loan} canManage={canManage} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function LoanRowView({ loan, canManage }: { loan: LoanView; canManage: boolean }) {
  const t = useDictionary();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [repay, setRepay] = useState("");
  const fraction = loan.principal > 0 ? Math.min(1, loan.repaid / loan.principal) : 0;

  function run(action: () => Promise<SalaryResult>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(result.message);
        setRepay("");
      } else {
        toast.error(result.message, { duration: 9000 });
      }
      router.refresh();
    });
  }

  const statusLabel =
    loan.status === "active"
      ? t.salaries.active
      : loan.status === "settled"
        ? t.salaries.settled
        : t.salaries.cancelled;

  return (
    <li className="rounded-2xl bg-secondary p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">
            <Latin>{loan.person?.name ?? "—"}</Latin>
            <span className="ms-2 text-xs font-normal text-muted-foreground">
              <Latin>
                {[loan.person?.code, loan.person?.department].filter(Boolean).join(" · ")}
              </Latin>
            </span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <Latin>
              {`${formatPKR(loan.principal)} · ${formatDate(loan.takenOn)} · ${formatPKR(loan.installment)} × ${loan.installments}`}
            </Latin>
            {loan.note ? (
              <>
                {" · "}
                <Latin>{loan.note}</Latin>
              </>
            ) : null}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] font-bold",
            loan.status === "active"
              ? "bg-warning-soft text-warning"
              : loan.status === "settled"
                ? "bg-success-soft text-success"
                : "bg-card text-muted-foreground",
          )}
        >
          {statusLabel}
        </span>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-card">
        <div className="h-full rounded-full bg-primary" style={{ width: `${fraction * 100}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">
          {t.salaries.paidSoFar}: <Latin>{formatPKR(loan.repaid)}</Latin> ·{" "}
          <Fill
            template={t.salaries.progress}
            values={{ paid: loan.paidCount, count: loan.installments }}
          />
        </span>
        <span className="font-bold text-foreground">
          {t.salaries.balance}: <Latin>{formatPKR(loan.balance)}</Latin>
        </span>
      </div>

      {canManage && loan.status === "active" ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="text-[10px] font-bold text-muted-foreground">
              {t.salaries.repayAmount}
            </span>
            <input
              type="number"
              min={1}
              value={repay}
              onChange={(event) => setRepay(event.target.value)}
              dir="ltr"
              className="block w-32 rounded-xl border border-input bg-card px-2 py-2 font-latin text-sm"
            />
          </label>
          <button
            type="button"
            disabled={pending || !(Number(repay) > 0)}
            onClick={() => run(() => recordRepayment(loan.id, Number(repay)))}
            className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
          >
            {t.salaries.repay}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => cancelLoan(loan.id))}
            className="ms-auto rounded-xl bg-card px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-danger disabled:opacity-50"
          >
            {t.salaries.cancelLoan}
          </button>
        </div>
      ) : null}
    </li>
  );
}
