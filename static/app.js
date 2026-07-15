/**
 * 养猪场mix图鉴助手 — 模块化版本
 */

import * as C from './js/constants.js';
import * as S from './js/storage.js';
import { state } from './js/state.js';
import * as U from './js/utils.js';
import * as D from './js/data.js';
import * as F from './js/filters.js';
import { getCurrentUser, isLoggedIn } from './js/auth.js';
import { initAccountUI } from './js/account-ui.js';
import { customConfirm, customAlert } from './js/modal.js';
import { checkAndShowUpdateNotice, showUpdateManually } from './js/version.js';

// 解构常用函数
const { $, $$, el, text, toast, escHtml, imgUrl, stars, badgeWeights, badgeMetaHTML,
  feedIntervalText, pigPicky, isEventPigId, pigIsOwned, showUnlockCelebration, fmtKg } = U;
const { METHOD_LABELS, HUNT_SITES, FEED_LABELS, BLEED_TYPE_TEXT, COLOR_ORDER_PROG,
  COLOR_DOT_PROG, RAISING_FLOORS, VAPID_PUBLIC_KEY } = C;
const { loadData, setPigOwned, setPigBadge, deriveAcquisitions, checkAndUnlockHidden,
  buildBreedingIndex, mergeHiddenIntoMain, basePigPNos } = D;
const { currentAtlasPigs, currentEventPigs, currentMinePigs } = F;
const { saveCollection, saveOwnedEventPigs, saveSmallBadges, saveBigBadges,
  saveHiddenUnlocked, saveRaisingPigs, saveRaisingFloor, loadDeviceId,
  loadPushEnabled, savePushEnabled, currentLang, saveLang } = S;

async function confirmCancelOwned(p) {
  const name = p && p.name ? `「${p.name}」` : "这只猪";
  return await customConfirm(
    `确定要把${name}改为未拥有吗?`,
    `取消后，小章和大章记录也会一起清除。`
  );
}

async function setPigOwnedAfterConfirm(pNo, owned) {
  if (!owned && !(await confirmCancelOwned(getPigByPNo(pNo)))) return false;
  setPigOwned(pNo, owned);
  return true;
}

function buildCard(p, opts) {
  const { showCollected = true, showBadges = false } = opts || {};
  const posText = p.book && p.book <= 6
    ? `图鉴${p.book} 页${p.page} #${p.slot}`
    : (p.book === 7 ? "Events图鉴" : "");
  const isEvent = p.book === 7 || !state.pigsById.has(p.pNo);
  const isOwn = isEvent
    ? state.ownedEventPigs.has(p.pNo)
    : state.ownedSet.has(p.pNo);
  const children = [];
  if (showCollected) {
    children.push(el("button", {
      class: "card-owned-toggle" + (isOwn ? " is-on" : ""),
      "aria-pressed": String(isOwn),
      title: isOwn ? "已拥有 — 点击取消" : "标记为已拥有",
      onclick: async (ev) => {
        ev.stopPropagation();
        if (!(await setPigOwnedAfterConfirm(p.pNo, !isOwn))) return;
        updateOwnedUI(p.pNo);
      },
    }, isOwn ? "✅ 已拥有" : "⬜ 未拥有"));
  }
  children.push(el("div", { class: "img" },
    el("img", { src: imgUrl(p.pNo), loading: "lazy", alt: p.name })
  ));
  const grazeBadge = p.isExer
    ? el("span", { class: "graze yes", title: "放牧" }, "🌿 放牧")
    : el("span", { class: "graze no", title: "不放牧" }, "🏠 不放牧");
  const picky = pigPicky(p);
  const pickyTitle = picky.level === "none"
    ? "🍽️ 不挑食"
    : `🍽️ ${picky.label}: ${picky.foods.join(" / ")}`;
  const pickyLabel = picky.level === "none" ? "🍽️ 不挑食" : `🍽️ ${picky.label}`;
  const pickyEl = el("span", {
    class: "picky " + picky.level,
    title: pickyTitle,
  }, pickyLabel);
  const feedN = (p.feeding && p.feeding.times) || 0;
  const feedBadge = el("span", {
    class: "feed",
    title: `最少喂食 ${feedN} 次`,
  }, `🍚 ${feedN}`);
  // 小章 / 大章 chip: 始终显示, 默认空 chip;showBadges=true 时可点击切换
  const w = badgeWeights(p);
  const hasSm = showBadges && state.smallBadges.has(p.pNo);
  const hasBg = showBadges && state.bigBadges.has(p.pNo);
  const makeBadgeChip = (kind, has, weight, op, iconSrc, label) => {
    const cls = `card-badge-chip ${kind}${has ? " is-on" : ""}`;
    const attrs = {
      class: cls,
      title: `${label}: ${op} ${fmtKg(weight)}kg${has ? " · 已拥有" : ""}`,
    };
    if (showBadges) {
      attrs.onclick = ev => {
        ev.stopPropagation();
        const set = kind === "small" ? state.smallBadges : state.bigBadges;
        setPigBadge(p.pNo, kind, !set.has(p.pNo));
        updateOwnedUI(p.pNo);
      };
    }
    const tag = showBadges ? "button" : "span";
    return el(tag, attrs, [
      el("img", { class: "card-badge-img", src: iconSrc, alt: label }),
      el("span", { class: "card-badge-w" }, `${op}${fmtKg(weight)}`),
    ]);
  };
  const badgeRow = w
    ? el("div", { class: "card-badge-row" + (showBadges ? " interactive" : "") }, [
      makeBadgeChip("small", hasSm, w.small, "≤", "/img/small.png", "小章"),
      makeBadgeChip("big", hasBg, w.big, "≥", "/img/big.png", "大章"),
    ])
    : null;
  children.push(el("div", { class: "body" }, [
    el("div", { class: "name" }, p.name),
    el("div", { class: "stars-row" + (p.special ? " special" : "") }, [
      el("span", { class: "stars" + (p.special ? " special" : "") }, stars(p.rare, p.special)),
    ]),
    el("div", { class: "sub" }, `${p.color_text || ""}${posText ? " · " + posText : ""}`),
    el("div", { class: "chip-row" }, [feedBadge, grazeBadge, pickyEl].filter(Boolean)),
    badgeRow,
  ]));
  return el("div", {
    class: "card" + (showCollected && isOwn ? " collected" : ""),
    "data-pno": String(p.pNo),
    "data-show-collected": showCollected ? "1" : "0",
    "data-show-badges": showBadges ? "1" : "0",
    onclick: () => showDetail(p.pNo),
  }, children);
}

function renderMineMenuCounts() {
  // 主菜单的两张猪图鉴卡片右下角显示拥有数 / 总数
  const m = $("#mineMenuMainCount");
  const e = $("#mineMenuEventCount");
  const pg = $("#mineMenuProgressSub");
  if (m) m.textContent = state.dataLoaded
    ? `已拥有 ${state.collection.length} / ${state.pigsById.size} 只`
    : "加载中…";
  if (e) e.textContent = state.dataLoaded
    ? `已拥有 ${state.ownedEventPigs.size} / ${state.eventPigsById.size} 只`
    : "加载中…";
  if (pg) {
    if (!state.dataLoaded) {
      pg.textContent = "加载中…";
    } else {
      const allOwn = state.collection.length + state.ownedEventPigs.size;
      const allTot = state.pigsById.size + state.eventPigsById.size;
      const pct = allTot > 0 ? ((allOwn / allTot) * 100).toFixed(1) : "0.0";
      pg.textContent = `按图鉴 / 星级 / 颜色 · 整体 ${allOwn}/${allTot} · ${pct}%`;
    }
  }
}

// ----- 进度面板 (我的 tab → menu view) -----
// 把 186 主图鉴 + 活动猪按几个维度聚合,显示每个维度下"已拥有/总数"进度条。
// 维度选择: 186 按章别/星级/颜色; 活动按章别/星级/颜色

