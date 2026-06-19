import { useDraggable } from "@dnd-kit/core";
import { useScheme } from "./SchemeContext";
import type { DraggableData } from "./dnd";
import type { PlacedModule } from "../model/scheme";
import type { ComponentKind } from "../model/types";
import { moduleWidthRem, SLOT_WIDTH_REM } from "../model/layout";

export { SLOT_WIDTH_REM };

function mainLabel(m: PlacedModule): string {
  if (
    m.kind === "main_breaker" ||
    m.kind === "branch_breaker" ||
    m.kind === "diff_breaker"
  ) {
    return `${m.curve ?? ""}${m.rated_current_A ?? ""}`;
  }
  if (m.kind === "rcd") return "УЗО";
  if (m.kind === "voltage_relay") return "УЗМ";
  if (m.kind === "three_way_switch") return "1-0-2";
  return m.label;
}

function specLine(m: PlacedModule): string {
  if (m.kind === "rcd" || m.kind === "diff_breaker") {
    return `Δ ${m.rated_leak_mA ?? 30}mA`;
  }
  if (m.kind === "voltage_relay") return "230V";
  if (m.kind === "main_breaker") return `${m.rated_current_A ?? ""}A`;
  return m.spec;
}

function leverColor(m: PlacedModule): string {
  if (m.tripped) return "bg-bp-err";
  if (m.on) return "bg-bp-ok";
  return "bg-plastic-lever";
}

function statusText(m: PlacedModule): "ON" | "OFF" | "FAULT" {
  if (m.tripped) return "FAULT";
  return m.on ? "ON" : "OFF";
}

const STATUS_COLOR: Record<"ON" | "OFF" | "FAULT", string> = {
  ON: "text-bp-ok",
  OFF: "text-bp-textMuted",
  FAULT: "text-bp-err",
};

const KIND_HAS_TEST: ComponentKind[] = ["rcd", "diff_breaker"];

interface DinModuleProps {
  m: PlacedModule;
  // Used by DragOverlay: render the same module body without dnd hooks
  // or selection chrome.
  overlay?: boolean;
}

