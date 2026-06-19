import { useState, type CSSProperties, type ReactNode } from "react";
import { useDraggable, useDroppable, useDndMonitor } from "@dnd-kit/core";
import { DinModule } from "./DinModule";
import { useScheme } from "./SchemeContext";
import { useEngineSnapshot } from "./SimulationContext";
import { isPaletteDrag, isRailDrag, type DraggableData } from "./dnd";
import { terminalsFor } from "../model/terminals";
import {
  BUSES,
  BUS_TAP_COUNT,
  BUS_THICKNESS_REM,
  BUS_ZONE_HEIGHT_REM,
  BUS_ZONE_Y_REM,
  LAYOUT_HEIGHT_REM,
  LAYOUT_WIDTH_REM,
  LOAD_HEIGHT_REM,
  LOAD_MODULE_HEIGHT_REM,
  LOAD_TOP_DANGLE_REM,
  LOAD_ZONE_Y_REM,
  MODULE_HEIGHT_REM,
  RAIL_HEIGHT_REM,
  RAIL_TOP_DANGLE_REM,
  RAIL_1_Y_REM,
  RAIL_2_Y_REM,
  SLOT_WIDTH_REM,
  SUPPLY_HEIGHT_REM,
  SUPPLY_MODULE_HEIGHT_REM,
  SUPPLY_TOP_DANGLE_REM,
  SUPPLY_ZONE_Y_REM,
  busTapPosition,
  busY,
  manhattanPath,
  moduleWidthRem,
  moduleX,
  remToPx,
  terminalPosition,
  type BusName,
} from "../model/layout";
import {
  LOAD_RAIL_INDEX,
  LOAD_SLOTS,
  RAIL_COUNT,
  SLOTS_PER_RAIL,
  canConnect,
  endpointKey,
  placementRailsFor,
  type Endpoint,
  type PlacedModule,
  type Scheme,
  type Wire,
} from "../model/scheme";
import type { ComponentKind } from "../model/types";

const RAIL_TITLES = ["ВВОД И ЗАЩИТА", "ОТХОДЯЩИЕ ЛИНИИ"];

const CONDUCTOR_STROKE: Record<"L" | "N" | "PE", string> = {
  L: "#c45a36",
  N: "#3a85d6",
  PE: "#d9b537",
};

const CONDUCTOR_DOT: Record<"L" | "N" | "PE", string> = {
  L: "#e07a4f",
  N: "#5fa3e8",
  PE: "#e6c34a",
};

// ----------------------- Drag info -----------------------

interface DragInfo {
  kind: ComponentKind;
  poles: 1 | 2;
  ignoreId?: string;
}

function dragInfo(
  drag: DraggableData | null,
  scheme: Scheme,
): DragInfo | null {
  if (!drag) return null;
  if (isPaletteDrag(drag)) {
    return {
      kind: drag.entry.kind,
      poles: (drag.entry.poles ?? 1) as 1 | 2,
    };
  }
  if (isRailDrag(drag)) {
    const m = scheme.modules.find((x) => x.id === drag.moduleId);
    if (!m) return null;
    return { kind: m.kind, poles: m.poles, ignoreId: m.id };
  }
  return null;
}

// ----------------------- DnD slot (empty drop target) -----------------------

interface SlotProps {
  rail: number;
  slot: number;
  highlight: "ok" | "bad" | null;
  height: number;
  topOffset: number;
}

function Slot({ rail, slot, highlight, height, topOffset }: SlotProps) {
  const { setNodeRef } = useDroppable({
    id: `slot-${rail}-${slot}`,
    data: { rail, slot },
  });
  const cls =
    highlight === "ok"
      ? "border-bp-cyan bg-bp-cyan/15"
      : highlight === "bad"
        ? "border-bp-err bg-bp-err/15"
        : "border-bp-line/50 bg-transparent";
  return (
    <div
      ref={setNodeRef}
      className={`absolute border border-dashed transition-colors ${cls}`}
      style={{
        left: `${moduleX(slot)}rem`,
        top: `${topOffset}rem`,
        width: `${SLOT_WIDTH_REM}rem`,
        height: `${height}rem`,
      }}
      aria-label={`Свободный слот ряда ${rail}, позиция ${slot + 1}`}
    />
  );
}

