"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banknote, ChevronDown, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { SwipeToConfirm } from "@/components/swipe-to-confirm";
import { Card } from "@/components/ui-kit";
import { addUserComponent, removeUserComponent, updateUserPay } from "@/lib/pay/actions";
import { cn } from "@/lib/utils";

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
  sundayPolicy: "off" | "optional" | "compulsory";
  requiresAttendance: boolean;
  flexibleHours: boolean;
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
        Nobody matches this search.
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
        <span className="text-sm font-bold text-foreground">{name}</span>
        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">
          {members.length}
        </span>
        <span className="ml-auto text-right text-xs text-muted-foreground">
          {monthly > 0 ? (
            <span className="font-semibold text-foreground">Rs {money(monthly)}</span>
          ) : null}
          {monthly > 0 && contracted > 0 ? " · " : null}
          {contracted > 0 ? (
            <span className="text-warning">Rs {money(contracted)} contract</span>
          ) : null}
          <span className="ml-1 opacity-70">/ month</span>
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
          <p className="truncate text-sm font-semibold text-foreground">{person.fullName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {person.employeeCode}
            {person.cnic ? <span className="ml-2 font-mono">{person.cnic}</span> : null}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {isContractor ? (
            <Tag tone="warning">Contract</Tag>
          ) : (
            <>
              <Tag>{person.dutyHours}h duty</Tag>
              {person.sundayPolicy !== "off" ? (
                <Tag tone={person.sundayPolicy === "compulsory" ? "danger" : "muted"}>
                  Sun {person.sundayPolicy}
                </Tag>
              ) : null}
              {!person.requiresAttendance ? <Tag tone="muted">Not from attendance</Tag> : null}
              {person.flexibleHours ? <Tag tone="muted">Flexible</Tag> : null}
            </>
          )}
          {deductions > 0 ? <Tag tone="danger">−{money(deductions)}</Tag> : null}
          {allowances > 0 ? <Tag tone="success">+{money(allowances)}</Tag> : null}
        </div>

        <div className="ml-auto text-right">
          <p className="text-sm font-bold tabular-nums text-foreground">
            Rs {money(person.monthlySalary)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {isContractor ? "agreed, flat" : `Rs ${money2(person.monthlySalary / days)} a day`}
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
              <Field label="Paid as">
                <select
                  name="worker_type"
                  value={workerType}
                  onChange={(event) => setWorkerType(event.target.value as PayPerson["workerType"])}
                  className={INPUT}
                >
                  <option value="employee">Employee</option>
                  <option value="contractor">Contractor</option>
                </select>
              </Field>

              <Field label={isContractor ? "Agreed amount" : "Monthly salary"}>
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

              <Field label="Salary covers">
                <select
                  name="duty_hours"
                  value={dutyHours}
                  onChange={(event) => setDutyHours(event.target.value)}
                  disabled={isContractor}
                  className={cn(INPUT, isContractor && "opacity-50")}
                >
                  <option value="8">8 hours</option>
                  <option value="12">12 hours</option>
                </select>
              </Field>

              <Field label="Sunday">
                <select
                  name="sunday_policy"
                  defaultValue={person.sundayPolicy}
                  disabled={isContractor}
                  className={cn(INPUT, isContractor && "opacity-50")}
                >
                  <option value="off">Off</option>
                  <option value="optional">Optional</option>
                  <option value="compulsory">Compulsory</option>
                </select>
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Pay class">
                <select name="pay_class" defaultValue={person.payClass} className={INPUT}>
                  <option value="monthly">Monthly</option>
                  <option value="hourly">Hourly</option>
                </select>
              </Field>
              <Field label="Hourly rate">
                <input
                  name="hourly_rate"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={person.hourlyRate}
                  className={INPUT}
                />
              </Field>
              <label className="flex items-center gap-2 self-end pb-2 text-xs font-semibold text-foreground">
                <input
                  type="checkbox"
                  name="requires_attendance"
                  defaultChecked={person.requiresAttendance}
                  className="size-4 rounded border-input"
                />
                Pay from attendance
              </label>
              <label className="flex items-center gap-2 self-end pb-2 text-xs font-semibold text-foreground">
                <input
                  type="checkbox"
                  name="flexible_hours"
                  defaultChecked={person.flexibleHours}
                  className="size-4 rounded border-input"
                />
                No fixed in/out time
              </label>
            </div>

            {isContractor ? (
              <p className="rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning">
                Nothing is calculated. The agreed amount is paid in full — no proration for days
                missed, no overtime, no late penalty.
              </p>
            ) : monthly > 0 ? (
              <p className="rounded-xl bg-card px-3 py-2 text-xs text-muted-foreground">
                <strong className="text-foreground">Rs {money2(perDay)}</strong> a day
                <span className="opacity-70">
                  {" "}
                  ({money(monthly)} ÷ {days})
                </span>{" "}
                · <strong className="text-foreground">Rs {money2(perOtHour)}</strong> an overtime
                hour <span className="opacity-70">(÷ 8)</span> · overtime beyond {dutyHours}h,
                capped at 4h a working day, uncapped on Sundays.
              </p>
            ) : null}

            <SwipeToConfirm
              label={`Swipe to save ${person.fullName.split(" ")[0]}'s pay`}
              confirmedLabel="Saving…"
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
        Allowances &amp; deductions
      </p>

      {person.components.length > 0 ? (
        <ul className="mt-2 space-y-1.5">
          {person.components.map((component) => (
            <li
              key={component.id}
              className="flex items-center gap-3 rounded-xl bg-secondary px-3 py-2"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {component.label}
              </span>
              <span
                className={cn(
                  "text-sm font-bold tabular-nums",
                  component.kind === "earning" ? "text-success" : "text-danger",
                )}
              >
                {component.kind === "earning" ? "+" : "−"} Rs {money(component.amount)}
              </span>
              <button
                type="button"
                disabled={pending}
                aria-label={`Remove ${component.label}`}
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
        <p className="mt-2 text-xs text-muted-foreground">Nothing attached yet.</p>
      )}

      <form ref={form} onSubmit={(event) => event.preventDefault()} className="mt-3 space-y-2">
        <input type="hidden" name="user_id" value={person.id} />
        <div className="grid gap-2 sm:grid-cols-[1fr_8rem_8rem]">
          <input
            name="label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Advance recovery"
            aria-label="Name"
            className={INPUT}
          />
          <input
            name="amount"
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="Amount"
            aria-label="Amount"
            className={INPUT}
          />
          <select name="kind" defaultValue="deduction" aria-label="Kind" className={INPUT}>
            <option value="deduction">Deduction</option>
            <option value="earning">Allowance</option>
          </select>
        </div>

        {ready ? (
          <SwipeToConfirm
            label="Swipe to attach this line"
            confirmedLabel="Attaching…"
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
