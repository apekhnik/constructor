// Geometry of the panel (supply + rails + buses + loads) in rem.
// Pure math, no DOM. UI and wire-overlay both derive positions from here
// so they stay aligned regardless of React render order.

import { LOAD_RAIL_INDEX, SLOTS_PER_RAIL, SUPPLY_RAIL_INDEX, type PlacedModule } from "./scheme";
import { terminalsFor, type TerminalDef } from "./terminals";

// ---------------- Slot grid (DIN modules) ----------------

export const SLOT_WIDTH_REM = 1.8;
export const SLOT_GAP_REM = 0.25;
export const SLOT_PITCH_REM = SLOT_WIDTH_REM + SLOT_GAP_REM;

// ---------------- DIN rail section ----------------

export const MODULE_HEIGHT_REM = 8.5;
export const RAIL_TOP_DANGLE_REM = 1.2;
export const RAIL_BOTTOM_DANGLE_REM = 1.2;
export const RAIL_HEIGHT_REM =
  RAIL_TOP_DANGLE_REM + MODULE_HEIGHT_REM + RAIL_BOTTOM_DANGLE_REM;

// ---------------- Supply (built-in grid source) zone ----------------

export const SUPPLY_MODULE_HEIGHT_REM = 2.6;
export const SUPPLY_TOP_DANGLE_REM = 0.4;
export const SUPPLY_BOTTOM_DANGLE_REM = 1.2;
export const SUPPLY_HEIGHT_REM =
  SUPPLY_TOP_DANGLE_REM +
  SUPPLY_MODULE_HEIGHT_REM +
  SUPPLY_BOTTOM_DANGLE_REM;

// ---------------- Load module (rendered in vertical column) ----------------

export const LOAD_MODULE_HEIGHT_REM = 2.6;
// Each load occupies 2 horizontal "slot widths" (poles=2) but stacked vertically.
export const LOAD_MODULE_WIDTH_REM = 2 * SLOT_WIDTH_REM + SLOT_GAP_REM;
// Vertical gap between adjacent loads in the column.
export const LOAD_ROW_GAP_REM = 0.55;
export const LOAD_ROW_PITCH_REM = LOAD_MODULE_HEIGHT_REM + LOAD_ROW_GAP_REM;
// Reserve a top dangle so wires from the panel can reach the top of the column.
export const LOAD_COLUMN_TOP_DANGLE_REM = 1.2;
export const LOAD_COLUMN_BOTTOM_DANGLE_REM = 0.4;

// ---------------- Bus zones (split: L top-left, N top-right, PE bottom) ----------------

export const BUS_THICKNESS_REM = 0.55;
// Taps per SIDE. L/N have taps on top (toward source) and bottom (toward rails)
// = 12 dots each. PE has taps only on top (toward rails/loads) = 6 dots.
export const TOP_BUS_TAPS_PER_SIDE = 6;
export const PE_BUS_TAPS_PER_SIDE = 6;
// Vertical room reserved for each bus strip — must include headroom for taps
// on whichever side(s) are used.
export const TOP_BUS_ZONE_HEIGHT_REM = 2.0;
export const PE_BUS_ZONE_HEIGHT_REM = 1.5;

// Panel width = 12 slots wide.
export const PANEL_WIDTH_REM = SLOTS_PER_RAIL * SLOT_PITCH_REM - SLOT_GAP_REM;

// Panel is shifted right inside the layout so there is a clear vertical lane
// on the LEFT (used by L wires) that never touches any module body. The N
// and PE lanes live on the RIGHT, between the panel and the load column.
export const PANEL_LEFT_PAD_REM = 1.5;

// Horizontal layout of the top busses (L on left, N on right of the supply).
const TOP_BUS_SIDE_PAD_REM = 0.6;
const TOP_BUS_CENTER_GAP_REM = 4.4; // room above the source between the two short busses
const TOP_BUS_WIDTH_REM =
  (PANEL_WIDTH_REM - 2 * TOP_BUS_SIDE_PAD_REM - TOP_BUS_CENTER_GAP_REM) / 2;

// PE bus — short, centered along the bottom edge of the panel.
const PE_BUS_WIDTH_REM = 12;
const PE_BUS_X_REM =
  PANEL_LEFT_PAD_REM + (PANEL_WIDTH_REM - PE_BUS_WIDTH_REM) / 2;

