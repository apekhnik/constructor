import { useMemo, useRef, useState, type ReactNode } from "react";
import { useElementSize } from "./useElementSize";
import { useDraggable, useDroppable, useDndMonitor } from "@dnd-kit/core";
import { DinModule } from "./DinModule";
import { useScheme } from "./SchemeContext";
import { useEngineSnapshot } from "./SimulationContext";
import { isPaletteDrag, isRailDrag, type DraggableData } from "./dnd";
import { terminalsFor } from "../model/terminals";
import {
  BUSES,
  PANEL_LEFT_PAD_REM,
  LOAD_COLUMN_TOP_DANGLE_REM,
  LOAD_COLUMN_WIDTH_REM,
  LOAD_MODULE_HEIGHT_REM,
  LOAD_ROW_PITCH_REM,
  MODULE_HEIGHT_REM,
  RAIL_HEIGHT_REM,
  RAIL_TOP_DANGLE_REM,
  RAIL_1_Y_REM,
  RAIL_2_Y_REM,
  REM_TO_PX,
  SLOT_WIDTH_REM,
  SUPPLY_HEIGHT_REM,
  SUPPLY_MODULE_HEIGHT_REM,
  SUPPLY_TOP_DANGLE_REM,
  SUPPLY_ZONE_Y_REM,
  busTapCount,
  busTapPosition,
  getLayout,
  manhattanPath,
  moduleRect,
  moduleWidthRem,
  moduleX,
  remToPx,
  terminalPosition,
  type BusName,
  type Layout,
  type ModuleRect,
} from "../model/layout";
import {
  LOAD_RAIL_INDEX,
  canConnect,
  endpointKey,
  placementRailsFor,
  railCount,
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

// Vertical drop slot used by the load column.
interface LoadSlotProps {
  slot: number;
  topOffset: number;
  highlight: "ok" | "bad" | null;
}

function LoadSlot({ slot, topOffset, highlight }: LoadSlotProps) {
  const { setNodeRef } = useDroppable({
    id: `slot-${LOAD_RAIL_INDEX}-${slot}`,
    data: { rail: LOAD_RAIL_INDEX, slot },
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
        left: 0,
        top: `${topOffset}rem`,
        width: `${LOAD_COLUMN_WIDTH_REM}rem`,
        height: `${LOAD_MODULE_HEIGHT_REM}rem`,
      }}
      aria-label={`Свободная позиция нагрузки ${slot + 1}`}
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
  mode: Scheme["panelMode"];
}

function renderZoneSlots({
  rail,
  modules,
  slotCount,
  drag,
  height,
  topOffset,
  mode,
}: ZoneSlotsArgs): ReactNode[] {
  const occupiedBy = new Map<number, PlacedModule>();
  for (const m of modules) {
    for (let i = 0; i < m.poles; i++) occupiedBy.set(m.slot + i, m);
  }

  const zoneAccepts = drag
    ? placementRailsFor(drag.kind, mode).includes(rail)
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

function SupplyLayer({ layout }: { layout: Layout }) {
  const { scheme } = useScheme();
  const source = scheme.modules.find((m) => m.kind === "source");
  return (
    <div
      className="absolute"
      style={{
        left: 0,
        top: `${SUPPLY_ZONE_Y_REM}rem`,
        width: `${layout.layoutWidthRem}rem`,
        height: `${SUPPLY_HEIGHT_REM}rem`,
      }}
    >
      <div
        className="absolute -top-[1.1rem] flex items-center justify-between px-[0.1rem]"
        style={{
          left: `${PANEL_LEFT_PAD_REM}rem`,
          width: `${layout.panelWidthRem}rem`,
        }}
      >
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

function Bulb({ lit }: { lit: boolean }) {
  const glow = "#ffd86b";
  const filamentOn = "#ff6a18";
  return (
    <svg
      viewBox="0 0 40 64"
      className="h-[2.3rem] w-[1.5rem] shrink-0"
      aria-hidden
    >
      <defs>
        <radialGradient id="bulb-glass-on" cx="0.38" cy="0.32" r="0.85">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="35%" stopColor="#fff2a8" />
          <stop offset="75%" stopColor="#f0a52a" />
          <stop offset="100%" stopColor="#a66a18" />
        </radialGradient>
        <radialGradient id="bulb-halo" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor={glow} stopOpacity="0.55" />
          <stop offset="55%" stopColor={glow} stopOpacity="0.18" />
          <stop offset="100%" stopColor={glow} stopOpacity="0" />
        </radialGradient>
      </defs>

      {lit && (
        <>
          <circle cx="20" cy="22" r="26" fill="url(#bulb-halo)" />
          {Array.from({ length: 8 }).map((_, i) => {
            const a = (i * Math.PI * 2) / 8 - Math.PI / 8;
            const x1 = 20 + Math.cos(a) * 19;
            const y1 = 22 + Math.sin(a) * 19;
            const x2 = 20 + Math.cos(a) * 27;
            const y2 = 22 + Math.sin(a) * 27;
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={glow}
                strokeWidth="1.6"
                strokeLinecap="round"
                opacity="0.85"
              />
            );
          })}
        </>
      )}

      {/* glass bulb silhouette */}
      <path
        d="M 9 22 Q 9 5 20 5 Q 31 5 31 22 Q 31 31 25 37 L 25 42 L 15 42 L 15 37 Q 9 31 9 22 Z"
        fill={lit ? "url(#bulb-glass-on)" : "#1a2530"}
        stroke={lit ? "#c08a22" : "#3a4555"}
        strokeWidth="1"
      />

      {/* filament */}
      <path
        d="M 15 24 Q 17 30 20 24 Q 23 30 25 24"
        fill="none"
        stroke={lit ? filamentOn : "#5a6373"}
        strokeWidth={lit ? "1.4" : "1"}
        strokeLinecap="round"
        style={lit ? { filter: `drop-shadow(0 0 1.5px ${filamentOn})` } : undefined}
      />
      {/* filament supports */}
      <line x1="15" y1="24" x2="14" y2="34" stroke="#3a3530" strokeWidth="0.6" />
      <line x1="25" y1="24" x2="26" y2="34" stroke="#3a3530" strokeWidth="0.6" />

      {/* E27 screw base */}
      <rect x="15" y="42" width="10" height="3" fill="#9a9384" />
      <rect x="15" y="42" width="10" height="3" fill="url(#bulb-halo)" opacity="0" />
      <path d="M 15 45 L 25 45 L 24.5 47.5 L 15.5 47.5 Z" fill="#7a7368" />
      <path d="M 15.5 47.5 L 24.5 47.5 L 24 50 L 16 50 Z" fill="#9a9384" />
      <path d="M 16 50 L 24 50 L 23.5 52.5 L 16.5 52.5 Z" fill="#7a7368" />
      <path d="M 16.5 52.5 L 23.5 52.5 L 23 55 L 17 55 Z" fill="#5a544a" />
      {/* tip */}
      <polygon points="18,55 22,55 21,58 19,58" fill="#1a1612" />
    </svg>
  );
}

interface LoadBoxProps {
  m: PlacedModule;
  // When true, drop dnd hooks and selection chrome so the same component
  // can be reused inside <DragOverlay/>.
  overlay?: boolean;
}

export function LoadBox({ m, overlay = false }: LoadBoxProps) {
  const { scheme, dispatch } = useScheme();
  const { runtime } = useEngineSnapshot();
  const data: DraggableData = { source: "rail", moduleId: m.id };
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `module-${m.id}`,
    data,
    disabled: overlay,
  });
  const selected = !overlay && scheme.selectedId === m.id;
  const widthRem = moduleWidthRem(m.poles);
  const rt = runtime[m.id];
  const lit = !overlay && (rt?.lit ?? false);

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      {...(overlay ? {} : attributes)}
      {...(overlay ? {} : listeners)}
      role="button"
      tabIndex={overlay ? -1 : 0}
      onClick={(e) => {
        if (overlay) return;
        e.stopPropagation();
        dispatch({ type: "select", id: m.id });
      }}
      onKeyDown={(e) => {
        if (overlay) return;
        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          dispatch({ type: "remove", id: m.id });
        }
      }}
      className={`relative flex items-center justify-center rounded-[4px] border outline-none transition-all ${
        lit ? "border-[#f0a52a]/70" : "border-bp-line"
      } ${
        selected ? "ring-2 ring-bp-cyan ring-offset-2 ring-offset-bp-bg" : ""
      } ${overlay ? "cursor-grabbing" : "cursor-grab"} ${
        isDragging && !overlay ? "opacity-30" : ""
      }`}
      style={{
        width: `${widthRem}rem`,
        height: `${LOAD_MODULE_HEIGHT_REM}rem`,
        background: lit
          ? "linear-gradient(180deg, rgba(60,42,18,.85) 0%, rgba(28,20,10,.85) 100%)"
          : "linear-gradient(180deg, rgba(10,25,37,.85) 0%, rgba(6,18,28,.9) 100%)",
        boxShadow: lit
          ? "0 0 1.1rem rgba(255,180,60,.5), inset 0 0 0.6rem rgba(255,200,90,.2)"
          : "inset 0 0 0.3rem rgba(0,0,0,.5)",
      }}
      aria-label={m.label}
      aria-pressed={selected}
      title={m.label}
    >
      <Bulb lit={lit} />
    </div>
  );
}

