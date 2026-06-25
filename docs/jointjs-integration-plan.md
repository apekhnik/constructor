# Интеграция JointJS-роутера — план продолжения

**Назначение этого документа.** Передача задачи следующему агенту. Документ
self-contained: можно начать работать, не читая историю чата, не открывая
посторонних файлов кроме указанных.

**Ветка:** `spike/jointjs-router` (от `main`). Локально, не запушена.

---

## 1. TL;DR — где мы сейчас

В проекте есть **изолированный JointJS-адаптер** в `src/wiring/jointjs/`,
который маршрутизирует **только те провода**, у которых стоит флаг
`routed_v2: true`. Остальные провода идут через существующий
`manhattanPath` / lane-router (`src/model/layout.ts`).

Флаг `routed_v2` проставляется на новые провода, если в схеме включён
`scheme.newRouterEnabled` — это управляется dev-only чекбоксом «Новый
роутер (JointJS)» в `SchemeSettingsPanel` (внизу правой колонки).

Принято решение **продолжать интеграцию** — JointJS-маршрутизация
оказалась читабельнее на сложных схемах (заключение по результатам ручной
проверки на тестовой схеме из 7 модулей и 10 проводов; см. §6.3).

Текущая точка интеграции — **P0 (база) и P1 (тесты) закрыты**, два коммита
на ветке:

```
b7ac41f Тесты: vitest для JointJS-адаптера
2c51cba Спайк: JointJS-роутер для проводов с флагом routed_v2
```

`57/57` vitest зелёные. `tsc -b --noEmit` чист. `npm run lint` показывает
только 3 pre-existing warning'а в `Sch/Sim Context.tsx`, не от спайка.

---

## 2. Что сделано (не переделывать)

### P0 — База
- `@joint/core` поставлен в `package.json`.
- Адаптер `src/wiring/jointjs/`:
  - `mirror.ts` — `buildMirror(scheme, layout)`: pure-функция, переводит
    `PlacedModule` + tap'ы шин в плоский `MirrorDescriptor` с тремя
    ролями элементов: `module` (DIN-модуль, препятствие), `bus-body`
    (тело шины, препятствие), `bus-tap` (нулевой маркер-якорь с одной
    клеммой; исключён из препятствий).
  - `router.ts` — singleton off-DOM `joint.dia.Graph` + `joint.dia.Paper`,
    прогоняет `joint.routers.manhattan` со `startDirections`/
    `endDirections` по сторонам клемм (`top`/`bottom`), с
    `excludeTypes: ['spike.BusTap']`. Возвращает `Map<wireId, Point[]>` в
    `rem`-координатах. На ошибку JointJS — soft-fail, возвращает пустой
    Map (WiringLayer тогда сам падает на `manhattanPath`).
  - `index.ts` — публичный API: только `routeWires` и `_resetForTests`.
- Поля схемы:
  - `Wire.routed_v2?: true` (опциональный).
  - `Scheme.newRouterEnabled?: boolean` (опциональный, default `false`).
  - Action `{ type: 'set_new_router', enabled }`.
  - `add_wire` reducer ставит `routed_v2: true` новым проводам, если
    `newRouterEnabled` включён.
  - `persistence.ts` — `serialize`/`deserialize` сохраняют `routed_v2` и
    `newRouterEnabled` (оба опциональные → миграция бесшовная).
- `WiringLayer` (в `src/ui/Workspace.tsx`) — три ветви маршрутизации:
  - провод **без** `routed` → `manhattanPath` (legacy)
  - провод **с** `routed: true` без `routed_v2` → lane-router
  - провод **с** `routed_v2: true` → точки из адаптера; если адаптер
    вернул пусто/упал — падает обратно к `manhattanPath`/lane-router.
- Dev-only чекбокс «Новый роутер (JointJS)» в
  `src/ui/SchemeSettingsPanel.tsx` (скрыт за `import.meta.env.DEV`).

