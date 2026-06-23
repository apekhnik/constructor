// Pure simulation tick (CLAUDE.md §2.5–2.6). Given a Scheme, returns:
//  - per-module runtime (energization, current, lit, pending/instant trip)
//  - diagnostics (errors / warnings / info)
//  - newTrips that the engine should apply immediately (instantaneous trips).
//
// This module is deliberately framework-free: no React, no timers. The
// engine layer applies delayed trips with real or accelerated wall time.

import { analyzeStructure } from "./analysis";
import { buildGraph, type SchemeGraph } from "./graph";
import { GRID_SOURCE_ID } from "./scheme";
import type { PlacedModule, Scheme, SourceState } from "./scheme";
import type { DiagnosticMessage, TripReason } from "./types";

// ---------------- Magnetic thresholds (CLAUDE.md §2.5) ----------------

const MAGNETIC_K: Record<"B" | "C" | "D", number> = { B: 3, C: 5, D: 10 };
const THERMAL_MIN_K = 1.45;

// Thermal delay (ms) as a coarse function of overload ratio.
// 1.45..2.0 → ~30 s; 2.0..3.0 → ~7 s; above magnetic threshold we go instant.
function thermalDelayMs(k: number): number {
  if (k < THERMAL_MIN_K) return Number.POSITIVE_INFINITY;
  if (k < 2.0) return 30_000;
  if (k < 3.0) return 7_000;
  return 2_000;
}

// Voltage relay undervoltage delay (CLAUDE.md §2.5). Extreme dips faster.
function undervoltageDelayMs(u: number, uMin: number): number {
  if (u < 80) return 500;
  if (u < uMin) return 7_000;
  return Number.POSITIVE_INFINITY;
}

// ---------------- Source helpers ----------------

interface EnergizedNode {
  voltage_V: number;
  // Which physical source feeds this node (grid, generator or inverter).
  source: "grid" | "generator" | "inverter";
}

// Find the nodes that the source/generator feed directly (before propagation
// through switching modules — that part is already baked into graph internal
// pass-throughs via `on && !tripped` state).
function seedFeeds(
  scheme: Scheme,
  graph: SchemeGraph,
  src: SourceState,
  inverterBypasses: Set<string>,
): { L: Map<string, EnergizedNode>; N: Set<string> } {
  const L = new Map<string, EnergizedNode>();
  const N = new Set<string>();

  if (src.grid_active) {
    const source = scheme.modules.find((m) => m.id === GRID_SOURCE_ID);
    if (source) {
      const bottom = graph.bottomNodes(source.id);
      if (bottom.L) {
        L.set(bottom.L, { voltage_V: src.grid_voltage_V, source: "grid" });
      }
      if (bottom.N && !src.neutral_break) {
        N.add(bottom.N);
      }
    }
  }

  // Generator module is the physical source
  const generator = scheme.modules.find((m) => m.kind === "generator");
  if (generator && generator.on && !generator.tripped) {
    const bottom = graph.bottomNodes(generator.id);
    if (bottom.L) {
      L.set(bottom.L, { voltage_V: src.gen_voltage_V, source: "generator" });
    }
    if (bottom.N) {
      N.add(bottom.N);
    }
  }

  // Inverters in battery mode generate power at their output terminals
  for (const m of scheme.modules) {
    if (m.kind !== "inverter") continue;
    if (m.on && !m.tripped && !inverterBypasses.has(m.id)) {
      const bottom = graph.bottomNodes(m.id);
      if (bottom.L) {
        L.set(bottom.L, { voltage_V: 230, source: "inverter" });
      }
      if (bottom.N) {
        N.add(bottom.N);
      }
    }
  }

  return { L, N };
}

