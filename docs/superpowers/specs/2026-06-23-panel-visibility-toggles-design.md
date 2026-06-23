# Переключатели видимости: шина L, шина PE, генератор, инвертор

## Зачем

Не каждая сборка щита нуждается во всех элементах: иногда схему собирают
без отдельной шины L/PE (соединяя модули напрямую проводами), а резервный
генератор и инвертор актуальны не всегда. Сейчас все четыре элемента
рисуются на схеме всегда. Нужны чекбоксы, которые позволяют скрыть
ненужное и убрать визуальный шум.

Шина N (рабочий ноль) остаётся обязательной всегда — без неё нельзя
осмысленно собрать ни одну рабочую цепь, прятать её нет смысла.

## Объём

В рамках этой задачи:
- 4 независимых булевых переключателя: шина L, шина PE, генератор, инвертор.
- Переключатели хранятся в `Scheme` и сохраняются вместе со схемой
  (localStorage + экспорт/импорт JSON), как `panelMode`.
- При скрытии элемента, к которому подключены провода, эти провода
  автоматически удаляются (с подтверждением через `confirm()`, если что-то
  реально будет удалено — по аналогии с уже существующим
  `PanelModeSwitcher`).
- При скрытии шина/генератор/инвертор не рисуются и их клеммы недоступны
  для кликов; место в layout не "сжимается" — слой раскладки (`layout.ts`)
  не меняется вообще.

Вне объёма:
- Скрытие шины N.
- Изменения в `simulation.ts` / `graph.ts` / `analysis.ts` — поведение
  электрической модели не меняется, потому что скрытие гарантированно
  обрывает все провода к скрытому элементу, и он становится электрически
  изолированным сам по себе (как если бы его вообще не было в схеме).
- Пересчёт геометрии `layout.ts` под "сжатие" — оставляем зарезервированное
  место пустым.

## Модель данных

`src/model/scheme.ts`:

```ts
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

`Scheme` получает новое поле:

```ts
export interface Scheme {
  // ...существующие поля...
  visibility: PanelVisibility;
}
```

`emptyScheme()` инициализирует `visibility: defaultVisibility()`.

**Инвариант, который должен поддерживаться всегда**: если
`visibility.X === false`, то в `scheme.wires` не должно быть ни одного
провода, чьи `from`/`to` указывают на скрытый элемент X. Этот инвариант
обеспечивается исключительно в редьюсере (см. ниже) и не проверяется
динамически где-либо ещё — рендер и `canConnect` полагаются на то, что он
уже выполнен.

## Редьюсер

Новое действие:

```ts
| { type: "set_visibility"; patch: Partial<PanelVisibility> }
```

Чистая функция предпросмотра воздействия (мирроринг `panelModeImpact`):

```ts
export function visibilityImpact(
  scheme: Scheme,
  patch: Partial<PanelVisibility>,
): { droppedWireIds: Set<string> } {
  const next = { ...scheme.visibility, ...patch };
  const droppedWireIds = new Set<string>();
  for (const w of scheme.wires) {
    const touches = (ep: Endpoint): boolean => {
      if (ep.kind === "bus") {
        if (ep.bus === "L" && !next.busL) return true;
        if (ep.bus === "PE" && !next.busPE) return true;
        return false;
      }
      if (!next.generator && ep.moduleId === "fixture_generator") return true;
      if (!next.inverter && ep.moduleId === "fixture_inverter") return true;
      return false;
    };
    if (touches(w.from) || touches(w.to)) droppedWireIds.add(w.id);
  }
  return { droppedWireIds };
}
```

Обработчик в `schemeReducer`:

```ts
case "set_visibility": {
  const { droppedWireIds } = visibilityImpact(scheme, action.patch);
  return {
    ...scheme,
    visibility: { ...scheme.visibility, ...action.patch },
    wires: scheme.wires.filter((w) => !droppedWireIds.has(w.id)),
    selectedWireId:
      scheme.selectedWireId && droppedWireIds.has(scheme.selectedWireId)
        ? null
        : scheme.selectedWireId,
    selectedId:
      scheme.selectedId === "fixture_generator" && action.patch.generator === false
        ? null
        : scheme.selectedId === "fixture_inverter" && action.patch.inverter === false
          ? null
          : scheme.selectedId,
    pendingFrom: null,
  };
}
```

(Решение очистки `selectedId` для шин не нужно — шина никогда не была
`selectedId`, только `selectedWireId` через провода или `pendingFrom` через
клемму-тап; `pendingFrom` сбрасывается безусловно, как и в `set_panel_mode`.)

## UI: применение действия с подтверждением

В новой панели чекбоксов (`SchemeSettingsPanel`) каждый чекбокс перед
вызовом `dispatch` проверяет `visibilityImpact`:

```ts
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
```

## Рендер (`src/ui/Workspace.tsx`)

Внутри `Workspace()` (точка, где уже есть `scheme` и реактивный доступ к
`scheme.visibility`):

```ts
const visibleModules = useMemo(
  () =>
    scheme.modules.filter((m) => {
      if (m.kind === "generator") return scheme.visibility.generator;
      if (m.kind === "inverter") return scheme.visibility.inverter;
      return true;
    }),
  [scheme.modules, scheme.visibility.generator, scheme.visibility.inverter],
);

