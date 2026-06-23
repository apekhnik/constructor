// Type stubs for the simulation model. See CLAUDE.md §2.2-2.3.
// Engine logic comes in Stage 4; for Stage 1 these are just types
// so the UI layer can already speak the right vocabulary.

export type ComponentKind =
  | "source"
  | "generator"
  | "inverter"
  | "main_breaker"
  | "rcd"
  | "diff_breaker"
  | "branch_breaker"
  | "voltage_relay"
  | "three_way_switch"
  | "bus_din"
  | "bus_n"
  | "bus_pe"
  | "load";

export type BreakerCurve = "B" | "C" | "D";

export type TerminalRole =
  | "in_L"
  | "out_L"
  | "in_N"
  | "out_N"
  | "in_PE"
  | "out_PE"
  | "in_L_grid"
  | "in_L_gen";

export type TripReason =
  | "overload"
  | "short_circuit"
  | "leak"
  | "overvoltage"
  | "undervoltage"
  | "no_neutral"
  | null;

export interface Terminal {
  id: string;
  role: TerminalRole;
}

export interface SchemeComponent {
  id: string;
  kind: ComponentKind;
  label: string;
  rated_current_A?: number;
  curve?: BreakerCurve;
  rated_leak_mA?: number;
  poles?: 1 | 2;
  terminals: Terminal[];
  state: {
    on: boolean;
    tripped: boolean;
    trip_reason: TripReason;
  };
  position: { rail: number; slot: number };
}

export interface Wire {
  id: string;
  from: { componentId: string; terminalId: string };
  to: { componentId: string; terminalId: string };
  conductor: "L" | "N" | "PE";
}

export interface Scheme {
  components: SchemeComponent[];
  wires: Wire[];
  source: {
    grid_voltage_V: number;
    grid_active: boolean;
    neutral_break: boolean;
    leak_mA: number;
  };
}

export type Severity = "error" | "warning" | "info";

export interface DiagnosticMessage {
  severity: Severity;
  code: string;
  message_short: string;
  message_full: string;
  related_components: string[];
}
