// Pure layer between our Scheme/Layout and JointJS. Produces a list of
// descriptors that the router file converts into joint.dia.Cell instances.
// Keeping this step pure means we can unit-test the mapping with vitest
// without touching JointJS / DOM.
//
// Spike scope (CLAUDE.md §5, "JointJS spike"): only wires with `routed_v2`
// go through here; everything else keeps its current renderer.

import {
  busTapCount,
  busTapPosition,
  BUSES,
  moduleRect,
  REM_TO_PX,
  terminalPosition,
  type BusName,
  type Layout,
} from "../../model/layout";
import {
  type Endpoint,
  type PlacedModule,
  type Scheme,
  type Wire,
} from "../../model/scheme";
import { terminalsFor } from "../../model/terminals";

const rem = (r: number): number => r * REM_TO_PX;

export interface MirrorPort {
  id: string;     // matches our endpoint key
  // Relative to the element's top-left, in px.
  x: number;
  y: number;
  // 'top' = north side of element, 'bottom' = south. Used to bias the
  // manhattan router's start/endDirections so wires leave a terminal
  // vertically (the way real DIN modules are wired).
  side: "top" | "bottom";
}

export interface MirrorElement {
  id: string;
  // Absolute position of the element's top-left, in px.
  x: number;
  y: number;
  width: number;
  height: number;
  ports: MirrorPort[];
  // 'module' = real DIN obstacle the router should go around.
  // 'bus-body' = the bar itself — a wide thin obstacle the router must go
  // around so wires don't visually cross the bar.
  // 'bus-tap' = ghost zero-size element holding a tap port. We mark it so
  // the router can exclude it via `excludeTypes`.
  role: "module" | "bus-body" | "bus-tap";
}

export interface MirrorLink {
  id: string;       // wire id
  conductor: "L" | "N" | "PE";
  source: { elementId: string; portId: string; side: "top" | "bottom" };
  target: { elementId: string; portId: string; side: "top" | "bottom" };
}

export interface MirrorDescriptor {
  elements: MirrorElement[];
  links: MirrorLink[];
  // Logical bounds (px) — used to size the off-DOM Paper.
  width: number;
  height: number;
}

// Element id per bus tap — a synthetic name so JointJS sees each tap as its
// own zero-size element.
function busTapElementId(bus: BusName, tapIndex: number): string {
  return `bus_${bus}_${tapIndex}`;
}

function endpointToRef(
  ep: Endpoint,
): { elementId: string; portId: string } {
  if (ep.kind === "bus") {
    const elementId = busTapElementId(ep.bus, ep.tapIndex);
    return { elementId, portId: "tap" };
  }
  return { elementId: ep.moduleId, portId: ep.terminalId };
}

function moduleElement(m: PlacedModule, layout: Layout): MirrorElement {
  const rect = moduleRect(m, layout);
  const ports: MirrorPort[] = terminalsFor(m.kind).map((t) => {
    const tp = terminalPosition(m, t, layout);
    return {
      id: t.id,
      x: rem(tp.x - rect.x),
      y: rem(tp.y - rect.y),
      side: t.side,
    };
  });
  return {
    id: m.id,
    x: rem(rect.x),
    y: rem(rect.y),
    width: rem(rect.width),
    height: rem(rect.height),
    ports,
    role: "module",
  };
}

function busBodyElement(bus: BusName, layout: Layout): MirrorElement {
  const g = layout.busGeometry[bus];
  return {
    id: `bus_${bus}_body`,
    x: rem(g.x),
    y: rem(g.y),
    width: rem(g.width),
    height: rem(g.thickness),
    ports: [],
    role: "bus-body",
  };
}

function busTapElement(
  bus: BusName,
  tapIndex: number,
  layout: Layout,
): MirrorElement {
  const p = busTapPosition(bus, tapIndex, layout);
  // Side here is purely a direction hint for the router: top-tapped taps
  // make wires depart upward from the bar; bottom-tapped make them depart
  // downward. We figure that out from the geometry: tap above the bar y →
  // 'top', tap below → 'bottom'.
  const g = layout.busGeometry[bus];
  const side: "top" | "bottom" = p.y < g.y ? "top" : "bottom";
  return {
    id: busTapElementId(bus, tapIndex),
    x: rem(p.x) - 0.5,
    y: rem(p.y) - 0.5,
    width: 1,
    height: 1,
    ports: [{ id: "tap", x: 0.5, y: 0.5, side }],
    role: "bus-tap",
  };
}

function isVisibleModule(
  m: PlacedModule,
  visibility: Scheme["visibility"],
): boolean {
  if (m.id === "fixture_generator" && !visibility.generator) return false;
  if (m.id === "fixture_inverter" && !visibility.inverter) return false;
  return true;
}

function isVisibleBus(bus: BusName, visibility: Scheme["visibility"]): boolean {
  if (bus === "L") return visibility.busL;
  if (bus === "PE") return visibility.busPE;
  return true; // N always visible
}

export function buildMirror(scheme: Scheme, layout: Layout): MirrorDescriptor {
  const elements: MirrorElement[] = [];
  for (const m of scheme.modules) {
    if (!isVisibleModule(m, scheme.visibility)) continue;
    elements.push(moduleElement(m, layout));
  }

  // For each visible bus we emit two kinds of elements:
  //  - one wide 'bus-body' obstacle for the bar itself, so wires don't
  //    visually pass through the bar.
  //  - one tiny 'bus-tap' marker per tap, holding the connection port.
  //    These are excluded from obstacles in the router (excludeTypes).
  for (const bus of BUSES) {
    if (!isVisibleBus(bus, scheme.visibility)) continue;
    elements.push(busBodyElement(bus, layout));
    const taps = busTapCount(bus, layout);
    for (let i = 0; i < taps; i++) {
      elements.push(busTapElement(bus, i, layout));
    }
  }

  // For each wire flagged with routed_v2 we emit a link; the others are
  // handled by the existing manhattan/lane router in Workspace.tsx.
  const elemSet = new Set(elements.map((e) => e.id));
  const portSet = new Set<string>();
  for (const e of elements) for (const p of e.ports) portSet.add(`${e.id}/${p.id}`);
  const sideByPort = new Map<string, "top" | "bottom">();
  for (const e of elements) {
    for (const p of e.ports) sideByPort.set(`${e.id}/${p.id}`, p.side);
  }

  const links: MirrorLink[] = [];
  for (const w of scheme.wires) {
    if (!w.routed_v2) continue;
    const src = endpointToRef(w.from);
    const dst = endpointToRef(w.to);
    if (!elemSet.has(src.elementId) || !elemSet.has(dst.elementId)) continue;
    if (!portSet.has(`${src.elementId}/${src.portId}`)) continue;
    if (!portSet.has(`${dst.elementId}/${dst.portId}`)) continue;
    links.push({
      id: w.id,
      conductor: w.conductor,
      source: {
        ...src,
        side: sideByPort.get(`${src.elementId}/${src.portId}`)!,
      },
      target: {
        ...dst,
        side: sideByPort.get(`${dst.elementId}/${dst.portId}`)!,
      },
    });
  }

  return {
    elements,
    links,
    width: rem(layout.layoutWidthRem),
    height: rem(layout.layoutHeightRem),
  };
}

// Re-exports so the router file doesn't have to dig into model internals.
export type { Wire };
