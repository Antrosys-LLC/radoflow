"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Banknote, KeyRound, Pencil, Plus, Search, Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";

import { CnicInput, PasswordInput } from "@/components/credential-inputs";
import { matchesPerson } from "@/lib/people/match";
import { SwipeToConfirm } from "@/components/swipe-to-confirm";
import { Avatar, Card, SectionTitle } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { addUserComponent, removeUserComponent, updateUserPay } from "@/lib/pay/actions";
import {
  createUser,
  setUserOverride,
  setUserPassword,
  setUserRole,
  setUserStatus,
  updateUserProfile,
  type UserResult,
} from "./actions";

const INITIAL: UserResult = { ok: false, message: "" };
const INPUT =
  "mt-1 w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/30";

export interface UserRow {
  id: string;
  employee_code: string;
  full_name: string;
  cnic: string | null;
  email: string | null;
  phone: string | null;
  designation: string | null;
  status: string;
  roleId: string | null;
  roleName: string;
  isSuperuser: boolean;
  overrides: { permissionId: string; effect: string }[];

  workerType: "employee" | "contractor";
  payClass: "monthly" | "hourly";
  monthlySalary: number;
  hourlyRate: number;
  /** Hours this person's salary covers. Work beyond it is overtime. */
  dutyHours: number;
  sundayPolicy: "off" | "optional" | "compulsory" | "adjust_in_leave";
  /** False pays no overtime at all, on any day. */
  overtimeEligible: boolean;
  requiresAttendance: boolean;
  /** No in or out time enforced: never recorded late. */
  flexibleHours: boolean;
  siteId: string | null;
  departmentId: string | null;
  shiftId: string | null;
  components: {
    id: string;
    label: string;
    kind: string;
    amount: number;
    effectiveFrom: string;
    effectiveTo: string | null;
  }[];
}

export interface DepartmentOption extends Option {
  defaultWorkerType: "employee" | "contractor";
}

export interface Option {
  id: string;
  name: string;
}

export interface PermissionOption {
  id: string;
  module: string;
  label: string;
}

