import { useState, type ReactNode } from "react";
import { useDroppable, useDndMonitor } from "@dnd-kit/core";
import { DinModule, SLOT_WIDTH_REM } from "./DinModule";
import { useScheme } from "./SchemeContext";
import { isPaletteDrag, isRailDrag, type DraggableData } from "./dnd";
import {
  canPlace,
  moduleWidth,
  RAIL_COUNT,
  SLOTS_PER_RAIL,
  type PlacedModule,
  type Scheme,
} from "../model/scheme";

const RAIL_TITLES = ["ВВОД И ЗАЩИТА", "ОТХОДЯЩИЕ ЛИНИИ"];

function RailHeader({ index, title }: { index: number; title: string }) {
  return (
    <div className="mb-[0.5rem] flex items-center justify-between">
      <div className="font-mono text-[0.55rem] uppercase tracking-widest text-bp-cyan">
        РЯД {index} · {title}
      </div>
      <div className="font-mono text-[0.55rem] uppercase tracking-widest text-bp-textDim">
        DIN 35 · {SLOTS_PER_RAIL} мод
      </div>
    </div>
  );
}

function BusBar({ kind, label }: { kind: "L" | "N" | "PE"; label: string }) {
  const stripe =
    kind === "L" ? "bg-wire-L" : kind === "N" ? "bg-wire-N" : "pe-stripes";
  return (
    <div className="flex items-center gap-[0.5rem]">
      <div className="w-[1.25rem] font-mono text-[0.55rem] font-bold uppercase tracking-widest text-bp-textDim">
        {kind}
      </div>
      <div
        className={`h-[0.35rem] flex-1 rounded-[1px] ${stripe}`}
        aria-label={label}
      />
    </div>
  );
}

function dragPoles(drag: DraggableData | null, scheme: Scheme): 1 | 2 | null {
  if (!drag) return null;
  if (isPaletteDrag(drag)) return (drag.entry.poles ?? 1) as 1 | 2;
  if (isRailDrag(drag)) {
    const m = scheme.modules.find((x) => x.id === drag.moduleId);
    return m?.poles ?? null;
  }
  return null;
}

interface SlotProps {
  rail: number;
  slot: number;
  highlight: "ok" | "bad" | null;
}

function Slot({ rail, slot, highlight }: SlotProps) {
  const { setNodeRef } = useDroppable({
    id: `slot-${rail}-${slot}`,
    data: { rail, slot },
  });

  return (
    <div
      ref={setNodeRef}
      data-rail={rail}
      data-slot={slot}
      className={`relative h-[8.5rem] shrink-0 border border-dashed transition-colors ${
        highlight === "ok"
          ? "border-bp-cyan bg-bp-cyan/15"
          : highlight === "bad"
            ? "border-bp-err bg-bp-err/15"
            : "border-bp-line/60 bg-transparent"
      }`}
      style={{ width: `${SLOT_WIDTH_REM}rem` }}
      aria-label={`Свободный слот ${rail}-${slot + 1}`}
    />
  );
}

interface RailProps {
  index: number;
  modules: PlacedModule[];
  activeDrag: DraggableData | null;
  scheme: Scheme;
}

function Rail({ index, modules, activeDrag, scheme }: RailProps) {
  const poles = dragPoles(activeDrag, scheme);
  const ignoreId = isRailDrag(activeDrag) ? activeDrag.moduleId : undefined;

  const occupiedBy = new Map<number, PlacedModule>();
  for (const m of modules) {
    for (let i = 0; i < moduleWidth(m.poles); i++) {
      occupiedBy.set(m.slot + i, m);
    }
  }

  const cells: ReactNode[] = [];
  for (let s = 0; s < SLOTS_PER_RAIL; s++) {
    const m = occupiedBy.get(s);
    if (m) {
      if (m.slot === s) cells.push(<DinModule key={m.id} m={m} />);
      continue;
    }
    let highlight: "ok" | "bad" | null = null;
    if (poles !== null) {
      // Show subtle ok hint on every fitting slot to make valid drop zones visible.
      highlight = canPlace(scheme, poles, index, s, ignoreId) ? "ok" : "bad";
    }
    cells.push(
      <Slot key={`s-${s}`} rail={index} slot={s} highlight={highlight} />,
    );
  }

  return (
    <div className="relative">
      <div
        className="absolute left-0 right-0 top-[0.65rem] h-[0.85rem]"
        style={{
          background:
            "linear-gradient(180deg,#9a9384 0%,#6a6356 50%,#9a9384 100%)",
          border: "1px solid rgba(0,0,0,.5)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,.25),0 1px 2px rgba(0,0,0,.4)",
        }}
        aria-hidden
      />
      <div className="relative flex gap-[0.25rem] pt-[0.4rem]">{cells}</div>
    </div>
  );
}

export function Workspace() {
  const { scheme, dispatch } = useScheme();
  const [activeDrag, setActiveDrag] = useState<DraggableData | null>(null);

  useDndMonitor({
    onDragStart: (e) => {
      const data = e.active.data.current as DraggableData | undefined;
      setActiveDrag(data ?? null);
    },
    onDragCancel: () => setActiveDrag(null),
    onDragEnd: () => setActiveDrag(null),
  });

  const railsModules: PlacedModule[][] = Array.from(
    { length: RAIL_COUNT },
    (_, i) => scheme.modules.filter((m) => m.rail === i + 1),
  );

  return (
    <section
      className="relative flex-1 overflow-hidden border border-bp-line"
      style={{
        background:
          "linear-gradient(180deg,rgba(8,22,35,.7) 0%,rgba(12,28,42,.5) 100%)",
      }}
      onClick={() => dispatch({ type: "select", id: null })}
    >
      <div className="absolute inset-0 bg-grid-fine opacity-[.45]" aria-hidden />
      <div className="absolute inset-0 bg-grid-bold opacity-[.35]" aria-hidden />
      <div className="absolute inset-0 vignette" aria-hidden />

      <div className="relative flex h-full flex-col gap-[1.5rem] p-[1.5rem]">
        <div className="flex items-center justify-between">
          <div className="font-mono text-[0.625rem] uppercase tracking-widest text-bp-textDim">
            // схема щита · {RAIL_COUNT} ряда DIN · {scheme.modules.length}{" "}
            модулей
          </div>
          <div className="font-mono text-[0.625rem] tracking-widest text-bp-textDim">
            без питания · сборка
          </div>
        </div>

        {railsModules.map((mods, i) => {
          const railIndex = i + 1;
          return (
            <div key={railIndex}>
              <RailHeader index={railIndex} title={RAIL_TITLES[i] ?? "РЯД"} />
              <Rail
                index={railIndex}
                modules={mods}
                activeDrag={activeDrag}
                scheme={scheme}
              />
            </div>
          );
        })}

        <div className="mt-auto flex flex-col gap-[0.35rem] rounded-[1px] border border-bp-line bg-bp-surface/60 p-[0.6rem]">
          <BusBar kind="L" label="Фазная шина" />
          <BusBar kind="N" label="Нулевая шина" />
          <BusBar kind="PE" label="Шина заземления" />
        </div>
      </div>
    </section>
  );
}
