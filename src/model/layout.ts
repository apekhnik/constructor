// Geometry of the panel (supply + rails + buses + loads) in rem.
// Pure math, no DOM. UI and wire-overlay both derive positions from here
// so they stay aligned regardless of React render order.
//
// Constants that don't vary by panel mode live at module top; everything
// that scales with the small/large variant is computed in `getLayout(mode)`
// and threaded into the position helpers via a `Layout` argument.

import {
  LOAD_RAIL_INDEX,
  SUPPLY_RAIL_INDEX,
  type PanelMode,
  type PlacedModule,
} from "./scheme";
import { terminalsFor, type TerminalDef } from "./terminals";

// ---------------- Slot grid (DIN modules) ----------------

export const SLOT_WIDTH_REM = 1.8;
// Wider inter-module gap so vertical wires can run between module bodies
// instead of crossing them.
export const SLOT_GAP_REM = 0.6;
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
export const LOAD_COLUMN_WIDTH_REM = LOAD_MODULE_WIDTH_REM;

// ---------------- Bus zone shape (vertical room) ----------------

export const BUS_THICKNESS_REM = 0.55;
// Vertical room reserved for each bus strip — must include headroom for taps
// on whichever side(s) are used.
export const TOP_BUS_ZONE_HEIGHT_REM = 2.0;
export const PE_BUS_ZONE_HEIGHT_REM = 1.5;

// ---------------- Vertical section stack (small/large share top half) ----------------

export const SECTION_GAP_REM = 1.2;

// Source (СЕТЬ) sits at the very top so its bottom terminals feed straight
// DOWN into the L/N busses below it.
export const SUPPLY_ZONE_Y_REM = 0;
export const TOP_BUS_ZONE_Y_REM =
  SUPPLY_ZONE_Y_REM + SUPPLY_HEIGHT_REM + SECTION_GAP_REM;
export const RAIL_1_Y_REM =
  TOP_BUS_ZONE_Y_REM + TOP_BUS_ZONE_HEIGHT_REM + SECTION_GAP_REM;
export const RAIL_2_Y_REM = RAIL_1_Y_REM + RAIL_HEIGHT_REM + SECTION_GAP_REM;

// Panel is shifted right inside the layout so there is a clear vertical lane
// on the LEFT (used by L wires) that never touches any module body. The N
// and PE lanes live on the RIGHT, between the panel and the load column.
export const PANEL_LEFT_PAD_REM = 10.0;
export const PANEL_COLUMN_GAP_REM = 2.8;
const SIDE_LANE_MARGIN_REM = 0.7;
const TOP_BUS_SIDE_PAD_REM = 0.6;
// Room above the source between the two short top busses.
const TOP_BUS_CENTER_GAP_REM = 4.4;

// Push terminal dots slightly outside the module body so they sit in the
// dangling-wire area rather than on the module's cap.
export const TERMINAL_OFFSET_REM = 0.5;

// ---------------- Rem → px ----------------

export const REM_TO_PX = 16;
export const remToPx = (r: number): number => r * REM_TO_PX;

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
    return zoneY + (zoneH - BUS_THICKNESS_REM) / 2;
  }
  if (sides.includes("top")) {
    return zoneY + zoneH - BUS_THICKNESS_REM - 0.05;
  }
  return zoneY + 0.05;
}

// ---------------- Panel mode → layout snapshot ----------------

export interface Layout {
  mode: PanelMode;
  slotsPerRail: number;
  railCount: number;
  panelWidthRem: number;
  panelHeightRem: number;
  peBusZoneYRem: number;
  loadColumnXRem: number;
  loadColumnRows: number;
  loadColumnHeightRem: number;
  layoutWidthRem: number;
  layoutHeightRem: number;
  busGeometry: Record<BusName, BusGeometry>;
  safeYBands: number[];
  conductorChannelX: Record<"L" | "N" | "PE", number>;
  // X coordinates of the centres of inter-module gaps along the DIN rail,
  // including the gaps at the left of slot 0 and right of the last slot.
  // Used by the lane router to push vertical wire segments out of module
  // bodies and into the visible gaps.
  slotGapsX: number[];
}

export function slotsPerRailFor(mode: PanelMode): number {
  return mode === "small" ? 6 : 12;
}

