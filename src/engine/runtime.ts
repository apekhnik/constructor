// React hook that drives the simulation engine (CLAUDE.md §3.1 engine layer).
// Re-runs the pure tick on every Scheme change, applies instantaneous trips
// immediately, and starts/cancels timers for delayed trips (thermal,
// undervoltage) and auto-reclose (APV) of the voltage relay.

import { useEffect, useMemo, useRef } from "react";
import type { Scheme, SchemeAction } from "../model/scheme";
import { simulate, type ModuleRuntime } from "../model/simulation";
import type { DiagnosticMessage, TripReason } from "../model/types";

const RECLOSE_DELAY_MS = 5_000;

interface PendingTimer {
  reason: TripReason;
  deadline_ms: number;
  handle: ReturnType<typeof setTimeout>;
}

export interface EngineSnapshot {
  runtime: Record<string, ModuleRuntime>;
  diagnostics: DiagnosticMessage[];
}

export function useSimulation(
  scheme: Scheme,
  dispatch: (a: SchemeAction) => void,
): EngineSnapshot {
  const tick = useMemo(() => simulate(scheme), [scheme]);

  // Timer registries are kept in refs because they outlive any single render.
  const tripTimers = useRef<Map<string, PendingTimer>>(new Map());
  const recloseTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  // Apply instant trips this tick. Done in an effect (not during render) to
  // keep the simulation pure.
  useEffect(() => {
    for (const t of tick.newTrips) {
      dispatch({ type: "set_trip", id: t.id, reason: t.reason });
    }
  }, [tick.newTrips, dispatch]);

  // Pending (delayed) trips: start a timer per module if not already pending
  // with the same reason; cancel timers whose condition disappeared.
  useEffect(() => {
    const wantedByModule = new Map<string, { reason: TripReason; delay_ms: number }>();
    for (const m of scheme.modules) {
      const rt = tick.runtime[m.id];
      if (rt?.trip_pending && m.on && !m.tripped) {
        wantedByModule.set(m.id, rt.trip_pending);
      }
    }
    // Cancel obsolete timers.
    for (const [id, timer] of tripTimers.current) {
      const w = wantedByModule.get(id);
      if (!w || w.reason !== timer.reason) {
        clearTimeout(timer.handle);
        tripTimers.current.delete(id);
      }
    }
    // Start new timers.
    for (const [id, w] of wantedByModule) {
      if (tripTimers.current.has(id)) continue;
      const handle = setTimeout(() => {
        tripTimers.current.delete(id);
        dispatch({ type: "set_trip", id, reason: w.reason });
      }, w.delay_ms);
      tripTimers.current.set(id, {
        reason: w.reason,
        deadline_ms: Date.now() + w.delay_ms,
        handle,
      });
    }
  }, [scheme.modules, tick.runtime, dispatch]);

  // Auto-reclose (APV) for voltage relays whose grid voltage has returned
  // to the safe band (CLAUDE.md §2.5).
  useEffect(() => {
    for (const m of scheme.modules) {
      if (m.kind !== "voltage_relay") continue;
      const safe =
        scheme.source.grid_active &&
        scheme.source.grid_voltage_V >= (m.u_min_V ?? 180) &&
        scheme.source.grid_voltage_V <= (m.u_max_V ?? 250);
      const should =
        m.tripped &&
        (m.trip_reason === "overvoltage" || m.trip_reason === "undervoltage") &&
        safe;
      if (should && !recloseTimers.current.has(m.id)) {
        const h = setTimeout(() => {
          recloseTimers.current.delete(m.id);
          dispatch({ type: "reset_trip", id: m.id });
        }, RECLOSE_DELAY_MS);
        recloseTimers.current.set(m.id, h);
      }
      if (!should && recloseTimers.current.has(m.id)) {
        clearTimeout(recloseTimers.current.get(m.id)!);
        recloseTimers.current.delete(m.id);
      }
    }
  }, [scheme.modules, scheme.source, dispatch]);

  // Cleanup on unmount.
  useEffect(() => {
    const trips = tripTimers.current;
    const recloses = recloseTimers.current;
    return () => {
      for (const t of trips.values()) clearTimeout(t.handle);
      trips.clear();
      for (const h of recloses.values()) clearTimeout(h);
      recloses.clear();
    };
  }, []);

  return useMemo(
    () => ({ runtime: tick.runtime, diagnostics: tick.diagnostics }),
    [tick],
  );
}
