// Editable scheme state — source of truth for module layout on the rails.
// Engine/wires/simulation come later; here we only track placement.

import type { CatalogEntry } from "./catalog";
import type { BreakerCurve, ComponentKind, TripReason } from "./types";

export const SLOTS_PER_RAIL = 12;
export const RAIL_COUNT = 2;

export interface PlacedModule {
  id: string;
  kind: ComponentKind;
  label: string;
  spec: string;
  rated_current_A?: number;
  curve?: BreakerCurve;
  rated_leak_mA?: number;
  poles: 1 | 2;
  rail: number; // 1..RAIL_COUNT
  slot: number; // 0..SLOTS_PER_RAIL-1 (left edge for 2-pole)
  on: boolean;
  tripped: boolean;
  trip_reason: TripReason;
}

export interface Scheme {
  modules: PlacedModule[];
  selectedId: string | null;
}

export const emptyScheme = (): Scheme => ({ modules: [], selectedId: null });

// Not every catalog kind belongs on a DIN rail in MVP.
// Buses and loads come in Stage 3 with the wiring layer.
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

let _seq = 0;
const newId = (): string =>
  `m_${Date.now().toString(36)}_${(++_seq).toString(36)}`;

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
  if (rail < 1 || rail > RAIL_COUNT) return false;
  if (slot < 0 || slot + moduleWidth(poles) > SLOTS_PER_RAIL) return false;
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
    id: newId(),
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
  };
}

// --- Reducer ---

export type SchemeAction =
  | { type: "place"; entry: CatalogEntry; rail: number; slot: number }
  | { type: "move"; id: string; rail: number; slot: number }
  | { type: "remove"; id: string }
  | { type: "select"; id: string | null }
  | { type: "toggle_on"; id: string }
  | { type: "clear" };

export function schemeReducer(scheme: Scheme, action: SchemeAction): Scheme {
  switch (action.type) {
    case "place": {
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
      };
    }
    case "move": {
      const m = scheme.modules.find((x) => x.id === action.id);
      if (!m) return scheme;
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
      return {
        ...scheme,
        modules: scheme.modules.filter((x) => x.id !== action.id),
        selectedId: scheme.selectedId === action.id ? null : scheme.selectedId,
      };
    }
    case "select": {
      return { ...scheme, selectedId: action.id };
    }
    case "toggle_on": {
      return {
        ...scheme,
        modules: scheme.modules.map((x) =>
          x.id === action.id ? { ...x, on: !x.on } : x,
        ),
      };
    }
    case "clear": {
      return emptyScheme();
    }
  }
}
