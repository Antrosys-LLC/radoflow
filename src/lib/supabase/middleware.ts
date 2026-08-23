import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { checkSupabaseEnv } from "@/lib/env";

/**
 * Refreshes the Supabase session on every request and gates protected routes.
 *
 * Supabase access tokens are short-lived; without this the user is silently
 * signed out mid-session. The refreshed cookies must be written onto the
 * response that is actually returned, which is why the response object is
 * threaded through rather than recreated.
 */

const PUBLIC_PATHS = ["/login", "/auth"];

/**
 * Machine-authenticated endpoints: the terminal itself, and the on-site agent.
 * Both present DEVICE_INGEST_SECRET and have no user session to check, so
 * redirecting them to /login would silently swallow attendance data.
 */
const DEVICE_PATHS = ["/iclock", "/api/devices/ingest"];

/** Always reachable, so a misconfigured deployment can still be diagnosed. */
const DIAGNOSTIC_PATHS = ["/api/health"];

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (DIAGNOSTIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next({ request });
  }

  /*
   * Configuration is checked before the client is constructed.
   *
   * Without this the Supabase client throws from inside middleware, which
   * surfaces as a bare "Internal Server Error" on every route — including the
   * login page — with nothing in the response to say why. A deployment missing
   * its variables looks identical to a broken build. Returning 503 with the
   * names of the missing variables turns a mystery into a two-minute fix.
   *
   * Note this deliberately does NOT fall through to unauthenticated access:
   * an unconfigured app serves nothing rather than serving everything.
   */
  const config = checkSupabaseEnv();
  if (!config.ok) {
    console.error(
      `[config] Missing ${config.missing.join(", ")} — every request will fail until these are set.`,
    );
    return misconfiguredResponse(config.missing);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(config.env.url, config.env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() revalidates against the auth server. getSession() only reads the
  // cookie, which a client could have forged — never gate on it.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isDeviceRoute = DEVICE_PATHS.some((p) => pathname.startsWith(p));
  const isPublicRoute = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (isDeviceRoute) return response;

  if (!user && !isPublicRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    // Send them back where they were headed once signed in.
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && pathname === "/login") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

/** A readable page rather than an opaque 500, for whoever is deploying. */
function misconfiguredResponse(missing: string[]) {
  const items = missing.map((name) => `<li><code>${name}</code></li>`).join("");

  return new NextResponse(
    `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Configuration required</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
 body{font:15px/1.6 system-ui,-apple-system,sans-serif;background:#faf9f7;color:#1a1a1a;
      display:grid;place-items:center;min-height:100vh;margin:0;padding:1.5rem}
 .card{max-width:34rem;background:#fff;border-radius:1.5rem;padding:2rem;
       box-shadow:0 8px 24px rgb(0 0 0/.06)}
 h1{font-size:1.25rem;margin:0 0 .5rem}
 code{background:#f2efe9;padding:.15rem .4rem;border-radius:.3rem;font-size:.9em}
 ul{margin:.75rem 0 1.25rem;padding-left:1.25rem}
 p{color:#555;margin:0 0 .75rem}
</style></head>
<body><div class="card">
<h1>RadoFlow is not configured yet</h1>
<p>The server started, but these environment variables are missing:</p>
<ul>${items}</ul>
<p>Set them on your host — on Railway that is your service &rarr; <strong>Variables</strong> —
then redeploy. The values are in Supabase &rarr; <strong>Project Settings &rarr; API</strong>.</p>
<p>Visit <code>/api/health</code> for a machine-readable version of this check.</p>
</div></body></html>`,
    {
      status: 503,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    },
  );
}
