"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { AlertTriangle, Clock, Fingerprint, Moon, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";

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
 */

const INITIAL: MealWindowResult = { ok: false, message: "" };

const INPUT =
  "mt-1 w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/30";

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
  const [editing, setEditing] = useState<MealWindowRow | null>(null);
  const [adding, setAdding] = useState(false);

  const siteName = new Map(sites.map((s) => [s.id, s.name]));
  const canteenTerminals = terminals.filter((t) => t.purpose === "canteen");
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
            <p className="font-bold">The canteen counter will not do anything yet</p>
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              {canteenTerminals.length === 0 ? (
                <li>
                  No terminal is set to Canteen — set one on the{" "}
                  <Link href="/devices" className="font-semibold text-primary underline">
                    Devices
                  </Link>{" "}
                  screen. Until then its scans are recorded as attendance.
                </li>
              ) : null}
              {activeWindows.length === 0 ? (
                <li>
                  No serving time is switched on, so every scan reads &ldquo;counter closed&rdquo;.
                </li>
              ) : null}
            </ul>
          </div>
        </div>
      ) : null}

      <Card className="p-4 sm:p-6">
        <SectionTitle
          icon={Clock}
          title={`Serving times · ${windows.length}`}
          subtitle="When the counter is open. One meal per person per serving."
          action={
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-[0_10px_24px_rgb(239_86_25/0.25)] transition-all hover:-translate-y-0.5"
            >
              <Plus className="size-4" />
              Add serving
            </button>
          }
        />

        {windows.length === 0 ? (
          <div className="rounded-2xl bg-secondary p-8 text-center">
            <p className="text-sm font-semibold text-foreground">No serving times yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add one — lunch, or dinner for the night shift.
            </p>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {windows.map((row) => (
              <WindowCard
                key={row.id}
                row={row}
                siteName={siteName.get(row.siteId) ?? "Unassigned"}
                onEdit={() => setEditing(row)}
              />
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4 sm:p-6">
        <SectionTitle
          icon={Fingerprint}
          title="Canteen terminals"
          subtitle="Set on the Devices screen — shown here so a missing one is obvious"
        />

        {canteenTerminals.length === 0 ? (
          <p className="rounded-2xl bg-secondary px-4 py-6 text-center text-sm text-muted-foreground">
            No terminal is scanning for meals.
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
                  <p className="truncate text-sm font-bold text-foreground">{terminal.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {siteName.get(terminal.siteId) ?? "Unassigned"}
                  </p>
                </div>
                {!terminal.isActive ? (
                  <span className="rounded-full bg-danger-soft px-2.5 py-1 text-[10px] font-bold uppercase text-danger">
                    Inactive
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
  const overnight = crossesMidnight(row);

  return (
    <div className={cn("rounded-2xl bg-secondary p-4", !row.isActive && "opacity-60")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-foreground">{row.name}</p>
          <p className="text-xs text-muted-foreground">{siteName}</p>
        </div>
        {!row.isActive ? (
          <span className="shrink-0 rounded-full bg-card px-2.5 py-1 text-[10px] font-bold uppercase text-muted-foreground">
            Off
          </span>
        ) : null}
      </div>

      <p className="mt-3 text-2xl font-bold tabular-nums text-foreground">
        {row.startsAt} – {row.endsAt}
      </p>

      {overnight ? (
        <p className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-primary">
          <Moon className="size-3" />
          Runs past midnight — counted against the day it opens
        </p>
      ) : null}

      <button
        type="button"
        onClick={onEdit}
        className="mt-3 rounded-xl bg-card px-3 py-2 text-xs font-semibold text-foreground transition-all hover:text-primary"
      >
        Edit
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
  const [state, formAction] = useActionState(saveMealWindow, INITIAL);
  const [pending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
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
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-card p-6 shadow-[0_18px_40px_rgb(0_0_0/0.18)]">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-foreground">
              {row ? `Edit ${row.name}` : "Add a serving"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              A serving that runs past midnight is fine — end it at 02:00 and the night shift&apos;s
              meal still counts as one.
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
          {row ? <input type="hidden" name="id" value={row.id} /> : null}
          {row ? <input type="hidden" name="code" value={row.code} /> : null}

          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Name
            </label>
            <input
              name="name"
              required
              defaultValue={row?.name ?? ""}
              placeholder="Lunch"
              className={INPUT}
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Factory
            </label>
            <select
              name="site_id"
              required
              defaultValue={row?.siteId ?? sites[0]?.id ?? ""}
              className={INPUT}
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Opens
              </label>
              <input
                name="starts_at"
                type="time"
                required
                defaultValue={row?.startsAt ?? "12:00"}
                className={INPUT}
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Closes
              </label>
              <input
                name="ends_at"
                type="time"
                required
                defaultValue={row?.endsAt ?? "15:00"}
                className={INPUT}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Order on screen
            </label>
            <input
              name="sort_order"
              type="number"
              defaultValue={row?.sortOrder ?? 100}
              className={INPUT}
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
              Open — the counter accepts scans in this window
            </span>
          </label>

          <SaveButton />
        </form>

        {row ? (
          <div className="mt-4 border-t border-border pt-4">
            {confirmingDelete ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Remove {row.name}? Servings already recorded against it keep this window, so it
                  can only be removed if nobody has eaten in it.
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
                    Remove
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    className="flex-1 rounded-2xl bg-secondary px-4 py-3 text-sm font-bold text-foreground"
                  >
                    Cancel
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
                Remove this serving
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 text-sm font-bold text-primary-foreground shadow-[0_10px_24px_rgb(239_86_25/0.25)] transition-all hover:-translate-y-0.5 disabled:opacity-60"
    >
      <Save className="size-4" />
      {pending ? "Saving…" : "Save serving time"}
    </button>
  );
}