export function railCountFor(mode: PanelMode): number {
  return mode === "small" ? 1 : 2;
}

export function loadColumnRowsFor(mode: PanelMode): number {
  return mode === "small" ? 6 : 12;
}

export function getLayout(mode: PanelMode): Layout {
  const slotsPerRail = slotsPerRailFor(mode);
  const railCount = railCountFor(mode);
  const panelWidthRem = slotsPerRail * SLOT_PITCH_REM - SLOT_GAP_REM;

  // Last rail's bottom Y — PE bus sits just below it.
  const lastRailY = railCount === 1 ? RAIL_1_Y_REM : RAIL_2_Y_REM;
  const peBusZoneYRem = lastRailY + RAIL_HEIGHT_REM + SECTION_GAP_REM;
  const panelHeightRem = peBusZoneYRem + PE_BUS_ZONE_HEIGHT_REM;

  // Load column to the right of the panel.
  const loadColumnXRem =
    PANEL_LEFT_PAD_REM + panelWidthRem + PANEL_COLUMN_GAP_REM;
  const loadColumnRows = loadColumnRowsFor(mode);
  const loadColumnHeightRem =
    LOAD_COLUMN_TOP_DANGLE_REM +
    loadColumnRows * LOAD_MODULE_HEIGHT_REM +
    Math.max(0, loadColumnRows - 1) * LOAD_ROW_GAP_REM +
    LOAD_COLUMN_BOTTOM_DANGLE_REM;

  const layoutWidthRem = loadColumnXRem + LOAD_COLUMN_WIDTH_REM;
  const layoutHeightRem = Math.max(panelHeightRem, loadColumnHeightRem);

  // Top L/N busses split with a central gap above the source.
  const topBusWidthRem =
    (panelWidthRem - 2 * TOP_BUS_SIDE_PAD_REM - TOP_BUS_CENTER_GAP_REM) / 2;

  // PE bus spans most of the panel width and gets one tap per slot.
  const peBusWidthRem = panelWidthRem - 2 * TOP_BUS_SIDE_PAD_REM;
  const peBusXRem = PANEL_LEFT_PAD_REM + TOP_BUS_SIDE_PAD_REM;

  // Tap counts derive from slot count: L/N have slotsPerRail/2 per side
  // (top + bottom = slotsPerRail total); PE is one-sided with slotsPerRail taps.
  const topBusTapsPerSide = Math.max(1, Math.floor(slotsPerRail / 2));
  const peBusTapsPerSide = slotsPerRail;

  const busGeometry: Record<BusName, BusGeometry> = {
    L: {
      x: PANEL_LEFT_PAD_REM + TOP_BUS_SIDE_PAD_REM,
      y: busYForZone(TOP_BUS_ZONE_Y_REM, TOP_BUS_ZONE_HEIGHT_REM, [
        "top",
        "bottom",
      ]),
      width: topBusWidthRem,
      thickness: BUS_THICKNESS_REM,
      tapsPerSide: topBusTapsPerSide,
      tapSides: ["top", "bottom"],
    },
    N: {
      x:
        PANEL_LEFT_PAD_REM +
        panelWidthRem -
        TOP_BUS_SIDE_PAD_REM -
        topBusWidthRem,
      y: busYForZone(TOP_BUS_ZONE_Y_REM, TOP_BUS_ZONE_HEIGHT_REM, [
        "top",
        "bottom",
      ]),
      width: topBusWidthRem,
      thickness: BUS_THICKNESS_REM,
      tapsPerSide: topBusTapsPerSide,
      tapSides: ["top", "bottom"],
    },
    PE: {
      x: peBusXRem,
      y: busYForZone(peBusZoneYRem, PE_BUS_ZONE_HEIGHT_REM, ["top"]),
      width: peBusWidthRem,
      thickness: BUS_THICKNESS_REM,
      tapsPerSide: peBusTapsPerSide,
      tapSides: ["top"],
    },
  };

  const safeYBands: number[] = [
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
  ];
  if (railCount >= 2) {
    // Between rail 1 module bodies and rail 2 module bodies — the BIG channel.
    safeYBands.push(
      (RAIL_1_Y_REM +
        RAIL_TOP_DANGLE_REM +
        MODULE_HEIGHT_REM +
        RAIL_2_Y_REM +
        RAIL_TOP_DANGLE_REM) /
        2,
    );
  }
  // Between last rail module bodies and PE bus zone.
  safeYBands.push(
    (lastRailY + RAIL_TOP_DANGLE_REM + MODULE_HEIGHT_REM + peBusZoneYRem) / 2,
  );

  // Preferred vertical-channel x by conductor. L runs down the empty lane to
  // the LEFT of the panel; N and PE share the right-side gap between the panel
  // and the load column, with PE pushed further out so the (warm) yellow-green
  // stripe doesn't visually merge into the (cool) blue N stripe right next to
  // it.
  // Inter-module gap centres along the rail. Edge gaps included.
  const slotGapsX: number[] = [];
  slotGapsX.push(PANEL_LEFT_PAD_REM - SLOT_GAP_REM / 2);
  for (let k = 1; k < slotsPerRail; k++) {
    slotGapsX.push(PANEL_LEFT_PAD_REM + k * SLOT_PITCH_REM - SLOT_GAP_REM / 2);
  }
  slotGapsX.push(
    PANEL_LEFT_PAD_REM + slotsPerRail * SLOT_PITCH_REM - SLOT_GAP_REM / 2,
  );

  const conductorChannelX: Record<"L" | "N" | "PE", number> = {
    L: PANEL_LEFT_PAD_REM - SIDE_LANE_MARGIN_REM,
    N: PANEL_LEFT_PAD_REM + panelWidthRem + SIDE_LANE_MARGIN_REM,
    PE: PANEL_LEFT_PAD_REM + panelWidthRem + SIDE_LANE_MARGIN_REM + 1.2,
  };

  return {
    mode,
    slotsPerRail,
    railCount,
    panelWidthRem,
    panelHeightRem,
    peBusZoneYRem,
    loadColumnXRem,
    loadColumnRows,
    loadColumnHeightRem,
    layoutWidthRem,
    layoutHeightRem,
    busGeometry,
    safeYBands,
    conductorChannelX,
    slotGapsX,
  };
}