### P1 — Тесты
- `src/wiring/jointjs/mirror.test.ts` — 8 кейсов, node-env, pure.
  Покрывают: эмиссию links только для `routed_v2`, side hint'ы клемм,
  тело + тапы шины, скрытые шины/фикстуры, ссылки на скрытые элементы,
  размер в px.
- `src/wiring/jointjs/router.test.ts` — 5 кейсов, **happy-dom**.
  Покрывают: short-circuit когда нет `routed_v2`, graceful failure
  когда JointJS не может рендерить (см. §6.1 «известное ограничение»),
  идемпотентность повторных вызовов.

---

## 3. Что осталось — план P2 → P5

Фазы перечислены **в порядке возрастания необратимости**. P2 обратима
полностью. P5 — точка невозврата (удаление старого роутера).

### P2 — Включить JointJS-роутер по умолчанию (1 день)

**Зачем.** Сейчас `newRouterEnabled` дефолтит в `false` и спрятан за
dev-флагом. Чтобы реально тестировать на боевых схемах, нужно
переключить дефолт.

**Что делать:**
1. `src/model/scheme.ts::emptyScheme()` — `newRouterEnabled: true`.
2. `src/model/persistence.ts::deserializeScheme()` — для старых сохранёнок
   (`data.newRouterEnabled === undefined`) выставлять `true` и **бэкфилить
   `routed_v2: true` КАЖДОМУ проводу** (и `routed: true`, и legacy без
   `routed`), чтобы при загрузке вся схема перепроложилась JointJS-ом
   единообразно. Это уберёт смешанные сборки.
3. `SchemeSettingsPanel`:
   - Снять `import.meta.env.DEV` — чекбокс становится обычным.
   - Переименовать в **«Использовать старый роутер»** (инверсия логики).
   - Сохранить семантику: переключение влияет на **новые** провода;
     существующие сохраняют свой `routed_v2`. Это важно для отладки —
     можно создать провод обоими роутерами в одной схеме и сравнить.
4. **Не** удалять старый код роутинга (`manhattanPath`, `routedPath`,
   lane-assignment в `WiringLayer`). Это fallback ещё минимум один цикл.
5. Тесты: добавить тест в `persistence.test.ts` (создать, если нет)
   что миграция выставляет `routed_v2` старым проводам.

**Deliverable:** один коммит. Можно мерджить в `main`, если P1-чекбокс
показал «всё хорошо».

### P3 — Тюнинг под наш стиль (полдня-день, итерационно)

**Открытый вопрос.** На текущей тестовой схеме JointJS гонит провода
через **вертикальные межслотные коридоры** (свободные слоты как
вертикальные каналы). Наш lane-router предпочитает **горизонтальный
канал между рейками**. Эстетика разная. На сложных схемах JointJS
выглядит лучше; на простых — длиннее.

**Что попробовать:**
1. Подбор `step` (сейчас 6 px) и `padding` (сейчас 8 px) в `router.ts`.
   Уменьшение `step` → провода точнее ложатся в межслотные gap'ы (наш
   `SLOT_GAP_REM = 0.6 rem = 9.6 px`).
2. **Per-conductor предпочтения каналов.** Сейчас все провода равноправны.
   Реальные щиты соблюдают:
   - L уходит вниз/вверх к шине L (наверху)
   - N уходит вверх к шине N (наверху, рядом с L)
   - PE уходит вниз к шине PE (внизу)
   Сделать это можно через **невидимые «направляющие» Rectangle** в
   `mirror.ts` — узкие вертикальные коридоры на нужных X, с типом
   `spike.LRoute`/`spike.NRoute`/`spike.PERoute`. Логика инверсная:
   `excludeTypes` в опциях роутера ВЫКЛЮЧАЕТ препятствие. Для L-провода
   передаём `excludeTypes: ['spike.LRoute', 'spike.BusTap']` — L-маршрут
   больше не препятствие, и провод L пройдёт по нему. Для N-провода —
   `excludeTypes: ['spike.NRoute', 'spike.BusTap']`. Остальные маршруты
   остаются препятствиями, провод их обходит.
   Альтернатива (проще): передавать в роутер параметр `paperOptions:
   { strategies: { pathfindingHeuristic } }` с custom-эвристикой. Это
   глубже в JointJS, лучше отложить.
