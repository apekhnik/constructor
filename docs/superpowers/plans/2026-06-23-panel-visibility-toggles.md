# Переключатели видимости (шина L, шина PE, генератор, инвертор) — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить 4 независимых чекбокса (шина L, шина PE, генератор, инвертор), которые скрывают соответствующий элемент со схемы, автоматически удаляют подключённые к нему провода и сохраняют состояние вместе со схемой.

**Architecture:** Новое поле `visibility: PanelVisibility` в `Scheme` (model-слой, без DOM). Редьюсер получает действие `set_visibility`, которое мержит патч и одновременно вычищает провода/selection, ссылающиеся на скрытый элемент — через чистую функцию-предпросмотр `visibilityImpact`. UI-слой (`Workspace.tsx`) просто не рисует то, что выключено в `visibility`; `layout.ts`/`simulation.ts`/`graph.ts` не меняются вообще, потому что отсутствие проводов делает скрытый элемент электрически изолированным сам по себе.

**Tech Stack:** React 19, TypeScript strict, vitest. Никаких новых зависимостей.

## Global Constraints

- Шина N всегда видима — не входит в `PanelVisibility`.
- При скрытии элемента с подключёнными проводами — провода удаляются автоматически (с `confirm()` в UI, если что-то реально будет удалено).
- `visibility` сохраняется со схемой (localStorage + экспорт/импорт JSON), как `panelMode`.
- При скрытии шины/фикстуры рендер просто не рисует её — `layout.ts` (геометрия) не меняется, место остаётся зарезервированным.
- `model/` и `engine/` не зависят от React/DOM (CLAUDE.md) — вся новая логика в `scheme.ts` обязана остаться чистыми функциями.
- Тексты для пользователя — на русском.
- Спека: `docs/superpowers/specs/2026-06-23-panel-visibility-toggles-design.md`.

---

### Task 1: Модель — `PanelVisibility` + редьюсер `set_visibility`

**Files:**
- Modify: `src/model/scheme.ts`
- Create: `src/model/scheme.test.ts`

**Interfaces:**
- Produces: `PanelVisibility` (`{ busL: boolean; busPE: boolean; generator: boolean; inverter: boolean }`), `defaultVisibility(): PanelVisibility`, `Scheme.visibility: PanelVisibility`, `visibilityImpact(scheme: Scheme, patch: Partial<PanelVisibility>): { next: PanelVisibility; droppedWireIds: Set<string> }`, действие `{ type: "set_visibility"; patch: Partial<PanelVisibility> }` в `SchemeAction`.

- [ ] **Step 1: Написать падающий тест на дефолты `emptyScheme()`**

Создать `src/model/scheme.test.ts`:

```ts
// Tests for scheme.ts visibility toggles (hide L/PE busbars and
// generator/inverter when a scheme doesn't need them).

import { describe, expect, it } from "vitest";
import {
  GRID_SOURCE_ID,
  emptyScheme,
  schemeReducer,
  visibilityImpact,
  type Endpoint,
  type Scheme,
} from "./scheme";

function wire(scheme: Scheme, from: Endpoint, to: Endpoint): Scheme {
  const next = schemeReducer(scheme, { type: "add_wire", from, to });
  if (next === scheme) {
    throw new Error(
      `add_wire rejected: ${JSON.stringify(from)} ↔ ${JSON.stringify(to)}`,
    );
  }
  return next;
}

function modTerm(moduleId: string, terminalId: string): Endpoint {
  return { kind: "module", moduleId, terminalId };
}

function busTap(bus: "L" | "N" | "PE", i: number): Endpoint {
  return { kind: "bus", bus, tapIndex: i };
}

describe("PanelVisibility defaults", () => {
  it("emptyScheme() starts with everything visible", () => {
    const s = emptyScheme();
    expect(s.visibility).toEqual({
      busL: true,
      busPE: true,
      generator: true,
      inverter: true,
    });
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает (TS-ошибка компиляции)**

Run: `npm run test`
Expected: FAIL — `src/model/scheme.test.ts` не компилируется,
`Property 'visibility' does not exist on type 'Scheme'`.

- [ ] **Step 3: Добавить `PanelVisibility` и `defaultVisibility()` в `scheme.ts`**

В `src/model/scheme.ts` сразу после блока `defaultSource` (после строки с
закрывающей `});` функции `defaultSource`, перед `export type Endpoint =`)
вставить:

```ts
// Optional panel elements the user can hide to reduce visual clutter when
// a scheme doesn't need them. N stays always-visible — no scheme is
// meaningfully buildable without it.
export interface PanelVisibility {
  busL: boolean;
  busPE: boolean;
  generator: boolean;
  inverter: boolean;
}

