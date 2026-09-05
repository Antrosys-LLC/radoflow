import type { Metadata, Viewport } from "next";
import { Noto_Nastaliq_Urdu, Plus_Jakarta_Sans } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";
import { Providers } from "./providers";
import { getSession } from "@/lib/auth/session";
import { directionFor } from "@/lib/i18n";

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
  const session = await getSession();
  const language = session?.profile.language ?? "en";

  return (
    <html
      lang={language === "roman-ur" ? "ur-Latn" : language}
      dir={directionFor(language)}
      className={`${plusJakartaSans.variable} ${notoNastaliqUrdu.variable}`}
      data-language={language}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
