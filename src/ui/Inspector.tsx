import { useScheme } from "./SchemeContext";
import { useEngineSnapshot } from "./SimulationContext";
import { useNow } from "../engine/runtime";
import type { ComponentKind, TripReason } from "../model/types";
import type {
  Endpoint,
  PlacedModule,
  RelayDisplayMode,
  SwitchPosition,
  Wire,
} from "../model/scheme";

const KIND_LABEL: Record<ComponentKind, string> = {
  source: "Источник",
  main_breaker: "Вводной автомат",
  rcd: "УЗО",
  diff_breaker: "Дифавтомат",
  branch_breaker: "Автомат отходящей",
  voltage_relay: "Реле напряжения",
  three_way_switch: "Сеть-0-Генератор",
  bus_din: "Шина L",
  bus_n: "Шина N",
  bus_pe: "Шина PE",
  load: "Нагрузка",
};

const CONDUCTOR_LABEL: Record<"L" | "N" | "PE", string> = {
  L: "фаза L",
  N: "ноль N",
  PE: "земля PE",
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-[0.5rem] border-b border-bp-line/40 py-[0.35rem]">
      <span className="font-mono text-[0.55rem] uppercase tracking-widest text-bp-textDim">
        {label}
      </span>
      <span className="font-mono text-[0.7rem] text-bp-text">{value}</span>
    </div>
  );
}

function describeEndpoint(
  ep: Endpoint,
  modules: { id: string; label: string }[],
): string {
  if (ep.kind === "bus") return `Шина ${ep.bus} · точка ${ep.tapIndex + 1}`;
  const m = modules.find((x) => x.id === ep.moduleId);
  return `${m?.label ?? ep.moduleId} · ${ep.terminalId}`;
}

function WireSection({ wire }: { wire: Wire }) {
  const { scheme, dispatch } = useScheme();
  return (
    <div className="flex flex-col gap-[0.5rem]">
      <div className="flex items-start justify-between gap-[0.5rem]">
        <div>
          <div className="font-sans text-[0.85rem] font-semibold text-bp-text">
            Провод · {CONDUCTOR_LABEL[wire.conductor]}
          </div>
          <div className="mt-[0.15rem] font-mono text-[0.55rem] uppercase tracking-widest text-bp-textDim">
            {wire.id}
          </div>
        </div>
        <button
          type="button"
          onClick={() => dispatch({ type: "remove_wire", id: wire.id })}
          className="border border-bp-err/60 bg-bp-err/10 px-[0.55rem] py-[0.3rem] font-mono text-[0.55rem] uppercase tracking-widest text-bp-err transition-colors hover:bg-bp-err/20"
          aria-label="Удалить провод"
        >
          Удалить
        </button>
      </div>
      <div className="mt-[0.35rem]">
        <Row label="проводник" value={wire.conductor} />
        <Row label="откуда" value={describeEndpoint(wire.from, scheme.modules)} />
        <Row label="куда" value={describeEndpoint(wire.to, scheme.modules)} />
      </div>
      <button
        type="button"
        onClick={() => dispatch({ type: "select_wire", id: null })}
        className="border border-bp-line px-[0.65rem] py-[0.45rem] font-mono text-[0.6rem] uppercase tracking-widest text-bp-textDim transition-colors hover:bg-bp-surface"
      >
        Снять выбор
      </button>
    </div>
  );
}

const TRIP_LABEL: Record<NonNullable<TripReason>, string> = {
  overload: "перегрузка",
  short_circuit: "короткое замыкание",
  leak: "утечка тока",
  overvoltage: "перенапряжение",
  undervoltage: "пониженное напряжение",
  no_neutral: "обрыв нуля",
};

const SWITCH_LABELS: Record<SwitchPosition, string> = {
  network: "Сеть",
  off: "0",
  generator: "Генератор",
};

