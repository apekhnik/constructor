// Per-kind terminal map (CLAUDE.md §2.2-2.3).
// Each terminal has an id unique within a component, a conductor type,
// and a side (top = inputs, bottom = outputs) which determines wiring geometry.

import type { ComponentKind, TerminalRole } from "./types";

export interface TerminalDef {
  id: string;
  role: TerminalRole;
  conductor: "L" | "N" | "PE";
  side: "top" | "bottom";
}

// 2-pole standard input device (main breaker, RCD, diff-breaker, voltage relay).
// Voltage relay's N is a transit, not switched, but the wiring topology is the same.
const T_2P_TOP_BOTTOM: TerminalDef[] = [
  { id: "in_L", role: "in_L", conductor: "L", side: "top" },
  { id: "in_N", role: "in_N", conductor: "N", side: "top" },
  { id: "out_L", role: "out_L", conductor: "L", side: "bottom" },
  { id: "out_N", role: "out_N", conductor: "N", side: "bottom" },
];

const T_1P_TOP_BOTTOM: TerminalDef[] = [
  { id: "in_L", role: "in_L", conductor: "L", side: "top" },
  { id: "out_L", role: "out_L", conductor: "L", side: "bottom" },
];

const T_THREE_WAY: TerminalDef[] = [
  { id: "in_L_grid", role: "in_L_grid", conductor: "L", side: "top" },
  { id: "in_N_grid", role: "in_N", conductor: "N", side: "top" },
  { id: "in_L_gen", role: "in_L_gen", conductor: "L", side: "top" },
  { id: "in_N_gen", role: "in_N", conductor: "N", side: "top" },
  { id: "out_L", role: "out_L", conductor: "L", side: "bottom" },
  { id: "out_N", role: "out_N", conductor: "N", side: "bottom" },
];

// Built-in grid source: feeds the panel with L/N/PE on its bottom edge.
const T_SOURCE: TerminalDef[] = [
  { id: "out_L", role: "out_L", conductor: "L", side: "bottom" },
  { id: "out_N", role: "out_N", conductor: "N", side: "bottom" },
  { id: "out_PE", role: "out_PE", conductor: "PE", side: "bottom" },
];

const T_GENERATOR: TerminalDef[] = [
  { id: "out_L", role: "out_L", conductor: "L", side: "bottom" },
  { id: "out_N", role: "out_N", conductor: "N", side: "bottom" },
  { id: "out_PE", role: "out_PE", conductor: "PE", side: "bottom" },
];

const T_INVERTER: TerminalDef[] = [
  { id: "in_L", role: "in_L", conductor: "L", side: "top" },
  { id: "in_N", role: "in_N", conductor: "N", side: "top" },
  { id: "in_PE", role: "in_PE", conductor: "PE", side: "top" },
  { id: "out_L", role: "out_L", conductor: "L", side: "bottom" },
  { id: "out_N", role: "out_N", conductor: "N", side: "bottom" },
  { id: "out_PE", role: "out_PE", conductor: "PE", side: "bottom" },
];

// Load: consumes L+N (and PE for the chassis) on its top edge.
const T_LOAD: TerminalDef[] = [
  { id: "in_L", role: "in_L", conductor: "L", side: "top" },
  { id: "in_N", role: "in_N", conductor: "N", side: "top" },
  { id: "in_PE", role: "in_PE", conductor: "PE", side: "top" },
];

export function terminalsFor(kind: ComponentKind): TerminalDef[] {
  switch (kind) {
    case "main_breaker":
    case "rcd":
    case "diff_breaker":
    case "voltage_relay":
      return T_2P_TOP_BOTTOM;
    case "branch_breaker":
      return T_1P_TOP_BOTTOM;
    case "three_way_switch":
      return T_THREE_WAY;
    case "source":
      return T_SOURCE;
    case "generator":
      return T_GENERATOR;
    case "inverter":
      return T_INVERTER;
    case "load":
      return T_LOAD;
    default:
      return [];
  }
}

export function terminalById(
  kind: ComponentKind,
  terminalId: string,
): TerminalDef | undefined {
  return terminalsFor(kind).find((t) => t.id === terminalId);
}