function bucketAdd(map, key, isOwn) {
  if (key == null || key === "") return;
  let cur = map.get(key);
  if (!cur) { cur = { total: 0, owned: 0 }; map.set(key, cur); }
  cur.total++;
  if (isOwn) cur.owned++;
}
function buildProgressBuckets() {
  const main = {
    byRare: new Map(),
    byColor: new Map(),
    byBadge: new Map(),
  };
  const ownedMain = new Set(state.collection);
  for (const p of state.pigsById.values()) {
    const isOwn = ownedMain.has(p.pNo);
    bucketAdd(main.byRare, p.rare, isOwn);
    bucketAdd(main.byColor, p.color_text, isOwn);
    // 小章/大章: 只统计有 weight 字段的猪 (否则该猪不参与章别系统)
    if (p.weight && typeof p.weight.small === "number") {
      bucketAdd(main.byBadge, "small", state.smallBadges.has(p.pNo));
    }
    if (p.weight && typeof p.weight.big === "number") {
      bucketAdd(main.byBadge, "big", state.bigBadges.has(p.pNo));
    }
  }
  const event = {
    byRare: new Map(),
    byColor: new Map(),
    byBadge: new Map(),
  };
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
// 单行进度: <label> <bar> <count>。集齐时 bar/count 加 .full 高亮。
function progressRowHTML(label, bucket) {
  const pct = bucket.total > 0 ? (bucket.owned / bucket.total) * 100 : 0;
  const full = bucket.total > 0 && bucket.owned >= bucket.total;
  return `<div class="mp-row${full ? " full" : ""}">` +
    `<span class="mp-label">${label}</span>` +
    `<div class="mp-bar"><div class="mp-bar-fill" style="width:${pct.toFixed(1)}%"></div></div>` +
    `<span class="mp-count">${bucket.owned}/${bucket.total}${full ? " ✓" : ""}</span>` +
    `</div>`;
}
function progressGroupHTML(title, rowsHTML) {
  if (!rowsHTML) return "";
  return `<div class="mp-group">` +
    `<div class="mp-group-title">${title}</div>` +
    rowsHTML +
    `</div>`;
}
// Map<key, bucket> + keyOrder + 标签转换 → 拼一段 row HTML
function bucketsToRows(map, keyOrder, labelFn) {
  return keyOrder
    .filter(k => map.has(k))
    .map(k => progressRowHTML(labelFn(k), map.get(k)))
    .join("");
}
function renderProgressPanel() {
  const root = $("#mineProgress");
  if (!root) return;
  if (!state.dataLoaded) {
    root.innerHTML = "";
    return;
  }
  const { main, event } = buildProgressBuckets();

  const rareOrder = [5, 4, 3, 2, 1];   // 5★ 在前,玩家更关心稀有
  const eventRareOrder = [6, 5, 4, 3, 2]; // Events 进度总览不显示 1★
  const badgeOrder = ["small", "big"];

  const starsLabel = (n, isEvent = false) => {
    // Events 里 3 星及以上用紫色 (--star-special), 与 Events 筛选 chip 一致
    const cls = isEvent && n >= 3 ? "mp-stars special" : "mp-stars";
    return `<span class="${cls}">${stars(n, false)}</span>`;
  };
  const colorLabel = c => {
    const dot = COLOR_DOT_PROG[c];
    return dot
      ? `<span class="mp-color-dot" style="background:${dot}"></span>${escHtml(c)}`
      : escHtml(c);
  };
  const badgeLabel = k => {
    const src = k === "small" ? "/img/small.png" : "/img/big.png";
    const name = k === "small" ? "小章" : "大章";
    return `<img src="${src}" class="badge-icon-tiny" alt="${name}"> ${name}`;
  };

  const mainRareRows = bucketsToRows(main.byRare, rareOrder, n => starsLabel(n, false));
  const mainColorRows = bucketsToRows(main.byColor, COLOR_ORDER_PROG, colorLabel);
  const mainBadgeRows = bucketsToRows(main.byBadge, badgeOrder, badgeLabel);
  const eventRareRows = bucketsToRows(event.byRare, eventRareOrder, n => starsLabel(n, true));
  const eventColorRows = bucketsToRows(event.byColor, COLOR_ORDER_PROG, colorLabel);
  const eventBadgeRows = bucketsToRows(event.byBadge, badgeOrder, badgeLabel);

  // 顶部总览数字
  const mainOwned = state.collection.length;
  const mainTotal = state.pigsById.size;
  // Events 总览排除 1★ (已在 eventRareOrder 中不显示 1★ 行)
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

  root.innerHTML = `
    ${mainSection}
    ${eventSection}
  `;
}

function renderMineBody() {
  renderMineMenuCounts();
  renderProgressPanel();
  // mineView=menu/add 时列表不需要渲染 (DOM 已隐藏)
  if (state.mineView !== "main" && state.mineView !== "event") return;
  const box = $("#mineBody");
  if (!box) return;
  box.innerHTML = "";

  if (!state.dataLoaded) {
    box.appendChild(el("div", { class: "loading" }, [
      el("div", { class: "spinner" }),
      "正在加载图鉴数据…",
    ]));
    return;
  }

  const pigs = currentMinePigs();
  if (pigs.length === 0) {
    const f = state.mineFilter;
    const hasFilter = f.q || f.owned || f.small || f.big;
    const tabName = state.mineView === "event" ? "Events图鉴" : "186图鉴";
    if (!hasFilter) {
      box.appendChild(el("div", { class: "empty" }, [
        el("div", { class: "big" }, "🐽"),
        el("div", { class: "title" }, `${tabName} 还没有数据`),
        el("div", { class: "hint" }, `到 ${tabName} tab 点开一头猪,角上点「⬜ 未拥有」就能加进来`),
      ]));
    } else {
      box.appendChild(el("div", { class: "empty" }, [
        el("div", { class: "title" }, "没有符合筛选条件的猪"),
        el("div", { class: "hint" }, "调一下上面的「拥有 / 小章 / 大章」或清空搜索词"),
      ]));
    }
    return;
  }

  const grid = el("div", { class: "grid" });
  for (const p of pigs) grid.appendChild(buildCard(p, { showCollected: true, showBadges: true }));
  box.appendChild(grid);
}

function renderAtlasBody() {
  const box = $("#atlasBody");
  if (!box) return;
  box.innerHTML = "";

  if (!state.dataLoaded) {
    box.appendChild(el("div", { class: "loading" }, [
      el("div", { class: "spinner" }),
      "正在加载图鉴数据…",
    ]));
    return;
  }

  const pigs = currentAtlasPigs();
  if (pigs.length === 0) {
    box.appendChild(el("div", { class: "empty" }, [
      el("div", { class: "title" }, "没有符合筛选条件的猪"),
      el("div", { class: "hint" }, "试试换个颜色/获得方式，或清空搜索词"),
    ]));
    return;
  }

  const grid = el("div", { class: "grid" });
  // 186图鉴作为百科全书，不显示已拥有和徽章标记
  for (const p of pigs) grid.appendChild(buildCard(p, {
    showCollected: false,
    showBadges: false,
  }));
  box.appendChild(grid);
}

function renderEventsBody() {
  const box = $("#eventBody");
  if (!box) return;
  box.innerHTML = "";

  if (!state.dataLoaded) {
    box.appendChild(el("div", { class: "loading" }, [
      el("div", { class: "spinner" }),
      "正在加载图鉴数据…",
    ]));
    return;
  }

  const pigs = currentEventPigs();
  if (pigs.length === 0) {
    box.appendChild(el("div", { class: "empty" }, [
      el("div", { class: "title" }, "没有符合筛选条件的活动猪"),
      el("div", { class: "hint" }, "试试换个颜色 / 星级,或清空搜索词"),
    ]));
    return;
  }

  const grid = el("div", { class: "grid" });
  // Events图鉴作为百科全书，不显示已拥有和徽章标记
  for (const p of pigs) grid.appendChild(buildCard(p, {
    showCollected: false,
    showBadges: false,
  }));
  box.appendChild(grid);
}

function renderAtlasStats() {
  // 186图鉴 tab: 当前筛选结果 / 总数 · 已拥有
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

function renderEventsStats() {
  // Events图鉴 tab: 当前筛选结果 / 共 425 · 已拥有
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

function renderMineStats() {
  // 我的 tab: 当前筛选结果 + 总览
  const msb = $("#mineStatsBar");
  if (!msb) return;
  if (!state.dataLoaded || (state.mineView !== "main" && state.mineView !== "event")) {
    msb.textContent = "";
  } else {
    const shown = currentMinePigs().length;
    const isMain = state.mineView === "main";
    const total = isMain ? state.pigsById.size : state.eventPigsById.size;
    const own = isMain ? state.collection.length : state.ownedEventPigs.size;
    // 小章/大章: 只统计属于当前子视图范围的猪
    const inScope = isMain
      ? (pNo) => state.pigsById.has(pNo)
      : (pNo) => state.eventPigsById.has(pNo);
    let sm = 0, bg = 0;
    for (const pNo of state.smallBadges) if (inScope(pNo)) sm++;
    for (const pNo of state.bigBadges) if (inScope(pNo)) bg++;
    msb.textContent = `显示 ${shown} 只 · 已拥有 ${own}/${total} · 小章 ${sm} · 大章 ${bg}`;
  }
}

// ----- raising tab -----
const MS_MIN = 60 * 1000;
const MS_HOUR = 60 * MS_MIN;
const RAISING_SOON_MS = 10 * MS_MIN;
const raisingSearchState = { q: "", results: [] };
let raisingTicker = null;
let raisingPushEnabled = loadPushEnabled();
let raisingPushSyncTimer = null;
let raisingPushSyncInFlight = null;
let raisingPushSyncPending = false;
let serviceWorkerReadyPromise = null;

function makeRaisingId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function deviceId() {
  return loadDeviceId();
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function webPushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function serviceWorkerReady() {
  if (!("serviceWorker" in navigator)) return Promise.reject(new Error("service worker unsupported"));
  if (!serviceWorkerReadyPromise) {
    serviceWorkerReadyPromise = navigator.serviceWorker.ready;
  }
  return serviceWorkerReadyPromise;
}

function apiJson(path, body) {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(async res => {
    let data = null;
    try { data = await res.json(); } catch { }
    if (!res.ok || (data && data.ok === false)) {
      const msg = data && data.error ? data.error : `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data || {};
  });
}

function currentRaisingFloor() {
  return RAISING_FLOORS[state.raisingFloor] || RAISING_FLOORS.normal;
}

function baseFeedIntervalMs(pig) {
  const raw = pig && pig.feeding && typeof pig.feeding.interval === "number"
    ? pig.feeding.interval
    : 0;
  if (raw === 0) return 58 * MS_MIN;
  return Math.max(1, Math.round(raw * MS_HOUR));
}

function adjustedFeedIntervalMs(pig) {
  return Math.max(1, Math.round(baseFeedIntervalMs(pig) * currentRaisingFloor().multiplier));
}

function formatDuration(ms) {
  if (ms <= 0) return "可喂食";
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatIntervalMs(ms) {
  const mins = Math.round(ms / MS_MIN);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h} 小时 ${m} 分钟`;
  if (h > 0) return `${h} 小时`;
  return `${m} 分钟`;
}

function formatDateTime(ms) {
  if (!ms) return "—";
  return new Date(ms).toLocaleString([], {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getRaisingDueMs(item, pig) {
  return item.lastFedAt + adjustedFeedIntervalMs(pig);
}

let vapidPublicKeyPromise = null;
async function getVapidPublicKey() {
  if (VAPID_PUBLIC_KEY) return VAPID_PUBLIC_KEY;
  if (!vapidPublicKeyPromise) {
    vapidPublicKeyPromise = fetch("/api/push-config")
      .then(async res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return data && data.publicKey ? String(data.publicKey) : "";
      })
      .catch(err => {
        console.warn("[raising] VAPID config failed:", err);
        return "";
      });
  }
  return vapidPublicKeyPromise;
}

function buildRaisingCloudRecords() {
  if (!state.dataLoaded) return [];
  return state.raisingPigs
    .map(item => {
      // 等待进货中的猪不进云端提醒表,只保留在本地
      if (item.status === "waiting") return null;
      const pig = getPigByPNo(item.pNo);
      if (!pig) return null;
      return {
        id: String(item.id),
        pNo: item.pNo,
        pigName: pig.name || "",
        floor: RAISING_FLOORS[state.raisingFloor] ? state.raisingFloor : "normal",
        startedAt: Number(item.startedAt) || Date.now(),
        lastFedAt: Number(item.lastFedAt) || Date.now(),
        feedCount: Math.max(0, Number.parseInt(item.feedCount || 0, 10) || 0),
        nextFeedAt: getRaisingDueMs(item, pig),
        notifiedNextFeedAt: item.notifiedAt || null,
      };
    })
    .filter(Boolean);
}

async function syncRaisingRecordsToCloud({ silent = true } = {}) {
  if (!raisingPushEnabled || !state.dataLoaded) return;
  if (raisingPushSyncInFlight) {
    raisingPushSyncPending = true;
    return raisingPushSyncInFlight;
  }

  raisingPushSyncPending = false;
  const payload = {
    deviceId: deviceId(),
    floor: RAISING_FLOORS[state.raisingFloor] ? state.raisingFloor : "normal",
    records: buildRaisingCloudRecords(),
  };

  raisingPushSyncInFlight = apiJson("/api/raising-sync", payload)
    .then(() => {
      if (!silent) toast("后台提醒数据已同步");
    })
    .catch(err => {
      console.warn("[raising] cloud sync failed:", err);
      if (!silent) toast(`后台提醒同步失败: ${err.message || err}`);
    })
    .finally(() => {
      raisingPushSyncInFlight = null;
      if (raisingPushSyncPending) {
        raisingPushSyncPending = false;
        scheduleRaisingPushSync(0);
      }
    });
  return raisingPushSyncInFlight;
}

function scheduleRaisingPushSync(delay = 500) {
  if (!raisingPushEnabled || !state.dataLoaded) return;
  clearTimeout(raisingPushSyncTimer);
  raisingPushSyncTimer = setTimeout(() => {
    syncRaisingRecordsToCloud({ silent: true });
  }, delay);
}

function raisingStatusClass(dueMs) {
  const diff = dueMs - Date.now();
  if (diff <= 0) return "due";
  if (diff <= RAISING_SOON_MS) return "soon";
  return "";
}

function saveRaisingState() {
  saveRaisingPigs(state.raisingPigs);
  scheduleRaisingPushSync();
}

function addRaisingPig(pNo, status = "active") {
  if (!state.dataLoaded) {
    toast("数据还没加载好");
    return;
  }
  const pig = getPigByPNo(pNo);
  if (!pig) {
    toast("找不到这只猪");
    return;
  }
  const now = Date.now();
  state.raisingPigs.push({
    id: makeRaisingId(),
    pNo,
    startedAt: now,
    lastFedAt: now,
    notifiedAt: 0,
    feedCount: 0,
    status,
  });
  saveRaisingState();
  renderRaisingBody();
  renderRaisingSearchResults();
  updateRaisingCountdownNodes();
  if (status === "waiting") {
    toast(`已加入等待进货中: ${pig.name}`);
  } else {
    toast(`已加入养成中: ${pig.name}`);
  }
}

function markRaisingFed(id) {
  const item = state.raisingPigs.find(x => x.id === id);
  if (!item) return;
  if (item.status === "waiting") return; // 等待进货中的猪不走喂食计时
  item.lastFedAt = Date.now();
  item.notifiedAt = 0;
  item.feedCount = Math.max(0, (Number.parseInt(item.feedCount || 0, 10) || 0) + 1);
  saveRaisingState();
  renderRaisingBody();
  checkRaisingReminders();
  const pig = getPigByPNo(item.pNo);
  toast(pig ? `已记录喂食: ${pig.name}` : "已记录喂食");
}

function adjustRaisingFeedCount(id, delta) {
  const item = state.raisingPigs.find(x => x.id === id);
  if (!item || item.status === "waiting") return;
  item.feedCount = Math.max(0, (Number.parseInt(item.feedCount || 0, 10) || 0) + delta);
  saveRaisingState();
  renderRaisingBody();
}

// 把养成中的猪挪到「等待进货中」或挪回来。纯本地切换,不动后端 schema。
function moveRaisingPig(id) {
  const item = state.raisingPigs.find(x => x.id === id);
  if (!item) return;
  const pig = getPigByPNo(item.pNo);
  if (item.status === "waiting") {
    // 从等待进货挪回养成:从现在开始算,等价于刚加入
    item.lastFedAt = Date.now();
    item.notifiedAt = 0;
    item.feedCount = 0;
    item.status = "active";
    saveRaisingState();
    renderRaisingBody();
    updateRaisingCountdownNodes();
    toast(pig ? `已移回养成中: ${pig.name}` : "已移回养成中");
  } else {
    item.status = "waiting";
    saveRaisingState();
    renderRaisingBody();
    updateRaisingCountdownNodes();
    toast(pig ? `已移入等待进货中: ${pig.name}` : "已移入等待进货中");
  }
}

async function removeRaisingPig(id) {
  const item = state.raisingPigs.find(x => x.id === id);
  const pig = item ? getPigByPNo(item.pNo) : null;
  if (!item) return;
  const confirmed = await customConfirm(
    `确定从养成中移除${pig ? "「" + pig.name + "」" : "这条记录"}吗?`
  );
  if (!confirmed) return;
  state.raisingPigs = state.raisingPigs.filter(x => x.id !== id);
  saveRaisingState();
  renderRaisingBody();
  renderRaisingSearchResults();
  toast("已移除养成记录");
}

async function clearRaisingPigs() {
  if (state.raisingPigs.length === 0) {
    toast("养成中已经是空的");
    return;
  }
  const confirmed = await customConfirm(
    `确定清空养成中的 ${state.raisingPigs.length} 条记录吗?`
  );
  if (!confirmed) return;
  state.raisingPigs = [];
  saveRaisingState();
  renderRaisingBody();
  renderRaisingSearchResults();
  toast("已清空养成中");
}

function searchRaisingPigs(q) {
  const ql = q.trim().toLowerCase();
  if (!ql || !state.dataLoaded) return [];
  const byId = new Map();
  for (const p of state.pigsById.values()) byId.set(p.pNo, p);
  for (const p of state.eventPigsById.values()) byId.set(p.pNo, p);
  for (const p of state.hiddenPigsById.values()) {
    if (state.pigsById.has(p.pNo)) byId.set(p.pNo, p);
  }
  const out = [];
  for (const p of byId.values()) {
    const hay = ((p.name || "") + " " + (p.description || "") + " #" + p.pNo).toLowerCase();
    if (hay.includes(ql)) out.push(p);
    if (out.length >= 80) break;
  }
  out.sort((a, b) => {
    const aMain = a.book && a.book <= 6 ? 0 : 1;
    const bMain = b.book && b.book <= 6 ? 0 : 1;
    if (aMain !== bMain) return aMain - bMain;
    if (aMain === 0) return (a.book - b.book) || (a.page - b.page) || (a.slot - b.slot) || (a.pNo - b.pNo);
    return a.pNo - b.pNo;
  });
  return out;
}

function renderRaisingSearchResults() {
  const box = $("#raisingResults");
  if (!box) return;
  box.innerHTML = "";
  if (!raisingSearchState.q) {
    box.classList.remove("show");
    return;
  }
  box.classList.add("show");
  if (raisingSearchState.results.length === 0) {
    box.appendChild(el("div", { class: "empty-row" }, "没有匹配的猪"));
    return;
  }
  const counts = new Map();
  for (const item of state.raisingPigs) counts.set(item.pNo, (counts.get(item.pNo) || 0) + 1);
  for (const p of raisingSearchState.results) {
    const posText = p.book && p.book <= 6
      ? `图鉴${p.book}/页${p.page}/格${p.slot}`
      : "Events图鉴";
    const count = counts.get(p.pNo) || 0;
    const row = el("div", {
      class: "row",
      onclick: () => addRaisingPig(p.pNo),
    }, [
      el("img", { src: imgUrl(p.pNo), loading: "lazy", alt: p.name }),
      el("div", { class: "meta" }, [
        el("div", { class: "r-name" }, `#${p.pNo} ${p.name}`),
        el("div", { class: "r-sub" }, `${p.color_text || ""} · ${posText} · 间隔 ${formatIntervalMs(adjustedFeedIntervalMs(p))}`),
      ]),
      el("span", { class: "r-in" }, count ? `养成中 ${count}` : "添加"),
    ]);
    box.appendChild(row);
  }
}

function buildRaisingRow(item) {
  const pig = getPigByPNo(item.pNo);
  if (!pig) {
    return el("div", { class: "raising-card missing" + (item.status === "waiting" ? " is-waiting" : "") }, [
      el("div", { class: "raising-info" }, [
        el("div", { class: "raising-name" }, `#${item.pNo} 找不到数据`),
        el("div", { class: "raising-meta" }, "数据可能已变更"),
      ]),
      el("button", {
        type: "button",
        class: "add-btn danger-btn",
        onclick: () => removeRaisingPig(item.id),
      }, "移除"),
    ]);
  }
  // 等待进货中的猪走简化渲染:无喂食/倒计时/进度,只有"移回养成"和"移除"。
  if (item.status === "waiting") {
    return buildWaitingRow(item, pig);
  }
  return buildActiveRow(item, pig);
}

function buildActiveRow(item, pig) {
  const intervalMs = adjustedFeedIntervalMs(pig);
  const dueMs = getRaisingDueMs(item, pig);
  const diff = dueMs - Date.now();
  const status = raisingStatusClass(dueMs);
  const pct = Math.max(0, Math.min(100, ((Date.now() - item.lastFedAt) / intervalMs) * 100));
  const feedN = (pig.feeding && pig.feeding.times) || 0;
  const feedCount = Math.max(0, Number.parseInt(item.feedCount || 0, 10) || 0);
  const feedDone = feedN > 0 && feedCount >= feedN;
  const feedStatusText = feedN > 0
    ? (feedDone ? "已达到最少喂食次数" : `已喂 ${feedCount}/${feedN} 次`)
    : "无需累计喂食次数";
  const weights = badgeWeights(pig);
  const badgeLine = weights
    ? el("div", { class: "raising-badge-line" }, [
      el("span", { class: "raising-badge-chip" }, [
        el("img", { src: "/img/small.png", alt: "小章" }),
        el("span", {}, `≤${fmtKg(weights.small)}kg`),
      ]),
      el("span", { class: "raising-badge-chip" }, [
        el("img", { src: "/img/big.png", alt: "大章" }),
        el("span", {}, `≥${fmtKg(weights.big)}kg`),
      ]),
    ])
    : null;

  return el("div", { class: "raising-card" + (status ? ` is-${status}` : "") }, [
    el("button", {
      type: "button",
      class: "raising-remove",
      title: "移除",
      onclick: ev => {
        ev.stopPropagation();
        removeRaisingPig(item.id);
      },
    }, "×"),
    el("div", {
      class: "raising-main",
      onclick: () => showDetail(pig.pNo),
    }, [
      el("div", { class: "raising-thumb" },
        el("img", { src: imgUrl(pig.pNo), loading: "lazy", alt: pig.name })
      ),
      el("div", { class: "raising-info" }, [
        el("div", { class: "raising-name" }, [
          pig.name,
          el("span", { class: pig.special ? "stars special" : "stars" }, stars(pig.rare, pig.special)),
        ]),
        pig.color_text ? el("div", { class: "raising-meta" }, pig.color_text) : null,
        el("div", { class: "raising-meta" }, `上次 ${formatDateTime(item.lastFedAt)} · 下次 ${formatDateTime(dueMs)}`),
        badgeLine,
        el("div", { class: "raising-feed-line" + (feedDone ? " is-done" : "") }, [
          el("span", { class: "raising-feed-status" }, feedStatusText),
          el("span", { class: "raising-feed-stepper" }, [
            el("button", {
              type: "button",
              title: "减少一次",
              onclick: ev => {
                ev.stopPropagation();
                adjustRaisingFeedCount(item.id, -1);
              },
            }, "−"),
            el("span", { class: "raising-feed-count" }, String(feedCount)),
            el("button", {
              type: "button",
              title: "增加一次",
              onclick: ev => {
                ev.stopPropagation();
                adjustRaisingFeedCount(item.id, 1);
              },
            }, "+"),
          ]),
        ]),
        el("div", { class: "raising-progress" }, [
          el("div", {
            class: "raising-progress-fill",
            style: `width:${pct.toFixed(1)}%`,
            "data-raising-progress": item.id,
          }),
        ]),
      ]),
      el("div", { class: "raising-time" }, [
        el("span", {
          class: "raising-countdown " + status,
          "data-raising-countdown": item.id,
          "data-due-ms": String(dueMs),
          "data-last-fed-ms": String(item.lastFedAt),
          "data-interval-ms": String(intervalMs),
        }, formatDuration(diff)),
      ]),
    ]),
    el("div", { class: "raising-actions" }, [
      el("button", {
        type: "button",
        class: "add-btn",
        onclick: () => markRaisingFed(item.id),
      }, "已喂食"),
      el("button", {
        type: "button",
        class: "add-btn secondary",
        onclick: () => showDetail(pig.pNo),
      }, "详情"),
      el("button", {
        type: "button",
        class: "add-btn secondary",
        title: "移入等待进货中 (不提醒)",
        onclick: () => moveRaisingPig(item.id),
      }, "移入等待进货中"),
    ]),
  ]);
}

// 等待进货中的简化卡片:不挂倒计时/进度,不显示喂食步骤
function buildWaitingRow(item, pig) {
  return el("div", { class: "raising-card is-waiting" }, [
    el("button", {
      type: "button",
      class: "raising-remove",
      title: "移除",
      onclick: ev => {
        ev.stopPropagation();
        removeRaisingPig(item.id);
      },
    }, "×"),
    el("div", {
      class: "raising-main",
      onclick: () => showDetail(pig.pNo),
    }, [
      el("div", { class: "raising-thumb" },
        el("img", { src: imgUrl(pig.pNo), loading: "lazy", alt: pig.name })
      ),
      el("div", { class: "raising-info" }, [
        el("div", { class: "raising-name" }, [
          pig.name,
          el("span", { class: "raising-waiting-tag" }, "等待进货中"),
          el("span", { class: pig.special ? "stars special" : "stars" }, stars(pig.rare, pig.special)),
        ]),
        pig.color_text ? el("div", { class: "raising-meta" }, pig.color_text) : null,
        el("div", { class: "raising-meta" }, `加入于 ${formatDateTime(item.startedAt)}`),
      ]),
      el("div", { class: "raising-time" }, [
        el("span", {
          class: "raising-countdown waiting",
          "data-raising-countdown": item.id,
          "data-raising-waiting": "1",
          "data-due-ms": "0",
          "data-last-fed-ms": "0",
          "data-interval-ms": "1",
        }, "—"),
      ]),
    ]),
    el("div", { class: "raising-actions" }, [
      el("button", {
        type: "button",
        class: "add-btn",
        title: "移回正在养成中 (开始计时/提醒)",
        onclick: () => moveRaisingPig(item.id),
      }, "移回养成中"),
      el("button", {
        type: "button",
        class: "add-btn secondary",
        onclick: () => showDetail(pig.pNo),
      }, "详情"),
    ]),
  ]);
}

function renderRaisingStats() {
  const stats = $("#raisingStatsBar");
  if (!stats) return;
  if (!state.dataLoaded) {
    stats.textContent = "加载中…";
    return;
  }
  const floor = currentRaisingFloor();
  let active = 0;
  let waiting = 0;
  let due = 0;
  const now = Date.now();
  for (const item of state.raisingPigs) {
    if (item.status === "waiting") {
      waiting++;
      continue;
    }
    active++;
    const pig = getPigByPNo(item.pNo);
    if (pig && getRaisingDueMs(item, pig) <= now) due++;
  }
  const head = waiting > 0 ? `· 等待进货中 ${waiting} ` : "";
  const tail = `· 养成中 ${active} 只 · ${floor.label} · 待喂 ${due}`;
  stats.textContent = (head + tail).trim();
}

function renderRaisingBody() {
  renderRaisingStats();
  updateRaisingNotificationButton();
  const box = $("#raisingBody");
  if (!box) return;
  box.innerHTML = "";
  if (!state.dataLoaded) {
    box.appendChild(el("div", { class: "loading" }, [
      el("div", { class: "spinner" }),
      el("div", {}, "正在加载图鉴数据…"),
    ]));
    return;
  }
  if (state.raisingPigs.length === 0) {
    box.appendChild(el("div", { class: "empty" }, [
      el("div", { class: "title" }, "暂时还没有添加正在养成的猪"),
      el("div", { class: "hint" }, "搜索猪名或编号，选择后开始记录喂食时间"),
    ]));
    return;
  }

  // 分组:active(正在养成)+waiting(等待进货中),并各自按到期时间/加入时间排序
  const active = [];
  const waiting = [];
  for (const item of state.raisingPigs) {
    if (item.status === "waiting") waiting.push(item);
    else active.push(item);
  }
  active.sort((a, b) => {
    const ap = getPigByPNo(a.pNo);
    const bp = getPigByPNo(b.pNo);
    const ad = ap ? getRaisingDueMs(a, ap) : Number.MAX_SAFE_INTEGER;
    const bd = bp ? getRaisingDueMs(b, bp) : Number.MAX_SAFE_INTEGER;
    return ad - bd;
  });
  waiting.sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));

  if (active.length > 0) {
    box.appendChild(el("div", { class: "raising-section-divider" }, [
      el("span", { class: "raising-section-title" }, "🐷 正在养成中"),
    ]));
    box.appendChild(el("div", { class: "raising-list" }, active.map(buildRaisingRow)));
  }

  if (waiting.length > 0) {
    box.appendChild(el("div", { class: "raising-section-divider" }, [
      el("span", { class: "raising-section-title" }, "📦 等待进货中"),
    ]));
    box.appendChild(el("div", { class: "raising-list raising-list-waiting" }, waiting.map(buildRaisingRow)));
  }
}

function updateRaisingCountdownNodes() {
  const now = Date.now();
  $$("#raisingBody [data-raising-countdown]").forEach(node => {
    // 等待进货中的卡片不挂倒计时节点,但万一已渲染就跳过以防异常
    if (node.dataset.raisingWaiting === "1") return;
    const dueMs = Number(node.getAttribute("data-due-ms")) || 0;
    const lastFedMs = Number(node.getAttribute("data-last-fed-ms")) || 0;
    const intervalMs = Number(node.getAttribute("data-interval-ms")) || 1;
    const diff = dueMs - now;
    const cls = raisingStatusClass(dueMs);
    node.textContent = formatDuration(diff);
    node.classList.remove("due", "soon");
    if (cls) node.classList.add(cls);
    const card = node.closest(".raising-card");
    if (card) {
      card.classList.toggle("is-due", cls === "due");
      card.classList.toggle("is-soon", cls === "soon");
    }
    const fill = document.querySelector(`[data-raising-progress="${node.dataset.raisingCountdown}"]`);
    if (fill) {
      const pct = Math.max(0, Math.min(100, ((now - lastFedMs) / intervalMs) * 100));
      fill.style.width = `${pct.toFixed(1)}%`;
    }
  });
  renderRaisingStats();
}

function notificationsSupported() {
  return "Notification" in window;
}

function updateRaisingNotificationButton() {
  const btn = $("#raisingNotifyBtn");
  if (!btn) return;
  if (!notificationsSupported()) {
    btn.textContent = "不支持提醒";
    btn.disabled = true;
    return;
  }
  btn.disabled = Notification.permission === "denied";
  if (Notification.permission === "granted") {
    btn.textContent = raisingPushEnabled ? "后台提醒已开启" : "提醒已开启";
  } else if (Notification.permission === "denied") {
    btn.textContent = "提醒被拒绝";
  } else {
    btn.textContent = "开启提醒";
  }
}

function classifyPushError(err) {
  const msg = err && err.message ? String(err.message) : String(err);
  const lower = msg.toLowerCase();
  if (lower.includes("push service") || lower.includes("registration failed") || lower.includes("not subscribed")) {
    return {
      type: "push-service",
      message: "浏览器推送服务不可用（可能是夸克/UC/QQ 等浏览器，或无法连接 Google FCM）",
      canRetry: true,
    };
  }
  if (lower.includes("permission") || lower.includes("denied") || lower.includes("not allowed")) {
    return {
      type: "permission",
      message: "通知权限被浏览器或系统拒绝",
      canRetry: false,
    };
  }
  if (lower.includes("network") || lower.includes("fetch") || lower.includes("internet") || lower.includes("abort")) {
    return {
      type: "network",
      message: "网络连接失败，无法连接推送服务器",
      canRetry: true,
    };
  }
  if (lower.includes("vapid") || lower.includes("application server key") || lower.includes("invalid key")) {
    return {
      type: "vapid",
      message: "推送服务配置错误（VAPID 公钥无效）",
      canRetry: false,
    };
  }
  return {
    type: "unknown",
    message: msg || "未知错误",
    canRetry: true,
  };
}

async function subscribeRaisingPush() {
  if (!webPushSupported()) {
    throw new Error("当前浏览器不支持后台推送");
  }
  const publicKey = await getVapidPublicKey();
  if (!publicKey) {
    throw new Error("还没有配置 VAPID_PUBLIC_KEY");
  }
  const reg = await serviceWorkerReady();
  let subscription = await reg.pushManager.getSubscription();
  if (subscription) {
    try {
      await subscription.unsubscribe();
    } catch (err) {
      console.warn("[raising] failed to unsubscribe old push subscription:", err);
    }
    subscription = null;
  }
  try {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  } catch (err) {
    const classified = classifyPushError(err);
    const wrapped = new Error(classified.message);
    wrapped.type = classified.type;
    wrapped.canRetry = classified.canRetry;
    wrapped.original = err;
    throw wrapped;
  }
  await apiJson("/api/push-subscribe", {
    deviceId: deviceId(),
    subscription: subscription.toJSON(),
  });
  raisingPushEnabled = true;
  savePushEnabled(true);
  await syncRaisingRecordsToCloud({ silent: true });
  return subscription;
}

function pushSubscribeErrorToast(err) {
  const classified = err && err.type ? err : classifyPushError(err);
  const suffix = classified.canRetry ? "，可刷新页面后重试" : "";
  toast(`${classified.message}${suffix}`, 4000);
}

async function requestRaisingNotificationPermission() {
  if (!notificationsSupported()) {
    toast("当前浏览器不支持系统通知");
    updateRaisingNotificationButton();
    return;
  }
  if (Notification.permission === "granted") {
    if (!raisingPushEnabled) {
      try {
        await subscribeRaisingPush();
        toast("后台提醒已开启");
      } catch (err) {
        console.warn("[raising] push subscribe failed:", err);
        pushSubscribeErrorToast(err);
      }
    } else {
      syncRaisingRecordsToCloud({ silent: true });
      toast("提醒已经开启");
    }
    updateRaisingNotificationButton();
    return;
  }
  if (Notification.permission === "denied") {
    toast("提醒权限已被浏览器拒绝");
    updateRaisingNotificationButton();
    return;
  }
  const permission = await Notification.requestPermission();
  updateRaisingNotificationButton();
  toast(permission === "granted" ? "提醒已开启" : "没有开启提醒权限");
  if (permission === "granted") {
    try {
      await subscribeRaisingPush();
      toast("后台提醒已开启");
    } catch (err) {
      console.warn("[raising] push subscribe failed:", err);
      pushSubscribeErrorToast(err);
    }
    updateRaisingNotificationButton();
    const now = Date.now();
    let changed = false;
    for (const item of state.raisingPigs) {
      // 等待进货中不需要重置提醒标记
      if (item.status === "waiting") continue;
      const pig = getPigByPNo(item.pNo);
      if (pig && getRaisingDueMs(item, pig) <= now) {
        item.notifiedAt = 0;
        changed = true;
      }
    }
    if (changed) saveRaisingState();
    checkRaisingReminders();
  }
}

function checkRaisingReminders() {
  if (!state.dataLoaded || state.raisingPigs.length === 0) return;
  const now = Date.now();
  let changed = false;
  for (const item of state.raisingPigs) {
    // 等待进货中的猪不参与提醒
    if (item.status === "waiting") continue;
    const pig = getPigByPNo(item.pNo);
    if (!pig) continue;
    const dueMs = getRaisingDueMs(item, pig);
    if (now < dueMs || item.notifiedAt === dueMs) continue;
    item.notifiedAt = dueMs;
    changed = true;
    toast(`#${pig.pNo} ${pig.name} 可以喂食了`, 2600);
  }
  if (changed) saveRaisingState();
  updateRaisingCountdownNodes();
}

function startRaisingTicker() {
  if (raisingTicker) return;
  raisingTicker = setInterval(() => {
    checkRaisingReminders();
    updateRaisingCountdownNodes();
  }, 1000);
  checkRaisingReminders();
  updateRaisingCountdownNodes();
}

function syncRaisingFloorSelect() {
  const select = $("#raisingFloorSelect");
  if (!select) return;
  select.value = RAISING_FLOORS[state.raisingFloor] ? state.raisingFloor : "normal";
}

syncRaisingFloorSelect();

let raisingSearchTimer = null;
$("#raisingSearch").addEventListener("input", e => {
  clearTimeout(raisingSearchTimer);
  const v = e.target.value;
  raisingSearchTimer = setTimeout(() => {
    raisingSearchState.q = v.trim();
    raisingSearchState.results = searchRaisingPigs(v);
    renderRaisingSearchResults();
  }, 160);
});

$("#raisingFloorSelect").addEventListener("change", e => {
  const floor = e.target.value;
  if (!RAISING_FLOORS[floor]) return;
  state.raisingFloor = floor;
  saveRaisingFloor(floor);
  // 地板切换会改变 dueMs；允许新的到点时间重新触发提醒。
  // 等待进货中的猪不参与提醒,跳过重置。
  for (const item of state.raisingPigs) {
    if (item.status === "waiting") continue;
    item.notifiedAt = 0;
  }
  saveRaisingState();
  syncRaisingFloorSelect();
  renderRaisingBody();
  renderRaisingSearchResults();
  checkRaisingReminders();
});

$("#raisingNotifyBtn").addEventListener("click", requestRaisingNotificationPermission);
$("#raisingClearBtn").addEventListener("click", clearRaisingPigs);

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) checkRaisingReminders();
});

$("#clearBtn").addEventListener("click", async () => {
  const nColl = state.collection.length;
  const nEv = state.ownedEventPigs.size;
  const nSm = state.smallBadges.size;
  const nBg = state.bigBadges.size;
  const nRaising = state.raisingPigs.length;
  const wasUnlocked = state.hiddenUnlocked;
  const total = nColl + nEv + nSm + nBg + nRaising + (wasUnlocked ? 1 : 0);
  if (total === 0) {
    toast("记录已经是空的");
    return;
  }
  if (!(await customConfirm("确定要清空全部记录吗?"))) return;
  state.collection = [];
  state.ownedEventPigs = new Set();
  state.smallBadges = new Set();
  state.bigBadges = new Set();
  state.raisingPigs = [];
  saveCollection(state.collection);
  saveOwnedEventPigs(state.ownedEventPigs);
  saveSmallBadges(state.smallBadges);
  saveBigBadges(state.bigBadges);
  saveRaisingState();
  // 重置隐藏图鉴解锁状态 + 把 4 只皇室猪从 pigsById / pigsByListKey 抽回去
  if (state.hiddenUnlocked) {
    state.hiddenUnlocked = false;
    saveHiddenUnlocked();
    for (const [pNo, p] of state.pigsById) {
      if (p.status === "hidden") {
        state.pigsById.delete(pNo);
        const atlas = p.atlas || {};
        if (atlas.type && atlas.index) {
          state.pigsByListKey.delete(`${atlas.type}-${atlas.index}`);
        }
      }
    }
    buildBreedingIndex(state.breedingTable || []);
  }
  if ($("#drawer").classList.contains("open")) closeDrawer();
  render();
  renderRaisingSearchResults();
  toast("已清空全部记录");
});

// 重建 ownedSet，使成员判断保持 O(1) 且与 collection 一致。
// 在每次渲染前调用即可覆盖所有卡片构建路径。
function refreshOwnedSet() {
  state.ownedSet = new Set(state.collection);
}

// 当前处于激活态的 tab 名（tab-panel 上有 .active）
function activeTabName() {
  for (const [name, ids] of Object.entries(TABS)) {
    const panel = $(ids.panel);
    if (panel && panel.classList.contains("active")) return name;
  }
  return null;
}

// 只渲染当前可见 tab 的统计条 + 重列表，避免每次交互重建全部 4 个 tab。
function renderActiveTab() {
  const active = activeTabName();
  if (active === "atlas") {
    renderAtlasStats();
    renderAtlasBody();
  } else if (active === "events") {
    renderEventsStats();
    renderEventsBody();
  } else if (active === "raising") {
    renderRaisingBody();
  } else if (active === "mine") {
    renderMineStats();
    renderMineBody();
    renderNameResults();
  }
  // auction tab 的列表不依赖收藏状态，由 renderAuctionTab 单独驱动
}

// 与收藏状态相关但很轻量的全局计数（textContent，无 filter），任何 tab 都保持最新
function updateGlobalCounts() {
  renderMineMenuCounts();
  const mc = $("#manageCount");
  if (mc) mc.textContent = `186 已拥有 ${state.collection.length} 只 · Events 已拥有 ${state.ownedEventPigs.size} 只 · 小章 ${state.smallBadges.size} · 大章 ${state.bigBadges.size} · 养成中 ${state.raisingPigs.length} 只`;
}

function render() {
  refreshOwnedSet();
  renderActiveTab();
  updateGlobalCounts();
}

// 单猪状态（拥有 / 徽章）变化后的轻量更新：只原位重建带该 pNo 的卡片，
// 再刷新当前 tab 的统计条和全局计数，避免整个 grid 销毁重建。
// 「我的」tab 若开着拥有/小章/大章筛选，列表成员本身会变 → 回退全量 render。
function refreshPigCards(pNo) {
  const p = getPigByPNo(pNo);
  if (!p) return;
  document.querySelectorAll(`.card[data-pno="${pNo}"]`).forEach(node => {
    node.replaceWith(buildCard(p, {
      showCollected: node.dataset.showCollected === "1",
      showBadges: node.dataset.showBadges === "1",
    }));
  });
}

function updateOwnedUI(pNo) {
  refreshOwnedSet();
  const active = activeTabName();
  const f = state.mineFilter;
  if (active === "mine" && (state.mineView === "main" || state.mineView === "event")
    && (f.owned || f.small || f.big)) {
    render();
    return;
  }
  refreshPigCards(pNo);
  if (active === "atlas") renderAtlasStats();
  else if (active === "events") renderEventsStats();
  else if (active === "mine") {
    renderMineStats();
    renderProgressPanel();
  }
  updateGlobalCounts();
}

// ----- triplet add flow -----
function parseTriple(book, page, slot) {
  const b = parseInt(book, 10), p = parseInt(page, 10), s = parseInt(slot, 10);
  if (!(b >= 1 && b <= 6)) return { err: "图鉴需为 1~6" };
  if (!(p >= 1)) return { err: "页需 ≥ 1" };
  if (!(s >= 1 && s <= 6)) return { err: "格需为 1~6" };
  return { book: b, page: p, slot: s, listno: (p - 1) * 6 + s };
}

function addByPNo(pNo) {
  if (!state.dataLoaded) return { err: "数据还没加载好" };
  const p = state.pigsById.get(pNo);
  if (!p) return { err: `找不到 #${pNo}` };
  if (state.ownedSet.has(pNo)) {
    return { ok: false, pig: p, msg: `已在收藏中: #${pNo} ${p.name}` };
  }
  state.collection.push(pNo);
  state.ownedSet.add(pNo);
  saveCollection(state.collection);
  return { ok: true, pig: p, msg: `已添加: #${pNo} ${p.name}` };
}

function addFromTriple(book, page, slot) {
  if (!state.dataLoaded) return { err: "数据还没加载好" };
  const parsed = parseTriple(book, page, slot);
  if (parsed.err) return { err: parsed.err };
  const key = `${parsed.book}-${parsed.listno}`;
  const pNo = state.pigsByListKey.get(key);
  if (!pNo) {
    return { err: `图鉴${parsed.book} 页${parsed.page} #${parsed.slot} 找不到对应的猪` };
  }
  return addByPNo(pNo);
}

function removePig(pNo) {
  const p = state.pigsById.get(pNo);
  const i = state.collection.indexOf(pNo);
  if (i < 0) return;
  state.collection.splice(i, 1);
  state.ownedSet.delete(pNo);
  saveCollection(state.collection);
  render();
  if (p) toast(`已移除: ${p.name}`);
}

$("#addForm").addEventListener("submit", ev => {
  ev.preventDefault();
  const b = $("#bookIn").value;
  const p = $("#pageIn").value;
  const s = $("#slotIn").value;
  const res = addFromTriple(b, p, s);
  const msg = $("#addMsg");
  if (res.err) {
    msg.innerHTML = `<span class="err">${res.err}</span>`;
    return;
  }
  msg.innerHTML = res.ok
    ? `<span class="ok">${res.msg}</span>`
    : `<span class="err">${res.msg}</span>`;
  if (res.ok) {
    toast(res.msg);
    render();
    // reset & focus first input for rapid entry
    $("#bookIn").value = "";
    $("#pageIn").value = "";
    $("#slotIn").value = "";
    $("#bookIn").focus();
  }
});

// auto-advance between fields
function wireAutoAdvance() {
  const order = ["bookIn", "pageIn", "slotIn"];
  for (let i = 0; i < order.length; i++) {
    const cur = $("#" + order[i]);
    cur.addEventListener("input", e => {
      const v = e.target.value;
      // trigger advance once input reaches natural max length (digit count)
      const maxDigits = order[i] === "bookIn" ? 1 : (order[i] === "slotIn" ? 1 : 2);
      if (v && v.length >= maxDigits && i < order.length - 1) {
        $("#" + order[i + 1]).focus();
      }
    });
    cur.addEventListener("paste", e => {
      const data = (e.clipboardData || window.clipboardData).getData("text");
      const parts = data.trim().split(/[\s\/,.;#]+/).filter(Boolean);
      if (parts.length >= 3) {
        e.preventDefault();
        $("#bookIn").value = parts[0] || "";
        $("#pageIn").value = parts[1] || "";
        $("#slotIn").value = parts[2] || "";
        $("#addBtn").focus();
      }
    });
  }
}
wireAutoAdvance();

// ----- filters & search -----
function wireFilter(rootSel, filterObj, key, onChange) {
  $(rootSel).addEventListener("click", e => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    $$(".chip", $(rootSel)).forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    filterObj[key] = chip.dataset.value;
    // 切换筛选时清空对应的搜索框
    if (filterObj === state.atlasFilter) {
      const searchBox = $("#atlasSearch");
      if (searchBox) {
        searchBox.value = "";
        state.atlasFilter.q = "";
      }
    } else if (filterObj === state.eventFilter) {
      const searchBox = $("#eventSearch");
      if (searchBox) {
        searchBox.value = "";
        state.eventFilter.q = "";
      }
    } else if (filterObj === state.mineFilter) {
      const searchBox = $("#mineSearch");
      if (searchBox) {
        searchBox.value = "";
        state.mineFilter.q = "";
      }
    }
    if (onChange) onChange(chip.dataset.value);
    render();
  });
}

function resetChipRow(rootSel) {
  $$(".chip", $(rootSel)).forEach(c =>
    c.classList.toggle("active", c.dataset.value === ""));
}

// Each tab has its own method-driven sub-filter visibility (狩猎/商店).
// 收藏 tab 用 prefix="" + lower-camel ID (huntRegionFilter ...)
// 全图鉴 tab 用 prefix="atlas" + PascalCase (atlasHuntRegionFilter ...)
function makeMethodSubUpdater(prefix, filterObj) {
  const id = (base) => prefix
    ? prefix + base[0].toUpperCase() + base.slice(1)
    : base;
  const regionSel = `#${id("huntRegionFilter")}`;
  const ticketSel = `#${id("huntTicketFilter")}`;
  const shopSel = `#${id("shopRankFilter")}`;
  return function update() {
    const m = filterObj.method;
    const showHunt = m === "hunt", showShop = m === "shop";
    $(regionSel).style.display = showHunt ? "" : "none";
    $(ticketSel).style.display = showHunt ? "" : "none";
    $(shopSel).style.display = showShop ? "" : "none";
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
const updateAtlasMethodSub = makeMethodSubUpdater("atlas", state.atlasFilter);

// 186图鉴 tab filters (atlas prefix)
wireFilter("#atlasColorFilter", state.atlasFilter, "color");
wireFilter("#atlasRareFilter", state.atlasFilter, "rare");
wireFilter("#atlasGrazeFilter", state.atlasFilter, "graze");
wireFilter("#atlasPickyFilter", state.atlasFilter, "picky");
wireFilter("#atlasMethodFilter", state.atlasFilter, "method", updateAtlasMethodSub);
wireFilter("#atlasHuntRegionFilter", state.atlasFilter, "huntRegion");
wireFilter("#atlasHuntTicketFilter", state.atlasFilter, "huntTicket");
wireFilter("#atlasShopRankFilter", state.atlasFilter, "shopRank");

// Events图鉴 tab filters
wireFilter("#eventColorFilter", state.eventFilter, "color");
wireFilter("#eventRareFilter", state.eventFilter, "rare");
wireFilter("#eventGrazeFilter", state.eventFilter, "graze");
wireFilter("#eventPickyFilter", state.eventFilter, "picky");

// 我的 tab filters (子视图共用)
wireFilter("#mineColorFilter", state.mineFilter, "color");
wireFilter("#mineRareFilter", state.mineFilter, "rare");
wireFilter("#mineOwnedFilter", state.mineFilter, "owned");
wireFilter("#mineSmallFilter", state.mineFilter, "small");
wireFilter("#mineBigFilter", state.mineFilter, "big");

// 我的 tab 两层导航: menu (默认) → main / event / add
// 子视图标题 (显示在 mineSubHead 返回按钮右侧)
const MINE_VIEW_TITLES = {
  main: "📖 186图鉴",
  event: "🎉 Events图鉴",
  progress: "📊 进度总览",
  add: "➕ 导入/导出",
  about: "ℹ️ 关于项目",
};

function setMineView(view) {
  state.mineView = view;
  const menu = $("#mineMenu");
  const listView = $("#mineListView");
  const addView = $("#mineAddView");
  const aboutView = $("#mineAboutView");
  const progressView = $("#mineProgressView");
  const subhead = $("#mineSubHead");
  const subheadTitle = $("#mineSubHeadTitle");
  menu.style.display = view === "menu" ? "" : "none";
  listView.style.display = (view === "main" || view === "event") ? "" : "none";
  addView.style.display = view === "add" ? "" : "none";
  if (aboutView) aboutView.style.display = view === "about" ? "" : "none";
  if (progressView) progressView.style.display = view === "progress" ? "" : "none";
  subhead.style.display = view === "menu" ? "none" : "";
  if (subheadTitle) subheadTitle.textContent = MINE_VIEW_TITLES[view] || "";

  // 根据当前视图调整星级筛选显示
  const mineRareFilter = $("#mineRareFilter");
  if (mineRareFilter && (view === "main" || view === "event")) {
    const chips = mineRareFilter.querySelectorAll('.chip');
    chips.forEach((chip, index) => {
      const value = chip.dataset.value;
      if (view === "event") {
        // Events图鉴：隐藏1-2星，3-6星用紫色
        if (value === "1" || value === "2") {
          chip.style.display = "none";
        } else {
          chip.style.display = "";
          const star = chip.querySelector('span');
          if (star && value) {
            star.style.color = "var(--star-special)";
          }
        }
      } else {
        // 186图鉴：显示1-5星（黄色），隐藏6星（186图鉴没有6星猪）
        if (value === "6") {
          chip.style.display = "none";
        } else {
          chip.style.display = "";
          const star = chip.querySelector('span');
          if (star && value) {
            star.style.color = "var(--star)";
          }
        }
      }
    });
  }

  render(); // 重新渲染列表 + 菜单上的统计
}
// 菜单卡片点击
document.querySelectorAll("#mineMenu .mine-menu-card").forEach(btn => {
  btn.addEventListener("click", () => {
    const v = btn.dataset.mineView;
    if (v) setMineView(v);
  });
});
// 返回按钮
$("#mineBackBtn").addEventListener("click", () => setMineView("menu"));

function wireSearch(inputSel, filterObj) {
  let timer = null;
  $(inputSel).addEventListener("input", e => {
    const v = e.target.value;
    clearTimeout(timer);
    timer = setTimeout(() => {
      filterObj.q = v.trim();
      // 使用搜索时清空所有筛选条件
      if (filterObj.q) {
        if (filterObj === state.atlasFilter) {
          filterObj.color = "";
          filterObj.rare = "";
          filterObj.method = "";
          filterObj.huntRegion = "";
          filterObj.huntTicket = "";
          filterObj.shopRank = "";
          filterObj.graze = "";
          filterObj.picky = "";
          // 重置所有筛选 chip 为默认状态
          resetChipRow("#atlasColorFilter");
          resetChipRow("#atlasRareFilter");
          resetChipRow("#atlasMethodFilter");
          resetChipRow("#atlasGrazeFilter");
          resetChipRow("#atlasPickyFilter");
          resetChipRow("#atlasHuntRegionFilter");
          resetChipRow("#atlasHuntTicketFilter");
          resetChipRow("#atlasShopRankFilter");
        } else if (filterObj === state.eventFilter) {
          filterObj.color = "";
          filterObj.rare = "";
          filterObj.graze = "";
          filterObj.picky = "";
          resetChipRow("#eventColorFilter");
          resetChipRow("#eventRareFilter");
          resetChipRow("#eventGrazeFilter");
          resetChipRow("#eventPickyFilter");
        } else if (filterObj === state.mineFilter) {
          filterObj.color = "";
          filterObj.rare = "";
          filterObj.owned = "";
          filterObj.small = "";
          filterObj.big = "";
          resetChipRow("#mineColorFilter");
          resetChipRow("#mineRareFilter");
          resetChipRow("#mineOwnedFilter");
          resetChipRow("#mineSmallFilter");
          resetChipRow("#mineBigFilter");
        }
      }
      render();
    }, 200);
  });
}
wireSearch("#atlasSearch", state.atlasFilter);
wireSearch("#eventSearch", state.eventFilter);
wireSearch("#mineSearch", state.mineFilter);

// Return true if a pNo resolves to either a 186 pig or an event pig.
function getPigByPNo(pNo) {
  return state.pigsById.get(pNo) || state.eventPigsById.get(pNo) || state.hiddenPigsById.get(pNo) || null;
}

function isKnownPig(pNo) {
  return !!getPigByPNo(pNo);
}
// `data-pno` attribute snippet — only emitted when the pNo resolves to a
// pig we have data for (so drawer navigation never dead-links).
function linkAttr(pNo) {
  return pNo && isKnownPig(pNo) ? ` data-pno="${pNo}"` : "";
}

// ----- drawer (detail) -----
// Track the pig currently shown in the drawer so the delegated nav click
// handler can ignore same-pig clicks.
let currentDetailPNo = null;

function showDetail(pNo) {
  const p = state.pigsById.get(pNo) || state.eventPigsById.get(pNo);
  if (!p) return;
  currentDetailPNo = pNo;
  const isEventPig = state.eventPigsById.has(pNo);
  const box = $("#drawerContent");
  let posText = "";
  if (p.book && p.book <= 6) {
    posText = `图鉴${p.book} 页${p.page} #${p.slot}`;
  } else if (isEventPig) {
    posText = `活动图鉴`;
  }

  // 统一: 主猪 + 活动猪都用同一个 已拥有/未拥有 切换按钮
  const isOwn = isEventPig
    ? state.ownedEventPigs.has(p.pNo)
    : state.ownedSet.has(p.pNo);
  const collectBtn = isOwn
    ? `<button type="button" class="add-btn danger" id="drawerCollectBtn">✅ 已拥有</button>`
    : `<button type="button" class="add-btn" id="drawerCollectBtn">⬜ 未拥有</button>`;
  const raisingBtn = `<button type="button" class="add-btn secondary" id="drawerRaisingBtn">➕ 加入养成</button>`;

  const groups = deriveAcquisitions(p);
  const acqOrder = ["shop", "hunt", "hunt_event", "fail", "feed_special"];
  const acqHTML = [];
  for (const g of acqOrder) {
    if (!groups[g] || groups[g].length === 0) continue;
    const lines = groups[g].map(s => `<div>${escHtml(s)}</div>`).join("");
    acqHTML.push(
      `<div class="kv"><div class="k">${METHOD_LABELS[g] || g}</div>` +
      `<div class="v">${lines}</div></div>`
    );
  }
  if (acqHTML.length === 0) {
    acqHTML.push(`<div class="kv"><div class="v">无一般获得途径 (可能仅靠配种)</div></div>`);
  }

  // breed recipes - 从 breedingTable 中查找产出当前猪的配种记录
  const bleeds = [];
  for (const record of state.breedingTable || []) {
    // 检查这条配种记录的产出中是否包含当前猪
    const hasCurrentPig = (record.outcomes || []).some(o => o.pNo === p.pNo);
    if (!hasCurrentPig) continue;

    const [p1, p2] = record.parents;
    const isAny = p2 === "*";
    const isview = record.visible ? 1 : -1;

    // 查找父母猪的详细信息
    const getPigInfo = (pNo) => {
      const pig = state.pigsById.get(pNo) || state.eventPigsById.get(pNo) || state.hiddenPigsById.get(pNo);
      return pig ? { pNo: pig.pNo, name: pig.name, rent: pig.rent } : { pNo };
    };

    // 构建与旧格式兼容的结构
    bleeds.push({
      pNo1: getPigInfo(p1),
      pNo2: isAny ? null : getPigInfo(p2),
      any: isAny,
      isview,
      result: (record.outcomes || []).map(o => {
        const pig = state.pigsById.get(o.pNo) || state.eventPigsById.get(o.pNo) || state.hiddenPigsById.get(o.pNo);
        return {
          prob: o.prob,
          pigKind: pig ? {
            pNo: pig.pNo,
            name: pig.name,
            rare: pig.rare,
            special: pig.special,
            rent: pig.rent,
            bigWeight: pig.weight?.big,
            smallWeight: pig.weight?.small,
            color: pig.color
          } : { pNo: o.pNo }
        };
      })
    });
  }

  const order = [1, 0, -1, 3, 4, -3, -4, 2];
  const byView = new Map();
  for (const b of bleeds) {
    const k = String(b.isview);
    if (!byView.has(k)) byView.set(k, []);
    byView.get(k).push(b);
  }
  // --- A + B = C 等式渲染 helpers -------------------------------------
  // 每个 .slot 展示 [图 + 名字 + (可选) 借猪费 / 概率 / 已拥有勾选]; 父母 slot
  // 若有已知 pNo 会带 data-pno 以支持点击跳转。"任意猪" 没有具体 pNo, 显示
  // 一个占位空盒。"产出" slot (右侧) 额外附概率; 若为当前猪本身, 加 is-self
  // 高亮; 活动猪再挂一个 owned-toggle。
  const renderParentSlot = (info) => {
    if (!info || info.any) {
      return `<div class="slot any">` +
        `<div class="slot-img-placeholder" aria-hidden="true">?</div>` +
        `<div class="pname">任意猪</div>` +
        `</div>`;
    }
    const img = imgUrl(info.pNo);
    return `<div class="slot"${linkAttr(info.pNo)}>` +
      (img ? `<img src="${img}" loading="lazy" alt="${escHtml(info.name || "")}">` : `<div class="slot-img-placeholder" aria-hidden="true">?</div>`) +
      `<div class="pname">${escHtml(info.name || "?")}</div>` +
      (info.rent ? `<div class="prent">借 ${info.rent}pt</div>` : "") +
      `</div>`;
  };
  const renderOutcomeSlot = (k, prob, { isSelf = false } = {}) => {
    const img = imgUrl(k.pNo);
    let ownedToggle = "";
    if (k.pNo && state.eventPigsById.has(k.pNo)) {
      const isOwned = state.ownedEventPigs.has(k.pNo);
      ownedToggle = `<span class="owned-toggle${isOwned ? " is-on" : ""}" data-owned-pno="${k.pNo}" role="checkbox" aria-checked="${isOwned}" title="标记是否已获得此活动猪">${isOwned ? "✅ 已拥有" : "⬜ 未拥有"}</span>`;
    }
    return `<div class="slot out${isSelf ? " is-self" : ""}"${linkAttr(k.pNo)}>` +
      (img ? `<img src="${img}" loading="lazy" alt="${escHtml(k.name || "")}">` : `<div class="slot-img-placeholder" aria-hidden="true">?</div>`) +
      `<div class="pname">${escHtml(k.name || "?")}</div>` +
      (prob != null ? `<div class="prob">${prob}%</div>` : "") +
      ownedToggle +
      `</div>`;
  };

  const recipeHTML = [];
  for (const iv of order) {
    const items = byView.get(String(iv));
    if (!items) continue;
    for (const r of items) {
      const p1 = r.pNo1 || {}, p2 = r.pNo2 || {};
      const p1Slot = renderParentSlot({ pNo: p1.pNo, name: p1.name, rent: p1.rent });
      const p2Slot = renderParentSlot(r.any ? { any: true } : { pNo: p2.pNo, name: p2.name, rent: p2.rent });
      const smTag = (iv === 3 || iv === 4 || iv === -3 || iv === -4) && r.result && r.result[0]
        ? ` · 系统图 #${r.result[0].orderNo} x${r.result[0].pigKind && r.result[0].pigKind.rare === 6 ? 10 : r.result[0].pigKind && r.result[0].pigKind.rare}`
        : "";
      // 每个产出单独一行 A + B = C
      const equations = (r.result || []).map(o => {
        const outSlot = renderOutcomeSlot(o.pigKind || {}, o.prob);
        return `<div class="equation">${p1Slot}<div class="op">+</div>${p2Slot}<div class="op">=</div>${outSlot}</div>`;
      }).join("");
      recipeHTML.push(
        `<div class="recipe">` +
        `<div class="tag">${BLEED_TYPE_TEXT[iv] || `isview=${iv}`}${smTag}</div>` +
        equations +
        `</div>`
      );
    }
  }
  const recipeBlock = recipeHTML.length > 0
    ? recipeHTML.join("")
    : `<div class="kv">没有已公开的配种组合</div>`;

  const pigImg = imgUrl(p.pNo);

  // Reverse: "this pig as a parent → what it can breed"
  const asParent = (state.breedByParent && state.breedByParent.get(p.pNo)) || [];
  const asParentByView = new Map();
  for (const b of asParent) {
    const k = String(b.isview);
    if (!asParentByView.has(k)) asParentByView.set(k, []);
    asParentByView.get(k).push(b);
  }
  const parentRecipeHTML = [];
  for (const iv of order) {
    const items = asParentByView.get(String(iv));
    if (!items) continue;
    // sort partners by name for stable, readable output
    items.sort((a, b) => {
      const an = a.partner ? (a.partner.name || "") : "zzz任意";
      const bn = b.partner ? (b.partner.name || "") : "zzz任意";
      return an.localeCompare(bn, "zh");
    });
    // 左边的 A 就是当前猪自己 (整段共用)
    const selfSlot = renderParentSlot({ pNo: p.pNo, name: p.name, rent: p.rent });
    for (const r of items) {
      const partnerSlot = renderParentSlot(
        (r.any || !r.partner)
          ? { any: true }
          : { pNo: r.partner.pNo, name: r.partner.name, rent: r.partner.rent }
      );
      const equations = (r.result || []).map(o => {
        const k = o.pigKind || {};
        const outSlot = renderOutcomeSlot(k, o.prob, { isSelf: k.pNo === p.pNo });
        return `<div class="equation">${selfSlot}<div class="op">+</div>${partnerSlot}<div class="op">=</div>${outSlot}</div>`;
      }).join("");
      parentRecipeHTML.push(
        `<div class="recipe">` +
        `<div class="tag">${BLEED_TYPE_TEXT[iv] || `isview=${iv}`}</div>` +
        equations +
        `</div>`
      );
    }
  }
  const parentBlock = parentRecipeHTML.length > 0
    ? parentRecipeHTML.join("")
    : `<div class="kv">没有已知的配种产出 (可能仅作为被配出的结果)</div>`;
  const picky = pigPicky(p);
  const pickyChipText = picky.level === "none" ? "不挑食" : picky.label;
  const pickyChipTitle = picky.level === "none"
    ? "不挑食"
    : `${picky.label}: ${picky.foods.join(" / ")}`;
  const pickyChipClass = picky.level === "none"
    ? "chip"
    : (picky.level === "picky" ? "chip danger" : "chip warn");
  const grazeChip = p.isExer
    ? `<span class="chip ok"><span class="chip-icon">🌿</span><span class="chip-v">放牧</span></span>`
    : `<span class="chip"><span class="chip-icon">🏠</span><span class="chip-v">不放牧</span></span>`;
  const feedChip = `<span class="chip"><span class="chip-k">🍚 最少喂</span><span class="chip-v">${(p.feeding && p.feeding.times) || 0} 次</span></span>`;
  const intervalChip = ((p.feeding && p.feeding.times) || 0) > 0
    ? `<span class="chip"><span class="chip-k">⏱️ 喂食间隔</span><span class="chip-v">${escHtml(feedIntervalText((p.feeding && p.feeding.interval)))}</span></span>`
    : "";
  const lifespanChip = p.lifespan
    ? `<span class="chip"><span class="chip-k">📅 成猪</span><span class="chip-v">${p.lifespan} 小时</span></span>`
    : "";
  const rentChip = p.rent
    ? `<span class="chip"><span class="chip-k">借猪</span><span class="chip-v">${p.rent}pt</span></span>`
    : "";
  const priceChip = `<span class="chip"><span class="chip-k">售价</span><span class="chip-v">${p.price}pt</span></span>`;
  const pickyChip = `<span class="${pickyChipClass}" title="${escHtml(pickyChipTitle)}"><span class="chip-icon">🍽️</span><span class="chip-v">${escHtml(pickyChipText)}</span></span>`;
  const pickyDetail = picky.level !== "none"
    ? `<div class="hero-foods"><span class="hero-foods-k">挑食食材</span><span class="hero-foods-v">${escHtml(picky.foods.join(" / "))}</span></div>`
    : "";

  box.innerHTML = `
    <h2>#${p.pNo} ${escHtml(p.name)}</h2>
    <div class="drawer-actions">${collectBtn}${raisingBtn}</div>
    <div class="hero">
      ${pigImg ? `<img src="${pigImg}" alt="${escHtml(p.name)}">` : ""}
      <div class="info">
        <div class="hero-title">
          <span class="hero-color">${escHtml(p.color_text || "")}</span>
          <span class="${p.special ? "stars special" : "stars"}">${stars(p.rare, p.special)}</span>
        </div>
        ${posText ? `<div class="hero-pos">${escHtml(posText)}</div>` : ""}
        <div class="hero-chips">
          ${rentChip}
          ${priceChip}
          ${grazeChip}
          ${feedChip}
          ${intervalChip}
          ${lifespanChip}
          ${pickyChip}
        </div>
        ${pickyDetail}
        ${badgeMetaHTML(p)}
      </div>
    </div>
    ${p.description ? `<div class="kv note" style="margin-top:10px"><div class="k">描述</div><div class="v">${escHtml(p.description)}</div></div>` : ""}
    ${p.breedingGuide?.requirements ? `<div class="kv note warn" style="margin-top:10px"><div class="k">强制要求</div><div class="v">${escHtml(p.breedingGuide.requirements)}</div></div>` : ""}
    ${p.breedingGuide?.tips ? `<div class="kv note tip" style="margin-top:6px"><div class="k">养成建议</div><div class="v">${escHtml(p.breedingGuide.tips)}</div></div>` : ""}
    ${p.hints && p.hints.length > 0 ? `<div class="kv note hints" style="margin-top:10px"><div class="k">提示</div><div class="v"><ul class="hints-list">${p.hints.map(h => `<li>${escHtml(h)}</li>`).join("")}</ul></div></div>` : ""}
    <div class="section"><h3>获得方式</h3>${acqHTML.join("")}</div>
    ${p.rare !== 6 ? `<div class="section"><h3>它能配出的崽</h3>${parentBlock}</div>` : ""}
    ${p.rare !== 6 || bleeds.length > 0 ? `<div class="section"><h3>配种配出它的方式</h3>${recipeBlock}</div>` : ""}
  `;
  // Wire the collect/uncollect button inside the drawer. Rebuilds the
  // 切换已拥有/未拥有 (主猪 + 活动猪都走 setPigOwned, 取消时联动清掉徽章)
  const cbtn = $("#drawerCollectBtn");
  if (cbtn) {
    cbtn.addEventListener("click", async () => {
      const wasOwn = isOwn;
      if (!(await setPigOwnedAfterConfirm(p.pNo, !wasOwn))) return;
      toast(wasOwn ? `已取消: ${p.name}` : `已标记拥有: ${p.name}`);
      updateOwnedUI(p.pNo);
      showDetail(p.pNo); // re-render drawer so the button label flips
    });
  }
  const rbtn = $("#drawerRaisingBtn");
  if (rbtn) {
    rbtn.addEventListener("click", () => {
      addRaisingPig(p.pNo);
    });
  }

  $("#drawer").classList.add("open");
  $("#drawerBg").classList.add("open");
}

function closeDrawer() {
  const drawer = $("#drawer"), bg = $("#drawerBg");
  drawer.classList.remove("open");
  bg.classList.remove("open");
  // Reset any inline styles left over from a swipe gesture.
  drawer.style.transform = "";
  drawer.style.transition = "";
  bg.style.opacity = "";
  currentDetailPNo = null;
}
$("#drawerBg").addEventListener("click", closeDrawer);

// Swipe-down-to-dismiss on the drawer itself (touch / mouse / pen).
// Gesture is only armed when the drawer is at scrollTop=0 (so upward scroll
// still works normally), or when the user touches the top handle bar.
// Dragged past SWIPE_CLOSE_PX closes; otherwise snaps back.
(function setupDrawerSwipe() {
  const drawer = $("#drawer");
  const bg = $("#drawerBg");
  const SWIPE_CLOSE_PX = 100;
  const DRAG_START_PX = 6; // jitter tolerance before we consider it a drag
  let startY = 0, currentY = 0, activePointerId = null;
  let armed = false, dragging = false;

  drawer.addEventListener("pointerdown", e => {
    if (!drawer.classList.contains("open")) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const onHandle = e.target.closest(".handle");
    // Arm only if finger started at the handle OR drawer is scrolled to top.
    if (!onHandle && drawer.scrollTop > 0) return;
    armed = true;
    dragging = false;
    startY = e.clientY;
    currentY = startY;
    activePointerId = e.pointerId;
    drawer.style.transition = "none";
  });

  drawer.addEventListener("pointermove", e => {
    if (!armed || e.pointerId !== activePointerId) return;
    currentY = e.clientY;
    const dy = currentY - startY;
    if (dy <= 0) {
      // Moving up — give up the gesture, let native scrolling resume.
      drawer.style.transform = "";
      bg.style.opacity = "";
      return;
    }
    if (dy > DRAG_START_PX) {
      dragging = true;
      // Capture so we keep receiving move/up even if finger leaves the drawer
      // (e.g. drags onto the backdrop).
      if (drawer.setPointerCapture && activePointerId !== null) {
        try { drawer.setPointerCapture(activePointerId); } catch (_) { }
      }
    }
    if (dragging) {
      drawer.style.transform = `translateY(${dy}px)`;
      // Fade the backdrop proportionally for tactile feedback.
      const progress = Math.min(1, dy / 300);
      bg.style.opacity = String(Math.max(0.2, 1 - progress * 0.8));
    }
  });

  // Safety net for PWA standalone (esp. iOS home-screen installs): pointer
  // events on iOS don't reliably cancel native scroll — a downward drag on
  // `overflow-y: auto` content can be claimed by the scroll machinery
  // before our pointermove fires, making the sheet "un-swipe-dismissable".
  // A touchmove listener registered with `{ passive: false }` is the only
  // way to call `preventDefault()` on the native scroll for that finger,
  // which is what actually frees our gesture to run.
  drawer.addEventListener("touchmove", e => {
    if (!armed) return;
    const dy = (e.touches[0] ? e.touches[0].clientY : currentY) - startY;
    if (dy > DRAG_START_PX && e.cancelable) {
      e.preventDefault();
    }
  }, { passive: false });

  function endDrag() {
    if (!armed) return;
    const dy = currentY - startY;
    // Restore CSS transitions BEFORE clearing inline styles so the snap-back
    // or close animation is smooth.
    drawer.style.transition = "";
    bg.style.opacity = "";
    if (dragging && dy > SWIPE_CLOSE_PX) {
      closeDrawer();
    } else {
      drawer.style.transform = "";
    }
    armed = false;
    dragging = false;
    activePointerId = null;
  }
  drawer.addEventListener("pointerup", endDrag);
  drawer.addEventListener("pointercancel", endDrag);
  drawer.addEventListener("pointerleave", e => {
    // Only end on leave if we never captured (pointer capture keeps events
    // flowing even off-element).
    if (!drawer.hasPointerCapture || !drawer.hasPointerCapture(e.pointerId)) {
      endDrag();
    }
  });
})();

// Delegated nav: clicking a parent block or outcome chip marked with
// `data-pno` re-renders the drawer for that pig (works for both 186 and
// event pigs, and cross-navigates between them). Attached once; survives
// drawer innerHTML re-renders because it listens on the container.
$("#drawerContent").addEventListener("click", async (e) => {
  // 体型徽章 (小章 / 大章) 勾选 — 只响应 badge-state 按钮的点击，不触发抽屉导航。
  // 同一只猪可能在抽屉里出现多次（比如配种产出 slot），但徽章块目前只有
  // 一处（hero 区），不需要 ownedEventPigs 的多元素同步逻辑。
  const badgeStateBtn = e.target.closest(".badge-state");
  if (badgeStateBtn) {
    e.stopPropagation();
    const pNo = parseInt(badgeStateBtn.dataset.badgePno, 10);
    const kind = badgeStateBtn.dataset.badgeKind;
    if (!pNo || (kind !== "small" && kind !== "big")) return;
    const set = kind === "small" ? state.smallBadges : state.bigBadges;
    setPigBadge(pNo, kind, !set.has(pNo));
    // 联动可能改了 owned 状态 → 定点刷新卡片 + 重渲染抽屉
    updateOwnedUI(pNo);
    if (currentDetailPNo) showDetail(currentDetailPNo);
    return;
  }
  // 配种产出 slot 的 "已拥有" 勾选 (针对该 slot 指向的猪本身)
  const chk = e.target.closest("[data-owned-pno]");
  if (chk) {
    e.stopPropagation();
    const pNo = parseInt(chk.dataset.ownedPno, 10);
    if (!pNo) return;
    if (!(await setPigOwnedAfterConfirm(pNo, !state.ownedEventPigs.has(pNo)))) return;
    updateOwnedUI(pNo);
    if (currentDetailPNo) showDetail(currentDetailPNo);
    return;
  }
  const t = e.target.closest("[data-pno]");
  if (!t) return;
  const target = parseInt(t.dataset.pno, 10);
  if (!target || target === currentDetailPNo) return;
  e.stopPropagation();
  showDetail(target);
  // keep the scroll position comfortable when deep-diving a lineage
  $("#drawerContent").scrollTop = 0;
});

// ----- 简/繁切换 -----
function updateLangButton() {
  const btn = $("#langBtn");
  if (!btn) return;
  const lang = currentLang();
  // 按钮显示的是「点一下会切到这个语言」, 跟 theme 按钮风格一致
  btn.textContent = lang === "zhs" ? "繁" : "简";
  btn.setAttribute("aria-label", lang === "zhs" ? "切换为繁体" : "切换为简体");
  btn.title = lang === "zhs" ? "当前简体, 点击切换为繁体" : "当前繁体, 点击切换为简体";
}
updateLangButton();

// 更新按钮：手动查看更新内容
$("#updateBtn").addEventListener("click", () => {
  showUpdateManually();
});

$("#langBtn").addEventListener("click", async () => {
  const next = currentLang() === "zhs" ? "zht" : "zhs";
  saveLang(next);
  updateLangButton();
  // 清掉已加载的数据,重新拉对应语言版本
  state.dataLoaded = false;
  state.pigsById.clear();
  state.eventPigsById.clear();
  state.pigsByListKey.clear();
  state.breedByParent = new Map();
  render();
  try {
    await loadData();
    render();
    toast(next === "zhs" ? "已切换为简体" : "已切换为繁体");
  } catch (err) {
    console.error(err);
    toast("切换失败: " + err.message);
  }
});

// ----- theme toggle -----
const THEME_KEY = "theme";
function currentTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}
function updateThemeChrome(mode) {
  document.documentElement.dataset.theme = mode;
  const meta = document.getElementById("themeColorMeta");
  if (meta) meta.setAttribute("content", mode === "dark" ? "#0b1220" : "#ffffff");
  const btn = $("#themeBtn");
  if (btn) {
    btn.textContent = mode === "dark" ? "☀" : "☾";
    btn.setAttribute("aria-label", mode === "dark" ? "切换为浅色主题" : "切换为深色主题");
  }
}
// Sync button icon with the theme set by the inline head script; do not persist.
updateThemeChrome(currentTheme());
$("#themeBtn").addEventListener("click", () => {
  const next = currentTheme() === "dark" ? "light" : "dark";
  updateThemeChrome(next);
  try { localStorage.setItem(THEME_KEY, next); } catch { }
});
// Follow system only if the user hasn't clicked (no saved pref).
if (window.matchMedia) {
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  const onSysChange = e => {
    if (localStorage.getItem(THEME_KEY)) return;
    updateThemeChrome(e.matches ? "dark" : "light");
  };
  if (mql.addEventListener) mql.addEventListener("change", onSysChange);
  else if (mql.addListener) mql.addListener(onSysChange);
}

// ----- PWA bits -----
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(console.warn);
}

let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  deferredPrompt = e;
  $("#install").classList.add("show");
});
$("#installBtn").addEventListener("click", async () => {
  if (!deferredPrompt) {
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    await customAlert(
      isIOS
        ? "iOS:点击 Safari 下方分享按钮 → 加到主屏幕"
        : "请用浏览器菜单选择「安装 App / 加到主屏幕」"
    );
    return;
  }
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $("#install").classList.remove("show");
});
const ua = navigator.userAgent;
if (/iPad|iPhone|iPod/.test(ua) && !window.navigator.standalone) {
  $("#install").classList.add("show");
  $("#installText").textContent = "在 Safari 点击分享 → 加到主屏幕";
}

// ----- tab switching -----
const TABS = {
  atlas: { panel: "#tabAtlas", btn: "#tabBtnAtlas" },
  events: { panel: "#tabEvents", btn: "#tabBtnEvents" },
  raising: { panel: "#tabRaising", btn: "#tabBtnRaising" },
  auction: { panel: "#tabAuction", btn: "#tabBtnAuction" },
  mine: { panel: "#tabMine", btn: "#tabBtnMine" },
};
function activateTab(name) {
  if (!TABS[name]) name = "raising";
  for (const [k, ids] of Object.entries(TABS)) {
    const active = k === name;
    $(ids.panel).classList.toggle("active", active);
    $(ids.btn).classList.toggle("active", active);
    $(ids.btn).setAttribute("aria-selected", String(active));
  }
  // 切到某 tab 时才渲染它的重列表，反映在其他 tab 期间发生的收藏变化
  refreshOwnedSet();
  renderActiveTab();
  if (name === "raising") {
    renderRaisingSearchResults();
    updateRaisingCountdownNodes();
  }
  if (name === "auction") renderAuctionTab();
  requestAnimationFrame(() => {
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  });
}
$("#tabBtnAtlas").addEventListener("click", () => activateTab("atlas"));
$("#tabBtnEvents").addEventListener("click", () => activateTab("events"));
$("#tabBtnRaising").addEventListener("click", () => activateTab("raising"));
$("#tabBtnAuction").addEventListener("click", () => activateTab("auction"));
$("#tabBtnMine").addEventListener("click", () => activateTab("mine"));

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", e => {
    if (e.data && e.data.type === "open-tab") activateTab(e.data.tab);
  });
}

