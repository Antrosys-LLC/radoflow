"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { useDictionary } from "@/components/language-provider";
import { Latin } from "@/components/latin";
import { PAKISTAN_LOCALE, PAKISTAN_TIMEZONE } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * The factory clock and the factory date, as two separate controls.
 *
 * Pinned to Asia/Karachi rather than the browser's zone: a manager checking in
 * from anywhere has to read the same time the floor is working to.
 *
 * They were one block. Splitting them is not decoration — each half answers a
 * different question and now opens the thing that answers it properly. The
 * date opens a month you can page through and jump around; the time opens a
 * face, which is how most of the people here read a clock and how none of them
 * read `14:07:33`.
 */

/** Ticks once a second, without writing state from an effect. */
function subscribeToSeconds(onChange: () => void): () => void {
  const timer = setInterval(onChange, 1000);
  return () => clearInterval(timer);
}

function nowMs(): number {
  return Date.now();
}

/** The parts of an instant, on the factory's clock rather than the browser's. */
function pakistanParts(at: number) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: PAKISTAN_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(at));

  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);

  return {
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
    year: get("year"),
    month: get("month"),
    day: get("day"),
  };
}

export function ClockAndDate() {
  const t = useDictionary();
  // Zero on the server: the browser's clock is the only one that can be right,
  // and rendering a server time guarantees a hydration mismatch.
  const at = useSyncExternalStore(subscribeToSeconds, nowMs, () => 0);
  const [open, setOpen] = useState<"none" | "date" | "time">("none");
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open === "none") return;

    function onPointerDown(event: MouseEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen("none");
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen("none");
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const ready = at > 0;
  const time = ready
    ? new Intl.DateTimeFormat(PAKISTAN_LOCALE, {
        timeZone: PAKISTAN_TIMEZONE,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }).format(new Date(at))
    : "--:--:--";

  const date = ready
    ? new Intl.DateTimeFormat(PAKISTAN_LOCALE, {
        timeZone: PAKISTAN_TIMEZONE,
        weekday: "short",
        day: "numeric",
        month: "short",
      }).format(new Date(at))
    : "—";

  return (
    <div ref={container} className="relative hidden md:block">
      <div className="flex items-stretch gap-1.5">
        <button
          type="button"
          onClick={() => setOpen((was) => (was === "time" ? "none" : "time"))}
          aria-expanded={open === "time"}
          aria-haspopup="dialog"
          aria-label={t.clock.showClock}
          title={t.clock.showClock}
          className="rounded-2xl bg-secondary px-3 py-2 text-sm font-semibold tabular-nums text-foreground transition-colors hover:text-primary"
        >
          <Latin>{time}</Latin>
        </button>

        <button
          type="button"
          onClick={() => setOpen((was) => (was === "date" ? "none" : "date"))}
          aria-expanded={open === "date"}
          aria-haspopup="dialog"
          aria-label={t.clock.showCalendar}
          title={t.clock.showCalendar}
          className="rounded-2xl bg-secondary px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-primary"
        >
          <Latin>{date}</Latin>
          <span className="ms-1 opacity-70">
            <Latin>PKT</Latin>
          </span>
        </button>
      </div>

      {open !== "none" ? (
        <div
          role="dialog"
          aria-label={open === "time" ? t.clock.showClock : t.clock.showCalendar}
          className="absolute end-0 z-50 mt-2 rounded-3xl border border-border bg-card p-4 shadow-[0_18px_40px_rgb(0_0_0/0.18)]"
        >
          <div className="mb-2 flex items-center justify-end">
            <button
              type="button"
              onClick={() => setOpen("none")}
              aria-label={t.common.close}
              className="rounded-xl bg-secondary p-1.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>

          {open === "time" ? <AnalogClock at={at} /> : <MonthCalendar at={at} />}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A clock face.
 *
 * Drawn rather than described, because a face is how most people on this floor
 * read a time — and because the digits are already in the header two
 * centimetres away, so a second set of digits would be the one thing this
 * could show that adds nothing.
 */
function AnalogClock({ at }: { at: number }) {
  const t = useDictionary();
  const { hour, minute, second } = pakistanParts(at);

  // Degrees clockwise from twelve. The hour hand carries the minutes with it,
  // or it jumps an hour at a time and reads wrong for fifty-nine of every sixty.
  const secondAngle = second * 6;
  const minuteAngle = minute * 6 + second * 0.1;
  const hourAngle = (hour % 12) * 30 + minute * 0.5;

  return (
    <div className="flex w-[15rem] flex-col items-center gap-3">
      <svg viewBox="0 0 200 200" className="size-44" role="img" aria-label={t.clock.showClock}>
        <circle cx="100" cy="100" r="94" className="fill-secondary" />
        <circle cx="100" cy="100" r="94" className="fill-none stroke-border" strokeWidth="2" />

        {/* Twelve marks, the quarters longer. Numerals were tried and dropped:
            at this size they crowd the hands without being read. */}
        {Array.from({ length: 12 }).map((_, index) => {
          const angle = (index * 30 * Math.PI) / 180;
          const quarter = index % 3 === 0;
          const outer = 86;
          const inner = quarter ? 72 : 79;

          return (
            <line
              key={index}
              x1={100 + Math.sin(angle) * inner}
              y1={100 - Math.cos(angle) * inner}
              x2={100 + Math.sin(angle) * outer}
              y2={100 - Math.cos(angle) * outer}
              className={quarter ? "stroke-foreground" : "stroke-muted-foreground/50"}
              strokeWidth={quarter ? 4 : 2}
              strokeLinecap="round"
            />
          );
        })}

        <Hand angle={hourAngle} length={48} width={6} className="stroke-foreground" />
        <Hand angle={minuteAngle} length={70} width={4} className="stroke-foreground" />
        <Hand angle={secondAngle} length={78} width={2} className="stroke-primary" />

        <circle cx="100" cy="100" r="5" className="fill-primary" />
      </svg>

      <p className="text-xs text-muted-foreground">{t.clock.factoryTime}</p>
    </div>
  );
}

function Hand({
  angle,
  length,
  width,
  className,
}: {
  angle: number;
  length: number;
  width: number;
  className: string;
}) {
  const radians = (angle * Math.PI) / 180;

  return (
    <line
      x1={100 - Math.sin(radians) * 12}
      y1={100 + Math.cos(radians) * 12}
      x2={100 + Math.sin(radians) * length}
      y2={100 - Math.cos(radians) * length}
      className={className}
      strokeWidth={width}
      strokeLinecap="round"
    />
  );
}

/** Sunday first, matching the working calendar and `Date.getDay()`. */
const WEEKDAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

/**
 * A month, with a way to get to any other one.
 *
 * Three ways, because they are three different needs: the arrows for "last
 * month", the two selects for "March, two years ago", and a date field for
 * "the fourteenth" — which is the one somebody reaches for when they already
 * know the date and do not want to page to it.
 */
function MonthCalendar({ at }: { at: number }) {
  const t = useDictionary();
  const today = pakistanParts(at);

  const [year, setYear] = useState(today.year);
  // 1-12 as people say it; converted where the Date API wants 0-11.
  const [month, setMonth] = useState(today.month);

  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const monthName = new Intl.DateTimeFormat(PAKISTAN_LOCALE, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));

  function step(by: number) {
    const next = new Date(Date.UTC(year, month - 1 + by, 1));
    setYear(next.getUTCFullYear());
    setMonth(next.getUTCMonth() + 1);
  }

  // A decade either side: far enough for a payroll question about last year
  // and near enough that the list is still a list.
  const years = Array.from({ length: 21 }, (_, index) => today.year - 10 + index);

  return (
    <div className="w-[19rem]">
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label={t.clock.previousMonth}
          className="rounded-xl bg-secondary p-2 text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4 rtl-flip" aria-hidden />
        </button>

        <p className="flex-1 text-center text-sm font-bold text-foreground">
          <Latin>{monthName}</Latin>
        </p>

        <button
          type="button"
          onClick={() => step(1)}
          aria-label={t.clock.nextMonth}
          className="rounded-xl bg-secondary p-2 text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronRight className="size-4 rtl-flip" aria-hidden />
        </button>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <select
          value={month}
          onChange={(event) => setMonth(Number(event.target.value))}
          aria-label={t.clock.month}
          className="rounded-xl border border-input bg-background px-2 py-1.5 text-xs font-semibold outline-none focus:border-primary"
        >
          {Array.from({ length: 12 }, (_, index) => (
            <option key={index} value={index + 1}>
              {new Intl.DateTimeFormat(PAKISTAN_LOCALE, {
                month: "long",
                timeZone: "UTC",
              }).format(new Date(Date.UTC(2020, index, 1)))}
            </option>
          ))}
        </select>

        <select
          value={year}
          onChange={(event) => setYear(Number(event.target.value))}
          aria-label={t.clock.year}
          className="rounded-xl border border-input bg-background px-2 py-1.5 font-latin text-xs font-semibold outline-none focus:border-primary"
        >
          {years.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAY_KEYS.map((key) => (
          <span key={key} className="py-1 text-[10px] font-bold text-muted-foreground">
            {/* The first letter of each day, in the reader's own language. */}
            {t.calendar.weekday[key].slice(0, 1)}
          </span>
        ))}

        {Array.from({ length: firstWeekday }, (_, index) => (
          <span key={`pad-${index}`} />
        ))}

        {Array.from({ length: daysInMonth }, (_, index) => {
          const day = index + 1;
          const isToday = year === today.year && month === today.month && day === today.day;

          return (
            <span
              key={day}
              className={cn(
                "rounded-lg py-1.5 font-latin text-xs tabular-nums",
                isToday
                  ? "bg-primary font-bold text-primary-foreground"
                  : "text-foreground hover:bg-secondary",
              )}
            >
              {day}
            </span>
          );
        })}
      </div>

      <label className="mt-3 block">
        <span className="text-[11px] font-semibold text-muted-foreground">{t.clock.goToDate}</span>
        <input
          type="date"
          dir="ltr"
          onChange={(event) => {
            const [y, m] = event.target.value.split("-");
            if (!y || !m) return;
            setYear(Number(y));
            setMonth(Number(m));
          }}
          className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 font-latin text-xs outline-none focus:border-primary"
        />
      </label>

      <button
        type="button"
        onClick={() => {
          setYear(today.year);
          setMonth(today.month);
        }}
        className="mt-2 w-full rounded-xl bg-secondary px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:text-primary"
      >
        {t.common.today}
      </button>
    </div>
  );
}
