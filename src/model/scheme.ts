// Editable scheme state — source of truth for module layout and wiring.

import type { CatalogEntry } from "./catalog";
import { terminalsFor } from "./terminals";
import type { BreakerCurve, ComponentKind, TripReason } from "./types";

export const SLOTS_PER_RAIL = 12;
export const RAIL_COUNT = 2;
export const SUPPLY_RAIL_INDEX = 0;
export const LOAD_RAIL_INDEX = 3;
export const LOAD_SLOTS = 12;

// Built-in grid source fixture id — present in every scheme.
export const GRID_SOURCE_ID = "fixture_grid_source";

export type SwitchPosition = "network" | "off" | "generator";

export interface PlacedModule {
  id: string;
  kind: ComponentKind;
  label: string;
  spec: string;
  rated_current_A?: number;
  curve?: BreakerCurve;
  rated_leak_mA?: number;
  poles: 1 | 2;
  rail: number;
  slot: number;
  on: boolean;
  tripped: boolean;
  trip_reason: TripReason;
  // Three-way switch position; default "network" for the switch module,
  // undefined / unused for other kinds.
  switch_position?: SwitchPosition;
  // Voltage relay user-tunable thresholds (CLAUDE.md §2.5).
  u_min_V?: number;
  u_max_V?: number;
}

// Sliders, kill-switches and simulated faults (CLAUDE.md §2.1, §2.5).
export interface SourceState {
  // master "power applied" toggle. Off → like an open service disconnect.
  grid_active: boolean;
  grid_voltage_V: number; // 0..300
  // Upstream neutral break (simulates the §2.5 "obriv N" test).
  neutral_break: boolean;
  // Backup generator availability and voltage.
  gen_active: boolean;
  gen_voltage_V: number;
  // Induced leakage at a specific load (mA). 0 = no leak.
  leak_mA: number;
  leak_target_id: string | null;
  // Forced short-circuit on a specific load (L↔N or L↔PE). null = no SC.
  short_target_id: string | null;
}

export const DEFAULT_U_MIN_V = 180;
export const DEFAULT_U_MAX_V = 250;

export const defaultSource = (): SourceState => ({
  grid_active: false,
  grid_voltage_V: 230,
  neutral_break: false,
  gen_active: false,
  gen_voltage_V: 230,
  leak_mA: 0,
  leak_target_id: null,
  short_target_id: null,
});

export type Endpoint =
  | { kind: "module"; moduleId: string; terminalId: string }
  | { kind: "bus"; bus: "L" | "N" | "PE"; tapIndex: number };

export interface Wire {
  id: string;
  conductor: "L" | "N" | "PE";
  from: Endpoint;
  to: Endpoint;
}

export interface Scheme {
  modules: PlacedModule[];
  wires: Wire[];
  selectedId: string | null;
  selectedWireId: string | null;
  pendingFrom: Endpoint | null;
  source: SourceState;
}

function gridSourceFixture(): PlacedModule {
  return {
    id: GRID_SOURCE_ID,
    kind: "source",
    label: "Ввод сети",
    spec: "230 В · 50 Гц",
    poles: 2,
    rail: SUPPLY_RAIL_INDEX,
    slot: 5,
    on: true,
    tripped: false,
    trip_reason: null,
  };
}

export const emptyScheme = (): Scheme => ({
  modules: [gridSourceFixture()],
  wires: [],
  selectedId: null,
  selectedWireId: null,
  pendingFrom: null,
  source: defaultSource(),
});

const RAIL_PLACEABLE: ReadonlySet<ComponentKind> = new Set([
  "main_breaker",
  "rcd",
  "diff_breaker",
  "branch_breaker",
  "voltage_relay",
  "three_way_switch",
]);

export const isRailPlaceable = (kind: ComponentKind): boolean =>
  RAIL_PLACEABLE.has(kind);

// Which rails (1, 2 = DIN, 3 = loads, 0 = supply) accept this kind from the palette?
export function placementRailsFor(kind: ComponentKind): number[] {
  if (kind === "load") return [LOAD_RAIL_INDEX];
  if (RAIL_PLACEABLE.has(kind)) return [1, 2];
  return [];
}

export const isPlaceable = (kind: ComponentKind): boolean =>
  placementRailsFor(kind).length > 0;

function railSlotCount(rail: number): number {
  return rail === LOAD_RAIL_INDEX ? LOAD_SLOTS : SLOTS_PER_RAIL;
}