// ---------------- Vertical section stack ----------------

export const SECTION_GAP_REM = 0.6;

// Source (СЕТЬ) sits at the very top so its bottom terminals feed straight
// DOWN into the L/N busses below it.
export const SUPPLY_ZONE_Y_REM = 0;
export const TOP_BUS_ZONE_Y_REM =
  SUPPLY_ZONE_Y_REM + SUPPLY_HEIGHT_REM + SECTION_GAP_REM;
export const RAIL_1_Y_REM =
  TOP_BUS_ZONE_Y_REM + TOP_BUS_ZONE_HEIGHT_REM + SECTION_GAP_REM;
export const RAIL_2_Y_REM = RAIL_1_Y_REM + RAIL_HEIGHT_REM + SECTION_GAP_REM;
export const PE_BUS_ZONE_Y_REM =
  RAIL_2_Y_REM + RAIL_HEIGHT_REM + SECTION_GAP_REM;
export const PANEL_HEIGHT_REM =
  PE_BUS_ZONE_Y_REM + PE_BUS_ZONE_HEIGHT_REM;

// ---------------- Load column (outside the panel, on the right) ----------------

// Right gap holds two dedicated wire lanes (N and PE) plus visual breathing
// room. ~2.8rem is enough for two lanes 1.2rem apart with margin off both
// the panel edge and the load column.
export const PANEL_COLUMN_GAP_REM = 2.8;
export const LOAD_COLUMN_X_REM =
  PANEL_LEFT_PAD_REM + PANEL_WIDTH_REM + PANEL_COLUMN_GAP_REM;
export const LOAD_COLUMN_WIDTH_REM = LOAD_MODULE_WIDTH_REM;
// Use the same slot count as before; now interpreted as vertical positions.
export const LOAD_COLUMN_ROWS = 12;
export const LOAD_COLUMN_HEIGHT_REM =
  LOAD_COLUMN_TOP_DANGLE_REM +
  LOAD_COLUMN_ROWS * LOAD_MODULE_HEIGHT_REM +
  (LOAD_COLUMN_ROWS - 1) * LOAD_ROW_GAP_REM +
  LOAD_COLUMN_BOTTOM_DANGLE_REM;

// ---------------- Total layout bounding box ----------------

export const LAYOUT_HEIGHT_REM = Math.max(PANEL_HEIGHT_REM, LOAD_COLUMN_HEIGHT_REM);
export const LAYOUT_WIDTH_REM = LOAD_COLUMN_X_REM + LOAD_COLUMN_WIDTH_REM;

// ---------------- Bus geometry (per-bus) ----------------

export const BUSES = ["L", "N", "PE"] as const;
export type BusName = (typeof BUSES)[number];

export type BusTapSide = "top" | "bottom";

export interface BusGeometry {
  x: number;          // rem — left edge of the bar
  y: number;          // rem — top edge of the bar
  width: number;      // rem
  thickness: number;  // rem
  // Taps placed on each enabled side. Total tap dots = tapsPerSide * tapSides.length.
  tapsPerSide: number;
  tapSides: BusTapSide[];
}

// Centre the bus inside its zone vertically, leaving room for taps on the
// enabled sides. For one-sided taps we offset toward the side that has no taps
// so the tap headroom is maximised on the active side.
function busYForZone(
  zoneY: number,
  zoneH: number,
  sides: BusTapSide[],
): number {
  if (sides.includes("top") && sides.includes("bottom")) {
    // dual-side: centre.
    return zoneY + (zoneH - BUS_THICKNESS_REM) / 2;
  }
  if (sides.includes("top")) {
    // taps above → bus near bottom of zone.
    return zoneY + zoneH - BUS_THICKNESS_REM - 0.05;
  }
  // taps below → bus near top of zone.
  return zoneY + 0.05;
}

