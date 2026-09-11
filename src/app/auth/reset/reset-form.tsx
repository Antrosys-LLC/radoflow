"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { KeyRound, TriangleAlert } from "lucide-react";

import { PasswordInput } from "@/components/credential-inputs";

import { setNewPassword, type ResetFormState } from "./actions";

/**
 * Setting a new password from a recovery link.
 *
 * English, like the sign-in page it belongs to: the person here has not
 * identified themselves yet, so there is no profile language to read, and this
 * particular link only ever goes to Antrosys.
 */

const INITIAL: ResetFormState = { error: null };

export function ResetForm() {
  const [state, formAction] = useActionState(setNewPassword, INITIAL);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="flex size-16 items-center justify-center rounded-3xl bg-charcoal text-charcoal-foreground shadow-[0_12px_30px_rgb(0_0_0/0.15)]">
            <KeyRound className="size-8" />
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">
            Set a new password
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            This link works once. Choose something you have not used here before.
          </p>
        </div>

        <form
          action={formAction}
          className="rounded-3xl border border-border bg-card p-6 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_rgb(0_0_0/0.05)] sm:p-7"
        >
          <label htmlFor="password" className="block text-sm font-semibold text-foreground">
            New password
          </label>
          <div className="mt-2">
            <PasswordInput id="password" autoComplete="new-password" required minLength={8} />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">At least 8 characters.</p>

          <label htmlFor="confirm" className="mt-5 block text-sm font-semibold text-foreground">
            Type it again
          </label>
          <div className="mt-2">
            <PasswordInput
              id="confirm"
              name="confirm"
              autoComplete="new-password"
              required
              minLength={8}
            />
          </div>

          {state.error ? (
            <p
              role="alert"
              className="mt-4 flex items-center gap-2 rounded-2xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger"
            >
              <TriangleAlert className="size-4 shrink-0" />
              {state.error}
            </p>
          ) : null}

          <SubmitButton />
        </form>
      </div>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-4 text-base font-bold text-primary-foreground shadow-[0_12px_30px_rgb(239_86_25/0.28)] transition-all duration-300 ease-in-out hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
    >
      <KeyRound className="size-5" />
      {pending ? "Saving…" : "Save the new password"}
    </button>
  );
}
