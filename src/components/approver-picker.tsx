"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";

import { useDictionary } from "@/components/language-provider";
import { approvalContext } from "@/lib/approvals/context-action";
import type { Approver } from "@/lib/approvals/approvers";
import { cn } from "@/lib/utils";

/**
 * Who this change goes to for approval.
 *
 * Renders nothing at all for somebody whose changes do not wait — Antrosys
 * sees the form exactly as it was, with no extra field and no explanation of a
 * rule that does not apply to them. For everybody else it is one select and
 * one sentence saying plainly that the change will not take effect yet, which
 * is the thing most worth being unambiguous about: a save button that appears
 * to save and does not is the worst outcome here.
 *
 * Controlled, because several of the guarded actions are not `<form>`s — the
 * weekday toggle and the delete button build their FormData in JavaScript —
 * and one selection per screen is what those need to read.
 */

export function ApproverPicker({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (approverId: string) => void;
  className?: string;
}) {
  const t = useDictionary();
  const [state, setState] = useState<{ required: boolean; approvers: Approver[] } | null>(null);

  useEffect(() => {
    let alive = true;
    approvalContext()
      .then((context) => {
        if (alive) setState(context);
      })
      // A failed lookup leaves the picker hidden rather than showing an empty
      // one. The action still queues the change with no named approver, which
      // any director can then decide — the request is never lost.
      .catch(() => {
        if (alive) setState({ required: false, approvers: [] });
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!state?.required) return null;

  return (
    <div className={cn("rounded-2xl bg-warning-soft px-4 py-3", className)}>
      <p className="flex items-center gap-2 text-xs font-bold text-warning">
        <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
        {t.approvals.needsApproval}
      </p>

      <label className="mt-2 block">
        <span className="text-[11px] font-semibold text-foreground">{t.approvals.sendTo}</span>
        <select
          name="approver_id"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-xs font-semibold outline-none focus:border-primary"
        >
          <option value="">{t.approvals.pickApprover}</option>
          {/* Names and role names are rows, so they are listed as stored. */}
          {state.approvers.map((approver) => (
            <option key={approver.id} value={approver.id}>
              {approver.roleName ? `${approver.name} — ${approver.roleName}` : approver.name}
            </option>
          ))}
        </select>
      </label>

      <p className="mt-1 text-[11px] text-muted-foreground">{t.approvals.sendToHint}</p>
    </div>
  );
}
