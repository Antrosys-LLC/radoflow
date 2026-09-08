"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Languages } from "lucide-react";
import { toast } from "sonner";

import { setLanguage } from "@/app/(app)/me/profile/actions";
import { useDictionary, useLanguage } from "@/components/language-provider";
import { dictionaryFor, LANGUAGE_LABELS, type LanguageCode } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * The language switch, in the top bar of every signed-in screen.
 *
 * The same preference the profile page owns — this writes through the very
 * same server action, so there is one place the choice is stored and no way
 * for the two controls to disagree. What it adds is reach: a person who
 * cannot read the interface cannot navigate to a settings page to fix that,
 * so the control has to be where they already are.
 *
 * Each language is named in its own script for the same reason. اردو stays
 * اردو while the interface is still English.
 */

const INITIAL = { ok: false, message: "" };

/** Two letters wide, so the closed button fits beside the clock on a phone. */
const SHORT: Record<LanguageCode, string> = { en: "EN", ur: "اردو", "roman-ur": "UR" };

export function LanguageSwitch() {
  const t = useDictionary();
  const current = useLanguage();
  const router = useRouter();
  const container = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  /*
   * Held separately from the context so the tapped language lights up at the
   * tap rather than after the round trip. Not cleared on success — by then the
   * two agree, and clearing would flash the old language back until the
   * refresh lands.
   */
  const [chosen, setChosen] = useState<LanguageCode | null>(null);
  const selected = chosen ?? current;

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

  function choose(language: LanguageCode) {
    setOpen(false);
    if (language === selected || pending) return;

    const data = new FormData();
    data.set("language", language);
    setChosen(language);

    startTransition(async () => {
      const result = await setLanguage(INITIAL, data);

      if (result.ok) {
        // Confirmed in the language just chosen, not the one being left — it
        // is the first sentence of the new interface.
        toast.success(dictionaryFor(language).profile.languageSaved);
      } else {
        setChosen(null);
        toast.error(result.message || t.profile.languageFailed);
      }

      router.refresh();
    });
  }

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t.profile.language}
        title={t.profile.language}
        className="flex items-center gap-1.5 rounded-2xl bg-secondary px-3 py-2 text-xs font-bold text-foreground transition-all hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
      >
        <Languages className="size-4 text-muted-foreground" aria-hidden />
        <span lang={selected === "en" ? "en" : selected === "ur" ? "ur" : "ur-Latn"}>
          {SHORT[selected]}
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute end-0 z-50 mt-2 w-44 overflow-hidden rounded-2xl border border-border bg-card shadow-[0_18px_40px_rgb(0_0_0/0.18)]"
        >
          <p className="border-b border-border px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            {t.profile.language}
          </p>
          {(Object.keys(LANGUAGE_LABELS) as LanguageCode[]).map((language) => (
            <button
              key={language}
              type="button"
              role="menuitemradio"
              aria-checked={selected === language}
              lang={language === "en" ? "en" : language === "ur" ? "ur" : "ur-Latn"}
              onClick={() => choose(language)}
              className={cn(
                "flex w-full items-center justify-between gap-3 px-4 py-3 text-sm font-semibold transition-colors hover:bg-secondary",
                selected === language ? "text-primary" : "text-foreground",
              )}
            >
              {LANGUAGE_LABELS[language]}
              {selected === language ? <Check className="size-4" aria-hidden /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
