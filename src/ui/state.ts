// Cross-component view types that don't belong to the model layer yet.
// Mockup presets removed — layout now lives in SchemeContext.

export interface LogEntry {
  severity: "info" | "warning" | "error";
  code: string;
  text: string;
  componentId?: string;
}
