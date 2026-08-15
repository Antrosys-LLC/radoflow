/**
 * Declares the environment variables this app reads.
 *
 * Two reasons this exists rather than reaching into `process.env` with bracket
 * syntax: the project enables `noPropertyAccessFromIndexSignature`, which
 * rejects dot access on an index signature, and Next inlines `NEXT_PUBLIC_*`
 * into the client bundle by matching on the property access — so dot access is
 * the form that reliably survives bundling.
 *
 * Values are typed non-optional where the app cannot start without them; see
 * .env.example for how to obtain each one.
 */
declare namespace NodeJS {
  interface ProcessEnv {
    /** Supabase project URL. Safe to expose to the browser. */
    NEXT_PUBLIC_SUPABASE_URL: string;
    /** Anon key. Every request it makes is still constrained by RLS. */
    NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
    /** Bypasses RLS — server-only, never sent to the browser. */
    SUPABASE_SERVICE_ROLE_KEY?: string;
    /** Shared secret the biometric terminals present when pushing punches. */
    DEVICE_INGEST_SECRET?: string;
    /** Set by Next: "nodejs" or "edge". Only the Node runtime can open sockets. */
    NEXT_RUNTIME?: string;
  }
}
