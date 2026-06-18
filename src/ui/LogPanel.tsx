import type { LogEntry } from "./state";

const SEV_LABEL: Record<LogEntry["severity"], string> = {
  info: "INFO",
  warning: "WARN",
  error: "ERR",
};

const SEV_COLOR: Record<LogEntry["severity"], string> = {
  info: "text-bp-textDim",
  warning: "text-bp-warn",
  error: "text-bp-err",
};

const SEV_DOT: Record<LogEntry["severity"], string> = {
  info: "bg-bp-textDim",
  warning: "bg-bp-warn",
  error: "bg-bp-err",
};

export function LogPanel({ entries }: { entries: LogEntry[] }) {
  return (
    <section className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-bp-line px-[1rem] py-[0.85rem]">
        <div className="font-mono text-[0.625rem] uppercase tracking-widest text-bp-textDim">
          // лог · почему сработало
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-[1rem] py-[0.85rem]">
        {entries.length === 0 ? (
          <div className="font-sans text-[0.7rem] italic text-bp-textMuted">
            События появятся, когда подадите питание.
          </div>
        ) : (
          <ul className="flex flex-col gap-[0.65rem]">
            {entries.map((e, i) => (
              <li
                key={i}
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