const initialTab = new URLSearchParams(window.location.search).get("tab");
if (initialTab && TABS[initialTab]) {
  activateTab(initialTab);
  window.history.replaceState({}, "", window.location.pathname);
}

// ----- 拍卖场 tab -----
const AUCTION_PAGE_SIZE = 30;
const auctionState = {
  loading: false,
  loadingMore: false,           // 滚到底部加载更多时为 true
  records: [],                  // 上次请求成功的记录
  error: null,                  // 上次请求失败的错误文本
  fetchedAt: null,              // ms timestamp
  hasSearched: false,           // 是否主动查询过，影响初始空状态文案
  count: AUCTION_PAGE_SIZE,     // 当前向上游请求的 cnt 值
  atEnd: false,                 // 已无更多 —— count 加大也没新增记录
  server: "tw",                 // "tw" 台服 / "jp" 日服 —— 上次查询用的服务器
};
let auctionLoadMoreObserver = null;
// UI 上"空字符串"= 不限；"0" 是有效筛选值（不挑食/不放牧/公），不能跟"不限"混淆
const auctionFilter = {
  color: "",
  rare: "",
  isExer: "",
  foodtype: "",
  sex: "",
  sort: "1",
  // own 是本地筛选 (上游不支持), fetchAuctions 时跳过, renderAuctionTab 时按它过滤
  //   ""        全部
  //   "no"      未拥有 (含未知品种)
  //   "yes"     已拥有
  //   "no_small" 已拥有但缺小章
  //   "no_big"   已拥有但缺大章
  own: "",
};
// 颜色 → 上游 p 字段的视觉色组代码（默认 0=全部）。跟响应里 pNo 字段同空间
const COLOR_TO_P = {
  "肉色": "700",
  "灰色": "704",
  "米色": "708",
  "粉色": "712",
  "白色": "716",
  "其他": "720",
};
let auctionCountdownTimer = null;