export const defaultVisibility = (): PanelVisibility => ({
  busL: true,
  busPE: true,
  generator: true,
  inverter: true,
});
```

- [ ] **Step 4: Добавить поле `visibility` в `Scheme` и `emptyScheme()`**

Найти интерфейс `Scheme`:

```ts
export interface Scheme {
  panelMode: PanelMode;
  modules: PlacedModule[];
  wires: Wire[];
  selectedId: string | null;
  selectedWireId: string | null;
  pendingFrom: Endpoint | null;
  source: SourceState;
}
```

Заменить на:

```ts
export interface Scheme {
  panelMode: PanelMode;
  modules: PlacedModule[];
  wires: Wire[];
  selectedId: string | null;
  selectedWireId: string | null;
  pendingFrom: Endpoint | null;
  source: SourceState;
  visibility: PanelVisibility;
}
```

Найти `emptyScheme`:

```ts
export const emptyScheme = (mode: PanelMode = DEFAULT_PANEL_MODE): Scheme => ({
  panelMode: mode,
  modules: [gridSourceFixture(), generatorFixture(), inverterFixture()],
  wires: [],
  selectedId: null,
  selectedWireId: null,
  pendingFrom: null,
  source: defaultSource(),
});
```

Заменить на:

```ts
export const emptyScheme = (mode: PanelMode = DEFAULT_PANEL_MODE): Scheme => ({
  panelMode: mode,
  modules: [gridSourceFixture(), generatorFixture(), inverterFixture()],
  wires: [],
  selectedId: null,
  selectedWireId: null,
  pendingFrom: null,
  source: defaultSource(),
  visibility: defaultVisibility(),
});
```

- [ ] **Step 5: Запустить тест, убедиться что Step 1 проходит**

Run: `npm run test`
Expected: PASS — `PanelVisibility defaults > emptyScheme() starts with everything visible`.

Остальные тесты (`simulation.test.ts`, `layout.test.ts`) тоже должны
оставаться зелёными — `visibility` — новое необязательное по смыслу поле,
ничего не ломает.

- [ ] **Step 6: Написать падающие тесты на `visibilityImpact`**

Добавить в `src/model/scheme.test.ts`, после блока `PanelVisibility defaults`:

```ts
describe("visibilityImpact", () => {
  it("is empty when the hidden element has no wires", () => {
    const s = emptyScheme();
    const { droppedWireIds } = visibilityImpact(s, { generator: false });
    expect(droppedWireIds.size).toBe(0);
  });

  it("flags wires on the L bus, but not wires on N, when hiding busL", () => {
    let s = emptyScheme();
    s = wire(s, modTerm(GRID_SOURCE_ID, "out_L"), busTap("L", 0));
    s = wire(s, modTerm(GRID_SOURCE_ID, "out_N"), busTap("N", 0));
    const { droppedWireIds } = visibilityImpact(s, { busL: false });
    expect(droppedWireIds.size).toBe(1);
    const dropped = s.wires.find((w) => droppedWireIds.has(w.id));
    expect(dropped?.conductor).toBe("L");
  });

  it("flags wires touching the generator's terminals when hiding it", () => {
    let s = emptyScheme();
    s = wire(s, modTerm("fixture_generator", "out_L"), busTap("L", 0));
    s = wire(s, modTerm("fixture_generator", "out_N"), busTap("N", 0));
    const { droppedWireIds } = visibilityImpact(s, { generator: false });
    expect(droppedWireIds.size).toBe(2);
  });

  it("does not flag inverter wires when hiding the generator", () => {
    let s = emptyScheme();
    s = wire(s, modTerm("fixture_generator", "out_L"), busTap("L", 0));
    s = wire(s, modTerm("fixture_inverter", "in_L"), busTap("L", 1));
    const { droppedWireIds } = visibilityImpact(s, { generator: false });
    expect(droppedWireIds.size).toBe(1);
    const dropped = [...droppedWireIds][0];
    const w = s.wires.find((x) => x.id === dropped)!;
    expect(w.from.kind === "module" ? w.from.moduleId : null).toBe(
      "fixture_generator",
    );
  });
});
```

- [ ] **Step 7: Убедиться, что Step 6 падает (TS-ошибка: `visibilityImpact` не существует)**

Run: `npm run test`
Expected: FAIL — `Module '"./scheme"' has no exported member 'visibilityImpact'`.

- [ ] **Step 8: Реализовать `visibilityImpact`**

В `src/model/scheme.ts` после функции `removeWiresAttachedTo` (перед
`export function schemeReducer`) вставить:

```ts
// What wires would be dropped if `patch` were applied to scheme.visibility?
// Pure preview — caller (SchemeSettingsPanel) confirms before dispatching
// `set_visibility`, mirroring panelModeImpact's UX. Also returns `next`
// (the merged visibility) so the reducer case doesn't recompute the merge.
export function visibilityImpact(
  scheme: Scheme,
  patch: Partial<PanelVisibility>,
): { next: PanelVisibility; droppedWireIds: Set<string> } {
  const next = { ...scheme.visibility, ...patch };
  const endpointTouchesHidden = (ep: Endpoint): boolean => {
    if (ep.kind === "bus") {
      if (ep.bus === "L") return !next.busL;
      if (ep.bus === "PE") return !next.busPE;
      return false; // N bus is always visible
    }
    if (ep.moduleId === "fixture_generator") return !next.generator;
    if (ep.moduleId === "fixture_inverter") return !next.inverter;
    return false;
  };
  const droppedWireIds = new Set<string>();
  for (const w of scheme.wires) {
    if (endpointTouchesHidden(w.from) || endpointTouchesHidden(w.to)) {
      droppedWireIds.add(w.id);
    }
  }
  return { next, droppedWireIds };
}
```

- [ ] **Step 9: Запустить тесты, убедиться что Step 6 проходит**

Run: `npm run test`
Expected: PASS — все 4 теста в `visibilityImpact`.

- [ ] **Step 10: Закоммитить модель**

```bash
git add src/model/scheme.ts src/model/scheme.test.ts
git commit -m "$(cat <<'EOF'
Модель: PanelVisibility и visibilityImpact для шин/генератора/инвертора

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 11: Написать падающие тесты на редьюсер `set_visibility`**

