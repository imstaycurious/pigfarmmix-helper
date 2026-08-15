/**
 * 养猪场mix图鉴助手 — TypeScript 主入口
 * 负责: 模块装配、筛选接线、tab 切换、主题、PWA、bootstrap
 */

import type { AtlasFilter, EventFilter, MineFilter } from "./js/types.js";
import { state } from "./js/state.js";
import { $, $$, el, toast, escHtml, imgUrl } from "./js/utils.js";
import { loadData, checkAndUnlockHidden, setPigOwned, setPigBadge } from "./js/data.js";
import { saveCollection, saveOwnedEventPigs, saveSmallBadges, saveBigBadges, saveHiddenUnlocked } from "./js/storage.js";
import { customConfirm, customAlert } from "./js/modal.js";
import { checkAndShowUpdateNotice, showUpdateManually } from "./js/version.js";
import { initAccountUI } from "./js/account-ui.js";
import { emit, on } from "./js/events.js";
import { THEME_KEY } from "./js/constants.js";
import {
  renderAtlasBody, renderEventsBody, renderMineBody,
  renderAtlasStats, renderEventsStats, renderMineStats,
  renderMineMenuCounts, renderProgressPanel, refreshPigCards,
} from "./render/atlas.js";
import { showDetail, closeDrawer, getCurrentDetailPNo, setupDrawer } from "./render/drawer.js";
import { buildCard } from "./render/cards.js";
import {
  renderRaisingBody, renderRaisingSearchResults,
  updateRaisingCountdownNodes, setupRaising,
} from "./render/raising.js";
import { setupAuction, renderAuctionTabEntry } from "./render/auction.js";
import { initRaisingPush } from "./js/raising-push.js";
import { addRaisingPig, startRaisingTicker, saveRaisingState } from "./js/raising-logic.js";
import { setupImportExport } from "./render/import-export.js";

// ==================== Tab 定义 ====================
const TABS: Record<string, { panel: string; btn: string }> = {
  atlas: { panel: "#tabAtlas", btn: "#tabBtnAtlas" },
  events: { panel: "#tabEvents", btn: "#tabBtnEvents" },
  raising: { panel: "#tabRaising", btn: "#tabBtnRaising" },
  auction: { panel: "#tabAuction", btn: "#tabBtnAuction" },
  mine: { panel: "#tabMine", btn: "#tabBtnMine" },
};

// ==================== 筛选接线 ====================

function resetChipRow(rootSel: string): void {
  $$(".chip", $(rootSel) || document.body).forEach(c =>
    c.classList.toggle("active", c.dataset.value === ""));
}

type FilterObj = AtlasFilter | EventFilter | MineFilter | Record<string, string | undefined>;
function wireFilter(rootSel: string, filterObj: FilterObj, key: string, onChange?: (v: string) => void): void {
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
    render();
  });
}

function makeMethodSubUpdater(prefix: string, filterObj: Record<string, string | undefined>): () => void {
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

function wireSearch(inputSel: string, filterObj: FilterObj): void {
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
      render();
    }, 200);
  });
}

// ==================== Mine 视图切换 ====================

const MINE_VIEW_TITLES: Record<string, string> = {
  main: "📖 186图鉴",
  event: "🎉 Events图鉴",
  progress: "📊 进度总览",
  add: "➕ 导入/导出",
  about: "i️ 关于项目",
};

function setMineView(view: string): void {
  state.mineView = view as typeof state.mineView;
  const menu = $("#mineMenu");
  const listView = $("#mineListView");
  const addView = $("#mineAddView");
  const aboutView = $("#mineAboutView");
  const progressView = $("#mineProgressView");
  const subhead = $("#mineSubHead");
  const subheadTitle = $("#mineSubHeadTitle");
  if (menu) menu.style.display = view === "menu" ? "" : "none";
  if (listView) listView.style.display = (view === "main" || view === "event") ? "" : "none";
  if (addView) addView.style.display = view === "add" ? "" : "none";
  if (aboutView) aboutView.style.display = view === "about" ? "" : "none";
  if (progressView) progressView.style.display = view === "progress" ? "" : "none";
  if (subhead) subhead.style.display = view === "menu" ? "none" : "";
  if (subheadTitle) subheadTitle.textContent = MINE_VIEW_TITLES[view] || "";

  // 星级筛选显示调整
  const mineRareFilter = $("#mineRareFilter");
  if (mineRareFilter && (view === "main" || view === "event")) {
    mineRareFilter.querySelectorAll<HTMLElement>(".chip").forEach(chip => {
      const value = chip.dataset.value;
      if (view === "event") {
        if (value === "1" || value === "2") {
          chip.style.display = "none";
        } else {
          chip.style.display = "";
          const star = chip.querySelector("span");
          if (star && value) star.style.color = "var(--star-special)";
        }
      } else {
        if (value === "6") {
          chip.style.display = "none";
        } else {
          chip.style.display = "";
          const star = chip.querySelector("span");
          if (star && value) star.style.color = "var(--star)";
        }
      }
    });
  }

  render();
}