// 给筛选 chip 装点击处理：高亮 + 写入 auctionFilter，不自动 fetch。
// own 是例外：它是本地筛选,切换时直接 re-render (避免玩家还要再点一次 🔍)
document.querySelectorAll("#tabAuction .filter-row").forEach(row => {
  const field = row.dataset.filter;
  if (!field) return;
  row.addEventListener("click", e => {
    const chip = e.target.closest(".chip");
    if (!chip || !row.contains(chip)) return;
    auctionFilter[field] = chip.dataset.value || "";
    row.querySelectorAll(".chip").forEach(c =>
      c.classList.toggle("active", c === chip));
    if (field === "own" && auctionState.records.length) {
      renderAuctionTab();
    }
  });
});

async function fetchAuctions({ append = false, server } = {}) {
  if (auctionState.loading || auctionState.loadingMore) return;
  if (!append) {
    // 全新查询：重置分页状态。server 由调用者传入；append 时沿用 state.server
    auctionState.count = AUCTION_PAGE_SIZE;
    auctionState.atEnd = false;
    auctionState.records = [];
    if (server) auctionState.server = server;
  }
  if (append) auctionState.loadingMore = true;
  else auctionState.loading = true;
  auctionState.error = null;
  auctionState.hasSearched = true;
  renderAuctionTab();

  const prevCount = auctionState.records.length;
  try {
    // 检查登录状态（拍卖场功能需要登录）
    if (!isLoggedIn()) {
      throw new Error("请先登录才能使用拍卖场功能");
    }

    const user = getCurrentUser();
    const qs = new URLSearchParams({
      count: String(auctionState.count),
      server: auctionState.server,
      userId: user.id, // 添加用户ID用于验证和统计
    });
    for (const [k, v] of Object.entries(auctionFilter)) {
      if (v === "") continue;
      // own 是本地筛选,不上传给上游
      if (k === "own") continue;
      if (k === "color") {
        const code = COLOR_TO_P[v];
        if (code) qs.set("color", code);
        continue;
      }
      qs.set(k === "isExer" ? "is_exer" : k, v);
    }
    const res = await fetch("/api/auction-search?" + qs.toString(), { method: "POST" });
    if (!res.ok) {
      if (res.status === 401) {
        throw new Error("登录已过期，请重新登录");
      }
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    if (data.status !== "ok") throw new Error(data.error || "未知错误");
    const newRecords = data.records || [];
    // append 时若总数没增长 → 已经到底
    if (append && newRecords.length <= prevCount) {
      auctionState.atEnd = true;
    }
    auctionState.records = newRecords;
    auctionState.fetchedAt = Date.now();
  } catch (err) {
    auctionState.error = err && err.message ? err.message : String(err);
    console.warn("[auction] fetch failed:", err);
  } finally {
    auctionState.loading = false;
    auctionState.loadingMore = false;
    renderAuctionTab();
  }
}

async function loadMoreAuctions() {
  if (auctionState.loading || auctionState.loadingMore || auctionState.atEnd) return;
  auctionState.count += AUCTION_PAGE_SIZE;
  await fetchAuctions({ append: true });
}

$("#auctionSearchBtnTw").addEventListener("click", () => fetchAuctions({ server: "tw" }));
$("#auctionSearchBtnJp").addEventListener("click", () => fetchAuctions({ server: "jp" }));

// 上游 bType 对应静态数据 pigs.json 的 pNo（pNo 字段是另一个视觉编号，不是品种号）。
function lookupPig(bType) {
  return state.pigsById.get(bType) || state.eventPigsById.get(bType) || null;
}

// 拍卖场本地"我的拥有状态"过滤。上游不支持这维度,所以拿到 records 后再筛。
//   no       → 未拥有 (含数据里查不到的未知品种,这种情况一律视为"我没有")
//   yes      → 已拥有
//   no_small → 已拥有但缺小章 (帮玩家定位"补章"的目标)
//   no_big   → 已拥有但缺大章
function filterAuctionByOwn(records, own) {
  if (!own) return records;
  return records.filter(rec => {
    const pNo = rec.bType;
    const known = state.pigsById.has(pNo) || state.eventPigsById.has(pNo);
    const owned = known && (
      isEventPigId(pNo)
        ? state.ownedEventPigs.has(pNo)
        : state.ownedSet.has(pNo)
    );
    if (own === "no") return !owned;
    if (own === "yes") return owned;
    if (own === "no_small") return owned && !state.smallBadges.has(pNo);
    if (own === "no_big") return owned && !state.bigBadges.has(pNo);
    return true;
  });
}

// 上游 limitdate 比本地时间晚 8 小时（实测）。+8h 后当本地时间渲染。
const LIMITDATE_OFFSET_HOURS = 8;
function parseLimitdate(s) {
  if (!s) return null;
  // "2026-05-20 03:09:50"
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  d.setHours(d.getHours() + LIMITDATE_OFFSET_HOURS);
  return d;
}

// 上游 weight 是相对基线的偏移量，显示需 +22 还原成 kg。
const WEIGHT_OFFSET_KG = 22;
// 成猪体重 = 显示体重 + 98 = (rec.weight + 22) + 98 = rec.weight + 120
// 在 rec.weight 这个 raw scale 上,成猪 offset 就是 22+98=120 — 用于判断能否冲小/大章
const ADULT_OFFSET_KG = WEIGHT_OFFSET_KG + 98;

function formatCountdown(targetMs) {
  const now = Date.now();
  const diff = targetMs - now;
  if (diff <= 0) return { text: "已结束", cls: "urgent" };
  const sec = Math.floor(diff / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  let cls = "";
  if (sec < 600) cls = "urgent";
  else if (sec < 3600) cls = "soon";
  if (h > 0) return { text: `${h}h ${m}m`, cls };
  if (m > 0) return { text: `${m}m ${s}s`, cls };
  return { text: `${s}s`, cls };
}

function rareStars(n) {
  const v = n || 0;
  if (v >= 6) return "★".repeat(6);
  const safe = Math.max(0, Math.min(5, v));
  return "★".repeat(safe) + "☆".repeat(5 - safe);
}

// foodtype: 0=不挑食 / 1=有点挑食 / 2=挑食 (推断, 跟 .so 里 picky 等级一致)
const FOOD_LABELS = { 0: "🍽️ 不挑食", 1: "🍽️ 有点挑食", 2: "🍽️ 挑食" };
// 响应里第 10 字段 (pigletOrSex)：0=雄 / 1=雌
const SEX_LABELS = { 0: "雄", 1: "雌" };
const SEX_CLS = { 0: "sex male", 1: "sex female" };

function buildSexBadge(v) {
  if (!(v in SEX_LABELS)) return null;
  return el("span", { class: SEX_CLS[v] }, SEX_LABELS[v]);
}

// 拍卖场卡片/列表行用的「我是否拥有 + 大小章」一行 chip
function buildAuctionOwnershipRow(pNo) {
  if (!pNo) return null;
  const known = state.pigsById.has(pNo) || state.eventPigsById.has(pNo);
  if (!known) return null;
  const owned = isEventPigId(pNo)
    ? state.ownedEventPigs.has(pNo)
    : state.ownedSet.has(pNo);
  const sm = state.smallBadges.has(pNo);
  const bg = state.bigBadges.has(pNo);
  return el("div", { class: "auction-own-row" }, [
    el("span", { class: "auction-own-chip pig" + (owned ? " is-on" : "") },
      owned ? "✅ 已拥有" : "⬜ 未拥有"),
    el("img", {
      src: "/img/small.png",
      class: "auction-own-badge" + (sm ? " is-on" : ""),
      alt: "小章",
      title: sm ? "已拿小章" : "未拿小章",
    }),
    el("img", {
      src: "/img/big.png",
      class: "auction-own-badge" + (bg ? " is-on" : ""),
      alt: "大章",
      title: bg ? "已拿大章" : "未拿大章",
    }),
  ]);
}

// 章别预测 chip: 根据"成猪体重 = weight + 98"预估这只幼猪能冲哪种章
//   adult < small  → 还有机会拿小章 (距上限还可涨 X kg)
//   adult ≥ small  → 错过小章, 还差 X kg 到大章
// 游戏机制下 adult 不会 ≥ 大章阈值, 所以无须第三种情况。
// 该品种数据里没 weight 字段 (badgeWeights == null) → 不显示。
// 特例：大黑猪 (pNo 50) 的成猪体重偏移是 278 而不是 98
function buildBadgeForecast(rec, pig) {
  if (!pig) return null;
  const w = badgeWeights(pig);
  if (!w) return null;
  // 大黑猪特殊处理：偏移 22 + 278 = 300
  const adultOffset = pig.pNo === 50 ? (WEIGHT_OFFSET_KG + 278) : ADULT_OFFSET_KG;
  const adult = (rec.weight || 0) + adultOffset;
  const adultStr = adult.toFixed(1);
  if (adult < w.small) {
    const delta = (w.small - adult).toFixed(1);
    return el("span", {
      class: "auction-forecast small-ok",
      title: `预测成猪 ${adultStr}kg · 小章 ≤ ${fmtKg(w.small)}kg`,
    }, [
      el("img", { src: "/img/small.png", class: "auction-forecast-icon", alt: "小章" }),
      `可拿小章 · 还能涨 ${delta} kg`,
    ]);
  }
  const delta = (w.big - adult).toFixed(1);
  return el("span", {
    class: "auction-forecast big-todo",
    title: `预测成猪 ${adultStr}kg · 大章 ≥ ${fmtKg(w.big)}kg (小章已错过)`,
  }, [
    el("img", { src: "/img/big.png", class: "auction-forecast-icon", alt: "大章" }),
    `距大章 ${delta} kg`,
  ]);
}

function buildAuctionRow(rec) {
  const pig = lookupPig(rec.bType);
  const name = pig ? pig.name : "未知品种";
  const sublineParts = [];
  if (pig && pig.color_text) sublineParts.push(pig.color_text);
  else sublineParts.push(`bType=${rec.bType}`);
  const displayWeight = (rec.weight + WEIGHT_OFFSET_KG).toFixed(1);

  const thumb = el("div", { class: "thumb" },
    el("img", {
      src: imgUrl(rec.bType),
      loading: "lazy",
      alt: name,
      onerror: "this.style.display='none'",
    }),
  );

  const limit = parseLimitdate(rec.limitdate);
  const limitMs = limit ? limit.getTime() : 0;
  const cd = formatCountdown(limitMs);
  const countdownEl = el("span", {
    class: "auction-countdown " + cd.cls,
    "data-limit-ms": String(limitMs),
  }, "⏱ " + cd.text);

  const metaParts = [
    `⚖ ${displayWeight}kg`,
    FOOD_LABELS[rec.foodtype] || "🍽️ ?",
    rec.isExer ? "🌿 放牧" : "🏠 不放牧",
    rec.bidcount > 0 ? `已 ${rec.bidcount} 次出价` : "未出价",
  ];

  const sexBadge = buildSexBadge(rec.pigletOrSex);
  const nameChildren = [name];
  if (sexBadge) nameChildren.push(sexBadge);
  nameChildren.push(el("span", { class: "stars" }, rareStars(rec.rare)));

  const ownRow = buildAuctionOwnershipRow(rec.bType);
  const forecast = buildBadgeForecast(rec, pig);
  if (ownRow && forecast) ownRow.appendChild(forecast);
  const info = el("div", { class: "info" }, [
    el("div", { class: "name" }, nameChildren),
    el("div", { class: "meta" }, metaParts.join(" · ")),
    el("div", { class: "owner", title: rec.ownername },
      `${sublineParts.join(" · ")} · 出品 ${rec.ownername || "(匿名)"} · #${rec.pigNo}`),
    ownRow,
  ]);

  const priceCol = el("div", { class: "price-col" }, [
    el("div", { class: "price" }, [
      String(rec.nowPrice.toLocaleString()),
      el("span", { class: "pt" }, "pt"),
    ]),
    countdownEl,
  ]);

  return el("div", {
    class: "auction-list-row",
    onclick: () => {
      if (lookupPig(rec.bType)) showDetail(rec.bType);
    },
  }, [thumb, info, priceCol]);
}

function renderAuctionTab() {
  const box = $("#auctionBody");
  const statsBar = $("#auctionStatsBar");
  box.innerHTML = "";
  stopAuctionCountdown();

  if (auctionState.loading) {
    statsBar.textContent = "加载中…";
    box.appendChild(el("div", { class: "loading" }, [
      el("div", { class: "spinner" }),
      el("div", {}, "正在拉取拍卖场数据…"),
    ]));
    return;
  }

  if (auctionState.error) {
    statsBar.textContent = "加载失败";
    box.appendChild(el("div", { class: "auction-error" }, [
      el("div", {}, "❌ " + auctionState.error),
    ]));
    return;
  }

  if (!auctionState.records.length) {
    if (!auctionState.hasSearched) {
      statsBar.textContent = "未加载";
      box.appendChild(el("div", { class: "loading" }, [
        el("div", {}, "选好筛选条件后点 🔍 查询"),
      ]));
    } else {
      statsBar.textContent = "无结果";
      box.appendChild(el("div", { class: "loading" }, [
        el("div", {}, "没有符合条件的拍品，调一下筛选再试。"),
      ]));
    }
    return;
  }

  const fetched = new Date(auctionState.fetchedAt);
  const fetchedText = fetched.toLocaleTimeString([], {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const serverLabel = auctionState.server === "jp" ? "日服" : "台服";

  // 本地按"我的拥有状态"过滤,不影响 auctionState.records (无限滚动还要拉更多)
  const shown = filterAuctionByOwn(auctionState.records, auctionFilter.own);
  const filterHint = auctionFilter.own
    ? ` · 筛后 ${shown.length} 条`
    : "";
  statsBar.textContent =
    `${serverLabel} · 共 ${auctionState.records.length} 条${filterHint} · 更新于 ${fetchedText}`;

  if (shown.length === 0 && auctionFilter.own) {
    box.appendChild(el("div", { class: "loading" }, [
      el("div", {}, "当前结果里没有符合「我的」筛选的拍品 — 切换条件或多加载几条试试"),
    ]));
  } else {
    const list = el("div", { class: "auction-list" },
      shown.map(buildAuctionRow));
    box.appendChild(list);
  }

  // 底部 sentinel + 加载更多状态
  const footer = el("div", { class: "auction-footer" }, [
    auctionState.loadingMore
      ? el("div", { class: "loading-more" }, [
        el("div", { class: "spinner small" }), el("div", {}, "加载更多…"),
      ])
      : auctionState.atEnd
        ? el("div", { class: "load-end" }, `— 没有更多了 (cnt=${auctionState.count}) —`)
        : el("div", { class: "auction-sentinel" }, ""),
  ]);
  box.appendChild(footer);

  setupAuctionLoadMore();
  startAuctionCountdown();
}

function setupAuctionLoadMore() {
  if (auctionLoadMoreObserver) {
    auctionLoadMoreObserver.disconnect();
    auctionLoadMoreObserver = null;
  }
  const sentinel = document.querySelector("#auctionBody .auction-sentinel");
  if (!sentinel) return;
  auctionLoadMoreObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) loadMoreAuctions();
    }
  }, { rootMargin: "240px" });
  auctionLoadMoreObserver.observe(sentinel);
}