// ----------------------- Slot collection helpers -----------------------

interface ZoneSlotsArgs {
  rail: number;
  modules: PlacedModule[];
  slotCount: number;
  drag: DragInfo | null;
  height: number;
  topOffset: number;
}

function renderZoneSlots({
  rail,
  modules,
  slotCount,
  drag,
  height,
  topOffset,
}: ZoneSlotsArgs): ReactNode[] {
  const occupiedBy = new Map<number, PlacedModule>();
  for (const m of modules) {
    for (let i = 0; i < m.poles; i++) occupiedBy.set(m.slot + i, m);
  }

  const zoneAccepts = drag
    ? placementRailsFor(drag.kind).includes(rail)
    : false;

  const cells: ReactNode[] = [];
  for (let s = 0; s < slotCount; s++) {
    if (occupiedBy.has(s)) continue;
    let highlight: "ok" | "bad" | null = null;
    if (drag && zoneAccepts) {
      const fits = s + drag.poles <= slotCount;
      const free =
        fits &&
        Array.from({ length: drag.poles }).every((_, i) => {
          const m = occupiedBy.get(s + i);
          return !m || m.id === drag.ignoreId;
        });
      highlight = free ? "ok" : "bad";
    }
    cells.push(
      <Slot
        key={s}
        rail={rail}
        slot={s}
        highlight={highlight}
        height={height}
        topOffset={topOffset}
      />,
    );
  }
  return cells;
}

// ----------------------- Supply layer (built-in source) -----------------------

function SourceBox({ m }: { m: PlacedModule }) {
  const { scheme, dispatch } = useScheme();
  const selected = scheme.selectedId === m.id;
  const widthRem = moduleWidthRem(m.poles);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        dispatch({ type: "select", id: m.id });
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          dispatch({ type: "select", id: m.id });
        }
      }}
      className={`relative rounded-[3px] border-2 border-bp-cyan/70 bg-bp-surfaceTop outline-none transition-shadow ${
        selected ? "ring-2 ring-bp-cyan ring-offset-2 ring-offset-bp-bg" : ""
      }`}
      style={{
        width: `${widthRem}rem`,
        height: `${SUPPLY_MODULE_HEIGHT_REM}rem`,
      }}
      aria-label={m.label}
      aria-pressed={selected}
    >
      <div className="flex h-full flex-col items-center justify-center gap-[0.1rem]">
        <span className="font-mono text-[0.5rem] uppercase tracking-widest text-bp-cyan">
          СЕТЬ
        </span>
        <span className="font-mono text-[0.7rem] font-bold tracking-wider text-bp-text">
          {m.spec}
        </span>
      </div>
    </div>
  );
}

function SupplyLayer() {
  const { scheme } = useScheme();
  const source = scheme.modules.find((m) => m.kind === "source");
  return (
    <div
      className="absolute left-0 right-0"
      style={{
        top: `${SUPPLY_ZONE_Y_REM}rem`,
        height: `${SUPPLY_HEIGHT_REM}rem`,
      }}
    >
      <div className="absolute -top-[1.1rem] left-0 right-0 flex items-center justify-between px-[0.1rem]">
        <div className="font-mono text-[0.55rem] uppercase tracking-widest text-bp-cyan">
          ВВОД · ИСТОЧНИК ПИТАНИЯ
        </div>
        <div className="font-mono text-[0.55rem] uppercase tracking-widest text-bp-textDim">
          фиксированный
        </div>
      </div>
      {source && (
        <div
          className="absolute"
          style={{
            left: `${moduleX(source.slot)}rem`,
            top: `${SUPPLY_TOP_DANGLE_REM}rem`,
          }}
        >
          <SourceBox m={source} />
        </div>
      )}
    </div>
  );
}

// ----------------------- Load layer -----------------------

