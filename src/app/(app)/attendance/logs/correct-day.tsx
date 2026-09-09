"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { PencilLine, Save, X } from "lucide-react";
import { toast } from "sonner";

import { ApproverPicker } from "@/components/approver-picker";
import { useDictionary } from "@/components/language-provider";
import { Latin } from "@/components/latin";
import { cn } from "@/lib/utils";

import { correctAttendanceDay, type CorrectionResult } from "./correct-actions";

/**
 * Putting one day right.
 *
 * A terminal misses a punch and the day reads as absent; somebody clocks out on
 * the wrong machine and their hours are half what they worked. The fix used to
 * be a payroll adjustment, which corrects the money and leaves the record
 * saying something untrue.
 *
 * Hours are not a field. They are worked out from the in and out times, because
 * a day whose hours disagree with its own clock readings is a day nobody can
 * check — and checking it is the entire reason a correction is trusted.
 */

const INITIAL: CorrectionResult = { ok: false, message: "" };

const INPUT =
  "mt-1 w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/30";

const TIME_INPUT = cn(INPUT, "font-latin");

/** The seven `attendance_status` members, in the order the office thinks of them. */
const STATUSES = ["present", "absent", "partial", "leave", "holiday", "off", "pending"] as const;

export interface CorrectableDay {
  id: string;
  workDate: string;
  /** "HH:MM" in Pakistan time, or empty when the punch is missing. */
  firstIn: string;
  lastOut: string;
  status: string;
}

export function CorrectDayButton({ day }: { day: CorrectableDay }) {
  const t = useDictionary();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t.logs.correctDay}
        title={t.logs.correctDay}
        className="rounded-xl bg-secondary px-2 py-1.5 text-muted-foreground transition-colors hover:text-primary"
      >
        <PencilLine className="size-3.5" aria-hidden />
      </button>

      {open ? <CorrectDialog day={day} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function CorrectDialog({ day, onClose }: { day: CorrectableDay; onClose: () => void }) {
  const t = useDictionary();
  const router = useRouter();
  const [state, action] = useActionState(correctAttendanceDay, INITIAL);
  const [approverId, setApproverId] = useState("");

  useEffect(() => {
    if (!state.message) return;
    if (state.ok) {
      toast.success(state.message);
      router.refresh();
      onClose();
    } else {
      toast.error(state.message);
    }
    // `state` is the only trigger; listing the callbacks would re-fire the
    // toast on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-charcoal/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl border border-border bg-card p-5 shadow-[0_24px_60px_rgb(0_0_0/0.25)] sm:max-w-lg sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-bold text-foreground">
            {t.logs.correctDay} · <Latin>{day.workDate}</Latin>
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.cancel}
            className="rounded-xl bg-secondary p-2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <p className="mt-1 text-xs text-muted-foreground">{t.logs.correctDayHint}</p>

        <form action={action} className="mt-4 space-y-4">
          <input type="hidden" name="day_id" value={day.id} readOnly />
          <input type="hidden" name="approver_id" value={approverId} readOnly />

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-bold text-muted-foreground">{t.common.checkedIn}</span>
              <input
                type="time"
                name="first_in"
                defaultValue={day.firstIn}
                dir="ltr"
                className={TIME_INPUT}
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-muted-foreground">{t.common.checkedOut}</span>
              <input
                type="time"
                name="last_out"
                defaultValue={day.lastOut}
                dir="ltr"
                className={TIME_INPUT}
              />
            </label>
          </div>

          <p className="text-[11px] text-muted-foreground">{t.logs.hoursFollow}</p>

          <label className="block">
            <span className="text-xs font-bold text-muted-foreground">{t.common.status}</span>
            <select name="status" defaultValue={day.status || "present"} className={INPUT}>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t.status.attendance[status]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-bold text-muted-foreground">{t.logs.correctReason}</span>
            <input
              type="text"
              name="reason"
              required
              placeholder={t.logs.correctReasonPlaceholder}
              className={INPUT}
            />
            <span className="mt-1 block text-[11px] text-muted-foreground">
              {t.logs.correctReasonHint}
            </span>
          </label>

          <ApproverPicker value={approverId} onChange={setApproverId} />

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl bg-secondary px-5 py-3 text-sm font-bold text-muted-foreground transition-colors hover:text-foreground"
            >
              {t.common.cancel}
            </button>
            <SubmitButton />
          </div>
        </form>
      </div>
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
      className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition-all hover:opacity-90 disabled:opacity-60"
    >
      <Save className="size-4" aria-hidden />
      {pending ? t.common.saving : t.common.save}
    </button>
  );
}
