"use client";

import { useActionState, useEffect, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Check, Lock, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Card, SectionTitle } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { createRole, deleteRole, toggleRolePermission, type RoleResult } from "./actions";

const INITIAL: RoleResult = { ok: false, message: "" };

export interface RoleRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  is_system: boolean;
  is_superuser: boolean;
  holders: number;
  permissionIds: string[];
}

export interface PermissionRow {
  id: string;
  key: string;
  module: string;
  label: string;
  description: string | null;
}

export function RolesManager({
  roles,
  permissions,
}: {
  roles: RoleRow[];
  permissions: PermissionRow[];
}) {
  const [state, formAction] = useActionState(createRole, INITIAL);
  const [selectedId, setSelectedId] = useState(roles[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (!state.message) return;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
    router.refresh();
  }, [state, router]);

  const selected = roles.find((r) => r.id === selectedId) ?? roles[0] ?? null;

  const byModule = permissions.reduce<Record<string, PermissionRow[]>>((acc, p) => {
    (acc[p.module] ??= []).push(p);
    return acc;
  }, {});

  function remove(roleId: string) {
    startTransition(async () => {
      const result = await deleteRole(roleId);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <Card className="p-4 sm:p-6">
        <SectionTitle
          icon={ShieldCheck}
          title="Roles"
          subtitle="Pick a role to change what it can do, or create a new one"
        />

        <div className="flex flex-wrap gap-2">
          {roles.map((role) => (
            <button
              key={role.id}
              type="button"
              onClick={() => setSelectedId(role.id)}
              className={cn(
                "rounded-2xl px-4 py-3 text-left transition-all duration-300",
                selected?.id === role.id
                  ? "bg-primary text-primary-foreground shadow-[0_10px_24px_rgb(239_86_25/0.25)]"
                  : "bg-secondary text-foreground hover:bg-primary-soft",
              )}
            >
              <span className="flex items-center gap-2 text-sm font-bold">
                {role.is_superuser ? <Lock className="size-3.5" /> : null}
                {role.name}
              </span>
              <span
                className={cn(
                  "text-xs",
                  selected?.id === role.id ? "opacity-80" : "text-muted-foreground",
                )}
              >
                {role.is_superuser ? "Unrestricted" : `${role.permissionIds.length} capabilities`} ·{" "}
                {role.holders} {role.holders === 1 ? "person" : "people"}
              </span>
            </button>
          ))}
        </div>

        <form
          action={formAction}
          className="mt-5 grid gap-3 rounded-2xl bg-secondary p-4 sm:grid-cols-[2fr_3fr_auto]"
        >
          <div>
            <label className="text-xs font-semibold text-muted-foreground">New role name</label>
            <input
              name="name"
              required
              placeholder="Payroll Officer"
              className="mt-1 w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">What it is for</label>
            <input
              name="description"
              placeholder="Runs payroll but cannot change access"
              className="mt-1 w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="flex items-end">
            <CreateButton />
          </div>
        </form>
      </Card>

      {selected ? (
        <Card className="p-4 sm:p-6">
          <SectionTitle
            icon={Check}
            title={`What ${selected.name} can do`}
            subtitle={
              selected.is_superuser
                ? "This role holds every capability and cannot be restricted"
                : "Tap a capability to grant or remove it — the change applies immediately"
            }
            action={
              !selected.is_system ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => remove(selected.id)}
                  className="inline-flex items-center gap-2 rounded-xl bg-danger-soft px-4 py-2.5 text-sm font-semibold text-danger transition-all hover:-translate-y-0.5 disabled:opacity-50"
                >
                  <Trash2 className="size-4" />
                  Delete role
                </button>
              ) : null
            }
          />

          {selected.is_superuser ? (
            <p className="rounded-2xl bg-primary-soft p-4 text-sm font-semibold text-primary">
              {selected.name} is an unrestricted role. Every capability is granted implicitly, so it
              can never be locked out of this screen by an accidental edit.
            </p>
          ) : (
            <PermissionGrid
              key={selected.id}
              roleId={selected.id}
              granted={selected.permissionIds}
              byModule={byModule}
            />
          )}
        </Card>
      ) : null}
    </div>
  );
}

/**
 * The capability toggles for one role.
 *
 * Uses an optimistic set rather than reading straight from props: the props
 * only update after the server action and a router refresh, so tapping two
 * pills quickly would compute the second click against stale state and send a
 * revoke where a grant was meant. Keyed by role id so switching roles resets
 * cleanly.
 */
function PermissionGrid({
  roleId,
  granted,
  byModule,
}: {
  roleId: string;
  granted: string[];
  byModule: Record<string, PermissionRow[]>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [optimistic, applyOptimistic] = useOptimistic(
    granted,
    (current: string[], change: { id: string; grant: boolean }) =>
      change.grant ? [...current, change.id] : current.filter((id) => id !== change.id),
  );

  function toggle(permissionId: string, grant: boolean) {
    startTransition(async () => {
      applyOptimistic({ id: permissionId, grant });
      const result = await toggleRolePermission(roleId, permissionId, grant);
      if (!result.ok) toast.error(result.message);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {Object.entries(byModule).map(([module, items]) => (
        <div key={module}>
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            {module}
          </p>
          <div className="flex flex-wrap gap-2">
            {items.map((permission) => {
              const on = optimistic.includes(permission.id);
              return (
                <button
                  key={permission.id}
                  type="button"
                  aria-pressed={on}
                  title={permission.description ?? undefined}
                  onClick={() => toggle(permission.id, !on)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-semibold transition-all duration-300 hover:-translate-y-0.5",
                    on
                      ? "bg-primary text-primary-foreground shadow-[0_10px_24px_rgb(239_86_25/0.25)]"
                      : "bg-secondary text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-4 w-7 items-center rounded-full p-0.5 transition-all",
                      on ? "bg-primary-foreground/40" : "bg-muted",
                    )}
                  >
                    <span
                      className={cn(
                        "size-3 rounded-full bg-card transition-all",
                        on && "translate-x-3",
                      )}
                    />
                  </span>
                  {permission.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function CreateButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-[46px] items-center gap-2 rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground shadow-[0_10px_24px_rgb(239_86_25/0.25)] transition-all hover:-translate-y-0.5 disabled:opacity-60"
    >
      <Plus className="size-4" />
      {pending ? "Creating…" : "Create role"}
    </button>
  );
}