export const BUS_GEOMETRY: Record<BusName, BusGeometry> = {
  L: {
    x: PANEL_LEFT_PAD_REM + TOP_BUS_SIDE_PAD_REM,
    y: busYForZone(TOP_BUS_ZONE_Y_REM, TOP_BUS_ZONE_HEIGHT_REM, ["top", "bottom"]),
    width: TOP_BUS_WIDTH_REM,
    thickness: BUS_THICKNESS_REM,
    tapsPerSide: TOP_BUS_TAPS_PER_SIDE,
    tapSides: ["top", "bottom"],
  },
  N: {
    x:
      PANEL_LEFT_PAD_REM +
      PANEL_WIDTH_REM -
      TOP_BUS_SIDE_PAD_REM -
      TOP_BUS_WIDTH_REM,
    y: busYForZone(TOP_BUS_ZONE_Y_REM, TOP_BUS_ZONE_HEIGHT_REM, ["top", "bottom"]),
    width: TOP_BUS_WIDTH_REM,
    thickness: BUS_THICKNESS_REM,
    tapsPerSide: TOP_BUS_TAPS_PER_SIDE,
    tapSides: ["top", "bottom"],
  },
  PE: {
    x: PE_BUS_X_REM,
    y: busYForZone(PE_BUS_ZONE_Y_REM, PE_BUS_ZONE_HEIGHT_REM, ["top"]),
    width: PE_BUS_WIDTH_REM,
    thickness: BUS_THICKNESS_REM,
    tapsPerSide: PE_BUS_TAPS_PER_SIDE,
    tapSides: ["top"],
  },
};

export const busGeometry = (b: BusName): BusGeometry => BUS_GEOMETRY[b];
export const busTapCount = (b: BusName): number => {
  const g = BUS_GEOMETRY[b];
  return g.tapsPerSide * g.tapSides.length;
};
export const busY = (b: BusName): number => BUS_GEOMETRY[b].y;

// ---------------- Rem → px ----------------

export const REM_TO_PX = 16;
export const remToPx = (r: number): number => r * REM_TO_PX;

// ---------------- Geometry helpers ----------------

interface Point {
  x: number;
  y: number;
}

export const moduleX = (slot: number): number =>
  PANEL_LEFT_PAD_REM + slot * SLOT_PITCH_REM;

export const moduleWidthRem = (poles: 1 | 2): number =>
  poles === 2 ? 2 * SLOT_WIDTH_REM + SLOT_GAP_REM : SLOT_WIDTH_REM;

// Y of the top edge of a rail module body within the layout container.
export function railModuleTopY(rail: number): number {
  switch (rail) {
    case SUPPLY_RAIL_INDEX:
      return SUPPLY_ZONE_Y_REM + SUPPLY_TOP_DANGLE_REM;
    case 1:
      return RAIL_1_Y_REM + RAIL_TOP_DANGLE_REM;
    case 2:
      return RAIL_2_Y_REM + RAIL_TOP_DANGLE_REM;
    default:
      return 0;
  }
}

export function moduleHeightFor(m: PlacedModule): number {
  if (m.kind === "source") return SUPPLY_MODULE_HEIGHT_REM;
  if (m.kind === "load") return LOAD_MODULE_HEIGHT_REM;
  return MODULE_HEIGHT_REM;
}

// Position/size of a module's body within the overall layout.
// Loads live in a separate vertical column to the right of the panel.
export interface ModuleRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function moduleRect(m: PlacedModule): ModuleRect {
  if (m.rail === LOAD_RAIL_INDEX) {
    return {
      x: LOAD_COLUMN_X_REM,
      y:
        LOAD_COLUMN_TOP_DANGLE_REM +
        m.slot * LOAD_ROW_PITCH_REM,
      width: LOAD_COLUMN_WIDTH_REM,
      height: LOAD_MODULE_HEIGHT_REM,
    };
  }
  return {
    x: moduleX(m.slot),
    y: railModuleTopY(m.rail),
    width: moduleWidthRem(m.poles),
    height: moduleHeightFor(m),
  };
}

// Push terminal dots slightly outside the module body so they sit in the
// dangling-wire area rather than on the module's cap.
export const TERMINAL_OFFSET_REM = 0.5;

export function terminalPosition(m: PlacedModule, t: TerminalDef): Point {
  const all = terminalsFor(m.kind);
  const sameSide = all.filter((x) => x.side === t.side);
  const indexOnSide = sameSide.findIndex((x) => x.id === t.id);
  const rect = moduleRect(m);
  // For loads in the vertical column we keep the same convention (top side
  // terminals on top edge of the box), so wires arrive from above.
  const x = rect.x + (rect.width * (indexOnSide + 0.5)) / sameSide.length;
  const y =
    t.side === "top"
      ? rect.y - TERMINAL_OFFSET_REM
      : rect.y + rect.height + TERMINAL_OFFSET_REM;
  return { x, y };
}

