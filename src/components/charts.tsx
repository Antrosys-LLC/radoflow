"use client";

import { useId, useState } from "react";

import {
  axisMax,
  axisTicks,
  barPercent,
  linePath,
  plotArea,
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
`;

const DARK_TOKENS = `
  --viz-series-1: #3987e5;
  --viz-series-2: #d95926;
  --viz-seq-500: #3987e5;
  --viz-seq-400: #2a78d6;
  --viz-seq-250: #256abf;
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