function startAuctionCountdown() {
  stopAuctionCountdown();
  auctionCountdownTimer = setInterval(() => {
    const nodes = document.querySelectorAll("#auctionBody .auction-countdown");
    nodes.forEach(node => {
      const ms = Number(node.getAttribute("data-limit-ms")) || 0;
      if (!ms) return;
      const cd = formatCountdown(ms);
      node.textContent = "⏱ " + cd.text;
      node.classList.remove("urgent", "soon");
      if (cd.cls) node.classList.add(cd.cls);
    });
  }, 1000);
}

function stopAuctionCountdown() {
  if (auctionCountdownTimer) {
    clearInterval(auctionCountdownTimer);
    auctionCountdownTimer = null;
  }
}

// ----- name search (add-tab) -----
const nameState = { q: "", results: [] };

function searchByName(q) {
  const ql = q.trim().toLowerCase();
  if (!ql) return [];
  const out = [];
  for (const p of state.pigsById.values()) {
    const hay = ((p.name || "") + " " + (p.description || "") + " #" + p.pNo).toLowerCase();
    if (hay.includes(ql)) out.push(p);
    if (out.length >= 60) break;
  }
  out.sort((a, b) =>
    (a.book - b.book) || (a.page - b.page) || (a.slot - b.slot) || (a.pNo - b.pNo)
  );
  return out;
}

