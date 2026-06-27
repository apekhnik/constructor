// Checkbox panel — lets the user hide the L/PE busbars and the
// generator/inverter fixtures when a scheme doesn't need them. Sits at the
// bottom of the right sidebar, below the log panel.

import { useScheme } from "./SchemeContext";
import { visibilityImpact, type PanelVisibility } from "../model/scheme";

function VisibilityCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex items-center gap-[0.55rem] font-mono text-[0.7rem] text-bp-text">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-[0.9rem] w-[0.9rem] accent-bp-cyan"
      />
      {label}
    </label>
  );
}

export function SchemeSettingsPanel() {
  const { scheme, dispatch } = useScheme();
  const v = scheme.visibility;

  const apply = (patch: Partial<PanelVisibility>) => {
    const { droppedWireIds } = visibilityImpact(scheme, patch);
    if (droppedWireIds.size > 0) {
      const ok = confirm(
        `Будет удалено ${droppedWireIds.size} провод(а/ов), подключённых к этому элементу. Продолжить?`,
      );
      if (!ok) return;
    }
    dispatch({ type: "set_visibility", patch });
  };

  return (
    <section className="flex shrink-0 flex-col border-t border-bp-line">
      <div className="border-b border-bp-line px-[1rem] py-[0.85rem]">
        <div className="font-mono text-[0.625rem] uppercase tracking-widest text-bp-textDim">
          // настройки схемы
        </div>
      </div>
      <div className="flex flex-col gap-[0.55rem] px-[1rem] py-[0.85rem]">
        <VisibilityCheckbox
          label="Шина L"
          checked={v.busL}
          onChange={() => apply({ busL: !v.busL })}
        />
        <VisibilityCheckbox
          label="Шина PE (земля)"
          checked={v.busPE}
          onChange={() => apply({ busPE: !v.busPE })}
        />
        <VisibilityCheckbox
          label="Генератор"
          checked={v.generator}
          onChange={() => apply({ generator: !v.generator })}
        />
        <VisibilityCheckbox
          label="Инвертор"
          checked={v.inverter}
          onChange={() => apply({ inverter: !v.inverter })}
        />
        {import.meta.env.DEV && (
          <label
            className="mt-[0.3rem] flex items-center gap-[0.55rem] border-t border-bp-line pt-[0.55rem] font-mono text-[0.7rem] text-bp-textDim"
            title="Спайк: новые провода прокладываются JointJS manhattan-роутером. Не влияет на уже созданные."
          >
            <input
              type="checkbox"
              checked={!!scheme.newRouterEnabled}
              onChange={() =>
                dispatch({
                  type: "set_new_router",
                  enabled: !scheme.newRouterEnabled,
                })
              }
              className="h-[0.9rem] w-[0.9rem] accent-bp-warn"
            />
            Новый роутер (JointJS)
          </label>
        )}
      </div>
    </section>
  );
}
