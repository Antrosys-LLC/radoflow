"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Save, X } from "lucide-react";
import { toast } from "sonner";

import { saveDevice, type ActionResult } from "./actions";

const INITIAL: ActionResult = { ok: false, message: "" };

/**
 * Mirrors the devices row loosely: most columns are nullable in the database,
 * and the form treats a null the same as an empty field.
 */
export interface DeviceFormValues {
  id?: string;
  name?: string | null;
  site_id?: string | null;
  serial_number?: string | null;
  model?: string | null;
  mode?: string | null;
  purpose?: string | null;
  ip_address?: unknown;
  port?: number | null;
  comm_key?: string | null;
  is_active?: boolean | null;
}

export function DeviceDialog({
  sites,
  trigger,
  device,
}: {
  sites: { id: string; name: string }[];
  trigger: ReactNode;
  device?: DeviceFormValues;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(saveDevice, INITIAL);

  useEffect(() => {
    if (!state.message) return;
    if (state.ok) {
      toast.success(state.message);
      // Closing on success can only happen once the server action has replied,
      // so reacting to that result in an effect is the intended flow here.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(false);
    } else {
      toast.error(state.message);
    }
  }, [state]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="cursor-pointer">
        {trigger}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-charcoal/40 p-3 backdrop-blur-sm sm:items-center">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-card p-6 shadow-[0_18px_40px_rgb(0_0_0/0.18)]">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold tracking-tight text-foreground">
                  {device?.id ? "Edit terminal" : "Add ZKTeco terminal"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Push mode is recommended: the terminal uploads to this server, so nothing has to
                  reach into the factory network.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground transition-all hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <form action={formAction} className="mt-5 space-y-4">
              {device?.id ? <input type="hidden" name="id" value={device.id} /> : null}

              <Field label="Terminal name" hint="e.g. Dyeing — main gate">
                <input
                  name="name"
                  required
                  defaultValue={device?.name ?? ""}
                  className={INPUT}
                  placeholder="Dyeing — main gate"
                />
              </Field>

              <Field label="Factory">
                <select
                  name="site_id"
                  required
                  defaultValue={device?.site_id ?? ""}
                  className={INPUT}
                >
                  <option value="" disabled>
                    Choose a factory
                  </option>
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Serial number" hint="Menu → System Info">
                  <input
                    name="serial_number"
                    required
                    defaultValue={device?.serial_number ?? ""}
                    className={INPUT}
                    placeholder="K50-DYE-0001"
                  />
                </Field>
                <Field label="Model">
                  <input
                    name="model"
                    defaultValue={device?.model ?? "ZKTeco K50"}
                    className={INPUT}
                  />
                </Field>
              </div>

              <Field label="Connection mode">
                <select name="mode" defaultValue={device?.mode ?? "push"} className={INPUT}>
                  <option value="push">Push — terminal uploads to us (recommended)</option>
                  <option value="pull">Pull — we connect to the terminal over TCP</option>
                </select>
              </Field>

              <Field
                label="What this terminal records"
                hint="A canteen scan is a meal, never a clock-in — nobody is paid for eating."
              >
                <select
                  name="purpose"
                  defaultValue={device?.purpose ?? "attendance"}
                  className={INPUT}
                >
                  <option value="attendance">Attendance — clock in and out</option>
                  <option value="canteen">Canteen — one meal per person per serving</option>
                </select>
              </Field>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <Field label="IP address" hint="Needed for pull mode and Test connection">
                    <input
                      name="ip_address"
                      // Postgres `inet` surfaces as unknown in the generated types.
                      defaultValue={device?.ip_address ? String(device.ip_address) : ""}
                      className={INPUT}
                      placeholder="192.168.1.201"
                    />
                  </Field>
                </div>
                <Field label="Port">
                  <input
                    name="port"
                    type="number"
                    defaultValue={device?.port ?? 4370}
                    className={INPUT}
                  />
                </Field>
              </div>

              <Field label="COMM KEY" hint="Menu → Comm → Security. Leave blank if unset.">
                <input
                  name="comm_key"
                  defaultValue={device?.comm_key ?? ""}
                  className={INPUT}
                  placeholder="0"
                />
              </Field>

              <label className="flex items-center gap-3 rounded-2xl bg-secondary px-4 py-3">
                <input
                  type="checkbox"
                  name="is_active"
                  defaultChecked={device?.is_active ?? true}
                  className="size-5 accent-[var(--primary)]"
                />
                <span className="text-sm font-semibold text-foreground">
                  Active — accept punches from this terminal
                </span>
              </label>

              <SubmitButton />
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

const INPUT =
  "w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/30";

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-foreground">{label}</label>
      {hint ? (
        <p className="mb-1.5 mt-0.5 text-xs text-muted-foreground">{hint}</p>
      ) : (
        <div className="h-1.5" />
      )}
      {children}
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 text-sm font-bold text-primary-foreground shadow-[0_12px_30px_rgb(239_86_25/0.28)] transition-all hover:-translate-y-0.5 disabled:opacity-60"
    >
      <Save className="size-4" />
      {pending ? "Saving…" : "Save terminal"}
    </button>
  );
}
