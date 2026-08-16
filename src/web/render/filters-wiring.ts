/**
 * 筛选接线 — 搜索框事件绑定 + 筛选状态读取
 *
 * 筛选 chip 的点击事件由 filter-drawer.ts 统一处理(状态驱动)。
 * 本模块只负责:
 *  - 搜索框(input)的防抖接线
 *  - 把 state 里的筛选值同步为 chip active 状态(供抽屉渲染)
 */

import type { AtlasFilter, EventFilter } from "../js/types/index.js";
import { state } from "../js/state.js";
import { $ } from "../js/utils.js";

type FilterObj = AtlasFilter | EventFilter | Record<string, string | undefined>;

export function wireSearch(inputSel: string, filterObj: FilterObj, onFilterChange?: () => void): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const input = $(inputSel) as HTMLInputElement | null;
  if (!input) return;
  input.addEventListener("input", () => {
    const v = input.value;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      (filterObj as unknown as Record<string, string>).q = v.trim();
      const f = filterObj as unknown as Record<string, string>;
      // 输入搜索词时清空「我的收藏」筛选 (保持"搜索优先"的一致行为)
      if (f.q) {
        f.own = "";
        if (filterObj === state.atlasFilter) {
          resetMineRow("#atlasMineFilterRow");
        } else if (filterObj === state.eventFilter) {
          resetMineRow("#eventMineFilterRow");
        }
      }
      if (onFilterChange) onFilterChange();
    }, 200);
  });
}

function resetMineRow(rootSel: string): void {
  const root = $(rootSel);
  if (!root) return;
  root.querySelectorAll<HTMLElement>(".chip").forEach(c => c.classList.remove("active"));
}

/** 从 state 读取 atlas 筛选值 (供抽屉初始化 chip 状态) */
export function atlasActiveValues(): Record<string, string> {
  return { ...state.atlasFilter } as unknown as Record<string, string>;
}

/** 从 state 读取 event 筛选值 (供抽屉初始化 chip 状态) */
export function eventsActiveValues(): Record<string, string> {
  return { ...state.eventFilter } as unknown as Record<string, string>;
}

/** 把抽屉里的 active chip 值写回 state.atlasFilter (由 filter-drawer 在完成时调用) */
export function applyAtlasFromDrawer(values: Record<string, string>): void {
  const f = state.atlasFilter as unknown as Record<string, string>;
  for (const k of Object.keys(state.atlasFilter)) {
    f[k] = values[k] ?? "";
  }
}

/** 把抽屉里的 active chip 值写回 state.eventFilter */
export function applyEventFromDrawer(values: Record<string, string>): void {
  const f = state.eventFilter as unknown as Record<string, string>;
  for (const k of Object.keys(state.eventFilter)) {
    f[k] = values[k] ?? "";
  }
}

/** 装配全部接线 (由 app.ts 调用) */
export function setupFilters(onFilterChange: () => void): void {
  // 搜索框
  wireSearch("#atlasSearch", state.atlasFilter, onFilterChange);
  wireSearch("#eventSearch", state.eventFilter, onFilterChange);

  // 常驻「我的收藏」筛选行 (186 / Events)
  wireOwnRow("#atlasMineFilterRow", state.atlasFilter, onFilterChange);
  wireOwnRow("#eventMineFilterRow", state.eventFilter, onFilterChange);
}

/** 常驻「我的收藏」行: 单选 own, 点选即生效, 再点一次取消 */
function wireOwnRow(rootSel: string, filterObj: FilterObj, onFilterChange: () => void): void {
  const root = $(rootSel);
  if (!root) return;
  root.addEventListener("click", (e: Event) => {
    const chip = (e.target as HTMLElement).closest(".chip") as HTMLElement | null;
    if (!chip || !root.contains(chip)) return;
    const wasActive = chip.classList.contains("active");
    root.querySelectorAll<HTMLElement>(".chip").forEach(c => c.classList.remove("active"));
    if (!wasActive) chip.classList.add("active");
    (filterObj as unknown as Record<string, string>).own = wasActive ? "" : (chip.dataset.value || "");
    // 切换收藏筛选时清空搜索词 (与抽屉筛选一致)
    if (filterObj === state.atlasFilter) {
      const searchBox = $("#atlasSearch") as HTMLInputElement | null;
      if (searchBox) { searchBox.value = ""; state.atlasFilter.q = ""; }
    } else if (filterObj === state.eventFilter) {
      const searchBox = $("#eventSearch") as HTMLInputElement | null;
      if (searchBox) { searchBox.value = ""; state.eventFilter.q = ""; }
    }
    onFilterChange();
  });
}
