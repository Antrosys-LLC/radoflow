import { describe, expect, it } from "vitest";

import {
  arcs,
  axisMax,
  axisTicks,
  barPercent,
  linePath,
  plotArea,
  pointOnCircle,
  radialBar,
  scaleLinear,
  scatterBounds,
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

  describe("pie and donut slices", () => {
    it("gives every category a slice, summing to the whole", () => {
      const slices = arcs([1, 2, 3], 100);
      expect(slices).toHaveLength(3);
      expect(slices.reduce((t, s) => t + s.fraction, 0)).toBeCloseTo(1, 6);
      expect(slices[0]!.fraction).toBeCloseTo(1 / 6, 6);
    });

    it("draws a single category as a real path, not an empty one", () => {
      // A full circle's start and end points coincide, so a naive single arc
      // collapses to nothing and the chart renders blank.
      const [only] = arcs([5], 100);
      expect(only!.fraction).toBe(1);
      expect(only!.path.length).toBeGreaterThan(20);
      expect(only!.path).not.toContain("NaN");
    });

    it("draws a single category of a donut as a ring, not a disc", () => {
      const [only] = arcs([5], 100, 60);
      // Two subpaths: the outer ring and the hole punched out of it.
      expect(only!.path.split("Z").length - 1).toBe(2);
    });

    it("returns nothing when every value is zero", () => {
      expect(arcs([0, 0], 100)).toEqual([]);
      expect(arcs([], 100)).toEqual([]);
    });

    it("emits no NaN for any slice", () => {
      for (const slice of arcs([3, 0, 7, 1], 80, 40)) {
        expect(slice.path).not.toContain("NaN");
      }
    });

    it("starts the first slice at the top of the circle", () => {
      const top = pointOnCircle(100, 100, 50, 0);
      expect(top.x).toBeCloseTo(100, 6);
      expect(top.y).toBeCloseTo(50, 6);
    });
  });

  describe("radial bars", () => {
    it("sweeps proportionally to the maximum", () => {
      expect(radialBar(5, 10, 40, 60).fraction).toBe(0.5);
      expect(radialBar(0, 10, 40, 60).path).toBe("");
    });

    it("never closes a full ring into nothing", () => {
      const full = radialBar(10, 10, 40, 60);
      expect(full.fraction).toBe(1);
      expect(full.path).not.toBe("");
      expect(full.path).not.toContain("NaN");
    });

    it("survives a zero maximum", () => {
      expect(radialBar(5, 0, 40, 60)).toEqual({ path: "", fraction: 0 });
    });
  });

  describe("scatter bounds", () => {
    it("pads the range so points do not sit on the frame", () => {
      const { min, max } = scatterBounds([10, 20]);
      expect(min).toBeLessThan(10);
      expect(max).toBeGreaterThan(20);
    });

    it("widens a column of identical values", () => {
      // Every worker on the same salary is a real dataset, and its span is
      // zero — the division that puts every point at NaN.
      const { min, max } = scatterBounds([40000, 40000, 40000]);
      expect(max).toBeGreaterThan(min);
    });

    it("widens a single point", () => {
      const { min, max } = scatterBounds([7]);
      expect(max).toBeGreaterThan(min);
    });

    it("falls back to a drawable range for no data", () => {
      expect(scatterBounds([])).toEqual({ min: 0, max: 1 });
    });

    it("places a value proportionally along the axis", () => {
      expect(scaleLinear(5, 0, 10, 200)).toBe(100);
      expect(scaleLinear(0, 0, 10, 200)).toBe(0);
    });

    it("centres a value when the range has no span", () => {
      expect(scaleLinear(5, 5, 5, 200)).toBe(100);
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
