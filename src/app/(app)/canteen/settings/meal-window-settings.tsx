"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { AlertTriangle, Clock, Fingerprint, Moon, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Fill } from "@/components/fill";
import { useDictionary } from "@/components/language-provider";
import { Latin } from "@/components/latin";
import { Card, SectionTitle } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

import { deleteMealWindow, saveMealWindow, type MealWindowResult } from "./actions";

/**
 * Serving times, and which terminals feed them.
 *
 * The terminal half is read-only here on purpose: a device is configured on
 * the Devices screen, and duplicating that form would give two places to
 * change one thing. What this shows is the consequence — whether any
 * terminal is actually pointed at the canteen, which is the single most
 * common reason the counter screen would sit dark all lunchtime.
 *
 * Every serving time, factory and terminal name on this screen comes out of a
 * row, so all of them are wrapped rather than translated. The times are the
 * point: `12:00 – 15:00` reordered on a right-to-left page would tell the
 * office the counter opens at three and closes at noon.
 */

const INITIAL: MealWindowResult = { ok: false, message: "" };

const INPUT =
  "mt-1 w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/30";

/**
 * The three fields that hold nothing but digits — two clock times and a sort
 * position. They are stated left-to-right and set in the Latin face for the
 * same reason `<Latin>` exists, which a form control cannot be wrapped in.
 * The name field is deliberately not here: it is free text the office types,
 * and it may well be typed in Urdu.
 */
const NUMERIC_INPUT = cn(INPUT, "font-latin");

export interface MealWindowRow {
  id: string;
  siteId: string;
  code: string;
  name: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  sortOrder: number;
}

export interface TerminalRow {
  id: string;
  name: string;
  siteId: string;
  purpose: "attendance" | "canteen";
  isActive: boolean;
}

/** A window written to run past midnight, e.g. a night shift's 22:00–02:00. */
function crossesMidnight(row: { startsAt: string; endsAt: string }): boolean {
  return row.endsAt < row.startsAt;
}