export function DinModule({ m, overlay = false }: DinModuleProps) {
  const { scheme, dispatch } = useScheme();
  const data: DraggableData = { source: "rail", moduleId: m.id };

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `module-${m.id}`,
    data,
    disabled: overlay,
  });

  const selected = !overlay && scheme.selectedId === m.id;
  const poles = m.poles;
  const widthRem = moduleWidthRem(poles);
  const status = statusText(m);
  const hasTest = KIND_HAS_TEST.includes(m.kind);

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
      className={`relative shrink-0 rounded-[2px] outline-none transition-shadow ${
        m.tripped ? "animate-faultpulse" : ""
      } ${
        selected ? "ring-2 ring-bp-cyan ring-offset-2 ring-offset-bp-bg" : ""
      } ${overlay ? "cursor-grabbing" : "cursor-grab"} ${
        isDragging && !overlay ? "opacity-30" : ""
      }`}
      style={{
        width: `${widthRem}rem`,
        height: "8.5rem",
        background:
          "linear-gradient(180deg,#dfd9c8 0%,#cdc6b3 35%,#bcb59f 65%,#d2cbb7 100%)",
        boxShadow:
          "0 2px 4px rgba(0,0,0,.35), inset 0 0 0 1px rgba(255,255,255,.15), inset 0 0 0 1px rgba(0,0,0,.3)",
      }}
      aria-label={`${m.label}, ${status}`}
      aria-pressed={selected}
    >
      <div
        className="absolute left-0 right-0 top-0 h-[0.875rem]"
        style={{
          background: "linear-gradient(180deg,#ece6d6 0%,#bdb6a3 100%)",
          borderBottom: "1px solid rgba(0,0,0,.18)",
        }}
      >
        <div
          className="absolute left-1/2 top-[0.2rem] h-[0.3rem] -translate-x-1/2 rounded-[1px] bg-plastic-slot"
          style={{ width: `${0.5 * poles + 0.6}rem` }}
        />
      </div>

      <div className="absolute left-0 right-0 top-[1rem] text-center font-mono text-[0.5rem] font-semibold tracking-widest text-plastic-ink">
        {m.rated_current_A ? `${m.rated_current_A}A` : "—"}
      </div>

      <div
        className={`absolute left-1/2 top-[1.85rem] h-[1.5rem] -translate-x-1/2 rounded-sm shadow-[inset_0_1px_0_rgba(255,255,255,.08),0_2px_3px_rgba(0,0,0,.35)] ${leverColor(m)}`}
        style={{ width: `${1.4 * poles}rem` }}
        aria-hidden
      >
        <div className="absolute bottom-[0.2rem] left-0 right-0 text-center font-mono text-[0.4rem] font-bold tracking-widest text-plastic-light">
          {m.on && !m.tripped ? "I" : "O"}
        </div>
      </div>

      <div
        className="absolute left-1/2 top-[3.65rem] flex h-[0.85rem] -translate-x-1/2 items-center justify-center rounded-[1px] px-[0.3rem]"
        style={{
          width: "calc(100% - 0.5rem)",
          background: "linear-gradient(180deg,#1a1814 0%,#3a3530 100%)",
          boxShadow:
            "inset 0 1px 2px rgba(0,0,0,.7), 0 1px 0 rgba(255,255,255,.2)",
        }}
      >
        <div
          className={`h-[0.4rem] w-[0.4rem] rounded-full ${
            m.tripped
              ? "bg-bp-err animate-ledpulse"
              : m.on
                ? "bg-bp-ok animate-ledpulse"
                : "bg-bp-textMuted"
          }`}
          style={
            m.tripped || m.on
              ? { boxShadow: `0 0 0.4rem currentColor` }
              : undefined
          }
        />
        <span
          className={`ml-[0.2rem] font-mono text-[0.45rem] font-semibold tracking-widest ${STATUS_COLOR[status]}`}
        >
          {status}
        </span>
      </div>

      <div className="absolute left-0 right-0 top-[4.85rem] text-center font-mono text-[1rem] font-bold leading-none tracking-tight text-plastic-ink">
        {mainLabel(m)}
      </div>

      <div className="absolute left-0 right-0 top-[6.1rem] text-center font-mono text-[0.5rem] font-medium leading-tight text-plastic-inkSoft">
        {specLine(m)}
      </div>

      {hasTest && (
        <div
          className="absolute bottom-[1.6rem] left-1/2 flex h-[1.05rem] w-[1.05rem] -translate-x-1/2 items-center justify-center rounded-full"
          style={{
            background:
              "radial-gradient(circle at 35% 30%,#3a3530 0%,#0f0c09 80%)",
            boxShadow:
              "inset 0 1px 2px rgba(0,0,0,.7), 0 1px 0 rgba(255,255,255,.25)",
          }}
          aria-hidden
        >
          <span className="font-mono text-[0.45rem] font-bold tracking-widest text-plastic-light">
            T
          </span>
        </div>
      )}

      <div
        className="absolute bottom-0 left-0 right-0 h-[0.875rem]"
        style={{
          background: "linear-gradient(180deg,#bdb6a3 0%,#ece6d6 100%)",
          borderTop: "1px solid rgba(0,0,0,.18)",
        }}
      >
        <div
          className="absolute left-1/2 bottom-[0.2rem] h-[0.3rem] -translate-x-1/2 rounded-[1px] bg-plastic-slot"
          style={{ width: `${0.5 * poles + 0.6}rem` }}
        />
      </div>

      {m.tripped && (
        <div className="pointer-events-none absolute -right-[0.4rem] -top-[0.4rem] flex h-[0.9rem] w-[0.9rem] items-center justify-center rounded-full border-2 border-plastic-lever bg-bp-err shadow-[0_0_0.4rem_rgba(220,60,40,.7)]">
          <span className="font-mono text-[0.5rem] font-bold text-plastic-light">
            !
          </span>
        </div>
      )}
    </div>
  );
}
