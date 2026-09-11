import Link from "next/link";

import { getSession } from "@/lib/auth/session";
import { dictionaryFor, resolveLanguage } from "@/lib/i18n";

/**
 * Rendered outside the signed-in group, so there is no language provider above
 * it. The session is read directly instead — the same thing the root layout
 * does for `dir` — and an anonymous visitor gets English, which is what the
 * sign-in page they are about to be sent to is written in anyway.
 */
export default async function NotFound() {
  const session = await getSession();
  const t = dictionaryFor(resolveLanguage(session?.profile.language));

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-latin text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">{t.errors.notFoundTitle}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t.errors.notFoundBody}</p>
        <div className="mt-6">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t.errors.goHome}
          </Link>
        </div>
      </div>
    </div>
  );
}