interface LoadLayerProps {
  modules: PlacedModule[];
  drag: DragInfo | null;
  layout: Layout;
}

function LoadLayer({ modules, drag, layout }: LoadLayerProps) {
  // Vertical column to the right of the panel. Each slot is a row.
  const occupiedBy = new Map<number, PlacedModule>();
  for (const m of modules) occupiedBy.set(m.slot, m);

  const zoneAccepts = drag ? drag.kind === "load" : false;

  const slotCells: ReactNode[] = [];
  for (let s = 0; s < layout.loadColumnRows; s++) {
    if (occupiedBy.has(s)) continue;
    let highlight: "ok" | "bad" | null = null;
    if (drag && zoneAccepts) {
      highlight = "ok";
    }
    slotCells.push(
      <LoadSlot
        key={s}
        slot={s}
        topOffset={LOAD_COLUMN_TOP_DANGLE_REM + s * LOAD_ROW_PITCH_REM}
        highlight={highlight}
      />,
    );
  }

  return (
    <div
      className="absolute"
      style={{
        left: `${layout.loadColumnXRem}rem`,
        top: 0,
        width: `${LOAD_COLUMN_WIDTH_REM}rem`,
        height: `${layout.loadColumnHeightRem}rem`,
      }}
    >
      <div className="absolute -top-[1.1rem] left-0 right-0 flex flex-col items-center">
        <div className="font-mono text-[0.55rem] uppercase tracking-widest text-bp-cyan">
          НАГРУЗКИ
        </div>
      </div>

      {slotCells}

      {modules.map((m) => (
        <div
          key={m.id}
          className="absolute"
          style={{
            left: 0,
            top: `${LOAD_COLUMN_TOP_DANGLE_REM + m.slot * LOAD_ROW_PITCH_REM}rem`,
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
  layout: Layout;
}

function RailLayer({ rail, y, title, modules, drag, layout }: RailLayerProps) {
  const slots = renderZoneSlots({
    rail,
    modules,
    slotCount: layout.slotsPerRail,
    drag,
    height: MODULE_HEIGHT_REM,
    topOffset: RAIL_TOP_DANGLE_REM,
    mode: layout.mode,
  });

  return (
    <div
      className="absolute"
      style={{
        left: 0,
        top: `${y}rem`,
        width: `${layout.layoutWidthRem}rem`,
        height: `${RAIL_HEIGHT_REM}rem`,
      }}
    >
      {/* metallic DIN rail bar behind modules */}
      <div
        className="absolute"
        style={{
          left: `${PANEL_LEFT_PAD_REM}rem`,
          width: `${layout.panelWidthRem}rem`,
          top: `${RAIL_TOP_DANGLE_REM + 0.3}rem`,
          height: "0.85rem",
          background:
            "linear-gradient(180deg,#9a9384 0%,#6a6356 50%,#9a9384 100%)",
          border: "1px solid rgba(0,0,0,.5)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,.25),0 1px 2px rgba(0,0,0,.4)",
        }}
        aria-label={`Ряд ${rail} · ${title} · DIN 35, ${layout.slotsPerRail} мод`}
        title={`Ряд ${rail} · ${title} · DIN 35, ${layout.slotsPerRail} мод`}
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

// ----------------------- Bus bars (per-bus, separately positioned) -----------------------

function BusBar({ bus, layout }: { bus: BusName; layout: Layout }) {
  const g = layout.busGeometry[bus];
  const colorBg = bus === "L" ? "bg-wire-L" : bus === "N" ? "bg-wire-N" : "";
  const peStripes =
    bus === "PE"
      ? {
          backgroundImage:
            "repeating-linear-gradient(135deg,#d9b537 0 0.45rem,#2a7a3a 0.45rem 0.9rem)",
        }
      : {};
  const labelColor =
    bus === "L" ? "text-wire-L" : bus === "N" ? "text-wire-N" : "text-wire-PEa";
  return (
    <>
      <div
        className={`absolute rounded-[2px] ${colorBg}`}
        style={{
          left: `${g.x}rem`,
          top: `${g.y}rem`,
          width: `${g.width}rem`,
          height: `${g.thickness}rem`,
          ...peStripes,
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,.18), inset 0 -1px 0 rgba(0,0,0,.4), 0 1px 1px rgba(0,0,0,.35)",
        }}
        aria-label={`Шина ${bus}`}
        title={`Шина ${bus}`}
      />
      <span
        className={`absolute font-display text-[0.55rem] font-bold leading-none ${labelColor}`}
        style={{
          left: `${g.x + 0.18}rem`,
          top:
            g.tapSides.length === 1
              ? g.tapSides[0] === "top"
                ? `${g.y + g.thickness + 0.05}rem`
                : `${g.y - 0.7}rem`
              : `${g.y + g.thickness / 2 - 0.28}rem`,
          color:
            g.tapSides.length === 1 ? undefined : "rgba(255,255,255,.92)",
          textShadow:
            g.tapSides.length === 1 ? undefined : "0 1px 1px rgba(0,0,0,.55)",
        }}
        aria-hidden
      >
        {bus}
      </span>
    </>
  );
}

function BusBarsLayer({ layout }: { layout: Layout }) {
  return (
    <>
      {BUSES.map((bus) => (
        <BusBar key={bus} bus={bus} layout={layout} />
      ))}
    </>
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
  obstacles: ModuleRect[];
  layout: Layout;
}

function WirePath({ wire, selected, onClick, positions, obstacles, layout }: WirePathProps) {
  const pts = manhattanPath(
    positions.from,
    positions.to,
    obstacles,
    layout,
    layout.conductorChannelX[wire.conductor],
    wire.conductor === "PE",
  );
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
  layout: Layout;
}

function WiringLayer({
  scheme,
  onTerminalClick,
  onWireClick,
  layout,
}: WiringLayerProps) {
  const W = remToPx(layout.layoutWidthRem);
  const H = remToPx(layout.layoutHeightRem);

  const modulePos = new Map<string, { x: number; y: number }>();
  for (const m of scheme.modules) {
    for (const t of terminalsFor(m.kind)) {
      modulePos.set(`mod:${m.id}:${t.id}`, terminalPosition(m, t, layout));
    }
  }
  const busPos = new Map<string, { x: number; y: number; bus: BusName }>();
  for (const b of BUSES) {
    const taps = busTapCount(b, layout);
    for (let i = 0; i < taps; i++) {
      const p = busTapPosition(b, i, layout);
      busPos.set(`bus:${b}:${i}`, { ...p, bus: b });
    }
  }
  const endpointPos = (ep: Endpoint): { x: number; y: number } | null => {
    if (ep.kind === "bus") return busPos.get(endpointKey(ep)) ?? null;
    return modulePos.get(endpointKey(ep)) ?? null;
  };

  const obstacles: ModuleRect[] = scheme.modules
    .filter((m) => m.kind !== "source")
    .map((m) => moduleRect(m, layout));

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
      width={`${layout.layoutWidthRem}rem`}
      height={`${layout.layoutHeightRem}rem`}
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
            obstacles={obstacles}
            layout={layout}
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
          const pos = terminalPosition(m, t, layout);
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
        Array.from({ length: busTapCount(bus, layout) }, (_, i) => {
          const ep: Endpoint = { kind: "bus", bus, tapIndex: i };
          const pos = busTapPosition(bus, i, layout);
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

// Padding around the layout inside the workspace section, in rem.
const WORKSPACE_PAD_REM = 1.5;
// Min and max zoom factor for the layout box. 1.0 = original size.
const MIN_SCALE = 1.0;
const MAX_SCALE = 2.4;

export function Workspace() {
  const { scheme, dispatch } = useScheme();
  const layout = useMemo(() => getLayout(scheme.panelMode), [scheme.panelMode]);
  const [activeDrag, setActiveDrag] = useState<DraggableData | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  const { width: availWidth, height: availHeight } = useElementSize(sectionRef);

  const scale = useMemo(() => {
    if (availWidth <= 0 || availHeight <= 0) return 1;
    const padPx = WORKSPACE_PAD_REM * 2 * REM_TO_PX;
    const layoutPxW = layout.layoutWidthRem * REM_TO_PX;
    const layoutPxH = layout.layoutHeightRem * REM_TO_PX;
    const byW = (availWidth - padPx) / layoutPxW;
    const byH = (availHeight - padPx - 3 * REM_TO_PX) / layoutPxH; // reserve room for the header strip
    const candidate = Math.min(byW, byH);
    return Math.max(MIN_SCALE, Math.min(MAX_SCALE, candidate));
  }, [availWidth, availHeight, layout]);

  useDndMonitor({
    onDragStart: (e) => {
      const data = e.active.data.current as DraggableData | undefined;
      setActiveDrag(data ?? null);
    },
    onDragCancel: () => setActiveDrag(null),
    onDragEnd: () => setActiveDrag(null),
  });

  const drag = dragInfo(activeDrag, scheme);

  const rails = railCount(scheme.panelMode);
  const railsModules: PlacedModule[][] = Array.from(
    { length: rails },
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

  // Reserve enough room after scaling so the parent can scroll if the
  // user zoomed in past the viewport.
  const scaledWidthPx = layout.layoutWidthRem * REM_TO_PX * scale;
  const scaledHeightPx = layout.layoutHeightRem * REM_TO_PX * scale;

  return (
    <section
      ref={sectionRef}
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
          <div className="flex items-center gap-[0.75rem] font-mono text-[0.625rem] tracking-widest text-bp-textDim">
            <span>масштаб ×{scale.toFixed(2)}</span>
            <span>
              {scheme.pendingFrom
                ? "выберите вторую клемму · Esc отменить"
                : "без питания · сборка"}
            </span>
          </div>
        </div>

        <div
          className="relative mx-auto"
          style={{
            width: `${scaledWidthPx}px`,
            height: `${scaledHeightPx}px`,
          }}
        >
          <div
            className="absolute left-0 top-0"
            style={{
              width: `${layout.layoutWidthRem}rem`,
              height: `${layout.layoutHeightRem}rem`,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          >
            <BusBarsLayer layout={layout} />
            <SupplyLayer layout={layout} />
            <RailLayer
              rail={1}
              y={RAIL_1_Y_REM}
              title={rails === 1 ? "СБОРКА" : RAIL_TITLES[0]}
              modules={railsModules[0]}
              drag={drag}
              layout={layout}
            />
            {rails >= 2 && (
              <RailLayer
                rail={2}
                y={RAIL_2_Y_REM}
                title={RAIL_TITLES[1]}
                modules={railsModules[1]}
                drag={drag}
                layout={layout}
              />
            )}
            <LoadLayer modules={loadsModules} drag={drag} layout={layout} />
            <WiringLayer
              scheme={scheme}
              onTerminalClick={handleTerminalClick}
              onWireClick={handleWireClick}
              layout={layout}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
