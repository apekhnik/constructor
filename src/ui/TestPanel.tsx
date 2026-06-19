// Live test panel — drives source state and simulated faults (CLAUDE.md §2.1).

import { useScheme } from "./SchemeContext";

const VOLTAGE_MAX_V = 300;
const LEAK_TEST_MA = 50;

export function TestPanel() {
  const { scheme, dispatch } = useScheme();
  const src = scheme.source;
  const voltage_V = src.grid_voltage_V;

  const firstLoad = scheme.modules.find((m) => m.kind === "load");
  const leakActive = src.leak_mA > 0 && src.leak_target_id !== null;

  return (
    <section className="flex h-[7.5rem] shrink-0 items-stretch gap-[1.5rem] border-t border-bp-line bg-bp-surfaceTop px-[1.5rem] py-[1rem]">
      <div className="flex w-[22rem] flex-col gap-[0.5rem]">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[0.55rem] uppercase tracking-widest text-bp-textDim">
            напряжение сети
          </span>
          <span className="font-mono text-[1rem] font-semibold text-bp-text">
            {voltage_V} В
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={VOLTAGE_MAX_V}
          step={1}
          value={voltage_V}
          onChange={(e) =>
            dispatch({
              type: "set_source",
              patch: { grid_voltage_V: Number(e.target.value) },
            })
          }
          aria-label="Напряжение сети"
          className="h-[0.9rem] w-full accent-bp-cyan"
          style={{ accentColor: "var(--color-bp-cyan)" }}
        />
        <div className="flex justify-between font-mono text-[0.5rem] tracking-widest text-bp-textMuted">
          <span>0 В</span>
          <span>170 В</span>
          <span>230 В</span>
          <span>255 В</span>
          <span>300 В</span>
        </div>
      </div>

      <div className="flex flex-col justify-between">
        <div className="font-mono text-[0.55rem] uppercase tracking-widest text-bp-textDim">
          тестовые воздействия
        </div>
        <div className="flex flex-wrap gap-[0.5rem]">
          <Toggle
            label={`утечка ${LEAK_TEST_MA} мА`}
            active={leakActive}
            disabled={!firstLoad}
            tone="err"
            onClick={() => {
              if (leakActive) {
                dispatch({
                  type: "set_source",
                  patch: { leak_mA: 0, leak_target_id: null },
                });
              } else if (firstLoad) {
                dispatch({
                  type: "set_source",
                  patch: { leak_mA: LEAK_TEST_MA, leak_target_id: firstLoad.id },
                });
              }
            }}
          />
          <Toggle
            label="обрыв N"
            active={src.neutral_break}
            tone="warn"
            onClick={() =>
              dispatch({
                type: "set_source",
                patch: { neutral_break: !src.neutral_break },
              })
            }
          />
          <Toggle
            label="генератор"
            active={src.gen_active}
            tone="cyan"
            onClick={() =>
              dispatch({
                type: "set_source",
                patch: { gen_active: !src.gen_active },
              })
            }
          />
        </div>
      </div>

      <div className="ml-auto flex flex-col justify-between">
        <div className="text-right font-mono text-[0.55rem] uppercase tracking-widest text-bp-textDim">
          питание
        </div>
        <button
          type="button"
          onClick={() =>
            dispatch({
              type: "set_source",
              patch: { grid_active: !src.grid_active },
            })
          }
          className={`border px-[1.25rem] py-[0.65rem] font-mono text-[0.7rem] font-semibold uppercase tracking-widest transition-colors ${
            src.grid_active
              ? "border-bp-ok bg-bp-ok/15 text-bp-ok hover:bg-bp-ok/25"
              : "border-bp-line bg-bp-surface/60 text-bp-textDim hover:bg-bp-surface"
          }`}
          aria-pressed={src.grid_active}
        >
          {src.grid_active ? "▌ снять питание" : "▶ подать питание"}
        </button>
      </div>
    </section>
  );
}

const TONE_CLASS: Record<"err" | "warn" | "cyan", string> = {
  err: "border-bp-err text-bp-err",
  warn: "border-bp-warn text-bp-warn",
  cyan: "border-bp-cyan text-bp-cyan",
};
const TONE_ACTIVE: Record<"err" | "warn" | "cyan", string> = {
  err: "bg-bp-err/20",
  warn: "bg-bp-warn/20",
  cyan: "bg-bp-cyan/20",
};

interface ToggleProps {
  label: string;
  active: boolean;
  disabled?: boolean;
  tone: "err" | "warn" | "cyan";
  onClick: () => void;
}

function Toggle({ label, active, disabled, tone, onClick }: ToggleProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`border ${TONE_CLASS[tone]} ${active ? TONE_ACTIVE[tone] : "bg-transparent"} px-[0.65rem] py-[0.4rem] font-mono text-[0.6rem] uppercase tracking-widest transition-colors ${disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-bp-surface"}`}
      aria-pressed={active}
    >
      {active ? "● " : "○ "}
      {label}
    </button>
  );
}
