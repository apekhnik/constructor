// Engine tick stub. Real implementation lands in Stage 4 (CLAUDE.md §2.5-2.6).
// Kept here so the UI can already import from this boundary.

import type { DiagnosticMessage, Scheme } from "../model/types";

export interface TickResult {
  scheme: Scheme;
  diagnostics: DiagnosticMessage[];
}

export function tick(scheme: Scheme): TickResult {
  return { scheme, diagnostics: [] };
}