// ---------------- Position helpers ----------------

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

export interface ModuleRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function moduleRect(m: PlacedModule, layout: Layout): ModuleRect {
  if (m.rail === LOAD_RAIL_INDEX) {
    return {
      x: layout.loadColumnXRem,
      y: LOAD_COLUMN_TOP_DANGLE_REM + m.slot * LOAD_ROW_PITCH_REM,
      width: LOAD_COLUMN_WIDTH_REM,
      height: LOAD_MODULE_HEIGHT_REM,
    };
  }
  if (m.rail === -1) {
    // Left column sources. slot 0 = generator, slot 1 = inverter
    const x = 1.0;
    const y = m.slot === 0 ? railModuleTopY(1) : railModuleTopY(2);
    const width = 7.5;
    const height = MODULE_HEIGHT_REM;
    return { x, y, width, height };
  }
  return {
    x: moduleX(m.slot),
    y: railModuleTopY(m.rail),
    width: moduleWidthRem(m.poles),
    height: moduleHeightFor(m),
  };
}

export function terminalPosition(
  m: PlacedModule,
  t: TerminalDef,
  layout: Layout,
): Point {
  const all = terminalsFor(m.kind);
  const sameSide = all.filter((x) => x.side === t.side);
  const indexOnSide = sameSide.findIndex((x) => x.id === t.id);
  const rect = moduleRect(m, layout);
  const x = rect.x + (rect.width * (indexOnSide + 0.5)) / sameSide.length;
  const y =
    t.side === "top"
      ? rect.y - TERMINAL_OFFSET_REM
      : rect.y + rect.height + TERMINAL_OFFSET_REM;
  return { x, y };
}

export function busTapCount(bus: BusName, layout: Layout): number {
  const g = layout.busGeometry[bus];
  return g.tapsPerSide * g.tapSides.length;
}

