"use client";

import { useId, useState } from "react";

import { cn } from "@/lib/utils";

import {
  arcs,
  axisMax,
  axisTicks,
  barPercent,
  linePath,
  plotArea,
  radialBar,
  scaleLinear,
  scatterBounds,
  stackedBars,
  xForIndex,
  yFor,
  type PlotBox,
} from "./chart-geometry";

/**
 * The chart kit, drawn as plain SVG.
 *
 * No charting library: the shapes here are bars and a line, and a dependency
 * that ships its own theme, tooltip and accessibility model would be more code
 * to fight than to write. Everything is driven by the tokens below, so the two
 * colour modes swap in one place.
 *
 * Every chart ships a table underneath. Colour is never the only way to read a
 * value — a figure someone is going to argue about in a pay meeting has to be
 * legible to a colourblind reader, on a printout, and to a screen reader.
 */

/*
 * The eight categorical slots, in fixed order.
 *
 * Validated against both surfaces on the adjacent pairlist — which is the one
 * that applies to slices and stacks, where only neighbours touch. Three of the
 * eight fall below 3:1 against the surface, so every chart using them carries
 * visible labels and a table, which is the relief that permits it.
 *
 * A ninth category is never a generated hue: it folds into "Other".
 */
const CATEGORICAL = [
  "#2a78d6",
  "#eb6834",
  "#1baf7a",
  "#eda100",
  "#e87ba4",
  "#008300",
  "#4a3aa7",
  "#e34948",
] as const;

const CATEGORICAL_DARK = [
  "#3987e5",
  "#d95926",
  "#199e70",
  "#c98500",
  "#d55181",
  "#008300",
  "#9085e9",
  "#e66767",
] as const;

/*
 * Two categorical hues, validated for colour-vision deficiency against both
 * surfaces (worst adjacent ΔE 24.7 light / 26.8 dark, well past the 8 target).
 * Slot order is fixed: duty is always blue, overtime always orange, so a
 * filter that empties one series never repaints the other.
 */
const TOKENS = `
  --viz-surface: var(--card);
  --viz-grid: color-mix(in oklab, var(--muted-foreground) 18%, transparent);
  --viz-series-1: #2a78d6;
  --viz-series-2: #eb6834;
  --viz-seq-500: #256abf;
  --viz-seq-400: #3987e5;
  --viz-seq-250: #86b6ef;
${CATEGORICAL.map((hex, i) => `  --viz-cat-${i}: ${hex};`).join("\n")}
`;

const DARK_TOKENS = `
  --viz-series-1: #3987e5;
  --viz-series-2: #d95926;
  --viz-seq-500: #3987e5;
  --viz-seq-400: #2a78d6;
  --viz-seq-250: #256abf;
${CATEGORICAL_DARK.map((hex, i) => `  --viz-cat-${i}: ${hex};`).join("\n")}
`;