Добавить в `src/model/scheme.test.ts`, после блока `visibilityImpact`:

```ts
describe("schemeReducer — set_visibility", () => {
  it("hiding busL drops only wires on bus L, keeps bus N wires", () => {
    let s = emptyScheme();
    s = wire(s, modTerm(GRID_SOURCE_ID, "out_L"), busTap("L", 0));
    s = wire(s, modTerm(GRID_SOURCE_ID, "out_N"), busTap("N", 0));
    s = schemeReducer(s, { type: "set_visibility", patch: { busL: false } });
    expect(s.wires).toHaveLength(1);
    expect(s.wires[0].conductor).toBe("N");
    expect(s.visibility.busL).toBe(false);
  });

  it("clears selectedId when the selected generator is hidden", () => {
    let s = emptyScheme();
    s = schemeReducer(s, { type: "select", id: "fixture_generator" });
    expect(s.selectedId).toBe("fixture_generator");
    s = schemeReducer(s, {
      type: "set_visibility",
      patch: { generator: false },
    });
    expect(s.selectedId).toBeNull();
  });

  it("does not clear selectedId for an unrelated module", () => {
    let s = emptyScheme();
    s = schemeReducer(s, { type: "select", id: GRID_SOURCE_ID });
    s = schemeReducer(s, {
      type: "set_visibility",
      patch: { generator: false },
    });
    expect(s.selectedId).toBe(GRID_SOURCE_ID);
  });

  it("clears selectedWireId when the selected wire is dropped", () => {
    let s = emptyScheme();
    s = wire(s, modTerm("fixture_generator", "out_L"), busTap("L", 0));
    const wireId = s.wires[0].id;
    s = schemeReducer(s, { type: "select_wire", id: wireId });
    expect(s.selectedWireId).toBe(wireId);
    s = schemeReducer(s, {
      type: "set_visibility",
      patch: { generator: false },
    });
    expect(s.selectedWireId).toBeNull();
    expect(s.wires).toHaveLength(0);
  });

  it("re-enabling a hidden bus does not resurrect dropped wires", () => {
    let s = emptyScheme();
    s = wire(s, modTerm(GRID_SOURCE_ID, "out_L"), busTap("L", 0));
    s = schemeReducer(s, { type: "set_visibility", patch: { busL: false } });
    expect(s.wires).toHaveLength(0);
    s = schemeReducer(s, { type: "set_visibility", patch: { busL: true } });
    expect(s.wires).toHaveLength(0);
    expect(s.visibility.busL).toBe(true);
  });
});
```

- [ ] **Step 12: Убедиться, что Step 11 падает**

Run: `npm run test`
Expected: FAIL — `schemeReducer` не распознаёт действие `"set_visibility"`
(TS-ошибка: тип `"set_visibility"` не входит в `SchemeAction`, либо
рантайм-ошибка "switch не покрывает кейс", в зависимости от того, как
TS обработает несоответствие — в любом случае тест не должен проходить
зелёным).

- [ ] **Step 13: Добавить действие и обработчик в редьюсер**

Найти объединение `SchemeAction`:

```ts
  | { type: "set_panel_mode"; mode: PanelMode }
  | { type: "load"; scheme: Scheme }
  | { type: "clear" };
```

Заменить на:

```ts
  | { type: "set_panel_mode"; mode: PanelMode }
  | { type: "set_visibility"; patch: Partial<PanelVisibility> }
  | { type: "load"; scheme: Scheme }
  | { type: "clear" };
```

Найти конец кейса `"set_panel_mode"` в `schemeReducer` (прямо перед
`case "clear": {`):

```ts
    case "set_panel_mode": {
      if (scheme.panelMode === action.mode) return scheme;
      const { droppedModuleIds, droppedWireIds } = panelModeImpact(
        scheme,
        action.mode,
      );
      const dropSet = new Set(droppedModuleIds);
      return {
        ...scheme,
        panelMode: action.mode,
        modules: scheme.modules.filter((m) => !dropSet.has(m.id)),
        wires: scheme.wires.filter((w) => !droppedWireIds.has(w.id)),
        selectedId:
          scheme.selectedId && dropSet.has(scheme.selectedId)
            ? null
            : scheme.selectedId,
        selectedWireId:
          scheme.selectedWireId && droppedWireIds.has(scheme.selectedWireId)
            ? null
            : scheme.selectedWireId,
        pendingFrom: null,
      };
    }
    case "clear": {
```

