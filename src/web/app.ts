/**
 * 猪猪图鉴 — 主入口 (装配器)
 *
 * 职责: 模块装配 + 事件总线接线 + 渲染调度 + tab 切换 + bootstrap
 * 筛选接线 → render/filters-wiring.ts
 * 主题/PWA → js/pwa.ts
 */

import { state } from "./js/state.js";
import { $, toast, escHtml } from "./js/utils.js";
import { loadData, checkAndUnlockHidden, resetAllRecords } from "./js/data.js";
import { saveHiddenUnlocked } from "./js/storage.js";
import { customConfirm } from "./js/modal.js";
import { checkAndShowUpdateNotice, showUpdateManually } from "./js/version.js";
import { initAccountUI } from "./js/account-ui.js";
import { on } from "./js/events.js";
import {
  renderAtlasBody, renderEventsBody, renderMineBody,
  renderAtlasStats, renderEventsStats,
  renderMineMenuCounts, renderProgressPanel, refreshPigCards,
} from "./render/atlas.js";
import { showDetail, closeDrawer, setupDrawer } from "./render/drawer.js";
import {
  renderRaisingBody, renderRaisingSearchResults,
  updateRaisingCountdownNodes, setupRaising,
} from "./render/raising.js";
import { setupAuction, renderAuctionTabEntry, auctionActiveValues, applyAuctionFromDrawer, auctionFilterCount } from "./render/auction.js";
import { initRaisingPush } from "./js/raising-push.js";
import { addRaisingPig, startRaisingTicker, saveRaisingState } from "./js/raising-logic.js";
import { setupImportExport } from "./render/import-export.js";
import { renderDataView } from "./render/data-editor.js";
import { setupFilters, atlasActiveValues, eventsActiveValues } from "./render/filters-wiring.js";
import { setupFilterDrawer, refreshFilterBadges, setAuctionActiveCountFn } from "./render/filter-drawer.js";
import { setupTheme, setupPwa, onServiceWorkerMessage } from "./js/pwa.js";
import { showGlobalError, installGlobalErrorHandler } from "./js/error-handler.js";

// ==================== Tab 定义 ====================
const TABS: Record<string, { panel: string; btn: string }> = {
  atlas: { panel: "#tabAtlas", btn: "#tabBtnAtlas" },
  events: { panel: "#tabEvents", btn: "#tabBtnEvents" },
  raising: { panel: "#tabRaising", btn: "#tabBtnRaising" },
  auction: { panel: "#tabAuction", btn: "#tabBtnAuction" },
  mine: { panel: "#tabMine", btn: "#tabBtnMine" },
};

// ==================== Mine 视图切换 ====================

const MINE_VIEW_TITLES: Record<string, string> = {
  progress: "📊 进度总览",
  add: "➕ 导入/导出",
  about: "i️ 关于项目",
  data: "✏️ 数据管理",
};

function setMineView(view: string): void {
  state.mineView = view as typeof state.mineView;
  const menu = $("#mineMenu");
  const addView = $("#mineAddView");
  const aboutView = $("#mineAboutView");
  const progressView = $("#mineProgressView");
  const dataView = $("#mineDataView");
  const subhead = $("#mineSubHead");
  const subheadTitle = $("#mineSubHeadTitle");
  if (menu) menu.style.display = view === "menu" ? "" : "none";
  if (addView) addView.style.display = view === "add" ? "" : "none";
  if (aboutView) aboutView.style.display = view === "about" ? "" : "none";
  if (progressView) progressView.style.display = view === "progress" ? "" : "none";
  if (dataView) dataView.style.display = view === "data" ? "" : "none";
  if (subhead) subhead.style.display = view === "menu" ? "none" : "";
  if (subheadTitle) subheadTitle.textContent = MINE_VIEW_TITLES[view] || "";

  if (view === "data") renderDataView();
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
  refreshFilterBadges();
}

function updateOwnedUI(pNo: number): void {
  refreshOwnedSet();
  const active = activeTabName();
  // 若当前 tab 开了「我的收藏」筛选, 直接重渲染整个列表,
  // 避免「已拥有」的猪点了取消后还停留在「未拥有」筛选结果里。
  if (active === "atlas" && state.atlasFilter.own) {
    render();
    return;
  }
  if (active === "events" && state.eventFilter.own) {
    render();
    return;
  }
  refreshPigCards(pNo);
  if (active === "atlas") renderAtlasStats();
  else if (active === "events") renderEventsStats();
  else if (active === "mine") {
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
  resetAllRecords();
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
  // 全局错误处理 (未捕获 rejection / 运行时错误)
  installGlobalErrorHandler();

  // 事件总线接线
  on("show-detail", (pNo) => showDetail(pNo));
  on("add-raising", ({ pNo, status }) => addRaisingPig(pNo, status));
  on("ui-refresh", () => render());
  on("owned-changed", (pNo) => updateOwnedUI(pNo));
  setupDrawer();
  initRaisingPush();

  // 筛选接线 (变化时刷新当前 tab)
  setupFilters(() => render());

  // 筛选抽屉 (186 / Events / 拍卖场)
  setAuctionActiveCountFn(auctionFilterCount);
  setupFilterDrawer({
    atlasApply: () => render(),
    eventsApply: () => render(),
    auctionApply: (values) => {
      if (values) applyAuctionFromDrawer(values);
    },
    auctionActiveValues,
    atlasActiveValues,
    eventsActiveValues,
  });

  // 我的 tab 导航
  document.querySelectorAll<HTMLElement>("#mineMenu .mine-menu-card").forEach(btn => {
    btn.addEventListener("click", () => {
      const v = btn.dataset.mineView;
      if (v) setMineView(v);
    });
  });
  $("#mineBackBtn")?.addEventListener("click", () => setMineView("menu"));

  // 各功能模块装配
  setupImportExport();
  setupRaising();
  setupAuction();

  // 顶部按钮
  $("#updateBtn")?.addEventListener("click", () => { showUpdateManually(); });

  // 主题
  setupTheme();

  // Tab 切换
  $("#tabBtnAtlas")?.addEventListener("click", () => activateTab("atlas"));
  $("#tabBtnEvents")?.addEventListener("click", () => activateTab("events"));
  $("#tabBtnRaising")?.addEventListener("click", () => activateTab("raising"));
  $("#tabBtnAuction")?.addEventListener("click", () => activateTab("auction"));
  $("#tabBtnMine")?.addEventListener("click", () => activateTab("mine"));

  // SW 消息 → 打开指定 tab
  onServiceWorkerMessage((tab) => activateTab(tab));

  const initialTab = new URLSearchParams(window.location.search).get("tab");
  if (initialTab && TABS[initialTab]) {
    activateTab(initialTab);
    window.history.replaceState({}, "", window.location.pathname);
  }

  // 清空记录
  $("#clearBtn")?.addEventListener("click", clearAllRecords);

  // PWA
  setupPwa();

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
      const existing = $("#atlasBody");
      if (existing) {
        existing.innerHTML = `<div class="empty">
          <div class="title">图鉴数据加载失败</div>
          <div class="hint">${escHtml(err instanceof Error ? err.message : String(err))}</div>
        </div>`;
      }
      showGlobalError("图鉴数据加载失败,请检查网络后刷新页面重试");
    });
}

// 等待 DOM 加载完成后初始化
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
