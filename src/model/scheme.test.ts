// Tests for scheme.ts visibility toggles (hide L/PE busbars and
// generator/inverter when a scheme doesn't need them).

import { describe, expect, it } from "vitest";
import {
  GRID_SOURCE_ID,
  emptyScheme,
  schemeReducer,
  visibilityImpact,
  type Endpoint,
  type Scheme,
} from "./scheme";

function wire(scheme: Scheme, from: Endpoint, to: Endpoint): Scheme {
  const next = schemeReducer(scheme, { type: "add_wire", from, to });
  if (next === scheme) {
    throw new Error(
      `add_wire rejected: ${JSON.stringify(from)} ↔ ${JSON.stringify(to)}`,
    );
  }
  return next;
}

function modTerm(moduleId: string, terminalId: string): Endpoint {
  return { kind: "module", moduleId, terminalId };
}

function busTap(bus: "L" | "N" | "PE", i: number): Endpoint {
  return { kind: "bus", bus, tapIndex: i };
}

describe("PanelVisibility defaults", () => {
  it("emptyScheme() starts with everything visible", () => {
    const s = emptyScheme();
    expect(s.visibility).toEqual({
      busL: true,
      busPE: true,
      generator: true,
      inverter: true,
    });
  });
});

describe("visibilityImpact", () => {
  it("is empty when the hidden element has no wires", () => {
    const s = emptyScheme();
    const { droppedWireIds } = visibilityImpact(s, { generator: false });
    expect(droppedWireIds.size).toBe(0);
  });

  it("flags wires on the L bus, but not wires on N, when hiding busL", () => {
    let s = emptyScheme();
    s = wire(s, modTerm(GRID_SOURCE_ID, "out_L"), busTap("L", 0));
    s = wire(s, modTerm(GRID_SOURCE_ID, "out_N"), busTap("N", 0));
    const { droppedWireIds } = visibilityImpact(s, { busL: false });
    expect(droppedWireIds.size).toBe(1);
    const dropped = s.wires.find((w) => droppedWireIds.has(w.id));
    expect(dropped?.conductor).toBe("L");
  });

  it("flags wires touching the generator's terminals when hiding it", () => {
    let s = emptyScheme();
    s = wire(s, modTerm("fixture_generator", "out_L"), busTap("L", 0));
    s = wire(s, modTerm("fixture_generator", "out_N"), busTap("N", 0));
    const { droppedWireIds } = visibilityImpact(s, { generator: false });
    expect(droppedWireIds.size).toBe(2);
  });

  it("does not flag inverter wires when hiding the generator", () => {
    let s = emptyScheme();
    s = wire(s, modTerm("fixture_generator", "out_L"), busTap("L", 0));
    s = wire(s, modTerm("fixture_inverter", "in_L"), busTap("L", 1));
    const { droppedWireIds } = visibilityImpact(s, { generator: false });
    expect(droppedWireIds.size).toBe(1);
    const dropped = [...droppedWireIds][0];
    const w = s.wires.find((x) => x.id === dropped)!;
    expect(w.from.kind === "module" ? w.from.moduleId : null).toBe(
      "fixture_generator",
    );
  });
});

describe("schemeReducer — set_visibility", () => {
  it("hiding busL drops only wires on bus L, keeps bus N wires", () => {
    let s = emptyScheme();
    s = wire(s, modTerm(GRID_SOURCE_ID, "out_L"), busTap("L", 0));
    s = wire(s, modTerm(GRID_SOURCE_ID, "out_N"), busTap("N", 0));
    s = schemeReducer(s, { type: "set_visibility", patch: { busL: false } });
    expect(s.wires).toHaveLength(1);
    expect(s.wires[0].conductor).toBe("N");
    expect(s.visibility.busL).toBe(false);
  });

  it("clears selectedId when the selected generator is hidden", () => {
    let s = emptyScheme();
    s = schemeReducer(s, { type: "select", id: "fixture_generator" });
    expect(s.selectedId).toBe("fixture_generator");
    s = schemeReducer(s, {
      type: "set_visibility",
      patch: { generator: false },
    });
    expect(s.selectedId).toBeNull();
  });

  it("does not clear selectedId for an unrelated module", () => {
    let s = emptyScheme();
    s = schemeReducer(s, { type: "select", id: GRID_SOURCE_ID });
    s = schemeReducer(s, {
      type: "set_visibility",
      patch: { generator: false },
    });
    expect(s.selectedId).toBe(GRID_SOURCE_ID);
  });

  it("clears selectedWireId when the selected wire is dropped", () => {
    let s = emptyScheme();
    s = wire(s, modTerm("fixture_generator", "out_L"), busTap("L", 0));
    const wireId = s.wires[0].id;
    s = schemeReducer(s, { type: "select_wire", id: wireId });
    expect(s.selectedWireId).toBe(wireId);
    s = schemeReducer(s, {
      type: "set_visibility",
      patch: { generator: false },
    });
    expect(s.selectedWireId).toBeNull();
    expect(s.wires).toHaveLength(0);
  });

  it("re-enabling a hidden bus does not resurrect dropped wires", () => {
    let s = emptyScheme();
    s = wire(s, modTerm(GRID_SOURCE_ID, "out_L"), busTap("L", 0));
    s = schemeReducer(s, { type: "set_visibility", patch: { busL: false } });
    expect(s.wires).toHaveLength(0);
    s = schemeReducer(s, { type: "set_visibility", patch: { busL: true } });
    expect(s.wires).toHaveLength(0);
    expect(s.visibility.busL).toBe(true);
  });
});
