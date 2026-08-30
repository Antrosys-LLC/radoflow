"use client";

import { useEffect, useState } from "react";
import { MessageCircleQuestion, X } from "lucide-react";

import { cn } from "@/lib/utils";

import { AssistantConversation } from "./assistant-conversation";

/**
 * The floating "Ask" button, bottom-right on every signed-in screen.
 *
 * The whole point of this assistant is that someone who cannot navigate the
 * app — or read the menu labels — can still get an answer. Living only at
 * /assistant undercut that: you had to find it first. Here it follows the
 * person around, so the question can be asked from wherever they already are.
 *
 * Sits above the mobile navigation and the Antrosys ribbon rather than on top
 * of either; both are fixed to the bottom of the viewport, so the offsets
 * below are what keeps this from covering their tap targets.
 */
export function AssistantWidget({
  firstName,
  hasRibbon,
}: {
  firstName: string;
  /** The Antrosys strip is fixed along the bottom on desktop when shown. */
  hasRibbon: boolean;
}) {
  const [open, setOpen] = useState(false);

  // Escape closes the panel — expected of anything overlaying the page, and
  // the only way out for someone navigating by keyboard.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Mobile: clear the bottom nav (76px). Desktop: clear the ribbon when shown.
  const bottomOffset = cn("bottom-[88px]", hasRibbon ? "lg:bottom-14" : "lg:bottom-6");

  return (
    <>
      {open ? (
        <div
          className={cn(
            "fixed right-3 z-50 flex w-[calc(100vw-1.5rem)] max-w-[26rem] flex-col rounded-3xl border border-border bg-card p-4 shadow-[0_18px_40px_rgb(0_0_0/0.18)] sm:right-5",
            "max-h-[min(34rem,calc(100vh-11rem))]",
            bottomOffset,
          )}
          role="dialog"
          aria-label="Ask the assistant"
        >
          <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                <MessageCircleQuestion className="size-4" />
              </span>
              <div className="leading-tight">
                <p className="text-sm font-bold text-foreground">Ask</p>
                <p className="text-[11px] text-muted-foreground">Attendance, leave and payroll</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>

          <AssistantConversation firstName={firstName} compact />
        </div>
      ) : null}

      {/* Hidden while the panel is open: the panel carries its own close
          button, and a second floating control would only need to dodge it. */}
      {open ? null : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ask a question"
          aria-expanded={false}
          className={cn(
            "fixed right-3 z-50 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_10px_24px_rgb(239_86_25/0.35)] transition-all hover:-translate-y-0.5 sm:right-5",
            bottomOffset,
          )}
        >
          <MessageCircleQuestion className="size-6" />
        </button>
      )}
    </>
  );
}
