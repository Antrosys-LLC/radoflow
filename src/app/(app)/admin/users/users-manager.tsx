"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Banknote, KeyRound, Pencil, Plus, Search, Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";

import { ApproverPicker } from "@/components/approver-picker";
import { AskAbout } from "@/components/assistant/ask-about";
import { CnicInput, PasswordInput } from "@/components/credential-inputs";
import { BulkBar } from "./bulk-bar";
import { Fill } from "@/components/fill";
import { useDictionary } from "@/components/language-provider";
import { Latin } from "@/components/latin";
import { matchesPerson } from "@/lib/people/match";
import { SwipeToConfirm } from "@/components/swipe-to-confirm";
import { Avatar, Card, SectionTitle } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

/**
 * The plain-string sibling of `<Fill>`, for the places a sentence has to be a
 * string: an `aria-label`, a placeholder, and the label a swipe control takes.
 */
function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => String(values[key] ?? ""));
}
import { addUserComponent, removeUserComponent, updateUserPay } from "@/lib/pay/actions";
import { deriveRates } from "@/lib/pay/derived";
import { trackingValueOf, type TrackingChoice } from "@/lib/people/tracking";
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
  payrollExempt: boolean;
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
  const t = useDictionary();
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

  /*
   * Held as a set of ids rather than a flag on each row: the list is filtered
   * client-side, and a selection that lived on the rows would silently empty
   * itself the moment somebody typed in the search box.
   */
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggleSelected(id: string) {
    setSelected((was) => {
      const next = new Set(was);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const shown = users.filter((user) => {
    if (roleFilter && user.roleId !== roleFilter) return false;
    if (statusFilter === "active" && user.status !== "active") return false;
    if (statusFilter === "suspended" && user.status === "active") return false;
    if (statusFilter === "no-cnic" && user.cnic) return false;
    return matchesPerson(user, query);
  });

  // Only what is on screen can be selected in one go — "select all" over a
  // hidden remainder is how the wrong forty people get suspended.
  const allShownSelected = shown.length > 0 && shown.every((user) => selected.has(user.id));

  return (
    <div className="space-y-5">
      <Card className="p-4 sm:p-6">
        <SectionTitle
          icon={UserPlus}
          title={<Fill template={t.users.title} values={{ count: users.length }} />}
          subtitle={t.users.hint}
          action={
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-[0_10px_24px_rgb(239_86_25/0.25)] transition-all hover:-translate-y-0.5"
            >
              <Plus className="size-4" />
              {t.users.addUser}
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
              placeholder={t.rates.searchPlaceholder}
              aria-label={t.users.searchPeople}
              className="w-full rounded-2xl border border-input bg-background py-2.5 pl-10 pr-4 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
            aria-label={t.users.role}
            className="rounded-2xl border border-input bg-background px-3 py-2.5 text-sm font-semibold outline-none focus:border-primary"
          >
            <option value="">{t.users.everyRole}</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label={t.common.status}
            className="rounded-2xl border border-input bg-background px-3 py-2.5 text-sm font-semibold outline-none focus:border-primary"
          >
            <option value="">{t.users.anyStatus}</option>
            <option value="active">{t.status.employment.active}</option>
            <option value="suspended">{t.status.employment.suspended}</option>
            <option value="no-cnic">{t.users.cannotSignIn}</option>
          </select>

          {shown.length !== users.length ? (
            <span className="text-xs text-muted-foreground">
              <Fill
                template={t.common.showingOfTotal}
                values={{ showing: shown.length, total: users.length }}
              />
            </span>
          ) : null}

          <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-secondary px-3 py-2 text-xs font-semibold text-foreground">
            <input
              type="checkbox"
              checked={allShownSelected}
              onChange={() =>
                setSelected(allShownSelected ? new Set() : new Set(shown.map((u) => u.id)))
              }
              className="size-4 rounded border-input"
            />
            {t.users.selectAllShown}
          </label>
        </div>

        <div className="grid gap-2 lg:grid-cols-2">
          {shown.map((user) => (
            <UserCard
              key={user.id}
              user={user}
              roles={roles}
              canManageAccess={canManageAccess}
              selected={selected.has(user.id)}
              onSelect={() => toggleSelected(user.id)}
              onTune={() => setTuning(user)}
              onPay={() => setPaying(user)}
              onEdit={() => setEditing(user)}
            />
          ))}
        </div>

        {shown.length === 0 ? (
          <p className="rounded-2xl bg-secondary px-4 py-8 text-center text-sm text-muted-foreground">
            {t.common.nobodyMatches}
          </p>
        ) : null}

        {selected.size > 0 ? (
          <BulkBar
            selected={[...selected]}
            roles={roles}
            departments={departments}
            shifts={shifts}
            canManageAccess={canManageAccess}
            onDone={() => setSelected(new Set())}
            onClear={() => setSelected(new Set())}
          />
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
  selected,
  onSelect,
  onTune,
  onPay,
  onEdit,
}: {
  user: UserRow;
  roles: Option[];
  canManageAccess: boolean;
  selected: boolean;
  onSelect: () => void;
  onTune: () => void;
  onPay: () => void;
  onEdit: () => void;
}) {
  const t = useDictionary();
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
  /*
   * Typed at the moment of the change, never held. Suspending somebody takes
   * them off the floor and off the payroll, and a session cookie on an
   * unattended office machine is not evidence that whoever is sitting there
   * meant to do it.
   */
  const [statusPassword, setStatusPassword] = useState("");

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
    <div
      className={cn(
        "rounded-2xl bg-secondary p-4 transition-all",
        suspended && "opacity-60",
        selected && "ring-2 ring-primary",
      )}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onSelect}
          aria-label={fill(t.users.selectPerson, { name: user.full_name })}
          className="mt-1 size-4 shrink-0 rounded border-input"
        />
        <Avatar name={user.full_name} />
        <div className="min-w-0 flex-1">
          {/* Name, employee code and CNIC — all three Latin in every
              language, because a reordered CNIC is a different CNIC. */}
          <p className="truncate text-sm font-bold text-foreground">
            <Latin>{user.full_name}</Latin>
          </p>
          <p className="truncate text-xs text-muted-foreground">
            <Latin>{user.employee_code}</Latin> ·{" "}
            {user.cnic ? (
              <span className="font-mono">
                <Latin>{user.cnic}</Latin>
              </span>
            ) : (
              <span className="font-semibold text-danger">{t.users.noCnic}</span>
            )}
          </p>
          {user.overrides.length > 0 ? (
            <p className="mt-1 text-[11px] font-bold text-primary">
              <Fill
                template={t.users.customAccessCount}
                values={{ count: user.overrides.length }}
              />
            </p>
          ) : null}
        </div>
        {suspended ? (
          <span className="rounded-full bg-danger-soft px-2.5 py-1 text-[10px] font-bold uppercase text-danger">
            {t.status.employment.suspended}
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
          {t.users.editProfile}
        </button>

        {canManageAccess ? (
          <form ref={roleForm} action={formAction} className="flex items-center gap-2">
            <input type="hidden" name="user_id" value={user.id} />
            <input type="hidden" name="role_id" value={roleId} />
            <select
              value={roleId}
              onChange={(event) => setRoleId(event.target.value)}
              aria-label={fill(t.roles.whatCanDo, { role: user.full_name })}
              className="rounded-xl border border-input bg-card px-3 py-2 text-xs font-semibold outline-none focus:border-primary"
            >
              <option value="">{t.users.noRole}</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </form>
        ) : (
          <span className="rounded-full bg-card px-3 py-1.5 text-xs font-bold text-foreground">
            <Latin>{user.roleName}</Latin>
          </span>
        )}

        {canManageAccess && !user.isSuperuser ? (
          <button
            type="button"
            onClick={onTune}
            className="inline-flex items-center gap-1.5 rounded-xl bg-card px-3 py-2 text-xs font-semibold text-foreground transition-all hover:text-primary"
          >
            <KeyRound className="size-3.5" />
            {t.users.customAccess}
          </button>
        ) : null}

        <button
          type="button"
          onClick={onPay}
          className="inline-flex items-center gap-1.5 rounded-xl bg-card px-3 py-2 text-xs font-semibold text-foreground transition-all hover:text-primary"
        >
          <Banknote className="size-3.5" />
          {t.users.payAndDuty}
        </button>

        {/* Attached to the person rather than to a screen: "how many days was
            he absent last month" is a question about him, and the assistant
            can go and look once it knows which "him". */}
        <AskAbout
          variant="icon"
          label={user.full_name}
          context={{
            surface: "person",
            subject: `${user.full_name} (${user.employee_code})`,
            facts: {
              employeeCode: user.employee_code,
              role: user.roleName,
              status: user.status,
              paidAs: user.workerType,
              payClass: user.payClass,
              monthlySalaryRs: user.monthlySalary,
              hourlyRateRs: user.hourlyRate,
              dutyHours: user.dutyHours,
              sundayPolicy: user.sundayPolicy,
              earnsOvertime: user.overtimeEligible,
              attendanceKept: user.requiresAttendance,
            },
          }}
        />

        {canAdminister ? <PasswordReset userId={user.id} name={user.full_name} /> : null}

        {canAdminister ? (
          <button
            type="button"
            disabled={pending || confirmingStatus}
            onClick={() => setConfirmingStatus(true)}
            className="ml-auto rounded-xl px-3 py-2 text-xs font-semibold text-muted-foreground transition-all hover:text-danger disabled:opacity-50"
          >
            {suspended ? t.users.reactivate : t.users.suspend}
          </button>
        ) : null}
      </div>

      {/* Both commitments live below the row so the swipe has full width to
          travel — a short track is easy to complete by accident, which is the
          one thing this control exists to prevent. */}
      {roleChanged ? (
        <div className="mt-3">
          <SwipeToConfirm
            label={fill(t.users.swipeSetRole, { name: user.full_name.split(" ")[0] ?? "" })}
            confirmedLabel={t.users.updatingRole}
            onConfirm={() => roleForm.current?.requestSubmit()}
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">{t.users.signOutWarning}</p>
        </div>
      ) : null}

      {confirmingStatus ? (
        <div className="mt-3 space-y-2">
          <PasswordInput
            value={statusPassword}
            onChange={setStatusPassword}
            autoComplete="current-password"
            placeholder={t.users.confirmWithPassword}
            className="w-full rounded-xl border border-input bg-card px-3 py-2 text-xs outline-none focus:border-primary"
          />
          <p className="text-[11px] text-muted-foreground">{t.users.passwordWhySuspend}</p>
          <SwipeToConfirm
            tone={suspended ? "default" : "danger"}
            label={suspended ? t.users.swipeReactivate : t.users.swipeSuspend}
            confirmedLabel={suspended ? t.users.reactivating : t.users.suspending}
            pending={pending || statusPassword.length === 0}
            onConfirm={() =>
              startTransition(async () => {
                const result = await setUserStatus(
                  user.id,
                  suspended ? "active" : "suspended",
                  statusPassword,
                );
                if (result.ok) {
                  toast.success(result.message);
                  setConfirmingStatus(false);
                  setStatusPassword("");
                } else {
                  toast.error(result.message);
                }
                router.refresh();
              })
            }
          />
          <button
            type="button"
            onClick={() => setConfirmingStatus(false)}
            className="mt-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
          >
            {t.common.cancel}
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
  const t = useDictionary();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  // The operator's own, to prove it is still them. Never held between uses.
  const [mine, setMine] = useState("");
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      const result = await setUserPassword(userId, value, mine);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      // Held until dismissed: once this toast is gone the password is not
      // recoverable, only replaceable.
      toast.success(result.message, { duration: Infinity, closeButton: true });
      setValue("");
      setMine("");
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
        {t.users.setPassword}
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
            placeholder={fill(t.users.newPasswordFor, { name })}
            className="w-full rounded-xl border border-input bg-card px-3 py-2 text-xs outline-none focus:border-primary"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setValue("");
            setMine("");
            setOpen(false);
          }}
          className="rounded-xl px-2 py-2 text-xs font-semibold text-muted-foreground transition-all hover:text-foreground"
        >
          {t.common.cancel}
        </button>
      </div>

      {/* Locking someone out of their own account is worth a deliberate
          gesture, the same as changing their role or their pay. */}
      {value.length >= 8 ? (
        <>
          <PasswordInput
            value={mine}
            onChange={setMine}
            autoComplete="current-password"
            placeholder={t.users.confirmWithPassword}
            className="w-full rounded-xl border border-input bg-card px-3 py-2 text-xs outline-none focus:border-primary"
          />
          <p className="text-[11px] text-muted-foreground">{t.users.passwordWhyReset}</p>
          <SwipeToConfirm
            label={fill(t.users.swipeSetPassword, { name: name.split(" ")[0] ?? "" })}
            confirmedLabel={t.users.settingPassword}
            pending={pending || mine.length === 0}
            onConfirm={save}
          />
        </>
      ) : (
        <p className="text-[11px] text-muted-foreground">{t.users.atLeast8}</p>
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
  const t = useDictionary();
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
            <h2 className="text-lg font-bold tracking-tight text-foreground">{t.users.addTitle}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t.users.addHint}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <form action={formAction} className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.users.fullName}>
              <input
                name="full_name"
                required
                className={INPUT}
                placeholder={t.users.fullNamePlaceholder}
              />
            </Field>
            <Field label={t.users.employeeCode}>
              <input name="employee_code" required className={INPUT} placeholder="RD-1043" />
            </Field>
            <Field label={t.users.cnic}>
              <CnicInput required className={INPUT} />
            </Field>
            <Field label={t.users.tempPassword}>
              <PasswordInput
                autoComplete="new-password"
                required
                minLength={8}
                placeholder={t.users.passwordPlaceholder}
                className={INPUT}
              />
            </Field>
            <Field label={t.users.email}>
              <input name="email" type="email" className={INPUT} placeholder="name@radoflow.test" />
            </Field>
            <Field label={t.users.phone}>
              <input name="phone" type="tel" className={INPUT} placeholder="+92 300 1234567" />
            </Field>
            <Field label={t.users.designation}>
              <input
                name="designation"
                className={INPUT}
                placeholder={t.users.designationPlaceholder}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {canManageAccess ? (
              <Field label={t.users.role}>
                <select name="role_id" defaultValue="" className={INPUT}>
                  <option value="">{t.users.noRole}</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field label={t.users.role}>
                <p className="rounded-xl bg-secondary px-3 py-2.5 text-xs text-muted-foreground">
                  {t.users.roleAssignedElsewhere}
                </p>
              </Field>
            )}
            <Field label={t.common.site}>
              <select name="site_id" defaultValue="" className={INPUT}>
                <option value="">{t.common.unassigned}</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t.common.department}>
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
                <option value="">{t.common.unassigned}</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {/* The department name is a row; only the marker that it
                        is a contracted one is interface text. */}
                    {d.defaultWorkerType === "contractor"
                      ? fill(t.users.contractorDepartment, { name: d.name })
                      : d.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t.users.shift}>
              <select name="shift_id" defaultValue="" className={INPUT}>
                <option value="">{t.users.noShift}</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">{t.users.noShiftHint}</p>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label={t.users.paidAs}>
              <select
                name="worker_type"
                value={workerType}
                onChange={(event) => setWorkerType(event.target.value as "employee" | "contractor")}
                className={INPUT}
              >
                <option value="employee">{t.status.workerType.employee}</option>
                <option value="contractor">{t.users.contractorFlat}</option>
              </select>
            </Field>
            <Field label={t.users.salaryCovers}>
              <select
                name="duty_hours"
                defaultValue="8"
                disabled={isContractor}
                className={cn(INPUT, isContractor && "opacity-50")}
              >
                <option value="8">{t.users.hours8Overtime}</option>
                <option value="12">{t.users.hours12NoOvertime}</option>
              </select>
            </Field>
            <Field label={t.users.sunday}>
              <select
                name="sunday_policy"
                defaultValue="off"
                disabled={isContractor}
                className={cn(INPUT, isContractor && "opacity-50")}
              >
                <option value="off">{t.status.sundayPolicy.off}</option>
                <option value="optional">{t.status.sundayPolicy.optional}</option>
                <option value="compulsory">{t.status.sundayPolicy.compulsory}</option>
              </select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.users.payType}>
              <select
                name="pay_class"
                value={payClass}
                onChange={(e) => setPayClass(e.target.value)}
                className={INPUT}
              >
                <option value="hourly">{t.users.hourlyWage}</option>
                <option value="monthly">{t.users.monthlySalaryOption}</option>
              </select>
            </Field>
            {payClass === "monthly" ? (
              <Field label={t.users.monthlySalaryField}>
                <input
                  name="monthly_salary"
                  type="number"
                  min="0"
                  defaultValue={0}
                  className={INPUT}
                />
              </Field>
            ) : (
              <Field label={t.users.hourlyRateField}>
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

          <Field label={t.users.tracking}>
            <select name="tracking" defaultValue="tracked" className={INPUT}>
              <option value="tracked">{t.users.trackingTracked}</option>
              <option value="salary_only">{t.users.trackingSalaryOnly}</option>
              <option value="exempt">{t.users.trackingExempt}</option>
            </select>
            <p className="mt-1 text-xs text-muted-foreground">{t.users.trackingHint}</p>
          </Field>

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
  const t = useDictionary();
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
              <Fill template={t.users.editTitle} values={{ name: user.full_name }} />
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{t.users.editHint}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <form action={formAction} className="mt-5 space-y-4">
          <input type="hidden" name="user_id" value={user.id} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.users.fullName}>
              <input
                name="full_name"
                required
                defaultValue={user.full_name}
                className={INPUT}
                placeholder={t.users.fullNamePlaceholder}
              />
            </Field>
            <Field label={t.users.employeeCode}>
              <input
                name="employee_code"
                required
                defaultValue={user.employee_code}
                className={INPUT}
                placeholder="RD-1043"
              />
            </Field>
            <Field label={t.users.cnic}>
              <CnicInput defaultValue={user.cnic ?? ""} className={INPUT} />
            </Field>
            <Field label={t.users.email}>
              <input
                name="email"
                type="email"
                defaultValue={user.email ?? ""}
                className={INPUT}
                placeholder="name@radoflow.test"
              />
            </Field>
            <Field label={t.users.phone}>
              <input
                name="phone"
                type="tel"
                defaultValue={user.phone ?? ""}
                className={INPUT}
                placeholder="+92 300 1234567"
              />
            </Field>
            <Field label={t.users.designation}>
              <input
                name="designation"
                defaultValue={user.designation ?? ""}
                className={INPUT}
                placeholder={t.users.designationPlaceholder}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t.common.site}>
              <select name="site_id" defaultValue={user.siteId ?? ""} className={INPUT}>
                <option value="">{t.common.unassigned}</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t.common.department}>
              <select name="department_id" defaultValue={user.departmentId ?? ""} className={INPUT}>
                <option value="">{t.common.unassigned}</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t.users.shift}>
              <select name="shift_id" defaultValue={user.shiftId ?? ""} className={INPUT}>
                <option value="">{t.users.noShift}</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">{t.users.noShiftHint}</p>
            </Field>
          </div>

          <SaveProfileButton />
        </form>
      </div>
    </div>
  );
}

function SaveProfileButton() {
  const t = useDictionary();
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-[0_10px_24px_rgb(239_86_25/0.25)] transition-all hover:-translate-y-0.5 disabled:opacity-60"
    >
      {pending ? t.common.saving : t.users.saveChanges}
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
  const t = useDictionary();
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
              <Fill template={t.users.accessTitle} values={{ name: user.full_name }} />
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              <Fill template={t.users.accessHint} values={{ role: user.roleName }} />
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-5 space-y-5">
          {Object.entries(byModule).map(([module, items]) => (
            <div key={module}>
              {/* Module and capability names come out of the permission
                  catalogue, so they are data rather than interface text. */}
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                <Latin>{module}</Latin>
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
                        <Latin>{permission.label}</Latin>
                      </span>
                      <div className="flex shrink-0 gap-1">
                        {(["grant", "role", "deny"] as const).map((option) => (
                          <button
                            key={option}
                            type="button"
                            disabled={pending}
                            onClick={() => set(permission.id, option === "role" ? "clear" : option)}
                            className={cn(
                              "rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-all disabled:opacity-50",
                              effect === option
                                ? option === "grant"
                                  ? "bg-success text-white"
                                  : option === "deny"
                                    ? "bg-danger text-white"
                                    : "bg-charcoal text-charcoal-foreground"
                                : "bg-card text-muted-foreground",
                            )}
                          >
                            {option === "grant"
                              ? t.users.grant
                              : option === "deny"
                                ? t.users.deny
                                : t.users.useRole}
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
  const t = useDictionary();
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 text-sm font-bold text-primary-foreground shadow-[0_12px_30px_rgb(239_86_25/0.28)] transition-all hover:-translate-y-0.5 disabled:opacity-60"
    >
      <UserPlus className="size-4" />
      {pending ? t.roles.creating : t.users.createUser}
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
  title: React.ReactNode;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const t = useDictionary();

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-charcoal/40 p-3 backdrop-blur-sm sm:items-center">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-card p-6 shadow-[0_18px_40px_rgb(0_0_0/0.18)]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 className="text-lg font-bold tracking-tight text-foreground">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
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
  const t = useDictionary();
  const [state, formAction] = useActionState(updateUserPay, INITIAL);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);

  const [approverId, setApproverId] = useState("");
  const [workerType, setWorkerType] = useState(user.workerType);
  const [dutyHours, setDutyHours] = useState(String(user.dutyHours));
  const [salary, setSalary] = useState(String(user.monthlySalary));

  /*
   * Controlled, because the duty select can force it: "no attendance needed"
   * and `salary_only` are one arrangement said two ways, and two controls free
   * to disagree would let the form submit a contradiction.
   */
  const [tracking, setTracking] = useState(
    trackingValueOf({
      requires_attendance: user.requiresAttendance,
      payroll_exempt: user.payrollExempt,
    }),
  );

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
  const noAttendance = dutyHours === "none";
  const rates = deriveRates(monthly, noAttendance ? 8 : Number(dutyHours) || 8);
  const daysThisMonth = rates.daysInMonth;
  const perDay = rates.perDay;
  const perOtHour = rates.perOvertimeHour;
  const money = (value: number) =>
    value.toLocaleString("en-PK", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

  return (
    <Dialog
      title={<Fill template={t.users.payTitle} values={{ name: user.full_name }} />}
      onClose={onClose}
    >
      <form ref={form} action={formAction} className="space-y-4">
        <input type="hidden" name="user_id" value={user.id} />
        <input type="hidden" name="approver_id" value={approverId} readOnly />

        <div>
          <label className="text-sm font-semibold text-foreground">{t.users.paidAs}</label>
          <select
            name="worker_type"
            value={workerType}
            onChange={(event) => setWorkerType(event.target.value as UserRow["workerType"])}
            className={INPUT}
          >
            <option value="employee">{t.users.employeeFromAttendance}</option>
            <option value="contractor">{t.users.contractorFlat}</option>
          </select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-foreground">
              {isContractor ? t.users.agreedAmountPkr : t.users.monthlySalaryPkr}
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
            <label className="text-sm font-semibold text-foreground">{t.users.hourlyRatePkr}</label>
            <input
              name="hourly_rate"
              type="number"
              min={0}
              step="0.01"
              defaultValue={user.hourlyRate}
              className={INPUT}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">{t.users.hourlyOnlyHint}</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-foreground">{t.users.payClass}</label>
            <select name="pay_class" defaultValue={user.payClass} className={INPUT}>
              <option value="monthly">{t.status.payClass.monthly}</option>
              <option value="hourly">{t.status.payClass.hourly}</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-foreground">{t.users.salaryCovers}</label>
            <select
              name="duty_hours"
              value={dutyHours}
              onChange={(event) => setDutyHours(event.target.value)}
              disabled={isContractor}
              className={cn(INPUT, isContractor && "opacity-50")}
            >
              <option value="8">{t.users.hours8Overtime}</option>
              <option value="12">{t.users.hours12NoOvertime}</option>
              <option value="none">{t.users.noAttendanceNeeded}</option>
            </select>
          </div>
        </div>

        <div>
          <label className="text-sm font-semibold text-foreground">{t.users.sunday}</label>
          <select
            name="sunday_policy"
            defaultValue={user.sundayPolicy}
            disabled={isContractor}
            className={cn(INPUT, isContractor && "opacity-50")}
          >
            <option value="off">{t.users.sundayOff}</option>
            <option value="optional">{t.users.sundayOptional}</option>
            <option value="compulsory">{t.users.sundayCompulsory}</option>
            <option value="adjust_in_leave">{t.users.sundayAdjust}</option>
          </select>
          <p className="mt-1 text-[11px] text-muted-foreground">{t.users.sundayHint}</p>
        </div>

        <div>
          <label className="text-sm font-semibold text-foreground">{t.users.tracking}</label>
          <select
            name="tracking"
            value={noAttendance ? "salary_only" : tracking}
            onChange={(event) => setTracking(event.target.value as TrackingChoice)}
            disabled={noAttendance}
            className={cn(INPUT, noAttendance && "opacity-50")}
          >
            <option value="tracked">{t.users.trackingTracked}</option>
            <option value="salary_only">{t.users.trackingSalaryOnly}</option>
            <option value="exempt">{t.users.trackingExempt}</option>
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            {noAttendance ? t.users.noAttendanceHint : t.users.trackingHint}
          </p>
        </div>

        <div className="space-y-2.5">
          <label className="flex items-start gap-2.5 text-sm font-semibold text-foreground">
            <input
              type="checkbox"
              name="overtime_eligible"
              defaultChecked={user.overtimeEligible}
              className="mt-0.5 size-4 rounded border-input"
            />
            <span>
              {t.users.earnsOvertime}
              <span className="block text-xs font-normal text-muted-foreground">
                {t.users.earnsOvertimeHint}
              </span>
            </span>
          </label>
        </div>

        {isContractor ? (
          <p className="rounded-2xl bg-warning-soft px-4 py-3 text-xs text-warning">
            {t.users.contractorNote}
          </p>
        ) : monthly > 0 ? (
          <div className="rounded-2xl bg-secondary px-4 py-3 text-xs text-muted-foreground">
            {/* Each line is one template with its figures as slots: Urdu
                puts the amount and the division the other way round. */}
            <p>
              <Fill
                template={t.users.perDayLine}
                values={{
                  amount: `Rs ${money(perDay)}`,
                  salary: money(monthly),
                  days: daysThisMonth,
                }}
              />
            </p>
            <p className="mt-1">
              <Fill
                template={t.users.perOvertimeHourLine}
                values={{ amount: `Rs ${money(perOtHour)}` }}
              />
            </p>
            {/* The hour and the minute, because that is the granularity
                every argument about this salary is actually had at. */}
            <p className="mt-1">
              <Fill
                template={t.users.perHourLine}
                values={{
                  perHour: `Rs ${money(rates.perHour)}`,
                  perMinute: `Rs ${rates.perMinute.toFixed(2)}`,
                }}
              />
            </p>
            <p className="mt-1 opacity-80">
              <Fill
                template={t.users.overtimeBoundary}
                values={{ hours: noAttendance ? 8 : dutyHours }}
              />
            </p>
          </div>
        ) : null}

        <ApproverPicker value={approverId} onChange={setApproverId} />

        <SwipeToConfirm
          label={t.users.swipeSavePay}
          confirmedLabel={t.common.saving}
          onConfirm={() => form.current?.requestSubmit()}
        />
      </form>

      <div className="mt-6 border-t border-border pt-5">
        <p className="text-sm font-bold text-foreground">{t.users.componentsTitle}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{t.users.componentsHint}</p>

        {user.components.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {user.components.map((component) => (
              <li
                key={component.id}
                className="flex items-center gap-3 rounded-2xl bg-secondary px-4 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    <Latin>{component.label}</Latin>
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    <Fill
                      template={
                        component.effectiveTo ? t.users.componentFromTo : t.users.componentOngoing
                      }
                      values={{
                        from: component.effectiveFrom,
                        to: component.effectiveTo ?? "",
                      }}
                    />
                  </p>
                </div>
                <span
                  className={cn(
                    "text-sm font-bold",
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
                  className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:text-danger disabled:opacity-50"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 rounded-2xl bg-secondary px-4 py-3 text-xs text-muted-foreground">
            {t.users.nothingAttached}
          </p>
        )}

        <AddComponentForm userId={user.id} />
      </div>
    </Dialog>
  );
}

/** Attaches one recurring line — an advance being recovered, a bonus — to a person. */
function AddComponentForm({ userId }: { userId: string }) {
  const t = useDictionary();
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
          onConfirm={submit}
        />
      ) : (
        <p className="text-[11px] text-muted-foreground">{t.users.needNameAndAmount}</p>
      )}
    </form>
  );
}
