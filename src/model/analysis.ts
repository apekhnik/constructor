// Structural analyzer: catches the "soft" wiring mistakes from CLAUDE.md §2.4
// that don't block assembly but compromise safety. Runs on the bare scheme
// without power applied, using the structural graph view (all switching
// devices treated as armed).

import { buildGraph } from "./graph";
import type { PlacedModule, Scheme } from "./scheme";
import { terminalsFor } from "./terminals";
import type { DiagnosticMessage } from "./types";

function rcdLikeUpstream(scheme: Scheme): PlacedModule[] {
  return scheme.modules.filter(
    (m) => m.kind === "rcd" || m.kind === "diff_breaker",
  );
}

function terminalHasWire(scheme: Scheme, moduleId: string, terminalId: string): boolean {
  return scheme.wires.some(
    (w) =>
      (w.from.kind === "module" &&
        w.from.moduleId === moduleId &&
        w.from.terminalId === terminalId) ||
      (w.to.kind === "module" &&
        w.to.moduleId === moduleId &&
        w.to.terminalId === terminalId),
  );
}

export function analyzeStructure(scheme: Scheme): DiagnosticMessage[] {
  const diags: DiagnosticMessage[] = [];
  // Don't emit warnings until the user has at least placed some wiring.
  if (scheme.wires.length === 0) return diags;

  const graph = buildGraph(scheme, { structural: true });
  const peBusNode = graph.nodeOfBus("PE");
  const nBusNode = graph.nodeOfBus("N");

  // ---- LOAD_NO_PE: load chassis not grounded ----
  for (const m of scheme.modules) {
    if (m.kind !== "load") continue;
    const pe = terminalsFor(m.kind).find((t) => t.conductor === "PE");
    if (!pe) continue;
    const node = graph.nodeOfTerminal(m.id, pe.id);
    // If the load's PE terminal is in its own isolated node (no wires touched
    // it) — it's floating.
    const grounded = node === peBusNode;
    const wired = terminalHasWire(scheme, m.id, pe.id);
    if (!wired || !grounded) {
      diags.push({
        severity: "warning",
        code: "LOAD_NO_PE",
        message_short: "Нет заземления",
        message_full: `Корпус нагрузки «${m.label}» не подключён к шине PE. При пробое изоляции на корпус — риск поражения током.`,
        related_components: [m.id],
      });
    }
  }

  // ---- N_PE_AFTER_RCD: neutral re-bonded to PE downstream of RCD ----
  for (const r of rcdLikeUpstream(scheme)) {
    const outN = graph.nodeOfTerminal(r.id, "out_N");
    if (outN === peBusNode) {
      diags.push({
        severity: "warning",
        code: "N_PE_AFTER_RCD",
        message_short: "N и PE после УЗО соединены",
        message_full: `Шина PE и нейтраль после «${r.label}» оказались на одном узле. Часть обратного тока пойдёт мимо дифференциального трансформатора — УЗО будет ложно срабатывать или вообще не сработает.`,
        related_components: [r.id],
      });
    }
  }

  // ---- BAD_BREAKER_RATING: downstream breaker rated higher than its RCD ----
  for (const r of rcdLikeUpstream(scheme)) {
    if (!r.rated_current_A) continue;
    const rOutL = graph.nodeOfTerminal(r.id, "out_L");
    for (const b of scheme.modules) {
      if (b.kind !== "branch_breaker" && b.kind !== "main_breaker") continue;
      if (b.id === r.id) continue;
      if (!b.rated_current_A) continue;
      const bInL = graph.nodeOfTerminal(b.id, "in_L");
      if (bInL !== rOutL) continue;
      if (b.rated_current_A > r.rated_current_A) {
        diags.push({
          severity: "warning",
          code: "BAD_BREAKER_RATING",
          message_short: "Ступенчатость нарушена",
          message_full: `Автомат «${b.label}» (${b.rated_current_A} А) защищает линию, идущую через «${r.label}» (${r.rated_current_A} А). При перегрузке скорее выйдет из строя УЗО, а не сработает автомат. Поставьте автомат на ступень ниже номинала УЗО.`,
          related_components: [b.id, r.id],
        });
      }
    }
  }

  // ---- RCD_NO_TRANSIT_N: load's N path does not pass through the RCD ----
  // For each load, walk: does load.in_N node coincide with the RCD's out_N
  // when the L path *does* go through that RCD? If yes, N is being routed
  // separately — RCD can't compare L vs. N.
  for (const r of rcdLikeUpstream(scheme)) {
    const rOutL = graph.nodeOfTerminal(r.id, "out_L");
    const rOutN = graph.nodeOfTerminal(r.id, "out_N");
    for (const m of scheme.modules) {
      if (m.kind !== "load") continue;
      const loadL = graph.nodeOfTerminal(m.id, "in_L");
      const loadN = graph.nodeOfTerminal(m.id, "in_N");
      // L path passes through RCD?
      if (loadL !== rOutL) continue;
      // Now check whether N path also passes through THIS RCD.
      if (loadN === rOutN) continue; // good — both pass through.
      // If load.N is on the N bus directly (i.e., bypasses RCD via the bus),
      // that's the classic mistake.
      if (loadN === nBusNode) {
        diags.push({
          severity: "warning",
          code: "RCD_NO_TRANSIT_N",
          message_short: "N мимо УЗО",
          message_full: `Ноль нагрузки «${m.label}» подключён напрямую к шине N, минуя «${r.label}». УЗО должно коммутировать оба провода: и фазу, и ноль — иначе ток утечки не будет обнаружен.`,
          related_components: [m.id, r.id],
        });
      }
    }
  }

  return diags;
}
