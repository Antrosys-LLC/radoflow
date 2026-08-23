/**
 * Client-side error reporting.
 *
 * A single seam for whatever error service the project adopts. Today it writes
 * a structured record to the console, which is enough to read in a browser or
 * a Railway deploy log; swapping in Sentry or similar means changing only the
 * body of `reportError`.
 */

export interface ErrorContext {
  /** Which boundary caught it, e.g. "route" or "root-layout". */
  boundary?: string;
  /** Next's error digest, which correlates a client error to a server log. */
  digest?: string;
  [key: string]: unknown;
}

export function reportError(error: unknown, context: ErrorContext = {}): void {
  // Loaders and server actions commonly throw a raw Response; String(it) is
  // the opaque "[object Response]", so pull out the status and URL instead.
  const message =
    error instanceof Response
      ? `Response ${error.status}${error.url ? ` at ${error.url}` : ""}`
      : error instanceof Error
        ? error.message
        : String(error);

  const stack = error instanceof Error ? error.stack : undefined;

  console.error("[radoflow] unhandled error", {
    message,
    ...(stack ? { stack } : {}),
    ...(typeof window !== "undefined" ? { route: window.location.pathname } : {}),
    ...context,
  });
}
