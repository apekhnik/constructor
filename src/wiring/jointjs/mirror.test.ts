// mirror.test.ts — unit tests for the Scheme → JointJS descriptor mapping.
// Pure JS (no JointJS, no DOM), so vitest's default node environment is enough.

import { describe, expect, it } from "vitest";
import { getLayout } from "../../model/layout";
import {
  GRID_SOURCE_ID,
  emptyScheme,
  schemeReducer,
  type Endpoint,
  type Scheme,
} from "../../model/scheme";
import { buildMirror } from "./mirror";

function modTerm(moduleId: string, terminalId: string): Endpoint {
  return { kind: "module", moduleId, terminalId };
}

function busTap(bus: "L" | "N" | "PE", i: number): Endpoint {
  return { kind: "bus", bus, tapIndex: i };
}

function withWire(
  scheme: Scheme,
  from: Endpoint,
  to: Endpoint,
  routedV2: boolean,
): Scheme {
  const next = schemeReducer(
    routedV2
      ? schemeReducer(scheme, { type: "set_new_router", enabled: true })
      : scheme,
    { type: "add_wire", from, to },
  );
  if (next === scheme) {
    throw new Error(
      `add_wire rejected: ${JSON.stringify(from)} ↔ ${JSON.stringify(to)}`,
    );
  }
  return next;
}

describe("buildMirror", () => {
  it("emits 0 links when no wire is flagged routed_v2", () => {
    const layout = getLayout("large");
    let s = emptyScheme();
    s = withWire(
      s,
      modTerm(GRID_SOURCE_ID, "out_L"),
      busTap("L", 1),
      false, // old router
    );
    const m = buildMirror(s, layout);
    expect(m.links).toHaveLength(0);
    // But the mirror still describes the visible world so future routed_v2
    // wires can reference these elements.
    expect(m.elements.length).toBeGreaterThan(0);
  });

  it("emits a link when wire has routed_v2: true", () => {
    const layout = getLayout("large");
    let s = emptyScheme();
    s = withWire(
      s,
      modTerm(GRID_SOURCE_ID, "out_L"),
      busTap("L", 1),
      true,
    );
    const m = buildMirror(s, layout);
    expect(m.links).toHaveLength(1);
    expect(m.links[0].source.elementId).toBe(GRID_SOURCE_ID);
    expect(m.links[0].source.portId).toBe("out_L");
    expect(m.links[0].target.elementId).toBe("bus_L_1");
    expect(m.links[0].target.portId).toBe("tap");
  });

  it("module ports carry the correct side hint for the manhattan router", () => {
    const layout = getLayout("large");
    const m = buildMirror(emptyScheme(), layout);
    const source = m.elements.find((e) => e.id === GRID_SOURCE_ID);
    expect(source).toBeDefined();
    // Source has only bottom-side outputs (out_L/N/PE).
    for (const p of source!.ports) {
      expect(p.side).toBe("bottom");
    }
  });

  it("bus has one body + N tap markers per side", () => {
    const layout = getLayout("large");
    const m = buildMirror(emptyScheme(), layout);
    const lBody = m.elements.filter((e) => e.id === "bus_L_body");
    expect(lBody).toHaveLength(1);
    expect(lBody[0].role).toBe("bus-body");
    expect(lBody[0].ports).toHaveLength(0);
    const lTaps = m.elements.filter(
      (e) => e.role === "bus-tap" && e.id.startsWith("bus_L_"),
    );
    // 12 slots × 2 sides → 12 taps for L bus in large mode.
    expect(lTaps.length).toBeGreaterThan(0);
    expect(lTaps.every((e) => e.ports.length === 1)).toBe(true);
  });

  it("hidden bus L is removed from elements (body and taps)", () => {
    const layout = getLayout("large");
    const s = schemeReducer(emptyScheme(), {
      type: "set_visibility",
      patch: { busL: false },
    });
    const m = buildMirror(s, layout);
    expect(m.elements.some((e) => e.id === "bus_L_body")).toBe(false);
    expect(m.elements.some((e) => e.id.startsWith("bus_L_"))).toBe(false);
    // N bus is always visible.
    expect(m.elements.some((e) => e.id === "bus_N_body")).toBe(true);
  });

  it("hidden generator fixture disappears from elements", () => {
    const layout = getLayout("large");
    const s = schemeReducer(emptyScheme(), {
      type: "set_visibility",
      patch: { generator: false },
    });
    const m = buildMirror(s, layout);
    expect(m.elements.some((e) => e.id === "fixture_generator")).toBe(false);
    // Inverter stays.
    expect(m.elements.some((e) => e.id === "fixture_inverter")).toBe(true);
  });

  it("link to a hidden element is dropped (defensive)", () => {
    const layout = getLayout("large");
    let s = withWire(
      emptyScheme(),
      modTerm("fixture_generator", "out_L"),
      busTap("L", 0),
      true,
    );
    s = schemeReducer(s, {
      type: "set_visibility",
      patch: { generator: false },
    });
    const m = buildMirror(s, layout);
    expect(m.links).toHaveLength(0);
  });

  it("layout width/height are in pixels (= rem * 16)", () => {
    const layout = getLayout("small");
    const m = buildMirror(emptyScheme(), layout);
    expect(m.width).toBeCloseTo(layout.layoutWidthRem * 16, 1);
    expect(m.height).toBeCloseTo(layout.layoutHeightRem * 16, 1);
  });
});