// ==================== 渲染调度 ====================

function activeTabName(): string | null {
  for (const [name, ids] of Object.entries(TABS)) {
    const panel = $(ids.panel);
    if (panel && panel.classList.contains("active")) return name;
  }
  return null;
}

function renderActiveTab(): void {
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
  }
}

function updateGlobalCounts(): void {
  renderMineMenuCounts();
  const mc = $("#manageCount");
  if (mc) mc.textContent = `186 已拥有 ${state.collection.length} 只 · Events 已拥有 ${state.ownedEventPigs.size} 只 · 小章 ${state.smallBadges.size} · 大章 ${state.bigBadges.size}`;
}

function refreshOwnedSet(): void {
  state.ownedSet = new Set(state.collection);
}

function render(): void {
  refreshOwnedSet();
  renderActiveTab();
  updateGlobalCounts();
}

function updateOwnedUI(pNo: number): void {
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

// ==================== Tab 切换 ====================

function activateTab(name: string): void {
  if (!TABS[name]) name = "atlas";
  for (const [k, ids] of Object.entries(TABS)) {
    const active = k === name;
    $(ids.panel)?.classList.toggle("active", active);
    $(ids.btn)?.classList.toggle("active", active);
    $(ids.btn)?.setAttribute("aria-selected", String(active));
  }
  refreshOwnedSet();
  renderActiveTab();
  if (name === "raising") {
    renderRaisingSearchResults();
    updateRaisingCountdownNodes();
  }
  if (name === "auction") renderAuctionTabEntry();
  requestAnimationFrame(() => {
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  });
}

// ==================== 主题 ====================

function currentTheme(): "dark" | "light" {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function updateThemeChrome(mode: "dark" | "light"): void {
  document.documentElement.dataset.theme = mode;
  const meta = document.getElementById("themeColorMeta");
  if (meta) meta.setAttribute("content", mode === "dark" ? "#0b1220" : "#ffffff");
  const btn = $("#themeBtn");
  if (btn) {
    btn.textContent = mode === "dark" ? "☀" : "☾";
    btn.setAttribute("aria-label", mode === "dark" ? "切换为浅色主题" : "切换为深色主题");
  }
}

// ==================== 清空记录 ====================

async function clearAllRecords(): Promise<void> {
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
  if (state.hiddenUnlocked) {
    state.hiddenUnlocked = false;
    saveHiddenUnlocked(state.hiddenUnlocked);
    for (const [pNo, p] of state.pigsById) {
      if (p.status === "hidden") {
        state.pigsById.delete(pNo);
        const atlas = p.atlas;
        if (atlas?.type && atlas.index) {
          state.pigsByListKey.delete(`${atlas.type}-${atlas.index}`);
        }
      }
    }
  }
  if ($("#drawer")?.classList.contains("open")) closeDrawer();
  render();
  renderRaisingSearchResults();
  toast("已清空全部记录");
}

// ==================== Bootstrap ====================

function init(): void {
  // 事件总线接线 (替代 runtime 注入)
  on("show-detail", (pNo) => showDetail(pNo));
  on("add-raising", ({ pNo, status }) => addRaisingPig(pNo, status));
  on("ui-refresh", () => render());
  on("owned-changed", (pNo) => updateOwnedUI(pNo));
  setupDrawer();
  initRaisingPush();

  // 筛选接线
  const updateAtlasMethodSub = makeMethodSubUpdater("atlas", state.atlasFilter as unknown as Record<string, string | undefined>);
  wireFilter("#atlasColorFilter", state.atlasFilter, "color");
  wireFilter("#atlasRareFilter", state.atlasFilter, "rare");
  wireFilter("#atlasGrazeFilter", state.atlasFilter, "graze");
  wireFilter("#atlasPickyFilter", state.atlasFilter, "picky");
  wireFilter("#atlasMethodFilter", state.atlasFilter, "method", updateAtlasMethodSub);
  wireFilter("#atlasHuntRegionFilter", state.atlasFilter, "huntRegion");
  wireFilter("#atlasHuntTicketFilter", state.atlasFilter, "huntTicket");
  wireFilter("#atlasShopRankFilter", state.atlasFilter, "shopRank");

  wireFilter("#eventColorFilter", state.eventFilter, "color");
  wireFilter("#eventRareFilter", state.eventFilter, "rare");
  wireFilter("#eventGrazeFilter", state.eventFilter, "graze");
  wireFilter("#eventPickyFilter", state.eventFilter, "picky");

  wireFilter("#mineColorFilter", state.mineFilter, "color");
  wireFilter("#mineRareFilter", state.mineFilter, "rare");
  wireFilter("#mineOwnedFilter", state.mineFilter, "owned");
  wireFilter("#mineSmallFilter", state.mineFilter, "small");
  wireFilter("#mineBigFilter", state.mineFilter, "big");

  wireSearch("#atlasSearch", state.atlasFilter);
  wireSearch("#eventSearch", state.eventFilter);
  wireSearch("#mineSearch", state.mineFilter);

  // 我的 tab 导航
  document.querySelectorAll<HTMLElement>("#mineMenu .mine-menu-card").forEach(btn => {
    btn.addEventListener("click", () => {
      const v = btn.dataset.mineView;
      if (v) setMineView(v);
    });
  });
  $("#mineBackBtn")?.addEventListener("click", () => setMineView("menu"));

  // 添加 / 导出 / 导入
  setupImportExport();

  // 养成
  setupRaising();

  // 拍卖场
  setupAuction();

  // 顶部按钮
  $("#updateBtn")?.addEventListener("click", () => { showUpdateManually(); });
  // 主题
  updateThemeChrome(currentTheme());
  $("#themeBtn")?.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    updateThemeChrome(next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
  });
  if (window.matchMedia) {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onSysChange = (e: MediaQueryListEvent) => {
      if (localStorage.getItem(THEME_KEY)) return;
      updateThemeChrome(e.matches ? "dark" : "light");
    };
    if (mql.addEventListener) mql.addEventListener("change", onSysChange);
    else if (mql.addListener) mql.addListener(onSysChange);
  }

  // Tab 切换
  $("#tabBtnAtlas")?.addEventListener("click", () => activateTab("atlas"));
  $("#tabBtnEvents")?.addEventListener("click", () => activateTab("events"));
  $("#tabBtnRaising")?.addEventListener("click", () => activateTab("raising"));
  $("#tabBtnAuction")?.addEventListener("click", () => activateTab("auction"));
  $("#tabBtnMine")?.addEventListener("click", () => activateTab("mine"));

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (e: MessageEvent) => {
      if (e.data && e.data.type === "open-tab") activateTab(e.data.tab);
    });
  }

  const initialTab = new URLSearchParams(window.location.search).get("tab");
  if (initialTab && TABS[initialTab]) {
    activateTab(initialTab);
    window.history.replaceState({}, "", window.location.pathname);
  }

  // 清空记录
  $("#clearBtn")?.addEventListener("click", clearAllRecords);

  // PWA
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(console.warn);
  }

  let deferredPrompt: Event & { prompt?: () => void; userChoice?: Promise<unknown> } | null = null;
  window.addEventListener("beforeinstallprompt", (e: Event) => {
    e.preventDefault();
    deferredPrompt = e as typeof deferredPrompt;
    $("#install")?.classList.add("show");
  });
  $("#installBtn")?.addEventListener("click", async () => {
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
    deferredPrompt.prompt?.();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    $("#install")?.classList.remove("show");
  });
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) && !(window.navigator as Navigator & { standalone?: boolean }).standalone) {
    $("#install")?.classList.add("show");
    const t = $("#installText");
    if (t) t.textContent = "在 Safari 点击分享 → 加到主屏幕";
  }

  // 账号 UI
  initAccountUI({ toast, render });

  // 首次渲染 + 数据加载
  render();
  startRaisingTicker();

  loadData()
    .then(() => {
      checkAndUnlockHidden();
      render();
      checkAndShowUpdateNotice();
    })
    .catch(err => {
      console.error(err);
      const body = document.body;
      const existing = $("#atlasBody");
      if (existing) {
        existing.innerHTML = `<div class="empty">
          <div class="title">图鉴数据加载失败</div>
          <div class="hint">${escHtml(err instanceof Error ? err.message : String(err))}</div>
        </div>`;
      }
      void body;
    });
}

// 等待 DOM 加载完成后初始化
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
