/**
 * The arithmetic behind the charts, with no React in it.
 *
 * Separated so it can be tested. A chart that divides by zero renders a blank
 * box or a run of `NaN` in the markup, and neither shows up in a typecheck or
 * a screenshot of a page that happens to have data — the failures all live at
 * the edges: one data point, every value zero, an empty series.
 */

export interface PlotBox {
  width: number;
  height: number;
  padTop: number;
  padRight: number;
  padBottom: number;
  padLeft: number;
}

export interface PlotArea {
  plotWidth: number;
  plotHeight: number;
  left: number;
  top: number;
  /** y of the baseline. */
  bottom: number;
}

export function plotArea(box: PlotBox): PlotArea {
  const plotWidth = Math.max(0, box.width - box.padLeft - box.padRight);
  const plotHeight = Math.max(0, box.height - box.padTop - box.padBottom);
  return {
    plotWidth,
    plotHeight,
    left: box.padLeft,
    top: box.padTop,
    bottom: box.padTop + plotHeight,
  };
}

/**
 * The largest value any axis has to accommodate, never zero.
 *
 * A zero maximum is the division that turns every coordinate into NaN, and an
 * all-zero series is a real state — a day nobody worked — rather than a bug to
 * guard against at each call site.
 */
export function axisMax(values: readonly number[]): number {
  const max = Math.max(0, ...values.filter((v) => Number.isFinite(v)));
  return max > 0 ? max : 1;
}

/** Three gridlines: nothing, half, all. More is noise at this size. */
export function axisTicks(max: number): number[] {
  return [0, max / 2, max];
}

/** Where a value sits vertically, with the baseline at the bottom. */
export function yFor(value: number, max: number, area: PlotArea): number {
  if (!Number.isFinite(value)) return area.bottom;
  const clamped = Math.max(0, Math.min(value, max));
  return area.top + area.plotHeight - (clamped / max) * area.plotHeight;
}

/** Evenly spaced x positions across the plot, one per point. */
export function xForIndex(index: number, count: number, area: PlotArea): number {
  if (count <= 1) return area.left + area.plotWidth / 2;
  return area.left + (index / (count - 1)) * area.plotWidth;
}

export interface StackedBar {
  /** Left edge of the drawn bar. */
  x: number;
  width: number;
  lowerY: number;
  lowerHeight: number;
  upperY: number;
  upperHeight: number;
  /** Full-height hover target, spanning the whole slot. */
  slotX: number;
  slotWidth: number;
}

/** A 2px gap so two stacked fills never read as one block. */
const SEGMENT_GAP = 2;

/**
 * Lays out one stacked bar per point: a lower segment on the baseline and an
 * upper segment above it.
 */
export function stackedBars(
  data: readonly { lower: number; upper: number }[],
  area: PlotArea,
  max: number,
): StackedBar[] {
  const count = data.length;
  if (count === 0) return [];

  const slotWidth = area.plotWidth / count;
  const width = Math.max(2, Math.min(22, slotWidth - 3));

  return data.map((point, index) => {
    const slotX = area.left + index * slotWidth;
    const lowerHeight = ((Math.max(0, point.lower) || 0) / max) * area.plotHeight;
    const upperHeight = ((Math.max(0, point.upper) || 0) / max) * area.plotHeight;
    const lowerY = area.bottom - lowerHeight;

    return {
      x: slotX + (slotWidth - width) / 2,
      width,
      lowerY,
      lowerHeight,
      // The gap only applies when both segments are actually drawn.
      upperY: lowerY - upperHeight - (upperHeight > 0 && lowerHeight > 0 ? SEGMENT_GAP : 0),
      upperHeight,
      slotX,
      slotWidth,
    };
  });
}

/** An SVG path through a series, evenly spaced along x. */
export function linePath(values: readonly number[], area: PlotArea, max: number): string {
  if (values.length === 0) return "";

  return values
    .map((value, index) => {
      const x = xForIndex(index, values.length, area);
      const y = yFor(value, max, area);
      return `${index === 0 ? "M" : "L"}${round(x)},${round(y)}`;
    })
    .join(" ");
}

/** Two decimals is well past SVG's useful precision and keeps paths readable. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Bar width as a percentage of the widest bar, for the ranked HTML bars.
 *
 * Floored at a slice of a percent so a nonzero value never renders as nothing —
 * a bar of zero width reads as missing data rather than as a small number.
 */
export function barPercent(value: number, max: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (max <= 0) return 0;
  return Math.max(1.5, Math.min(100, (value / max) * 100));
}
