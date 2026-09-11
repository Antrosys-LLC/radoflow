"use client";

import { useActionState, useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import {
  ArrowDownLeft,
  ArrowUpRight,
  DoorOpen,
  PencilLine,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { ExportButtons } from "@/components/export-buttons";
import { useDictionary } from "@/components/language-provider";
import { Latin } from "@/components/latin";
import { Card, SectionTitle } from "@/components/ui-kit";
import { createTickStore } from "@/lib/tick";
import { formatDateTime, formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";

import { deleteGateEntry, saveGateEntry, EDIT_WINDOW_MS, type GateResult } from "./actions";

/**
 * The gate register.
 *
 * Written at the gate as things happen, so the form is the first thing on the
 * screen rather than behind a button: a supervisor with a truck waiting should
 * not have to find "Add" before they can type a plate.
 *
 * The hour a supervisor has to correct their own entry is shown as it runs
 * down, because "you can still fix this" and "this is now fixed" are the same
 * row a minute apart, and nothing else on screen would say which.
 */

const INITIAL: GateResult = { ok: false, message: "" };

const INPUT =
  "mt-1 w-full rounded-2xl border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/30";

const KINDS = ["visitor", "vehicle", "material", "staff"] as const;

export interface GateEntryView {
  id: string;
  kind: (typeof KINDS)[number];
  direction: "in" | "out";
  subject: string;
  party: string | null;
  purpose: string | null;
  reference: string | null;
  quantity: string | null;
  remarks: string | null;
  happenedAt: string;
  createdAt: string;
  recordedBy: string;
  recordedByName: string;
  editedByName: string | null;
}

/**
 * Half a minute is fine granularity for a countdown measured in an hour.
 *
 * Shared at module scope, so a register of five hundred rows runs one timer
 * rather than five hundred — and so the reading is cached, which is what
 * `useSyncExternalStore` requires. See lib/tick.ts.
 */
const minutes = createTickStore(30_000);

export function GateScreen({
  entries,
  me,
  canLog,
  canManage,
  siteId,
  from,
  to,
}: {
  entries: GateEntryView[];
  me: string;
  canLog: boolean;
  /** A director: edits anything, whoever wrote it and however long ago. */
  canManage: boolean;
  siteId: string | null;
  from: string;
  to: string;
}) {
  const t = useDictionary();
  const [editing, setEditing] = useState<GateEntryView | null>(null);

  return (
    <div className="space-y-5 pb-6">
      {canLog ? (
        <Card className="p-4 sm:p-6">
          <SectionTitle icon={DoorOpen} title={t.gate.newEntry} subtitle={t.gate.newEntryHint} />
          <EntryForm siteId={siteId} onDone={() => undefined} />
        </Card>
      ) : null}

      <Card className="p-4 sm:p-6">
        <SectionTitle
          icon={DoorOpen}
          title={t.gate.register}
          subtitle={`${from} → ${to}`}
          action={<ExportButtons kind="gate" params={{ from, to }} />}
        />

        {entries.length === 0 ? (
          <p className="rounded-2xl bg-secondary px-4 py-10 text-center text-sm text-muted-foreground">
            {t.gate.nothingYet}
          </p>
        ) : (
          <ul className="space-y-2">
            {entries.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                me={me}
                canManage={canManage}
                onEdit={() => setEditing(entry)}
              />
            ))}
          </ul>
        )}
      </Card>

      {editing ? (
        <Dialog title={t.gate.correctEntry} onClose={() => setEditing(null)}>
          <EntryForm siteId={siteId} entry={editing} onDone={() => setEditing(null)} />
        </Dialog>
      ) : null}
    </div>
  );
}

function EntryRow({
  entry,
  me,
  canManage,
  onEdit,
}: {
  entry: GateEntryView;
  me: string;
  canManage: boolean;
  onEdit: () => void;
}) {
  const t = useDictionary();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  // Recomputed on a timer, so the row stops offering an edit the moment the
  // hour is up rather than when somebody next reloads.
  const now = useSyncExternalStore(
    minutes.subscribe,
    minutes.getSnapshot,
    minutes.getServerSnapshot,
  );
  const minutesLeft = now
    ? Math.max(0, Math.ceil((Date.parse(entry.createdAt) + EDIT_WINDOW_MS - now) / 60_000))
    : 0;

  const mine = entry.recordedBy === me;
  const canEdit = canManage || (mine && minutesLeft > 0);
  const outward = entry.direction === "out";

  return (
    <li className="flex flex-wrap items-start gap-3 rounded-2xl bg-secondary px-4 py-3">
      <span
        className={cn(
          "mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-xl",
          outward ? "bg-warning-soft text-warning" : "bg-success-soft text-success",
        )}
        title={outward ? t.gate.out : t.gate.in}
      >
        {outward ? (
          <ArrowUpRight className="size-4" aria-hidden />
        ) : (
          <ArrowDownLeft className="size-4" aria-hidden />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-foreground">
          {/* A name, a plate, a description of a load — all written by hand at
              the gate, so all wrapped rather than translated. */}
          <Latin>{entry.subject}</Latin>
          <span className="rounded-full bg-card px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
            {t.gate.kind[entry.kind]}
          </span>
        </p>

        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {entry.party ? <Latin>{entry.party}</Latin> : null}
          {entry.party && entry.purpose ? " · " : null}
          {entry.purpose ? <Latin>{entry.purpose}</Latin> : null}
          {entry.reference ? (
            <>
              {" · "}
              <Latin>{entry.reference}</Latin>
            </>
          ) : null}
          {entry.quantity ? (
            <>
              {" · "}
              <Latin>{entry.quantity}</Latin>
            </>
          ) : null}
        </p>

        <p className="mt-1 text-[11px] text-muted-foreground">
          <Latin>{`${formatTime(entry.happenedAt)} · ${entry.recordedByName}`}</Latin>
          {entry.editedByName ? (
            <>
              {" · "}
              {t.gate.editedBy}
              {": "}
              <Latin>{entry.editedByName}</Latin>
            </>
          ) : null}
        </p>

        {entry.remarks ? (
          <p className="mt-1 text-[11px] text-muted-foreground">
            <Latin>{entry.remarks}</Latin>
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {/* Only on your own, and only while it is true. A countdown on
            somebody else's row would be telling them about a door that was
            never open to them. */}
        {mine && !canManage && minutesLeft > 0 ? (
          <span className="rounded-full bg-card px-2.5 py-1 text-[10px] font-bold text-muted-foreground">
            <Latin>{minutesLeft}</Latin> {t.gate.minutesLeft}
          </span>
        ) : null}

        {canEdit ? (
          <button
            type="button"
            onClick={onEdit}
            aria-label={t.gate.correctEntry}
            title={t.gate.correctEntry}
            className="rounded-xl bg-card px-2.5 py-2 text-muted-foreground transition-colors hover:text-primary"
          >
            <PencilLine className="size-3.5" aria-hidden />
          </button>
        ) : null}

        {canManage ? (
          <button
            type="button"
            disabled={busy}
            aria-label={t.gate.removeEntry}
            title={t.gate.removeEntry}
            onClick={async () => {
              setBusy(true);
              const result = await deleteGateEntry(entry.id);
              if (result.ok) toast.success(result.message);
              else toast.error(result.message);
              setBusy(false);
              router.refresh();
            }}
            className="rounded-xl bg-danger-soft px-2.5 py-2 text-danger transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>
    </li>
  );
}

/** `datetime-local` wants "YYYY-MM-DDTHH:MM" on the factory's clock. */
function localValue(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

function EntryForm({
  siteId,
  entry,
  onDone,
}: {
  siteId: string | null;
  entry?: GateEntryView;
  onDone: () => void;
}) {
  const t = useDictionary();
  const router = useRouter();
  const [state, action] = useActionState(saveGateEntry, INITIAL);

  useEffect(() => {
    if (!state.message) return;
    if (state.ok) {
      toast.success(state.message);
      router.refresh();
      onDone();
    } else {
      toast.error(state.message);
    }
    // `state` is the only trigger; the callbacks would re-fire the toast on
    // every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={action} className="space-y-3">
      {entry ? <input type="hidden" name="id" value={entry.id} readOnly /> : null}
      <input type="hidden" name="site_id" value={siteId ?? ""} readOnly />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="text-xs font-bold text-muted-foreground">{t.gate.what}</span>
          <select name="kind" defaultValue={entry?.kind ?? "visitor"} className={INPUT}>
            {KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {t.gate.kind[kind]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-bold text-muted-foreground">{t.gate.direction}</span>
          <select name="direction" defaultValue={entry?.direction ?? "in"} className={INPUT}>
            <option value="in">{t.gate.in}</option>
            <option value="out">{t.gate.out}</option>
          </select>
        </label>

        <label className="block sm:col-span-2">
          <span className="text-xs font-bold text-muted-foreground">{t.gate.subject}</span>
          <input
            name="subject"
            required
            defaultValue={entry?.subject ?? ""}
            placeholder={t.gate.subjectPlaceholder}
            className={INPUT}
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="text-xs font-bold text-muted-foreground">{t.gate.party}</span>
          <input name="party" defaultValue={entry?.party ?? ""} className={INPUT} />
        </label>

        <label className="block">
          <span className="text-xs font-bold text-muted-foreground">{t.gate.purpose}</span>
          <input name="purpose" defaultValue={entry?.purpose ?? ""} className={INPUT} />
        </label>

        <label className="block">
          <span className="text-xs font-bold text-muted-foreground">{t.gate.reference}</span>
          <input
            name="reference"
            defaultValue={entry?.reference ?? ""}
            placeholder={t.gate.referencePlaceholder}
            className={cn(INPUT, "font-latin")}
          />
        </label>

        <label className="block">
          <span className="text-xs font-bold text-muted-foreground">{t.gate.quantity}</span>
          <input name="quantity" defaultValue={entry?.quantity ?? ""} className={INPUT} />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
        <label className="block">
          <span className="text-xs font-bold text-muted-foreground">{t.gate.when}</span>
          <input
            type="datetime-local"
            name="happened_at"
            dir="ltr"
            defaultValue={localValue(entry?.happenedAt ?? new Date().toISOString())}
            className={cn(INPUT, "font-latin")}
          />
        </label>

        <label className="block">
          <span className="text-xs font-bold text-muted-foreground">{t.gate.remarks}</span>
          <input name="remarks" defaultValue={entry?.remarks ?? ""} className={INPUT} />
        </label>
      </div>

      <SubmitButton editing={Boolean(entry)} />
    </form>
  );
}

function SubmitButton({ editing }: { editing: boolean }) {
  const t = useDictionary();
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition-all hover:-translate-y-0.5 disabled:opacity-60"
    >
      {editing ? <Save className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}
      {pending ? t.common.saving : editing ? t.common.save : t.gate.addEntry}
    </button>
  );
}

function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const t = useDictionary();

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-charcoal/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl border border-border bg-card p-5 shadow-[0_24px_60px_rgb(0_0_0/0.25)] sm:max-w-3xl sm:rounded-3xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-base font-bold text-foreground">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="rounded-xl bg-secondary p-2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export { formatDateTime };
