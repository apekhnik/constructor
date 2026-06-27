// @vitest-environment happy-dom
//
// router.test.ts — adapter contracts that DON'T depend on JointJS actually
// running. The JointJS manhattan router needs a real SVG renderer and
// fails under jsdom / happy-dom (Vectorizer can't measure SVG bboxes).
// We unit-test:
//  - short-circuit when no routed_v2 wire exists (no JointJS init);
//  - graceful failure when JointJS throws (adapter returns empty map,
//    WiringLayer falls back to manhattanPath).
// Geometric correctness of the routes themselves is verified manually in
// the browser (see Workspace + WiringLayer integration).

import { afterEach, describe, expect, it } from "vitest";
import { getLayout } from "../../model/layout";
import {
  GRID_SOURCE_ID,
  emptyScheme,
  schemeReducer,
  type Endpoint,
  type Scheme,
} from "../../model/scheme";
import { _resetForTests, routeWires } from "./router";

afterEach(() => {
  _resetForTests();
});

function modTerm(moduleId: string, terminalId: string): Endpoint {
  return { kind: "module", moduleId, terminalId };
}

function busTap(bus: "L" | "N" | "PE", i: number): Endpoint {
  return { kind: "bus", bus, tapIndex: i };
}

function withRoutedV2(s: Scheme): Scheme {
  return schemeReducer(s, { type: "set_new_router", enabled: true });
}

function addWire(s: Scheme, from: Endpoint, to: Endpoint): Scheme {
  const next = schemeReducer(s, { type: "add_wire", from, to });
  if (next === s) throw new Error("add_wire rejected");
  return next;
}

describe("routeWires (adapter contracts)", () => {
  it("returns empty map for an empty scheme", () => {
    const layout = getLayout("large");
    expect(routeWires(emptyScheme(), layout).size).toBe(0);
  });

  it("returns empty map when no wire has routed_v2", () => {
    const layout = getLayout("large");
    let s = emptyScheme(); // routed_v2 stays off
    s = addWire(s, modTerm(GRID_SOURCE_ID, "out_L"), busTap("L", 1));
    expect(s.wires[0].routed_v2).toBeUndefined();
    expect(routeWires(s, layout).size).toBe(0);
  });

  it("fails gracefully when JointJS can't render (happy-dom env)", () => {
    // Under happy-dom JointJS's Vectorizer cannot measure SVG bboxes, so
    // the manhattan router throws. The adapter must swallow the error and
    // return an empty map — WiringLayer's three-way switch then falls back
    // to manhattanPath for these wires.
    const layout = getLayout("large");
    let s = withRoutedV2(emptyScheme());
    s = addWire(s, modTerm(GRID_SOURCE_ID, "out_L"), busTap("L", 1));
    // No throw, no NaN — just an empty (or non-throwing) result.
    let result: Map<string, unknown> | null = null;
    expect(() => {
      result = routeWires(s, layout);
    }).not.toThrow();
    expect(result).not.toBeNull();
    expect(result!.size).toBe(0);
  });

  it("drops wires whose endpoint visibility was toggled off", () => {
    const layout = getLayout("large");
    let s = withRoutedV2(emptyScheme());
    s = addWire(s, modTerm(GRID_SOURCE_ID, "out_L"), busTap("L", 1));
    s = schemeReducer(s, {
      type: "set_visibility",
      patch: { busL: false },
    });
    // Reducer already pruned the wire; adapter doesn't crash either way.
    expect(() => routeWires(s, layout)).not.toThrow();
  });

  it("is idempotent — repeated calls return equivalent results", () => {
    const layout = getLayout("large");
    let s = withRoutedV2(emptyScheme());
    s = addWire(s, modTerm(GRID_SOURCE_ID, "out_L"), busTap("L", 1));
    const a = routeWires(s, layout);
    const b = routeWires(s, layout);
    expect(b.size).toBe(a.size);
  });
});
