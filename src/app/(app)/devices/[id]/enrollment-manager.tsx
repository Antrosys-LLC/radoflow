"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Link2, TriangleAlert, Unlink, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Card, SectionTitle } from "@/components/ui-kit";
import { linkEnrollment, unlinkEnrollment, type ActionResult } from "../actions";

const INITIAL: ActionResult = { ok: false, message: "" };

export interface EnrollmentRow {
  id: string;
  deviceUserId: string;
  profileId: string;
  employeeName: string;
  employeeCode: string;
}

export function EnrollmentManager({
  deviceId,
  enrollments,
  unmapped,
  staff,
}: {
  deviceId: string;
  enrollments: EnrollmentRow[];
  unmapped: string[];
  staff: { id: string; name: string; code: string }[];
}) {
  const [state, formAction] = useActionState(linkEnrollment, INITIAL);
  const [prefill, setPrefill] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (!state.message) return;
    if (state.ok) {
      toast.success(state.message);
      // Clearing the field is a response to the server action's result, which
      // is only known asynchronously.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPrefill("");
    } else {
      toast.error(state.message);
    }
    router.refresh();
  }, [state, router]);

  function unlink(enrollmentId: string) {
    startTransition(async () => {
      const result = await unlinkEnrollment(deviceId, enrollmentId);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      router.refresh();
    });
  }

  return (
    <Card className="p-4 sm:p-6">
      <SectionTitle
        icon={Link2}
        title="Employee enrolment mapping"
        subtitle="Match each terminal fingerprint ID to the person it belongs to"
      />

      {unmapped.length > 0 ? (
        <div className="mb-4 rounded-2xl bg-warning-soft p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-warning">
            <TriangleAlert className="size-4" />
            {unmapped.length} terminal ID{unmapped.length === 1 ? "" : "s"} not linked to anyone
          </p>
          <p className="mt-1 text-xs text-foreground">
            Punches from these IDs are stored but do not reach anyone&apos;s timesheet or payroll.
            Tap one to link it.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {unmapped.map((deviceUserId) => (
              <button
                key={deviceUserId}
                type="button"
                onClick={() => setPrefill(deviceUserId)}
                className="rounded-full bg-card px-3 py-1.5 text-xs font-bold text-warning transition-all hover:-translate-y-0.5"
              >
                ID {deviceUserId}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <form action={formAction} className="mb-5 grid gap-3 sm:grid-cols-[1fr_1.5fr_auto]">
        <input type="hidden" name="device_id" value={deviceId} />
        <div>
          <label className="block text-xs font-semibold text-muted-foreground">
            Terminal ID (enrolment number)
          </label>
          <input
            name="device_user_id"
            required
            value={prefill}
            onChange={(e) => setPrefill(e.target.value)}
            placeholder="e.g. 1042"
            className="mt-1 w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted-foreground">Employee</label>
          <select
            name="profile_id"
            required
            defaultValue=""
            className="mt-1 w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
          >
            <option value="" disabled>
              Choose an employee
            </option>
            {staff.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name} ({person.code})
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <LinkButton />
        </div>
      </form>

      {enrollments.length === 0 ? (
        <div className="rounded-2xl bg-secondary p-6 text-center">
          <p className="text-sm font-semibold text-foreground">No employees linked yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Enrol a fingerprint on the K50, then link the ID it shows to the employee here.
          </p>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {enrollments.map((row) => (
            <div
              key={row.id}
              className="flex items-center justify-between gap-3 rounded-2xl bg-secondary p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{row.employeeName}</p>
                <p className="text-xs text-muted-foreground">
                  {row.employeeCode} · terminal ID {row.deviceUserId}
                </p>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => unlink(row.id)}
                aria-label={`Unlink ${row.employeeName}`}
                className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-card text-muted-foreground transition-all hover:text-danger disabled:opacity-50"
              >
                <Unlink className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function LinkButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-[46px] items-center gap-2 rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground shadow-[0_10px_24px_rgb(239_86_25/0.25)] transition-all hover:-translate-y-0.5 disabled:opacity-60"
    >
      <UserPlus className="size-4" />
      {pending ? "Linking…" : "Link"}
    </button>
  );
}
