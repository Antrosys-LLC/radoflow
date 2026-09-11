import type { Metadata, Viewport } from "next";
import { Noto_Nastaliq_Urdu, Plus_Jakarta_Sans } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";
import { Providers } from "./providers";
import { cookies } from "next/headers";

import { getSession } from "@/lib/auth/session";
import { directionFor } from "@/lib/i18n";
import { resolveThemeChoice, THEME_COOKIE, THEME_SCRIPT, themeAttributes } from "@/lib/theme";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-plus-jakarta",
});

const notoNastaliqUrdu = Noto_Nastaliq_Urdu({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-nastaliq",
  /*
   * Fetched when something on the page actually asks for it, not on every
   * load. Nastaliq is a large calligraphic face and most sessions here are in
   * English or Roman Urdu, which never render a glyph of it — preloading it
   * for them is the biggest single download the app could avoid. An Urdu
   * screen still gets it immediately, and `display: swap` keeps the text
   * readable while it arrives rather than blank.
   */
  preload: false,
  // Metric-matched fallback, so the swap does not reflow the page.
  fallback: ["serif"],
});

export const metadata: Metadata = {
  title: {
    default: "Rado Attendance & Payroll",
    template: "%s | Rado Attendance & Payroll",
  },
  description: "Attendance and payroll management for Rado Dyeing and Textile.",
  authors: [{ name: "Antrosys" }],
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "RadoFlow",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: { type: "website" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#153B44",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  /*
   * Read here rather than in the (app) layout because `<html>` lives here, and
   * `dir` has to be on it. This layout also covers /login, where there is no
   * session — `getSession()` returns null and English is used, which is right
   * for a sign-in page nobody has identified themselves on yet.
   */
  const [session, store] = await Promise.all([getSession(), cookies()]);
  const language = session?.profile.language ?? "en";

  /*
   * The theme, painted server-side wherever it can be.
   *
   * A stored light/dark choice is stamped here, so the document arrives in the
   * right colours and never flashes. `system` is the one case the server
   * cannot answer — only the device knows what it prefers — so it is left
   * unstamped and resolved by THEME_SCRIPT before the first paint.
   */
  const themeChoice = resolveThemeChoice(store.get(THEME_COOKIE)?.value);
  const theme = themeChoice === "system" ? null : themeAttributes(themeChoice);

  return (
    <html
      lang={language === "roman-ur" ? "ur-Latn" : language}
      dir={directionFor(language)}
      className={`${plusJakartaSans.variable} ${notoNastaliqUrdu.variable} ${theme?.className ?? ""}`}
      data-language={language}
      {...(theme ? { "data-theme": theme["data-theme"] } : {})}
      // The server-rendered class list and the one the theme script leaves
      // behind differ by design on a `system` device; without this React
      // reports it as a hydration mismatch on every load.
      suppressHydrationWarning
    >
      <head>
        {/* Before the first paint, or the flash this exists to prevent
            happens anyway. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
