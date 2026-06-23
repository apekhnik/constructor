// Acceptance scenarios from CLAUDE.md §2.5 + Stage 4 punch list.

import { describe, expect, it } from "vitest";
import { CATALOG } from "./catalog";
import {
  emptyScheme,
  GRID_SOURCE_ID,
  schemeReducer,
  type Endpoint,
  type Scheme,
  type SwitchPosition,
} from "./scheme";
import { simulate } from "./simulation";
import type { ComponentKind } from "./types";

// ---------------- helpers ----------------

function place(
  scheme: Scheme,
  kind: ComponentKind,
  rail: number,
  slot: number,
): { scheme: Scheme; id: string } {
  const entry = CATALOG.find((x) => x.kind === kind);
  if (!entry) throw new Error(`no catalog entry for ${kind}`);
  const next = schemeReducer(scheme, { type: "place", entry, rail, slot });
  if (next === scheme) throw new Error(`place(${kind}) was rejected`);
  const id = next.modules[next.modules.length - 1].id;
  return { scheme: next, id };
}

function wire(scheme: Scheme, from: Endpoint, to: Endpoint): Scheme {
  const next = schemeReducer(scheme, { type: "add_wire", from, to });
  if (next === scheme) {
    throw new Error(
      `add_wire rejected: ${JSON.stringify(from)} ↔ ${JSON.stringify(to)}`,
    );
  }
  return next;
}

function patchModule(
  scheme: Scheme,
  id: string,
  patch: Partial<Scheme["modules"][number]>,
): Scheme {
  return {
    ...scheme,
    modules: scheme.modules.map((m) => (m.id === id ? { ...m, ...patch } : m)),
  };
}

function setSource(scheme: Scheme, patch: Partial<Scheme["source"]>): Scheme {
  return schemeReducer(scheme, { type: "set_source", patch });
}

function modTerm(moduleId: string, terminalId: string): Endpoint {
  return { kind: "module", moduleId, terminalId };
}

function busTap(bus: "L" | "N" | "PE", i: number): Endpoint {
  return { kind: "bus", bus, tapIndex: i };
}

// Common skeleton: source → bus L/N → branch breaker (rail 1, slot 0) → load (rail 3, slot 0).
function basicSchemeWithBreaker(
  rated_current_A = 16,
  curve: "B" | "C" | "D" = "C",
) {
  let s = emptyScheme();
  // Hook up the breaker.
  const a = place(s, "branch_breaker", 1, 0);
  s = patchModule(a.scheme, a.id, { rated_current_A, curve });
  const breakerId = a.id;
  // Hook up the load.
  const b = place(s, "load", 3, 0);
  s = b.scheme;
  const loadId = b.id;
  // Wires.
  s = wire(s, modTerm(GRID_SOURCE_ID, "out_L"), busTap("L", 0));
  s = wire(s, modTerm(GRID_SOURCE_ID, "out_N"), busTap("N", 0));
  s = wire(s, busTap("L", 1), modTerm(breakerId, "in_L"));
  s = wire(s, modTerm(breakerId, "out_L"), modTerm(loadId, "in_L"));
  s = wire(s, busTap("N", 1), modTerm(loadId, "in_N"));
  s = setSource(s, { grid_active: true, grid_voltage_V: 230 });
  return { scheme: s, breakerId, loadId };
}

// ---------------- tests ----------------

describe("simulate — happy path", () => {
  it("lamp lights via source → bus → breaker → load", () => {
    const { scheme, loadId } = basicSchemeWithBreaker(16);
    const r = simulate(scheme);
    expect(r.runtime[loadId].energized).toBe(true);
    expect(r.runtime[loadId].lit).toBe(true);
    expect(r.runtime[loadId].voltage_in_V).toBe(230);
    expect(r.newTrips).toEqual([]);
  });

  it("lamp goes dark when N is broken upstream", () => {
    const { scheme, loadId } = basicSchemeWithBreaker(16);
    const broken = setSource(scheme, { neutral_break: true });
    const r = simulate(broken);
    expect(r.runtime[loadId].energized).toBe(false);
    expect(r.runtime[loadId].lit).toBe(false);
  });
});