export function UsersManager({
  users,
  roles,
  sites,
  departments,
  shifts,
  permissions,
  canManageAccess,
}: {
  users: UserRow[];
  roles: Option[];
  sites: Option[];
  departments: DepartmentOption[];
  shifts: Option[];
  permissions: PermissionOption[];
  canManageAccess: boolean;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [tuning, setTuning] = useState<UserRow | null>(null);
  const [paying, setPaying] = useState<UserRow | null>(null);
  const [editing, setEditing] = useState<UserRow | null>(null);

  /*
   * Filtered here rather than through the URL, because this list is already a
   * client component holding every row — a round trip to the server would only
   * hand back rows the browser is holding anyway.
   */
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const shown = users.filter((user) => {
    if (roleFilter && user.roleId !== roleFilter) return false;
    if (statusFilter === "active" && user.status !== "active") return false;
    if (statusFilter === "suspended" && user.status === "active") return false;
    if (statusFilter === "no-cnic" && user.cnic) return false;
    return matchesPerson(user, query);
  });

  return (
    <div className="space-y-5">
      <Card className="p-4 sm:p-6">
        <SectionTitle
          icon={UserPlus}
          title={`User accounts · ${users.length}`}
          subtitle="Every person who can sign in. The employee code is also their K50 fingerprint ID."
          action={
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-[0_10px_24px_rgb(239_86_25/0.25)] transition-all hover:-translate-y-0.5"
            >
              <Plus className="size-4" />
              Add user
            </button>
          }
        />

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[14rem] flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, employee code or CNIC"
              aria-label="Search people"
              className="w-full rounded-2xl border border-input bg-background py-2.5 pl-10 pr-4 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
            aria-label="Filter by role"
            className="rounded-2xl border border-input bg-background px-3 py-2.5 text-sm font-semibold outline-none focus:border-primary"
          >
            <option value="">Every role</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Filter by status"
            className="rounded-2xl border border-input bg-background px-3 py-2.5 text-sm font-semibold outline-none focus:border-primary"
          >
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="no-cnic">Cannot sign in — no CNIC</option>
          </select>

          {shown.length !== users.length ? (
            <span className="text-xs text-muted-foreground">
              Showing {shown.length} of {users.length}
            </span>
          ) : null}
        </div>

        <div className="grid gap-2 lg:grid-cols-2">
          {shown.map((user) => (
            <UserCard
              key={user.id}
              user={user}
              roles={roles}
              canManageAccess={canManageAccess}
              onTune={() => setTuning(user)}
              onPay={() => setPaying(user)}
              onEdit={() => setEditing(user)}
            />
          ))}
        </div>

        {shown.length === 0 ? (
          <p className="rounded-2xl bg-secondary px-4 py-8 text-center text-sm text-muted-foreground">
            Nobody matches these filters.
          </p>
        ) : null}
      </Card>

      {showAdd ? (
        <AddUserDialog
          roles={roles}
          canManageAccess={canManageAccess}
          sites={sites}
          departments={departments}
          shifts={shifts}
          onClose={() => setShowAdd(false)}
        />
      ) : null}

      {tuning ? (
        <AccessDialog user={tuning} permissions={permissions} onClose={() => setTuning(null)} />
      ) : null}

      {paying ? <PayDialog user={paying} onClose={() => setPaying(null)} /> : null}

      {editing ? (
        <EditProfileDialog
          user={editing}
          sites={sites}
          departments={departments}
          shifts={shifts}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function UserCard({
  user,
  roles,
  canManageAccess,
  onTune,
  onPay,
  onEdit,
}: {
  user: UserRow;
  roles: Option[];
  canManageAccess: boolean;
  onTune: () => void;
  onPay: () => void;
  onEdit: () => void;
}) {
  const [state, formAction] = useActionState(setUserRole, INITIAL);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  /*
   * The role select is held here rather than submitted on change, so choosing
   * a role and committing to it are two separate acts. The swipe below only
   * appears once the choice differs from what is saved.
   */
  const roleForm = useRef<HTMLFormElement>(null);
  const [roleId, setRoleId] = useState(user.roleId ?? "");
  const roleChanged = roleId !== (user.roleId ?? "");

  const [confirmingStatus, setConfirmingStatus] = useState(false);

  useEffect(() => {
    if (!state.message) return;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
    router.refresh();
  }, [state, router]);

  const suspended = user.status !== "active";

  /*
   * Resetting a password hands an account over; suspending one takes it
   * offline and drops it from payroll. Neither is offered for an administrator
   * unless the person looking already manages access. The server and the
   * database both refuse regardless — this only keeps buttons off the screen
   * that would always come back with a refusal.
   */
  const canAdminister = canManageAccess || !user.isSuperuser;

  return (
    <div className={cn("rounded-2xl bg-secondary p-4", suspended && "opacity-60")}>
      <div className="flex items-start gap-3">
        <Avatar name={user.full_name} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-foreground">{user.full_name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {user.employee_code} ·{" "}
            {user.cnic ? (
              <span className="font-mono">{user.cnic}</span>
            ) : (
              <span className="font-semibold text-danger">No CNIC — cannot sign in</span>
            )}
          </p>
          {user.overrides.length > 0 ? (
            <p className="mt-1 text-[11px] font-bold text-primary">
              {user.overrides.length} custom access change
              {user.overrides.length === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>
        {suspended ? (
          <span className="rounded-full bg-danger-soft px-2.5 py-1 text-[10px] font-bold uppercase text-danger">
            Suspended
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1.5 rounded-xl bg-card px-3 py-2 text-xs font-semibold text-foreground transition-all hover:text-primary"
        >
          <Pencil className="size-3.5" />
          Edit profile
        </button>

        {canManageAccess ? (
          <form ref={roleForm} action={formAction} className="flex items-center gap-2">
            <input type="hidden" name="user_id" value={user.id} />
            <input type="hidden" name="role_id" value={roleId} />
            <select
              value={roleId}
              onChange={(event) => setRoleId(event.target.value)}
              aria-label={`Role for ${user.full_name}`}
              className="rounded-xl border border-input bg-card px-3 py-2 text-xs font-semibold outline-none focus:border-primary"
            >
              <option value="">No role</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </form>
        ) : (
          <span className="rounded-full bg-card px-3 py-1.5 text-xs font-bold text-foreground">
            {user.roleName}
          </span>
        )}

        {canManageAccess && !user.isSuperuser ? (
          <button
            type="button"
            onClick={onTune}
            className="inline-flex items-center gap-1.5 rounded-xl bg-card px-3 py-2 text-xs font-semibold text-foreground transition-all hover:text-primary"
          >
            <KeyRound className="size-3.5" />
            Custom access
          </button>
        ) : null}

        <button
          type="button"
          onClick={onPay}
          className="inline-flex items-center gap-1.5 rounded-xl bg-card px-3 py-2 text-xs font-semibold text-foreground transition-all hover:text-primary"
        >
          <Banknote className="size-3.5" />
          Pay &amp; duty
        </button>

        {canAdminister ? <PasswordReset userId={user.id} name={user.full_name} /> : null}

        {canAdminister ? (
          <button
            type="button"
            disabled={pending || confirmingStatus}
            onClick={() => setConfirmingStatus(true)}
            className="ml-auto rounded-xl px-3 py-2 text-xs font-semibold text-muted-foreground transition-all hover:text-danger disabled:opacity-50"
          >
            {suspended ? "Reactivate" : "Suspend"}
          </button>
        ) : null}
      </div>

      {/* Both commitments live below the row so the swipe has full width to
          travel — a short track is easy to complete by accident, which is the
          one thing this control exists to prevent. */}
      {roleChanged ? (
        <div className="mt-3">
          <SwipeToConfirm
            label={`Swipe to set ${user.full_name.split(" ")[0]}'s role`}
            confirmedLabel="Updating role…"
            onConfirm={() => roleForm.current?.requestSubmit()}
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            They will be signed out and must sign in again for this to take effect.
          </p>
        </div>
      ) : null}

      {confirmingStatus ? (
        <div className="mt-3">
          <SwipeToConfirm
            tone={suspended ? "default" : "danger"}
            label={suspended ? "Swipe to reactivate" : "Swipe to suspend"}
            confirmedLabel={suspended ? "Reactivating…" : "Suspending…"}
            pending={pending}
            onConfirm={() =>
              startTransition(async () => {
                const result = await setUserStatus(user.id, suspended ? "active" : "suspended");
                if (result.ok) toast.success(result.message);
                else toast.error(result.message);
                setConfirmingStatus(false);
                router.refresh();
              })
            }
          />
          <button
            type="button"
            onClick={() => setConfirmingStatus(false)}
            className="mt-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Sets a new password for one person, in place.
 *
 * Collapsed until asked for, because it is a rare action sitting next to two
 * common ones. Nothing is stored in readable form: the value is echoed back
 * once so the office can pass it on, and the only way to recover a forgotten
 * password afterwards is to set another.
 */
function PasswordReset({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      const result = await setUserPassword(userId, value);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      // Held until dismissed: once this toast is gone the password is not
      // recoverable, only replaceable.
      toast.success(result.message, { duration: Infinity, closeButton: true });
      setValue("");
      setOpen(false);
    });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-xl bg-card px-3 py-2 text-xs font-semibold text-foreground transition-all hover:text-primary"
      >
        <KeyRound className="size-3.5" />
        Set password
      </button>
    );
  }

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <PasswordInput
            autoComplete="new-password"
            minLength={8}
            value={value}
            onChange={setValue}
            placeholder={`New password for ${name}`}
            className="w-full rounded-xl border border-input bg-card px-3 py-2 text-xs outline-none focus:border-primary"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setValue("");
            setOpen(false);
          }}
          className="rounded-xl px-2 py-2 text-xs font-semibold text-muted-foreground transition-all hover:text-foreground"
        >
          Cancel
        </button>
      </div>

      {/* Locking someone out of their own account is worth a deliberate
          gesture, the same as changing their role or their pay. */}
      {value.length >= 8 ? (
        <SwipeToConfirm
          label={`Swipe to set ${name.split(" ")[0]}'s password`}
          confirmedLabel="Setting password…"
          pending={pending}
          onConfirm={save}
        />
      ) : (
        <p className="text-[11px] text-muted-foreground">At least 8 characters.</p>
      )}
    </div>
  );
}

function AddUserDialog({
  roles,
  canManageAccess,
  sites,
  departments,
  shifts,
  onClose,
}: {
  roles: Option[];
  /** Assigning a role is `access.manage`, not `people.manage`. */
  canManageAccess: boolean;
  sites: Option[];
  departments: DepartmentOption[];
  shifts: Option[];
  onClose: () => void;
}) {
  const [state, formAction] = useActionState(createUser, INITIAL);
  const [payClass, setPayClass] = useState("hourly");
  const router = useRouter();

  /*
   * Worker type follows the department by default — adding someone to Folding
   * should not require remembering that Folding is contracted out — but stays
   * overridable, because a directly-employed supervisor inside a contractor
   * department is a real case.
   */
  const [departmentId, setDepartmentId] = useState("");
  const [workerType, setWorkerType] = useState<"employee" | "contractor">("employee");
  const isContractor = workerType === "contractor";

  useEffect(() => {
    if (!state.message) return;
    if (state.ok) {
      toast.success(state.message, { duration: 8000 });
      onClose();
      router.refresh();
    } else {
      toast.error(state.message, { duration: 8000 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, router]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-charcoal/40 p-3 backdrop-blur-sm sm:items-center">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-card p-6 shadow-[0_18px_40px_rgb(0_0_0/0.18)]">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-foreground">Add a user</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The employee code is used as their ZKTeco K50 fingerprint ID — enrol them on the
              terminal with the same number and punches link automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <form action={formAction} className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name">
              <input name="full_name" required className={INPUT} placeholder="Imran Sheikh" />
            </Field>
            <Field label="Employee code / K50 ID">
              <input name="employee_code" required className={INPUT} placeholder="RD-1043" />
            </Field>
            <Field label="CNIC (sign-in)">
              <CnicInput required className={INPUT} />
            </Field>
            <Field label="Temporary password">
              <PasswordInput
                autoComplete="new-password"
                required
                minLength={8}
                placeholder="At least 8 characters"
                className={INPUT}
              />
            </Field>
            <Field label="Email (optional)">
              <input name="email" type="email" className={INPUT} placeholder="name@radoflow.test" />
            </Field>
            <Field label="Phone">
              <input name="phone" type="tel" className={INPUT} placeholder="+92 300 1234567" />
            </Field>
            <Field label="Designation">
              <input name="designation" className={INPUT} placeholder="Loom Operator" />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {canManageAccess ? (
              <Field label="Role">
                <select name="role_id" defaultValue="" className={INPUT}>
                  <option value="">No role</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field label="Role">
                <p className="rounded-xl bg-secondary px-3 py-2.5 text-xs text-muted-foreground">
                  Assigned by someone who manages access.
                </p>
              </Field>
            )}
            <Field label="Factory">
              <select name="site_id" defaultValue="" className={INPUT}>
                <option value="">Unassigned</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Department">
              <select
                name="department_id"
                value={departmentId}
                onChange={(event) => {
                  setDepartmentId(event.target.value);
                  const chosen = departments.find((d) => d.id === event.target.value);
                  if (chosen) setWorkerType(chosen.defaultWorkerType);
                }}
                className={INPUT}
              >
                <option value="">Unassigned</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                    {d.defaultWorkerType === "contractor" ? " (contractors)" : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Shift">
              <select name="shift_id" defaultValue="" className={INPUT}>
                <option value="">No shift</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Paid as">
              <select
                name="worker_type"
                value={workerType}
                onChange={(event) => setWorkerType(event.target.value as "employee" | "contractor")}
                className={INPUT}
              >
                <option value="employee">Employee</option>
                <option value="contractor">Contractor — flat amount</option>
              </select>
            </Field>
            <Field label="Salary covers">
              <select
                name="duty_hours"
                defaultValue="8"
                disabled={isContractor}
                className={cn(INPUT, isContractor && "opacity-50")}
              >
                <option value="8">8 hours — beyond is overtime</option>
                <option value="12">12 hours — all duty, no overtime</option>
              </select>
            </Field>
            <Field label="Sunday">
              <select
                name="sunday_policy"
                defaultValue="off"
                disabled={isContractor}
                className={cn(INPUT, isContractor && "opacity-50")}
              >
                <option value="off">Off</option>
                <option value="optional">Optional</option>
                <option value="compulsory">Compulsory</option>
              </select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Pay type">
              <select
                name="pay_class"
                value={payClass}
                onChange={(e) => setPayClass(e.target.value)}
                className={INPUT}
              >
                <option value="hourly">Hourly wage</option>
                <option value="monthly">Monthly salary</option>
              </select>
            </Field>
            {payClass === "monthly" ? (
              <Field label="Monthly salary (₨)">
                <input
                  name="monthly_salary"
                  type="number"
                  min="0"
                  defaultValue={0}
                  className={INPUT}
                />
              </Field>
            ) : (
              <Field label="Hourly rate (₨)">
                <input
                  name="hourly_rate"
                  type="number"
                  min="0"
                  defaultValue={0}
                  className={INPUT}
                />
              </Field>
            )}
          </div>

          <label className="flex items-center gap-3 rounded-2xl bg-secondary px-4 py-3">
            <input
              type="checkbox"
              name="requires_attendance"
              defaultChecked={payClass === "hourly"}
              key={payClass}
              className="size-5 accent-[var(--primary)]"
            />
            <span className="text-sm font-semibold text-foreground">
              Must clock in on the biometric terminal
            </span>
          </label>

          <CreateUserButton />
        </form>
      </div>
    </div>
  );
}

/**
 * Edits who someone is and where they sit — name, employee code, CNIC,
 * contact details, and placement. Kept apart from pay/duty and access, which
 * have their own dialogs, so a small correction (a fixed department, a typo
 * in a name) never puts money or permissions in the same swipe-to-confirm.
 */
function EditProfileDialog({
  user,
  sites,
  departments,
  shifts,
  onClose,
}: {
  user: UserRow;
  sites: Option[];
  departments: DepartmentOption[];
  shifts: Option[];
  onClose: () => void;
}) {
  const [state, formAction] = useActionState(updateUserProfile, INITIAL);
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

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-charcoal/40 p-3 backdrop-blur-sm sm:items-center">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-card p-6 shadow-[0_18px_40px_rgb(0_0_0/0.18)]">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-foreground">
              Edit profile · {user.full_name}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Name, employee code, contact details and placement. Pay, duty terms and access are
              changed from their own buttons on the card.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <form action={formAction} className="mt-5 space-y-4">
          <input type="hidden" name="user_id" value={user.id} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name">
              <input
                name="full_name"
                required
                defaultValue={user.full_name}
                className={INPUT}
                placeholder="Imran Sheikh"
              />
            </Field>
            <Field label="Employee code / K50 ID">
              <input
                name="employee_code"
                required
                defaultValue={user.employee_code}
                className={INPUT}
                placeholder="RD-1043"
              />
            </Field>
            <Field label="CNIC (sign-in)">
              <CnicInput defaultValue={user.cnic ?? ""} className={INPUT} />
            </Field>
            <Field label="Email (optional)">
              <input
                name="email"
                type="email"
                defaultValue={user.email ?? ""}
                className={INPUT}
                placeholder="name@radoflow.test"
              />
            </Field>
            <Field label="Phone">
              <input
                name="phone"
                type="tel"
                defaultValue={user.phone ?? ""}
                className={INPUT}
                placeholder="+92 300 1234567"
              />
            </Field>
            <Field label="Designation">
              <input
                name="designation"
                defaultValue={user.designation ?? ""}
                className={INPUT}
                placeholder="Loom Operator"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Factory">
              <select name="site_id" defaultValue={user.siteId ?? ""} className={INPUT}>
                <option value="">Unassigned</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Department">
              <select name="department_id" defaultValue={user.departmentId ?? ""} className={INPUT}>
                <option value="">Unassigned</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Shift">
              <select name="shift_id" defaultValue={user.shiftId ?? ""} className={INPUT}>
                <option value="">No shift</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <SaveProfileButton />
        </form>
      </div>
    </div>
  );
}

function SaveProfileButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-[0_10px_24px_rgb(239_86_25/0.25)] transition-all hover:-translate-y-0.5 disabled:opacity-60"
    >
      {pending ? "Saving…" : "Save changes"}
    </button>
  );
}

function AccessDialog({
  user,
  permissions,
  onClose,
}: {
  user: UserRow;
  permissions: PermissionOption[];
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const effectFor = (permissionId: string) =>
    user.overrides.find((o) => o.permissionId === permissionId)?.effect ?? "role";

  function set(permissionId: string, effect: "grant" | "deny" | "clear") {
    startTransition(async () => {
      const result = await setUserOverride(user.id, permissionId, effect);
      if (!result.ok) toast.error(result.message);
      router.refresh();
    });
  }

  const byModule = permissions.reduce<Record<string, PermissionOption[]>>((acc, p) => {
    (acc[p.module] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-charcoal/40 p-3 backdrop-blur-sm sm:items-center">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-card p-6 shadow-[0_18px_40px_rgb(0_0_0/0.18)]">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-foreground">
              Custom access · {user.full_name}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              On top of the <strong>{user.roleName}</strong> role. Use this to give one person
              something extra, or take something away, without creating a new role.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-5 space-y-5">
          {Object.entries(byModule).map(([module, items]) => (
            <div key={module}>
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {module}
              </p>
              <div className="space-y-2">
                {items.map((permission) => {
                  const effect = effectFor(permission.id);
                  return (
                    <div
                      key={permission.id}
                      className="flex items-center justify-between gap-3 rounded-2xl bg-secondary px-4 py-2.5"
                    >
                      <span className="min-w-0 truncate text-sm font-semibold text-foreground">
                        {permission.label}
                      </span>
                      <div className="flex shrink-0 gap-1">
                        {(["grant", "role", "deny"] as const).map((option) => (
                          <button
                            key={option}
                            type="button"
                            disabled={pending}
                            onClick={() => set(permission.id, option === "role" ? "clear" : option)}
                            className={cn(
                              "rounded-lg px-2.5 py-1.5 text-[11px] font-bold capitalize transition-all disabled:opacity-50",
                              effect === option
                                ? option === "grant"
                                  ? "bg-success text-white"
                                  : option === "deny"
                                    ? "bg-danger text-white"
                                    : "bg-charcoal text-charcoal-foreground"
                                : "bg-card text-muted-foreground",
                            )}
                          >
                            {option === "role" ? "Use role" : option}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm font-semibold text-foreground">{label}</label>
      {children}
    </div>
  );
}

function CreateUserButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 text-sm font-bold text-primary-foreground shadow-[0_12px_30px_rgb(239_86_25/0.28)] transition-all hover:-translate-y-0.5 disabled:opacity-60"
    >
      <UserPlus className="size-4" />
      {pending ? "Creating…" : "Create user"}
    </button>
  );
}

/**
 * The modal frame the dialogs on this screen share.
 *
 * Extracted when a third dialog was added rather than pasting the same
 * backdrop, sizing and close button a third time — three copies is where a
 * detail like the scroll cap starts drifting between them.
 */
function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-charcoal/40 p-3 backdrop-blur-sm sm:items-center">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-card p-6 shadow-[0_18px_40px_rgb(0_0_0/0.18)]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 className="text-lg font-bold tracking-tight text-foreground">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-xl p-1.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Everything about what one person is paid, in one place.
 *
 * Salary, the duty boundary, Sunday, and the individual deductions attached to
 * them. Kept together because they are read together: "why is this payslip this
 * number" is answered by all four at once, and splitting them across screens is
 * how a wrong duty figure survives a salary review.
 */
function PayDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const [state, formAction] = useActionState(updateUserPay, INITIAL);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);

  const [workerType, setWorkerType] = useState(user.workerType);
  const [dutyHours, setDutyHours] = useState(String(user.dutyHours));
  const [salary, setSalary] = useState(String(user.monthlySalary));

  useEffect(() => {
    if (!state.message) return;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
    router.refresh();
  }, [state, router]);

  const isContractor = workerType === "contractor";

  /*
   * The same arithmetic payroll will do, shown while the figures are being
   * typed. A duty boundary is abstract until you can see what an hour of
   * overtime is worth beside it.
   */
  const monthly = Number(salary) || 0;
  const daysThisMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const perDay = monthly > 0 ? monthly / daysThisMonth : 0;
  const perOtHour = perDay / 8;
  const money = (value: number) =>
    value.toLocaleString("en-PK", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

  return (
    <Dialog title={`Pay & duty · ${user.full_name}`} onClose={onClose}>
      <form ref={form} action={formAction} className="space-y-4">
        <input type="hidden" name="user_id" value={user.id} />

        <div>
          <label className="text-sm font-semibold text-foreground">Paid as</label>
          <select
            name="worker_type"
            value={workerType}
            onChange={(event) => setWorkerType(event.target.value as UserRow["workerType"])}
            className={INPUT}
          >
            <option value="employee">Employee — calculated from attendance</option>
            <option value="contractor">Contractor — flat agreed amount</option>
          </select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-foreground">
              {isContractor ? "Agreed amount (PKR)" : "Monthly salary (PKR)"}
            </label>
            <input
              name="monthly_salary"
              type="number"
              min={0}
              step="0.01"
              value={salary}
              onChange={(event) => setSalary(event.target.value)}
              className={INPUT}
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-foreground">Hourly rate (PKR)</label>
            <input
              name="hourly_rate"
              type="number"
              min={0}
              step="0.01"
              defaultValue={user.hourlyRate}
              className={INPUT}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">Only used for hourly staff.</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-foreground">Pay class</label>
            <select name="pay_class" defaultValue={user.payClass} className={INPUT}>
              <option value="monthly">Monthly</option>
              <option value="hourly">Hourly</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-foreground">Salary covers</label>
            <select
              name="duty_hours"
              value={dutyHours}
              onChange={(event) => setDutyHours(event.target.value)}
              disabled={isContractor}
              className={cn(INPUT, isContractor && "opacity-50")}
            >
              <option value="8">8 hours — anything beyond is overtime</option>
              <option value="12">12 hours — all twelve are duty, no overtime</option>
            </select>
          </div>
        </div>

        <div>
          <label className="text-sm font-semibold text-foreground">Sunday</label>
          <select
            name="sunday_policy"
            defaultValue={user.sundayPolicy}
            disabled={isContractor}
            className={cn(INPUT, isContractor && "opacity-50")}
          >
            <option value="off">Off — not expected in</option>
            <option value="optional">Optional — may come in</option>
            <option value="compulsory">Compulsory — expected in</option>
            <option value="adjust_in_leave">Adjust in leave — not paid</option>
          </select>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Sunday is never a working day. Every hour worked on one is overtime, whatever this says.
          </p>
        </div>

        <div className="space-y-2.5">
          <label className="flex items-start gap-2.5 text-sm font-semibold text-foreground">
            <input
              type="checkbox"
              name="requires_attendance"
              defaultChecked={user.requiresAttendance}
              className="mt-0.5 size-4 rounded border-input"
            />
            <span>
              Pay from attendance
              <span className="block text-xs font-normal text-muted-foreground">
                Unticked, the salary is paid in full and punches are only a record of presence.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2.5 text-sm font-semibold text-foreground">
            <input
              type="checkbox"
              name="flexible_hours"
              defaultChecked={user.flexibleHours}
              className="mt-0.5 size-4 rounded border-input"
            />
            <span>
              No fixed in or out time
              <span className="block text-xs font-normal text-muted-foreground">
                Never recorded late, whatever the shift says. Hours and overtime are still counted.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2.5 text-sm font-semibold text-foreground">
            <input
              type="checkbox"
              name="overtime_eligible"
              defaultChecked={user.overtimeEligible}
              className="mt-0.5 size-4 rounded border-input"
            />
            <span>
              Earns overtime
              <span className="block text-xs font-normal text-muted-foreground">
                Unticked, hours past the duty boundary are recorded but never paid.
              </span>
            </span>
          </label>
        </div>

        {isContractor ? (
          <p className="rounded-2xl bg-warning-soft px-4 py-3 text-xs text-warning">
            Nothing is calculated for a contractor. They receive the agreed amount in full — no
            proration for days missed, no overtime, no late penalty.
          </p>
        ) : monthly > 0 ? (
          <div className="rounded-2xl bg-secondary px-4 py-3 text-xs text-muted-foreground">
            <p>
              <span className="font-bold text-foreground">Rs {money(perDay)}</span> a day
              <span className="opacity-60">
                {" "}
                ({money(monthly)} ÷ {daysThisMonth} days this month)
              </span>
            </p>
            <p className="mt-1">
              <span className="font-bold text-foreground">Rs {money(perOtHour)}</span> an overtime
              hour<span className="opacity-60"> (the daily rate ÷ 8)</span>
            </p>
            <p className="mt-1 opacity-80">
              Beyond {dutyHours} hours on a weekday, and every hour on a Sunday.
            </p>
          </div>
        ) : null}

        <SwipeToConfirm
          label="Swipe to save pay settings"
          confirmedLabel="Saving…"
          onConfirm={() => form.current?.requestSubmit()}
        />
      </form>

      <div className="mt-6 border-t border-border pt-5">
        <p className="text-sm font-bold text-foreground">Allowances &amp; deductions</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Applied to this person only, every period, until removed.
        </p>

        {user.components.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {user.components.map((component) => (
              <li
                key={component.id}
                className="flex items-center gap-3 rounded-2xl bg-secondary px-4 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {component.label}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    From {component.effectiveFrom}
                    {component.effectiveTo ? ` to ${component.effectiveTo}` : " — ongoing"}
                  </p>
                </div>
                <span
                  className={cn(
                    "text-sm font-bold",
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
                  className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:text-danger disabled:opacity-50"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 rounded-2xl bg-secondary px-4 py-3 text-xs text-muted-foreground">
            Nothing attached to this person yet.
          </p>
        )}

        <AddComponentForm userId={user.id} />
      </div>
    </Dialog>
  );
}

/** Attaches one recurring line — an advance being recovered, a bonus — to a person. */
function AddComponentForm({ userId }: { userId: string }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");

  /*
   * Submitted by hand rather than through useActionState, because the fields
   * have to be cleared on success. Reacting to a result in an effect means
   * setting state during render, which cascades; doing it here keeps the reset
   * in the same callback that knows the save worked.
   */
  function submit() {
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

  const ready = label.trim().length > 0 && Number(amount) > 0;

  return (
    <form ref={form} onSubmit={(event) => event.preventDefault()} className="mt-4 space-y-3">
      <input type="hidden" name="user_id" value={userId} />

      <div className="grid gap-3 sm:grid-cols-[1fr_10rem_9rem]">
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
          onConfirm={submit}
        />
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Enter a name and an amount to attach it.
        </p>
      )}
    </form>
  );
}
