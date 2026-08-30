/**
 * Declares the environment variables this app reads.
 *
 * Two reasons this exists rather than reaching into `process.env` with bracket
 * syntax: the project enables `noPropertyAccessFromIndexSignature`, which
 * rejects dot access on an index signature, and Next inlines `NEXT_PUBLIC_*`
 * into the client bundle by matching on the property access — so dot access is
 * the form that reliably survives bundling.
 *
 * Everything here is optional on purpose. Typing them as `string` would be a
 * lie: a deployment with no variables set compiles perfectly and then fails on
 * every request. Optional types force the missing case to be handled — see
 * lib/env.ts.
 */
declare namespace NodeJS {
  interface ProcessEnv {
    /** Supabase project URL. Safe to expose to the browser. */
    NEXT_PUBLIC_SUPABASE_URL?: string;
    /** Anon key. Every request it makes is still constrained by RLS. */
    NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
    /** Bypasses RLS — server-only, never sent to the browser. */
    SUPABASE_SERVICE_ROLE_KEY?: string;
    /** Shared secret the biometric terminals present when pushing punches. */
    DEVICE_INGEST_SECRET?: string;
    /** "true" to run the background terminal poller on this instance. */
    DEVICE_SYNC_ENABLED?: string;
    /** Powers the "Ask" assistant. Server-only, never sent to the browser. */
    ANTHROPIC_API_KEY?: string;
    /** Set by Next: "nodejs" or "edge". Only the Node runtime can open sockets. */
    NEXT_RUNTIME?: string;
  }
}
