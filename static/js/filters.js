/**
 * 筛选和搜索逻辑
 */

import { state } from './state.js';
import { pigPicky, pigIsOwned } from './utils.js';
import { pigHasMethod, pigMatchesShopRank, pigMatchesHunt } from './data.js';

// 筛选猪列表
export function filterPigs(pigs, filter) {
  const { color, rare, method, q, huntRegion, huntTicket, shopRank, graze, picky } = filter;
  const ql = (q || "").toLowerCase();
  return pigs.filter(p => {
    if (color && p.color_text !== color) return false;
    if (rare && String(p.rare) !== rare) return false;
    if (method && !pigHasMethod(p, method)) return false;
    if (method === "hunt" && !pigMatchesHunt(p, huntRegion, huntTicket)) return false;
    if (method === "shop" && !pigMatchesShopRank(p, shopRank)) return false;
    if (graze === "yes" && !p.isExer) return false;
    if (graze === "no" && p.isExer) return false;
    if (picky && pigPicky(p).level !== picky) return false;
    if (ql) {
      const hay = ((p.name || "") + " " + (p.description || "") + " " + (p.pNo ?? "")).toLowerCase();
      if (!hay.includes(ql)) return false;
    }
    return true;
  });
}

// 排序猪列表
export function sortPigs(pigs) {
  return pigs.slice().sort((a, b) =>
    (a.book - b.book) || (a.page - b.page) || (a.slot - b.slot) || (a.pNo - b.pNo)
  );
}

// 活动猪筛选
export function filterEventPigs(pigs, filter) {
  const { color, rare, q, graze, picky } = filter;
  const ql = (q || "").toLowerCase();
  return pigs.filter(p => {
    if (color && p.color_text !== color) return false;
    if (rare && String(p.rare) !== rare) return false;
    if (graze === "yes" && !p.isExer) return false;
    if (graze === "no" && p.isExer) return false;
    if (picky && pigPicky(p).level !== picky) return false;
    if (ql) {
      const hay = ((p.name || "") + " " + (p.description || "") + " " + (p.pNo ?? "")).toLowerCase();
      if (!hay.includes(ql)) return false;
    }
    return true;
  });
}

// 获取当前筛选后的猪列表
export function currentAtlasPigs() {
  return sortPigs(filterPigs([...state.pigsById.values()], state.atlasFilter));
}

export function currentEventPigs() {
  const pigs = filterEventPigs([...state.eventPigsById.values()], state.eventFilter);
  return pigs.sort((a, b) => (a.pNo - b.pNo));
}

export function currentMinePigs() {
  const { owned, small, big, q } = state.mineFilter;
  const ql = (q || "").toLowerCase();
  const out = [];
  const sources = [];
  if (state.mineView === "main") sources.push(state.pigsById.values());
  else if (state.mineView === "event") sources.push(state.eventPigsById.values());
  for (const iter of sources) {
    for (const p of iter) {
      const isOwn = pigIsOwned(p);
      if (owned === "yes" && !isOwn) continue;
      if (owned === "no" && isOwn) continue;
      const hasSmall = state.smallBadges.has(p.pNo);
      const hasBig = state.bigBadges.has(p.pNo);
      if (small === "yes" && !hasSmall) continue;
      if (small === "no" && hasSmall) continue;
      if (big === "yes" && !hasBig) continue;
      if (big === "no" && hasBig) continue;
      if (ql) {
        const hay = ((p.name || "") + " " + (p.description || "") + " " + (p.pNo ?? "")).toLowerCase();
        if (!hay.includes(ql)) continue;
      }
      out.push(p);
    }
  }
  out.sort((a, b) => {
    const aMain = a.book && a.book <= 6 ? 0 : 1;
    const bMain = b.book && b.book <= 6 ? 0 : 1;
    if (aMain !== bMain) return aMain - bMain;
    if (aMain === 0) {
      return (a.book - b.book) || (a.page - b.page) || (a.slot - b.slot) || (a.pNo - b.pNo);
    }
    return a.pNo - b.pNo;
  });
  return out;
}