// Position of a bus tap. Taps are laid out per-side along the bar. The first
// `tapsPerSide` indices live on `tapSides[0]`, the next `tapsPerSide` on
// `tapSides[1]`, etc. — so each side has its own column of dots above or below
// the bar.
export function busTapPosition(
  bus: BusName,
  tapIndex: number,
  layout: Layout,
): Point {
  const g = layout.busGeometry[bus];
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

// ---------------- Lane-based routing (per-wire Y-track) ----------------

// Vertical spacing between adjacent wires in the same safe band. Picked so that
// 5–6 wires fit comfortably inside the smallest safeYBand.
export const LANE_STEP_REM = 0.4;

// Minimum vertical distance between a terminal and the nearest lane Y. The
// lane router clamps `laneY` so each side has at least this much "lift" out
// of the screw cap — otherwise the horizontal segment would visually sit on
// the terminal dot.
export const LANE_LIFT_REM = 0.5;

// Pick the gap-centre X closest to `x` from the precomputed list.
export function nearestGapX(x: number, slotGapsX: number[]): number {
  if (slotGapsX.length === 0) return x;
  let best = slotGapsX[0];
  let bestDist = Math.abs(best - x);
  for (let i = 1; i < slotGapsX.length; i++) {
    const d = Math.abs(slotGapsX[i] - x);
    if (d < bestDist) {
      best = slotGapsX[i];
      bestDist = d;
    }
  }
  return best;
}

// Pick the safeYBand best suited to carry the horizontal segment of (a, b):
// prefer one that lies strictly between the two endpoints (so the path is
// monotonic vertically), otherwise fall back to the band closest to the
// natural midpoint.
export function pickZoneIndex(a: Point, b: Point, layout: Layout): number {
  const bands = layout.safeYBands;
  if (bands.length === 0) return -1;
  const yMin = Math.min(a.y, b.y);
  const yMax = Math.max(a.y, b.y);
  const natural = (yMin + yMax) / 2;
  let bestIdx = 0;
  let bestDist = Math.abs(bands[0] - natural);
  let bestInside = bands[0] > yMin && bands[0] < yMax;
  for (let i = 1; i < bands.length; i++) {
    const y = bands[i];
    const inside = y > yMin && y < yMax;
    const dist = Math.abs(y - natural);
    if (inside && !bestInside) {
      bestIdx = i;
      bestDist = dist;
      bestInside = true;
      continue;
    }
    if (inside === bestInside && dist < bestDist) {
      bestIdx = i;
      bestDist = dist;
    }
  }
  return bestIdx;
}

// Conductor-specific bias inside a shared safe band, in REM (not as a fraction
// of halfRange — fractional bias scales with the band's free room and could
// push L wires onto neighbouring rows of terminal dots). A small fixed offset
// keeps the L stripe ~2-3 px above the N stripe regardless of band size.
const CONDUCTOR_LANE_BIAS_REM: Record<"L" | "N" | "PE", number> = {
  L: -0.15,
  N: 0.15,
  PE: 0.3,
};

// Lane-based Manhattan path: vertical out of each terminal straight to `laneY`,
// horizontal across at `laneY`, vertical into the other terminal. `laneY` is
// kept strictly between the two endpoints (with a LIFT margin so the vertical
// stub from each terminal is always visible) and the per-lane step shrinks if
// the natural spread won't fit in the available safe span. The caller must
// only request lane routing when the safe span doesn't intersect any module
// body (see `laneIsSafe` in the UI layer) — otherwise the horizontal middle
// leg would run through a module body.
export function routedPath(
  a: Point,
  b: Point,
  rank: number,
  size: number,
  zoneIdx: number,
  layout: Layout,
  conductor?: "L" | "N" | "PE",
): Point[] {
  void zoneIdx;
  void layout;
  const midRank = (size - 1) / 2;

  const yMin = Math.min(a.y, b.y);
  const yMax = Math.max(a.y, b.y);
  const safeLo = yMin + LANE_LIFT_REM;
  const safeHi = yMax - LANE_LIFT_REM;
  let laneCentre: number;
  let halfRange: number;
  if (safeHi <= safeLo) {
    laneCentre = (yMin + yMax) / 2;
    halfRange = 0;
  } else {
    laneCentre = (safeLo + safeHi) / 2;
    halfRange = (safeHi - safeLo) / 2;
  }
  // Clamp bias to the safe half-range so a small band (e.g. between the last
  // rail and PE bus) doesn't push the lane outside the safe gutter and onto
  // a row of terminal dots.
  const biasRaw = conductor ? CONDUCTOR_LANE_BIAS_REM[conductor] : 0;
  const biasLimit = Math.max(0, halfRange - LANE_STEP_REM * 0.25);
  const bias = Math.max(-biasLimit, Math.min(biasLimit, biasRaw));
  const subCentre = laneCentre + bias;
  // Tight intra-conductor step so L wires never wander into the N sub-band.
  const subHalf = Math.max(0, halfRange - Math.abs(bias));
  const naturalHalf = midRank * LANE_STEP_REM;
  const step =
    midRank === 0 || naturalHalf <= subHalf
      ? LANE_STEP_REM
      : subHalf / midRank;
  const laneY = subCentre + (rank - midRank) * step;

  return [a, { x: a.x, y: laneY }, { x: b.x, y: laneY }, b];
}

// ---------------- Manhattan wire routing ----------------

// Pick the best horizontal Y for the middle segment of a Manhattan path.
// Prefer a safe gutter that lies BETWEEN the two endpoints (so the path is
// monotonic), falling back to the nearest gutter if none qualify, and finally
// to the geometric midpoint.
function chooseSafeMidY(a: Point, b: Point, bands: number[]): number {
  const yMin = Math.min(a.y, b.y);
  const yMax = Math.max(a.y, b.y);
  const natural = (yMin + yMax) / 2;
  const inside = bands.filter((y) => y > yMin && y < yMax);
  if (inside.length > 0) {
    return inside.reduce((best, y) =>
      Math.abs(y - natural) < Math.abs(best - natural) ? y : best,
    );
  }
  if (bands.length > 0) {
    return bands.reduce((best, y) =>
      Math.abs(y - natural) < Math.abs(best - natural) ? y : best,
    );
  }
  return natural;
}

// Treat a vertical column at `x` as colliding with rect `r` if `x` lies
// strictly inside the rect's horizontal span AND the leg's y range overlaps
// the rect's y span.
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

function findClearColumn(
  preferred: number,
  yMin: number,
  yMax: number,
  obs: ModuleRect[],
  limit: number,
): number {
  if (columnClear(preferred, yMin, yMax, obs)) return preferred;
  const step = SLOT_GAP_REM / 2;
  for (let d = step; d <= limit; d += step) {
    for (const sign of [1, -1]) {
      const x = preferred + sign * d;
      if (x < 0 || x > limit) continue;
      if (columnClear(x, yMin, yMax, obs)) return x;
    }
  }
  return preferred;
}

// Pick the safeYBand nearest to `y` — independently of any other endpoint.
// Used to anchor each manhattan-path exit on the side of its terminal so the
// short vertical stub doesn't have to cut across a module body to reach it.
function bandClosestTo(y: number, bands: number[]): number {
  return bands.reduce((best, b) =>
    Math.abs(b - y) < Math.abs(best - y) ? b : best,
  );
}

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
  layout?: Layout,
  preferredColumnX?: number,
  forcePreferredColumn = false,
  // Per-wire vertical offset added to the chosen horizontal Y (and exit Ys).
  // Used by the caller to spread otherwise-identical fallback paths into
  // parallel lanes so they don't render on top of each other.
  midYOffset = 0,
): Point[] {
  const bands = layout?.safeYBands ?? [];
  const widthLimit = layout?.layoutWidthRem ?? Math.max(a.x, b.x) * 2;
  const midY = chooseSafeMidY(a, b, bands) + midYOffset;
  if (obstacles.length === 0 && !forcePreferredColumn) {
    return [a, { x: a.x, y: midY }, { x: b.x, y: midY }, b];
  }
  const aYmin = Math.min(a.y, midY);
  const aYmax = Math.max(a.y, midY);
  const bYmin = Math.min(b.y, midY);
  const bYmax = Math.max(b.y, midY);
  if (
    !forcePreferredColumn &&
    columnClear(a.x, aYmin, aYmax, obstacles) &&
    columnClear(b.x, bYmin, bYmax, obstacles)
  ) {
    return [a, { x: a.x, y: midY }, { x: b.x, y: midY }, b];
  }
  const exitYa = bandClosestTo(a.y, bands) + midYOffset;
  const exitYb = bandClosestTo(b.y, bands) + midYOffset;
  const colYMin = Math.min(exitYa, exitYb);
  const colYMax = Math.max(exitYa, exitYb);
  const preferred =
    preferredColumnX !== undefined ? preferredColumnX : (a.x + b.x) / 2;
  const cx = findClearColumn(preferred, colYMin, colYMax, obstacles, widthLimit);
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
