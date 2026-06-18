// Discriminated payloads carried by @dnd-kit draggables/droppables.
// Kept in one place so onDragEnd and overlay rendering can reason about them.

import type { CatalogEntry } from "../model/catalog";

export type DraggableData =
  | { source: "palette"; entry: CatalogEntry }
  | { source: "rail"; moduleId: string };

export type DroppableData = { rail: number; slot: number };

export const isPaletteDrag = (
  d: DraggableData | null | undefined,
): d is { source: "palette"; entry: CatalogEntry } =>
  !!d && d.source === "palette";

export const isRailDrag = (
  d: DraggableData | null | undefined,
): d is { source: "rail"; moduleId: string } => !!d && d.source === "rail";
