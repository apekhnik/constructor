// Editable scheme state — source of truth for module layout and wiring.

import type { CatalogEntry } from "./catalog";
import { terminalsFor } from "./terminals";
import type { BreakerCurve, ComponentKind, TripReason } from "./types";

// Panel variant — selectable from the UI. "small" = single DIN rail with 6
// slots, all buses get 6 taps. "large" = two rails of 12 slots each, buses
// get 12 taps. Layout geometry is derived in `model/layout.ts::getLayout`.
export type PanelMode = "small" | "large";
export const DEFAULT_PANEL_MODE: PanelMode = "large";

export const SUPPLY_RAIL_INDEX = 0;
export const LOAD_RAIL_INDEX = 3;

export function slotsPerRail(mode: PanelMode): number {
  return mode === "small" ? 6 : 12;
}
export function railCount(mode: PanelMode): number {
  return mode === "small" ? 1 : 2;
}
export function loadSlots(mode: PanelMode): number {
  return mode === "small" ? 6 : 12;
}

// Built-in grid source fixture id — present in every scheme.
export const GRID_SOURCE_ID = "fixture_grid_source";

export type SwitchPosition = "network" | "off" | "generator";

export type RelayDisplayMode = "V" | "A" | "W";
export const RELAY_DISPLAY_CYCLE: RelayDisplayMode[] = ["V", "A", "W"];

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
  // Load active power in watts. Simulator derives current as power_W / U so
  // turning the dial up trips upstream breakers by overload / short-circuit.
  power_W?: number;
  // Voltage-relay digital display mode — selectable between V (line voltage),
  // A (line current through the relay) and W (instantaneous active power).
  relay_display?: RelayDisplayMode;
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

// Optional panel elements the user can hide to reduce visual clutter when
// a scheme doesn't need them. N stays always-visible — no scheme is
// meaningfully buildable without it.
export interface PanelVisibility {
  busL: boolean;
  busPE: boolean;
  generator: boolean;
  inverter: boolean;
}

export const defaultVisibility = (): PanelVisibility => ({
  busL: true,
  busPE: true,
  generator: true,
  inverter: true,
});

export type Endpoint =
  | { kind: "module"; moduleId: string; terminalId: string }
  | { kind: "bus"; bus: "L" | "N" | "PE"; tapIndex: number };

export interface Wire {
  id: string;
  conductor: "L" | "N" | "PE";
  from: Endpoint;
  to: Endpoint;
  // Marks wires that should be drawn with the lane-based router (one dedicated
  // Y-track per wire within a safe band). Absent on legacy wires loaded from
  // older saved schemes — those keep the old shared-channel manhattanPath.
  routed?: boolean;
  // Spike: wires created while the JointJS adapter (src/wiring/jointjs) is
  // enabled. Takes precedence over `routed` — points come from the adapter,
  // not from routedPath/manhattanPath.
  routed_v2?: true;
}

