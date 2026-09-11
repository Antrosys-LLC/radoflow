"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useDictionary } from "@/components/language-provider";
import { reportError } from "@/lib/error-reporting";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useDictionary();
  const router = useRouter();

  useEffect(() => {
    console.error(error);
    reportError(error, { boundary: "route", ...(error.digest ? { digest: error.digest } : {}) });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {t.errors.loadFailedTitle}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{t.errors.loadFailedBody}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              // Refetch the server components for this route, then re-render
              // the boundary with the fresh payload.
              router.refresh();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t.errors.tryAgain}
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-xl border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            {t.errors.goHome}
          </Link>
        </div>
      </div>
    </div>
  );
}
