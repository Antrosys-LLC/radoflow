"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

import { approveAttendanceRange } from "./actions";

/**
 * Signs off every day already shown for this person.
 *
 * There is no form here — the range is whatever the page's own from/to
 * filters are already showing, so there is nothing left to type, only a
 * decision to make. Scope is enforced by RLS on the update itself: this
 * button does nothing to stop a manager naming someone outside their
 * department, it is `app.manages()` in the policy that does that, by
 * updating zero rows rather than refusing the request.
 */
export function ApproveRange({
  profileId,
  from,
  to,
  approvedCount,
  totalCount,
}: {
  profileId: string;
  from: string;
  to: string;
  approvedCount: number;
  totalCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const allApproved = totalCount > 0 && approvedCount === totalCount;

  function approve() {
    startTransition(async () => {
      const result = await approveAttendanceRange({ profileId, from, to });
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      router.refresh();
    });
  }

  if (totalCount === 0) return null;

  return (
    <button
      type="button"
      onClick={approve}
      disabled={pending || allApproved}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-colors",
        allApproved
          ? "bg-success-soft text-success"
          : "bg-charcoal text-charcoal-foreground hover:opacity-90 disabled:opacity-50",
      )}
    >
      <ShieldCheck className="size-3.5" />
      {allApproved
        ? "Approved"
        : pending
          ? "Approving…"
          : approvedCount > 0
            ? `Approve the rest (${totalCount - approvedCount})`
            : `Approve ${from} – ${to}`}
    </button>
  );
}
