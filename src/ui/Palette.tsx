import { useDraggable } from "@dnd-kit/core";
import { CATALOG, type CatalogEntry } from "../model/catalog";
import {
  isPlaceable,
  panelModeImpact,
  type PanelMode,
} from "../model/scheme";
import { useScheme } from "./SchemeContext";
import type { DraggableData } from "./dnd";

function PanelModeSwitcher() {
  const { scheme, dispatch } = useScheme();
  const current = scheme.panelMode;

  const apply = (next: PanelMode) => {
    if (next === current) return;
    const impact = panelModeImpact(scheme, next);
    const lost = impact.droppedModuleIds.length;
    const lostWires = impact.droppedWireIds.size;
    if (lost > 0 || lostWires > 0) {
      const parts: string[] = [];
      if (lost > 0) parts.push(`${lost} модул(я/ей) не помещается`);
      if (lostWires > 0) parts.push(`${lostWires} провод(а/ов) оборвётся`);
      const ok = confirm(
        `Переключение на «${
          next === "small" ? "1 рейка" : "2 рейки"
        }»: ${parts.join(", ")}. Продолжить?`,
      );
      if (!ok) return;
    }
    dispatch({ type: "set_panel_mode", mode: next });
  };

  const btn = (mode: PanelMode, label: string, hint: string) => {
    const active = mode === current;
    return (
      <button
        key={mode}
        type="button"
        onClick={() => apply(mode)}
        title={hint}
        aria-pressed={active}
        className={`flex-1 border px-[0.5rem] py-[0.45rem] text-left font-mono text-[0.55rem] uppercase tracking-widest transition-colors ${
          active
            ? "border-bp-cyan bg-bp-cyan/15 text-bp-text"
            : "border-bp-line text-bp-textDim hover:border-bp-cyan/60 hover:text-bp-text"
        }`}
      >
        <div className="font-semibold">{label}</div>
        <div className="mt-[0.15rem] font-sans text-[0.55rem] normal-case tracking-normal text-bp-textMuted">
          {hint}
        </div>
      </button>
    );
  };

  return (
    <section className="mt-auto border-t border-bp-line pt-[0.85rem]">
      <div className="mb-[0.45rem] font-mono text-[0.55rem] uppercase tracking-widest text-bp-textMuted">
        размер щита
      </div>
      <div className="flex gap-[0.35rem]">
        {btn("small", "1 рейка", "6 слотов, 6 клемм на L/N/PE")}
        {btn("large", "2 рейки", "12 слотов на рейку, 12 клемм")}
      </div>
    </section>
  );
}

const TONE_CLASS: Record<string, string> = {
  "wire-L": "border-l-wire-L",
  "wire-N": "border-l-wire-N",
  "bp-cyan": "border-l-bp-cyan",
  "bp-ok": "border-l-bp-ok",
  "bp-warn": "border-l-bp-warn",
  "bp-textDim": "border-l-bp-textDim",
};

const GROUP_LABEL: Record<CatalogEntry["group"], string> = {
  input: "Ввод и защита",
  branch: "Отходящие линии",
  infra: "Шины и нагрузки",
};

function MiniModule() {
  return (
    <div
      className="relative h-[1.5rem] w-[1.125rem] shrink-0 rounded-[1px] border border-black/30"
      style={{ background: "linear-gradient(180deg,#d6cfbd,#bcb59f)" }}
      aria-hidden
    >
      <div className="absolute left-1/2 top-[0.3rem] h-[0.45rem] w-[0.375rem] -translate-x-1/2 rounded-[1px] bg-plastic-lever" />
    </div>
  );
}

function PaletteRow({ entry }: { entry: CatalogEntry }) {
  const placeable = isPlaceable(entry.kind);
  const data: DraggableData = { source: "palette", entry };

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${entry.kind}`,
    data,
    disabled: !placeable,
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`mb-1 flex items-center gap-[0.625rem] border border-bp-line bg-bp-surfaceTransparent border-l-2 ${
        TONE_CLASS[entry.toneVarName] ?? "border-l-bp-textMuted"
      } px-[0.55rem] py-[0.45rem] transition-colors ${
        placeable
          ? "cursor-grab hover:bg-bp-surfaceTop"
          : "cursor-not-allowed opacity-50"
      } ${isDragging ? "opacity-40" : ""}`}
      title={
        placeable
          ? `${entry.name} — ${entry.spec}`
          : `${entry.name} — появится на Этапе 3`
      }
    >
      <MiniModule />
      <div className="min-w-0 flex-1">
        <div className="truncate font-sans text-[0.7rem] font-semibold leading-tight text-bp-text">
          {entry.name}
        </div>
        <div className="mt-[0.1rem] font-mono text-[0.55rem] tracking-wider text-bp-textDim">
          {entry.spec}
        </div>
      </div>
      {placeable ? (
        <span className="font-mono text-[0.6rem] text-bp-textMuted">⋮⋮</span>
      ) : (
        <span className="border border-bp-line px-[0.3rem] py-[0.1rem] font-mono text-[0.45rem] uppercase tracking-widest text-bp-textMuted">
          Э3
        </span>
      )}
    </div>
  );
}

export function Palette() {
  const groups: CatalogEntry["group"][] = ["input", "branch", "infra"];

  return (
    <aside className="flex h-full w-[17.5rem] shrink-0 flex-col gap-[0.85rem] border-r border-bp-line bg-bp-surfaceTransparent px-[1.1rem] py-[1.25rem]">
      <div className="font-mono text-[0.625rem] uppercase tracking-widest text-bp-textDim">
        // палитра
      </div>

      <div className="flex items-center gap-[0.5rem] border border-bp-line bg-bp-surface px-[0.625rem] py-[0.45rem]">
        <span className="font-mono text-[0.7rem] text-bp-cyan">⌕</span>
        <span className="font-sans text-[0.7rem] text-bp-textMuted">
          поиск аппарата…
        </span>
      </div>

      <div className="-mr-2 flex-1 overflow-y-auto pr-2">
        {groups.map((g) => (
          <section key={g} className="mb-[0.85rem]">
            <div className="mb-[0.5rem] mt-[0.5rem] font-mono text-[0.55rem] uppercase tracking-widest text-bp-textMuted">
              {GROUP_LABEL[g]}
            </div>
            {CATALOG.filter((c) => c.group === g).map((entry) => (
              <PaletteRow key={entry.kind} entry={entry} />
            ))}
          </section>
        ))}
      </div>

      <PanelModeSwitcher />
    </aside>
  );
}