/** Wraps a chart so the tokens resolve, in both modes. */
export function VizRoot({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        .viz-root { ${TOKENS} }
        @media (prefers-color-scheme: dark) {
          :root:where(:not([data-theme="light"])) .viz-root { ${DARK_TOKENS} }
        }
        :root[data-theme="dark"] .viz-root { ${DARK_TOKENS} }
      `}</style>
      <div className="viz-root">{children}</div>
    </>
  );
}

const fmt = (value: number, digits = 0) =>
  value.toLocaleString("en-PK", { maximumFractionDigits: digits, minimumFractionDigits: 0 });

/**
 * How a chart writes its numbers.
 *
 * A name rather than a formatter function, because these components are client
 * components and the pages using them are server components — React cannot
 * serialise a function across that boundary, and it fails at request time with
 * "Functions cannot be passed directly to Client Components" while typecheck
 * and build both stay green.
 */
export type NumberFormat = "plain" | "money" | "hours" | "count";

function formatWith(format: NumberFormat, value: number): string {
  switch (format) {
    case "money":
      return `Rs ${fmt(value, 0)}`;
    case "hours":
      return `${fmt(value, 1)} h`;
    case "count":
      return fmt(value, 0);
    default:
      return fmt(value, 2);
  }
}

function Frame({
  title,
  subtitle,
  children,
  table,
}: {
  title: string;
  subtitle?: string | undefined;
  children: React.ReactNode;
  table: React.ReactNode;
}) {
  return (
    <figure className="rounded-3xl border border-border bg-card p-4 shadow-[0_1px_2px_rgb(0_0_0/0.04)] sm:p-5">
      <figcaption className="mb-3">
        <h3 className="text-sm font-bold tracking-tight text-foreground">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p> : null}
      </figcaption>
      {children}
      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground">
          View as a table
        </summary>
        <div className="mt-2 max-h-64 overflow-auto">{table}</div>
      </details>
    </figure>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: item.color }} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-muted-foreground">
          {head.map((h, i) => (
            <th
              key={h}
              className={i === 0 ? "py-1 pr-3 font-semibold" : "py-1 pr-3 text-right font-semibold"}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={String(row[0])} className="border-t border-border/60">
            {row.map((cell, i) => (
              <td
                key={i}
                className={
                  i === 0
                    ? "py-1 pr-3 text-foreground"
                    : "py-1 pr-3 text-right tabular-nums text-foreground"
                }
              >
                {typeof cell === "number" ? fmt(cell, 2) : cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Nothing to draw is a sentence, not an empty axis. */
function Empty({ message }: { message: string }) {
  return (
    <p className="rounded-2xl bg-secondary px-4 py-10 text-center text-sm text-muted-foreground">
      {message}
    </p>
  );
}

// ---------------------------------------------------------------------------

export interface DayPoint {
  date: string;
  duty: number;
  overtime: number;
}

/**
 * Hours per day, duty and overtime stacked.
 *
 * Stacked rather than grouped: the reader's question is "how long was that
 * day", and the total is the top of the bar rather than something to add up.
 */
export function DailyHours({
  data,
  title,
  subtitle,
}: {
  data: DayPoint[];
  title: string;
  subtitle?: string | undefined;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const clipId = useId();

  if (data.length === 0) {
    return (
      <Frame title={title} subtitle={subtitle} table={null}>
        <Empty message="No attendance in this period." />
      </Frame>
    );
  }

  const BOX: PlotBox = {
    width: 720,
    height: 220,
    padTop: 8,
    padRight: 8,
    padBottom: 24,
    padLeft: 40,
  };
  const W = BOX.width;
  const H = BOX.height;
  const area = plotArea(BOX);

  const max = axisMax(data.map((d) => d.duty + d.overtime));
  const bars = stackedBars(
    data.map((d) => ({ lower: d.duty, upper: d.overtime })),
    area,
    max,
  );
  const ticks = axisTicks(max);

  return (
    <Frame
      title={title}
      subtitle={subtitle}
      table={
        <DataTable
          head={["Date", "Duty", "Overtime", "Total"]}
          rows={data.map((d) => [d.date, d.duty, d.overtime, d.duty + d.overtime])}
        />
      }
    >
      <Legend
        items={[
          { label: "Duty hours", color: "var(--viz-series-1)" },
          { label: "Overtime", color: "var(--viz-series-2)" },
        ]}
      />

      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label={`${title}. ${data.length} days.`}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={area.left} y={area.top} width={area.plotWidth} height={area.plotHeight} />
            </clipPath>
          </defs>

          {ticks.map((tick) => {
            const y = yFor(tick, max, area);
            return (
              <g key={tick}>
                <line
                  x1={area.left}
                  x2={W - BOX.padRight}
                  y1={y}
                  y2={y}
                  stroke="var(--viz-grid)"
                  strokeWidth={1}
                />
                <text
                  x={area.left - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-muted-foreground text-[9px]"
                >
                  {fmt(tick)}
                </text>
              </g>
            );
          })}

          <g clipPath={`url(#${clipId})`}>
            {bars.map((bar, i) => (
              <g
                key={data[i]!.date}
                onMouseEnter={() => setHover(i)}
                opacity={hover === null || hover === i ? 1 : 0.45}
              >
                {/* A full-height target, so the bar need not be hit exactly. */}
                <rect
                  x={bar.slotX}
                  y={area.top}
                  width={bar.slotWidth}
                  height={area.plotHeight}
                  fill="transparent"
                />
                {bar.lowerHeight > 0 ? (
                  <rect
                    x={bar.x}
                    y={bar.lowerY}
                    width={bar.width}
                    height={bar.lowerHeight}
                    rx={2}
                    fill="var(--viz-series-1)"
                  />
                ) : null}
                {bar.upperHeight > 0 ? (
                  <rect
                    x={bar.x}
                    y={bar.upperY}
                    width={bar.width}
                    height={bar.upperHeight}
                    rx={2}
                    fill="var(--viz-series-2)"
                  />
                ) : null}
              </g>
            ))}
          </g>

          <line
            x1={area.left}
            x2={W - BOX.padRight}
            y1={area.bottom}
            y2={area.bottom}
            stroke="var(--viz-grid)"
            strokeWidth={1}
          />

          {/* First and last only: one label per bar is unreadable past a week. */}
          {[0, data.length - 1].map((i) =>
            data[i] ? (
              <text
                key={i}
                x={bars[i]!.slotX + bars[i]!.slotWidth / 2}
                y={H - 8}
                textAnchor={i === 0 ? "start" : "end"}
                className="fill-muted-foreground text-[9px]"
              >
                {data[i]!.date.slice(5)}
              </text>
            ) : null,
          )}
        </svg>

        {hover !== null && data[hover] ? (
          <div
            className="pointer-events-none absolute top-0 rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-lg"
            style={{
              left: `${((hover + 0.5) / data.length) * 100}%`,
              transform: "translateX(-50%)",
            }}
          >
            <p className="font-bold text-foreground">{data[hover]!.date}</p>
            <p className="text-muted-foreground">
              Duty {fmt(data[hover]!.duty, 2)}h · OT {fmt(data[hover]!.overtime, 2)}h
            </p>
          </div>
        ) : null}
      </div>
    </Frame>
  );
}

// ---------------------------------------------------------------------------

export interface PunchPoint {
  date: string;
  checkIns: number;
  checkOuts: number;
}

/**
 * Check-ins against check-outs, per day.
 *
 * The gap is the point. A day where more people clocked in than out is a day
 * with missed punches, and those are the days that produce a wrong payslip —
 * so the two lines are drawn against one axis, where the divergence is visible.
 */
export function PunchTrend({
  data,
  title,
  subtitle,
}: {
  data: PunchPoint[];
  title: string;
  subtitle?: string | undefined;
}) {
  const [hover, setHover] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <Frame title={title} subtitle={subtitle} table={null}>
        <Empty message="No punches in this period." />
      </Frame>
    );
  }

  const BOX: PlotBox = {
    width: 720,
    height: 200,
    padTop: 8,
    padRight: 8,
    padBottom: 24,
    padLeft: 40,
  };
  const W = BOX.width;
  const H = BOX.height;
  const area = plotArea(BOX);

  const max = axisMax(data.flatMap((d) => [d.checkIns, d.checkOuts]));
  const xAt = (i: number) => xForIndex(i, data.length, area);
  const yAt = (v: number) => yFor(v, max, area);

  const mismatched = data.filter((d) => d.checkIns !== d.checkOuts).length;

  return (
    <Frame
      title={title}
      subtitle={subtitle}
      table={
        <DataTable
          head={["Date", "In", "Out", "Unmatched"]}
          rows={data.map((d) => [d.date, d.checkIns, d.checkOuts, d.checkIns - d.checkOuts])}
        />
      }
    >
      <Legend
        items={[
          { label: "Checked in", color: "var(--viz-series-1)" },
          { label: "Checked out", color: "var(--viz-series-2)" },
        ]}
      />

      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label={`${title}. ${mismatched} of ${data.length} days have unmatched punches.`}
          onMouseLeave={() => setHover(null)}
        >
          {axisTicks(max).map((tick) => (
            <g key={tick}>
              <line
                x1={area.left}
                x2={W - BOX.padRight}
                y1={yAt(tick)}
                y2={yAt(tick)}
                stroke="var(--viz-grid)"
                strokeWidth={1}
              />
              <text
                x={area.left - 6}
                y={yAt(tick) + 3}
                textAnchor="end"
                className="fill-muted-foreground text-[9px]"
              >
                {fmt(tick)}
              </text>
            </g>
          ))}

          <path
            d={linePath(
              data.map((d) => d.checkIns),
              area,
              max,
            )}
            fill="none"
            stroke="var(--viz-series-1)"
            strokeWidth={2}
          />
          <path
            d={linePath(
              data.map((d) => d.checkOuts),
              area,
              max,
            )}
            fill="none"
            stroke="var(--viz-series-2)"
            strokeWidth={2}
          />

          {hover !== null ? (
            <line
              x1={xAt(hover)}
              x2={xAt(hover)}
              y1={area.top}
              y2={area.bottom}
              stroke="var(--viz-grid)"
              strokeWidth={1}
            />
          ) : null}

          {data.map((d, i) => (
            <g key={d.date} onMouseEnter={() => setHover(i)}>
              <rect
                x={xAt(i) - area.plotWidth / data.length / 2}
                y={area.top}
                width={Math.max(6, area.plotWidth / data.length)}
                height={area.plotHeight}
                fill="transparent"
              />
              {hover === i ? (
                <>
                  {/* A 2px surface ring keeps the markers apart where they cross. */}
                  <circle
                    cx={xAt(i)}
                    cy={yAt(d.checkIns)}
                    r={4.5}
                    fill="var(--viz-series-1)"
                    stroke="var(--card)"
                    strokeWidth={2}
                  />
                  <circle
                    cx={xAt(i)}
                    cy={yAt(d.checkOuts)}
                    r={4.5}
                    fill="var(--viz-series-2)"
                    stroke="var(--card)"
                    strokeWidth={2}
                  />
                </>
              ) : null}
            </g>
          ))}

          {[0, data.length - 1].map((i) =>
            data[i] ? (
              <text
                key={i}
                x={xAt(i)}
                y={H - 8}
                textAnchor={i === 0 ? "start" : "end"}
                className="fill-muted-foreground text-[9px]"
              >
                {data[i]!.date.slice(5)}
              </text>
            ) : null,
          )}
        </svg>

        {hover !== null && data[hover] ? (
          <div
            className="pointer-events-none absolute top-0 rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-lg"
            style={{
              left: `${((hover + 0.5) / data.length) * 100}%`,
              transform: "translateX(-50%)",
            }}
          >
            <p className="font-bold text-foreground">{data[hover]!.date}</p>
            <p className="text-muted-foreground">
              In {data[hover]!.checkIns} · Out {data[hover]!.checkOuts}
            </p>
          </div>
        ) : null}
      </div>
    </Frame>
  );
}

