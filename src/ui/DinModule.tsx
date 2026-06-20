import { useDraggable } from "@dnd-kit/core";
import { useScheme } from "./SchemeContext";
import { useNow } from "../engine/runtime";
import { useEngineSnapshot } from "./SimulationContext";
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
  if (m.kind === "three_way_switch") return "1-0-2";
  return m.label;
}

function specLine(m: PlacedModule): string {
  if (m.kind === "rcd" || m.kind === "diff_breaker") {
    return `Δ ${m.rated_leak_mA ?? 30}mA`;
  }
  if (m.kind === "main_breaker") return `${m.rated_current_A ?? ""}A`;
  return m.spec;
}

function leverColor(m: PlacedModule): string {
  if (m.tripped) return "bg-bp-err";
  if (m.on) return "bg-bp-ok";
  return "bg-plastic-lever";
}

type StatusLabel =
  | "ON"
  | "OFF"
  | "КЗ"
  | "ПЕРЕГР"
  | "УТЕЧКА"
  | "U>"
  | "U<"
  | "АВАР";

const TRIP_SHORT: Record<string, StatusLabel> = {
  short_circuit: "КЗ",
  overload: "ПЕРЕГР",
  leak: "УТЕЧКА",
  overvoltage: "U>",
  undervoltage: "U<",
  no_neutral: "АВАР",
};

const TRIP_TOOLTIP: Record<string, string> = {
  short_circuit: "Короткое замыкание: ток превысил порог электромагнитного расцепителя",
  overload: "Перегрузка: ток выше номинала, сработал тепловой расцепитель — дайте автомату остыть",
  leak: "Ток утечки превысил уставку — отключение по дифференциальной защите",
  overvoltage: "Напряжение превысило верхний порог реле — линия отключена",
  undervoltage: "Напряжение ниже нижнего порога реле — линия отключена",
  no_neutral: "Обрыв нуля — реле напряжения отключило нагрузку",
};

function statusText(m: PlacedModule): StatusLabel {
  if (m.tripped) return (m.trip_reason && TRIP_SHORT[m.trip_reason]) ?? "АВАР";
  return m.on ? "ON" : "OFF";
}

const STATUS_COLOR: Record<string, string> = {
  ON: "text-bp-ok",
  OFF: "text-bp-textMuted",
  "КЗ": "text-bp-err",
  "ПЕРЕГР": "text-bp-err",
  "УТЕЧКА": "text-bp-err",
  "U>": "text-bp-err",
  "U<": "text-bp-err",
  "АВАР": "text-bp-err",
};

const KIND_HAS_TEST: ComponentKind[] = ["rcd", "diff_breaker"];

// Kinds whose body lever maps cleanly to a binary on/off. Click toggles state
// and also clears any trip (matches the `toggle_on` reducer).
const LEVER_TOGGLE_KINDS: ComponentKind[] = [
  "main_breaker",
  "branch_breaker",
  "diff_breaker",
  "rcd",
];

// ---------------- 7-segment digit (SVG) ----------------

const SEG_MAP: Record<string, string> = {
  "0": "abcdef",
  "1": "bc",
  "2": "abdeg",
  "3": "abcdg",
  "4": "bcfg",
  "5": "acdfg",
  "6": "acdefg",
  "7": "abc",
  "8": "abcdefg",
  "9": "abcdfg",
  "-": "g",
  E: "adefg",
  r: "eg",
  " ": "",
};

const SEG_POLYS: Array<[string, string]> = [
  ["a", "10,0 50,0 45,10 15,10"],
  ["b", "60,10 60,50 50,45 50,15"],
  ["c", "60,50 60,90 50,85 50,55"],
  ["d", "15,90 45,90 50,100 10,100"],
  ["e", "0,50 10,55 10,85 0,90"],
  ["f", "0,10 10,15 10,45 0,50"],
  ["g", "10,50 15,45 45,45 50,50 45,55 15,55"],
];

function SegDigit({
  d,
  on = "#ff3a28",
  off = "#2a0a0a",
  glow = true,
}: {
  d: string;
  on?: string;
  off?: string;
  glow?: boolean;
}) {
  const segs = SEG_MAP[d] ?? "";
  return (
    <svg
      viewBox="0 0 60 100"
      preserveAspectRatio="xMidYMid meet"
      className="h-[1.55rem] w-[0.95rem]"
      style={
        glow
          ? {
              filter: `drop-shadow(0 0 1.5px ${on}aa) drop-shadow(0 0 4px ${on}55)`,
            }
          : undefined
      }
      aria-hidden
    >
      {SEG_POLYS.map(([k, pts]) => (
        <polygon key={k} points={pts} fill={segs.includes(k) ? on : off} />
      ))}
    </svg>
  );
}

