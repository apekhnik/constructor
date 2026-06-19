// Re-export of the pure simulation tick. The old stub returned an empty
// result — Stage 4 replaces it with the real engine in model/simulation.ts.

export { simulate, type TickResult, type ModuleRuntime } from "../model/simulation";
