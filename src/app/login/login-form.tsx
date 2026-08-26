"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Building2, LogIn, TriangleAlert } from "lucide-react";

import { CnicInput, PasswordInput } from "@/components/credential-inputs";
import { signIn, type LoginState } from "./actions";

const INITIAL: LoginState = { error: null };

export function LoginForm({ next, reason }: { next: string; reason?: string | null }) {
  const [state, formAction] = useActionState(signIn, INITIAL);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="flex size-16 items-center justify-center rounded-3xl bg-charcoal text-charcoal-foreground shadow-[0_12px_30px_rgb(0_0_0/0.15)]">
            <Building2 className="size-8" />
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">
            Rado Dyeing &amp; Textile
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Attendance &amp; Payroll · Engineered by Antrosys
          </p>
        </div>

        <form
          action={formAction}
          className="rounded-3xl border border-border bg-card p-6 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_rgb(0_0_0/0.05)] sm:p-7"
        >
          <input type="hidden" name="next" value={next} />

          {/* Explains an unexpected trip back here: the session was ended on
              purpose, not lost. */}
          {reason === "access-changed" ? (
            <p className="mb-5 rounded-2xl bg-warning-soft px-4 py-3 text-sm text-warning">
              Your access was changed. Sign in again to continue.
            </p>
          ) : null}

          <label htmlFor="cnic" className="block text-sm font-semibold text-foreground">
            CNIC
          </label>
          <div className="mt-2">
            <CnicInput id="cnic" required autoFocus />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">The dashes are added for you.</p>

          <label htmlFor="password" className="mt-5 block text-sm font-semibold text-foreground">
            Password
          </label>
          <div className="mt-2">
            <PasswordInput id="password" required />
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

        <p className="mt-5 text-center text-xs text-muted-foreground">
          Trouble signing in? Contact your factory administrator.
        </p>
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
      <LogIn className="size-5" />
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}