// Pad voltage to exactly 3 chars ("227", "  5", " 95", "---").
function displayDigits(value: number | null, blank = "---"): string {
  if (value === null || !isFinite(value)) return blank;
  const v = Math.max(0, Math.round(value));
  if (v > 999) return "999";
  return String(v).padStart(3, " ");
}

// ---------------- Voltage relay body ----------------

interface RelayBodyProps {
  m: PlacedModule;
  widthRem: number;
}

function RelayBody({ m, widthRem }: RelayBodyProps) {
  const { scheme } = useScheme();
  const snap = useEngineSnapshot();
  const now = useNow(250);

  const uMin = m.u_min_V ?? 180;
  const uMax = m.u_max_V ?? 250;
  const src = scheme.source;
  // What the relay's voltmeter shows: live grid voltage when grid is on,
  // even if the relay itself has tripped (its electronics stay powered).
  const measured = src.grid_active && !src.neutral_break ? src.grid_voltage_V : null;
  const inBand = measured !== null && measured >= uMin && measured <= uMax;

  const recloseDeadline = snap.recloseAt[m.id];
  const recloseSec =
    recloseDeadline && recloseDeadline > now
      ? Math.ceil((recloseDeadline - now) / 1000)
      : null;

  // What to show on the digital display:
  //   - countdown text "AP-N" during APV (3 digits: "AP", then sec) — but we
  //     only have 3 digits; use "A" + 2-digit seconds.
  //   - else current measured voltage
  //   - "---" if grid inactive / no neutral
  let displayValue: string;
  let displayColor = "#ff3a28"; // red default
  let displayBlink = false;
  if (recloseSec !== null) {
    displayValue = `A ${String(recloseSec).padStart(1, " ")}`;
    displayColor = "#ffb025"; // amber while counting down
  } else if (m.tripped && measured !== null) {
    displayValue = displayDigits(measured);
    displayBlink = true; // blink to draw attention to the fault voltage
  } else {
    displayValue = displayDigits(measured);
    if (measured !== null && !inBand) displayBlink = true;
  }
  // Pad / trim to exactly 3 characters for 3 digit slots.
  const chars = displayValue.padEnd(3, " ").slice(0, 3).split("");

  const reasonShort = m.tripped && m.trip_reason ? TRIP_SHORT[m.trip_reason] : null;

  // LED states:
  // НОРМА (green) — grid measured and within [uMin,uMax], relay not tripped
  // АВАР (red) — relay tripped OR measured out of band
  // РЕЛЕ (amber) — contacts closed (energized + on + not tripped)
  const ledNorm = measured !== null && inBand && !m.tripped;
  const ledAlarm = m.tripped || (measured !== null && !inBand);
  const ledRelay = m.on && !m.tripped && measured !== null && inBand;

  return (
    <>
      {/* top terminal cap */}
      <div
        className="absolute left-0 right-0 top-0 h-[0.85rem]"
        style={{
          background: "linear-gradient(180deg,#f8f4e8 0%,#cbc4b1 100%)",
          borderBottom: "1px solid rgba(0,0,0,.22)",
        }}
        aria-hidden
      >
        <div
          className="absolute left-[18%] top-[0.2rem] h-[0.32rem] w-[0.32rem] rounded-full"
          style={{
            background:
              "radial-gradient(circle at 35% 30%,#d8d1be 0%,#5f574a 70%,#1a1814 100%)",
            boxShadow: "inset 0 0 0 1px rgba(0,0,0,.35)",
          }}
        />
        <div
          className="absolute right-[18%] top-[0.2rem] h-[0.32rem] w-[0.32rem] rounded-full"
          style={{
            background:
              "radial-gradient(circle at 35% 30%,#d8d1be 0%,#5f574a 70%,#1a1814 100%)",
            boxShadow: "inset 0 0 0 1px rgba(0,0,0,.35)",
          }}
        />
      </div>

      {/* brand strip */}
      <div className="absolute left-0 right-0 top-[0.95rem] flex items-center justify-center gap-[0.25rem]">
        <span
          className="h-[0.4rem] w-[0.4rem] rounded-[1px]"
          style={{ background: "#c92a1a", boxShadow: "inset 0 -1px 0 rgba(0,0,0,.3)" }}
          aria-hidden
        />
        <span className="font-display text-[0.5rem] font-bold uppercase tracking-[0.25em] text-plastic-ink">
          МЕАНДР
        </span>
      </div>

      {/* digital display window */}
      <div
        className="absolute left-1/2 top-[1.65rem] flex h-[1.95rem] -translate-x-1/2 items-center justify-center rounded-[3px] px-[0.35rem]"
        style={{
          width: `${widthRem - 0.55}rem`,
          background:
            "linear-gradient(180deg,#0a0807 0%,#181312 55%,#241b18 100%)",
          boxShadow:
            "inset 0 1.5px 3px rgba(0,0,0,.85), inset 0 0 0 1px rgba(255,160,140,.04), 0 1px 0 rgba(255,255,255,.35)",
        }}
        aria-hidden
      >
        <div
          className={`flex items-center gap-[0.07rem] ${
            displayBlink ? "animate-segblink" : "animate-segflicker"
          }`}
        >
          {chars.map((c, i) => (
            <SegDigit key={i} d={c} on={displayColor} />
          ))}
        </div>
      </div>

      {/* status caption under display */}
      <div className="absolute left-0 right-0 top-[3.75rem] text-center font-mono text-[0.42rem] font-medium tracking-[0.2em] text-plastic-inkSoft/70">
        {recloseSec !== null
          ? "АПВ"
          : reasonShort
            ? `АВАРИЯ · ${reasonShort}`
            : "U сети"}
      </div>

      {/* 3 indicator LEDs */}
      <div className="absolute left-0 right-0 top-[4.3rem] flex items-start justify-center gap-[0.05rem]">
        <LedDot color="#3ed46a" on={ledNorm} label="НОРМА" />
        <LedDot color="#ff3a28" on={ledAlarm} label="АВАР" pulse={ledAlarm} />
        <LedDot color="#ffb025" on={ledRelay} label="РЕЛЕ" />
      </div>

      {/* potentiometer screws */}
      <div className="absolute left-0 right-0 top-[5.65rem] flex items-center justify-center gap-[0.55rem]">
        <PotScrew label="Umin" value={uMin} />
        <PotScrew label="Umax" value={uMax} />
      </div>

      {/* TEST/АПВ pushbutton */}
      <div
        className="absolute left-1/2 top-[7.05rem] flex h-[0.7rem] -translate-x-1/2 items-center justify-center rounded-[2px]"
        style={{
          width: `${widthRem - 0.9}rem`,
          background:
            "linear-gradient(180deg,#3a3530 0%,#1a1612 55%,#2a241f 100%)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,.18), inset 0 -1px 0 rgba(0,0,0,.6), 0 1px 0 rgba(0,0,0,.35)",
        }}
        aria-hidden
      >
        <span className="font-mono text-[0.42rem] font-bold tracking-[0.3em] text-plastic-light">
          TEST
        </span>
      </div>

      {/* bottom terminal cap */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[0.85rem]"
        style={{
          background: "linear-gradient(180deg,#cbc4b1 0%,#f8f4e8 100%)",
          borderTop: "1px solid rgba(0,0,0,.22)",
        }}
        aria-hidden
      >
        <div
          className="absolute left-[18%] bottom-[0.2rem] h-[0.32rem] w-[0.32rem] rounded-full"
          style={{
            background:
              "radial-gradient(circle at 35% 30%,#d8d1be 0%,#5f574a 70%,#1a1814 100%)",
            boxShadow: "inset 0 0 0 1px rgba(0,0,0,.35)",
          }}
        />
        <div
          className="absolute right-[18%] bottom-[0.2rem] h-[0.32rem] w-[0.32rem] rounded-full"
          style={{
            background:
              "radial-gradient(circle at 35% 30%,#d8d1be 0%,#5f574a 70%,#1a1814 100%)",
            boxShadow: "inset 0 0 0 1px rgba(0,0,0,.35)",
          }}
        />
      </div>
    </>
  );
}

function LedDot({
  color,
  on,
  label,
  pulse = false,
}: {
  color: string;
  on: boolean;
  label: string;
  pulse?: boolean;
}) {
  return (
    <div className="flex w-[1.05rem] flex-col items-center gap-[0.08rem]">
      <span
        className={`h-[0.42rem] w-[0.42rem] rounded-full ${
          pulse && on ? "animate-ledpulse" : ""
        }`}
        style={{
          background: on
            ? `radial-gradient(circle at 30% 30%, #ffffff, ${color} 55%, ${color} 100%)`
            : "radial-gradient(circle at 30% 30%, #4a443a 0%, #1a1612 70%)",
          boxShadow: on
            ? `0 0 4px ${color}cc, 0 0 9px ${color}66, inset 0 0 0 1px rgba(0,0,0,.4)`
            : "inset 0 0 0 1px rgba(0,0,0,.5), inset 0 1px 1px rgba(0,0,0,.6)",
        }}
        aria-hidden
      />
      <span
        className="font-mono text-[0.32rem] font-bold uppercase leading-none tracking-[0.05em]"
        style={{ color: on ? color : "#7a7368", opacity: on ? 1 : 0.75 }}
      >
        {label}
      </span>
    </div>
  );
}

function PotScrew({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center gap-[0.1rem]">
      <div
        className="relative h-[0.65rem] w-[0.65rem] rounded-full"
        style={{
          background:
            "radial-gradient(circle at 30% 25%, #d8d1be 0%, #807868 50%, #3a352d 100%)",
          boxShadow:
            "inset 0 1px 1px rgba(255,255,255,.4), inset 0 -1px 1px rgba(0,0,0,.45), 0 1px 0 rgba(0,0,0,.25)",
        }}
        aria-hidden
      >
        <div
          className="absolute left-1/2 top-1/2 h-[0.07rem] w-[0.5rem] -translate-x-1/2 -translate-y-1/2 rounded-[1px]"
          style={{
            background: "#1a1612",
            transform: "translate(-50%,-50%) rotate(35deg)",
            boxShadow: "0 1px 0 rgba(255,255,255,.2)",
          }}
        />
      </div>
      <span className="font-mono text-[0.36rem] font-bold uppercase tracking-[0.1em] text-plastic-ink">
        {label}
      </span>
      <span className="font-mono text-[0.36rem] leading-none text-plastic-inkSoft">
        {value}
      </span>
    </div>
  );
}

// ---------------- Standard breaker / RCD body ----------------

function StandardBody({ m, widthRem }: { m: PlacedModule; widthRem: number }) {
  const { dispatch } = useScheme();
  const status = statusText(m);
  const hasTest = KIND_HAS_TEST.includes(m.kind);
  const poles = m.poles;
  const canToggle = LEVER_TOGGLE_KINDS.includes(m.kind);
  const leverLabel = m.tripped
    ? "Сбросить защиту и включить"
    : m.on
      ? "Выключить"
      : "Включить";
  const handleLeverActivate = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    dispatch({ type: "toggle_on", id: m.id });
  };
  // widthRem unused but kept for symmetry with RelayBody signature.
  void widthRem;

  return (
    <>
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
        role={canToggle ? "switch" : undefined}
        tabIndex={canToggle ? 0 : undefined}
        aria-checked={canToggle ? m.on && !m.tripped : undefined}
        aria-label={canToggle ? leverLabel : undefined}
        title={canToggle ? leverLabel : undefined}
        aria-hidden={canToggle ? undefined : true}
        onPointerDown={canToggle ? (e) => e.stopPropagation() : undefined}
        onClick={canToggle ? handleLeverActivate : undefined}
        onKeyDown={
          canToggle
            ? (e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  handleLeverActivate(e);
                }
              }
            : undefined
        }
        className={`absolute left-1/2 top-[1.85rem] h-[1.5rem] -translate-x-1/2 rounded-sm shadow-[inset_0_1px_0_rgba(255,255,255,.08),0_2px_3px_rgba(0,0,0,.35)] outline-none ${leverColor(m)} ${
          canToggle
            ? "cursor-pointer hover:brightness-110 focus-visible:ring-2 focus-visible:ring-bp-cyan"
            : ""
        }`}
        style={{ width: `${1.4 * poles}rem` }}
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
    </>
  );
}

// ---------------- Outer wrapper ----------------

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
  const tooltip =
    m.tripped && m.trip_reason
      ? `${m.label} · ${TRIP_TOOLTIP[m.trip_reason] ?? "Аварийное отключение"}`
      : m.label;

  const isRelay = m.kind === "voltage_relay";
  const bgStyle = isRelay
    ? "linear-gradient(180deg,#f4efe2 0%,#e9e2cf 38%,#d8d1bb 68%,#ece6d4 100%)"
    : "linear-gradient(180deg,#dfd9c8 0%,#cdc6b3 35%,#bcb59f 65%,#d2cbb7 100%)";

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
        background: bgStyle,
        boxShadow:
          "0 2px 4px rgba(0,0,0,.35), inset 0 0 0 1px rgba(255,255,255,.18), inset 0 0 0 1px rgba(0,0,0,.3)",
      }}
      aria-label={`${m.label}, ${status}`}
      aria-pressed={selected}
      title={tooltip}
    >
      {isRelay ? (
        <RelayBody m={m} widthRem={widthRem} />
      ) : (
        <StandardBody m={m} widthRem={widthRem} />
      )}

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
