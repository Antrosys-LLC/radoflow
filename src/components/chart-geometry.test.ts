import { describe, expect, it } from "vitest";

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

const BOX: PlotBox = {
  width: 720,
  height: 220,
  padTop: 8,
  padRight: 8,
  padBottom: 24,
  padLeft: 40,
};

const area = plotArea(BOX);

/** Every coordinate a chart emits must be a real number. */
function allFinite(values: number[]): boolean {
  return values.every((v) => Number.isFinite(v));
}

describe("chart geometry", () => {
  it("measures the plot inside its padding", () => {
    expect(area.plotWidth).toBe(672);
    expect(area.plotHeight).toBe(188);
    expect(area.bottom).toBe(196);
  });

  it("never returns a zero axis maximum", () => {
    // A day nobody worked is a real state, and dividing by its total is what
    // turns every coordinate in the chart into NaN.
    expect(axisMax([0, 0, 0])).toBe(1);
    expect(axisMax([])).toBe(1);
    expect(axisMax([3, 9, 5])).toBe(9);
  });

  it("ignores values that are not numbers when scaling", () => {
    expect(axisMax([2, Number.NaN, 8, Number.POSITIVE_INFINITY])).toBe(8);
  });

  it("puts the baseline at the bottom and the maximum at the top", () => {
    expect(yFor(0, 10, area)).toBe(area.bottom);
    expect(yFor(10, 10, area)).toBe(area.top);
    expect(yFor(5, 10, area)).toBeCloseTo(area.top + area.plotHeight / 2, 5);
  });

  it("clamps a value above the maximum to the top rather than off the chart", () => {
    expect(yFor(99, 10, area)).toBe(area.top);
  });

  it("centres a lone point instead of dividing by zero", () => {
    // One day in range is the case that breaks an (i / (n - 1)) scale.
    const x = xForIndex(0, 1, area);
    expect(Number.isFinite(x)).toBe(true);
    expect(x).toBe(area.left + area.plotWidth / 2);
  });

  it("spreads points from the left edge to the right", () => {
    expect(xForIndex(0, 5, area)).toBe(area.left);
    expect(xForIndex(4, 5, area)).toBe(area.left + area.plotWidth);
  });

  it("gives three gridlines", () => {
    expect(axisTicks(10)).toEqual([0, 5, 10]);
  });

  describe("stacked bars", () => {
    it("stacks the upper segment on top of the lower one", () => {
      const [bar] = stackedBars([{ lower: 8, upper: 4 }], area, 12);
      expect(bar).toBeDefined();
      // Lower sits on the baseline; upper sits above it, minus the 2px gap.
      expect(bar!.lowerY + bar!.lowerHeight).toBeCloseTo(area.bottom, 5);
      expect(bar!.upperY + bar!.upperHeight).toBeCloseTo(bar!.lowerY - 2, 5);
    });

    it("adds no gap when only one segment is drawn", () => {
      const [onlyLower] = stackedBars([{ lower: 8, upper: 0 }], area, 8);
      expect(onlyLower!.upperHeight).toBe(0);
      expect(onlyLower!.upperY).toBeCloseTo(onlyLower!.lowerY, 5);
    });

    it("produces finite geometry when everything is zero", () => {
      const bars = stackedBars([{ lower: 0, upper: 0 }], area, axisMax([0]));
      expect(allFinite([bars[0]!.x, bars[0]!.lowerY, bars[0]!.lowerHeight, bars[0]!.upperY])).toBe(
        true,
      );
      expect(bars[0]!.lowerHeight).toBe(0);
    });

    it("keeps bars inside the plot for a long range", () => {
      const many = Array.from({ length: 200 }, () => ({ lower: 8, upper: 2 }));
      const bars = stackedBars(many, area, 10);

      expect(bars).toHaveLength(200);
      expect(bars.every((b) => b.width >= 2)).toBe(true);
      expect(bars[0]!.x).toBeGreaterThanOrEqual(area.left - 1);
      const last = bars[bars.length - 1]!;
      expect(last.x + last.width).toBeLessThanOrEqual(area.left + area.plotWidth + 1);
    });

    it("returns nothing for an empty series", () => {
      expect(stackedBars([], area, 1)).toEqual([]);
    });
  });

  describe("line path", () => {
    it("starts with a move and continues with lines", () => {
      const path = linePath([1, 2, 3], area, 3);
      expect(path.startsWith("M")).toBe(true);
      expect(path.split("L")).toHaveLength(3);
    });

    it("never emits NaN, whatever the input", () => {
      const path = linePath([0, 0], area, axisMax([0, 0]));
      expect(path).not.toContain("NaN");
    });

    it("draws a single point without dividing by zero", () => {
      const path = linePath([5], area, 5);
      expect(path).not.toContain("NaN");
      expect(path.startsWith("M")).toBe(true);
    });

    it("is empty for no data", () => {
      expect(linePath([], area, 1)).toBe("");
    });
  });

  describe("ranked bar widths", () => {
    it("gives the largest value the full width", () => {
      expect(barPercent(10, 10)).toBe(100);
    });

    it("keeps a tiny value visible rather than invisible", () => {
      // 0.01 of 1000 is 0.001% — a bar nobody can see reads as missing data.
      expect(barPercent(0.01, 1000)).toBe(1.5);
    });

    it("draws nothing for zero", () => {
      expect(barPercent(0, 10)).toBe(0);
    });

    it("survives a zero maximum", () => {
      expect(barPercent(5, 0)).toBe(0);
    });
  });
});
