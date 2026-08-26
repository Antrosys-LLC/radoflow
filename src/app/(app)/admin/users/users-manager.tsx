"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { KeyRound, Plus, UserPlus, X } from "lucide-react";
import { toast } from "sonner";

import { CnicInput, PasswordInput } from "@/components/credential-inputs";
import { Avatar, Card, SectionTitle } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import {
  createUser,
  setUserOverride,
  setUserPassword,
  setUserRole,
  setUserStatus,
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
  status: string;
  roleId: string | null;
  roleName: string;
  isSuperuser: boolean;
  overrides: { permissionId: string; effect: string }[];
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
  departments: Option[];
  shifts: Option[];
  permissions: PermissionOption[];
  canManageAccess: boolean;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [tuning, setTuning] = useState<UserRow | null>(null);

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

        <div className="grid gap-2 lg:grid-cols-2">
          {users.map((user) => (
            <UserCard
              key={user.id}
              user={user}
              roles={roles}
              canManageAccess={canManageAccess}
              onTune={() => setTuning(user)}
            />
          ))}
        </div>
      </Card>

      {showAdd ? (
        <AddUserDialog
          roles={roles}
          sites={sites}
          departments={departments}
          shifts={shifts}
          onClose={() => setShowAdd(false)}
        />
      ) : null}

      {tuning ? (
        <AccessDialog user={tuning} permissions={permissions} onClose={() => setTuning(null)} />
      ) : null}
    </div>
  );
}

function UserCard({
  user,
  roles,
  canManageAccess,
  onTune,
}: {
  user: UserRow;
  roles: Option[];
  canManageAccess: boolean;
  onTune: () => void;
}) {
  const [state, formAction] = useActionState(setUserRole, INITIAL);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (!state.message) return;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
    router.refresh();
  }, [state, router]);

  const suspended = user.status !== "active";

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
        {canManageAccess ? (
          <form action={formAction} className="flex items-center gap-2">
            <input type="hidden" name="user_id" value={user.id} />
            <select
              name="role_id"
              defaultValue={user.roleId ?? ""}
              className="rounded-xl border border-input bg-card px-3 py-2 text-xs font-semibold outline-none focus:border-primary"
            >
              <option value="">No role</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
            <RoleSubmit />
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

        <PasswordReset userId={user.id} name={user.full_name} />

        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await setUserStatus(user.id, suspended ? "active" : "suspended");
              if (result.ok) toast.success(result.message);
              else toast.error(result.message);
              router.refresh();
            })
          }
          className="ml-auto rounded-xl px-3 py-2 text-xs font-semibold text-muted-foreground transition-all hover:text-danger disabled:opacity-50"
        >
          {suspended ? "Reactivate" : "Suspend"}
        </button>
      </div>
    </div>
  );
}

function RoleSubmit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl bg-charcoal px-3 py-2 text-xs font-bold text-charcoal-foreground transition-all hover:opacity-90 disabled:opacity-50"
    >
      {pending ? "…" : "Set role"}
    </button>
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
    <div className="flex w-full items-center gap-2">
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
        onClick={save}
        disabled={pending || value.length < 8}
        className="rounded-xl bg-charcoal px-3 py-2 text-xs font-bold text-charcoal-foreground transition-all hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "…" : "Save"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="rounded-xl px-2 py-2 text-xs font-semibold text-muted-foreground transition-all hover:text-foreground"
      >
        Cancel
      </button>
    </div>
  );
}

function AddUserDialog({
  roles,
  sites,
  departments,
  shifts,
  onClose,
}: {
  roles: Option[];
  sites: Option[];
  departments: Option[];
  shifts: Option[];
  onClose: () => void;
}) {
  const [state, formAction] = useActionState(createUser, INITIAL);
  const [payClass, setPayClass] = useState("hourly");
  const router = useRouter();

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
              <select name="department_id" defaultValue="" className={INPUT}>
                <option value="">Unassigned</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
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