3. **Анкеры на клеммах.** Сейчас провод входит в порт клеммы из
   «ближайшей точки на bounding-box» — может не точно в центр клеммы.
   В `router.ts` к `link` добавить
   `connectionPoint: { name: 'anchor' }` и `sourceAnchor: { name:
   'center' }` / `targetAnchor: { name: 'center' }`.

**Deliverable:** провода визуально легли так, как мы хотим. Один коммит
после каждой удачной итерации.

### P4 — Производительность (полдня, **только если измерим**)

**Текущая проблема.** В `Workspace.tsx::WiringLayer`:
```ts
const routedV2 = useMemo(() => routeWires(scheme, layout), [scheme, layout]);
```
Зависимость — весь `scheme`. Это значит **`routeWires` пересчитывается
после каждого `selectedId`/`pendingFrom`/`selectedWireId`-изменения**,
то есть на каждый клик.

**Что делать:**
1. Вынести структурную часть схемы (modules, wires, visibility, panelMode,
   source.gen_active — всё, что влияет на routing) в **отдельный
   мемо-ключ**. Транзитные поля (selection, pending) не должны
   инвалидировать роутинг.
2. **Опционально**: инкрементальная синхронизация `joint.dia.Graph` —
   `graph.clear()` сейчас вызывается на каждый пересчёт. Можно делать
   diff с предыдущим состоянием. Это правильная оптимизация, но имеет
   смысл только если P4.1 не хватило.
3. **Бенчмарк.** Замерить на схемах 20/50/100 проводов через
   `console.time('routeWires')`. Если медленнее 16 ms на 100 — крутить
   P4.2 или ограничивать инвалидацию ещё уже.

**Deliverable:** подтверждённый порог масштабируемости. Если упёрлись —
честно зафиксировать в этом документе.

### P5 — Удалить старый код (точка невозврата)

**Когда делать.** Только после **минимум 2 недель эксплуатации P2** без
найденных регрессий.

**Что удалять:**
1. `src/model/layout.ts`: функции `manhattanPath`, `routedPath`,
   `pickZoneIndex`, `nearestGapX`, константы `LANE_STEP_REM`,
   `LANE_LIFT_REM`, `CONDUCTOR_LANE_BIAS`. Это сразу ~150 строк.
2. `src/ui/Workspace.tsx`:
   - Удалить `WirePath` props: `laneMeta`, `fallbackMidYOffset`,
     `fallbackPreferredColumnX`, `obstacles` (последний нужен только
     manhattanPath).
   - Удалить весь блок lane-assignment в `WiringLayer`
     (`laneIsSafe`, `routedByBucket`, `fallbackByConductor`,
     `fallbackMidYOffsets`, `fallbackPreferredColumnX`,
     `CONDUCTOR_FALLBACK_BIAS`, `railBodies` и т.д.). Это ~200 строк.
   - В `WirePath` оставить только ветку JointJS-точек. Никаких
     `routedPath`/`manhattanPath` вызовов.
3. `src/model/scheme.ts`:
   - Удалить поля `Wire.routed_v2` и `Wire.routed` (оба несут информацию
     только для устаревших роутеров; после P5 единственный роутер —
     JointJS, флаги избыточны). Оставить чтение этих полей в
     `persistence.deserializeScheme` для backward-compat загрузки старых
     JSON, но в рантайме их игнорировать.
   - Удалить поле `Scheme.newRouterEnabled` и action `set_new_router`.