function LoadBox({ m }: { m: PlacedModule }) {
  const { scheme, dispatch } = useScheme();
  const { runtime } = useEngineSnapshot();
  const data: DraggableData = { source: "rail", moduleId: m.id };
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `module-${m.id}`,
    data,
  });
  const selected = scheme.selectedId === m.id;
  const widthRem = moduleWidthRem(m.poles);
  const rt = runtime[m.id];
  const lit = rt?.lit ?? false;
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        dispatch({ type: "select", id: m.id });
      }}
      onKeyDown={(e) => {
        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          dispatch({ type: "remove", id: m.id });
        }
      }}
      className={`relative cursor-grab rounded-[3px] border outline-none transition-shadow ${
        lit
          ? "border-bp-ok bg-bp-ok/15"
          : "border-bp-line bg-bp-surface"
      } ${
        selected ? "ring-2 ring-bp-cyan ring-offset-2 ring-offset-bp-bg" : ""
      } ${isDragging ? "opacity-30" : ""}`}
      style={{
        width: `${widthRem}rem`,
        height: `${LOAD_MODULE_HEIGHT_REM}rem`,
        boxShadow: lit ? "0 0 1rem rgba(80,220,140,.45)" : undefined,
      }}
      aria-label={m.label}
      aria-pressed={selected}
    >
      <div className="flex h-full flex-col items-center justify-center gap-[0.1rem]">
        <span className="font-mono text-[0.5rem] uppercase tracking-widest text-bp-textDim">
          {m.label}
        </span>
        <span className={`font-mono text-[0.7rem] font-bold ${lit ? "text-bp-ok" : "text-bp-text"}`}>
          {lit ? `${(rt?.voltage_in_V ?? 0).toFixed(0)} В` : `${m.rated_current_A ?? 0} A`}
        </span>
      </div>
    </div>
  );
}

interface LoadLayerProps {
  modules: PlacedModule[];
  drag: DragInfo | null;
}

function LoadLayer({ modules, drag }: LoadLayerProps) {
  const slots = renderZoneSlots({
    rail: LOAD_RAIL_INDEX,
    modules,
    slotCount: LOAD_SLOTS,
    drag,
    height: LOAD_MODULE_HEIGHT_REM,
    topOffset: LOAD_TOP_DANGLE_REM,
  });

  return (
    <div
      className="absolute left-0 right-0"
      style={{
        top: `${LOAD_ZONE_Y_REM}rem`,
        height: `${LOAD_HEIGHT_REM}rem`,
      }}
    >
      <div className="absolute -top-[1.1rem] left-0 right-0 flex items-center justify-between px-[0.1rem]">
        <div className="font-mono text-[0.55rem] uppercase tracking-widest text-bp-cyan">
          НАГРУЗКИ · ПОТРЕБИТЕЛИ
        </div>
        <div className="font-mono text-[0.55rem] uppercase tracking-widest text-bp-textDim">
          {LOAD_SLOTS} позиций
        </div>
      </div>

      {slots}

      {modules.map((m) => (
        <div
          key={m.id}
          className="absolute"
          style={{
            left: `${moduleX(m.slot)}rem`,
            top: `${LOAD_TOP_DANGLE_REM}rem`,
          }}
        >
          <LoadBox m={m} />
        </div>
      ))}
    </div>
  );
}

// ----------------------- Rail section -----------------------

interface RailLayerProps {
  rail: number;
  y: number;
  title: string;
  modules: PlacedModule[];
  drag: DragInfo | null;
}

