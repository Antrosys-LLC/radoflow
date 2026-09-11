"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";

import { useDictionary } from "@/components/language-provider";
import { applyTheme, type ThemeChoice } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * Light, dark, or follow the phone.
 *
 * Applied to the document immediately and written to a cookie for the next
 * request — never through a server action and a re-render. A theme that takes
 * a round trip to change feels broken in a way a language does not, because
 * the whole screen is the feedback.
 *
 * `system` is the default and stays a real choice rather than a starting
 * value: a phone that switches to dark at sunset should take the app with it,
 * and the only way to say that is to have an option for it.
 */

const ICONS: Record<ThemeChoice, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

/**
 * The icon for one choice.
 *
 * A component rather than a `const Icon = ICONS[choice]` in the middle of
 * render: pulling a component type out of a lookup and calling it inline is
 * indistinguishable, to React's lint rules and to a reader, from mutating one.
 */
function ThemeIcon({ choice, className }: { choice: ThemeChoice; className?: string }) {
  const Icon = ICONS[choice];
  return <Icon className={className} aria-hidden />;
}

export function ThemeSwitch({ initial }: { initial: ThemeChoice }) {
  const t = useDictionary();
  const container = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<ThemeChoice>(initial);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  /*
   * On `system`, follow the device as it changes — a phone that goes dark at
   * sunset should take an open tab with it rather than waiting for a reload.
   * Nothing to listen to on an explicit choice.
   */
  useEffect(() => {
    if (choice !== "system" || typeof window === "undefined") return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [choice]);

  function choose(next: ThemeChoice) {
    setOpen(false);
    setChoice(next);
    applyTheme(next);
  }

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t.theme.label}
        title={t.theme.label}
        className="flex size-9 items-center justify-center rounded-2xl bg-secondary text-foreground transition-all hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <ThemeIcon choice={choice} className="size-4" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute end-0 z-50 mt-2 w-44 overflow-hidden rounded-2xl border border-border bg-card shadow-[0_18px_40px_rgb(0_0_0/0.18)]"
        >
          <p className="border-b border-border px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            {t.theme.label}
          </p>
          {(["light", "dark", "system"] as ThemeChoice[]).map((option) => (
            <button
              key={option}
              type="button"
              role="menuitemradio"
              aria-checked={choice === option}
              onClick={() => choose(option)}
              className={cn(
                "flex w-full items-center gap-3 px-4 py-3 text-sm font-semibold transition-colors hover:bg-secondary",
                choice === option ? "text-primary" : "text-foreground",
              )}
            >
              <ThemeIcon choice={option} className="size-4 shrink-0" />
              <span className="flex-1 text-start">{t.theme[option]}</span>
              {choice === option ? <Check className="size-4" aria-hidden /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
