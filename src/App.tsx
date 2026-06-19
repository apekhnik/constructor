import { useEffect, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Palette } from "./ui/Palette";
import { Workspace } from "./ui/Workspace";
import { LogPanel } from "./ui/LogPanel";
import { TestPanel } from "./ui/TestPanel";
import { Inspector } from "./ui/Inspector";
import { DinModule } from "./ui/DinModule";
import { SchemeProvider, useScheme } from "./ui/SchemeContext";
import { isPaletteDrag, isRailDrag, type DraggableData } from "./ui/dnd";
import {
  canPlace,
  makePlacedFromCatalog,
  type PlacedModule,
} from "./model/scheme";

function Header({ moduleCount }: { moduleCount: number }) {
  return (
    <header className="flex h-[3.5rem] shrink-0 items-center gap-[1.5rem] border-b border-bp-line bg-bp-surfaceTop px-[1.5rem] backdrop-blur">
      <div className="flex items-center gap-[0.75rem]">
        <div className="flex h-[1.375rem] w-[1.375rem] items-center justify-center rounded-[3px] border-[1.5px] border-bp-cyan font-mono text-[0.65rem] font-bold text-bp-cyan">
          ⏚
        </div>
        <span className="font-display text-[0.95rem] font-semibold tracking-tight text-bp-text">
          ЩИТ
        </span>
        <span className="font-mono text-[0.65rem] text-bp-textDim">
          / проект-04 · режим сборки
        </span>
      </div>

      <div
        className="ml-auto flex items-center gap-[0.5rem] border border-bp-line px-[0.75rem] py-[0.35rem] text-bp-textDim"
        role="status"
      >
        <span className="h-[0.5rem] w-[0.5rem] rounded-full bg-bp-textMuted" />
        <span className="font-mono text-[0.65rem] font-semibold tracking-widest">
          СБОРКА · {moduleCount} МОД
        </span>
      </div>

      <div className="flex gap-[0.35rem] font-mono text-[0.55rem] uppercase tracking-widest text-bp-textDim">
        <span className="border border-bp-line px-[0.55rem] py-[0.35rem]">
          Сохранить
        </span>
        <span className="border border-bp-line px-[0.55rem] py-[0.35rem]">
          Экспорт
        </span>
      </div>
    </header>
  );
}

function Shell() {
  const { scheme, dispatch } = useScheme();
  const [overlayDrag, setOverlayDrag] = useState<DraggableData | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor),
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const inField = tag === "INPUT" || tag === "TEXTAREA";

      if (e.key === "Delete" || e.key === "Backspace") {
        if (inField) return;
        if (scheme.selectedWireId) {
          e.preventDefault();
          dispatch({ type: "remove_wire", id: scheme.selectedWireId });
          return;
        }
        if (scheme.selectedId) {
          e.preventDefault();
          dispatch({ type: "remove", id: scheme.selectedId });
        }
        return;
      }

      if (e.key === "Escape") {
        if (scheme.pendingFrom) {
          dispatch({ type: "set_pending", ep: null });
          return;
        }
        if (scheme.selectedWireId) {
          dispatch({ type: "select_wire", id: null });
          return;
        }
        if (scheme.selectedId) {
          dispatch({ type: "select", id: null });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    scheme.selectedId,
    scheme.selectedWireId,
    scheme.pendingFrom,
    dispatch,
  ]);

  const handleDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as DraggableData | undefined;
    setOverlayDrag(data ?? null);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setOverlayDrag(null);
    const data = e.active.data.current as DraggableData | undefined;
    const over = e.over;
    if (!data || !over) return;
    const drop = over.data.current as
      | { rail: number; slot: number }
      | undefined;
    if (!drop) return;

    if (isPaletteDrag(data)) {
      const poles = (data.entry.poles ?? 1) as 1 | 2;
      if (!canPlace(scheme, poles, drop.rail, drop.slot)) return;
      dispatch({
        type: "place",
        entry: data.entry,
        rail: drop.rail,
        slot: drop.slot,
      });
    } else if (isRailDrag(data)) {
      const m = scheme.modules.find((x) => x.id === data.moduleId);
      if (!m) return;
      if (!canPlace(scheme, m.poles, drop.rail, drop.slot, m.id)) return;
      dispatch({
        type: "move",
        id: data.moduleId,
        rail: drop.rail,
        slot: drop.slot,
      });
    }
  };

  // Ghost preview for the overlay.
  const overlayNode = (() => {
    if (!overlayDrag) return null;
    if (isPaletteDrag(overlayDrag)) {
      const phantom: PlacedModule = makePlacedFromCatalog(
        overlayDrag.entry,
        1,
        0,
      );
      return <DinModule m={phantom} overlay />;
    }
    if (isRailDrag(overlayDrag)) {
      const m = scheme.modules.find((x) => x.id === overlayDrag.moduleId);
      return m ? <DinModule m={m} overlay /> : null;
    }
    return null;
  })();

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setOverlayDrag(null)}
    >
      <div className="flex h-screen w-screen flex-col">
        <Header moduleCount={scheme.modules.length} />

        <div className="relative flex flex-1 overflow-hidden">
          <Palette />
          <main className="relative flex flex-1 flex-col overflow-hidden">
            <div className="flex flex-1 px-[1.5rem] py-[1.25rem]">
              <Workspace />
            </div>
            <TestPanel />
          </main>
          <aside className="flex h-full w-[20rem] shrink-0 flex-col border-l border-bp-line bg-bp-surfaceTransparent">
            <Inspector />
            <LogPanel entries={[]} />
          </aside>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>{overlayNode}</DragOverlay>
    </DndContext>
  );
}

export default function App() {
  return (
    <SchemeProvider>
      <Shell />
    </SchemeProvider>
  );
}
