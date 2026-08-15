/**
 * 筛选接线 — 筛选 chip / 搜索框的事件绑定
 *
 * 从 app.ts 抽出。wire 函数通过注入的 onChange 回调通知刷新,
 * 避免依赖 app.ts 的 render() (防止循环依赖)。
 */

import type { AtlasFilter, EventFilter, MineFilter } from "../js/types/index.js";
import { state } from "../js/state.js";
import { $, $$ } from "../js/utils.js";

type FilterObj = AtlasFilter | EventFilter | MineFilter | Record<string, string | undefined>;

export function resetChipRow(rootSel: string): void {
  $$(".chip", $(rootSel) || document.body).forEach(c =>
    c.classList.toggle("active", c.dataset.value === ""));
}

export function wireFilter(rootSel: string, filterObj: FilterObj, key: string, onChange?: (v: string) => void, onFilterChange?: () => void): void {
  const root = $(rootSel);
  if (!root) return;
  root.addEventListener("click", (e: Event) => {
    const chip = (e.target as HTMLElement).closest(".chip") as HTMLElement | null;
    if (!chip) return;
    $$(".chip", root).forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    (filterObj as unknown as Record<string, string>)[key] = chip.dataset.value || "";
    // 切换筛选时清空对应的搜索框
    if (filterObj === state.atlasFilter) {
      const searchBox = $("#atlasSearch") as HTMLInputElement | null;
      if (searchBox) { searchBox.value = ""; state.atlasFilter.q = ""; }
    } else if (filterObj === state.eventFilter) {
      const searchBox = $("#eventSearch") as HTMLInputElement | null;
      if (searchBox) { searchBox.value = ""; state.eventFilter.q = ""; }
    } else if (filterObj === state.mineFilter) {
      const searchBox = $("#mineSearch") as HTMLInputElement | null;
      if (searchBox) { searchBox.value = ""; state.mineFilter.q = ""; }
    }
    if (onChange) onChange(chip.dataset.value || "");
    if (onFilterChange) onFilterChange();
  });
}

export function makeMethodSubUpdater(prefix: string, filterObj: Record<string, string | undefined>): () => void {
  const id = (base: string): string => prefix
    ? prefix + base[0].toUpperCase() + base.slice(1)
    : base;
  const regionSel = `#${id("huntRegionFilter")}`;
  const ticketSel = `#${id("huntTicketFilter")}`;
  const shopSel = `#${id("shopRankFilter")}`;
  return function update() {
    const m = filterObj.method;
    const showHunt = m === "hunt", showShop = m === "shop";
    const r = $(regionSel) as HTMLElement | null;
    const t = $(ticketSel) as HTMLElement | null;
    const s = $(shopSel) as HTMLElement | null;
    if (r) r.style.display = showHunt ? "" : "none";
    if (t) t.style.display = showHunt ? "" : "none";
    if (s) s.style.display = showShop ? "" : "none";
    if (!showHunt) {
      filterObj.huntRegion = ""; filterObj.huntTicket = "";
      resetChipRow(regionSel); resetChipRow(ticketSel);
    }
    if (!showShop) {
      filterObj.shopRank = "";
      resetChipRow(shopSel);
    }
  };
}

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
      if (f.q) {
        if (filterObj === state.atlasFilter) {
          f.color = ""; f.rare = ""; f.method = "";
          f.huntRegion = ""; f.huntTicket = "";
          f.shopRank = ""; f.graze = ""; f.picky = "";
          resetChipRow("#atlasColorFilter"); resetChipRow("#atlasRareFilter");
          resetChipRow("#atlasMethodFilter"); resetChipRow("#atlasGrazeFilter");
          resetChipRow("#atlasPickyFilter"); resetChipRow("#atlasHuntRegionFilter");
          resetChipRow("#atlasHuntTicketFilter"); resetChipRow("#atlasShopRankFilter");
        } else if (filterObj === state.eventFilter) {
          f.color = ""; f.rare = "";
          f.graze = ""; f.picky = "";
          resetChipRow("#eventColorFilter"); resetChipRow("#eventRareFilter");
          resetChipRow("#eventGrazeFilter"); resetChipRow("#eventPickyFilter");
        } else if (filterObj === state.mineFilter) {
          f.color = ""; f.rare = "";
          f.owned = ""; f.small = ""; f.big = "";
          resetChipRow("#mineColorFilter"); resetChipRow("#mineRareFilter");
          resetChipRow("#mineOwnedFilter"); resetChipRow("#mineSmallFilter");
          resetChipRow("#mineBigFilter");
        }
      }
      if (onFilterChange) onFilterChange();
    }, 200);
  });
}

/** 装配全部筛选接线 (由 app.ts 调用) */
export function setupFilters(onFilterChange: () => void): void {
  const updateAtlasMethodSub = makeMethodSubUpdater("atlas", state.atlasFilter as unknown as Record<string, string | undefined>);

  // 186图鉴 tab
  wireFilter("#atlasColorFilter", state.atlasFilter, "color", undefined, onFilterChange);
  wireFilter("#atlasRareFilter", state.atlasFilter, "rare", undefined, onFilterChange);
  wireFilter("#atlasGrazeFilter", state.atlasFilter, "graze", undefined, onFilterChange);
  wireFilter("#atlasPickyFilter", state.atlasFilter, "picky", undefined, onFilterChange);
  wireFilter("#atlasMethodFilter", state.atlasFilter, "method", updateAtlasMethodSub, onFilterChange);
  wireFilter("#atlasHuntRegionFilter", state.atlasFilter, "huntRegion", undefined, onFilterChange);
  wireFilter("#atlasHuntTicketFilter", state.atlasFilter, "huntTicket", undefined, onFilterChange);
  wireFilter("#atlasShopRankFilter", state.atlasFilter, "shopRank", undefined, onFilterChange);

  // Events图鉴 tab
  wireFilter("#eventColorFilter", state.eventFilter, "color", undefined, onFilterChange);
  wireFilter("#eventRareFilter", state.eventFilter, "rare", undefined, onFilterChange);
  wireFilter("#eventGrazeFilter", state.eventFilter, "graze", undefined, onFilterChange);
  wireFilter("#eventPickyFilter", state.eventFilter, "picky", undefined, onFilterChange);

  // 我的 tab
  wireFilter("#mineColorFilter", state.mineFilter, "color", undefined, onFilterChange);
  wireFilter("#mineRareFilter", state.mineFilter, "rare", undefined, onFilterChange);
  wireFilter("#mineOwnedFilter", state.mineFilter, "owned", undefined, onFilterChange);
  wireFilter("#mineSmallFilter", state.mineFilter, "small", undefined, onFilterChange);
  wireFilter("#mineBigFilter", state.mineFilter, "big", undefined, onFilterChange);

  // 搜索框
  wireSearch("#atlasSearch", state.atlasFilter, onFilterChange);
  wireSearch("#eventSearch", state.eventFilter, onFilterChange);
  wireSearch("#mineSearch", state.mineFilter, onFilterChange);
}
