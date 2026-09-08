"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banknote, ChevronDown, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Fill } from "@/components/fill";
import { useDictionary } from "@/components/language-provider";
import { Latin } from "@/components/latin";
import { SwipeToConfirm } from "@/components/swipe-to-confirm";
import { Card } from "@/components/ui-kit";
import { addUserComponent, removeUserComponent, updateUserPay } from "@/lib/pay/actions";
import { trackingValueOf } from "@/lib/people/tracking";
import { cn } from "@/lib/utils";

/**
 * The plain-string sibling of `<Fill>`, for the places a sentence has to be a
 * string: an `aria-label`, and the label the swipe control takes.
 */
function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => String(values[key] ?? ""));
}

/**
 * Everyone's pay, department by department.
 *
 * The site rate rules below this set what an hour is worth in general. This is
 * where the individual decisions live — what someone earns, how many hours
 * their salary covers, whether Sunday is expected of them, and the deductions
 * that follow them each month.
 *
 * Grouped by department because that is how pay is reviewed: a supervisor
 * argues for their own section, not for one person in isolation, and seeing a
 * department's figures side by side is what makes an outlier obvious.
 */

const INPUT =
  "w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20";

const INITIAL = { ok: false, message: "" };

export interface PayPerson {
  id: string;
  fullName: string;
  employeeCode: string;
  cnic: string | null;
  departmentId: string | null;
  departmentName: string;
  workerType: "employee" | "contractor";
  payClass: "monthly" | "hourly";
  monthlySalary: number;
  hourlyRate: number;
  dutyHours: number;
  sundayPolicy: "off" | "optional" | "compulsory" | "adjust_in_leave";
  /** False pays no overtime at all, on any day. */
  overtimeEligible: boolean;
  requiresAttendance: boolean;
  flexibleHours: boolean;
  payrollExempt: boolean;
  components: {
    id: string;
    label: string;
    kind: string;
    amount: number;
  }[];
}

const money = (value: number) =>
  value.toLocaleString("en-PK", { maximumFractionDigits: 0, minimumFractionDigits: 0 });

