import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session on every request and gates protected routes.
 *
 * Supabase access tokens are short-lived; without this the user is silently
 * signed out mid-session. The refreshed cookies must be written onto the
 * response that is actually returned, which is why the response object is
 * threaded through rather than recreated.
 */

const PUBLIC_PATHS = ["/login", "/auth"];

/** The terminal posts here with its own shared secret, not a user session. */
const DEVICE_PATHS = ["/iclock"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
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
    },
  );

  // getUser() revalidates against the auth server. getSession() only reads the
  // cookie, which a client could have forged — never gate on it.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
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
