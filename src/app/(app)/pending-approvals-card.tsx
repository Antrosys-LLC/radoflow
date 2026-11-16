"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, ClipboardCheck, Clock, X } from "lucide-react";
import { toast } from "sonner";

import { Fill } from "@/components/fill";
import { useDictionary } from "@/components/language-provider";
import { Latin } from "@/components/latin";
import { decideChangeRequest } from "@/lib/approvals/actions";
import { Card, SectionTitle } from "@/components/ui-kit";
import { formatDateTime } from "@/lib/time";

/**
 * The approvals queue, in front of whoever can decide it.
 *
 * `/approvals` already exists and does this properly — three lists, undo,
 * withdrawal. This is deliberately a smaller thing: the dashboard's job is to
 * make "something is waiting on you" impossible to miss, not to replace the
 * screen that handles it in full. A quick approve or reject here covers the
 * common case; anything that needs a note or a closer look still goes to
 * `/approvals`.
 */

export interface PendingApproval {
  id: string;
  title: string;
  summary: string | null;
  createdAt: string;
  requestedByName: string;
}

/** Drawn before the queue is shown, since the count is the part being surfaced. */
const SHOWN = 4;

export function PendingApprovalsCard({ requests }: { requests: PendingApproval[] }) {
  const t = useDictionary();

  return (
    <Card className="border-2 border-primary/30 bg-primary-soft/40">
      <SectionTitle
        icon={ClipboardCheck}
        title={
          <>
            {t.dashboard.pendingApprovalsTitle}
            {requests.length > 0 ? (
              <span className="ms-2 inline-flex items-center justify-center rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold text-primary-foreground">
                <Latin>{requests.length}</Latin>
              </span>
            ) : null}
          </>
        }
        subtitle={t.dashboard.pendingApprovalsHint}
        action={
          <Link
            href="/approvals"
            className="inline-flex items-center gap-2 rounded-xl bg-card px-4 py-2 text-sm font-semibold text-foreground transition-all hover:bg-primary hover:text-primary-foreground"
          >
            {t.dashboard.viewAllApprovals}
            <ArrowRight className="size-4 rtl-flip" />
          </Link>
        }
      />

      {requests.length === 0 ? (
        <p className="rounded-2xl bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          {t.dashboard.nothingAwaitingApproval}
        </p>
      ) : (
        <div className="space-y-2">
          {requests.slice(0, SHOWN).map((request) => (
            <ApprovalRow key={request.id} request={request} />
          ))}
          {requests.length > SHOWN ? (
            <p className="px-1 text-xs font-semibold text-muted-foreground">
              <Fill
                template={t.dashboard.andMoreWaiting}
                values={{ count: requests.length - SHOWN }}
              />
            </p>
          ) : null}
        </div>
      )}
    </Card>
  );
}

function ApprovalRow({ request }: { request: PendingApproval }) {
  const t = useDictionary();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function decide(decision: "approved" | "rejected") {
    startTransition(async () => {
      const result = await decideChangeRequest(request.id, decision);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message, { duration: 9000 });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-card p-3.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-foreground">
          <Latin>{request.title}</Latin>
        </p>
        {request.summary ? (
          <p className="truncate text-xs text-muted-foreground">
            <Latin>{request.summary}</Latin>
          </p>
        ) : null}
        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
          <Clock className="size-3" aria-hidden />
          <Latin>{formatDateTime(request.createdAt)}</Latin>
          {" · "}
          <Latin>{request.requestedByName}</Latin>
        </p>
      </div>
      <div className="flex shrink-0 gap-1.5">
        <button
          type="button"
          disabled={pending}
          onClick={() => decide("approved")}
          aria-label={t.approvals.approve}
          className="inline-flex items-center gap-1.5 rounded-xl bg-success px-3 py-2 text-xs font-bold text-white transition-all hover:-translate-y-0.5 disabled:opacity-50"
        >
          <Check className="size-3.5" aria-hidden />
          {t.approvals.approve}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => decide("rejected")}
          aria-label={t.approvals.reject}
          className="inline-flex items-center gap-1.5 rounded-xl bg-danger-soft px-3 py-2 text-xs font-bold text-danger transition-all hover:-translate-y-0.5 disabled:opacity-50"
        >
          <X className="size-3.5" aria-hidden />
          {t.approvals.reject}
        </button>
      </div>
    </div>
  );
}
