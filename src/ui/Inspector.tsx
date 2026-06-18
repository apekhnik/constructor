import { useScheme } from "./SchemeContext";
import type { ComponentKind } from "../model/types";

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

export function Inspector() {
  const { scheme, dispatch } = useScheme();
  const m = scheme.modules.find((x) => x.id === scheme.selectedId);

  return (
    <section className="flex flex-col border-b border-bp-line bg-bp-surfaceTransparent">
      <div className="border-b border-bp-line px-[1rem] py-[0.85rem]">
        <div className="font-mono text-[0.625rem] uppercase tracking-widest text-bp-textDim">
          // параметры модуля
        </div>
      </div>
      <div className="px-[1rem] py-[0.85rem]">
        {!m ? (
          <div className="font-sans text-[0.7rem] italic text-bp-textMuted">
            Выберите модуль на рейке, чтобы увидеть его параметры.
          </div>
        ) : (
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
              <button
                type="button"
                onClick={() => dispatch({ type: "remove", id: m.id })}
                className="border border-bp-err/60 bg-bp-err/10 px-[0.55rem] py-[0.3rem] font-mono text-[0.55rem] uppercase tracking-widest text-bp-err transition-colors hover:bg-bp-err/20"
                aria-label="Удалить модуль"
              >
                Удалить
              </button>
            </div>

            <div className="mt-[0.35rem]">
              <Row label="ряд / слот" value={`${m.rail} · ${m.slot + 1}`} />
              <Row
                label="полюса"
                value={m.poles === 2 ? "2P" : "1P"}
              />
              {m.rated_current_A !== undefined && (
                <Row
                  label="ном. ток"
                  value={`${m.rated_current_A} A`}
                />
              )}
              {m.curve && <Row label="х-ка" value={m.curve} />}
              {m.rated_leak_mA !== undefined && (
                <Row label="утечка" value={`${m.rated_leak_mA} мА`} />
              )}
              <Row label="спецификация" value={m.spec} />
            </div>

            <div className="mt-[0.5rem] flex gap-[0.5rem]">
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
              <button
                type="button"
                onClick={() => dispatch({ type: "select", id: null })}
                className="border border-bp-line px-[0.65rem] py-[0.45rem] font-mono text-[0.6rem] uppercase tracking-widest text-bp-textDim transition-colors hover:bg-bp-surface"
              >
                Снять выбор
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
