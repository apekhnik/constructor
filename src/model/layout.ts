// Geometry of the panel layout (supply + rails + buses + loads) in rem.
// Pure math, no DOM. UI and wire-overlay both derive positions from here
// so they stay aligned regardless of React render order.

import { LOAD_RAIL_INDEX, SLOTS_PER_RAIL, SUPPLY_RAIL_INDEX, type PlacedModule } from "./scheme";
import { terminalsFor, type TerminalDef } from "./terminals";

// Slot grid
export const SLOT_WIDTH_REM = 1.8;
export const SLOT_GAP_REM = 0.25;
export const SLOT_PITCH_REM = SLOT_WIDTH_REM + SLOT_GAP_REM;

// DIN module body
export const MODULE_HEIGHT_REM = 8.5;

// DIN rail section: room above modules for incoming wires, modules, room below for outgoing
export const RAIL_TOP_DANGLE_REM = 1.2;
export const RAIL_BOTTOM_DANGLE_REM = 1.2;
export const RAIL_HEIGHT_REM =
  RAIL_TOP_DANGLE_REM + MODULE_HEIGHT_REM + RAIL_BOTTOM_DANGLE_REM;

// Supply (built-in grid source) zone — sits at the top of the panel
export const SUPPLY_MODULE_HEIGHT_REM = 2.6;
export const SUPPLY_TOP_DANGLE_REM = 0.4;
export const SUPPLY_BOTTOM_DANGLE_REM = 1.2;
export const SUPPLY_HEIGHT_REM =
  SUPPLY_TOP_DANGLE_REM +
  SUPPLY_MODULE_HEIGHT_REM +
  SUPPLY_BOTTOM_DANGLE_REM;

// Load zone — sits at the bottom of the panel
export const LOAD_MODULE_HEIGHT_REM = 2.6;
export const LOAD_TOP_DANGLE_REM = 1.2;
export const LOAD_BOTTOM_DANGLE_REM = 0.4;
export const LOAD_HEIGHT_REM =
  LOAD_TOP_DANGLE_REM + LOAD_MODULE_HEIGHT_REM + LOAD_BOTTOM_DANGLE_REM;

// Bus zone between rails: three horizontal buses (L, N, PE) stacked
export const BUS_THICKNESS_REM = 0.55;
export const BUS_INNER_GAP_REM = 0.4;
export const BUS_ZONE_PAD_REM = 0.5;
export const BUS_ZONE_HEIGHT_REM =
  BUS_ZONE_PAD_REM * 2 + 3 * BUS_THICKNESS_REM + 2 * BUS_INNER_GAP_REM;

// Vertical stacking of sections inside the panel
export const SECTION_GAP_REM = 0.6;
export const SUPPLY_ZONE_Y_REM = 0;
export const RAIL_1_Y_REM = SUPPLY_HEIGHT_REM + SECTION_GAP_REM;
export const BUS_ZONE_Y_REM = RAIL_1_Y_REM + RAIL_HEIGHT_REM + SECTION_GAP_REM;
export const RAIL_2_Y_REM =
  BUS_ZONE_Y_REM + BUS_ZONE_HEIGHT_REM + SECTION_GAP_REM;
export const LOAD_ZONE_Y_REM =
  RAIL_2_Y_REM + RAIL_HEIGHT_REM + SECTION_GAP_REM;
export const LAYOUT_HEIGHT_REM = LOAD_ZONE_Y_REM + LOAD_HEIGHT_REM;

export const LAYOUT_WIDTH_REM = SLOTS_PER_RAIL * SLOT_PITCH_REM - SLOT_GAP_REM;

// Buses are aligned to slot columns: one tap per column
export const BUS_TAP_COUNT = SLOTS_PER_RAIL;
export const BUSES = ["L", "N", "PE"] as const;
export type BusName = (typeof BUSES)[number];

// Convert rem to css px (root = 16). Used inside SVG.
export const REM_TO_PX = 16;
export const remToPx = (r: number): number => r * REM_TO_PX;

// --- Geometry helpers ---

export const moduleX = (slot: number): number => slot * SLOT_PITCH_REM;

export const moduleWidthRem = (poles: 1 | 2): number =>
  poles === 2 ? 2 * SLOT_WIDTH_REM + SLOT_GAP_REM : SLOT_WIDTH_REM;

// Y of the top edge of the module body within the layout container
export function railModuleTopY(rail: number): number {
  switch (rail) {
    case SUPPLY_RAIL_INDEX:
      return SUPPLY_ZONE_Y_REM + SUPPLY_TOP_DANGLE_REM;
    case 1:
      return RAIL_1_Y_REM + RAIL_TOP_DANGLE_REM;
    case 2:
      return RAIL_2_Y_REM + RAIL_TOP_DANGLE_REM;
    case LOAD_RAIL_INDEX:
      return LOAD_ZONE_Y_REM + LOAD_TOP_DANGLE_REM;
    default:
      return 0;
  }
}

export function moduleHeightFor(m: PlacedModule): number {
  if (m.kind === "source") return SUPPLY_MODULE_HEIGHT_REM;
  if (m.kind === "load") return LOAD_MODULE_HEIGHT_REM;
  return MODULE_HEIGHT_REM;
}

// Push terminal dots slightly outside the module body so they sit in the
// dangling-wire area rather than on the module's cap.
export const TERMINAL_OFFSET_REM = 0.5;

interface Point {
  x: number;
  y: number;
}

export function terminalPosition(m: PlacedModule, t: TerminalDef): Point {
  const all = terminalsFor(m.kind);
  const sameSide = all.filter((x) => x.side === t.side);
  const indexOnSide = sameSide.findIndex((x) => x.id === t.id);
  const widthRem = moduleWidthRem(m.poles);
  const x = moduleX(m.slot) + (widthRem * (indexOnSide + 0.5)) / sameSide.length;
  const modTopY = railModuleTopY(m.rail);
  const modHeight = moduleHeightFor(m);
  const y =
    t.side === "top"
      ? modTopY - TERMINAL_OFFSET_REM
      : modTopY + modHeight + TERMINAL_OFFSET_REM;
  return { x, y };
}

export function busTapPosition(bus: BusName, tapIndex: number): Point {
  const idx = BUSES.indexOf(bus);
  const y =
    BUS_ZONE_Y_REM +
    BUS_ZONE_PAD_REM +
    idx * (BUS_THICKNESS_REM + BUS_INNER_GAP_REM) +
    BUS_THICKNESS_REM / 2;
  const x = tapIndex * SLOT_PITCH_REM + SLOT_WIDTH_REM / 2;
  return { x, y };
}

export function busY(bus: BusName): number {
  const idx = BUSES.indexOf(bus);
  return (
    BUS_ZONE_Y_REM +
    BUS_ZONE_PAD_REM +
    idx * (BUS_THICKNESS_REM + BUS_INNER_GAP_REM)
  );
}

// Manhattan polyline between two points: vertical out, horizontal across, vertical in.
export function manhattanPath(a: Point, b: Point): Point[] {
  const midY = (a.y + b.y) / 2;
  return [a, { x: a.x, y: midY }, { x: b.x, y: midY }, b];
}
