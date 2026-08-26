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

export interface Arc {
  /** SVG path for the slice, or the ring segment when innerRadius > 0. */
  path: string;
  /** Midpoint of the slice, for a label or a leader line. */
  labelX: number;
  labelY: number;
  /** Share of the whole, 0–1. */
  fraction: number;
}

/** Where a point on a circle sits, with 0 at twelve o'clock. */
export function pointOnCircle(cx: number, cy: number, radius: number, turns: number) {
  // Rotated a quarter turn so slices start at the top, which is where a reader
  // expects the first one — not at three o'clock, where the maths starts.
  const angle = turns * Math.PI * 2 - Math.PI / 2;
  return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
}

/**
 * Slices of a pie or donut, in order, starting at the top.
 *
 * A slice covering the whole circle is drawn as two half arcs: a single arc
 * whose start and end coincide is a zero-length path, so one category on its
 * own would otherwise render as nothing at all.
 */
export function arcs(values: readonly number[], radius: number, innerRadius = 0): Arc[] {
  const total = values.reduce((sum, v) => sum + Math.max(0, v || 0), 0);
  if (total <= 0) return [];

  const cx = radius;
  const cy = radius;
  let cursor = 0;

  return values.map((raw) => {
    const value = Math.max(0, raw || 0);
    const fraction = value / total;
    const start = cursor;
    const end = cursor + fraction;
    cursor = end;

    if (fraction <= 0) return { path: "", labelX: cx, labelY: cy, fraction: 0 };

    const mid = pointOnCircle(cx, cy, (radius + innerRadius) / 2, (start + end) / 2);

    if (fraction >= 1) {
      // Two half arcs, since a full circle cannot be one arc command.
      const top = pointOnCircle(cx, cy, radius, 0);
      const bottom = pointOnCircle(cx, cy, radius, 0.5);
      const outer =
        `M${round(top.x)},${round(top.y)}` +
        `A${radius},${radius} 0 0 1 ${round(bottom.x)},${round(bottom.y)}` +
        `A${radius},${radius} 0 0 1 ${round(top.x)},${round(top.y)}`;

      if (innerRadius <= 0) return { path: `${outer}Z`, labelX: mid.x, labelY: mid.y, fraction };

      const iTop = pointOnCircle(cx, cy, innerRadius, 0);
      const iBottom = pointOnCircle(cx, cy, innerRadius, 0.5);
      return {
        path:
          `${outer}Z M${round(iTop.x)},${round(iTop.y)}` +
          `A${innerRadius},${innerRadius} 0 0 0 ${round(iBottom.x)},${round(iBottom.y)}` +
          `A${innerRadius},${innerRadius} 0 0 0 ${round(iTop.x)},${round(iTop.y)}Z`,
        labelX: mid.x,
        labelY: mid.y,
        fraction,
      };
    }

    const outerStart = pointOnCircle(cx, cy, radius, start);
    const outerEnd = pointOnCircle(cx, cy, radius, end);
    const large = fraction > 0.5 ? 1 : 0;

    if (innerRadius <= 0) {
      return {
        path:
          `M${cx},${cy}L${round(outerStart.x)},${round(outerStart.y)}` +
          `A${radius},${radius} 0 ${large} 1 ${round(outerEnd.x)},${round(outerEnd.y)}Z`,
        labelX: mid.x,
        labelY: mid.y,
        fraction,
      };
    }

    const innerEnd = pointOnCircle(cx, cy, innerRadius, end);
    const innerStart = pointOnCircle(cx, cy, innerRadius, start);

    return {
      path:
        `M${round(outerStart.x)},${round(outerStart.y)}` +
        `A${radius},${radius} 0 ${large} 1 ${round(outerEnd.x)},${round(outerEnd.y)}` +
        `L${round(innerEnd.x)},${round(innerEnd.y)}` +
        `A${innerRadius},${innerRadius} 0 ${large} 0 ${round(innerStart.x)},${round(innerStart.y)}Z`,
      labelX: mid.x,
      labelY: mid.y,
      fraction,
    };
  });
}

/**
 * A radial bar: one ring segment per category, each starting at the top.
 *
 * Length encodes the value against the largest, so the rings read like bars
 * bent around a circle rather than like shares of a whole.
 */
export function radialBar(
  value: number,
  max: number,
  radius: number,
  centre: number,
): { path: string; fraction: number } {
  const fraction = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  if (fraction <= 0) return { path: "", fraction: 0 };

  // Stop just short of a full turn: a complete ring has coincident ends and
  // collapses to nothing.
  const swept = Math.min(fraction, 0.999);
  const start = pointOnCircle(centre, centre, radius, 0);
  const end = pointOnCircle(centre, centre, radius, swept);
  const large = swept > 0.5 ? 1 : 0;

  return {
    path:
      `M${round(start.x)},${round(start.y)}` +
      `A${radius},${radius} 0 ${large} 1 ${round(end.x)},${round(end.y)}`,
    fraction,
  };
}

/** Maps a value onto a pixel position along an axis of `length`. */
export function scaleLinear(value: number, min: number, max: number, length: number): number {
  if (!Number.isFinite(value)) return 0;
  const span = max - min;
  if (span <= 0) return length / 2;
  return ((Math.max(min, Math.min(max, value)) - min) / span) * length;
}

/**
 * Bounds for a scatter axis, padded so points never sit on the frame.
 *
 * A single point, or a column of identical values, has no span at all — that
 * is the case that divides by zero, so it is widened to something drawable.
 */
export function scatterBounds(values: readonly number[]): { min: number; max: number } {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return { min: 0, max: 1 };

  const min = Math.min(...finite);
  const max = Math.max(...finite);

  if (min === max) {
    const pad = Math.abs(min) > 0 ? Math.abs(min) * 0.1 : 1;
    return { min: min - pad, max: max + pad };
  }

  const pad = (max - min) * 0.08;
  return { min: min - pad, max: max + pad };
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