// ---------------------------------------------------------------------------

export interface RankedItem {
  label: string;
  value: number;
  /** Shown instead of the raw number when set, e.g. "Rs 41,000". */
  display?: string;
}

/**
 * A ranked horizontal bar chart.
 *
 * Horizontal because the labels are department and people names, which do not
 * fit under a vertical bar without turning sideways. One hue, more-is-darker:
 * these compare magnitude, and the categories carry no identity worth a colour.
 */
export function RankedBars({
  data,
  title,
  subtitle,
  unit = "",
  max: maxItems = 12,
}: {
  data: RankedItem[];
  title: string;
  subtitle?: string | undefined;
  unit?: string;
  max?: number;
}) {
  const [hover, setHover] = useState<string | null>(null);

  const sorted = [...data].sort((a, b) => b.value - a.value);
  const shown = sorted.slice(0, maxItems);
  const hidden = sorted.length - shown.length;

  if (shown.length === 0 || shown.every((d) => d.value === 0)) {
    return (
      <Frame title={title} subtitle={subtitle} table={null}>
        <Empty message="Nothing recorded in this period." />
      </Frame>
    );
  }

  const max = Math.max(...shown.map((d) => d.value));

  return (
    <Frame
      title={title}
      subtitle={subtitle}
      table={
        <DataTable head={["Name", unit || "Value"]} rows={sorted.map((d) => [d.label, d.value])} />
      }
    >
      <ul className="space-y-1.5">
        {shown.map((item, index) => {
          // Darker at the top: rank is already the ordering, so the ramp only
          // reinforces it rather than encoding a second variable.
          const shade =
            index < shown.length / 3
              ? "var(--viz-seq-500)"
              : index < (shown.length * 2) / 3
                ? "var(--viz-seq-400)"
                : "var(--viz-seq-250)";

          return (
            <li
              key={item.label}
              onMouseEnter={() => setHover(item.label)}
              onMouseLeave={() => setHover(null)}
              className="grid grid-cols-[minmax(6rem,10rem)_1fr_auto] items-center gap-3"
            >
              <span className="truncate text-xs text-muted-foreground" title={item.label}>
                {item.label}
              </span>
              <span className="h-4 w-full overflow-hidden rounded-[4px] bg-secondary">
                <span
                  className="block h-full rounded-[4px] transition-opacity"
                  style={{
                    width: `${barPercent(item.value, max)}%`,
                    background: shade,
                    opacity: hover === null || hover === item.label ? 1 : 0.5,
                  }}
                />
              </span>
              <span className="text-right text-xs font-semibold tabular-nums text-foreground">
                {item.display ?? fmt(item.value, 2)}
              </span>
            </li>
          );
        })}
      </ul>

      {hidden > 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {hidden} more not shown — open the table for all {sorted.length}.
        </p>
      ) : null}
    </Frame>
  );
}

