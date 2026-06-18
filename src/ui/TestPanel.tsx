// Static test panel: visual placeholders for Stage 2.
// Real wiring into the engine lands in Stage 4 (CLAUDE.md §3.2).

const DEFAULT_VOLTAGE_V = 230;

export function TestPanel() {
  const voltage_V = DEFAULT_VOLTAGE_V;
  const pct = Math.min(100, Math.max(0, (voltage_V / 300) * 100));

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
        <div className="relative h-[0.4rem] rounded-[1px] bg-bp-surface" aria-hidden>
          <div
            className="absolute left-0 top-0 h-full rounded-[1px] bg-bp-cyan"
            style={{ width: `${pct}%` }}
          />
          <div
            className="absolute top-[-0.25rem] h-[0.9rem] w-[0.2rem] bg-bp-text"
            style={{ left: `calc(${pct}% - 0.1rem)` }}
          />
        </div>
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
          {[
            { label: "утечка 45 мА", tone: "border-bp-err text-bp-err" },
            { label: "обрыв N", tone: "border-bp-warn text-bp-warn" },
            { label: "КЗ на корпус", tone: "border-bp-err text-bp-err" },
            { label: "генератор", tone: "border-bp-cyan text-bp-cyan" },
          ].map((b) => (
            <button
              key={b.label}
              type="button"
              disabled
              className={`border ${b.tone} px-[0.65rem] py-[0.4rem] font-mono text-[0.6rem] uppercase tracking-widest opacity-50 cursor-not-allowed`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ml-auto flex flex-col justify-between">
        <div className="text-right font-mono text-[0.55rem] uppercase tracking-widest text-bp-textDim">
          питание
        </div>
        <button
          type="button"
          disabled
          className="border border-bp-line bg-bp-surface/60 px-[1.25rem] py-[0.65rem] font-mono text-[0.7rem] font-semibold uppercase tracking-widest text-bp-textDim opacity-60 cursor-not-allowed"
          title="Появится на Этапе 4"
        >
          ▶ подать питание · Э4
        </button>
      </div>
    </section>
  );
}
