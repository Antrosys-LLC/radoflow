"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ClipboardCheck, Clock, History, Inbox, RotateCcw, Undo2, X } from "lucide-react";
import { toast } from "sonner";

import { Fill } from "@/components/fill";
import { useDictionary } from "@/components/language-provider";
import { Latin } from "@/components/latin";
import { Card, SectionTitle } from "@/components/ui-kit";
import {
  cancelChangeRequest,
  decideChangeRequest,
  undoChangeDecision,
} from "@/lib/approvals/actions";
import { undoMinutesLeft } from "@/lib/approvals/changes";
import { formatDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * Changes waiting on somebody, in three lists.
 *
 * A director opens this to decide, and — for an hour afterwards — to take a
 * decision back if the wrong row was pressed. Everybody else opens it to find
 * out whether what they asked for this morning has happened, and to withdraw
 * or restore it. One undifferentiated queue serves none of those, so the ones
 * addressed to you come first, then what you just decided, then your own.
 *
 * Titles and summaries are written in English when the request is made and
 * stored — a summary has to survive the row it describes changing underneath
 * it, and the language of whoever reads it later is not known when it is
 * written. They are wrapped rather than translated for that reason, like any
 * other stored text.
 */

export type RequestKind =
  | "attendance_correction"
  | "calendar_day"
  | "work_week"
  | "pay_change"
  | "contract_amount"
  | "calendar_override";

export interface RequestView {
  id: string;
  kind: RequestKind;
  title: string;
  summary: string | null;
  status: string;
  createdAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
  applyError: string | null;
  requestedBy: string;
  requestedByName: string;
  assignedToName: string | null;
  decidedBy: string | null;
  decidedByName: string | null;
}

const STATUS_TONE: Record<string, string> = {
  pending: "bg-warning-soft text-warning",
  approved: "bg-success-soft text-success",
  rejected: "bg-danger-soft text-danger",
  cancelled: "bg-secondary text-muted-foreground",
};

/** Re-renders every thirty seconds so the minutes left to undo count down. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function ApprovalsScreen({
  requests,
  me,
  canDecide,
  isLeader,
}: {
  requests: RequestView[];
  me: string;
  canDecide: boolean;
  isLeader: boolean;
}) {
  const t = useDictionary();
  const now = useNow();

  const pending = requests.filter((request) => request.status === "pending");
  // Your own never appear in your decide list: the whole value of this is the
  // second pair of eyes, and the server refuses it anyway.
  const toDecide = canDecide ? pending.filter((request) => request.requestedBy !== me) : [];
  const recent = canDecide
    ? requests.filter(
        (request) =>
          (request.status === "approved" || request.status === "rejected") &&
          undoMinutesLeft(request.decidedAt, now) > 0 &&
          (request.decidedBy === me || isLeader),
      )
    : [];
  const mine = requests.filter((request) => request.requestedBy === me);

  return (
    <div className="space-y-5 pb-6">
      <Card className="p-4 sm:p-6">
        <SectionTitle
          icon={ClipboardCheck}
          title={t.approvals.waiting}
          subtitle={canDecide ? t.approvals.waitingHint : t.approvals.cannotDecide}
        />

        {toDecide.length === 0 ? (
          <Empty message={t.approvals.nothingWaiting} />
        ) : (
          <ul className="space-y-2">
            {toDecide.map((request) => (
              <RequestRow key={request.id} request={request} mode="decide" now={now} />
            ))}
          </ul>
        )}
      </Card>

      {canDecide ? (
        <Card className="p-4 sm:p-6">
          <SectionTitle
            icon={History}
            title={t.approvals.recentlyDecided}
            subtitle={t.approvals.recentlyDecidedHint}
          />

          {recent.length === 0 ? (
            <Empty message={t.approvals.nothingRecent} />
          ) : (
            <ul className="space-y-2">
              {recent.map((request) => (
                <RequestRow key={request.id} request={request} mode="undo" now={now} />
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      <Card className="p-4 sm:p-6">
        <SectionTitle icon={Inbox} title={t.approvals.mine} subtitle={t.approvals.mineHint} />

        {mine.length === 0 ? (
          <Empty message={t.approvals.noneOfMine} />
        ) : (
          <ul className="space-y-2">
            {mine.map((request) => (
              <RequestRow key={request.id} request={request} mode="mine" now={now} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <p className="rounded-2xl bg-secondary px-4 py-10 text-center text-sm text-muted-foreground">
      {message}
    </p>
  );
}

function RequestRow({
  request,
  mode,
  now,
}: {
  request: RequestView;
  /** decide: approve or reject · undo: take a decision back · mine: withdraw or restore. */
  mode: "decide" | "undo" | "mine";
  now: number;
}) {
  const t = useDictionary();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");

  const minutesLeft = undoMinutesLeft(request.decidedAt, now);

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(result.message);
      else toast.error(result.message, { duration: 9000 });
      router.refresh();
    });
  }

  return (
    <li className="rounded-2xl bg-secondary p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-foreground">
            <Latin>{request.title}</Latin>
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                STATUS_TONE[request.status] ?? STATUS_TONE["pending"],
              )}
            >
              {t.approvals.status[request.status as keyof typeof t.approvals.status] ??
                request.status}
            </span>
            <span className="rounded-full bg-card px-2.5 py-0.5 text-[10px] font-bold text-muted-foreground">
              {t.approvals.kind[request.kind] ?? request.kind}
            </span>
          </p>

          {request.summary ? (
            <p className="mt-1 text-sm text-muted-foreground">
              <Latin>{request.summary}</Latin>
            </p>
          ) : null}

          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <Clock className="size-3" aria-hidden />
            <Latin>{formatDateTime(request.createdAt)}</Latin>
            {" · "}
            <Latin>{request.requestedByName}</Latin>
            {request.assignedToName ? (
              <>
                {" → "}
                <Latin>{request.assignedToName}</Latin>
              </>
            ) : null}
          </p>

          {/* A request whose write failed explains itself rather than sitting
              there looking ignored. */}
          {request.applyError ? (
            <p className="mt-2 rounded-xl bg-danger-soft px-3 py-2 text-[11px] font-semibold text-danger">
              <Latin>{request.applyError}</Latin>
            </p>
          ) : null}

          {request.decidedAt ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              <Latin>
                {`${request.decidedByName ?? ""} · ${formatDateTime(request.decidedAt)}`}
              </Latin>
              {request.decisionNote ? (
                <>
                  {" — "}
                  <Latin>{request.decisionNote}</Latin>
                </>
              ) : null}
            </p>
          ) : null}
        </div>

        {mode === "decide" && request.status === "pending" ? (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[16rem]">
            <input
              type="text"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t.approvals.notePlaceholder}
              aria-label={t.approvals.note}
              className="w-full rounded-xl border border-input bg-card px-3 py-2 text-xs outline-none focus:border-primary"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => decideChangeRequest(request.id, "approved", note))}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-success px-3 py-2 text-xs font-bold text-white transition-all hover:-translate-y-0.5 disabled:opacity-50"
              >
                <Check className="size-3.5" aria-hidden />
                {t.approvals.approve}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => decideChangeRequest(request.id, "rejected", note))}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-danger-soft px-3 py-2 text-xs font-bold text-danger transition-all hover:-translate-y-0.5 disabled:opacity-50"
              >
                <X className="size-3.5" aria-hidden />
                {t.approvals.reject}
              </button>
            </div>
          </div>
        ) : null}

        {mode === "undo" && minutesLeft > 0 ? (
          <UndoButton
            label={t.approvals.undo}
            hint={t.approvals.undoLeft}
            minutes={minutesLeft}
            disabled={pending}
            icon="undo"
            onClick={() => run(() => undoChangeDecision(request.id))}
          />
        ) : null}

        {mode === "mine" && request.status === "pending" ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => cancelChangeRequest(request.id))}
            className="rounded-xl bg-card px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-danger disabled:opacity-50"
          >
            {t.approvals.withdraw}
          </button>
        ) : null}

        {mode === "mine" && request.status === "cancelled" && minutesLeft > 0 ? (
          <UndoButton
            label={t.approvals.restore}
            hint={t.approvals.undoLeft}
            minutes={minutesLeft}
            disabled={pending}
            icon="restore"
            onClick={() => run(() => undoChangeDecision(request.id))}
          />
        ) : null}
      </div>
    </li>
  );
}

function UndoButton({
  label,
  hint,
  minutes,
  disabled,
  icon,
  onClick,
}: {
  label: string;
  hint: string;
  minutes: number;
  disabled: boolean;
  icon: "undo" | "restore";
  onClick: () => void;
}) {
  const Icon = icon === "undo" ? Undo2 : RotateCcw;
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="inline-flex items-center gap-1.5 rounded-xl bg-card px-3 py-2 text-xs font-bold text-foreground ring-1 ring-border transition-all hover:-translate-y-0.5 hover:text-primary disabled:opacity-50"
      >
        <Icon className="size-3.5" aria-hidden />
        {label}
      </button>
      <span className="text-[10px] text-muted-foreground">
        <Fill template={hint} values={{ minutes }} />
      </span>
    </div>
  );
}