// Compute L-energy map across all nodes by propagating from feeds.
// Uses a two-pass resolution to determine inverter bypass vs battery modes.
function energizedSets(scheme: Scheme, src: SourceState) {
  // 1. Build a temporary graph to determine bypasses
  const graphTemp = buildGraph(scheme, { inverterBypasses: new Set() });
  
  // Feed grid and generator on graphTemp
  const L_temp = new Map<string, EnergizedNode>();
  const N_temp = new Set<string>();

  if (src.grid_active) {
    const source = scheme.modules.find((m) => m.id === GRID_SOURCE_ID);
    if (source) {
      const bottom = graphTemp.bottomNodes(source.id);
      if (bottom.L) {
        L_temp.set(bottom.L, { voltage_V: src.grid_voltage_V, source: "grid" });
      }
      if (bottom.N && !src.neutral_break) {
        N_temp.add(bottom.N);
      }
    }
  }

  const generator = scheme.modules.find((m) => m.kind === "generator");
  if (generator && generator.on && !generator.tripped) {
    const bottom = graphTemp.bottomNodes(generator.id);
    if (bottom.L) {
      L_temp.set(bottom.L, { voltage_V: src.gen_voltage_V, source: "generator" });
    }
    if (bottom.N) {
      N_temp.add(bottom.N);
    }
  }

  const inverterBypasses = new Set<string>();
  for (const m of scheme.modules) {
    if (m.kind !== "inverter") continue;
    const inL = graphTemp.nodeOfTerminal(m.id, "in_L");
    const inN = graphTemp.nodeOfTerminal(m.id, "in_N");
    if (L_temp.has(inL) && N_temp.has(inN)) {
      inverterBypasses.add(m.id);
    }
  }

  // 2. Build final graph and resolve seeds
  const graph = buildGraph(scheme, { inverterBypasses });
  const { L, N } = seedFeeds(scheme, graph, src, inverterBypasses);

  return { L, N, graph, inverterBypasses };
}

// ---------------- Load detection ----------------

interface LoadView {
  module: PlacedModule;
  nodeL: string;
  nodeN: string;
  nodePE: string | null;
}

function loadViews(scheme: Scheme, graph: SchemeGraph): LoadView[] {
  return scheme.modules
    .filter((m) => m.kind === "load")
    .map((m) => ({
      module: m,
      nodeL: graph.nodeOfTerminal(m.id, "in_L"),
      nodeN: graph.nodeOfTerminal(m.id, "in_N"),
      nodePE: graph.nodeOfTerminal(m.id, "in_PE") ?? null,
    }));
}

interface LoadEnergized {
  energized: boolean;
  voltage_V: number;
  source: "grid" | "generator" | null;
}

function loadEnergized(
  lv: LoadView,
  L: Map<string, EnergizedNode>,
  N: Set<string>,
): LoadEnergized {
  const ln = L.get(lv.nodeL);
  if (!ln || !N.has(lv.nodeN)) {
    return { energized: false, voltage_V: 0, source: null };
  }
  return { energized: true, voltage_V: ln.voltage_V, source: ln.source };
}

// ---------------- Per-module current attribution ----------------

const SWITCHING_KINDS = new Set([
  "main_breaker",
  "branch_breaker",
  "diff_breaker",
  "rcd",
  "voltage_relay",
  "generator",
  "inverter",
]);

function isSwitching(m: PlacedModule): boolean {
  return SWITCHING_KINDS.has(m.kind);
}

// For each switching module, find which currently-energized loads are fed
// through it. Implementation: rebuild the graph with the module's L pass-
// through disabled and see which loads lose power. Cost is O(M*N) graph
// builds — fine for MVP schemes (< 50 modules).
function loadsFedThrough(
  scheme: Scheme,
  src: SourceState,
  baseLoads: Array<{ id: string; energized: boolean }>,
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const baseEnergized = new Set(
    baseLoads.filter((l) => l.energized).map((l) => l.id),
  );

  for (const m of scheme.modules) {
    if (!isSwitching(m)) continue;
    if (!m.on || m.tripped) {
      // Already disconnected — it doesn't carry current.
      result.set(m.id, []);
      continue;
    }
    // Build a hypothetical scheme where this module is off.
    const hypothetical: Scheme = {
      ...scheme,
      modules: scheme.modules.map((x) =>
        x.id === m.id ? { ...x, on: false } : x,
      ),
    };
    const graphH = buildGraph(hypothetical);
    const { L: lH, N: nH } = energizedSets(hypothetical, graphH, src);
    const livesH = new Set<string>();
    for (const lv of loadViews(hypothetical, graphH)) {
      if (loadEnergized(lv, lH, nH).energized) livesH.add(lv.module.id);
    }
    const lost: string[] = [];
    for (const id of baseEnergized) {
      if (!livesH.has(id)) lost.push(id);
    }
    result.set(m.id, lost);
  }
  return result;
}

