// Lane-router geometry: pickZoneIndex / routedPath / LANE_STEP_REM.

import { describe, expect, it } from "vitest";
import {
  getLayout,
  LANE_STEP_REM,
  pickZoneIndex,
  routedPath,
} from "./layout";

describe("pickZoneIndex", () => {
  const layout = getLayout("large");

  it("picks a band that lies strictly between the two endpoints", () => {
    const bands = layout.safeYBands;
    // Pick the first band and aim endpoints either side of it.
    const band = bands[0];
    const a = { x: 5, y: band - 1 };
    const b = { x: 12, y: band + 1 };
    expect(pickZoneIndex(a, b, layout)).toBe(0);
  });

  it("prefers an inside band even if a closer band sits outside", () => {
    const bands = layout.safeYBands;
    if (bands.length < 2) return; // large layout always has ≥3
    // Aim endpoints around bands[1]; bands[0] is farther but outside.
    const a = { x: 5, y: bands[1] - 0.5 };
    const b = { x: 12, y: bands[1] + 0.5 };
    expect(pickZoneIndex(a, b, layout)).toBe(1);
  });

  it("falls back to nearest band when none lies between endpoints", () => {
    const bands = layout.safeYBands;
    const a = { x: 5, y: bands[0] - 5 };
    const b = { x: 12, y: bands[0] - 4 };
    // Both endpoints above all bands → nearest band wins.
    expect(pickZoneIndex(a, b, layout)).toBe(0);
  });
});

describe("routedPath", () => {
  const layout = getLayout("large");
  const a = { x: 5, y: 1 };
  const b = { x: 20, y: 10 };

  it("emits 4 collinear-by-axis points: V-H-V", () => {
    const pts = routedPath(a, b, 0, 1, 0, layout);
    expect(pts).toHaveLength(4);
    expect(pts[0]).toEqual(a);
    expect(pts[1].x).toBe(a.x);
    expect(pts[2].x).toBe(b.x);
    expect(pts[1].y).toBe(pts[2].y); // single lane Y
    expect(pts[3]).toEqual(b);
  });

  it("centres a 3-wire group in the safe span between endpoints", () => {
    // safe span = [a.y + LIFT, b.y - LIFT] = [1.3, 9.7], centre = 5.5
    const centre = (a.y + b.y) / 2;
    const mid = routedPath(a, b, 1, 3, 0, layout);
    expect(mid[1].y).toBeCloseTo(centre, 6);
    const top = routedPath(a, b, 0, 3, 0, layout);
    expect(top[1].y).toBeCloseTo(centre - LANE_STEP_REM, 6);
    const bot = routedPath(a, b, 2, 3, 0, layout);
    expect(bot[1].y).toBeCloseTo(centre + LANE_STEP_REM, 6);
  });

  it("shrinks the per-lane step when natural spread won't fit", () => {
    // Tight endpoints — only 0.4 rem of safe span between them.
    const tA = { x: 5, y: 1 };
    const tB = { x: 20, y: 2 }; // safe span = [1.3, 1.7], halfRange = 0.2
    const pts0 = routedPath(tA, tB, 0, 5, 0, layout);
    const pts4 = routedPath(tA, tB, 4, 5, 0, layout);
    expect(pts0[1].y).toBeGreaterThanOrEqual(1.3 - 1e-6);
    expect(pts4[1].y).toBeLessThanOrEqual(1.7 + 1e-6);
  });

  it("leaves a visible vertical stub from each endpoint", () => {
    const pts = routedPath(a, b, 0, 1, 0, layout);
    // lift on each side >= LANE_LIFT_REM (because lane is clamped into the
    // safe span [a.y+LIFT, b.y-LIFT]).
    expect(Math.abs(pts[1].y - a.y)).toBeGreaterThanOrEqual(0.5 - 1e-6);
    expect(Math.abs(pts[2].y - b.y)).toBeGreaterThanOrEqual(0.5 - 1e-6);
  });
});
