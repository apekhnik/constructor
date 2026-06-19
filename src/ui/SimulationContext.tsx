import { createContext, useContext, type ReactNode } from "react";
import { useSimulation, type EngineSnapshot } from "../engine/runtime";
import { useScheme } from "./SchemeContext";

const SimulationContext = createContext<EngineSnapshot | null>(null);

export function SimulationProvider({ children }: { children: ReactNode }) {
  const { scheme, dispatch } = useScheme();
  const snapshot = useSimulation(scheme, dispatch);
  return (
    <SimulationContext.Provider value={snapshot}>
      {children}
    </SimulationContext.Provider>
  );
}

export function useEngineSnapshot(): EngineSnapshot {
  const v = useContext(SimulationContext);
  if (!v) throw new Error("useEngineSnapshot must be used inside SimulationProvider");
  return v;
}