// Position of a bus tap. Taps are laid out per-side along the bar. The first
// `tapsPerSide` indices live on `tapSides[0]`, the next `tapsPerSide` on
// `tapSides[1]`, etc. — so each side has its own column of dots above or below
// the bar.
export function busTapPosition(bus: BusName, tapIndex: number): Point {
  const g = BUS_GEOMETRY[bus];
  const sideIdx = Math.floor(tapIndex / g.tapsPerSide);
  const localIdx = tapIndex % g.tapsPerSide;
  const side = g.tapSides[sideIdx] ?? g.tapSides[0];
  const x = g.x + (g.width * (localIdx + 0.5)) / g.tapsPerSide;
  const y =
    side === "top"
      ? g.y - TERMINAL_OFFSET_REM
      : g.y + g.thickness + TERMINAL_OFFSET_REM;
  return { x, y };
}

// "Safe" horizontal Y bands — vertical ranges with no module bodies. Wires
// route their horizontal segment in one of these bands so they never cut
// straight across a breaker / relay / load body.
//
// Each entry is the centre of a gutter. Order matters only for readability;
// `chooseSafeMidY` picks by distance, not by order.
const SAFE_Y_BANDS: number[] = [
  // Between source bottom and top-bus zone.
  (SUPPLY_ZONE_Y_REM +
    SUPPLY_TOP_DANGLE_REM +
    SUPPLY_MODULE_HEIGHT_REM +
    TOP_BUS_ZONE_Y_REM) /
    2,
  // Between top-bus zone and rail 1 module bodies.
  (TOP_BUS_ZONE_Y_REM +
    TOP_BUS_ZONE_HEIGHT_REM +
    RAIL_1_Y_REM +
    RAIL_TOP_DANGLE_REM) /
    2,
  // Between rail 1 module bodies and rail 2 module bodies — the BIG channel.
  (RAIL_1_Y_REM +
    RAIL_TOP_DANGLE_REM +
    MODULE_HEIGHT_REM +
    RAIL_2_Y_REM +
    RAIL_TOP_DANGLE_REM) /
    2,
  // Between rail 2 module bodies and PE bus zone.
  (RAIL_2_Y_REM +
    RAIL_TOP_DANGLE_REM +
    MODULE_HEIGHT_REM +
    PE_BUS_ZONE_Y_REM) /
    2,
];

// Pick the best horizontal Y for the middle segment of a Manhattan path.
// Prefer a safe gutter that lies BETWEEN the two endpoints (so the path is
// monotonic), falling back to the nearest gutter if none qualify, and finally
// to the geometric midpoint.
function chooseSafeMidY(a: Point, b: Point): number {
  const yMin = Math.min(a.y, b.y);
  const yMax = Math.max(a.y, b.y);
  const natural = (yMin + yMax) / 2;
  const inside = SAFE_Y_BANDS.filter((y) => y > yMin && y < yMax);
  if (inside.length > 0) {
    return inside.reduce((best, y) =>
      Math.abs(y - natural) < Math.abs(best - natural) ? y : best,
    );
  }
  if (SAFE_Y_BANDS.length > 0) {
    return SAFE_Y_BANDS.reduce((best, y) =>
      Math.abs(y - natural) < Math.abs(best - natural) ? y : best,
    );
  }
  return natural;
}

// Treat a vertical column at `x` as colliding with rect `r` if `x` lies
// strictly inside the rect's horizontal span AND the leg's y range overlaps
// the rect's y span. A small epsilon lets terminals that sit right at the
// rect edge pass through cleanly.
const COLLISION_EPS_REM = 0.05;

function columnHitsRect(
  x: number,
  yMin: number,
  yMax: number,
  r: ModuleRect,
): boolean {
  if (x <= r.x + COLLISION_EPS_REM || x >= r.x + r.width - COLLISION_EPS_REM)
    return false;
  if (yMax <= r.y + COLLISION_EPS_REM || yMin >= r.y + r.height - COLLISION_EPS_REM)
    return false;
  return true;
}

function columnClear(
  x: number,
  yMin: number,
  yMax: number,
  obs: ModuleRect[],
): boolean {
  for (const r of obs) if (columnHitsRect(x, yMin, yMax, r)) return false;
  return true;
}

