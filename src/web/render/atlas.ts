/**
 * 图鉴列表渲染 — atlas / events / mine
 */

import type { Pig } from "../js/types.js";
import { state } from "../js/state.js";
import { el, $, escHtml, stars, fmtKg, badgeWeights } from "../js/utils.js";
import { currentAtlasPigs, currentEventPigs, currentMinePigs } from "../js/filters.js";
import { buildCard } from "./cards.js";

// ----- 进度面板 (我的 tab → menu view) -----

interface Bucket { total: number; owned: number; }
function bucketAdd(map: Map<string, Bucket>, key: string | number | undefined, isOwn: boolean): void {
  if (key == null || key === "") return;
  const k = String(key);
  let cur = map.get(k);
  if (!cur) { cur = { total: 0, owned: 0 }; map.set(k, cur); }
  cur.total++;
  if (isOwn) cur.owned++;
}

function buildProgressBuckets(): { main: { byRare: Map<string, Bucket>; byColor: Map<string, Bucket>; byBadge: Map<string, Bucket> }; event: { byRare: Map<string, Bucket>; byColor: Map<string, Bucket>; byBadge: Map<string, Bucket> } } {
  const main = { byRare: new Map<string, Bucket>(), byColor: new Map<string, Bucket>(), byBadge: new Map<string, Bucket>() };
  const ownedMain = new Set(state.collection);
  for (const p of state.pigsById.values()) {
    const isOwn = ownedMain.has(p.pNo);
    bucketAdd(main.byRare, p.rare, isOwn);
    bucketAdd(main.byColor, p.color_text, isOwn);
    if (p.weight && typeof p.weight.small === "number") {
      bucketAdd(main.byBadge, "small", state.smallBadges.has(p.pNo));
    }
    if (p.weight && typeof p.weight.big === "number") {
      bucketAdd(main.byBadge, "big", state.bigBadges.has(p.pNo));
    }
  }
  const event = { byRare: new Map<string, Bucket>(), byColor: new Map<string, Bucket>(), byBadge: new Map<string, Bucket>() };
  for (const p of state.eventPigsById.values()) {
    const isOwn = state.ownedEventPigs.has(p.pNo);
    bucketAdd(event.byRare, p.rare, isOwn);
    bucketAdd(event.byColor, p.color_text, isOwn);
    if (p.weight && typeof p.weight.small === "number") {
      bucketAdd(event.byBadge, "small", state.smallBadges.has(p.pNo));
    }
    if (p.weight && typeof p.weight.big === "number") {
      bucketAdd(event.byBadge, "big", state.bigBadges.has(p.pNo));
    }
  }
  return { main, event };
}

function progressRowHTML(label: string, bucket: Bucket): string {
  const pct = bucket.total > 0 ? (bucket.owned / bucket.total) * 100 : 0;
  const full = bucket.total > 0 && bucket.owned >= bucket.total;
  return `<div class="mp-row${full ? " full" : ""}">` +
    `<span class="mp-label">${label}</span>` +
    `<div class="mp-bar"><div class="mp-bar-fill" style="width:${pct.toFixed(1)}%"></div></div>` +
    `<span class="mp-count">${bucket.owned}/${bucket.total}${full ? " ✓" : ""}</span>` +
    `</div>`;
}

function progressGroupHTML(title: string, rowsHTML: string): string {
  if (!rowsHTML) return "";
  return `<div class="mp-group">` +
    `<div class="mp-group-title">${title}</div>` +
    rowsHTML +
    `</div>`;
}

function bucketsToRows(map: Map<string, Bucket>, keyOrder: (string | number)[], labelFn: (k: string) => string): string {
  return keyOrder
    .map(String)
    .filter(k => map.has(k))
    .map(k => progressRowHTML(labelFn(k), map.get(k)!))
    .join("");
}

export function renderMineMenuCounts(): void {
  const m = $("#mineMenuMainCount");
  const e = $("#mineMenuEventCount");
  const pg = $("#mineMenuProgressSub");
  if (m) m.textContent = state.dataLoaded
    ? `已拥有 ${state.collection.length} / ${state.pigsById.size} 只`
    : "加载中...";
  if (e) e.textContent = state.dataLoaded
    ? `已拥有 ${state.ownedEventPigs.size} / ${state.eventPigsById.size} 只`
    : "加载中...";
  if (pg) {
    if (!state.dataLoaded) {
      pg.textContent = "加载中...";
    } else {
      const allOwn = state.collection.length + state.ownedEventPigs.size;
      const allTot = state.pigsById.size + state.eventPigsById.size;
      const pct = allTot > 0 ? ((allOwn / allTot) * 100).toFixed(1) : "0.0";
      pg.textContent = `按图鉴 / 星级 / 颜色 · 整体 ${allOwn}/${allTot} · ${pct}%`;
    }
  }
}