describe("simulate — breaker trips", () => {
  it("short circuit: ~100 A load on a C16 breaker → instant short_circuit trip", () => {
    const { scheme, breakerId, loadId } = basicSchemeWithBreaker(16, "C");
    // P = U·I → 230 V · 100 A = 23 kW
    const s = patchModule(scheme, loadId, { power_W: 23_000 });
    const r = simulate(s);
    expect(r.newTrips).toEqual([
      { id: breakerId, reason: "short_circuit" },
    ]);
  });

  it("overload: ~25 A on a C16 → pending overload (no instant trip)", () => {
    const { scheme, breakerId, loadId } = basicSchemeWithBreaker(16, "C");
    // 230 V · 25 A = 5750 W
    const s = patchModule(scheme, loadId, { power_W: 5_750 });
    const r = simulate(s);
    expect(r.newTrips).toEqual([]);
    expect(r.runtime[breakerId].trip_pending?.reason).toBe("overload");
  });

  it("normal load: ~5 A on a C16 → no trip, lamp lit", () => {
    const { scheme, breakerId, loadId } = basicSchemeWithBreaker(16, "C");
    // 230 V · 5 A = 1150 W
    const s = patchModule(scheme, loadId, { power_W: 1_150 });
    const r = simulate(s);
    expect(r.newTrips).toEqual([]);
    expect(r.runtime[breakerId].trip_pending).toBeUndefined();
    expect(r.runtime[loadId].lit).toBe(true);
  });
});

describe("simulate — RCD leakage", () => {
  it("50 mA leak on a load fed through a 30 mA RCD → instant leak trip", () => {
    // source → bus → RCD → branch_breaker → load
    let s = emptyScheme();
    const a = place(s, "rcd", 1, 0);
    s = a.scheme;
    const rcdId = a.id;
    const b = place(s, "branch_breaker", 1, 2);
    s = b.scheme;
    const breakerId = b.id;
    const c = place(s, "load", 3, 0);
    s = c.scheme;
    const loadId = c.id;
    s = wire(s, modTerm(GRID_SOURCE_ID, "out_L"), modTerm(rcdId, "in_L"));
    s = wire(s, modTerm(GRID_SOURCE_ID, "out_N"), modTerm(rcdId, "in_N"));
    s = wire(s, modTerm(rcdId, "out_L"), modTerm(breakerId, "in_L"));
    s = wire(s, modTerm(rcdId, "out_N"), modTerm(loadId, "in_N"));
    s = wire(s, modTerm(breakerId, "out_L"), modTerm(loadId, "in_L"));
    s = setSource(s, {
      grid_active: true,
      grid_voltage_V: 230,
      leak_mA: 50,
      leak_target_id: loadId,
    });
    const r = simulate(s);
    expect(r.newTrips).toEqual([{ id: rcdId, reason: "leak" }]);
  });

  it("15 mA leak < 30 mA rating → no trip", () => {
    let s = emptyScheme();
    const a = place(s, "rcd", 1, 0);
    s = a.scheme;
    const rcdId = a.id;
    const c = place(s, "load", 3, 0);
    s = c.scheme;
    const loadId = c.id;
    s = wire(s, modTerm(GRID_SOURCE_ID, "out_L"), modTerm(rcdId, "in_L"));
    s = wire(s, modTerm(GRID_SOURCE_ID, "out_N"), modTerm(rcdId, "in_N"));
    s = wire(s, modTerm(rcdId, "out_L"), modTerm(loadId, "in_L"));
    s = wire(s, modTerm(rcdId, "out_N"), modTerm(loadId, "in_N"));
    s = setSource(s, {
      grid_active: true,
      grid_voltage_V: 230,
      leak_mA: 15,
      leak_target_id: loadId,
    });
    const r = simulate(s);
    expect(r.newTrips).toEqual([]);
  });
});

