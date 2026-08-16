/**
 * 筛选和搜索逻辑
 */

import type { Pig, AtlasFilter, EventFilter } from "./types/index.js";
import { state } from "./state.js";
import { pigPicky, pigIsOwned } from "./utils.js";
import { pigHasMethod, pigMatchesShopRank, pigMatchesHunt } from "./data.js";

type FilterLike = Record<string, string | undefined>;

// 收藏状态筛选 (own: yes / no / no_small / no_big)
function passOwnedFilter(p: Pig, own: string | undefined): boolean {
  if (!own) return true;
  const isOwn = pigIsOwned(p);
  if (own === "yes") return isOwn;
  if (own === "no") return !isOwn;
  if (own === "no_small") return isOwn && !state.smallBadges.has(p.pNo);
  if (own === "no_big") return isOwn && !state.bigBadges.has(p.pNo);
  return true;
}

// 筛选猪列表
export function filterPigs(pigs: Pig[], filter: FilterLike): Pig[] {
  const { color, rare, method, q, huntRegion, huntTicket, shopRank, graze, picky, own } = filter;
  const ql = (q || "").toLowerCase();
  return pigs.filter(p => {
    if (color && p.color_text !== color) return false;
    if (rare && String(p.rare) !== rare) return false;
    if (method && !pigHasMethod(p, method)) return false;
    if (method === "hunt" && !pigMatchesHunt(p, huntRegion || "", huntTicket || "")) return false;
    if (method === "shop" && !pigMatchesShopRank(p, shopRank || "")) return false;
    if (graze === "yes" && !p.isExer) return false;
    if (graze === "no" && p.isExer) return false;
    if (picky && pigPicky(p).level !== picky) return false;
    if (!passOwnedFilter(p, own)) return false;
    if (ql) {
      const hay = ((p.name || "") + " " + (p.description || "") + " " + (p.pNo ?? "")).toLowerCase();
      if (!hay.includes(ql)) return false;
    }
    return true;
  });
}

// 排序猪列表
export function sortPigs(pigs: Pig[]): Pig[] {
  return pigs.slice().sort((a, b) =>
    (a.book! - b.book!) || (a.page! - b.page!) || (a.slot! - b.slot!) || (a.pNo - b.pNo)
  );
}

// 活动猪筛选
export function filterEventPigs(pigs: Pig[], filter: FilterLike): Pig[] {
  const { color, rare, q, graze, picky, own } = filter;
  const ql = (q || "").toLowerCase();
  return pigs.filter(p => {
    if (color && p.color_text !== color) return false;
    if (rare && String(p.rare) !== rare) return false;
    if (graze === "yes" && !p.isExer) return false;
    if (graze === "no" && p.isExer) return false;
    if (picky && pigPicky(p).level !== picky) return false;
    if (!passOwnedFilter(p, own)) return false;
    if (ql) {
      const hay = ((p.name || "") + " " + (p.description || "") + " " + (p.pNo ?? "")).toLowerCase();
      if (!hay.includes(ql)) return false;
    }
    return true;
  });
}

// 获取当前筛选后的猪列表
export function currentAtlasPigs(): Pig[] {
  return sortPigs(filterPigs([...state.pigsById.values()], state.atlasFilter as unknown as FilterLike));
}

export function currentEventPigs(): Pig[] {
  const pigs = filterEventPigs([...state.eventPigsById.values()], state.eventFilter as unknown as FilterLike);
  return pigs.sort((a, b) => (a.pNo - b.pNo));
}
