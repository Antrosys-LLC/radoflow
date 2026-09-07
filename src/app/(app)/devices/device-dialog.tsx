"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Save, X } from "lucide-react";
import { toast } from "sonner";

import { Fill } from "@/components/fill";
import { useDictionary } from "@/components/language-provider";
import { Latin } from "@/components/latin";
import { cn } from "@/lib/utils";

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
  const t = useDictionary();
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
                  {device?.id ? (
                    t.devices.editTerminal
                  ) : (
                    // The manufacturer is a name, so it is a slot rather than
                    // words in the heading.
                    <Fill template={t.devices.addTerminalTitle} values={{ brand: BRAND }} />
                  )}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">{t.devices.dialogHint}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t.common.close}
                className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground transition-all hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <form action={formAction} className="mt-5 space-y-4">
              {device?.id ? <input type="hidden" name="id" value={device.id} /> : null}

              <Field label={t.devices.terminalName} hint={t.devices.terminalNameHint}>
                <input
                  name="name"
                  required
                  defaultValue={device?.name ?? ""}
                  className={INPUT}
                  placeholder={t.devices.terminalNamePlaceholder}
                />
              </Field>

              <Field label={t.common.site}>
                <select
                  name="site_id"
                  required
                  defaultValue={device?.site_id ?? ""}
                  className={INPUT}
                >
                  <option value="" disabled>
                    {t.devices.chooseFactory}
                  </option>
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                {/* The hint is a path on the terminal's own screen — read off
                    the device in English whatever the reader's language, so it
                    is wrapped rather than keyed. */}
                <Field label={t.devices.serialNumber} hint={<Latin>Menu → System Info</Latin>}>
                  <input
                    name="serial_number"
                    required
                    defaultValue={device?.serial_number ?? ""}
                    className={LATIN_INPUT}
                    placeholder="K50-DYE-0001"
                  />
                </Field>
                <Field label={t.devices.model}>
                  <input
                    name="model"
                    defaultValue={device?.model ?? DEFAULT_MODEL}
                    className={LATIN_INPUT}
                  />
                </Field>
              </div>

              <Field label={t.devices.connectionMode}>
                <select name="mode" defaultValue={device?.mode ?? "push"} className={INPUT}>
                  {/* Instructions rather than the enum's labels — the labels
                      are `status.deviceMode`, and they are what the card and
                      the terminal's own page show. */}
                  <option value="push">{t.devices.modePushOption}</option>
                  <option value="pull">{t.devices.modePullOption}</option>
                </select>
              </Field>

              <Field label={t.devices.records} hint={t.devices.recordsHint}>
                <select
                  name="purpose"
                  defaultValue={device?.purpose ?? "attendance"}
                  className={INPUT}
                >
                  <option value="attendance">{t.devices.purposeAttendanceOption}</option>
                  <option value="canteen">{t.devices.purposeCanteenOption}</option>
                </select>
              </Field>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <Field label={t.devices.ipAddress} hint={t.devices.ipAddressHint}>
                    <input
                      name="ip_address"
                      // Postgres `inet` surfaces as unknown in the generated types.
                      defaultValue={device?.ip_address ? String(device.ip_address) : ""}
                      className={LATIN_INPUT}
                      placeholder="192.168.1.201"
                    />
                  </Field>
                </div>
                <Field label={t.devices.port}>
                  <input
                    name="port"
                    type="number"
                    defaultValue={device?.port ?? 4370}
                    className={LATIN_INPUT}
                  />
                </Field>
              </div>

              {/* `COMM KEY` is printed on the terminal's own menu, so the label
                  itself is not translated — only the sentence under it, whose
                  slot is another on-device path. */}
              <Field
                label={<Latin>COMM KEY</Latin>}
                hint={
                  <Fill
                    template={t.devices.commKeyHint}
                    values={{ menu: "Menu → Comm → Security" }}
                  />
                }
              >
                <input
                  name="comm_key"
                  defaultValue={device?.comm_key ?? ""}
                  className={LATIN_INPUT}
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
                  {t.devices.activeLabel}
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

/** The manufacturer and the model it sells — names, Latin in every language. */
const BRAND = "ZKTeco";
const DEFAULT_MODEL = "ZKTeco K50";

const INPUT =
  "w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/30";

/**
 * The five fields that hold nothing but hardware identity — a serial number, a
 * model name, an IP address, a port and a comm key. They are set in the Latin
 * face for the same reason `<Latin>` exists, which a form control cannot be
 * wrapped in. The terminal name is deliberately not here: it is free text the
 * office types, and it may well be typed in Urdu.
 */
const LATIN_INPUT = cn(INPUT, "font-latin");

function Field({
  label,
  hint,
  children,
}: {
  // ReactNode rather than string: a label can be a name printed on the
  // terminal and a hint can carry one, and both have to stay Latin.
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
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
  const t = useDictionary();
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 text-sm font-bold text-primary-foreground shadow-[0_12px_30px_rgb(239_86_25/0.28)] transition-all hover:-translate-y-0.5 disabled:opacity-60"
    >
      <Save className="size-4" />
      {pending ? t.common.saving : t.devices.saveTerminal}
    </button>
  );
}