describe("simulate — voltage relay", () => {
  it("voltage > Umax → pending overvoltage trip", () => {
    // source → voltage relay → load
    let s = emptyScheme();
    const a = place(s, "voltage_relay", 1, 0);
    s = a.scheme;
    const relayId = a.id;
    const c = place(s, "load", 3, 0);
    s = c.scheme;
    const loadId = c.id;
    s = wire(s, modTerm(GRID_SOURCE_ID, "out_L"), modTerm(relayId, "in_L"));
    s = wire(s, modTerm(GRID_SOURCE_ID, "out_N"), modTerm(relayId, "in_N"));
    s = wire(s, modTerm(relayId, "out_L"), modTerm(loadId, "in_L"));
    s = wire(s, modTerm(relayId, "out_N"), modTerm(loadId, "in_N"));
    s = setSource(s, { grid_active: true, grid_voltage_V: 270 });
    const r = simulate(s);
    expect(r.runtime[relayId].trip_pending?.reason).toBe("overvoltage");
  });

  it("voltage well above (≥ Umax+30) → instant overvoltage trip", () => {
    let s = emptyScheme();
    const a = place(s, "voltage_relay", 1, 0);
    s = a.scheme;
    const relayId = a.id;
    const c = place(s, "load", 3, 0);
    s = c.scheme;
    const loadId = c.id;
    s = wire(s, modTerm(GRID_SOURCE_ID, "out_L"), modTerm(relayId, "in_L"));
    s = wire(s, modTerm(GRID_SOURCE_ID, "out_N"), modTerm(relayId, "in_N"));
    s = wire(s, modTerm(relayId, "out_L"), modTerm(loadId, "in_L"));
    s = wire(s, modTerm(relayId, "out_N"), modTerm(loadId, "in_N"));
    s = setSource(s, { grid_active: true, grid_voltage_V: 290 });
    const r = simulate(s);
    expect(r.newTrips).toEqual([{ id: relayId, reason: "overvoltage" }]);
  });

  it("voltage in band → no trip, load lit", () => {
    let s = emptyScheme();
    const a = place(s, "voltage_relay", 1, 0);
    s = a.scheme;
    const relayId = a.id;
    const c = place(s, "load", 3, 0);
    s = c.scheme;
    const loadId = c.id;
    s = wire(s, modTerm(GRID_SOURCE_ID, "out_L"), modTerm(relayId, "in_L"));
    s = wire(s, modTerm(GRID_SOURCE_ID, "out_N"), modTerm(relayId, "in_N"));
    s = wire(s, modTerm(relayId, "out_L"), modTerm(loadId, "in_L"));
    s = wire(s, modTerm(relayId, "out_N"), modTerm(loadId, "in_N"));
    s = setSource(s, { grid_active: true, grid_voltage_V: 230 });
    const r = simulate(s);
    expect(r.newTrips).toEqual([]);
    expect(r.runtime[loadId].lit).toBe(true);
  });
});

