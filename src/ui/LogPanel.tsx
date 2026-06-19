import { useMemo, useState } from "react";
import type { LogEntry } from "./state";

type Severity = LogEntry["severity"];

const SEV_LABEL: Record<Severity, string> = {
  info: "INFO",
  warning: "WARN",
  error: "ERR",
};

const SEV_COLOR: Record<Severity, string> = {
  info: "text-bp-textDim",
  warning: "text-bp-warn",
  error: "text-bp-err",
};

const SEV_DOT: Record<Severity, string> = {
  info: "bg-bp-textDim",
  warning: "bg-bp-warn",
  error: "bg-bp-err",
};

const SEV_CHIP_ACTIVE: Record<Severity, string> = {
  info: "border-bp-cyan text-bp-cyan bg-bp-cyan/15",
  warning: "border-bp-warn text-bp-warn bg-bp-warn/15",
  error: "border-bp-err text-bp-err bg-bp-err/15",
};

const ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

interface AggregatedEntry extends LogEntry {
  count: number;
}

function aggregate(entries: LogEntry[]): AggregatedEntry[] {
  const map = new Map<string, AggregatedEntry>();
  for (const e of entries) {
    const key = `${e.severity}:${e.code}:${e.componentId ?? ""}`;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(key, { ...e, count: 1 });
    }
  }
  return [...map.values()].sort(
    (a, b) => ORDER[a.severity] - ORDER[b.severity],
  );
}

export function LogPanel({ entries }: { entries: LogEntry[] }) {
  const [hidden, setHidden] = useState<Set<Severity>>(new Set());

  const aggregated = useMemo(() => aggregate(entries), [entries]);
  const counts = useMemo(() => {
    const c: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
    for (const e of aggregated) c[e.severity] += e.count;
    return c;
  }, [aggregated]);

  const filtered = aggregated.filter((e) => !hidden.has(e.severity));

  const toggle = (s: Severity) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  return (
    <section className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-bp-line px-[1rem] py-[0.85rem]">
        <div className="font-mono text-[0.625rem] uppercase tracking-widest text-bp-textDim">
          // лог · почему сработало
        </div>
        <div className="flex gap-[0.3rem]">
          {(["error", "warning", "info"] as Severity[]).map((s) => {
            const off = hidden.has(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggle(s)}
                className={`border px-[0.45rem] py-[0.2rem] font-mono text-[0.5rem] font-semibold uppercase tracking-widest transition-colors ${
                  off
                    ? "border-bp-line bg-transparent text-bp-textMuted line-through"
                    : SEV_CHIP_ACTIVE[s]
                }`}
                aria-pressed={!off}
                title={off ? "Показать" : "Скрыть"}
              >
                {SEV_LABEL[s]} · {counts[s]}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-[1rem] py-[0.85rem]">
        {entries.length === 0 ? (
          <div className="font-sans text-[0.7rem] italic text-bp-textMuted">
            События появятся, когда подадите питание.
          </div>
        ) : filtered.length === 0 ? (
          <div className="font-sans text-[0.7rem] italic text-bp-textMuted">
            Все категории скрыты — включите хотя бы один фильтр.
          </div>
        ) : (
          <ul className="flex flex-col gap-[0.65rem]">
            {filtered.map((e, i) => (
              <li
                key={`${e.code}-${e.componentId ?? "none"}-${i}`}
                className="border border-bp-line bg-bp-surface/60 px-[0.7rem] py-[0.55rem]"
              >
                <div className="flex items-center gap-[0.5rem]">
                  <span
                    className={`h-[0.5rem] w-[0.5rem] rounded-full ${SEV_DOT[e.severity]}`}
                    aria-hidden
                  />
                  <span
                    className={`font-mono text-[0.55rem] font-semibold tracking-widest ${SEV_COLOR[e.severity]}`}
                  >
                    {SEV_LABEL[e.severity]}
                  </span>
                  <span className="font-mono text-[0.5rem] uppercase tracking-widest text-bp-textMuted">
                    {e.code}
                  </span>
                  {e.count > 1 && (
                    <span className="ml-auto border border-bp-line/60 px-[0.35rem] py-[0.1rem] font-mono text-[0.5rem] text-bp-textDim">
                      ×{e.count}
                    </span>
                  )}
                </div>
                <div className="mt-[0.35rem] font-sans text-[0.75rem] leading-snug text-bp-text">
                  {e.text}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
