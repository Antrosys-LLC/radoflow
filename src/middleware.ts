import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files. The biometric
     * ingestion routes are matched too, but updateSession lets them straight
     * through — they authenticate the device, not a person.
     *
     * `sw.js` and `manifest.webmanifest` are excluded by name, and that is not
     * tidiness. A browser fetches both without credentials, so they were being
     * redirected to /login — and a service worker whose script answers with a
     * redirect is refused outright ("The script resource is behind a redirect,
     * which is disallowed"). Registration failed silently on every single
     * load, which is why the app never actually installed to a home screen.
     */
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sw.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