Вставить новый кейс между ними:

```ts
    case "set_panel_mode": {
      if (scheme.panelMode === action.mode) return scheme;
      const { droppedModuleIds, droppedWireIds } = panelModeImpact(
        scheme,
        action.mode,
      );
      const dropSet = new Set(droppedModuleIds);
      return {
        ...scheme,
        panelMode: action.mode,
        modules: scheme.modules.filter((m) => !dropSet.has(m.id)),
        wires: scheme.wires.filter((w) => !droppedWireIds.has(w.id)),
        selectedId:
          scheme.selectedId && dropSet.has(scheme.selectedId)
            ? null
            : scheme.selectedId,
        selectedWireId:
          scheme.selectedWireId && droppedWireIds.has(scheme.selectedWireId)
            ? null
            : scheme.selectedWireId,
        pendingFrom: null,
      };
    }
    case "set_visibility": {
      const { next, droppedWireIds } = visibilityImpact(scheme, action.patch);
      const selectedIsHiddenFixture =
        (scheme.selectedId === "fixture_generator" && !next.generator) ||
        (scheme.selectedId === "fixture_inverter" && !next.inverter);
      return {
        ...scheme,
        visibility: next,
        wires: scheme.wires.filter((w) => !droppedWireIds.has(w.id)),
        selectedId: selectedIsHiddenFixture ? null : scheme.selectedId,
        selectedWireId:
          scheme.selectedWireId && droppedWireIds.has(scheme.selectedWireId)
            ? null
            : scheme.selectedWireId,
        pendingFrom: null,
      };
    }
    case "clear": {
```

- [ ] **Step 14: Запустить тесты, убедиться что всё проходит**

Run: `npm run test`
Expected: PASS — все тесты в `scheme.test.ts`, плюс существующие
`simulation.test.ts`/`layout.test.ts` остаются зелёными (всего должно
стать 31 (текущие) + 1 (Step 1) + 4 (Step 6) + 5 (Step 11) = 41 тест).

- [ ] **Step 15: Проверить сборку**

Run: `npm run build`
Expected: успешная сборка без ошибок TypeScript.

- [ ] **Step 16: Закоммитить редьюсер**