describe("simulate — three-way switch", () => {
  function buildSwitchScheme(pos: SwitchPosition) {
    let s = emptyScheme();
    const a = place(s, "three_way_switch", 1, 0);
    s = patchModule(a.scheme, a.id, { switch_position: pos });
    const switchId = a.id;
    const c = place(s, "load", 3, 0);
    s = c.scheme;
    const loadId = c.id;
    // Wire grid feed to switch's grid input.
    s = wire(
      s,
      modTerm(GRID_SOURCE_ID, "out_L"),
      modTerm(switchId, "in_L_grid"),
    );
    s = wire(
      s,
      modTerm(GRID_SOURCE_ID, "out_N"),
      modTerm(switchId, "in_N_grid"),
    );
    // Wire generator feed to switch's generator input.
    s = wire(
      s,
      modTerm("fixture_generator", "out_L"),
      modTerm(switchId, "in_L_gen"),
    );
    s = wire(
      s,
      modTerm("fixture_generator", "out_N"),
      modTerm(switchId, "in_N_gen"),
    );
    // Switch output → load.
    s = wire(s, modTerm(switchId, "out_L"), modTerm(loadId, "in_L"));
    s = wire(s, modTerm(switchId, "out_N"), modTerm(loadId, "in_N"));
    return { scheme: s, switchId, loadId };
  }

  it('position "off" → load is dark', () => {
    const { scheme, loadId } = buildSwitchScheme("off");
    const s = setSource(scheme, { grid_active: true, grid_voltage_V: 230 });
    const r = simulate(s);
    expect(r.runtime[loadId].lit).toBe(false);
  });

  it('position "network" with grid → load lit', () => {
    const { scheme, loadId } = buildSwitchScheme("network");
    const s = setSource(scheme, { grid_active: true, grid_voltage_V: 230 });
    const r = simulate(s);
    expect(r.runtime[loadId].lit).toBe(true);
  });

  it('position "generator" with grid off and gen on → load lit from generator', () => {
    const { scheme, loadId } = buildSwitchScheme("generator");
    let s = setSource(scheme, {
      grid_active: false,
      gen_active: true,
      gen_voltage_V: 230,
    });
    s = patchModule(s, "fixture_generator", { on: true });
    const r = simulate(s);
    expect(r.runtime[loadId].lit).toBe(true);
    expect(r.runtime[loadId].voltage_in_V).toBe(230);
  });

  it('position "network" with grid off → load dark even if gen is on', () => {
    const { scheme, loadId } = buildSwitchScheme("network");
    const s = setSource(scheme, {
      grid_active: false,
      gen_active: true,
      gen_voltage_V: 230,
    });
    const r = simulate(s);
    expect(r.runtime[loadId].lit).toBe(false);
  });
});

describe("simulate — inverter", () => {
  it("inverter ON with grid ON → bypass active, load powered from grid", () => {
    let s = emptyScheme();
    const invId = "fixture_inverter";
    const c = place(s, "load", 3, 0);
    s = c.scheme;
    const loadId = c.id;

    // Wire grid to inverter input
    s = wire(s, modTerm(GRID_SOURCE_ID, "out_L"), modTerm(invId, "in_L"));
    s = wire(s, modTerm(GRID_SOURCE_ID, "out_N"), modTerm(invId, "in_N"));

    // Wire inverter output to load
    s = wire(s, modTerm(invId, "out_L"), modTerm(loadId, "in_L"));
    s = wire(s, modTerm(invId, "out_N"), modTerm(loadId, "in_N"));

    s = setSource(s, { grid_active: true, grid_voltage_V: 230 });
    s = patchModule(s, invId, { on: true });

    const r = simulate(s);
    expect(r.runtime[invId].energized).toBe(true);
    expect(r.runtime[invId].voltage_out_V).toBe(230);
    expect(r.runtime[loadId].lit).toBe(true);
  });

  it("breaker feeding a bypassing inverter carries the downstream load current (not 0)", () => {
    // Regression: loadsFedThrough() used to re-detect each inverter's
    // bypass-vs-battery mode inside every "what if this breaker were off"
    // hypothetical. Cutting the breaker that feeds the inverter made the
    // hypothetical inverter "rescue" the load by switching to battery mode,
    // so the load never appeared to die — leaving the breaker's current_A
    // at 0 even though, right now, it is actually carrying the bypassed
    // grid current straight through to the load.
    let s = emptyScheme();
    const invId = "fixture_inverter";
    const a = place(s, "main_breaker", 1, 0);
    s = a.scheme;
    const breakerId = a.id;
    const c = place(s, "load", 3, 0);
    s = c.scheme;
    const loadId = c.id;
    s = patchModule(s, loadId, { power_W: 2_000 });

    s = wire(s, modTerm(GRID_SOURCE_ID, "out_L"), modTerm(breakerId, "in_L"));
    s = wire(s, modTerm(GRID_SOURCE_ID, "out_N"), modTerm(breakerId, "in_N"));
    s = wire(s, modTerm(breakerId, "out_L"), modTerm(invId, "in_L"));
    s = wire(s, modTerm(breakerId, "out_N"), modTerm(invId, "in_N"));
    s = wire(s, modTerm(invId, "out_L"), modTerm(loadId, "in_L"));
    s = wire(s, modTerm(invId, "out_N"), modTerm(loadId, "in_N"));

    s = setSource(s, { grid_active: true, grid_voltage_V: 230 });
    s = patchModule(s, invId, { on: true });

    const r = simulate(s);
    expect(r.runtime[invId].energized).toBe(true); // bypass, not battery
    expect(r.runtime[loadId].lit).toBe(true);
    expect(r.runtime[breakerId].current_A).toBeCloseTo(
      r.runtime[loadId].current_A,
      5,
    );
    expect(r.runtime[breakerId].current_A).toBeGreaterThan(0);
  });

  it("inverter ON with grid OFF → battery backup active, load powered from inverter battery", () => {
    let s = emptyScheme();
    const invId = "fixture_inverter";
    const c = place(s, "load", 3, 0);
    s = c.scheme;
    const loadId = c.id;

    // Wire grid to inverter input
    s = wire(s, modTerm(GRID_SOURCE_ID, "out_L"), modTerm(invId, "in_L"));
    s = wire(s, modTerm(GRID_SOURCE_ID, "out_N"), modTerm(invId, "in_N"));

    // Wire inverter output to load
    s = wire(s, modTerm(invId, "out_L"), modTerm(loadId, "in_L"));
    s = wire(s, modTerm(invId, "out_N"), modTerm(loadId, "in_N"));

    s = setSource(s, { grid_active: false });
    s = patchModule(s, invId, { on: true });

    const r = simulate(s);
    expect(r.runtime[invId].energized).toBe(false);
    expect(r.runtime[invId].voltage_out_V).toBe(230); // Battery generated
    expect(r.runtime[loadId].lit).toBe(true);
  });
});