function renderNameResults() {
  const box = $("#nameResults");
  if (!box) return;
  box.innerHTML = "";
  if (!nameState.q) {
    box.classList.remove("show");
    return;
  }
  if (nameState.results.length === 0) {
    box.classList.add("show");
    box.appendChild(el("div", { class: "empty-row" }, "没有匹配的猪"));
    return;
  }
  box.classList.add("show");
  for (const p of nameState.results) {
    const already = state.ownedSet.has(p.pNo);
    const posText = p.book && p.book <= 6
      ? `图鉴${p.book}/页${p.page}/格${p.slot}`
      : (p.list && p.list.typeno === 7 ? "活动图鉴" : "");
    const row = el("div", {
      class: "row",
      onclick: () => {
        const res = addByPNo(p.pNo);
        if (res.err) { toast(res.err); return; }
        if (res.ok) {
          toast(res.msg);
          render();
        } else {
          toast(res.msg); // 已在收藏中
        }
      },
    }, [
      el("img", { src: imgUrl(p.pNo), loading: "lazy", alt: p.name }),
      el("div", { class: "meta" }, [
        el("div", { class: "r-name" }, `#${p.pNo} ${p.name}`),
        el("div", { class: "r-sub" }, `${p.color_text || ""}${posText ? " · " + posText : ""}`),
      ]),
      already ? el("span", { class: "r-in" }, "已添加") : null,
    ]);
    box.appendChild(row);
  }
}

