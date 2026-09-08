"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { toast } from "sonner";

import { useDictionary, useLanguage } from "@/components/language-provider";
import { Card } from "@/components/ui-kit";
import { dictionaryFor, LANGUAGE_LABELS, type LanguageCode } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import { setLanguage } from "./actions";

/**
 * The one control on an otherwise read-only profile.
 *
 * Each language is named in its own script — اردو stays اردو while the
 * interface is still English — because a person who cannot read the interface
 * is exactly the person looking for this control, and a list of English names
 * would be no help to them.
 */

const INITIAL = { ok: false, message: "" };

export function LanguageToggle() {
  const t = useDictionary();
  const current = useLanguage();
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  /*
   * Held separately from the context so the button lights up on the tap rather
   * than after the round trip. Null means "no choice pending" — the context is
   * the truth. After a successful save the two agree, so this is not cleared;
   * clearing it would flash the old language back until the refresh lands.
   */
  const [chosen, setChosen] = useState<LanguageCode | null>(null);
  const selected = chosen ?? current;

  function choose(language: LanguageCode) {
    if (language === selected || pending) return;

    const element = form.current;
    if (!element) return;

    /*
     * The clicked language is set on the FormData rather than read out of the
     * hidden input: a state update has not reached the DOM by the time this
     * runs, so the input still holds the previous choice.
     */
    const data = new FormData(element);
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
    <Card className="p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <Languages className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-bold text-foreground">{t.profile.language}</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t.profile.languageHint}</p>

      <form ref={form} onSubmit={(event) => event.preventDefault()} className="mt-3 flex gap-2">
        <input type="hidden" name="language" value={selected} readOnly />

        {(Object.keys(LANGUAGE_LABELS) as LanguageCode[]).map((language) => (
          <button
            key={language}
            type="button"
            lang={language === "ur" ? "ur" : language === "roman-ur" ? "ur-Latn" : "en"}
            aria-pressed={selected === language}
            disabled={pending}
            onClick={() => choose(language)}
            className={cn(
              "flex-1 rounded-2xl px-3 py-2.5 text-sm font-bold transition-all disabled:opacity-60",
              selected === language
                ? "bg-primary text-primary-foreground shadow-[0_10px_24px_rgb(239_86_25/0.25)]"
                : "bg-secondary text-muted-foreground hover:text-foreground",
            )}
          >
            {LANGUAGE_LABELS[language]}
          </button>
        ))}
      </form>
    </Card>
  );
}