export function renderProgressPanel(): void {
  const root = $("#mineProgress");
  if (!root) return;
  if (!state.dataLoaded) {
    root.innerHTML = "";
    return;
  }
  const { main, event } = buildProgressBuckets();

  const rareOrder = [5, 4, 3, 2, 1];
  const eventRareOrder = [6, 5, 4, 3, 2];
  const badgeOrder = ["small", "big"];

  const starsLabel = (n: string, isEvent = false): string => {
    const num = Number(n);
    const cls = isEvent && num >= 3 ? "mp-stars special" : "mp-stars";
    return `<span class="${cls}">${stars(num, false)}</span>`;
  };
  const colorLabel = (c: string): string => {
    const dot = (c === "肉色" ? "#ffcba4" : c === "灰色" ? "#9e9e9e" : c === "米色" ? "#a0522d" : c === "粉红" ? "#ffb6c1" : c === "白色" ? "#ffffff" : "#8b4513");
    return `<span class="mp-color-dot" style="background:${dot}"></span>${escHtml(c)}`;
  };
  const badgeLabel = (k: string): string => {
    const src = k === "small" ? "/img/small.png" : "/img/big.png";
    const name = k === "small" ? "小章" : "大章";
    return `<img src="${src}" class="badge-icon-tiny" alt="${name}"> ${name}`;
  };

  const mainRareRows = bucketsToRows(main.byRare, rareOrder, n => starsLabel(n, false));
  const mainColorRows = bucketsToRows(main.byColor, ["肉色", "灰色", "米色", "粉红", "白色", "其他"], colorLabel);
  const mainBadgeRows = bucketsToRows(main.byBadge, badgeOrder, badgeLabel);
  const eventRareRows = bucketsToRows(event.byRare, eventRareOrder, n => starsLabel(n, true));
  const eventColorRows = bucketsToRows(event.byColor, ["肉色", "灰色", "米色", "粉红", "白色", "其他"], colorLabel);
  const eventBadgeRows = bucketsToRows(event.byBadge, badgeOrder, badgeLabel);

  const mainOwned = state.collection.length;
  const mainTotal = state.pigsById.size;
  let eventOwned = 0, eventTotal = 0;
  for (const p of state.eventPigsById.values()) {
    if (p.rare === 1) continue;
    eventTotal++;
    if (state.ownedEventPigs.has(p.pNo)) eventOwned++;
  }
  const mainPct = mainTotal > 0 ? (mainOwned / mainTotal * 100).toFixed(1) : "0.0";
  const eventPct = eventTotal > 0 ? (eventOwned / eventTotal * 100).toFixed(1) : "0.0";

  const mainSection = `
    <details class="mp-section" open>
      <summary>
        <span class="mp-summary-title">📖 186图鉴</span>
        <span class="mp-summary-stat">${mainOwned}/${mainTotal} · ${mainPct}%</span>
      </summary>
      <div class="mp-body">
        ${progressGroupHTML("按章别", mainBadgeRows)}
        ${progressGroupHTML("按星级", mainRareRows)}
        ${progressGroupHTML("按颜色", mainColorRows)}
      </div>
    </details>
  `;
  const eventSection = `
    <details class="mp-section" open>
      <summary>
        <span class="mp-summary-title">🎉 Events图鉴</span>
        <span class="mp-summary-stat">${eventOwned}/${eventTotal} · ${eventPct}%</span>
      </summary>
      <div class="mp-body">
        ${progressGroupHTML("按章别", eventBadgeRows)}
        ${progressGroupHTML("按星级", eventRareRows)}
        ${progressGroupHTML("按颜色", eventColorRows)}
      </div>
    </details>
  `;

  root.innerHTML = `${mainSection}${eventSection}`;
}

// ----- 三个列表渲染 -----

function renderLoading(box: HTMLElement): void {
  box.appendChild(el("div", { class: "loading" }, [
    el("div", { class: "spinner" }),
    "正在加载图鉴数据...",
  ]));
}

function renderEmpty(box: HTMLElement, title: string, hint: string): void {
  box.appendChild(el("div", { class: "empty" }, [
    el("div", { class: "title" }, title),
    el("div", { class: "hint" }, hint),
  ]));
}

