// Catalog of MVP component types (CLAUDE.md §2.3).
// Used by the palette to render the 9 module cards.

import type { BreakerCurve, ComponentKind } from "./types";

export interface CatalogEntry {
  kind: ComponentKind;
  group: "input" | "branch" | "infra";
  name: string;
  spec: string;
  toneVarName: string; // tailwind colour token for the left-border tone marker
  poles?: 1 | 2;
  rated_current_A?: number;
  curve?: BreakerCurve;
  rated_leak_mA?: number;
}

export const CATALOG: CatalogEntry[] = [
  {
    kind: "main_breaker",
    group: "input",
    name: "Вводной автомат 2P",
    spec: "C 40A · 6kA",
    toneVarName: "wire-L",
    poles: 2,
    rated_current_A: 40,
    curve: "C",
  },
  {
    kind: "rcd",
    group: "input",
    name: "УЗО 2P",
    spec: "40A · 30 мА · AC",
    toneVarName: "bp-cyan",
    poles: 2,
    rated_current_A: 40,
    rated_leak_mA: 30,
  },
  {
    kind: "voltage_relay",
    group: "input",
    name: "Реле напряжения",
    spec: "УЗМ-51 · 63A",
    toneVarName: "bp-ok",
    poles: 1,
    rated_current_A: 63,
  },
  {
    kind: "three_way_switch",
    group: "input",
    name: "Сеть-0-Генератор",
    spec: "3-поз · 63A",
    toneVarName: "bp-warn",
    poles: 2,
    rated_current_A: 63,
  },
  {
    kind: "diff_breaker",
    group: "branch",
    name: "Дифавтомат 1P+N",
    spec: "C 16A · 30 мА",
    toneVarName: "bp-cyan",
    poles: 2,
    rated_current_A: 16,
    curve: "C",
    rated_leak_mA: 30,
  },
  {
    kind: "branch_breaker",
    group: "branch",
    name: "Автомат 1P · свет",
    spec: "B 10A",
    toneVarName: "wire-L",
    poles: 1,
    rated_current_A: 10,
    curve: "B",
  },
  {
    kind: "load",
    group: "infra",
    name: "Нагрузка / лампа",
    spec: "пресет 0.5 A",
    toneVarName: "bp-textDim",
    poles: 2,
    rated_current_A: 0.5,
  },
];