const visibleBuses = useMemo(
  () =>
    BUSES.filter((b) => {
      if (b === "L") return scheme.visibility.busL;
      if (b === "PE") return scheme.visibility.busPE;
      return true; // N всегда видима
    }),
  [scheme.visibility.busL, scheme.visibility.busPE],
);
```

- `leftModules` вычисляется из `visibleModules` (а не из `scheme.modules`)
  — если генератора/инвертора нет в отфильтрованном списке,
  `LeftSourcesLayer` их просто не находит и не рисует. Никаких новых пропсов
  на `GeneratorBox`/`InverterBox`/`LeftSourcesLayer` не требуется.
- `<BusBarsLayer layout={layout} buses={visibleBuses} />` — новый проп
  `buses: readonly BusName[]`, рендерится только `visibleBuses.map(...)`.
- Внутри `WiringLayer` (уже получает полный `scheme`):
  - `obstacles` — исключить модули, кроме как через `visibleModules`-эквивалентный
    фильтр (генератор/инвертор, если скрыты).
  - Цикл рендера точек-клемм модулей — перебирать `visibleModules` вместо
    `scheme.modules`.
  - Цикл рендера Y-вилок для сдвоенных проводов — тоже по `visibleModules`.
  - Цикл рендера тапов шин — перебирать `visibleBuses` вместо `BUSES`.

`simulation.ts`, `graph.ts`, `analysis.ts`, `layout.ts` не меняются.

## Персистентность (`src/model/persistence.ts`)

```ts
interface SerializedScheme {
  // ...
  visibility?: PanelVisibility;
}

// serializeScheme: добавить `visibility: scheme.visibility`.

// deserializeScheme:
visibility: { ...defaultVisibility(), ...data.visibility },
```

Старые сохранённые схемы (без поля `visibility`) при загрузке получают
все четыре переключателя включёнными — поведение не меняется относительно
текущего состояния.

## UI-панель (`src/ui/SchemeSettingsPanel.tsx`, новый файл)

Размещение: `App.tsx`, внутри `<aside>`, после `<LogPanel/>`. `LogPanel`
остаётся `flex-1` (растягивается), новая панель — `shrink-0` (фиксированной
высоты), закреплена в самом низу колонки.

Содержимое: заголовок `// настройки схемы` (тот же mono/uppercase стиль,
что и у `// инспектор`, `// лог · почему сработало`), затем 4 строки с
нативными `<input type="checkbox">` и подписями:
- Шина L
- Шина PE (земля)
- Генератор
- Инвертор

Каждый чекбокс — controlled, значение из `scheme.visibility.*`, `onChange`
вызывает `apply({ <key>: !current })` (с подтверждением через
`visibilityImpact`, см. выше).

## Тесты

CLAUDE.md требует vitest строго для новой логики в `model/simulation.ts`
и `model/analysis.ts`; `scheme.ts` под это формальное требование не
попадает, но новая логика здесь нетривиальна (удаление проводов,
сброс selection), так что покрываем её тестами по тому же духу. Новый
файл `src/model/scheme.test.ts`, не трогаем `simulation.test.ts` —
разная область (`scheme.ts` — структура и редьюсер, `simulation.ts` —
электрическое поведение). Тест-кейсы:
- скрытие шины L (`set_visibility({ busL: false })`) удаляет провода,
  подключённые к её тапам, и не трогает провода на шине N/PE;
- скрытие генератора удаляет провода к его клеммам и не трогает провода
  инвертора;
- скрытие выбранного (`selectedId`) генератора/инвертора сбрасывает
  `selectedId` в `null`;
- скрытие элемента, к которому подключён выбранный провод
  (`selectedWireId`), сбрасывает `selectedWireId` в `null`;
- повторное включение (`set_visibility({ busL: true })`) не восстанавливает
  ранее удалённые провода — ожидаемое поведение, как и у `set_panel_mode`;
- `visibilityImpact` возвращает пустое множество, если скрываемый элемент
  ни с чем не соединён.

## Чек-лист соответствия инвариантам CLAUDE.md

- `model/` и `engine/` не зависят от React/DOM — `visibilityImpact`/редьюсер
  это чистые функции в `scheme.ts`, без UI-зависимостей.
- Геометрия только из `model/layout.ts` — не меняется, новые пропсы
  (`buses`) не вводят свою геометрию, только список того, что рисовать.
- Сообщения для пользователя — на русском (`confirm()` текст, подписи
  чекбоксов).