// ---------------- Module runtime + trip rules ----------------

export interface ModuleRuntime {
  id: string;
  energized: boolean; // sees voltage on its input side
  current_A: number; // current carried by this module's L pole
  voltage_in_V: number;
  voltage_out_V: number;
  lit?: boolean; // for loads: visually lit
  // For switching devices: instant trip request to be applied THIS tick.
  trip_now?: { reason: TripReason };
  // For switching devices: delayed trip request — runtime starts a timer.
  trip_pending?: { reason: TripReason; delay_ms: number };
}

export interface TickResult {
  runtime: Record<string, ModuleRuntime>;
  diagnostics: DiagnosticMessage[];
  newTrips: Array<{ id: string; reason: TripReason }>;
}

function emptyRuntime(scheme: Scheme): Record<string, ModuleRuntime> {
  const map: Record<string, ModuleRuntime> = {};
  for (const m of scheme.modules) {
    map[m.id] = {
      id: m.id,
      energized: false,
      current_A: 0,
      voltage_in_V: 0,
      voltage_out_V: 0,
    };
  }
  return map;
}

// Compute breaker trip decision based on accumulated current.
function breakerDecision(
  m: PlacedModule,
  current_A: number,
): { now?: TripReason; pending?: { reason: TripReason; delay_ms: number } } {
  const Irated = m.rated_current_A ?? Number.POSITIVE_INFINITY;
  if (Irated <= 0 || !isFinite(Irated)) return {};
  const k = current_A / Irated;
  const curve = (m.curve ?? "C") as "B" | "C" | "D";
  const magK = MAGNETIC_K[curve];
  if (k >= magK) return { now: "short_circuit" };
  if (k >= THERMAL_MIN_K) {
    return {
      pending: { reason: "overload", delay_ms: thermalDelayMs(k) },
    };
  }
  return {};
}

function relayDecision(
  m: PlacedModule,
  voltage_V: number,
): { now?: TripReason; pending?: { reason: TripReason; delay_ms: number } } {
  const uMin = m.u_min_V ?? 180;
  const uMax = m.u_max_V ?? 250;
  if (voltage_V <= 0) {
    // No voltage to measure (e.g. neutral break, or off). Don't trip — the
    // relay simply opens / has nothing to do. Engine handles "lost N"
    // separately via diagnostics.
    return {};
  }
  if (voltage_V > uMax + 30) return { now: "overvoltage" }; // extreme spike → ~20 ms
  if (voltage_V > uMax) {
    return { pending: { reason: "overvoltage", delay_ms: 200 } };
  }
  if (voltage_V < uMin) {
    return {
      pending: {
        reason: "undervoltage",
        delay_ms: undervoltageDelayMs(voltage_V, uMin),
      },
    };
  }
  return {};
}

// ---------------- Main tick ----------------

