"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { KeyRound, Save } from "lucide-react";
import { toast } from "sonner";

import { changeMyPassword, updateMyProfile, type ProfileResult } from "./actions";

const INITIAL: ProfileResult = { ok: false, message: "" };

const INPUT =
  "mt-1.5 w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/30";

const READONLY =
  "mt-1.5 w-full cursor-not-allowed rounded-2xl bg-secondary px-4 py-3 text-sm font-semibold text-muted-foreground";

function useToastResult(state: ProfileResult) {
  useEffect(() => {
    if (!state.message) return;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);
}

export function ContactForm({
  fullName,
  phone,
  email,
}: {
  fullName: string;
  phone: string;
  email: string;
}) {
  const [state, formAction] = useActionState(updateMyProfile, INITIAL);
  useToastResult(state);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="full_name" className="text-sm font-semibold text-foreground">
          Full name
        </label>
        <input id="full_name" name="full_name" defaultValue={fullName} required className={INPUT} />
      </div>

      <div>
        <label htmlFor="phone" className="text-sm font-semibold text-foreground">
          Phone
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          defaultValue={phone}
          placeholder="+92 300 1234567"
          className={INPUT}
        />
      </div>

      <div>
        <label className="text-sm font-semibold text-foreground">Email (sign-in)</label>
        <p className={READONLY}>{email || "—"}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Ask an administrator to change your sign-in email.
        </p>
      </div>

      <SubmitButton icon="save" label="Save changes" pendingLabel="Saving…" />
    </form>
  );
}

export function PasswordForm() {
  const [state, formAction] = useActionState(changeMyPassword, INITIAL);
  useToastResult(state);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="password" className="text-sm font-semibold text-foreground">
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className={INPUT}
        />
        <p className="mt-1 text-xs text-muted-foreground">At least 8 characters.</p>
      </div>

      <div>
        <label htmlFor="confirm" className="text-sm font-semibold text-foreground">
          Confirm new password
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className={INPUT}
        />
      </div>

      <SubmitButton icon="key" label="Change password" pendingLabel="Changing…" />
    </form>
  );
}

function SubmitButton({
  icon,
  label,
  pendingLabel,
}: {
  icon: "save" | "key";
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-[0_10px_24px_rgb(239_86_25/0.25)] transition-all hover:-translate-y-0.5 disabled:opacity-60"
    >
      {icon === "save" ? <Save className="size-4" /> : <KeyRound className="size-4" />}
      {pending ? pendingLabel : label}
    </button>
  );
}
