"use client";

import * as SliderPrimitive from "@radix-ui/react-slider";
import { Gauge, HelpCircle } from "lucide-react";

import { useDictionary } from "@/components/language-provider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EFFORT_LEVELS, type EffortLevel } from "@/lib/assistant/models";
import { cn } from "@/lib/utils";

/**
 * How hard Claude should think, as a dial beside the send button.
 *
 * Five buttons above the conversation took a full row on a phone and read as
 * five different kinds of question. It is one setting with an order to it —
 * quicker and cheaper at one end, slower and more careful at the other — so it
 * is drawn as a slider with those two ends named, tucked behind one button
 * that says where it is set.
 */

/** Must match the thumb's width in pixels, so the stops sit under its centre. */
const THUMB_PX = 16;

export function EffortPicker({
  value,
  onChange,
  compact = false,
}: {
  value: EffortLevel;
  onChange: (level: EffortLevel) => void;
  compact?: boolean;
}) {
  const t = useDictionary();
  const index = Math.max(
    0,
    EFFORT_LEVELS.findIndex((level) => level.value === value),
  );
  const words = t.ask.effort[value];
  const last = EFFORT_LEVELS.length - 1;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${t.ask.effortTitle}: ${words.label}`}
          title={`${t.ask.effortTitle}: ${words.label}`}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-2xl bg-secondary font-bold text-foreground transition-all hover:bg-primary-soft hover:text-primary",
            compact ? "h-10 px-2.5 text-[0.7rem]" : "h-12 px-3.5 text-xs",
          )}
        >
          <Gauge className="size-4" aria-hidden />
          <span>{compact ? words.short : words.label}</span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="end"
        sideOffset={8}
        className="w-72 rounded-2xl border-border bg-card p-4 shadow-[0_18px_40px_rgb(0_0_0/0.14)]"
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm">
            <span className="text-muted-foreground">{t.ask.effortTitle}</span>
            <span className="ms-2 font-bold text-foreground">{words.label}</span>
          </p>
          <span title={words.hint} className="text-muted-foreground">
            <HelpCircle className="size-4" aria-hidden />
          </span>
        </div>

        {/* Left to right in every language: "faster" and "smarter" are the two
            ends of one scale, and a mirrored scale would put the thumb on the
            opposite word from the one the button says. */}
        <div dir="ltr">
          <div className="mt-4 flex justify-between text-xs text-muted-foreground">
            <span>{t.ask.faster}</span>
            <span>{t.ask.smarter}</span>
          </div>

          <SliderPrimitive.Root
            min={0}
            max={last}
            step={1}
            value={[index]}
            onValueChange={([next]) => {
              const level = EFFORT_LEVELS[next ?? index];
              if (level) onChange(level.value);
            }}
            aria-label={t.ask.effortTitle}
            className="relative mt-2 flex h-9 w-full touch-none select-none items-center"
          >
            <SliderPrimitive.Track className="relative h-9 w-full grow overflow-hidden rounded-xl bg-secondary">
              <SliderPrimitive.Range className="absolute h-full bg-muted-foreground/20" />
              {EFFORT_LEVELS.map((level, i) => {
                const fraction = last === 0 ? 0 : i / last;
                return (
                  <span
                    key={level.value}
                    aria-hidden
                    className="absolute top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground/60"
                    style={{
                      left: `calc(${fraction * 100}% + ${(0.5 - fraction) * THUMB_PX}px)`,
                    }}
                  />
                );
              })}
            </SliderPrimitive.Track>
            <SliderPrimitive.Thumb
              className="block h-7 rounded-full border border-border bg-card shadow-md outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-primary/40"
              style={{ width: THUMB_PX }}
            />
          </SliderPrimitive.Root>
        </div>

        <p className="mt-3 text-[11px] text-muted-foreground">{words.hint}</p>
      </PopoverContent>
    </Popover>
  );
}