let nameSearchTimer = null;
$("#nameIn").addEventListener("input", e => {
  clearTimeout(nameSearchTimer);
  const v = e.target.value;
  nameSearchTimer = setTimeout(() => {
    nameState.q = v;
    nameState.results = state.dataLoaded ? searchByName(v) : [];
    const msg = $("#nameMsg");
    if (!v.trim()) {
      msg.textContent = "输入至少 1 个字符开始搜索，点击结果即可添加";
    } else if (!state.dataLoaded) {
      msg.innerHTML = `<span class="err">数据还没加载好</span>`;
    } else {
      msg.textContent = `找到 ${nameState.results.length} 只匹配的猪`;
    }
    renderNameResults();
  }, 160);
});

// ----- batch triples -----
function parseBatchLines(text) {
  const lines = text.split(/\r?\n/);
  const parsed = [];
  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) return;
    const parts = line.split(/[\s\/,.;]+/).filter(Boolean);
    parsed.push({ raw: line, idx: idx + 1, parts });
  });
  return parsed;
}

$("#batchAddBtn").addEventListener("click", () => {
  const ta = $("#batchIn");
  const report = $("#batchReport");
  report.innerHTML = "";
  if (!state.dataLoaded) {
    report.innerHTML = `<div class="line err">数据还没加载好</div>`;
    return;
  }
  const items = parseBatchLines(ta.value);
  if (items.length === 0) {
    report.innerHTML = `<div class="line err">没有有效的三元组输入</div>`;
    return;
  }
  let okCount = 0, dupCount = 0, errCount = 0;
  const frag = document.createDocumentFragment();
  for (const it of items) {
    if (it.parts.length < 3) {
      frag.appendChild(el("div", { class: "line err" },
        `L${it.idx}: "${it.raw}" — 需要 3 个数字`));
      errCount++;
      continue;
    }
    const [b, p, s] = it.parts;
    const res = addFromTriple(b, p, s);
    if (res.err) {
      frag.appendChild(el("div", { class: "line err" },
        `L${it.idx}: ${b}/${p}/${s} — ${res.err}`));
      errCount++;
    } else if (res.ok) {
      frag.appendChild(el("div", { class: "line ok" },
        `L${it.idx}: ${b}/${p}/${s} → #${res.pig.pNo} ${res.pig.name}`));
      okCount++;
    } else {
      frag.appendChild(el("div", { class: "line dup" },
        `L${it.idx}: ${b}/${p}/${s} → #${res.pig.pNo} ${res.pig.name} (已在收藏中)`));
      dupCount++;
    }
  }
  const summary = el("div", { class: "line" },
    `总结: 新增 ${okCount} · 重复 ${dupCount} · 失败 ${errCount}`);
  summary.style.fontWeight = "600";
  summary.style.paddingBottom = "4px";
  summary.style.borderBottom = "1px solid var(--border)";
  summary.style.marginBottom = "4px";
  report.appendChild(summary);
  report.appendChild(frag);
  if (okCount > 0) {
    toast(`已添加 ${okCount} 只` + (dupCount ? ` · 重复 ${dupCount}` : "") + (errCount ? ` · 失败 ${errCount}` : ""));
    render();
  } else if (dupCount > 0 && errCount === 0) {
    toast(`全部 ${dupCount} 只已在收藏中`);
  }
});
$("#batchClearBtn").addEventListener("click", () => {
  $("#batchIn").value = "";
  $("#batchReport").innerHTML = "";
});

// ----- export / import flow -----
// 导出的 JSON 结构。version 用于日后兼容性升级。
//
// v1 (老版): collection / collectionTriplets 装的是 "未拥有" 列表 (inverted)
// v2: owned186Pigs / owned186Triplets 装的是 "已拥有" 列表 (positive),
//     语义跟 ownedEventPigs / smallBadges / bigBadges 一致。
// v3: 额外包含 raisingPigs / raisingFloor。
//
// 导入时按 version 字段或具体字段存在性自动判定语义,详见 parseImportText。
const EXPORT_TYPE = "pigfarm-helper-backup";
const EXPORT_VERSION = 3;

function buildExportPayload() {
  // 主图鉴按 book/page/slot 排序后只输出 pNo 列表 (owned186Triplets 已废弃,
  // pNo 是唯一可靠标识; 导入侧仍保留 triplets 兼容)
  const sortedMain = [];
  for (const pNo of state.collection) {
    const p = state.pigsById.get(pNo);
    if (p) sortedMain.push(p);
  }
  sortedMain.sort((a, b) =>
    (a.book - b.book) || (a.page - b.page) || (a.slot - b.slot) || (a.pNo - b.pNo));
  return {
    type: EXPORT_TYPE,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    owned186Pigs: sortedMain.map(p => p.pNo),
    ownedEventPigs: Array.from(state.ownedEventPigs).sort((a, b) => a - b),
    smallBadges: Array.from(state.smallBadges).sort((a, b) => a - b),
    bigBadges: Array.from(state.bigBadges).sort((a, b) => a - b),
    raisingPigs: state.raisingPigs.map(item => ({
      id: item.id,
      pNo: item.pNo,
      startedAt: item.startedAt,
      lastFedAt: item.lastFedAt,
      notifiedAt: item.notifiedAt || 0,
      feedCount: Math.max(0, Number.parseInt(item.feedCount || 0, 10) || 0),
      status: item.status === "waiting" ? "waiting" : "active",
    })),
    raisingFloor: state.raisingFloor,
    hiddenUnlocked: state.hiddenUnlocked,
  };
}

function buildExportJson() {
  return JSON.stringify(buildExportPayload(), null, 2);
}

async function copyText(txt) {
  // Prefer async Clipboard API; fall back to execCommand for older / http 环境
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(txt);
      return true;
    }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = txt;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function runExport(alsoCopy) {
  const out = $("#exportOut");
  const msg = $("#exportMsg");
  if (!state.dataLoaded) {
    msg.innerHTML = `<span class="err">数据还没加载好</span>`;
    return;
  }
  const payload = buildExportPayload();
  const txt = JSON.stringify(payload, null, 2);
  out.value = txt;
  const nColl = payload.owned186Pigs.length;
  const nOwned = payload.ownedEventPigs.length;
  const nSmall = payload.smallBadges.length;
  const nBig = payload.bigBadges.length;
  const nRaising = payload.raisingPigs.length;
  if (nColl === 0 && nOwned === 0 && nSmall === 0 && nBig === 0 && nRaising === 0) {
    msg.innerHTML = `<span class="err">记录为空, 没什么可导出</span>`;
    return;
  }
  const summary = `186 已拥有 ${nColl} · Events 已拥有 ${nOwned} · 小章 ${nSmall} · 大章 ${nBig} · 养成中 ${nRaising}`;
  if (alsoCopy) {
    copyText(txt).then(ok => {
      if (ok) {
        msg.innerHTML = `<span class="ok">已复制到剪贴板: ${summary}</span>`;
        toast(`已复制到剪贴板`);
      } else {
        out.focus(); out.select();
        msg.innerHTML = `<span class="err">复制失败, 请手动选中上方文本复制</span>`;
      }
    });
  } else {
    out.focus(); out.select();
    msg.innerHTML = `<span class="ok">已导出: ${summary}</span>`;
  }
}