let _seq = 0;
const newId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}_${(++_seq).toString(36)}`;

export const moduleWidth = (poles: 1 | 2): number => (poles === 2 ? 2 : 1);

function takenSlots(scheme: Scheme, ignoreId?: string): Set<string> {
  const taken = new Set<string>();
  for (const m of scheme.modules) {
    if (m.id === ignoreId) continue;
    for (let i = 0; i < moduleWidth(m.poles); i++) {
      taken.add(`${m.rail}:${m.slot + i}`);
    }
  }
  return taken;
}

export function canPlace(
  scheme: Scheme,
  poles: 1 | 2,
  rail: number,
  slot: number,
  ignoreId?: string,
): boolean {
  // Supply zone (rail 0) is reserved for the built-in source — no manual drops.
  if (rail !== LOAD_RAIL_INDEX && (rail < 1 || rail > RAIL_COUNT)) return false;
  if (slot < 0 || slot + moduleWidth(poles) > railSlotCount(rail)) return false;
  const taken = takenSlots(scheme, ignoreId);
  for (let i = 0; i < moduleWidth(poles); i++) {
    if (taken.has(`${rail}:${slot + i}`)) return false;
  }
  return true;
}

export function findFirstFreeSlot(
  scheme: Scheme,
  poles: 1 | 2,
  rail: number,
): number | null {
  for (let s = 0; s + moduleWidth(poles) <= SLOTS_PER_RAIL; s++) {
    if (canPlace(scheme, poles, rail, s)) return s;
  }
  return null;
}

export function makePlacedFromCatalog(
  entry: CatalogEntry,
  rail: number,
  slot: number,
): PlacedModule {
  const poles = (entry.poles ?? 1) as 1 | 2;
  return {
    id: newId("m"),
    kind: entry.kind,
    label: entry.name,
    spec: entry.spec,
    rated_current_A: entry.rated_current_A,
    curve: entry.curve,
    rated_leak_mA: entry.rated_leak_mA,
    poles,
    rail,
    slot,
    on: true,
    tripped: false,
    trip_reason: null,
    switch_position: entry.kind === "three_way_switch" ? "network" : undefined,
    u_min_V: entry.kind === "voltage_relay" ? DEFAULT_U_MIN_V : undefined,
    u_max_V: entry.kind === "voltage_relay" ? DEFAULT_U_MAX_V : undefined,
  };
}

// --- Wires ---

export function endpointKey(ep: Endpoint): string {
  if (ep.kind === "bus") return `bus:${ep.bus}:${ep.tapIndex}`;
  return `mod:${ep.moduleId}:${ep.terminalId}`;
}

export function endpointConductor(
  ep: Endpoint,
  modules: PlacedModule[],
): "L" | "N" | "PE" | null {
  if (ep.kind === "bus") return ep.bus;
  const m = modules.find((x) => x.id === ep.moduleId);
  if (!m) return null;
  const t = terminalsFor(m.kind).find((tt) => tt.id === ep.terminalId);
  return t?.conductor ?? null;
}

export function isEndpointOccupied(ep: Endpoint, wires: Wire[]): boolean {
  const k = endpointKey(ep);
  return wires.some(
    (w) => endpointKey(w.from) === k || endpointKey(w.to) === k,
  );
}

export interface ConnectCheck {
  ok: boolean;
  reason?: string;
}

export function canConnect(
  scheme: Scheme,
  a: Endpoint,
  b: Endpoint,
): ConnectCheck {
  if (endpointKey(a) === endpointKey(b)) {
    return { ok: false, reason: "Та же клемма" };
  }
  if (
    a.kind === "module" &&
    b.kind === "module" &&
    a.moduleId === b.moduleId
  ) {
    return { ok: false, reason: "Петля на тот же модуль" };
  }
  const cA = endpointConductor(a, scheme.modules);
  const cB = endpointConductor(b, scheme.modules);
  if (!cA || !cB) {
    return { ok: false, reason: "Неизвестная клемма" };
  }
  if (cA !== cB) {
    return { ok: false, reason: `Несовместимые проводники: ${cA} ↔ ${cB}` };
  }
  if (isEndpointOccupied(a, scheme.wires)) {
    return { ok: false, reason: "Первая клемма уже занята" };
  }
  if (isEndpointOccupied(b, scheme.wires)) {
    return { ok: false, reason: "Клемма уже занята" };
  }
  return { ok: true };
}

// --- Reducer ---

export type SchemeAction =
  | { type: "place"; entry: CatalogEntry; rail: number; slot: number }
  | { type: "move"; id: string; rail: number; slot: number }
  | { type: "remove"; id: string }
  | { type: "select"; id: string | null }
  | { type: "toggle_on"; id: string }
  | { type: "reset_trip"; id: string }
  | { type: "set_switch"; id: string; position: SwitchPosition }
  | {
      type: "set_relay_thresholds";
      id: string;
      u_min_V?: number;
      u_max_V?: number;
    }
  | { type: "add_wire"; from: Endpoint; to: Endpoint }
  | { type: "remove_wire"; id: string }
  | { type: "select_wire"; id: string | null }
  | { type: "set_pending"; ep: Endpoint | null }
  | { type: "set_source"; patch: Partial<SourceState> }
  | { type: "set_trip"; id: string; reason: TripReason }
  | { type: "load"; scheme: Scheme }
  | { type: "clear" };

function removeWiresAttachedTo(wires: Wire[], moduleId: string): Wire[] {
  return wires.filter(
    (w) =>
      !(w.from.kind === "module" && w.from.moduleId === moduleId) &&
      !(w.to.kind === "module" && w.to.moduleId === moduleId),
  );
}

export function schemeReducer(scheme: Scheme, action: SchemeAction): Scheme {
  switch (action.type) {
    case "place": {
      const acceptedRails = placementRailsFor(action.entry.kind);
      if (!acceptedRails.includes(action.rail)) return scheme;
      const poles = (action.entry.poles ?? 1) as 1 | 2;
      if (!canPlace(scheme, poles, action.rail, action.slot)) return scheme;
      const placed = makePlacedFromCatalog(
        action.entry,
        action.rail,
        action.slot,
      );
      return {
        ...scheme,
        modules: [...scheme.modules, placed],
        selectedId: placed.id,
        selectedWireId: null,
        pendingFrom: null,
      };
    }
    case "move": {
      const m = scheme.modules.find((x) => x.id === action.id);
      if (!m) return scheme;
      if (m.kind === "source") return scheme; // source is a fixture
      if (m.rail !== action.rail) return scheme; // can't move across zones
      if (!canPlace(scheme, m.poles, action.rail, action.slot, m.id))
        return scheme;
      return {
        ...scheme,
        modules: scheme.modules.map((x) =>
          x.id === m.id ? { ...x, rail: action.rail, slot: action.slot } : x,
        ),
      };
    }
    case "remove": {
      const target = scheme.modules.find((x) => x.id === action.id);
      if (target?.kind === "source") return scheme; // can't delete the source
      return {
        ...scheme,
        modules: scheme.modules.filter((x) => x.id !== action.id),
        wires: removeWiresAttachedTo(scheme.wires, action.id),
        selectedId: scheme.selectedId === action.id ? null : scheme.selectedId,
        pendingFrom: null,
      };
    }
    case "select": {
      return {
        ...scheme,
        selectedId: action.id,
        selectedWireId: action.id ? null : scheme.selectedWireId,
        pendingFrom: null,
      };
    }
    case "toggle_on": {
      return {
        ...scheme,
        modules: scheme.modules.map((x) =>
          x.id === action.id
            ? { ...x, on: !x.on, tripped: false, trip_reason: null }
            : x,
        ),
      };
    }
    case "reset_trip": {
      return {
        ...scheme,
        modules: scheme.modules.map((x) =>
          x.id === action.id
            ? { ...x, tripped: false, trip_reason: null, on: true }
            : x,
        ),
      };
    }
    case "set_trip": {
      return {
        ...scheme,
        modules: scheme.modules.map((x) =>
          x.id === action.id
            ? { ...x, tripped: action.reason !== null, trip_reason: action.reason }
            : x,
        ),
      };
    }
    case "set_switch": {
      return {
        ...scheme,
        modules: scheme.modules.map((x) =>
          x.id === action.id && x.kind === "three_way_switch"
            ? { ...x, switch_position: action.position }
            : x,
        ),
      };
    }
    case "set_relay_thresholds": {
      return {
        ...scheme,
        modules: scheme.modules.map((x) =>
          x.id === action.id && x.kind === "voltage_relay"
            ? {
                ...x,
                u_min_V: action.u_min_V ?? x.u_min_V,
                u_max_V: action.u_max_V ?? x.u_max_V,
              }
            : x,
        ),
      };
    }
    case "set_source": {
      return { ...scheme, source: { ...scheme.source, ...action.patch } };
    }
    case "add_wire": {
      const check = canConnect(scheme, action.from, action.to);
      if (!check.ok) return scheme;
      const conductor = endpointConductor(action.from, scheme.modules);
      if (!conductor) return scheme;
      const wire: Wire = {
        id: newId("w"),
        conductor,
        from: action.from,
        to: action.to,
      };
      return {
        ...scheme,
        wires: [...scheme.wires, wire],
        selectedWireId: wire.id,
        selectedId: null,
        pendingFrom: null,
      };
    }
    case "remove_wire": {
      return {
        ...scheme,
        wires: scheme.wires.filter((w) => w.id !== action.id),
        selectedWireId:
          scheme.selectedWireId === action.id ? null : scheme.selectedWireId,
      };
    }
    case "select_wire": {
      return {
        ...scheme,
        selectedWireId: action.id,
        selectedId: action.id ? null : scheme.selectedId,
        pendingFrom: null,
      };
    }
    case "set_pending": {
      return { ...scheme, pendingFrom: action.ep };
    }
    case "load": {
      return {
        ...action.scheme,
        selectedId: null,
        selectedWireId: null,
        pendingFrom: null,
      };
    }
    case "clear": {
      return emptyScheme();
    }
  }
}
