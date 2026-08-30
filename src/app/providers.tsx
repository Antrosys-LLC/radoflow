"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";

/**
 * Client-side providers only. The application shell lives in the (app) route
 * group so that /login renders without a sidebar or a session lookup.
 */
export function Providers({ children }: { children: ReactNode }) {
  // Lazily created once per browser session; a module-level client would be
  // shared across requests on the server.
  const [queryClient] = useState(() => new QueryClient());

  // Registers the app-shell service worker so the browser (and Android/iOS
  // "Add to Home Screen") treats this as an installable app. Failing quietly
  // is deliberate — an unsupported browser should just behave like a normal
  // website, not show an error.
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
  );
}