function RailLayer({ rail, y, title, modules, drag }: RailLayerProps) {
  const slots = renderZoneSlots({
    rail,
    modules,
    slotCount: SLOTS_PER_RAIL,
    drag,
    height: MODULE_HEIGHT_REM,
    topOffset: RAIL_TOP_DANGLE_REM,
  });

  return (
    <div
      className="absolute left-0 right-0"
      style={{ top: `${y}rem`, height: `${RAIL_HEIGHT_REM}rem` }}
    >
      <div className="absolute -top-[1.1rem] left-0 right-0 flex items-center justify-between px-[0.1rem]">
        <div className="font-mono text-[0.55rem] uppercase tracking-widest text-bp-cyan">
          РЯД {rail} · {title}
        </div>
        <div className="font-mono text-[0.55rem] uppercase tracking-widest text-bp-textDim">
          DIN 35 · {SLOTS_PER_RAIL} мод
        </div>
      </div>

      {/* metallic DIN rail bar behind modules */}
      <div
        className="absolute left-0 right-0"
        style={{
          top: `${RAIL_TOP_DANGLE_REM + 0.3}rem`,
          height: "0.85rem",
          background:
            "linear-gradient(180deg,#9a9384 0%,#6a6356 50%,#9a9384 100%)",
          border: "1px solid rgba(0,0,0,.5)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,.25),0 1px 2px rgba(0,0,0,.4)",
        }}
        aria-hidden
      />

      {slots}

      {modules.map((m) => (
        <div
          key={m.id}
          className="absolute"
          style={{
            left: `${moduleX(m.slot)}rem`,
            top: `${RAIL_TOP_DANGLE_REM}rem`,
          }}
        >
          <DinModule m={m} />
        </div>
      ))}
    </div>
  );
}

// ----------------------- Bus zone -----------------------

function BusZoneLayer() {
  return (
    <div
      className="absolute left-0 right-0 border border-bp-line bg-bp-surface/50"
      style={{
        top: `${BUS_ZONE_Y_REM}rem`,
        height: `${BUS_ZONE_HEIGHT_REM}rem`,
      }}
    >
      {BUSES.map((bus) => {
        const top = busY(bus) - BUS_ZONE_Y_REM;
        const baseStyle: CSSProperties = {
          top: `${top}rem`,
          height: `${BUS_THICKNESS_REM}rem`,
          left: "0.25rem",
          right: "0.25rem",
        };
        const colorBg =
          bus === "L" ? "bg-wire-L" : bus === "N" ? "bg-wire-N" : "";
        const peStripes =
          bus === "PE"
            ? {
                backgroundImage:
                  "repeating-linear-gradient(135deg,#d9b537 0 0.45rem,#2a7a3a 0.45rem 0.9rem)",
              }
            : {};
        return (
          <div
            key={bus}
            className={`absolute rounded-[1px] ${colorBg}`}
            style={{
              ...baseStyle,
              ...peStripes,
              boxShadow:
                "inset 0 1px 0 rgba(255,255,255,.18), inset 0 -1px 0 rgba(0,0,0,.35)",
            }}
            aria-label={`Шина ${bus}`}
          />
        );
      })}
    </div>
  );
}

// ----------------------- Wiring SVG layer -----------------------

const DOT_RADIUS = 5;

type DotState = "idle" | "pending" | "valid" | "invalid" | "occupied";

interface WireDotProps {
  cx: number;
  cy: number;
  conductor: "L" | "N" | "PE";
  state: DotState;
  onClick: () => void;
  label: string;
}

function WireDot({ cx, cy, conductor, state, onClick, label }: WireDotProps) {
  const baseFill = CONDUCTOR_DOT[conductor];
  const fill = state === "invalid" ? "#3a4555" : baseFill;
  const stroke =
    state === "pending"
      ? "#ffffff"
      : state === "valid"
        ? "#5dd5ff"
        : state === "invalid"
          ? "#2a3340"
          : "#0a1925";
  const opacity = state === "invalid" ? 0.35 : 1;
  const ringVisible = state === "pending" || state === "valid";
  return (
    <g style={{ pointerEvents: "all", cursor: "pointer" }}>
      {ringVisible && (
        <circle cx={cx} cy={cy} r={DOT_RADIUS + 3} fill="#5dd5ff" opacity={0.25} />
      )}
      <circle
        cx={cx}
        cy={cy}
        r={DOT_RADIUS}
        fill={fill}
        stroke={stroke}
        strokeWidth={1.5}
        opacity={opacity}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        aria-label={label}
      >
        <title>{label}</title>
      </circle>
    </g>
  );
}