function runExportDownload() {
  const msg = $("#exportMsg");
  if (!state.dataLoaded) {
    msg.innerHTML = `<span class="err">数据还没加载好</span>`;
    return;
  }
  const payload = buildExportPayload();
  if (payload.owned186Pigs.length === 0 && payload.ownedEventPigs.length === 0 && payload.smallBadges.length === 0 && payload.bigBadges.length === 0 && payload.raisingPigs.length === 0) {
    msg.innerHTML = `<span class="err">记录为空, 没什么可导出</span>`;
    return;
  }
  const txt = JSON.stringify(payload, null, 2);
  $("#exportOut").value = txt;
  try {
    const blob = new Blob([txt], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    a.href = url;
    a.download = `pigfarm-helper-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    msg.innerHTML = `<span class="ok">已下载备份文件</span>`;
  } catch (err) {
    console.error(err);
    msg.innerHTML = `<span class="err">下载失败：${escHtml(err.message || String(err))}</span>`;
  }
}

// 解析导入文本,返回 { collection, ownedEventPigs, smallBadges, bigBadges,
//                       raisingPigs, raisingFloor?, hiddenUnlocked?, source, formatVersion } 或 { err }。
//
// 兼容三种来源:
//   A) v2+ JSON (本版): owned186Pigs / owned186Triplets 是 "已拥有" 列表 → 直读
//   B) v1 JSON (老版):  collection / collectionTriplets 是 "未拥有" 列表 → 翻转
//                        owned = base 186 pNos − collection
//   C) 三元组裸文本 (老式按格添加): 视为 "已拥有" 列表 → 直读
//
// 解析所有非主图鉴字段 (ownedEventPigs, smallBadges, bigBadges) 都是 positive 语义,两版一致。
function parseImportText(raw) {
  const txt = (raw || "").trim();
  if (!txt) return { err: "输入为空" };

  if (txt.startsWith("{") || txt.startsWith("[")) {
    let obj;
    try {
      obj = JSON.parse(txt);
    } catch (err) {
      return { err: `JSON 解析失败: ${err.message}` };
    }
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
      return { err: "JSON 顶层必须是一个对象" };
    }
    if (obj.type && obj.type !== EXPORT_TYPE) {
      return { err: `不是本工具的备份文件 (type=${obj.type})` };
    }

    const fileVersion = Number.parseInt(obj.version, 10) || 1;
    const hasV2 = Array.isArray(obj.owned186Pigs) || Array.isArray(obj.owned186Triplets);
    const isV2 = hasV2 || fileVersion >= 2;

    const collection = [];
    const tripletToPNo = (s) => {
      const m = String(s).match(/^(\d+)[\/\s,.;]+(\d+)[\/\s,.;]+(\d+)$/);
      if (!m) return null;
      const key = `${+m[1]}-${(+m[2] - 1) * 6 + +m[3]}`;
      return state.pigsByListKey.get(key) || null;
    };

    if (isV2) {
      // v2: 直读 已拥有 列表
      if (Array.isArray(obj.owned186Pigs)) {
        for (const v of obj.owned186Pigs) {
          const n = Number.parseInt(v, 10);
          if (Number.isInteger(n) && state.pigsById.has(n)) collection.push(n);
        }
      } else if (Array.isArray(obj.owned186Triplets)) {
        for (const s of obj.owned186Triplets) {
          const pNo = tripletToPNo(s);
          if (pNo) collection.push(pNo);
        }
      }
    } else {
      // v1: collection 字段是 未拥有 列表, 翻转 (排除隐藏猪)
      const unowned = new Set();
      if (Array.isArray(obj.collection)) {
        for (const v of obj.collection) {
          const n = Number.parseInt(v, 10);
          if (Number.isInteger(n)) unowned.add(n);
        }
      } else if (Array.isArray(obj.collectionTriplets)) {
        for (const s of obj.collectionTriplets) {
          const pNo = tripletToPNo(s);
          if (pNo) unowned.add(pNo);
        }
      }
      for (const [pNo, pig] of state.pigsById) {
        if (pig.status === "hidden") continue;
        if (!unowned.has(pNo)) collection.push(pNo);
      }
    }

    const ownedEventPigs = [];
    if (Array.isArray(obj.ownedEventPigs)) {
      for (const v of obj.ownedEventPigs) {
        const n = Number.parseInt(v, 10);
        if (Number.isInteger(n) && state.eventPigsById.has(n)) ownedEventPigs.push(n);
      }
    }
    const smallBadges = [];
    if (Array.isArray(obj.smallBadges)) {
      for (const v of obj.smallBadges) {
        const n = Number.parseInt(v, 10);
        if (Number.isInteger(n) && (state.pigsById.has(n) || state.eventPigsById.has(n))) smallBadges.push(n);
      }
    }
    const bigBadges = [];
    if (Array.isArray(obj.bigBadges)) {
      for (const v of obj.bigBadges) {
        const n = Number.parseInt(v, 10);
        if (Number.isInteger(n) && (state.pigsById.has(n) || state.eventPigsById.has(n))) bigBadges.push(n);
      }
    }
    const raisingPigs = [];
    if (Array.isArray(obj.raisingPigs)) {
      for (const raw of obj.raisingPigs) {
        const pNo = Number.parseInt(raw && raw.pNo, 10);
        if (!Number.isInteger(pNo) || !getPigByPNo(pNo)) continue;
        const now = Date.now();
        const startedAt = Number.parseInt(raw.startedAt, 10);
        const lastFedAt = Number.parseInt(raw.lastFedAt, 10);
        const notifiedAt = Number.parseInt(raw.notifiedAt || 0, 10) || 0;
        const feedCount = Math.max(0, Number.parseInt(raw.feedCount || 0, 10) || 0);
        // status 仅区分 active / waiting,旧版本备份没有该字段视为 active
        const status = raw.status === "waiting" ? "waiting" : "active";
        raisingPigs.push({
          id: String(raw.id || makeRaisingId()),
          pNo,
          startedAt: Number.isFinite(startedAt) ? startedAt : now,
          lastFedAt: Number.isFinite(lastFedAt) ? lastFedAt : now,
          notifiedAt,
          feedCount,
          status,
        });
      }
    }
    const raisingFloor = RAISING_FLOORS[obj.raisingFloor] ? obj.raisingFloor : undefined;
    const hiddenUnlocked = obj.hiddenUnlocked === true ? true : undefined;
    return {
      collection, ownedEventPigs, smallBadges, bigBadges, raisingPigs, raisingFloor,
      hiddenUnlocked, source: "json", formatVersion: isV2 ? Math.max(2, fileVersion) : 1
    };
  }

  // Fallback: 三元组裸文本 (positive — 用户手动列出 "已拥有" 的)
  const items = parseBatchLines(txt);
  if (items.length === 0) return { err: "没有可识别的 JSON 或三元组内容" };
  const collection = [];
  let skipped = 0;
  for (const it of items) {
    if (it.parts.length < 3) { skipped++; continue; }
    const [b, p, s] = it.parts.map(n => parseInt(n, 10));
    if (!(b >= 1 && b <= 6 && p >= 1 && s >= 1 && s <= 6)) { skipped++; continue; }
    const pNo = state.pigsByListKey.get(`${b}-${(p - 1) * 6 + s}`);
    if (pNo) collection.push(pNo); else skipped++;
  }
  return {
    collection, ownedEventPigs: [], smallBadges: [], bigBadges: [], raisingPigs: [],
    source: "triplets", formatVersion: 2, skipped
  };
}

function applyImport(parsed, { replace }) {
  // Dedupe and preserve order for collection; event pigs use a Set.
  const desiredColl = Array.from(new Set(parsed.collection));
  const desiredOwned = new Set(parsed.ownedEventPigs);
  const desiredSmall = new Set(parsed.smallBadges || []);
  const desiredBig = new Set(parsed.bigBadges || []);
  const desiredRaising = Array.isArray(parsed.raisingPigs) ? parsed.raisingPigs : [];

  let addedColl = 0, removedColl = 0;
  let addedOwned = 0, removedOwned = 0;
  let addedSmall = 0, removedSmall = 0;
  let addedBig = 0, removedBig = 0;
  let addedRaising = 0, removedRaising = 0;

  if (replace) {
    const prevColl = new Set(state.collection);
    const nextColl = new Set(desiredColl);
    state.collection = desiredColl.slice();
    for (const n of nextColl) if (!prevColl.has(n)) addedColl++;
    for (const n of prevColl) if (!nextColl.has(n)) removedColl++;

    const prevOwned = new Set(state.ownedEventPigs);
    state.ownedEventPigs = new Set(desiredOwned);
    for (const n of desiredOwned) if (!prevOwned.has(n)) addedOwned++;
    for (const n of prevOwned) if (!desiredOwned.has(n)) removedOwned++;

    const prevSmall = new Set(state.smallBadges);
    state.smallBadges = new Set(desiredSmall);
    for (const n of desiredSmall) if (!prevSmall.has(n)) addedSmall++;
    for (const n of prevSmall) if (!desiredSmall.has(n)) removedSmall++;

    const prevBig = new Set(state.bigBadges);
    state.bigBadges = new Set(desiredBig);
    for (const n of desiredBig) if (!prevBig.has(n)) addedBig++;
    for (const n of prevBig) if (!desiredBig.has(n)) removedBig++;

    const prevRaising = state.raisingPigs.length;
    state.raisingPigs = desiredRaising.map(item => ({ ...item }));
    addedRaising = state.raisingPigs.length;
    removedRaising = prevRaising;
  } else {
    const have = new Set(state.collection);
    for (const n of desiredColl) {
      if (!have.has(n)) { state.collection.push(n); have.add(n); addedColl++; }
    }
    for (const n of desiredOwned) {
      if (!state.ownedEventPigs.has(n)) { state.ownedEventPigs.add(n); addedOwned++; }
    }
    for (const n of desiredSmall) {
      if (!state.smallBadges.has(n)) { state.smallBadges.add(n); addedSmall++; }
    }
    for (const n of desiredBig) {
      if (!state.bigBadges.has(n)) { state.bigBadges.add(n); addedBig++; }
    }
    const haveIds = new Set(state.raisingPigs.map(item => item.id));
    for (const item of desiredRaising) {
      const next = { ...item };
      if (haveIds.has(next.id)) next.id = makeRaisingId();
      state.raisingPigs.push(next);
      haveIds.add(next.id);
      addedRaising++;
    }
  }
  if (parsed.raisingFloor && RAISING_FLOORS[parsed.raisingFloor]) {
    state.raisingFloor = parsed.raisingFloor;
    saveRaisingFloor(state.raisingFloor);
    syncRaisingFloorSelect();
  }

  saveCollection(state.collection);
  saveOwnedEventPigs(state.ownedEventPigs);
  saveSmallBadges(state.smallBadges);
  saveBigBadges(state.bigBadges);
  saveRaisingState();
  // hiddenUnlocked: 备份里如果带 true 就尊重它(已解锁过的就别再藏起来),
  // 反之不动 (覆盖导入不强制 re-lock,避免误清成就)
  let unlocked = false;
  if (parsed.hiddenUnlocked === true && !state.hiddenUnlocked) {
    state.hiddenUnlocked = true;
    saveHiddenUnlocked();
    mergeHiddenIntoMain();
    buildBreedingIndex(state.breedingTable);
    unlocked = true;
  }
  return {
    addedColl, removedColl, addedOwned, removedOwned,
    addedSmall, removedSmall, addedBig, removedBig,
    addedRaising, removedRaising, unlocked
  };
}

async function runImport(replace) {
  const msg = $("#importMsg");
  if (!state.dataLoaded) {
    msg.innerHTML = `<span class="err">数据还没加载好</span>`;
    return;
  }
  const raw = $("#importIn").value;
  const parsed = parseImportText(raw);
  if (parsed.err) {
    msg.innerHTML = `<span class="err">${escHtml(parsed.err)}</span>`;
    return;
  }
  const nColl = parsed.collection.length;
  const nOwned = parsed.ownedEventPigs.length;
  const nSmall = parsed.smallBadges.length;
  const nBig = parsed.bigBadges.length;
  const nRaising = (parsed.raisingPigs || []).length;
  if (nColl === 0 && nOwned === 0 && nSmall === 0 && nBig === 0 && nRaising === 0) {
    msg.innerHTML = `<span class="err">解析成功但内容为空 (可能 pNo 对不上当前数据)</span>`;
    return;
  }
  if (replace) {
    const fmtHint = parsed.formatVersion === 1
      ? `\n\n已识别为 v1 老版备份`
      : "";
    const confirmTitle = "覆盖导入会替换你现有的全部记录";
    const confirmDetails =
      `186 已拥有 ${state.collection.length} → 导入 ${nColl}\n` +
      `Events 已拥有 ${state.ownedEventPigs.size} → 导入 ${nOwned}\n` +
      `小章 ${state.smallBadges.size} → 导入 ${nSmall}\n` +
      `大章 ${state.bigBadges.size} → 导入 ${nBig}\n` +
      `养成中 ${state.raisingPigs.length} → 导入 ${nRaising}` + fmtHint;
    if (!(await customConfirm(confirmTitle, confirmDetails))) return;
  }
  const r = applyImport(parsed, { replace });
  // 抽屉里可能在显示活动猪的「已拥有」勾选，导入后直接关掉以避免 UI 不同步。
  if ($("#drawer").classList.contains("open")) closeDrawer();
  // 导入后只要 186 满了就提示解锁 —— 不管之前是否解锁过,
  // 这样用户从备份恢复时也能看到反馈。
  const allBaseOwned = (() => {
    const ownedSet = new Set(state.collection);
    let hiddenCount = 0;
    for (const [pNo, pig] of state.pigsById) {
      if (pig.status === "hidden") {
        hiddenCount++;
        continue;
      }
      if (!ownedSet.has(pNo)) return false;
    }
    return state.pigsById.size > hiddenCount; // 至少有数据
  })();
  if (allBaseOwned) {
    if (!state.hiddenUnlocked) {
      state.hiddenUnlocked = true;
      saveHiddenUnlocked();
      mergeHiddenIntoMain();
      buildBreedingIndex(state.breedingTable);
      r.unlocked = true;
    }
    showUnlockCelebration();
  }
  render();
  renderRaisingSearchResults();
  checkRaisingReminders();
  const parts = [];
  if (r.addedColl) parts.push(`186新增 ${r.addedColl}`);
  if (r.removedColl) parts.push(`186移除 ${r.removedColl}`);
  if (r.addedOwned) parts.push(`Events新增 ${r.addedOwned}`);
  if (r.removedOwned) parts.push(`Events移除 ${r.removedOwned}`);
  if (r.addedSmall) parts.push(`小章新增 ${r.addedSmall}`);
  if (r.removedSmall) parts.push(`小章移除 ${r.removedSmall}`);
  if (r.addedBig) parts.push(`大章新增 ${r.addedBig}`);
  if (r.removedBig) parts.push(`大章移除 ${r.removedBig}`);
  if (r.addedRaising) parts.push(`养成新增 ${r.addedRaising}`);
  if (r.removedRaising) parts.push(`养成移除 ${r.removedRaising}`);
  const tags = [];
  if (parsed.source === "triplets") tags.push("三元组裸文本");
  else if (parsed.formatVersion === 1) tags.push("v1 老版 · 已自动反转 collection");
  else if (parsed.formatVersion >= 3) tags.push("v3 新版");
  else tags.push("v2 新版");
  if (r.unlocked) tags.push("隐藏图鉴已解锁");
  const suffix = ` <span style="color:var(--muted)">· ${tags.join(" · ")}</span>`;
  msg.innerHTML = parts.length
    ? `<span class="ok">导入完成: ${parts.join(" · ")}</span>${suffix}`
    : `<span class="ok">导入完成: 没有变化 (全部已存在)</span>${suffix}`;
  toast("导入完成");
}

$("#exportBtn").addEventListener("click", () => runExport(false));
$("#exportCopyBtn").addEventListener("click", () => runExport(true));
$("#exportDownloadBtn").addEventListener("click", runExportDownload);

$("#importMergeBtn").addEventListener("click", () => { runImport(false); });
$("#importReplaceBtn").addEventListener("click", () => { runImport(true); });
$("#importClearBtn").addEventListener("click", () => {
  $("#importIn").value = "";
  $("#importMsg").textContent = "合并：只追加缺失的项；覆盖：用导入数据替换现有全部配置";
});
$("#importFileBtn").addEventListener("click", () => $("#importFile").click());
$("#importFile").addEventListener("change", async e => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  try {
    const text = await f.text();
    $("#importIn").value = text;
    $("#importMsg").innerHTML = `<span class="ok">已读取文件 ${escHtml(f.name)}，点击「合并导入」或「覆盖导入」继续</span>`;
  } catch (err) {
    $("#importMsg").innerHTML = `<span class="err">读取文件失败: ${escHtml(err.message || String(err))}</span>`;
  } finally {
    // allow re-picking the same file
    e.target.value = "";
  }
});

// ----- bootstrap -----
function init() {
  render(); // initial loading state
  startRaisingTicker();

  // 初始化账号管理 UI
  initAccountUI({ toast, render });

  loadData()
    .then(() => {
      // 启动时已经 owned 186 但 hiddenUnlocked 还是 false (比如导入备份场景)
      // → 解锁并弹庆祝。注意这里 hiddenUnlocked=true 时 loadData 已经把隐藏并入了。
      checkAndUnlockHidden();
      render();
      syncRaisingRecordsToCloud({ silent: true });

      // 检查版本更新并显示提示
      checkAndShowUpdateNotice();
    })
    .catch(err => {
      console.error(err);
      $("#body").innerHTML = `<div class="empty">
        <div class="title">图鉴数据加载失败</div>
        <div class="hint">${escHtml(err.message || err)}</div>
      </div>`;
    });
}

// 等待 DOM 加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