```bash
git add src/model/scheme.ts src/model/scheme.test.ts
git commit -m "$(cat <<'EOF'
Редьюсер: действие set_visibility — скрытие шин/генератора/инвертора

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Персистентность — `visibility` через save/export + автосохранение

**Files:**
- Modify: `src/model/persistence.ts`
- Modify: `src/ui/SchemeContext.tsx:30`
- Modify: `src/model/scheme.test.ts` (добавить describe-блок)

**Interfaces:**
- Consumes: `PanelVisibility`, `defaultVisibility()`, `Scheme.visibility` (Task 1).
- Produces: `SerializedScheme.visibility?: PanelVisibility`; `serializeScheme`/`deserializeScheme` теперь читают/пишут `visibility`.

- [ ] **Step 1: Написать падающие тесты на round-trip персистентности**

Добавить в `src/model/scheme.test.ts` импорт и новый describe-блок:

В начало файла, рядом с существующим импортом из `"./scheme"`, добавить:

```ts
import { deserializeScheme, serializeScheme } from "./persistence";
```

В конец файла добавить:

```ts
describe("persistence — visibility round-trip", () => {
  it("serializeScheme includes the current visibility", () => {
    const s = schemeReducer(emptyScheme(), {
      type: "set_visibility",
      patch: { busPE: false },
    });
    const data = serializeScheme(s);
    expect(data.visibility).toEqual(s.visibility);
  });

  it("deserializeScheme defaults missing visibility to all-visible (legacy saves)", () => {
    const data = serializeScheme(emptyScheme());
    // Simulate an old save made before this field existed. `visibility` is
    // optional on SerializedScheme, so `delete` needs no cast.
    delete data.visibility;
    const restored = deserializeScheme(data);
    expect(restored.visibility).toEqual({
      busL: true,
      busPE: true,
      generator: true,
      inverter: true,
    });
  });

  it("deserializeScheme preserves an explicitly saved visibility", () => {
    const s = schemeReducer(emptyScheme(), {
      type: "set_visibility",
      patch: { generator: false, busPE: false },
    });
    const data = serializeScheme(s);
    const restored = deserializeScheme(data);
    expect(restored.visibility).toEqual({
      busL: true,
      busPE: false,
      generator: false,
      inverter: true,
    });
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npm run test`
Expected: FAIL — `data.visibility` не существует на типе `SerializedScheme`
(TS-ошибка компиляции).

- [ ] **Step 3: Обновить `SerializedScheme` и serialize/deserialize**

В `src/model/persistence.ts` найти импорт:

```ts
import {
  DEFAULT_PANEL_MODE,
  defaultSource,
  emptyScheme,
  GRID_SOURCE_ID,
  generatorFixture,
  inverterFixture,
  type PanelMode,
  type PlacedModule,
  type Scheme,
  type SourceState,
  type Wire,
} from "./scheme";
```

Заменить на:

```ts
import {
  DEFAULT_PANEL_MODE,
  defaultSource,
  defaultVisibility,
  emptyScheme,
  GRID_SOURCE_ID,
  generatorFixture,
  inverterFixture,
  type PanelMode,
  type PanelVisibility,
  type PlacedModule,
  type Scheme,
  type SourceState,
  type Wire,
} from "./scheme";
```

Найти:

```ts
interface SerializedScheme {
  version: 1;
  panelMode?: PanelMode;
  modules: PlacedModule[];
  wires: Wire[];
  source: SourceState;
}
```

Заменить на:

```ts
interface SerializedScheme {
  version: 1;
  panelMode?: PanelMode;
  modules: PlacedModule[];
  wires: Wire[];
  source: SourceState;
  visibility?: PanelVisibility;
}
```

Найти:

```ts
export function serializeScheme(scheme: Scheme): SerializedScheme {
  return {
    version: 1,
    panelMode: scheme.panelMode,
    modules: scheme.modules,
    wires: scheme.wires,
    source: scheme.source,
  };
}
```

Заменить на:

```ts
export function serializeScheme(scheme: Scheme): SerializedScheme {
  return {
    version: 1,
    panelMode: scheme.panelMode,
    modules: scheme.modules,
    wires: scheme.wires,
    source: scheme.source,
    visibility: scheme.visibility,
  };
}
```

Найти в `deserializeScheme`:

```ts
  return {
    panelMode: mode,
    modules,
    wires: data.wires,
    source: { ...defaultSource(), ...data.source },
    selectedId: null,
    selectedWireId: null,
    pendingFrom: null,
  };
}
```

Заменить на:

```ts
  return {
    panelMode: mode,
    modules,
    wires: data.wires,
    source: { ...defaultSource(), ...data.source },
    visibility: { ...defaultVisibility(), ...data.visibility },
    selectedId: null,
    selectedWireId: null,
    pendingFrom: null,
  };
}
```

- [ ] **Step 4: Запустить тесты, убедиться что всё проходит**

Run: `npm run test`
Expected: PASS — 3 новых теста + все существующие.

- [ ] **Step 5: Поправить автосохранение в `SchemeContext.tsx`**

В `src/ui/SchemeContext.tsx` найти:

```ts
  // Autosave whenever durable scheme state changes. Selection-only changes
  // are cheap to re-save, so we don't bother debouncing for MVP.
  useEffect(() => {
    saveToStorage(scheme);
  }, [scheme.modules, scheme.wires, scheme.source]);
```

Заменить на:

```ts
  // Autosave whenever durable scheme state changes. Selection-only changes
  // are cheap to re-save, so we don't bother debouncing for MVP.
  useEffect(() => {
    saveToStorage(scheme);
  }, [scheme.modules, scheme.wires, scheme.source, scheme.visibility]);
```

(Без этого изменения переключение только чекбоксов видимости — без
других изменений схемы в том же тике — не вызовет автосохранение, и
состояние чекбоксов не переживёт перезагрузку страницы до следующего
изменения схемы.)

- [ ] **Step 6: Проверить сборку**

Run: `npm run build`
Expected: успешная сборка без ошибок TypeScript.

- [ ] **Step 7: Закоммитить персистентность**

```bash
git add src/model/persistence.ts src/model/scheme.test.ts src/ui/SchemeContext.tsx
git commit -m "$(cat <<'EOF'
Персистентность: visibility сохраняется и переживает перезагрузку

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Рендер — скрытие шин и генератора/инвертора в `Workspace.tsx`

**Files:**
- Modify: `src/ui/Workspace.tsx`

**Interfaces:**
- Consumes: `Scheme.visibility` (Task 1), `BUSES`/`BusName` (уже импортированы из `../model/layout`), `PlacedModule` (уже импортирован).
- Produces: `visibleModulesOf(modules, visibility): PlacedModule[]`,
  `visibleBusesOf(visibility): BusName[]` — используются здесь и в Task 4.

Эта задача не покрывается автотестами (в проекте нет React-тестового
стенда — ни одного компонентного теста, только vitest на `model/`).
Проверяется TypeScript-сборкой и финальной ручной проверкой в Task 6.

- [ ] **Step 1: Добавить тип `PanelVisibility` в импорт из `../model/scheme`**

В `src/ui/Workspace.tsx` найти:

```ts
import {
  LOAD_RAIL_INDEX,
  canConnect,
  endpointKey,
  placementRailsFor,
  railCount,
  type Endpoint,
  type PlacedModule,
  type Scheme,
  type Wire,
} from "../model/scheme";
```

Заменить на:

```ts
import {
  LOAD_RAIL_INDEX,
  canConnect,
  endpointKey,
  placementRailsFor,
  railCount,
  type Endpoint,
  type PanelVisibility,
  type PlacedModule,
  type Scheme,
  type Wire,
} from "../model/scheme";
```

- [ ] **Step 2: Добавить хелперы `visibleModulesOf`/`visibleBusesOf`**

В `src/ui/Workspace.tsx` найти:

```ts
const CONDUCTOR_DOT: Record<"L" | "N" | "PE", string> = {
  L: "#e07a4f",
  N: "#5fa3e8",
  PE: "#e6c34a",
};

// ----------------------- Drag info -----------------------
```

Заменить на:

```ts
const CONDUCTOR_DOT: Record<"L" | "N" | "PE", string> = {
  L: "#e07a4f",
  N: "#5fa3e8",
  PE: "#e6c34a",
};

// ----------------------- Visibility filters -----------------------
// Shared by Workspace() (which modules/buses to lay out) and WiringLayer
// (which terminal dots/taps are clickable). The reducer (scheme.ts) already
// guarantees no wire references a hidden bus/fixture, so filtering here is
// purely about what gets drawn.

function visibleModulesOf(
  modules: PlacedModule[],
  visibility: PanelVisibility,
): PlacedModule[] {
  return modules.filter((m) => {
    if (m.kind === "generator") return visibility.generator;
    if (m.kind === "inverter") return visibility.inverter;
    return true;
  });
}

function visibleBusesOf(visibility: PanelVisibility): BusName[] {
  return BUSES.filter((b) => {
    if (b === "L") return visibility.busL;
    if (b === "PE") return visibility.busPE;
    return true; // N is always visible
  });
}

// ----------------------- Drag info -----------------------
```

- [ ] **Step 3: Дать `BusBarsLayer` проп `buses`**

Найти:

```ts
function BusBarsLayer({ layout }: { layout: Layout }) {
  return (
    <>
      {BUSES.map((bus) => (
        <BusBar key={bus} bus={bus} layout={layout} />
      ))}
    </>
  );
}
```

Заменить на:

```ts
function BusBarsLayer({
  layout,
  buses,
}: {
  layout: Layout;
  buses: readonly BusName[];
}) {
  return (
    <>
      {buses.map((bus) => (
        <BusBar key={bus} bus={bus} layout={layout} />
      ))}
    </>
  );
}
```

- [ ] **Step 4: В `Workspace()` посчитать видимые модули/шины и передать их дальше**

Найти:

```ts
  const rails = railCount(scheme.panelMode);
  const railsModules: PlacedModule[][] = Array.from(
    { length: rails },
    (_, i) =>
      scheme.modules.filter((m) => m.rail === i + 1 && m.kind !== "source"),
  );
  const loadsModules = scheme.modules.filter(
    (m) => m.rail === LOAD_RAIL_INDEX,
  );
  const leftModules = scheme.modules.filter((m) => m.rail === -1);
```

Заменить на:

```ts
  const visibleModules = visibleModulesOf(scheme.modules, scheme.visibility);
  const visibleBuses = visibleBusesOf(scheme.visibility);

  const rails = railCount(scheme.panelMode);
  const railsModules: PlacedModule[][] = Array.from(
    { length: rails },
    (_, i) =>
      scheme.modules.filter((m) => m.rail === i + 1 && m.kind !== "source"),
  );
  const loadsModules = scheme.modules.filter(
    (m) => m.rail === LOAD_RAIL_INDEX,
  );
  const leftModules = visibleModules.filter((m) => m.rail === -1);
```

(`railsModules`/`loadsModules` не трогаем — генератор/инвертор/шины никогда
не попадают в rail 1/2/LOAD_RAIL_INDEX, фильтровать там нечего.)

- [ ] **Step 5: Передать `visibleBuses` в `<BusBarsLayer>`**

Найти:

```tsx
            <BusBarsLayer layout={layout} />
            <LeftSourcesLayer modules={leftModules} layout={layout} />
```

Заменить на:

```tsx
            <BusBarsLayer layout={layout} buses={visibleBuses} />
            <LeftSourcesLayer modules={leftModules} layout={layout} />
```

- [ ] **Step 6: Проверить сборку**

Run: `npm run build`
Expected: успешная сборка без ошибок TypeScript.

- [ ] **Step 7: Запустить тесты (регрессия)**

Run: `npm run test`
Expected: PASS — модельные тесты не зависят от UI, должны остаться
зелёными без изменений.

- [ ] **Step 8: Закоммитить**

```bash
git add src/ui/Workspace.tsx
git commit -m "$(cat <<'EOF'
Workspace: шина L/PE и генератор/инвертор скрываются по visibility

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Рендер — клеммы/тапы скрытых элементов недоступны в `WiringLayer`

**Files:**
- Modify: `src/ui/Workspace.tsx`

**Interfaces:**
- Consumes: `visibleModulesOf`, `visibleBusesOf` (Task 3).

- [ ] **Step 1: Отфильтровать `obstacles` в `WiringLayer`**

Найти:

```ts
  const obstacles: ModuleRect[] = scheme.modules
    .filter((m) => m.kind !== "source")
    .map((m) => moduleRect(m, layout));
```

Заменить на:

```ts
  const obstacles: ModuleRect[] = visibleModulesOf(
    scheme.modules,
    scheme.visibility,
  )
    .filter((m) => m.kind !== "source")
    .map((m) => moduleRect(m, layout));
```

- [ ] **Step 2: Отфильтровать цикл рендера точек-клемм модулей**

Найти:

```tsx
      {/* module + fixture terminal dots */}
      {scheme.modules.flatMap((m) =>
        terminalsFor(m.kind).map((t) => {
          const ep: Endpoint = {
            kind: "module",
            moduleId: m.id,
            terminalId: t.id,
          };
          const pos = terminalPosition(m, t, layout);
          return (
            <WireDot
              key={`${m.id}-${t.id}`}
              cx={remToPx(pos.x)}
              cy={remToPx(pos.y)}
              conductor={t.conductor}
              state={dotState(ep)}
              label={`${m.label} · ${t.id}`}
              onClick={() => onTerminalClick(ep)}
            />
          );
        }),
      )}
```

Заменить на:

```tsx
      {/* module + fixture terminal dots */}
      {visibleModulesOf(scheme.modules, scheme.visibility).flatMap((m) =>
        terminalsFor(m.kind).map((t) => {
          const ep: Endpoint = {
            kind: "module",
            moduleId: m.id,
            terminalId: t.id,
          };
          const pos = terminalPosition(m, t, layout);
          return (
            <WireDot
              key={`${m.id}-${t.id}`}
              cx={remToPx(pos.x)}
              cy={remToPx(pos.y)}
              conductor={t.conductor}
              state={dotState(ep)}
              label={`${m.label} · ${t.id}`}
              onClick={() => onTerminalClick(ep)}
            />
          );
        }),
      )}
```

- [ ] **Step 3: Y-вилки сдвоенных проводов — без изменений (уже корректны)**

`wireForks` (Map `wireId → WireForkAttach`) строится из `wireIdsByKey`,
который заполняется ТОЛЬКО циклом по `scheme.wires` (не по
`scheme.modules`):

```ts
const wireIdsByKey = new Map<string, string[]>();
for (const w of scheme.wires) {
  for (const ep of [w.from, w.to] as Endpoint[]) {
    const k = endpointKey(ep);
    ...
    const arr = wireIdsByKey.get(k) ?? [];
    arr.push(w.id);
    wireIdsByKey.set(k, arr);
  }
}
```

Единственное место, где этот код обращается к `scheme.modules` —
`scheme.modules.find((mm) => mm.id === epAtFork.moduleId)` — точечный
поиск ОДНОГО модуля по id, а не обход всех модулей. Поскольку `wireForks`
целиком зависит от `scheme.wires`, а инвариант из Task 1 гарантирует, что
ни один провод не ссылается на скрытую шину/фикстуру, вилка для скрытого
элемента физически не может появиться — там просто не будет провода,
из которого она строится. Менять код не нужно. Отметить чекбокс и перейти
к Step 4.

- [ ] **Step 4: Отфильтровать цикл рендера тапов шин**

Найти:

```tsx
      {/* bus taps */}
      {BUSES.flatMap((bus) =>
        Array.from({ length: busTapCount(bus, layout) }, (_, i) => {
          const ep: Endpoint = { kind: "bus", bus, tapIndex: i };
          const pos = busTapPosition(bus, i, layout);
          return (
            <WireDot
              key={`bus-${bus}-${i}`}
              cx={remToPx(pos.x)}
              cy={remToPx(pos.y)}
              conductor={bus}
              state={dotState(ep)}
              label={`Шина ${bus} · точка ${i + 1}`}
              onClick={() => onTerminalClick(ep)}
            />
          );
        }),
      )}
```

Заменить на:

```tsx
      {/* bus taps */}
      {visibleBusesOf(scheme.visibility).flatMap((bus) =>
        Array.from({ length: busTapCount(bus, layout) }, (_, i) => {
          const ep: Endpoint = { kind: "bus", bus, tapIndex: i };
          const pos = busTapPosition(bus, i, layout);
          return (
            <WireDot
              key={`bus-${bus}-${i}`}
              cx={remToPx(pos.x)}
              cy={remToPx(pos.y)}
              conductor={bus}
              state={dotState(ep)}
              label={`Шина ${bus} · точка ${i + 1}`}
              onClick={() => onTerminalClick(ep)}
            />
          );
        }),
      )}
```

- [ ] **Step 5: Проверить сборку**

Run: `npm run build`
Expected: успешная сборка без ошибок TypeScript.

- [ ] **Step 6: Запустить тесты (регрессия)**

Run: `npm run test`
Expected: PASS — без изменений в счёте.

- [ ] **Step 7: Закоммитить**

```bash
git add src/ui/Workspace.tsx
git commit -m "$(cat <<'EOF'
WiringLayer: клеммы и тапы скрытых шин/фикстур не кликабельны

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: UI — панель чекбоксов `SchemeSettingsPanel`

**Files:**
- Create: `src/ui/SchemeSettingsPanel.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useScheme()` (из `./SchemeContext`), `visibilityImpact`,
  `type PanelVisibility` (из `../model/scheme`, Task 1).

- [ ] **Step 1: Создать `SchemeSettingsPanel.tsx`**

```tsx
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
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Подключить панель в `App.tsx`**

Найти:

```ts
import { LogPanel } from "./ui/LogPanel";
```

Заменить на:

```ts
import { LogPanel } from "./ui/LogPanel";
import { SchemeSettingsPanel } from "./ui/SchemeSettingsPanel";
```

Найти:

```tsx
          <aside className="flex h-full w-[20rem] shrink-0 flex-col border-l border-bp-line bg-bp-surfaceTransparent">
            <Inspector />
            <LogPanel entries={toLogEntries(diagnostics)} />
          </aside>
```

Заменить на:

```tsx
          <aside className="flex h-full w-[20rem] shrink-0 flex-col border-l border-bp-line bg-bp-surfaceTransparent">
            <Inspector />
            <LogPanel entries={toLogEntries(diagnostics)} />
            <SchemeSettingsPanel />
          </aside>
```

- [ ] **Step 3: Проверить сборку**

Run: `npm run build`
Expected: успешная сборка без ошибок TypeScript.

- [ ] **Step 4: Запустить тесты (регрессия)**

Run: `npm run test`
Expected: PASS — без изменений в счёте.

- [ ] **Step 5: Закоммитить**

```bash
git add src/ui/SchemeSettingsPanel.tsx src/App.tsx
git commit -m "$(cat <<'EOF'
UI: панель чекбоксов видимости шин/генератора/инвертора

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Финальная ручная проверка в браузере

**Files:** нет изменений кода — только верификация.

- [ ] **Step 1: Запустить dev-сервер**

Используй `preview_start` (конфигурация `vite` уже есть в
`.claude/launch.json`).

- [ ] **Step 2: Снять снапшот правой колонки**

`preview_snapshot` — убедиться, что под лог-панелью виден блок
`// настройки схемы` с 4 чекбоксами: "Шина L", "Шина PE (земля)",
"Генератор", "Инвертор", все включены.

- [ ] **Step 3: Снять чекбокс "Генератор" без подключённых проводов**

`preview_click` по чекбоксу "Генератор". Подтверждения быть не должно
(`visibilityImpact` вернёт пустое множество на свежей схеме). Сделать
`preview_snapshot`/`preview_screenshot` рабочей области — карточка
генератора в левой колонке должна исчезнуть.

- [ ] **Step 4: Включить обратно, подключить провод, снять чекбокс с проводом**

`preview_click` по чекбоксу "Генератор" (включить снова — карточка
вернулась). Через `preview_click` по клеммам собрать провод от
генератора до любой шины L (клик по клемме генератора, затем по тапу
шины L). Снова кликнуть чекбокс "Генератор" — должен появиться
`confirm()` диалог с текстом про удаление провода. `preview_eval` может
понадобиться, чтобы программно подтвердить системный `confirm()` (он не
управляется через DOM) — либо проверить эффект через
`window.confirm = () => true` инъекцию перед кликом, если штатный
`preview_click` не обрабатывает native dialogs.

- [ ] **Step 5: Проверить шину PE**

Аналогично Step 3 — снять чекбокс "Шина PE (земля)", сделать
`preview_screenshot`, убедиться что желто-зелёная полосатая шина внизу
панели исчезла, а синяя N-шина и L-шина (если включена) остались.

- [ ] **Step 6: Проверить персистентность**

После снятия 1-2 чекбоксов вызвать `preview_eval` с
`location.reload()`, затем `preview_snapshot` — состояние чекбоксов
должно сохраниться (не вернуться к "все включено").

- [ ] **Step 7: Финальный прогон тестов и сборки**

Run: `npm run test && npm run build`
Expected: всё зелёное, сборка без ошибок.

- [ ] **Step 8: Остановить dev-сервер**

`preview_stop`.

---

## Самопроверка плана (выполнена при написании)

- **Покрытие спеки:** модель/редьюсер — Task 1; персистентность +
  автосохранение — Task 2; рендер шин/генератора/инвертора — Task 3;
  клеммы/тапы недоступны для скрытых — Task 4; UI-чекбоксы с `confirm()` —
  Task 5; ручная проверка — Task 6. Все разделы спеки покрыты.
- **Плейсхолдеры:** не найдено — каждый шаг содержит конкретный код или
  команду с ожидаемым результатом.
- **Согласованность типов:** `visibilityImpact` возвращает
  `{ next: PanelVisibility; droppedWireIds: Set<string> }` — это же имя и
  форма используются и в Task 1 (редьюсер), и в Task 5 (UI, хотя UI читает
  только `droppedWireIds`, игнорируя `next`). `PanelVisibility` field-имена
  (`busL`, `busPE`, `generator`, `inverter`) одинаковы во всех тасках.