export function simulate(scheme: Scheme): TickResult {
  const diagnostics: DiagnosticMessage[] = [];
  const runtime = emptyRuntime(scheme);
  const newTrips: Array<{ id: string; reason: TripReason }> = [];

  const src = scheme.source;
  const { L, N, graph, inverterBypasses } = energizedSets(scheme, src);

  // ---- Per-load energization and runtime ----
  const lvs = loadViews(scheme, graph);
  const loadResults = lvs.map((lv) => ({
    id: lv.module.id,
    info: loadEnergized(lv, L, N),
  }));
  for (const { id, info } of loadResults) {
    const r = runtime[id];
    const mod = scheme.modules.find((m) => m.id === id);
    r.energized = info.energized;
    r.voltage_in_V = info.voltage_V;
    r.voltage_out_V = info.voltage_V;
    // Lit only within a sensible working range.
    r.lit = info.energized && info.voltage_V >= 180 && info.voltage_V <= 260;
    // I = P / U at the actual terminal voltage. Below 50 V we clamp the
    // denominator so a tiny residual voltage doesn't blow up the breaker
    // current to absurd kA values.
    if (info.energized && mod?.power_W) {
      const u = Math.max(50, info.voltage_V);
      r.current_A = mod.power_W / u;
    } else {
      r.current_A = 0;
    }
  }

  // ---- Attribute load current to upstream switching devices ----
  const baseLoadEnergized = loadResults.map((lr) => ({
    id: lr.id,
    energized: lr.info.energized,
  }));
  const fedBy = loadsFedThrough(scheme, src, baseLoadEnergized);

  for (const m of scheme.modules) {
    if (!isSwitching(m)) continue;
    const r = runtime[m.id];
    
    if (m.kind === "generator") {
      r.energized = m.on && !m.tripped;
      r.voltage_in_V = r.energized ? src.gen_voltage_V : 0;
      r.voltage_out_V = r.voltage_in_V;
      
      const loadIds = fedBy.get(m.id) ?? [];
      const totalCurrent = loadIds
        .map((lid) => runtime[lid]?.current_A ?? 0)
        .reduce((a, b) => a + b, 0);
      r.current_A = totalCurrent;
      continue;
    }

    if (m.kind === "inverter") {
      const top = graph.topNodes(m.id);
      const ln = top.L ? L.get(top.L) : undefined;
      const energized = !!ln && (!top.N || N.has(top.N));
      r.energized = energized;
      r.voltage_in_V = ln?.voltage_V ?? 0;
      
      if (m.on && !m.tripped) {
        if (inverterBypasses.has(m.id)) {
          r.voltage_out_V = r.voltage_in_V;
        } else {
          r.voltage_out_V = 230; // Battery backup mode
        }
      } else {
        r.voltage_out_V = 0;
      }

      const loadIds = fedBy.get(m.id) ?? [];
      const totalCurrent = loadIds
        .map((lid) => runtime[lid]?.current_A ?? 0)
        .reduce((a, b) => a + b, 0);
      r.current_A = totalCurrent;
      continue;
    }

    const top = graph.topNodes(m.id);
    const ln = top.L ? L.get(top.L) : undefined;
    const energized = !!ln && (!top.N || N.has(top.N));
    r.energized = energized;
    r.voltage_in_V = ln?.voltage_V ?? 0;
    // Output side voltage: if pass-through is active, same as input; else 0.
    r.voltage_out_V = m.on && !m.tripped ? r.voltage_in_V : 0;

    const loadIds = fedBy.get(m.id) ?? [];
    const totalCurrent = loadIds
      .map((lid) => runtime[lid]?.current_A ?? 0)
      .reduce((a, b) => a + b, 0);
    r.current_A = totalCurrent;

    if (!m.on || m.tripped) continue;

    // --- Trip rules ---
    if (m.kind === "main_breaker" || m.kind === "branch_breaker") {
      const d = breakerDecision(m, totalCurrent);
      if (d.now) {
        r.trip_now = { reason: d.now };
        newTrips.push({ id: m.id, reason: d.now });
      } else if (d.pending) {
        r.trip_pending = d.pending;
      }
    }
    if (m.kind === "diff_breaker") {
      const d = breakerDecision(m, totalCurrent);
      if (d.now) {
        r.trip_now = { reason: d.now };
        newTrips.push({ id: m.id, reason: d.now });
      } else if (d.pending) {
        r.trip_pending = d.pending;
      }
    }
    if (m.kind === "rcd" || m.kind === "diff_breaker") {
      // Leak check: if the configured leak target is among loads fed through
      // this device, compare leak_mA with rated_leak_mA.
      const target = src.leak_target_id;
      if (
        target &&
        src.leak_mA > 0 &&
        loadIds.includes(target) &&
        m.rated_leak_mA &&
        src.leak_mA >= m.rated_leak_mA
      ) {
        r.trip_now = { reason: "leak" };
        newTrips.push({ id: m.id, reason: "leak" });
      }
    }
    if (m.kind === "voltage_relay" && energized) {
      const d = relayDecision(m, r.voltage_in_V);
      if (d.now) {
        r.trip_now = { reason: d.now };
        newTrips.push({ id: m.id, reason: d.now });
      } else if (d.pending) {
        r.trip_pending = d.pending;
      }
    }
  }

  // ---- Diagnostics for trips happening now ----
  for (const t of newTrips) {
    const m = scheme.modules.find((x) => x.id === t.id);
    if (!m) continue;
    const tripCopy: Record<string, [string, string]> = {
      overload: [
        "Перегрузка",
        `Через ${m.label} прошёл ток ${runtime[m.id].current_A.toFixed(1)} А при номинале ${m.rated_current_A} А. Тепловой расцепитель отключил линию.`,
      ],
      short_circuit: [
        "Короткое замыкание",
        `Электромагнитный расцепитель ${m.label} отключил линию мгновенно — ток превысил порог характеристики ${m.curve}.`,
      ],
      leak: [
        "Ток утечки",
        `${m.label} зафиксировал ток утечки ${scheme.source.leak_mA} мА при номинале ${m.rated_leak_mA} мА.`,
      ],
      overvoltage: [
        "Перенапряжение",
        `Напряжение сети ${runtime[m.id].voltage_in_V.toFixed(0)} В превысило верхний порог реле ${m.u_max_V} В.`,
      ],
      undervoltage: [
        "Пониженное напряжение",
        `Напряжение сети ${runtime[m.id].voltage_in_V.toFixed(0)} В ниже нижнего порога реле ${m.u_min_V} В.`,
      ],
      no_neutral: ["Обрыв нуля", `Реле напряжения отключило нагрузку из-за обрыва нуля.`],
    };
    if (t.reason) {
      const [short, full] = tripCopy[t.reason] ?? ["Срабатывание", "Аппарат сработал."];
      diagnostics.push({
        severity: "warning",
        code: `TRIP_${t.reason.toUpperCase()}`,
        message_short: short,
        message_full: full,
        related_components: [m.id],
      });
    }
  }

  // ---- Power-on info ----
  if (src.grid_active) {
    diagnostics.push({
      severity: "info",
      code: "POWER_ON",
      message_short: "Питание подано",
      message_full: `Напряжение сети ${src.grid_voltage_V} В${src.neutral_break ? " · обрыв N" : ""}.`,
      related_components: [GRID_SOURCE_ID],
    });
  }

  // ---- Educational hints for already-tripped modules ----
  for (const m of scheme.modules) {
    if (!m.tripped) continue;
    if (m.trip_reason === "overload") {
      diagnostics.push({
        severity: "info",
        code: "HINT_THERMAL_COOLDOWN",
        message_short: "Дайте автомату остыть",
        message_full: `«${m.label}» сработал по перегреву. Биметаллической пластине нужно время на остывание — не включайте автомат повторно сразу.`,
        related_components: [m.id],
      });
    }
    if (
      m.kind === "voltage_relay" &&
      (m.trip_reason === "overvoltage" || m.trip_reason === "undervoltage")
    ) {
      diagnostics.push({
        severity: "info",
        code: "HINT_RELAY_APV",
        message_short: "Реле сделает АПВ автоматически",
        message_full: `«${m.label}» снова включит линию через несколько секунд после возврата напряжения в безопасный диапазон ${m.u_min_V}–${m.u_max_V} В.`,
        related_components: [m.id],
      });
    }
  }

  // ---- Neutral-break educational message ----
  if (src.grid_active && src.neutral_break) {
    const guardingRelay = scheme.modules.find(
      (m) => m.kind === "voltage_relay" && m.tripped,
    );
    if (guardingRelay) {
      diagnostics.push({
        severity: "info",
        code: "HINT_RELAY_SAVES_FROM_NO_N",
        message_short: "Реле защитило от обрыва нуля",
        message_full: `Без нуля напряжение на нагрузке непредсказуемо. «${guardingRelay.label}» обнаружило аварийный режим и отключило линию — это одна из главных причин ставить реле напряжения.`,
        related_components: [guardingRelay.id],
      });
    } else {
      diagnostics.push({
        severity: "warning",
        code: "WARN_NO_N_NO_RELAY",
        message_short: "Обрыв N без защиты",
        message_full:
          "Сейчас оборван ноль. Без реле напряжения нагрузки не получают питания, а в трёхфазных сетях возможен перекос фаз и выход бытовой техники из строя.",
        related_components: [GRID_SOURCE_ID],
      });
    }
  }

  // ---- Structural §2.4 warnings ----
  diagnostics.push(...analyzeStructure(scheme));

  return { runtime, diagnostics, newTrips };
}