4. `SchemeSettingsPanel`: удалить чекбокс «Использовать старый роутер».
5. `persistence.ts`: убрать поля из serialize, в deserialize оставить
   only-read для backward compat (несколько релизов).
6. Тесты: обновить `mirror.test.ts` (роль routed_v2 пропадает), удалить
   short-circuit-кейсы (теперь JointJS вызывается всегда).

**Deliverable:** один большой коммит «удалить legacy router». Diff
`-450 +5` примерно. README/CLAUDE.md обновить (см. ниже).

---

## 4. Открытые вопросы / точки риска

1. **JointJS не работает под jsdom/happy-dom** (Vectorizer не умеет
   измерять SVG-bbox без реального рендера). Поэтому `router.test.ts`
   проверяет только контракты адаптера (short-circuit, graceful failure),
   а **геометрия маршрутов проверяется руками в браузере**. Это
   ограничение — если P5 случится и lane-router удалится, отсутствие
   геометрических тестов означает «регрессия маршрута видна только
   глазами». Mitigations:
   - Поднять Playwright (E2E) для критичных кейсов.
   - Или оставлять небольшую коллекцию canonical-схем под `screenshots/`
     и diff'ить SVG руками на ревью.
2. **Бандл +~200 KB gzipped** от `@joint/core`. Учесть в чек-листе
   релиза. Если это становится проблемой — `dynamic import` адаптера
   (загружается только когда есть `routed_v2` провода).
3. **Эстетика на маленьких схемах** (3-4 провода). JointJS делает
   длиннее, чем lane-router. Если такие пользовательские схемы будут
   частыми — обдумать гибрид (короткие провода → старый, длинные →
   JointJS). Но это противоречит цели P5.
4. **Source/generator/inverter — фикстуры с rail=-1 и rail=0**.
   `moduleRect` обрабатывает их особыми ветвями (см.
   `src/model/layout.ts`). JointJS видит их как обычные `module`-роли
   препятствия. Проверить на сложных сборках с генератором/инвертором,
   нет ли там кривых маршрутов.
5. **Source в supply-зоне** — `m.rail === 0`. В `moduleRect` это
   попадает в дефолтную ветку с `railModuleTopY(0)`. Если эта функция
   возвращает странное значение — провода от source поедут не туда.
   Стоит проверить визуально.

---

## 5. Файлы — карта

### Адаптер (только эта папка импортирует `@joint/core`)
- `src/wiring/jointjs/mirror.ts` — Scheme → MirrorDescriptor (pure)
- `src/wiring/jointjs/router.ts` — MirrorDescriptor → Map<wireId, Point[]>
- `src/wiring/jointjs/index.ts` — публичный API (`routeWires`,
  `_resetForTests`, тип `RoutedPath`)
- `src/wiring/jointjs/mirror.test.ts` — pure unit-тесты
- `src/wiring/jointjs/router.test.ts` — adapter contracts (happy-dom)

### Точки интеграции в model/ui
- `src/model/scheme.ts`:
  - `Wire.routed_v2?: true`
  - `Scheme.newRouterEnabled?: boolean`
  - action `set_new_router`
  - в `add_wire` reducer выставление флага
- `src/model/persistence.ts`: serialize/deserialize этого поля
- `src/ui/Workspace.tsx`: импорт `routeWires`, `useMemo` в `WiringLayer`,
  prop `routedV2Path` в `WirePath`
- `src/ui/SchemeSettingsPanel.tsx`: dev-чекбокс

### Не трогать (другие фичи проекта)
- `src/model/simulation.ts`, `src/model/graph.ts`, `src/model/analysis.ts`,
  `src/engine/runtime.ts` — это симулятор, к маршрутизации отношения не
  имеет.

---

## 6. Воспроизведение / проверка

### 6.1 Локальный запуск
```bash
git checkout spike/jointjs-router
npm install
npm run dev       # http://localhost:5173
npm run test      # 57/57
npx tsc -b --noEmit
```