export function MealWindowSettings({
  sites,
  windows,
  terminals,
}: {
  sites: { id: string; name: string }[];
  windows: MealWindowRow[];
  terminals: TerminalRow[];
}) {
  const t = useDictionary();
  const [editing, setEditing] = useState<MealWindowRow | null>(null);
  const [adding, setAdding] = useState(false);

  const siteName = new Map(sites.map((s) => [s.id, s.name]));
  const canteenTerminals = terminals.filter((terminal) => terminal.purpose === "canteen");
  const activeWindows = windows.filter((w) => w.isActive);

  return (
    <div className="space-y-5 pb-6">
      {/* The two ways this silently does nothing, said plainly and up front —
          both are configuration gaps rather than faults, and neither shows up
          as an error anywhere. */}
      {canteenTerminals.length === 0 || activeWindows.length === 0 ? (
        <div className="flex items-start gap-3 rounded-3xl bg-warning-soft px-5 py-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
          <div className="text-sm text-foreground">
            <p className="font-bold">{t.canteenSettings.counterInactive}</p>
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              {canteenTerminals.length === 0 ? (
                <li>
                  {/* The sentence and the link are two strings rather than one
                      with markup buried in it: a translation has to be free to
                      put the link at either end, and a `<Fill>` slot renders
                      through `<Latin>`, which is wrong for translated words. */}
                  {t.canteenSettings.noCanteenTerminal}{" "}
                  <Link href="/devices" className="font-semibold text-primary underline">
                    {t.canteenSettings.setOneOnDevices}
                  </Link>
                </li>
              ) : null}
              {activeWindows.length === 0 ? <li>{t.canteenSettings.noServingSwitchedOn}</li> : null}
            </ul>
          </div>
        </div>
      ) : null}

      <Card className="p-4 sm:p-6">
        <SectionTitle
          icon={Clock}
          title={
            <>
              {t.canteenSettings.servingTimes} · <Latin>{windows.length}</Latin>
            </>
          }
          subtitle={t.canteenSettings.servingTimesHint}
          action={
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-[0_10px_24px_rgb(239_86_25/0.25)] transition-all hover:-translate-y-0.5"
            >
              <Plus className="size-4" />
              {t.canteenSettings.addServing}
            </button>
          }
        />

        {windows.length === 0 ? (
          <div className="rounded-2xl bg-secondary p-8 text-center">
            <p className="text-sm font-semibold text-foreground">
              {t.canteenSettings.noServingsYet}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{t.canteenSettings.noServingsHint}</p>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {windows.map((row) => (
              <WindowCard
                key={row.id}
                row={row}
                siteName={siteName.get(row.siteId) ?? t.common.unassigned}
                onEdit={() => setEditing(row)}
              />
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4 sm:p-6">
        <SectionTitle
          icon={Fingerprint}
          title={t.canteenSettings.terminals}
          subtitle={t.canteenSettings.terminalsHint}
        />

        {canteenTerminals.length === 0 ? (
          <p className="rounded-2xl bg-secondary px-4 py-6 text-center text-sm text-muted-foreground">
            {t.canteenSettings.noTerminalScanning}
          </p>
        ) : (
          <div className="space-y-2">
            {canteenTerminals.map((terminal) => (
              <div
                key={terminal.id}
                className="flex items-center gap-3 rounded-2xl bg-secondary px-4 py-3"
              >
                <Fingerprint className="size-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  {/* A terminal's name and its factory's are names, so they are
                      wrapped in every language, never translated. */}
                  <p className="truncate text-sm font-bold text-foreground">
                    <Latin>{terminal.name}</Latin>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <Latin>{siteName.get(terminal.siteId) ?? t.common.unassigned}</Latin>
                  </p>
                </div>
                {!terminal.isActive ? (
                  <span className="rounded-full bg-danger-soft px-2.5 py-1 text-[10px] font-bold uppercase text-danger">
                    {t.canteenSettings.inactive}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      {adding ? <WindowDialog sites={sites} onClose={() => setAdding(false)} /> : null}
      {editing ? (
        <WindowDialog sites={sites} row={editing} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  );
}

function WindowCard({
  row,
  siteName,
  onEdit,
}: {
  row: MealWindowRow;
  siteName: string;
  onEdit: () => void;
}) {
  const t = useDictionary();
  const overnight = crossesMidnight(row);

  return (
    <div className={cn("rounded-2xl bg-secondary p-4", !row.isActive && "opacity-60")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-foreground">
            <Latin>{row.name}</Latin>
          </p>
          <p className="text-xs text-muted-foreground">
            <Latin>{siteName}</Latin>
          </p>
        </div>
        {!row.isActive ? (
          <span className="shrink-0 rounded-full bg-card px-2.5 py-1 text-[10px] font-bold uppercase text-muted-foreground">
            {t.canteenSettings.off}
          </span>
        ) : null}
      </div>

      {/* The two times and the dash between them are one run, not two wrapped
          separately — split, a right-to-left page could show the closing time
          first and the office would read the window backwards. */}
      <p className="mt-3 text-2xl font-bold tabular-nums text-foreground">
        <Latin>
          {row.startsAt} – {row.endsAt}
        </Latin>
      </p>

      {overnight ? (
        <p className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-primary">
          <Moon className="size-3" />
          {t.canteenSettings.runsPastMidnight}
        </p>
      ) : null}

      <button
        type="button"
        onClick={onEdit}
        className="mt-3 rounded-xl bg-card px-3 py-2 text-xs font-semibold text-foreground transition-all hover:text-primary"
      >
        {t.canteenSettings.edit}
      </button>
    </div>
  );
}

function WindowDialog({
  sites,
  row,
  onClose,
}: {
  sites: { id: string; name: string }[];
  row?: MealWindowRow;
  onClose: () => void;
}) {
  const t = useDictionary();
  const [state, formAction] = useActionState(saveMealWindow, INITIAL);
  const [pending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!state.message) return;
    if (state.ok) {
      // The action already holds the session, so `state.message` arrives
      // translated — toasted unchanged, never re-wrapped here.
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
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-card p-6 shadow-[0_18px_40px_rgb(0_0_0/0.18)]">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-foreground">
              {row ? (
                <Fill template={t.canteenSettings.editServing} values={{ name: row.name }} />
              ) : (
                t.canteenSettings.addServingTitle
              )}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {/* The example end time is a slot, so it goes through `<Latin>`
                  like every other time in the app rather than being digits
                  set loose in a right-to-left sentence. */}
              <Fill template={t.canteenSettings.overnightHint} values={{ time: "02:00" }} />
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

        <form action={formAction} className="mt-5 space-y-4">
          {row ? <input type="hidden" name="id" value={row.id} /> : null}
          {row ? <input type="hidden" name="code" value={row.code} /> : null}

          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {t.canteenSettings.servingName}
            </label>
            <input
              name="name"
              required
              defaultValue={row?.name ?? ""}
              placeholder={t.canteenSettings.namePlaceholder}
              className={INPUT}
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {t.common.site}
            </label>
            <select
              name="site_id"
              required
              defaultValue={row?.siteId ?? sites[0]?.id ?? ""}
              className={INPUT}
            >
              {sites.map((s) => (
                /*
                 * `dir` and the class rather than `<Latin>`: an <option> may
                 * only contain text, so the <bdi> element cannot go inside
                 * one. A factory's name is a name — not translated, and not to
                 * be reordered or set in Nastaliq either.
                 */
                <option key={s.id} value={s.id} dir="ltr" className="font-latin">
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {t.canteenSettings.opens}
              </label>
              <input
                name="starts_at"
                type="time"
                required
                dir="ltr"
                defaultValue={row?.startsAt ?? "12:00"}
                className={NUMERIC_INPUT}
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {t.canteenSettings.closes}
              </label>
              <input
                name="ends_at"
                type="time"
                required
                dir="ltr"
                defaultValue={row?.endsAt ?? "15:00"}
                className={NUMERIC_INPUT}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {t.canteenSettings.orderOnScreen}
            </label>
            <input
              name="sort_order"
              type="number"
              dir="ltr"
              defaultValue={row?.sortOrder ?? 100}
              className={NUMERIC_INPUT}
            />
          </div>

          <label className="flex items-center gap-3 rounded-2xl bg-secondary px-4 py-3">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={row?.isActive ?? true}
              className="size-5 accent-[var(--primary)]"
            />
            <span className="text-sm font-semibold text-foreground">
              {t.canteenSettings.openLabel}
            </span>
          </label>

          <SaveButton />
        </form>

        {row ? (
          <div className="mt-4 border-t border-border pt-4">
            {confirmingDelete ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  <Fill template={t.canteenSettings.removeConfirm} values={{ name: row.name }} />
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await deleteMealWindow(row.id);
                        if (result.ok) {
                          toast.success(result.message);
                          onClose();
                          router.refresh();
                        } else {
                          toast.error(result.message, { duration: 8000 });
                          setConfirmingDelete(false);
                        }
                      })
                    }
                    className="flex-1 rounded-2xl bg-danger px-4 py-3 text-sm font-bold text-white transition-all hover:-translate-y-0.5 disabled:opacity-50"
                  >
                    {t.canteenSettings.remove}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    className="flex-1 rounded-2xl bg-secondary px-4 py-3 text-sm font-bold text-foreground"
                  >
                    {t.common.cancel}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-danger"
              >
                <Trash2 className="size-3.5" />
                {t.canteenSettings.removeServing}
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SaveButton() {
  const t = useDictionary();
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 text-sm font-bold text-primary-foreground shadow-[0_10px_24px_rgb(239_86_25/0.25)] transition-all hover:-translate-y-0.5 disabled:opacity-60"
    >
      <Save className="size-4" />
      {pending ? t.common.saving : t.canteenSettings.saveServingTime}
    </button>
  );
}