// ---------------------------------------------------------------------------

export interface Slice {
  label: string;
  value: number;
}

/** At most this many slices before the tail folds into one. */
const SLICE_LIMIT = 7;

/**
 * Folds a long tail into "Other".
 *
 * Eight hues is the ceiling of the palette, and a ninth generated colour is
 * indistinguishable from an existing one under colour-vision deficiency. A
 * long tail is better read as one slice than as six unnameable ones.
 */
function foldTail(data: Slice[]): Slice[] {
  const sorted = [...data].filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  if (sorted.length <= SLICE_LIMIT + 1) return sorted;

  const head = sorted.slice(0, SLICE_LIMIT);
  const tail = sorted.slice(SLICE_LIMIT);
  return [
    ...head,
    { label: `Other (${tail.length})`, value: tail.reduce((t, d) => t + d.value, 0) },
  ];
}

/**
 * A donut of shares, with slices that can be switched off.
 *
 * Clicking a slice or its legend entry removes it and the rest re-proportion,
 * which is how a reader answers "and without the big one?" — the question a
 * pie chart normally cannot take. Colour follows the category, not its rank,
 * so the survivors never repaint when one is dropped.
 */
export function DonutChart({
  data,
  title,
  subtitle,
  unit = "",
  format = "count",
}: {
  data: Slice[];
  title: string;
  subtitle?: string | undefined;
  unit?: string;
  format?: NumberFormat;
}) {
  const show = (value: number) => formatWith(format, value);
  const [hover, setHover] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const folded = foldTail(data);
  // Hue is keyed to position in the folded list, before anything is hidden.
  const hueOf = new Map(folded.map((d, i) => [d.label, i % 8]));

  const shown = folded.filter((d) => !hidden.has(d.label));
  const slices = arcs(
    shown.map((d) => d.value),
    100,
    62,
  );
  const total = shown.reduce((t, d) => t + d.value, 0);

  function toggle(label: string) {
    setHidden((was) => {
      const next = new Set(was);
      // Never let the last slice be switched off: an empty donut is not a
      // state anyone chose, it is a chart that looks broken.
      if (next.has(label)) next.delete(label);
      else if (shown.length > 1) next.add(label);
      return next;
    });
  }

  if (folded.length === 0) {
    return (
      <Frame title={title} subtitle={subtitle} table={null}>
        <Empty message="Nothing recorded in this period." />
      </Frame>
    );
  }

  const active = hover ? shown.find((d) => d.label === hover) : undefined;

  return (
    <Frame
      title={title}
      subtitle={subtitle}
      table={
        <DataTable head={["Name", unit || "Value"]} rows={folded.map((d) => [d.label, d.value])} />
      }
    >
      <div className="flex flex-wrap items-center gap-5">
        <svg
          viewBox="0 0 200 200"
          className="h-44 w-44 shrink-0"
          role="img"
          aria-label={`${title}. ${shown.length} categories.`}
          onMouseLeave={() => setHover(null)}
        >
          {slices.map((slice, i) => {
            const entry = shown[i]!;
            const hue = hueOf.get(entry.label) ?? 0;
            const dim = hover !== null && hover !== entry.label;

            return (
              <path
                key={entry.label}
                d={slice.path}
                fill={`var(--viz-cat-${hue})`}
                // A 2px surface ring between slices, so neighbouring hues never
                // read as one shape.
                stroke="var(--card)"
                strokeWidth={2}
                opacity={dim ? 0.35 : 1}
                className="cursor-pointer transition-opacity duration-200"
                onMouseEnter={() => setHover(entry.label)}
                onClick={() => toggle(entry.label)}
              >
                <title>{`${entry.label}: ${show(entry.value)}`}</title>
              </path>
            );
          })}

          {/* The hole carries the reading, so the eye never has to estimate an
              angle. */}
          <text
            x="100"
            y="94"
            textAnchor="middle"
            className="fill-foreground text-[15px] font-bold"
          >
            {show(active ? active.value : total)}
          </text>
          <text x="100" y="112" textAnchor="middle" className="fill-muted-foreground text-[9px]">
            {active
              ? `${Math.round((active.value / (total || 1)) * 100)}% · ${active.label.slice(0, 18)}`
              : hidden.size > 0
                ? `${shown.length} of ${folded.length} shown`
                : unit || "total"}
          </text>
        </svg>

        <ul className="min-w-[10rem] flex-1 space-y-1">
          {folded.map((entry) => {
            const hue = hueOf.get(entry.label) ?? 0;
            const off = hidden.has(entry.label);
            const share = total > 0 && !off ? (entry.value / total) * 100 : 0;

            return (
              <li key={entry.label}>
                <button
                  type="button"
                  onClick={() => toggle(entry.label)}
                  onMouseEnter={() => setHover(entry.label)}
                  onMouseLeave={() => setHover(null)}
                  aria-pressed={!off}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-xs transition-colors hover:bg-secondary",
                    off && "opacity-40",
                  )}
                >
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-[3px]"
                    style={{ background: `var(--viz-cat-${hue})` }}
                  />
                  <span
                    className={cn("min-w-0 flex-1 truncate text-foreground", off && "line-through")}
                  >
                    {entry.label}
                  </span>
                  {/* A visible label on every entry: three of the eight hues sit
                      below 3:1 on this surface, and this is the relief. */}
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {off ? "hidden" : `${share.toFixed(0)}%`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {hidden.size > 0 ? (
        <button
          type="button"
          onClick={() => setHidden(new Set())}
          className="mt-2 text-[11px] font-semibold text-primary hover:underline"
        >
          Show all {folded.length}
        </button>
      ) : null}
    </Frame>
  );
}

// ---------------------------------------------------------------------------

export interface ScatterPoint {
  label: string;
  x: number;
  y: number;
  /** Optional grouping, shown in the tooltip rather than encoded as colour. */
  group?: string;
}

/**
 * One dot per person, against two measures.
 *
 * A single hue, deliberately: colouring four hundred people by department
 * would need thirty hues, and past three the all-pairs separation cannot hold.
 * Identity lives in the tooltip and in the click-to-pin, where it can be read
 * exactly rather than guessed from a shade.
 */
export function ScatterPlot({
  data,
  title,
  subtitle,
  xLabel,
  yLabel,
  formatX = "plain",
  formatY = "plain",
}: {
  data: ScatterPoint[];
  title: string;
  subtitle?: string | undefined;
  xLabel: string;
  yLabel: string;
  formatX?: NumberFormat;
  formatY?: NumberFormat;
}) {
  const showX = (value: number) => formatWith(formatX, value);
  const showY = (value: number) => formatWith(formatY, value);
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <Frame title={title} subtitle={subtitle} table={null}>
        <Empty message="Nothing to plot in this period." />
      </Frame>
    );
  }

  const BOX: PlotBox = {
    width: 720,
    height: 280,
    padTop: 12,
    padRight: 14,
    padBottom: 34,
    padLeft: 52,
  };
  const area = plotArea(BOX);

  const xb = scatterBounds(data.map((d) => d.x));
  const yb = scatterBounds(data.map((d) => d.y));

  const px = (v: number) => area.left + scaleLinear(v, xb.min, xb.max, area.plotWidth);
  const py = (v: number) => area.bottom - scaleLinear(v, yb.min, yb.max, area.plotHeight);

  const shown = pinned ?? hover;

  return (
    <Frame
      title={title}
      subtitle={subtitle}
      table={
        <DataTable head={["Name", xLabel, yLabel]} rows={data.map((d) => [d.label, d.x, d.y])} />
      }
    >
      <div className="relative">
        <svg
          viewBox={`0 0 ${BOX.width} ${BOX.height}`}
          className="w-full"
          role="img"
          aria-label={`${title}. ${data.length} points of ${yLabel} against ${xLabel}.`}
          onMouseLeave={() => setHover(null)}
        >
          {[0, 0.5, 1].map((t) => {
            const y = area.bottom - t * area.plotHeight;
            return (
              <g key={t}>
                <line
                  x1={area.left}
                  x2={BOX.width - BOX.padRight}
                  y1={y}
                  y2={y}
                  stroke="var(--viz-grid)"
                  strokeWidth={1}
                />
                <text
                  x={area.left - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-muted-foreground text-[9px]"
                >
                  {showY(yb.min + t * (yb.max - yb.min))}
                </text>
              </g>
            );
          })}

          {[0, 0.5, 1].map((t) => (
            <text
              key={t}
              x={area.left + t * area.plotWidth}
              y={BOX.height - 14}
              textAnchor={t === 0 ? "start" : t === 1 ? "end" : "middle"}
              className="fill-muted-foreground text-[9px]"
            >
              {showX(xb.min + t * (xb.max - xb.min))}
            </text>
          ))}

          <text
            x={area.left + area.plotWidth / 2}
            y={BOX.height - 2}
            textAnchor="middle"
            className="fill-muted-foreground text-[9px] font-semibold"
          >
            {xLabel}
          </text>

          {data.map((point, i) => {
            const isShown = shown === i;
            return (
              <circle
                key={`${point.label}-${i}`}
                cx={px(point.x)}
                cy={py(point.y)}
                r={isShown ? 7 : 4.5}
                fill="var(--viz-series-1)"
                // A surface ring keeps overlapping dots countable.
                stroke="var(--card)"
                strokeWidth={isShown ? 2 : 1}
                opacity={shown === null || isShown ? 0.85 : 0.3}
                className="cursor-pointer transition-all duration-150"
                onMouseEnter={() => setHover(i)}
                onClick={() => setPinned(pinned === i ? null : i)}
              >
                <title>{`${point.label}: ${showX(point.x)} ${xLabel}, ${showY(point.y)} ${yLabel}`}</title>
              </circle>
            );
          })}
        </svg>

        {shown !== null && data[shown] ? (
          <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-lg">
            <p className="font-bold text-foreground">{data[shown]!.label}</p>
            <p className="text-muted-foreground">
              {showX(data[shown]!.x)} {xLabel} · {showY(data[shown]!.y)} {yLabel}
              {data[shown]!.group ? ` · ${data[shown]!.group}` : ""}
            </p>
            {pinned === shown ? (
              <p className="mt-0.5 text-[10px] text-primary">Pinned — click again to release</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <p className="mt-1 text-[11px] text-muted-foreground">
        {data.length} people · click a dot to pin it
      </p>
    </Frame>
  );
}

// ---------------------------------------------------------------------------

/**
 * Concentric arcs, one per category.
 *
 * Bars bent around a circle rather than shares of a whole: length is the value
 * against the largest, so a reader compares ring lengths the way they would
 * compare bar lengths. Chosen over a bar chart only where the categories are
 * few and the shape earns its place on a dashboard.
 */
export function RadialArea({
  data,
  title,
  subtitle,
  format = "count",
}: {
  data: Slice[];
  title: string;
  subtitle?: string | undefined;
  format?: NumberFormat;
}) {
  const show = (value: number) => formatWith(format, value);
  const [hover, setHover] = useState<string | null>(null);

  const shown = [...data]
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  if (shown.length === 0) {
    return (
      <Frame title={title} subtitle={subtitle} table={null}>
        <Empty message="Nothing recorded in this period." />
      </Frame>
    );
  }

  const SIZE = 200;
  const centre = SIZE / 2;
  const max = Math.max(...shown.map((d) => d.value));
  const outer = 88;
  const step = 13;

  const active = hover ? shown.find((d) => d.label === hover) : undefined;

  return (
    <Frame
      title={title}
      subtitle={subtitle}
      table={<DataTable head={["Name", "Value"]} rows={shown.map((d) => [d.label, d.value])} />}
    >
      <div className="flex flex-wrap items-center gap-5">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="h-48 w-48 shrink-0"
          role="img"
          aria-label={`${title}. ${shown.length} categories.`}
          onMouseLeave={() => setHover(null)}
        >
          {shown.map((entry, i) => {
            const radius = outer - i * step;
            const track = radialBar(max, max, radius, centre);
            const arc = radialBar(entry.value, max, radius, centre);
            const dim = hover !== null && hover !== entry.label;

            return (
              <g key={entry.label} onMouseEnter={() => setHover(entry.label)}>
                {/* The full ring behind each arc, so a short one still reads as
                    a share of something rather than as a stray stroke. */}
                <path
                  d={track.path}
                  fill="none"
                  stroke="var(--viz-grid)"
                  strokeWidth={9}
                  strokeLinecap="round"
                />
                <path
                  d={arc.path}
                  fill="none"
                  stroke={`var(--viz-cat-${i % 8})`}
                  strokeWidth={9}
                  strokeLinecap="round"
                  opacity={dim ? 0.3 : 1}
                  className="cursor-pointer transition-opacity duration-200"
                >
                  <title>{`${entry.label}: ${show(entry.value)}`}</title>
                </path>
              </g>
            );
          })}

          <text
            x={centre}
            y={centre - 2}
            textAnchor="middle"
            className="fill-foreground text-[13px] font-bold"
          >
            {show(active ? active.value : max)}
          </text>
          <text
            x={centre}
            y={centre + 13}
            textAnchor="middle"
            className="fill-muted-foreground text-[8px]"
          >
            {active ? active.label.slice(0, 20) : "highest"}
          </text>
        </svg>

        <ul className="min-w-[9rem] flex-1 space-y-1">
          {shown.map((entry, i) => (
            <li
              key={entry.label}
              onMouseEnter={() => setHover(entry.label)}
              onMouseLeave={() => setHover(null)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-1.5 py-1 text-xs transition-colors",
                hover === entry.label && "bg-secondary",
              )}
            >
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: `var(--viz-cat-${i % 8})` }}
              />
              <span className="min-w-0 flex-1 truncate text-foreground">{entry.label}</span>
              <span className="shrink-0 font-semibold tabular-nums text-muted-foreground">
                {show(entry.value)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Frame>
  );
}
