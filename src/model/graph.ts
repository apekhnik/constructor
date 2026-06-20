// Electrical connectivity graph built from wires + internal pass-throughs
// of switching devices (CLAUDE.md §2.6 step 1). The graph is independent of
// source voltage and trip state of the load — only of structural wiring and
// the current "on/tripped/position" state of each switching module.

import { BUSES, busTapCount, type BusName } from "./layout";
import type { PlacedModule, Scheme } from "./scheme";
import { endpointKey, type Endpoint } from "./scheme";
import { terminalsFor, type TerminalDef } from "./terminals";

// Disjoint-set union (Kruskal-style) over endpoint keys.
class DSU {
  private parent = new Map<string, string>();

  add(k: string) {
    if (!this.parent.has(k)) this.parent.set(k, k);
  }

  find(k: string): string {
    this.add(k);
    let p = this.parent.get(k)!;
    while (p !== this.parent.get(p)) {
      const pp = this.parent.get(p)!;
      this.parent.set(p, pp);
      p = pp;
    }
    return p;
  }

  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

export type NodeId = string;

export interface SchemeGraph {
  // Resolve an endpoint to its canonical node id.
  nodeOfEndpoint(ep: Endpoint): NodeId;
  // Module-terminal lookup.
  nodeOfTerminal(moduleId: string, terminalId: string): NodeId;
  // Bus node (single id per bus name).
  nodeOfBus(bus: BusName): NodeId;
  // For each module, the conductor → node map at its top side (inputs).
  topNodes(moduleId: string): Partial<Record<"L" | "N" | "PE", NodeId>>;
  bottomNodes(moduleId: string): Partial<Record<"L" | "N" | "PE", NodeId>>;
  // Pretty: id list of all distinct nodes touched (post-union).
  allNodes(): NodeId[];
}

function moduleInternalLinks(
  m: PlacedModule,
  opts: { structural?: boolean } = {},
): Array<[string, string]> {
  const links: Array<[string, string]> = [];
  const id = (t: string) => `mod:${m.id}:${t}`;
  // In structural mode (used by the analyzer), treat every switching device
  // as armed — we want to see "would current flow if everything was on".
  const armed = opts.structural ? true : m.on && !m.tripped;
  switch (m.kind) {
    case "main_breaker":
    case "diff_breaker":
    case "rcd": {
      // 2P switching — passes L and N when armed.
      if (armed) {
        links.push([id("in_L"), id("out_L")]);
        links.push([id("in_N"), id("out_N")]);
      }
      break;
    }
    case "branch_breaker": {
      if (armed) {
        links.push([id("in_L"), id("out_L")]);
      }
      break;
    }
    case "voltage_relay": {
      // N is a transit (CLAUDE.md §2.5) — never broken by the relay.
      links.push([id("in_N"), id("out_N")]);
      if (armed) {
        links.push([id("in_L"), id("out_L")]);
      }
      break;
    }
    case "three_way_switch": {
      const pos = m.switch_position ?? "network";
      if (pos === "network") {
        links.push([id("in_L_grid"), id("out_L")]);
        links.push([id("in_N_grid"), id("out_N")]);
      } else if (pos === "generator") {
        links.push([id("in_L_gen"), id("out_L")]);
        links.push([id("in_N_gen"), id("out_N")]);
      }
      // "off" → no internal connection at all.
      break;
    }
    case "source":
    case "load":
    case "bus_din":
    case "bus_n":
    case "bus_pe":
      break;
  }
  return links;
}

export interface BuildGraphOptions {
  // If true, ignore on/tripped state — pretend every switching device is
  // armed (in_↔out_ pass-through active). Used by the structural analyzer.
  structural?: boolean;
}

export function buildGraph(
  scheme: Scheme,
  opts: BuildGraphOptions = {},
): SchemeGraph {
  const dsu = new DSU();

  // Register all module terminals as nodes.
  for (const m of scheme.modules) {
    for (const t of terminalsFor(m.kind)) {
      dsu.add(`mod:${m.id}:${t.id}`);
    }
  }

  // Merge all taps of a bus into a single bus node.
  for (const bus of BUSES) {
    const busId = `bus:${bus}`;
    dsu.add(busId);
    const taps = busTapCount(bus);
    for (let i = 0; i < taps; i++) {
      dsu.union(busId, `bus:${bus}:${i}`);
    }
  }

  // External wires.
  for (const w of scheme.wires) {
    dsu.union(endpointKey(w.from), endpointKey(w.to));
  }

  // Internal pass-throughs of switching modules.
  for (const m of scheme.modules) {
    for (const [a, b] of moduleInternalLinks(m, opts)) {
      dsu.union(a, b);
    }
  }

  const nodeOfEndpoint = (ep: Endpoint): NodeId => {
    if (ep.kind === "bus") return dsu.find(`bus:${ep.bus}`);
    return dsu.find(`mod:${ep.moduleId}:${ep.terminalId}`);
  };

  const sideNodes = (
    moduleId: string,
    side: "top" | "bottom",
  ): Partial<Record<"L" | "N" | "PE", NodeId>> => {
    const m = scheme.modules.find((x) => x.id === moduleId);
    if (!m) return {};
    const out: Partial<Record<"L" | "N" | "PE", NodeId>> = {};
    for (const t of terminalsFor(m.kind) as TerminalDef[]) {
      if (t.side !== side) continue;
      out[t.conductor] = dsu.find(`mod:${moduleId}:${t.id}`);
    }
    return out;
  };

  const allNodes = (): NodeId[] => {
    const seen = new Set<NodeId>();
    for (const m of scheme.modules) {
      for (const t of terminalsFor(m.kind)) {
        seen.add(dsu.find(`mod:${m.id}:${t.id}`));
      }
    }
    for (const bus of BUSES) seen.add(dsu.find(`bus:${bus}`));
    return [...seen];
  };

  return {
    nodeOfEndpoint,
    nodeOfTerminal: (mid, tid) => dsu.find(`mod:${mid}:${tid}`),
    nodeOfBus: (b) => dsu.find(`bus:${b}`),
    topNodes: (mid) => sideNodes(mid, "top"),
    bottomNodes: (mid) => sideNodes(mid, "bottom"),
    allNodes,
  };
}
