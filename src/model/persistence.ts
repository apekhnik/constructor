// localStorage round-trip for the editable scheme. We only persist the data
// the user actually authored — modules, wires, source state. Transient UI
// state (selection, pending wire) is reset on load so the next session
// starts in an idle state.

import {
  defaultSource,
  emptyScheme,
  GRID_SOURCE_ID,
  type PlacedModule,
  type Scheme,
  type SourceState,
  type Wire,
} from "./scheme";

const STORAGE_KEY = "electroshield:scheme:v1";

interface SerializedScheme {
  version: 1;
  modules: PlacedModule[];
  wires: Wire[];
  source: SourceState;
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function isValid(parsed: unknown): parsed is SerializedScheme {
  if (!isObject(parsed)) return false;
  if (parsed.version !== 1) return false;
  if (!Array.isArray(parsed.modules)) return false;
  if (!Array.isArray(parsed.wires)) return false;
  if (!isObject(parsed.source)) return false;
  // The built-in source fixture must be present.
  if (!parsed.modules.some((m) => isObject(m) && m.id === GRID_SOURCE_ID)) {
    return false;
  }
  return true;
}

export function serializeScheme(scheme: Scheme): SerializedScheme {
  return {
    version: 1,
    modules: scheme.modules,
    wires: scheme.wires,
    source: scheme.source,
  };
}

export function deserializeScheme(data: SerializedScheme): Scheme {
  return {
    modules: data.modules,
    wires: data.wires,
    source: { ...defaultSource(), ...data.source },
    selectedId: null,
    selectedWireId: null,
    pendingFrom: null,
  };
}

export function saveToStorage(scheme: Scheme): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeScheme(scheme)));
  } catch {
    // Quota / private mode — silent.
  }
}

export function loadFromStorage(): Scheme | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isValid(parsed)) return null;
    return deserializeScheme(parsed);
  } catch {
    return null;
  }
}

export function clearStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function initialScheme(): Scheme {
  return loadFromStorage() ?? emptyScheme();
}