export function renderAtlasBody(): void {
  const box = $("#atlasBody");
  if (!box) return;
  box.innerHTML = "";

  if (!state.dataLoaded) { renderLoading(box); return; }

  const pigs = currentAtlasPigs();
  if (pigs.length === 0) {
    renderEmpty(box, "没有符合筛选条件的猪", "试试换个颜色/获得方式,或清空搜索词");
    return;
  }

  const grid = el("div", { class: "grid" });
  for (const p of pigs) grid.appendChild(buildCard(p, { showCollected: false, showBadges: false }));
  box.appendChild(grid);
}

export function renderEventsBody(): void {
  const box = $("#eventBody");
  if (!box) return;
  box.innerHTML = "";

  if (!state.dataLoaded) { renderLoading(box); return; }

  const pigs = currentEventPigs();
  if (pigs.length === 0) {
    renderEmpty(box, "没有符合筛选条件的活动猪", "试试换个颜色 / 星级,或清空搜索词");
    return;
  }

  const grid = el("div", { class: "grid" });
  for (const p of pigs) grid.appendChild(buildCard(p, { showCollected: false, showBadges: false }));
  box.appendChild(grid);
}

export function renderMineBody(): void {
  renderMineMenuCounts();
  renderProgressPanel();
  if (state.mineView !== "main" && state.mineView !== "event") return;
  const box = $("#mineBody");
  if (!box) return;
  box.innerHTML = "";

  if (!state.dataLoaded) { renderLoading(box); return; }

  const pigs = currentMinePigs();
  if (pigs.length === 0) {
    const f = state.mineFilter;
    const hasFilter = f.q || f.owned || f.small || f.big;
    const tabName = state.mineView === "event" ? "Events图鉴" : "186图鉴";
    if (!hasFilter) {
      renderEmpty(box, `${tabName} 还没有数据`, `到 ${tabName} tab 点开一头猪,角上点「⬜ 未拥有」就能加进来`);
    } else {
      renderEmpty(box, "没有符合筛选条件的猪", "调一下上面的「拥有 / 小章 / 大章」或清空搜索词");
    }
    return;
  }

  const grid = el("div", { class: "grid" });
  for (const p of pigs) grid.appendChild(buildCard(p, { showCollected: true, showBadges: true }));
  box.appendChild(grid);
}

// ----- 统计条 -----

export function renderAtlasStats(): void {
  const asb = $("#atlasStatsBar");
  if (!asb) return;
  if (!state.dataLoaded) {
    asb.textContent = "";
  } else {
    const total = state.pigsById.size;
    const shown = currentAtlasPigs().length;
    const coll = state.collection.length;
    asb.textContent = `显示 ${shown} / 共 ${total} 只 · 已拥有 ${coll}`;
  }
}

export function renderEventsStats(): void {
  const esb = $("#eventStatsBar");
  if (!esb) return;
  if (!state.dataLoaded) {
    esb.textContent = "";
  } else {
    const total = state.eventPigsById.size;
    const shown = currentEventPigs().length;
    const owned = state.ownedEventPigs.size;
    esb.textContent = `显示 ${shown} / 共 ${total} 只 · 已拥有 ${owned}`;
  }
}

export function renderMineStats(): void {
  const msb = $("#mineStatsBar");
  if (!msb) return;
  if (!state.dataLoaded || (state.mineView !== "main" && state.mineView !== "event")) {
    msb.textContent = "";
  } else {
    const shown = currentMinePigs().length;
    const isMain = state.mineView === "main";
    const total = isMain ? state.pigsById.size : state.eventPigsById.size;
    const own = isMain ? state.collection.length : state.ownedEventPigs.size;
    const inScope = isMain
      ? (pNo: number) => state.pigsById.has(pNo)
      : (pNo: number) => state.eventPigsById.has(pNo);
    let sm = 0, bg = 0;
    for (const pNo of state.smallBadges) if (inScope(pNo)) sm++;
    for (const pNo of state.bigBadges) if (inScope(pNo)) bg++;
    msb.textContent = `显示 ${shown} 只 · 已拥有 ${own}/${total} · 小章 ${sm} · 大章 ${bg}`;
  }
}

// 定点刷新卡片
export function refreshPigCards(pNo: number): void {
  const p = state.pigsById.get(pNo) || state.eventPigsById.get(pNo) || state.hiddenPigsById.get(pNo);
  if (!p) return;
  document.querySelectorAll(`.card[data-pno="${pNo}"]`).forEach(node => {
    const showCollected = node.getAttribute("data-show-collected") === "1";
    const showBadges = node.getAttribute("data-show-badges") === "1";
    node.replaceWith(buildCard(p, { showCollected, showBadges }));
  });
}

export { buildProgressBuckets, fmtKg, badgeWeights };
