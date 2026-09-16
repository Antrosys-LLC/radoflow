"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { LogIn, TriangleAlert } from "lucide-react";

import { CnicInput, PasswordInput } from "@/components/credential-inputs";
import { signIn, type LoginState } from "./actions";

const INITIAL: LoginState = { error: null };

export function LoginForm({ next, reason }: { next: string; reason?: string | null }) {
  const [state, formAction] = useActionState(signIn, INITIAL);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="flex size-16 items-center justify-center">
            {/* A plain img: a fixed 9 KB mark with a declared box, so there is
                no layout shift for next/image to prevent. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/rado-logo.png"
              alt=""
              aria-hidden
              width={44}
              height={44}
              className="size-full object-contain"
            />
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">
            Rado Dyeing &amp; Textile
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Attendance &amp; Payroll · Engineered by{" "}
            <a
              href="https://www.antrosys.com"
              target="_blank"
              rel="noreferrer noopener"
              className="font-semibold text-foreground underline-offset-2 hover:underline"
            >
              Antrosys
            </a>
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

          {/* A spent or expired recovery link, said plainly rather than as a
              failed page somewhere else. */}
          {reason === "reset-expired" ? (
            <p className="mb-5 rounded-2xl bg-warning-soft px-4 py-3 text-sm text-warning">
              That reset link has expired or was already used. Ask for another below.
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

        {/*
         * Only for the Antrosys administrator, and deliberately understated:
         * every other account here is recovered in person by the office, which
         * is faster and needs no mailbox.
         *
         * This opens the administrator's own mail app with the message already
         * addressed, rather than asking the server to send a recovery link. The
         * link depended on Supabase delivering mail, which it was not doing —
         * the screen said one was on its way and nothing ever arrived. A
         * message the person sends themselves either goes or visibly does not.
         */}
        <p className="mt-2 text-center text-xs text-muted-foreground">
          <a
            href={
              "mailto:umar@antrosys.com" +
              "?subject=RadoFlow%20password%20reset" +
              "&body=Please%20reset%20my%20RadoFlow%20password.%0A%0AName%3A%0ACNIC%3A%0A"
            }
            className="font-semibold text-primary underline-offset-2 hover:underline"
          >
            Antrosys administrator? Email umar@antrosys.com for a reset
          </a>
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
