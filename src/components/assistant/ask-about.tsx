"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

import { ClaudeIcon } from "@/components/claude-icon";

import { AssistantConversation, type Preset } from "@/components/assistant/assistant-conversation";
import { useDictionary } from "@/components/language-provider";
import { Latin } from "@/components/latin";
import type { AskContext } from "@/lib/assistant/context";
import { cn } from "@/lib/utils";

/**
 * "Ask about this" — the assistant, attached to one record.
 *
 * The floating widget answers questions about the factory. This answers
 * questions about the thing under your finger: this payslip, this person, this
 * month's report, this canteen scan. The difference is not the model, it is
 * that the record already on screen is sent with the question, so "why is this
 * one short" has a "this" to refer to.
 *
 * Deliberately the same conversation component the widget and the /assistant
 * page use — same voice input, same three answer languages, same effort dial,
 * same cost line. A second chat interface that drifted from the first is worse
 * than no second chat interface.
 *
 * Rendered only where the reader can already see the record: the context is
 * assembled by the screen from data it has loaded through the reader's own
 * session, and the assistant's tools run through that session too, so this
 * cannot become a way to see past Row Level Security.
 */

export function AskAbout({
  context,
  presets,
  /** The record's name, shown at the top of the panel so it is unambiguous. */
  label,
  /** `icon` fits on a crowded row; `full` reads as a button on a card header. */
  variant = "full",
  className,
}: {
  context: AskContext;
  presets?: Preset[];
  label?: string;
  variant?: "full" | "icon";
  className?: string;
}) {
  const t = useDictionary();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div ref={container} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t.ask.askAboutThis}
        title={t.ask.askAboutThis}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-2xl font-bold transition-all hover:-translate-y-0.5",
          variant === "icon"
            ? "bg-card px-2.5 py-2 text-xs text-muted-foreground hover:text-primary"
            : "bg-primary-soft px-3 py-2 text-xs text-primary",
        )}
      >
        <ClaudeIcon className="size-3.5 shrink-0" />
        {variant === "full" ? t.ask.askClaude : null}
      </button>

      {open ? (
        <>
          {/* A full-screen backdrop rather than an outside-click listener: the
              panel holds a text field and a microphone, and a stray click
              inside it closing the thread mid-question is the one failure
              nobody forgives. */}
          <button
            type="button"
            aria-label={t.common.close}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default bg-charcoal/20 backdrop-blur-[1px]"
          />

          <div
            role="dialog"
            aria-label={t.ask.askAboutThis}
            className="fixed inset-x-3 bottom-3 z-50 flex max-h-[min(34rem,calc(100vh-6rem))] flex-col rounded-3xl border border-border bg-card p-4 shadow-[0_18px_40px_rgb(0_0_0/0.18)] sm:absolute sm:inset-x-auto sm:bottom-auto sm:end-0 sm:top-full sm:mt-2 sm:w-[26rem]"
          >
            <div className="mb-3 flex shrink-0 items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                  <ClaudeIcon className="size-4" />
                </span>
                <div className="min-w-0 leading-tight">
                  <p className="text-sm font-bold text-foreground">{t.ask.askClaude}</p>
                  {/* The record's own name, so there is no doubt which one the
                      answers are about — a name or a period, therefore
                      wrapped rather than translated. */}
                  <p className="truncate text-[11px] text-muted-foreground">
                    {label ? <Latin>{label}</Latin> : t.ask.widgetSubtitle}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t.common.close}
                className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <AssistantConversation
              firstName={t.common.nameFallback}
              compact
              context={context}
              greeting={t.ask.askAboutGreeting}
              {...(presets ? { presets } : {})}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