describe("analyzeStructure — logical warnings (§2.4)", () => {
  it("LOAD_NO_PE: load chassis not wired to PE bus", () => {
    let s = emptyScheme();
    const a = place(s, "load", 3, 0);
    s = a.scheme;
    const loadId = a.id;
    // Wire only L and N, leave PE floating.
    s = wire(s, modTerm(GRID_SOURCE_ID, "out_L"), modTerm(loadId, "in_L"));
    s = wire(s, modTerm(GRID_SOURCE_ID, "out_N"), modTerm(loadId, "in_N"));
    const r = simulate(s);
    expect(
      r.diagnostics.some(
        (d) => d.code === "LOAD_NO_PE" && d.related_components.includes(loadId),
      ),
    ).toBe(true);
  });

  it("LOAD_NO_PE: cleared when PE is wired to the PE bus", () => {
    let s = emptyScheme();
    const a = place(s, "load", 3, 0);
    s = a.scheme;
    const loadId = a.id;
    s = wire(s, modTerm(GRID_SOURCE_ID, "out_L"), modTerm(loadId, "in_L"));
    s = wire(s, modTerm(GRID_SOURCE_ID, "out_N"), modTerm(loadId, "in_N"));
    s = wire(s, modTerm(GRID_SOURCE_ID, "out_PE"), busTap("PE", 0));
    s = wire(s, busTap("PE", 1), modTerm(loadId, "in_PE"));
    const r = simulate(s);
    expect(r.diagnostics.some((d) => d.code === "LOAD_NO_PE")).toBe(false);
  });

  it("BAD_BREAKER_RATING: a 40 A breaker downstream of a 25 A RCD", () => {
    let s = emptyScheme();
    const a = place(s, "rcd", 1, 0);
    s = patchModule(a.scheme, a.id, { rated_current_A: 25 });
    const rcdId = a.id;
    const b = place(s, "branch_breaker", 1, 2);
    s = patchModule(b.scheme, b.id, { rated_current_A: 40 });
    const breakerId = b.id;
    s = wire(s, modTerm(GRID_SOURCE_ID, "out_L"), modTerm(rcdId, "in_L"));
    s = wire(s, modTerm(GRID_SOURCE_ID, "out_N"), modTerm(rcdId, "in_N"));
    s = wire(s, modTerm(rcdId, "out_L"), modTerm(breakerId, "in_L"));
    const r = simulate(s);
    expect(
      r.diagnostics.some(
        (d) =>
          d.code === "BAD_BREAKER_RATING" &&
          d.related_components.includes(breakerId) &&
          d.related_components.includes(rcdId),
      ),
    ).toBe(true);
  });

  it("BAD_BREAKER_RATING: not raised when breaker is rated below RCD", () => {
    let s = emptyScheme();
    const a = place(s, "rcd", 1, 0);
    s = patchModule(a.scheme, a.id, { rated_current_A: 40 });
    const rcdId = a.id;
    const b = place(s, "branch_breaker", 1, 2);
    s = patchModule(b.scheme, b.id, { rated_current_A: 16 });
    const breakerId = b.id;
    s = wire(s, modTerm(GRID_SOURCE_ID, "out_L"), modTerm(rcdId, "in_L"));
    s = wire(s, modTerm(GRID_SOURCE_ID, "out_N"), modTerm(rcdId, "in_N"));
    s = wire(s, modTerm(rcdId, "out_L"), modTerm(breakerId, "in_L"));
    const r = simulate(s);
    expect(r.diagnostics.some((d) => d.code === "BAD_BREAKER_RATING")).toBe(false);
  });

  it("RCD_NO_TRANSIT_N: load's N bypasses the RCD via the N bus", () => {
    let s = emptyScheme();
    const a = place(s, "rcd", 1, 0);
    s = a.scheme;
    const rcdId = a.id;
    const c = place(s, "load", 3, 0);
    s = c.scheme;
    const loadId = c.id;
    // L through RCD, N straight from N bus (skipping the RCD).
    s = wire(s, modTerm(GRID_SOURCE_ID, "out_L"), modTerm(rcdId, "in_L"));
    s = wire(s, modTerm(rcdId, "out_L"), modTerm(loadId, "in_L"));
    s = wire(s, modTerm(GRID_SOURCE_ID, "out_N"), busTap("N", 0));
    s = wire(s, busTap("N", 1), modTerm(loadId, "in_N"));
    const r = simulate(s);
    expect(
      r.diagnostics.some(
        (d) =>
          d.code === "RCD_NO_TRANSIT_N" &&
          d.related_components.includes(loadId) &&
          d.related_components.includes(rcdId),
      ),
    ).toBe(true);
  });

  it("RCD_NO_TRANSIT_N: cleared when both L and N go through RCD", () => {
    let s = emptyScheme();
    const a = place(s, "rcd", 1, 0);
    s = a.scheme;
    const rcdId = a.id;
    const c = place(s, "load", 3, 0);
    s = c.scheme;
    const loadId = c.id;
    s = wire(s, modTerm(GRID_SOURCE_ID, "out_L"), modTerm(rcdId, "in_L"));
    s = wire(s, modTerm(GRID_SOURCE_ID, "out_N"), modTerm(rcdId, "in_N"));
    s = wire(s, modTerm(rcdId, "out_L"), modTerm(loadId, "in_L"));
    s = wire(s, modTerm(rcdId, "out_N"), modTerm(loadId, "in_N"));
    const r = simulate(s);
    expect(r.diagnostics.some((d) => d.code === "RCD_NO_TRANSIT_N")).toBe(false);
  });
});

describe("educational hints", () => {
  it("HINT_THERMAL_COOLDOWN appears while a breaker is tripped by overload", () => {
    const { scheme, breakerId } = basicSchemeWithBreaker(16);
    const tripped = patchModule(scheme, breakerId, {
      tripped: true,
      trip_reason: "overload",
    });
    const r = simulate(tripped);
    expect(
      r.diagnostics.some(
        (d) =>
          d.code === "HINT_THERMAL_COOLDOWN" &&
          d.related_components.includes(breakerId),
      ),
    ).toBe(true);
  });
});
