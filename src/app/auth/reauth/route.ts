import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Ends a session whose access changed underneath it.
 *
 * Someone whose role was edited is still holding a valid cookie, so redirecting
 * them straight to /login would bounce off the middleware and back into the app
 * they are no longer authorised for. Signing them out here clears the cookie
 * first, so the login page will actually receive them.
 *
 * A GET rather than an action because it is reached by redirect from a server
 * component, which cannot mutate cookies mid-render. It is safe to repeat: the
 * worst a stray request can do is sign the caller out.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("reason", "access-changed");

  return NextResponse.redirect(url);
}