### 6.2 Ручная проверка
1. Открой `:5173`.
2. Внизу правой панели в «Настройки схемы» поставь чекбокс «Новый
   роутер (JointJS)». Он виден только в dev-сборке.
3. Собери схему: ввод → УЗО → 2P-автомат → нагрузка с PE.
4. Создавай провода click-click. Они получат `routed_v2: true` и пойдут
   через JointJS.
5. Сравни с проводом без флага: сними галку, создай ещё один провод —
   он пойдёт через lane-router.

### 6.3 Что было проверено в спайке
- Тестовая схема в localStorage (`electroshield:scheme:v1`): 7 модулей,
  10 проводов, 3 из них с `routed_v2`.
- Провода routed_v2 (`w5/w6/w7` в тесте):
  - `w5 main_breaker.out_L → rcd.in_L`: спустился под рейку 1 → через
    свободный slot 2 → поднялся над рейкой → к rcd.in_L. **Через
    свободный коридор**, обошёл модули.
  - `w7 rcd.out_L → branch_breaker.in_L`: между рейками 1 и 2, через
    левый свободный край.
- Провода без флага (`w1-w4`, `w8-w10`): короткие Z-зигзаги по старому
  manhattanPath/lane-router.

### 6.4 Знакомый набор тестовых данных
В `docs/jointjs-integration-plan.md` нет встроенной фикстуры. Можно
взять из истории коммитов или собрать вручную. Стандартная сборка
для проверки:
- main_breaker (slot 0, rail 1)
- rcd (slot 3, rail 1)
- branch_breaker (slot 0, rail 2)
- load (slot 0, rail loads)
- Провода: source→bus L/N, bus→main_breaker, main_breaker→rcd (через
  JointJS), rcd→branch_breaker (через JointJS), branch_breaker→load,
  PE bus→load.

---

## 7. Откат / сценарий no-go

Если в ходе P3/P4 окажется, что JointJS не приживается:

1. **Не делать P5.** Старый код роутинга стоит на месте, fallback живой.
2. Сделать `Scheme.newRouterEnabled` дефолтом `false` (вернуть как
   было).
3. Скрыть чекбокс снова за `import.meta.env.DEV` или удалить совсем.
4. Существующие сохранёнки с `routed_v2: true` либо мигрировать обратно
   (выставлять `undefined`), либо оставить как есть — `WiringLayer`
   gracefully отвалится на `manhattanPath`/lane-router, потому что
   `routeWires` вернёт пустой Map (если в `Scheme.newRouterEnabled` стоит
   `false` — это надо проверить и при необходимости добавить ранний
   exit в `router.ts`).
5. **Не удалять** `src/wiring/jointjs/` сразу — оставить как
   архивированный спайк хотя бы на цикл. Удаление: `git rm -r
   src/wiring && npm uninstall @joint/core jsdom happy-dom`.

Размер отката из mainline-режима: 1-2 коммита.

---

## 8. Контекст-минимум для агента

Если читаешь это первый раз:
- Прочитай `CLAUDE.md` (он в `.gitignore`, локальный) — это техзадание
  всего проекта. §0 «Быстрый старт» — 5 минут.
- Прочитай этот документ.
- Прочитай два коммита (см. §1) через `git show`.
- Не читай старого роутера (`manhattanPath`/`routedPath` в `layout.ts`),
  пока не нужно — он >300 строк, прокрастинация.
- На вопросы по дизайну (зачем именно так): этот документ + комментарии
  в `src/wiring/jointjs/*.ts` должны хватить. Если нет — спроси
  пользователя, не угадывай.

**Не делать без согласования с пользователем:**
- Менять структуру `MirrorDescriptor` (контракт между mirror и router).
- Удалять старый роутер (`manhattanPath`/`routedPath`) — это P5, точка
  невозврата.
- Менять формат сохранения схемы (`persistence.ts` version).
- Пушить ветку — она локальная.