function SwitchControl({ m }: { m: PlacedModule }) {
  const { dispatch } = useScheme();
  const positions: SwitchPosition[] = ["network", "off", "generator"];
  return (
    <div className="mt-[0.5rem] flex flex-col gap-[0.25rem]">
      <div className="font-mono text-[0.55rem] uppercase tracking-widest text-bp-textDim">
        положение
      </div>
      <div className="flex gap-[0.25rem]">
        {positions.map((p) => {
          const selected = (m.switch_position ?? "network") === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() =>
                dispatch({ type: "set_switch", id: m.id, position: p })
              }
              className={`flex-1 border px-[0.5rem] py-[0.4rem] font-mono text-[0.6rem] uppercase tracking-widest transition-colors ${
                selected
                  ? "border-bp-cyan bg-bp-cyan/20 text-bp-cyan"
                  : "border-bp-line bg-bp-surface text-bp-textDim hover:bg-bp-surfaceTop"
              }`}
              aria-pressed={selected}
            >
              {SWITCH_LABELS[p]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const LOAD_PRESETS: Array<{ label: string; W: number }> = [
  { label: "LED 10 Вт", W: 10 },
  { label: "Лампа 100 Вт", W: 100 },
  { label: "Чайник 2 кВт", W: 2000 },
  { label: "Плита 5 кВт", W: 5000 },
];

function formatPower(W: number): string {
  if (W >= 1000) return `${(W / 1000).toFixed(W >= 10_000 ? 0 : 1)} кВт`;
  return `${W} Вт`;
}

function LoadControl({ m }: { m: PlacedModule }) {
  const { dispatch } = useScheme();
  const { runtime } = useEngineSnapshot();
  const power = m.power_W ?? 0;
  const rt = runtime[m.id];
  const measuredI = rt?.current_A ?? 0;
  const refI = power / 230;
  return (
    <div className="mt-[0.5rem] flex flex-col gap-[0.4rem]">
      <label className="flex flex-col gap-[0.25rem]">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[0.55rem] uppercase tracking-widest text-bp-textDim">
            мощность
          </span>
          <span className="font-mono text-[0.75rem] font-bold text-bp-text">
            {formatPower(power)}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={10000}
          step={50}
          value={power}
          onChange={(e) =>
            dispatch({
              type: "set_load_power",
              id: m.id,
              power_W: Number(e.target.value),
            })
          }
          className="w-full accent-bp-cyan"
          aria-label="Мощность нагрузки"
        />
      </label>
      <div className="flex items-baseline justify-between font-mono text-[0.6rem] text-bp-textDim">
        <span>при 230 В</span>
        <span className="text-bp-text">≈ {refI.toFixed(2)} A</span>
      </div>
      {rt?.energized && (
        <div className="flex items-baseline justify-between font-mono text-[0.6rem] text-bp-textDim">
          <span>сейчас</span>
          <span className="text-bp-text">{measuredI.toFixed(2)} A</span>
        </div>
      )}
      <div className="flex flex-wrap gap-[0.25rem]">
        {LOAD_PRESETS.map((p) => (
          <button
            key={p.W}
            type="button"
            onClick={() =>
              dispatch({ type: "set_load_power", id: m.id, power_W: p.W })
            }
            className={`border px-[0.45rem] py-[0.25rem] font-mono text-[0.55rem] uppercase tracking-widest transition-colors ${
              power === p.W
                ? "border-bp-cyan bg-bp-cyan/15 text-bp-cyan"
                : "border-bp-line bg-bp-surface text-bp-textDim hover:bg-bp-surfaceTop"
            }`}
            aria-pressed={power === p.W}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const RELAY_DISPLAY_LABELS: Record<RelayDisplayMode, string> = {
  V: "U · В",
  A: "I · А",
  W: "P · Вт",
};

function RelayControl({ m }: { m: PlacedModule }) {
  const { dispatch } = useScheme();
  const modes: RelayDisplayMode[] = ["V", "A", "W"];
  const current = m.relay_display ?? "V";
  return (
    <div className="mt-[0.5rem] flex flex-col gap-[0.4rem]">
      <div className="flex flex-col gap-[0.25rem]">
        <span className="font-mono text-[0.55rem] uppercase tracking-widest text-bp-textDim">
          режим индикации
        </span>
        <div className="flex gap-[0.25rem]">
          {modes.map((mode) => {
            const selected = current === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() =>
                  dispatch({ type: "set_relay_display", id: m.id, mode })
                }
                className={`flex-1 border px-[0.5rem] py-[0.4rem] font-mono text-[0.6rem] uppercase tracking-widest transition-colors ${
                  selected
                    ? "border-bp-cyan bg-bp-cyan/20 text-bp-cyan"
                    : "border-bp-line bg-bp-surface text-bp-textDim hover:bg-bp-surfaceTop"
                }`}
                aria-pressed={selected}
              >
                {RELAY_DISPLAY_LABELS[mode]}
              </button>
            );
          })}
        </div>
      </div>
      <ThresholdInput
        label="нижний порог Umin"
        value={m.u_min_V ?? 180}
        min={100}
        max={210}
        onChange={(v) =>
          dispatch({ type: "set_relay_thresholds", id: m.id, u_min_V: v })
        }
      />
      <ThresholdInput
        label="верхний порог Umax"
        value={m.u_max_V ?? 250}
        min={240}
        max={290}
        onChange={(v) =>
          dispatch({ type: "set_relay_thresholds", id: m.id, u_max_V: v })
        }
      />
    </div>
  );
}

function ThresholdInput(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-[0.5rem]">
      <span className="font-mono text-[0.55rem] uppercase tracking-widest text-bp-textDim">
        {props.label}
      </span>
      <input
        type="number"
        min={props.min}
        max={props.max}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="w-[4.5rem] border border-bp-line bg-bp-surface px-[0.4rem] py-[0.2rem] text-right font-mono text-[0.7rem] text-bp-text"
      />
    </label>
  );
}

function ModuleSection({ m }: { m: PlacedModule }) {
  const { dispatch } = useScheme();
  const { runtime, recloseAt } = useEngineSnapshot();
  const rt = runtime[m.id];
  const isFixture = m.kind === "source";
  const reclose = recloseAt[m.id];
  const now = useNow(reclose ? 500 : 60_000);
  const recloseSec = reclose ? Math.max(0, Math.ceil((reclose - now) / 1000)) : null;
  return (
    <div className="flex flex-col gap-[0.5rem]">
      <div className="flex items-start justify-between gap-[0.5rem]">
        <div>
          <div className="font-sans text-[0.85rem] font-semibold text-bp-text">
            {m.label}
          </div>
          <div className="mt-[0.15rem] font-mono text-[0.55rem] uppercase tracking-widest text-bp-textDim">
            {KIND_LABEL[m.kind]}
          </div>
        </div>
        {!isFixture && (
          <button
            type="button"
            onClick={() => dispatch({ type: "remove", id: m.id })}
            className="border border-bp-err/60 bg-bp-err/10 px-[0.55rem] py-[0.3rem] font-mono text-[0.55rem] uppercase tracking-widest text-bp-err transition-colors hover:bg-bp-err/20"
            aria-label="Удалить модуль"
          >
            Удалить
          </button>
        )}
      </div>

      <div className="mt-[0.35rem]">
        {isFixture ? (
          <Row label="зона" value="ввод сети · сверху" />
        ) : (
          <Row
            label="ряд / слот"
            value={`${m.rail === 3 ? "нагрузки" : `ряд ${m.rail}`} · ${m.slot + 1}`}
          />
        )}
        {!isFixture && (
          <Row label="полюса" value={m.poles === 2 ? "2P" : "1P"} />
        )}
        {m.rated_current_A !== undefined && (
          <Row label="ном. ток" value={`${m.rated_current_A} A`} />
        )}
        {m.curve && <Row label="х-ка" value={m.curve} />}
        {m.rated_leak_mA !== undefined && (
          <Row label="утечка" value={`${m.rated_leak_mA} мА`} />
        )}
        {m.kind === "load" && m.power_W !== undefined && (
          <Row label="мощность" value={formatPower(m.power_W)} />
        )}
        <Row label="спецификация" value={m.spec} />

        {rt && !isFixture && (
          <>
            <Row
              label="вход / выход"
              value={`${rt.voltage_in_V.toFixed(0)} В / ${rt.voltage_out_V.toFixed(0)} В`}
            />
            <Row label="ток" value={`${rt.current_A.toFixed(2)} A`} />
            {rt.trip_pending && (
              <Row
                label="ожидание срабатывания"
                value={`${TRIP_LABEL[rt.trip_pending.reason ?? "overload"]} · ~${(rt.trip_pending.delay_ms / 1000).toFixed(0)} с`}
              />
            )}
          </>
        )}
        {m.tripped && m.trip_reason && (
          <Row label="авария" value={TRIP_LABEL[m.trip_reason]} />
        )}
        {recloseSec !== null && (
          <Row label="АПВ через" value={`${recloseSec} с`} />
        )}
      </div>

      {m.kind === "three_way_switch" && <SwitchControl m={m} />}
      {m.kind === "voltage_relay" && <RelayControl m={m} />}
      {m.kind === "load" && <LoadControl m={m} />}

      <div className="mt-[0.5rem] flex gap-[0.5rem]">
        {!isFixture && (
          <button
            type="button"
            onClick={() => dispatch({ type: "toggle_on", id: m.id })}
            className={`flex-1 border px-[0.65rem] py-[0.45rem] font-mono text-[0.6rem] uppercase tracking-widest transition-colors ${
              m.on
                ? "border-bp-ok bg-bp-ok/10 text-bp-ok hover:bg-bp-ok/20"
                : "border-bp-line bg-bp-surface text-bp-textDim hover:bg-bp-surfaceTop"
            }`}
            aria-pressed={m.on}
          >
            Рычаг · {m.on ? "ON" : "OFF"}
          </button>
        )}
        {m.tripped && (
          <button
            type="button"
            onClick={() => dispatch({ type: "reset_trip", id: m.id })}
            className="flex-1 border border-bp-warn px-[0.65rem] py-[0.45rem] font-mono text-[0.6rem] uppercase tracking-widest text-bp-warn transition-colors hover:bg-bp-warn/15"
          >
            Сбросить
          </button>
        )}
        <button
          type="button"
          onClick={() => dispatch({ type: "select", id: null })}
          className="border border-bp-line px-[0.65rem] py-[0.45rem] font-mono text-[0.6rem] uppercase tracking-widest text-bp-textDim transition-colors hover:bg-bp-surface"
        >
          Снять выбор
        </button>
      </div>
    </div>
  );
}

export function Inspector() {
  const { scheme } = useScheme();
  const selectedModule = scheme.modules.find(
    (x) => x.id === scheme.selectedId,
  );
  const selectedWire = scheme.wires.find(
    (w) => w.id === scheme.selectedWireId,
  );

  const headerText = selectedWire
    ? "// параметры провода"
    : selectedModule
      ? "// параметры модуля"
      : scheme.pendingFrom
        ? "// сборка провода"
        : "// инспектор";

  return (
    <section className="flex flex-col border-b border-bp-line bg-bp-surfaceTransparent">
      <div className="border-b border-bp-line px-[1rem] py-[0.85rem]">
        <div className="font-mono text-[0.625rem] uppercase tracking-widest text-bp-textDim">
          {headerText}
        </div>
      </div>
      <div className="px-[1rem] py-[0.85rem]">
        {selectedWire ? (
          <WireSection wire={selectedWire} />
        ) : selectedModule ? (
          <ModuleSection m={selectedModule} />
        ) : scheme.pendingFrom ? (
          <div className="font-sans text-[0.7rem] leading-snug text-bp-text">
            Выбрана первая клемма. Кликните вторую — провод появится
            автоматически. Esc отменит.
          </div>
        ) : (
          <div className="font-sans text-[0.7rem] italic text-bp-textMuted">
            Кликните модуль или провод, чтобы увидеть параметры. По клемме —
            начнётся сборка провода.
          </div>
        )}
      </div>
    </section>
  );
}