interface WirePathProps {
  wire: Wire;
  selected: boolean;
  onClick: () => void;
  positions: { from: { x: number; y: number }; to: { x: number; y: number } };
}

function WirePath({ wire, selected, onClick, positions }: WirePathProps) {
  const pts = manhattanPath(positions.from, positions.to);
  const pointsAttr = pts
    .map((p) => `${remToPx(p.x)},${remToPx(p.y)}`)
    .join(" ");
  const stroke = CONDUCTOR_STROKE[wire.conductor];
  return (
    <g style={{ pointerEvents: "stroke", cursor: "pointer" }}>
      <polyline
        points={pointsAttr}
        fill="none"
        stroke="transparent"
        strokeWidth={14}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      />
      <polyline
        points={pointsAttr}
        fill="none"
        stroke={stroke}
        strokeWidth={selected ? 4 : 2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ filter: selected ? "drop-shadow(0 0 4px #5dd5ff)" : undefined }}
        pointerEvents="none"
      />
    </g>
  );
}

interface WiringLayerProps {
  scheme: Scheme;
  onTerminalClick: (ep: Endpoint) => void;
  onWireClick: (id: string) => void;
}

function WiringLayer({
  scheme,
  onTerminalClick,
  onWireClick,
}: WiringLayerProps) {
  const W = remToPx(LAYOUT_WIDTH_REM);
  const H = remToPx(LAYOUT_HEIGHT_REM);

  const modulePos = new Map<string, { x: number; y: number }>();
  for (const m of scheme.modules) {
    for (const t of terminalsFor(m.kind)) {
      modulePos.set(`mod:${m.id}:${t.id}`, terminalPosition(m, t));
    }
  }
  const busPos = new Map<string, { x: number; y: number; bus: BusName }>();
  for (const b of BUSES) {
    for (let i = 0; i < BUS_TAP_COUNT; i++) {
      const p = busTapPosition(b, i);
      busPos.set(`bus:${b}:${i}`, { ...p, bus: b });
    }
  }
  const endpointPos = (ep: Endpoint): { x: number; y: number } | null => {
    if (ep.kind === "bus") return busPos.get(endpointKey(ep)) ?? null;
    return modulePos.get(endpointKey(ep)) ?? null;
  };

  const pending = scheme.pendingFrom;
  const pendingKey = pending ? endpointKey(pending) : null;

  const dotState = (ep: Endpoint): DotState => {
    const key = endpointKey(ep);
    if (pendingKey === key) return "pending";
    const occupied = scheme.wires.some(
      (w) => endpointKey(w.from) === key || endpointKey(w.to) === key,
    );
    if (!pending) return occupied ? "occupied" : "idle";
    const check = canConnect(scheme, pending, ep);
    return check.ok ? "valid" : "invalid";
  };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={`${LAYOUT_WIDTH_REM}rem`}
      height={`${LAYOUT_HEIGHT_REM}rem`}
      className="absolute left-0 top-0"
      style={{ pointerEvents: "none" }}
      aria-label="Слой проводов"
    >
      {/* wires under dots */}
      {scheme.wires.map((w) => {
        const a = endpointPos(w.from);
        const b = endpointPos(w.to);
        if (!a || !b) return null;
        return (
          <WirePath
            key={w.id}
            wire={w}
            selected={scheme.selectedWireId === w.id}
            positions={{ from: a, to: b }}
            onClick={() => onWireClick(w.id)}
          />
        );
      })}

      {/* module + fixture terminal dots */}
      {scheme.modules.flatMap((m) =>
        terminalsFor(m.kind).map((t) => {
          const ep: Endpoint = {
            kind: "module",
            moduleId: m.id,
            terminalId: t.id,
          };
          const pos = terminalPosition(m, t);
          return (
            <WireDot
              key={`${m.id}-${t.id}`}
              cx={remToPx(pos.x)}
              cy={remToPx(pos.y)}
              conductor={t.conductor}
              state={dotState(ep)}
              label={`${m.label} · ${t.id}`}
              onClick={() => onTerminalClick(ep)}
            />
          );
        }),
      )}

      {/* bus taps */}
      {BUSES.flatMap((bus) =>
        Array.from({ length: BUS_TAP_COUNT }, (_, i) => {
          const ep: Endpoint = { kind: "bus", bus, tapIndex: i };
          const pos = busTapPosition(bus, i);
          return (
            <WireDot
              key={`bus-${bus}-${i}`}
              cx={remToPx(pos.x)}
              cy={remToPx(pos.y)}
              conductor={bus}
              state={dotState(ep)}
              label={`Шина ${bus} · точка ${i + 1}`}
              onClick={() => onTerminalClick(ep)}
            />
          );
        }),
      )}
    </svg>
  );
}