// Search outward from `preferred` x for a column that is clear of all
// obstacles in the y range. Step is half a slot gap so we hit the inter-slot
// gaps reliably.
function findClearColumn(
  preferred: number,
  yMin: number,
  yMax: number,
  obs: ModuleRect[],
): number {
  if (columnClear(preferred, yMin, yMax, obs)) return preferred;
  const step = SLOT_GAP_REM / 2;
  const limit = LAYOUT_WIDTH_REM;
  for (let d = step; d <= limit; d += step) {
    for (const sign of [1, -1]) {
      const x = preferred + sign * d;
      if (x < 0 || x > LAYOUT_WIDTH_REM) continue;
      if (columnClear(x, yMin, yMax, obs)) return x;
    }
  }
  return preferred;
}

// Pick the safe band between `y` and `towardY`, preferring the one closest to
// `y` so the perpendicular exit leg from the endpoint is short.
function bandClosestBetween(y: number, towardY: number): number {
  const yMin = Math.min(y, towardY);
  const yMax = Math.max(y, towardY);
  const between = SAFE_Y_BANDS.filter((b) => b > yMin && b < yMax);
  const pool = between.length > 0 ? between : SAFE_Y_BANDS;
  return pool.reduce((best, b) =>
    Math.abs(b - y) < Math.abs(best - y) ? b : best,
  );
}

// Preferred vertical-channel x by conductor. L runs down the empty lane to
// the LEFT of the panel; N and PE share the right-side gap between the panel
// and the load column, with PE pushed further out so the (warm) yellow-green
// stripe doesn't visually merge into the (cool) blue N stripe right next to
// it. Distances are picked so each lane keeps ≥0.7rem clearance to module
// bodies on either side.
const SIDE_LANE_MARGIN_REM = 0.7;
export const CONDUCTOR_CHANNEL_X: Record<"L" | "N" | "PE", number> = {
  L: PANEL_LEFT_PAD_REM - SIDE_LANE_MARGIN_REM,
  N: PANEL_LEFT_PAD_REM + PANEL_WIDTH_REM + SIDE_LANE_MARGIN_REM,
  PE: PANEL_LEFT_PAD_REM + PANEL_WIDTH_REM + SIDE_LANE_MARGIN_REM + 1.2,
};

// Manhattan polyline. Default behaviour (no obstacles supplied) is the simple
// V-H-V via a safe gutter. With obstacles, if either vertical leg of that
// short path would cut through a module body, we re-route via a 5-segment
// path: short vertical out to a safe band, horizontal to a clear column,
// long vertical down to the band near the other endpoint, horizontal, short
// vertical in. `preferredColumnX` is where the long vertical leg likes to
// live — callers pass the conductor's reserved channel so all wires of the
// same conductor share one stripe.
export function manhattanPath(
  a: Point,
  b: Point,
  obstacles: ModuleRect[] = [],
  preferredColumnX?: number,
): Point[] {
  const midY = chooseSafeMidY(a, b);
  if (obstacles.length === 0) {
    return [a, { x: a.x, y: midY }, { x: b.x, y: midY }, b];
  }
  const aYmin = Math.min(a.y, midY);
  const aYmax = Math.max(a.y, midY);
  const bYmin = Math.min(b.y, midY);
  const bYmax = Math.max(b.y, midY);
  if (
    columnClear(a.x, aYmin, aYmax, obstacles) &&
    columnClear(b.x, bYmin, bYmax, obstacles)
  ) {
    return [a, { x: a.x, y: midY }, { x: b.x, y: midY }, b];
  }
  const exitYa = bandClosestBetween(a.y, midY);
  const exitYb = bandClosestBetween(b.y, midY);
  const colYMin = Math.min(exitYa, exitYb);
  const colYMax = Math.max(exitYa, exitYb);
  const preferred =
    preferredColumnX !== undefined ? preferredColumnX : (a.x + b.x) / 2;
  const cx = findClearColumn(preferred, colYMin, colYMax, obstacles);
  if (Math.abs(exitYa - exitYb) < 0.01) {
    return [
      a,
      { x: a.x, y: exitYa },
      { x: cx, y: exitYa },
      { x: b.x, y: exitYa },
      b,
    ];
  }
  return [
    a,
    { x: a.x, y: exitYa },
    { x: cx, y: exitYa },
    { x: cx, y: exitYb },
    { x: b.x, y: exitYb },
    b,
  ];
}