const money2 = (value: number) =>
  value.toLocaleString("en-PK", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

/** Calendar days in the current month — the divisor behind every daily rate. */
function daysThisMonth(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

export function PeoplePay({ people }: { people: PayPerson[] }) {
  const t = useDictionary();
  const grouped = new Map<string, PayPerson[]>();
  for (const person of people) {
    const list = grouped.get(person.departmentName) ?? [];
    list.push(person);
    grouped.set(person.departmentName, list);
  }

  const departments = [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  if (people.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        {t.common.nobodyMatches}
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {departments.map(([name, members]) => (
        <DepartmentGroup key={name} name={name} members={members} />
      ))}
    </div>
  );
}

function DepartmentGroup({ name, members }: { name: string; members: PayPerson[] }) {
  const t = useDictionary();
  // Collapsed by default past a handful: thirty-four departments open at once
  // is a page nobody can read.
  const [open, setOpen] = useState(members.length <= 6);
  const days = daysThisMonth();

  const monthly = members
    .filter((m) => m.workerType !== "contractor")
    .reduce((total, m) => total + m.monthlySalary, 0);
  const contracted = members
    .filter((m) => m.workerType === "contractor")
    .reduce((total, m) => total + m.monthlySalary, 0);

  return (
    <Card className="overflow-hidden p-0">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-secondary/60"
      >
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            !open && "-rotate-90",
          )}
        />
        {/* A department name, as the office typed it. */}
        <span className="text-sm font-bold text-foreground">
          <Latin>{name}</Latin>
        </span>
        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">
          <Latin>{members.length}</Latin>
        </span>
        <span className="ms-auto text-end text-xs text-muted-foreground">
          {monthly > 0 ? (
            <span className="font-semibold text-foreground">
              <Latin>{`Rs ${money(monthly)}`}</Latin>
            </span>
          ) : null}
          {monthly > 0 && contracted > 0 ? " · " : null}
          {contracted > 0 ? (
            <span className="text-warning">
              <Fill
                template={t.rates.contractSuffix}
                values={{ amount: `Rs ${money(contracted)}` }}
              />
            </span>
          ) : null}
          <span className="ms-1 opacity-70">{t.rates.perMonth}</span>
        </span>
      </button>

      {open ? (
        <div className="divide-y divide-border border-t border-border">
          {members.map((person) => (
            <PersonPayRow key={person.id} person={person} days={days} />
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function PersonPayRow({ person, days }: { person: PayPerson; days: number }) {
  const t = useDictionary();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  const [workerType, setWorkerType] = useState(person.workerType);
  const [salary, setSalary] = useState(String(person.monthlySalary));
  const [dutyHours, setDutyHours] = useState(String(person.dutyHours));

  const isContractor = workerType === "contractor";
  const monthly = Number(salary) || 0;
  const perDay = monthly / days;
  const perOtHour = perDay / 8;

  const trackingValue = trackingValueOf({
    requires_attendance: person.requiresAttendance,
    payroll_exempt: person.payrollExempt,
  });

  const deductions = person.components
    .filter((c) => c.kind !== "earning")
    .reduce((total, c) => total + c.amount, 0);
  const allowances = person.components
    .filter((c) => c.kind === "earning")
    .reduce((total, c) => total + c.amount, 0);

  function save() {
    const element = form.current;
    if (!element) return;
    const data = new FormData(element);

    startTransition(async () => {
      const result = await updateUserPay(INITIAL, data);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      router.refresh();
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-secondary/40"
      >
        <div className="min-w-[10rem] flex-1">
          {/* A name, an employee code and a CNIC. All three are Latin in
              every language: a CNIC reordered is a different CNIC. */}
          <p className="truncate text-sm font-semibold text-foreground">
            <Latin>{person.fullName}</Latin>
          </p>
          <p className="truncate text-xs text-muted-foreground">
            <Latin>{person.employeeCode}</Latin>
            {person.cnic ? (
              <span className="ms-2 font-mono">
                <Latin>{person.cnic}</Latin>
              </span>
            ) : null}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {isContractor ? (
            <Tag tone="warning">{t.rates.tagContract}</Tag>
          ) : (
            <>
              <Tag>
                <Fill template={t.rates.tagDuty} values={{ hours: person.dutyHours }} />
              </Tag>
              {person.sundayPolicy !== "off" ? (
                <Tag tone={person.sundayPolicy === "compulsory" ? "danger" : "muted"}>
                  {/* The policy was rendering as the enum member — a badge
                      reading "Sun adjust_in_leave" is a column name. */}
                  <Fill
                    template={t.rates.tagSunday}
                    values={{ policy: t.status.sundayPolicy[person.sundayPolicy] }}
                  />
                </Tag>
              ) : null}
              {!person.requiresAttendance ? (
                <Tag tone="muted">{t.rates.tagNotFromAttendance}</Tag>
              ) : null}
              {person.flexibleHours ? <Tag tone="muted">{t.rates.tagFlexible}</Tag> : null}
              {!person.overtimeEligible ? <Tag tone="muted">{t.rates.tagNoOvertime}</Tag> : null}
            </>
          )}
          {deductions > 0 ? (
            <Tag tone="danger">
              <Latin>{`−${money(deductions)}`}</Latin>
            </Tag>
          ) : null}
          {allowances > 0 ? (
            <Tag tone="success">
              <Latin>{`+${money(allowances)}`}</Latin>
            </Tag>
          ) : null}
        </div>

        <div className="ms-auto text-end">
          <p className="text-sm font-bold tabular-nums text-foreground">
            <Latin>{`Rs ${money(person.monthlySalary)}`}</Latin>
          </p>
          <p className="text-[11px] text-muted-foreground">
            {isContractor ? (
              t.rates.agreedFlat
            ) : (
              <Fill
                template={t.rates.perDayShort}
                values={{ amount: `Rs ${money2(person.monthlySalary / days)}` }}
              />
            )}
          </p>
        </div>

        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            !open && "-rotate-90",
          )}
        />
      </button>

      {open ? (
        <div className="space-y-4 bg-secondary/40 px-4 pb-5 pt-1">
          <form ref={form} onSubmit={(event) => event.preventDefault()} className="space-y-3">
            <input type="hidden" name="user_id" value={person.id} />

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={t.rates.paidAs}>
                <select
                  name="worker_type"
                  value={workerType}
                  onChange={(event) => setWorkerType(event.target.value as PayPerson["workerType"])}
                  className={INPUT}
                >
                  <option value="employee">{t.status.workerType.employee}</option>
                  <option value="contractor">{t.status.workerType.contractor}</option>
                </select>
              </Field>

              <Field label={isContractor ? t.rates.agreedAmount : t.rates.monthlySalary}>
                <input
                  name="monthly_salary"
                  type="number"
                  min={0}
                  step="0.01"
                  value={salary}
                  onChange={(event) => setSalary(event.target.value)}
                  className={INPUT}
                />
              </Field>

              <Field label={t.rates.salaryCovers}>
                <select
                  name="duty_hours"
                  value={dutyHours}
                  onChange={(event) => setDutyHours(event.target.value)}
                  disabled={isContractor}
                  className={cn(INPUT, isContractor && "opacity-50")}
                >
                  <option value="8">{t.rates.hours8}</option>
                  <option value="12">{t.rates.hours12}</option>
                </select>
              </Field>

              <Field label={t.rates.sunday}>
                <select
                  name="sunday_policy"
                  defaultValue={person.sundayPolicy}
                  disabled={isContractor}
                  className={cn(INPUT, isContractor && "opacity-50")}
                >
                  <option value="off">{t.status.sundayPolicy.off}</option>
                  <option value="optional">{t.status.sundayPolicy.optional}</option>
                  <option value="compulsory">{t.status.sundayPolicy.compulsory}</option>
                  <option value="adjust_in_leave">{t.status.sundayPolicy.adjust_in_leave}</option>
                </select>
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={t.rates.payClass}>
                <select name="pay_class" defaultValue={person.payClass} className={INPUT}>
                  <option value="monthly">{t.status.payClass.monthly}</option>
                  <option value="hourly">{t.status.payClass.hourly}</option>
                </select>
              </Field>
              <Field label={t.rates.hourlyRate}>
                <input
                  name="hourly_rate"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={person.hourlyRate}
                  className={INPUT}
                />
              </Field>
              <Field label={t.rates.tracking}>
                <select name="tracking" defaultValue={trackingValue} className={INPUT}>
                  <option value="tracked">{t.rates.trackingTracked}</option>
                  <option value="salary_only">{t.rates.trackingSalaryOnly}</option>
                  <option value="exempt">{t.rates.trackingExempt}</option>
                </select>
                <p className="mt-1 text-xs text-muted-foreground">{t.rates.trackingHint}</p>
              </Field>
              <label className="flex items-center gap-2 self-end pb-2 text-xs font-semibold text-foreground">
                <input
                  type="checkbox"
                  name="overtime_eligible"
                  defaultChecked={person.overtimeEligible}
                  className="size-4 rounded border-input"
                />
                {t.rates.earnsOvertime}
              </label>
            </div>

            {isContractor ? (
              <p className="rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning">
                {t.rates.contractorNote}
              </p>
            ) : monthly > 0 ? (
              // Five figures in one line. Written as a single template
              // rather than assembled in JSX: Urdu puts the division and the
              // "a day" the other way round, and a sentence glued together
              // out of fragments cannot be reordered by a translator.
              <p className="rounded-xl bg-card px-3 py-2 text-xs text-muted-foreground">
                <Fill
                  template={t.rates.dailyBreakdown}
                  values={{
                    perDay: `Rs ${money2(perDay)}`,
                    salary: money(monthly),
                    days,
                    perHour: `Rs ${money2(perOtHour)}`,
                    duty: dutyHours,
                  }}
                />
              </p>
            ) : null}

            <SwipeToConfirm
              label={fill(t.rates.swipeSave, { name: person.fullName.split(" ")[0] ?? "" })}
              confirmedLabel={t.common.saving}
              pending={pending}
              onConfirm={save}
            />
          </form>

          <Components person={person} />
        </div>
      ) : null}
    </div>
  );
}

/** The individual allowances and deductions following one person. */
function Components({ person }: { person: PayPerson }) {
  const t = useDictionary();
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");

  const ready = label.trim().length > 0 && Number(amount) > 0;

  function add() {
    const element = form.current;
    if (!element) return;
    const data = new FormData(element);

    startTransition(async () => {
      const result = await addUserComponent(INITIAL, data);
      if (result.ok) {
        toast.success(result.message);
        setLabel("");
        setAmount("");
      } else {
        toast.error(result.message);
      }
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl bg-card p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {t.rates.componentsTitle}
      </p>

      {person.components.length > 0 ? (
        <ul className="mt-2 space-y-1.5">
          {person.components.map((component) => (
            <li
              key={component.id}
              className="flex items-center gap-3 rounded-xl bg-secondary px-3 py-2"
            >
              {/* The line's name is whatever the office typed on it. */}
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                <Latin>{component.label}</Latin>
              </span>
              <span
                className={cn(
                  "text-sm font-bold tabular-nums",
                  component.kind === "earning" ? "text-success" : "text-danger",
                )}
              >
                <Latin>{`${component.kind === "earning" ? "+" : "−"} Rs ${money(component.amount)}`}</Latin>
              </span>
              <button
                type="button"
                disabled={pending}
                aria-label={fill(t.rates.removeLine, { name: component.label })}
                onClick={() =>
                  startTransition(async () => {
                    const result = await removeUserComponent(component.id);
                    if (result.ok) toast.success(result.message);
                    else toast.error(result.message);
                    router.refresh();
                  })
                }
                className="rounded-lg p-1 text-muted-foreground transition-colors hover:text-danger disabled:opacity-50"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">{t.rates.nothingAttached}</p>
      )}

      <form ref={form} onSubmit={(event) => event.preventDefault()} className="mt-3 space-y-2">
        <input type="hidden" name="user_id" value={person.id} />
        <div className="grid gap-2 sm:grid-cols-[1fr_8rem_8rem]">
          <input
            name="label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder={t.rates.componentNamePlaceholder}
            aria-label={t.rates.lineName}
            className={INPUT}
          />
          <input
            name="amount"
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder={t.rates.amount}
            aria-label={t.rates.amount}
            className={INPUT}
          />
          <select name="kind" defaultValue="deduction" aria-label={t.rates.kind} className={INPUT}>
            <option value="deduction">{t.rates.deduction}</option>
            <option value="earning">{t.rates.allowance}</option>
          </select>
        </div>

        {ready ? (
          <SwipeToConfirm
            label={t.rates.swipeAttach}
            confirmedLabel={t.rates.attaching}
            pending={pending}
            onConfirm={add}
          />
        ) : null}
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Tag({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "muted" | "warning" | "danger" | "success";
}) {
  const tones = {
    default: "bg-card text-foreground",
    muted: "bg-card text-muted-foreground",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
    success: "bg-success-soft text-success",
  };
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", tones[tone])}>
      {children}
    </span>
  );
}

export { Banknote };