// ----------------------- Workspace -----------------------

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

  const drag = dragInfo(activeDrag, scheme);

  const railsModules: PlacedModule[][] = Array.from(
    { length: RAIL_COUNT },
    (_, i) =>
      scheme.modules.filter((m) => m.rail === i + 1 && m.kind !== "source"),
  );
  const loadsModules = scheme.modules.filter(
    (m) => m.rail === LOAD_RAIL_INDEX,
  );

  const handleTerminalClick = (ep: Endpoint) => {
    const pending = scheme.pendingFrom;
    if (!pending) {
      dispatch({ type: "set_pending", ep });
      return;
    }
    if (endpointKey(pending) === endpointKey(ep)) {
      dispatch({ type: "set_pending", ep: null });
      return;
    }
    const check = canConnect(scheme, pending, ep);
    if (check.ok) {
      dispatch({ type: "add_wire", from: pending, to: ep });
    }
  };

  const handleWireClick = (id: string) => {
    dispatch({ type: "select_wire", id });
  };

  const handleBackgroundClick = () => {
    if (scheme.pendingFrom) {
      dispatch({ type: "set_pending", ep: null });
      return;
    }
    if (scheme.selectedId) dispatch({ type: "select", id: null });
    if (scheme.selectedWireId) dispatch({ type: "select_wire", id: null });
  };

  return (
    <section
      className="relative flex-1 overflow-auto border border-bp-line"
      style={{
        background:
          "linear-gradient(180deg,rgba(8,22,35,.7) 0%,rgba(12,28,42,.5) 100%)",
      }}
      onClick={handleBackgroundClick}
    >
      <div className="absolute inset-0 bg-grid-fine opacity-[.45]" aria-hidden />
      <div className="absolute inset-0 bg-grid-bold opacity-[.35]" aria-hidden />
      <div className="absolute inset-0 vignette" aria-hidden />

      <div className="relative flex flex-col p-[1.5rem]">
        <div className="mb-[1.25rem] flex items-center justify-between">
          <div className="font-mono text-[0.625rem] uppercase tracking-widest text-bp-textDim">
            // схема щита · {scheme.modules.length} мод · {scheme.wires.length} провод(а/ов)
          </div>
          <div className="font-mono text-[0.625rem] tracking-widest text-bp-textDim">
            {scheme.pendingFrom
              ? "выберите вторую клемму · Esc отменить"
              : "без питания · сборка"}
          </div>
        </div>

        <div
          className="relative mx-auto"
          style={{
            width: `${LAYOUT_WIDTH_REM}rem`,
            height: `${LAYOUT_HEIGHT_REM}rem`,
          }}
        >
          <SupplyLayer />
          <RailLayer
            rail={1}
            y={RAIL_1_Y_REM}
            title={RAIL_TITLES[0]}
            modules={railsModules[0]}
            drag={drag}
          />
          <BusZoneLayer />
          <RailLayer
            rail={2}
            y={RAIL_2_Y_REM}
            title={RAIL_TITLES[1]}
            modules={railsModules[1]}
            drag={drag}
          />
          <LoadLayer modules={loadsModules} drag={drag} />
          <WiringLayer
            scheme={scheme}
            onTerminalClick={handleTerminalClick}
            onWireClick={handleWireClick}
          />
        </div>
      </div>
    </section>
  );
}