export interface Scheme {
  panelMode: PanelMode;
  modules: PlacedModule[];
  wires: Wire[];
  selectedId: string | null;
  selectedWireId: string | null;
  pendingFrom: Endpoint | null;
  source: SourceState;
  visibility: PanelVisibility;
  // Spike (dev-only): when true, newly created wires are flagged with
  // `routed_v2`, asking the JointJS adapter to compute their route.
  newRouterEnabled?: boolean;
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

export function generatorFixture(): PlacedModule {
  return {
    id: "fixture_generator",
    kind: "generator",
    label: "Генератор",
    spec: "230 В · 5.5 кВт",
    poles: 2,
    rail: -1,
    slot: 0,
    on: false,
    tripped: false,
    trip_reason: null,
  };
}

export function inverterFixture(): PlacedModule {
  return {
    id: "fixture_inverter",
    kind: "inverter",
    label: "Инвертор",
    spec: "230 В · Гибридный",
    poles: 2,
    rail: -1,
    slot: 1,
    on: true,
    tripped: false,
    trip_reason: null,
  };
}

export const emptyScheme = (mode: PanelMode = DEFAULT_PANEL_MODE): Scheme => ({
  panelMode: mode,
  modules: [gridSourceFixture(), generatorFixture(), inverterFixture()],
  wires: [],
  selectedId: null,
  selectedWireId: null,
  pendingFrom: null,
  source: defaultSource(),
  visibility: defaultVisibility(),
  newRouterEnabled: false,
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
export function placementRailsFor(
  kind: ComponentKind,
  mode: PanelMode = DEFAULT_PANEL_MODE,
): number[] {
  if (kind === "load") return [LOAD_RAIL_INDEX];
  if (RAIL_PLACEABLE.has(kind)) {
    return railCount(mode) === 1 ? [1] : [1, 2];
  }
  return [];
}

export const isPlaceable = (kind: ComponentKind): boolean =>
  placementRailsFor(kind).length > 0;

function railSlotCount(rail: number, mode: PanelMode): number {
  return rail === LOAD_RAIL_INDEX ? loadSlots(mode) : slotsPerRail(mode);
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
  const mode = scheme.panelMode;
  // Supply zone (rail 0) is reserved for the built-in source — no manual drops.
  if (rail !== LOAD_RAIL_INDEX && (rail < 1 || rail > railCount(mode))) return false;
  if (slot < 0 || slot + moduleWidth(poles) > railSlotCount(rail, mode)) return false;
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
  const cap = slotsPerRail(scheme.panelMode);
  for (let s = 0; s + moduleWidth(poles) <= cap; s++) {
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
    relay_display: entry.kind === "voltage_relay" ? "V" : undefined,
    power_W: entry.kind === "load" ? (entry.power_W ?? 100) : undefined,
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

export function endpointWireCount(ep: Endpoint, wires: Wire[]): number {
  const k = endpointKey(ep);
  let n = 0;
  for (const w of wires) {
    if (endpointKey(w.from) === k) n++;
    if (endpointKey(w.to) === k) n++;
  }
  return n;
}

export function isEndpointOccupied(ep: Endpoint, wires: Wire[]): boolean {
  return endpointWireCount(ep, wires) > 0;
}

// A module screw can hold up to two conductors (real DIN automatic devices
// routinely accept doubled wires under one clamp). Bus taps stay single-wire —
// branching on a bus is achieved by adding another tap.
const MAX_WIRES_PER_TERMINAL: Record<Endpoint["kind"], number> = {
  module: 2,
  bus: 1,
};

export function endpointFull(ep: Endpoint, wires: Wire[]): boolean {
  return endpointWireCount(ep, wires) >= MAX_WIRES_PER_TERMINAL[ep.kind];
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
  const reasonForFull = (ep: Endpoint): string =>
    ep.kind === "bus"
      ? "Тап шины уже занят — используйте соседнюю точку"
      : "На клемме уже два провода — для большего числа отводов используйте шину";
  if (endpointFull(a, scheme.wires)) {
    return { ok: false, reason: reasonForFull(a) };
  }
  if (endpointFull(b, scheme.wires)) {
    return { ok: false, reason: reasonForFull(b) };
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
  | { type: "set_load_power"; id: string; power_W: number }
  | { type: "cycle_relay_display"; id: string }
  | { type: "set_relay_display"; id: string; mode: RelayDisplayMode }
  | { type: "add_wire"; from: Endpoint; to: Endpoint }
  | { type: "remove_wire"; id: string }
  | { type: "select_wire"; id: string | null }
  | { type: "set_pending"; ep: Endpoint | null }
  | { type: "set_source"; patch: Partial<SourceState> }
  | { type: "set_trip"; id: string; reason: TripReason }
  | { type: "set_panel_mode"; mode: PanelMode }
  | { type: "set_visibility"; patch: Partial<PanelVisibility> }
  | { type: "set_new_router"; enabled: boolean }
  | { type: "load"; scheme: Scheme }
  | { type: "clear" };

// What would be dropped if we switched to `mode`? Pure preview — caller can
// surface a confirmation dialog before dispatching `set_panel_mode`.
export function panelModeImpact(
  scheme: Scheme,
  mode: PanelMode,
): { droppedModuleIds: string[]; droppedWireIds: Set<string> } {
  const rails = railCount(mode);
  const slots = slotsPerRail(mode);
  const loads = loadSlots(mode);
  const droppedModuleIds: string[] = [];
  for (const m of scheme.modules) {
    if (m.kind === "source" || m.kind === "generator" || m.kind === "inverter") continue;
    if (m.rail === LOAD_RAIL_INDEX) {
      if (m.slot >= loads) droppedModuleIds.push(m.id);
      continue;
    }
    if (m.rail < 1 || m.rail > rails) {
      droppedModuleIds.push(m.id);
      continue;
    }
    if (m.slot + moduleWidth(m.poles) > slots) {
      droppedModuleIds.push(m.id);
    }
  }
  const droppedIds = new Set(droppedModuleIds);
  const droppedWireIds = new Set<string>();
  for (const w of scheme.wires) {
    const fromMod = w.from.kind === "module" && droppedIds.has(w.from.moduleId);
    const toMod = w.to.kind === "module" && droppedIds.has(w.to.moduleId);
    // Bus taps that no longer exist (tap index out of range for new mode).
    const fromBus =
      w.from.kind === "bus" && w.from.tapIndex >= maxTapIndex(w.from.bus, mode);
    const toBus =
      w.to.kind === "bus" && w.to.tapIndex >= maxTapIndex(w.to.bus, mode);
    if (fromMod || toMod || fromBus || toBus) droppedWireIds.add(w.id);
  }
  return { droppedModuleIds, droppedWireIds };
}

function maxTapIndex(bus: "L" | "N" | "PE", mode: PanelMode): number {
  const slots = slotsPerRail(mode);
  // Mirror layout.ts: L/N have slotsPerRail/2 per side × 2 sides; PE has slotsPerRail × 1 side.
  return bus === "PE" ? slots : Math.max(1, Math.floor(slots / 2)) * 2;
}

function removeWiresAttachedTo(wires: Wire[], moduleId: string): Wire[] {
  return wires.filter(
    (w) =>
      !(w.from.kind === "module" && w.from.moduleId === moduleId) &&
      !(w.to.kind === "module" && w.to.moduleId === moduleId),
  );
}

// What wires would be dropped if `patch` were applied to scheme.visibility?
// Pure preview — caller (SchemeSettingsPanel) confirms before dispatching
// `set_visibility`, mirroring panelModeImpact's UX. Also returns `next`
// (the merged visibility) so the reducer case doesn't recompute the merge.
export function visibilityImpact(
  scheme: Scheme,
  patch: Partial<PanelVisibility>,
): { next: PanelVisibility; droppedWireIds: Set<string> } {
  const next = { ...scheme.visibility, ...patch };
  const endpointTouchesHidden = (ep: Endpoint): boolean => {
    if (ep.kind === "bus") {
      if (ep.bus === "L") return !next.busL;
      if (ep.bus === "PE") return !next.busPE;
      return false; // N bus is always visible
    }
    if (ep.moduleId === "fixture_generator") return !next.generator;
    if (ep.moduleId === "fixture_inverter") return !next.inverter;
    return false;
  };
  const droppedWireIds = new Set<string>();
  for (const w of scheme.wires) {
    if (endpointTouchesHidden(w.from) || endpointTouchesHidden(w.to)) {
      droppedWireIds.add(w.id);
    }
  }
  return { next, droppedWireIds };
}

export function schemeReducer(scheme: Scheme, action: SchemeAction): Scheme {
  switch (action.type) {
    case "place": {
      const acceptedRails = placementRailsFor(action.entry.kind, scheme.panelMode);
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
      if (m.kind === "source" || m.kind === "generator" || m.kind === "inverter") return scheme; // source, generator, inverter are fixtures
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
      if (target?.kind === "source" || target?.kind === "generator" || target?.kind === "inverter") return scheme; // can't delete fixtures
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
    case "cycle_relay_display": {
      return {
        ...scheme,
        modules: scheme.modules.map((x) => {
          if (x.id !== action.id || x.kind !== "voltage_relay") return x;
          const cur = x.relay_display ?? "V";
          const next =
            RELAY_DISPLAY_CYCLE[
              (RELAY_DISPLAY_CYCLE.indexOf(cur) + 1) % RELAY_DISPLAY_CYCLE.length
            ];
          return { ...x, relay_display: next };
        }),
      };
    }
    case "set_relay_display": {
      return {
        ...scheme,
        modules: scheme.modules.map((x) =>
          x.id === action.id && x.kind === "voltage_relay"
            ? { ...x, relay_display: action.mode }
            : x,
        ),
      };
    }
    case "set_load_power": {
      const clamped = Math.max(0, Math.min(25_000, Math.round(action.power_W)));
      return {
        ...scheme,
        modules: scheme.modules.map((x) =>
          x.id === action.id && x.kind === "load"
            ? { ...x, power_W: clamped, tripped: false, trip_reason: null }
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
        routed: true,
        ...(scheme.newRouterEnabled ? { routed_v2: true as const } : {}),
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
    case "set_panel_mode": {
      if (scheme.panelMode === action.mode) return scheme;
      const { droppedModuleIds, droppedWireIds } = panelModeImpact(
        scheme,
        action.mode,
      );
      const dropSet = new Set(droppedModuleIds);
      return {
        ...scheme,
        panelMode: action.mode,
        modules: scheme.modules.filter((m) => !dropSet.has(m.id)),
        wires: scheme.wires.filter((w) => !droppedWireIds.has(w.id)),
        selectedId:
          scheme.selectedId && dropSet.has(scheme.selectedId)
            ? null
            : scheme.selectedId,
        selectedWireId:
          scheme.selectedWireId && droppedWireIds.has(scheme.selectedWireId)
            ? null
            : scheme.selectedWireId,
        pendingFrom: null,
      };
    }
    case "set_visibility": {
      const { next, droppedWireIds } = visibilityImpact(scheme, action.patch);
      const selectedIsHiddenFixture =
        (scheme.selectedId === "fixture_generator" && !next.generator) ||
        (scheme.selectedId === "fixture_inverter" && !next.inverter);
      return {
        ...scheme,
        visibility: next,
        wires: scheme.wires.filter((w) => !droppedWireIds.has(w.id)),
        selectedId: selectedIsHiddenFixture ? null : scheme.selectedId,
        selectedWireId:
          scheme.selectedWireId && droppedWireIds.has(scheme.selectedWireId)
            ? null
            : scheme.selectedWireId,
        pendingFrom: null,
      };
    }
    case "set_new_router": {
      return { ...scheme, newRouterEnabled: action.enabled };
    }
    case "clear": {
      return emptyScheme(scheme.panelMode);
    }
  }
}
