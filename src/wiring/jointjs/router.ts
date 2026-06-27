// JointJS-driven wire router. Builds a mirror graph from our Scheme +
// Layout, runs joint.routers.manhattan, and returns the computed polyline
// (in rem, ready to be remToPx'd by WiringLayer) for each routed_v2 wire.
//
// This module owns the only place in the codebase that imports @joint/core.
// Keep all JointJS quirks contained here.

import { dia, shapes, routers } from "@joint/core";
import { REM_TO_PX, type Layout } from "../../model/layout";
import type { Scheme } from "../../model/scheme";
import { buildMirror, type MirrorDescriptor } from "./mirror";

const PX_TO_REM = 1 / REM_TO_PX;

// Marks elements as bus-taps so the manhattan router can skip them as
// obstacles. The literal must match what we set in `.set('type', ...)`.
const BUS_TAP_TYPE = "spike.BusTap";

interface OffScreenPaper {
  graph: dia.Graph;
  paper: dia.Paper;
  el: HTMLDivElement;
}

let offscreen: OffScreenPaper | null = null;

function ensurePaper(width: number, height: number): OffScreenPaper {
  if (offscreen) {
    offscreen.paper.setDimensions(width, height);
    return offscreen;
  }
  // Put the host element off-screen but still attached, so JointJS's
  // SVG-bbox measurements work. Pure detached elements sometimes confuse
  // Vectorizer in older browsers.
  const el = document.createElement("div");
  el.style.position = "absolute";
  el.style.left = "-99999px";
  el.style.top = "0";
  el.style.width = `${width}px`;
  el.style.height = `${height}px`;
  el.style.visibility = "hidden";
  el.setAttribute("aria-hidden", "true");
  document.body.appendChild(el);

  const graph = new dia.Graph({}, { cellNamespace: shapes });
  const paper = new dia.Paper({
    el,
    model: graph,
    width,
    height,
    async: false,
    interactive: false,
    cellViewNamespace: shapes,
  });
  offscreen = { graph, paper, el };
  return offscreen;
}

function sideToDirection(side: "top" | "bottom"): "top" | "bottom" {
  return side;
}

function rebuildGraph(mirror: MirrorDescriptor): {
  graph: dia.Graph;
  paper: dia.Paper;
  linkIds: Map<string, dia.Link>;
} {
  const { graph, paper } = ensurePaper(mirror.width, mirror.height);
  graph.clear();

  for (const e of mirror.elements) {
    const cell = new shapes.standard.Rectangle({
      id: e.id,
      position: { x: e.x, y: e.y },
      size: { width: e.width, height: e.height },
      attrs: { body: { fill: "transparent", stroke: "transparent" } },
      ports: {
        items: e.ports.map((p) => ({
          id: p.id,
          args: { x: p.x, y: p.y },
        })),
        groups: {
          // Single group; positions come from per-port args (absolute mode).
          default: { position: "absolute" },
        },
      },
    });
    // Apply group to every port so JointJS knows to use absolute positioning.
    for (const p of e.ports) cell.portProp(p.id, "group", "default");
    if (e.role === "bus-tap") {
      cell.set("type", BUS_TAP_TYPE);
    }
    graph.addCell(cell);
  }

  const linkIds = new Map<string, dia.Link>();
  for (const l of mirror.links) {
    const link = new shapes.standard.Link({
      id: l.id,
      source: { id: l.source.elementId, port: l.source.portId },
      target: { id: l.target.elementId, port: l.target.portId },
      router: {
        name: "manhattan",
        args: {
          // Imaginary pathfinder grid step (in px).
          step: 6,
          // Padding around obstacles (px).
          padding: 8,
          // Force wires to leave/enter terminals vertically — DIN modules
          // are wired top↔bottom, not side-to-side.
          startDirections: [sideToDirection(l.source.side)],
          endDirections: [sideToDirection(l.target.side)],
          // Bus taps are markers, not physical bodies — pretend they don't
          // exist for obstacle avoidance.
          excludeTypes: [BUS_TAP_TYPE],
        },
      },
      // Solid-line connection point on the element body, no markers.
      attrs: { line: { stroke: "transparent", strokeWidth: 0 } },
    });
    graph.addCell(link);
    linkIds.set(l.id, link);
  }
  return { graph, paper, linkIds };
}

function pathFromLinkView(linkView: dia.LinkView): Array<{ x: number; y: number }> {
  // linkView.route holds the router's intermediate points; we add the
  // resolved source/target connection points to close the polyline.
  const src = linkView.sourcePoint;
  const tgt = linkView.targetPoint;
  const route = linkView.route ?? [];
  const pts: Array<{ x: number; y: number }> = [];
  if (src) pts.push({ x: src.x, y: src.y });
  for (const p of route) pts.push({ x: p.x, y: p.y });
  if (tgt) pts.push({ x: tgt.x, y: tgt.y });
  return pts;
}

export type RoutedPath = Array<{ x: number; y: number }>; // in rem

export function routeWires(
  scheme: Scheme,
  layout: Layout,
): Map<string, RoutedPath> {
  const result = new Map<string, RoutedPath>();
  // Don't even spin up JointJS if the user hasn't created any routed_v2 wires.
  if (!scheme.wires.some((w) => w.routed_v2)) return result;
  // Guard against SSR / vitest without jsdom.
  if (typeof document === "undefined") return result;

  const mirror = buildMirror(scheme, layout);
  if (mirror.links.length === 0) return result;

  try {
    const { paper, linkIds } = rebuildGraph(mirror);
    for (const [wireId, link] of linkIds) {
      const view = paper.findViewByModel(link) as dia.LinkView | null;
      if (!view) continue;
      const pts = pathFromLinkView(view);
      // Convert px → rem so WiringLayer can render with its remToPx helper.
      result.set(
        wireId,
        pts.map((p) => ({ x: p.x * PX_TO_REM, y: p.y * PX_TO_REM })),
      );
    }
  } catch (err) {
    // Soft-fail: if JointJS blows up, we return an empty map and the
    // WiringLayer falls back to manhattanPath. Surface the cause in dev.
    if (typeof console !== "undefined") {
      console.warn("[wiring/jointjs] route computation failed:", err);
    }
  }
  return result;
}

// Test seam: tear down the off-screen Paper so vitest specs don't leak it.
export function _resetForTests(): void {
  if (!offscreen) return;
  offscreen.paper.remove();
  offscreen.el.remove();
  offscreen = null;
}

// Expose the router-name constant for unit tests, so they don't have to
// reach into routers themselves.
export const _availableRouters = Object.keys(routers);
