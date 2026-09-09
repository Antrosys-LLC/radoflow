"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ClipboardCheck, Clock, Inbox, X } from "lucide-react";
import { toast } from "sonner";

import { useDictionary } from "@/components/language-provider";
import { Latin } from "@/components/latin";
import { Card, SectionTitle } from "@/components/ui-kit";
import { cancelChangeRequest, decideChangeRequest } from "@/lib/approvals/actions";
import { formatDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * Changes waiting on somebody, in two lists.
 *
 * A director opens this to decide. Everybody else opens it to find out whether
 * what they asked for this morning has happened. One undifferentiated queue
 * serves neither, so the ones addressed to you come first and your own follow.
 *
 * Titles and summaries are written in English when the request is made and
 * stored — a summary has to survive the row it describes changing underneath
 * it, and the language of whoever reads it later is not known when it is
 * written. They are wrapped rather than translated for that reason, like any
 * other stored text.
 */

export type RequestKind =
  "attendance_correction" | "calendar_day" | "work_week" | "pay_change" | "contract_amount";

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
  decidedByName: string | null;
}

const STATUS_TONE: Record<string, string> = {
  pending: "bg-warning-soft text-warning",
  approved: "bg-success-soft text-success",
  rejected: "bg-danger-soft text-danger",
  cancelled: "bg-secondary text-muted-foreground",
};

export function ApprovalsScreen({
  requests,
  me,
  canDecide,
}: {
  requests: RequestView[];
  me: string;
  canDecide: boolean;
}) {
  const t = useDictionary();

  const pending = requests.filter((request) => request.status === "pending");
  // Your own never appear in your decide list: the whole value of this is the
  // second pair of eyes, and the server refuses it anyway.
  const toDecide = canDecide ? pending.filter((request) => request.requestedBy !== me) : [];
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
              <RequestRow key={request.id} request={request} canDecide mine={false} />
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4 sm:p-6">
        <SectionTitle icon={Inbox} title={t.approvals.mine} subtitle={t.approvals.mineHint} />

        {mine.length === 0 ? (
          <Empty message={t.approvals.noneOfMine} />
        ) : (
          <ul className="space-y-2">
            {mine.map((request) => (
              <RequestRow key={request.id} request={request} canDecide={false} mine />
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
  canDecide,
  mine,
}: {
  request: RequestView;
  canDecide: boolean;
  mine: boolean;
}) {
  const t = useDictionary();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");

  function decide(decision: "approved" | "rejected") {
    startTransition(async () => {
      const result = await decideChangeRequest(request.id, decision, note);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message, { duration: 9000 });
      router.refresh();
    });
  }

  function withdraw() {
    startTransition(async () => {
      const result = await cancelChangeRequest(request.id);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
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
              {t.approvals.kind[request.kind]}
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

        {canDecide && request.status === "pending" ? (
          <div className="flex flex-col gap-2 sm:min-w-[16rem]">
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
                onClick={() => decide("approved")}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-success px-3 py-2 text-xs font-bold text-white transition-all hover:-translate-y-0.5 disabled:opacity-50"
              >
                <Check className="size-3.5" aria-hidden />
                {t.approvals.approve}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => decide("rejected")}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-danger-soft px-3 py-2 text-xs font-bold text-danger transition-all hover:-translate-y-0.5 disabled:opacity-50"
              >
                <X className="size-3.5" aria-hidden />
                {t.approvals.reject}
              </button>
            </div>
          </div>
        ) : null}

        {mine && request.status === "pending" ? (
          <button
            type="button"
            disabled={pending}
            onClick={withdraw}
            className="rounded-xl bg-card px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-danger disabled:opacity-50"
          >
            {t.approvals.withdraw}
          </button>
        ) : null}
      </div>
    </li>
  );
}
