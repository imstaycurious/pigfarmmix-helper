/**
 * 养成中 — 渲染层
 *
 * 只负责 DOM 渲染和事件绑定,业务逻辑在 js/raising-logic.ts,
 * 推送在 js/raising-push.ts。通过 events.ts 与其他模块解耦。
 */

import type { Pig, RaisingItem, RaisingFloor } from "../js/types.js";
import { state } from "../js/state.js";
import { $, $$, el, toast, imgUrl, stars, fmtKg, badgeWeights } from "../js/utils.js";
import { RAISING_FLOORS } from "../js/constants.js";
import { emit, on } from "../js/events.js";
import {
  getPigByPNo, currentRaisingFloor, adjustedFeedIntervalMs,
  formatDuration, formatIntervalMs, formatDateTime,
  getRaisingDueMs, getRaisingClockNow, getRaisingRemainingMs, raisingStatusClass,
  addRaisingPig, markRaisingFed, adjustRaisingFeedCount, toggleRaisingPause,
  moveRaisingPig, removeRaisingPig, clearRaisingPigs,
  searchRaisingPigs, setRaisingFloor, checkRaisingReminders,
} from "../js/raising-logic.js";
import { getRaisingPushEnabled, requestRaisingNotificationPermission } from "../js/raising-push.js";

// ---------- 状态 ----------

const raisingSearchState = { q: "", results: [] as Pig[] };

// ---------- 搜索渲染 ----------

export function renderRaisingSearchResults(): void {
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
  const counts = new Map<number, number>();
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

// ---------- 卡片渲染 ----------

function buildRaisingRow(item: RaisingItem): HTMLElement {
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
  if (item.status === "waiting") {
    return buildWaitingRow(item, pig);
  }
  return buildActiveRow(item, pig);
}

function buildActiveRow(item: RaisingItem, pig: Pig): HTMLElement {
  const intervalMs = adjustedFeedIntervalMs(pig);
  const dueMs = getRaisingDueMs(item, pig);
  const pausedAt = Number(item.pausedAt) || 0;
  const isPaused = pausedAt > 0;
  const clockNow = getRaisingClockNow(item);
  const diff = dueMs - clockNow;
  const status = isPaused ? "paused" : raisingStatusClass(dueMs);
  const pct = Math.max(0, Math.min(100, ((clockNow - item.lastFedAt) / intervalMs) * 100));
  const feedN = (pig.feeding && pig.feeding.times) || 0;
  const feedCount = Math.max(0, Number.parseInt(String(item.feedCount || 0), 10) || 0);
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
      onclick: (ev: Event) => {
        ev.stopPropagation();
        removeRaisingPig(item.id);
      },
    }, "×"),
    el("div", {
      class: "raising-main",
      onclick: () => emit("show-detail", pig.pNo),
    }, [
      el("div", { class: "raising-thumb" },
        el("img", { src: imgUrl(pig.pNo), loading: "lazy", alt: pig.name })
      ),
      el("div", { class: "raising-info" }, [
        el("div", { class: "raising-name" }, [
          pig.name,
          isPaused ? el("span", { class: "raising-paused-tag" }, "晚安药生效中") : null,
          el("span", { class: pig.special ? "stars special" : "stars" }, stars(pig.rare, pig.special)),
        ]),
        pig.color_text ? el("div", { class: "raising-meta" }, pig.color_text) : null,
        el("div", { class: "raising-meta" }, isPaused
          ? `暂停于 ${formatDateTime(pausedAt)} · 剩余 ${formatDuration(diff)}`
          : `上次 ${formatDateTime(item.lastFedAt)} · 下次 ${formatDateTime(dueMs)}`),
        badgeLine,
        el("div", { class: "raising-feed-line" + (feedDone ? " is-done" : "") }, [
          el("span", { class: "raising-feed-status" }, feedStatusText),
          el("span", { class: "raising-feed-stepper" }, [
            el("button", {
              type: "button",
              title: "减少一次",
              onclick: (ev: Event) => {
                ev.stopPropagation();
                adjustRaisingFeedCount(item.id, -1);
              },
            }, "−"),
            el("span", { class: "raising-feed-count" }, String(feedCount)),
            el("button", {
              type: "button",
              title: "增加一次",
              onclick: (ev: Event) => {
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
        el("button", {
          type: "button",
          class: "raising-sleep-btn" + (isPaused ? " is-active" : ""),
          "aria-pressed": String(isPaused),
          title: isPaused ? "继续喂食倒计时和后台提醒" : "暂停喂食倒计时和后台提醒",
          onclick: (ev: Event) => {
            ev.stopPropagation();
            toggleRaisingPause(item.id);
          },
        }, isPaused ? "☀️ 唤\u00a0醒" : "💊 晚安药"),
        el("span", {
          class: "raising-countdown " + status,
          "data-raising-countdown": item.id,
          "data-due-ms": String(dueMs),
          "data-last-fed-ms": String(item.lastFedAt),
          "data-interval-ms": String(intervalMs),
          "data-paused-at": String(pausedAt),
        }, formatDuration(diff)),
      ]),
    ]),
    el("div", { class: "raising-actions" }, [
      el("button", {
        type: "button",
        class: "add-btn",
        title: isPaused ? "晚安药生效期间不能记录喂食" : "记录已喂食",
        ...(isPaused ? { disabled: "" } : {}),
        onclick: () => markRaisingFed(item.id),
      }, "已喂食"),
      el("button", {
        type: "button",
        class: "add-btn secondary",
        onclick: () => emit("show-detail", pig.pNo),
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

function buildWaitingRow(item: RaisingItem, pig: Pig): HTMLElement {
  return el("div", { class: "raising-card is-waiting" }, [
    el("button", {
      type: "button",
      class: "raising-remove",
      title: "移除",
      onclick: (ev: Event) => {
        ev.stopPropagation();
        removeRaisingPig(item.id);
      },
    }, "×"),
    el("div", {
      class: "raising-main",
      onclick: () => emit("show-detail", pig.pNo),
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
        onclick: () => emit("show-detail", pig.pNo),
      }, "详情"),
    ]),
  ]);
}

// ---------- 统计条 ----------

function renderRaisingStats(): void {
  const stats = $("#raisingStatsBar");
  if (!stats) return;
  if (!state.dataLoaded) {
    stats.textContent = "加载中...";
    return;
  }
  const floor = currentRaisingFloor();
  let active = 0, waiting = 0, paused = 0, due = 0;
  const now = Date.now();
  for (const item of state.raisingPigs) {
    if (item.status === "waiting") { waiting++; continue; }
    active++;
    if (item.pausedAt) { paused++; continue; }
    const pig = getPigByPNo(item.pNo);
    if (pig && getRaisingDueMs(item, pig) <= now) due++;
  }
  const head = waiting > 0 ? `· 等待进货中 ${waiting} ` : "";
  const pausedText = paused > 0 ? `· 晚安药 ${paused} ` : "";
  const tail = `· 养成中 ${active} 只 ${pausedText}· ${floor.label} · 待喂 ${due}`;
  stats.textContent = (head + tail).trim();
}

// ---------- 主体渲染 ----------

export function renderRaisingBody(): void {
  renderRaisingStats();
  updateRaisingNotificationButton();
  const box = $("#raisingBody");
  if (!box) return;
  box.innerHTML = "";
  if (!state.dataLoaded) {
    box.appendChild(el("div", { class: "loading" }, [
      el("div", { class: "spinner" }),
      el("div", {}, "正在加载图鉴数据..."),
    ]));
    return;
  }
  if (state.raisingPigs.length === 0) {
    box.appendChild(el("div", { class: "empty" }, [
      el("div", { class: "title" }, "暂时还没有添加正在养成的猪"),
      el("div", { class: "hint" }, "搜索猪名或编号,选择后开始记录喂食时间"),
    ]));
    return;
  }

  const active: RaisingItem[] = [];
  const waiting: RaisingItem[] = [];
  for (const item of state.raisingPigs) {
    if (item.status === "waiting") waiting.push(item);
    else active.push(item);
  }
  active.sort((a, b) => {
    const ap = getPigByPNo(a.pNo);
    const bp = getPigByPNo(b.pNo);
    const ad = ap ? getRaisingRemainingMs(a, ap) : Number.MAX_SAFE_INTEGER;
    const bd = bp ? getRaisingRemainingMs(b, bp) : Number.MAX_SAFE_INTEGER;
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

// ---------- 倒计时更新 ----------

export function updateRaisingCountdownNodes(): void {
  const now = Date.now();
  $$("#raisingBody [data-raising-countdown]").forEach(node => {
    if (node.dataset.raisingWaiting === "1") return;
    const dueMs = Number(node.getAttribute("data-due-ms")) || 0;
    const lastFedMs = Number(node.getAttribute("data-last-fed-ms")) || 0;
    const intervalMs = Number(node.getAttribute("data-interval-ms")) || 1;
    const pausedAt = Number(node.getAttribute("data-paused-at")) || 0;
    const clockNow = pausedAt > 0 ? pausedAt : now;
    const diff = dueMs - clockNow;
    const cls = pausedAt > 0 ? "paused" : raisingStatusClass(dueMs);
    node.textContent = formatDuration(diff);
    node.classList.remove("due", "soon", "paused");
    if (cls) node.classList.add(cls);
    const card = node.closest(".raising-card");
    if (card) {
      card.classList.toggle("is-due", cls === "due");
      card.classList.toggle("is-soon", cls === "soon");
      card.classList.toggle("is-paused", cls === "paused");
    }
    const fill = document.querySelector(`[data-raising-progress="${node.dataset.raisingCountdown}"]`) as HTMLElement | null;
    if (fill) {
      const pct = Math.max(0, Math.min(100, ((clockNow - lastFedMs) / intervalMs) * 100));
      fill.style.width = `${pct.toFixed(1)}%`;
    }
  });
  renderRaisingStats();
}

// ---------- 通知按钮 ----------

function updateRaisingNotificationButton(): void {
  const btn = $("#raisingNotifyBtn") as HTMLButtonElement | null;
  if (!btn) return;
  const supported = "Notification" in window;
  if (!supported) {
    btn.textContent = "不支持提醒";
    btn.disabled = true;
    return;
  }
  btn.disabled = Notification.permission === "denied";
  if (Notification.permission === "granted") {
    btn.textContent = getRaisingPushEnabled() ? "后台提醒已开启" : "提醒已开启";
  } else if (Notification.permission === "denied") {
    btn.textContent = "提醒被拒绝";
  } else {
    btn.textContent = "开启提醒";
  }
}

// ---------- 地板选择器 ----------

export function syncRaisingFloorSelect(): void {
  const select = $("#raisingFloorSelect") as HTMLSelectElement | null;
  if (!select) return;
  select.value = RAISING_FLOORS[state.raisingFloor] ? state.raisingFloor : "normal";
}

// ---------- 事件绑定 ----------

export function setupRaising(): void {
  syncRaisingFloorSelect();

  let raisingSearchTimer: ReturnType<typeof setTimeout> | null = null;
  $("#raisingSearch")?.addEventListener("input", (e: Event) => {
    if (raisingSearchTimer) clearTimeout(raisingSearchTimer);
    const v = (e.target as HTMLInputElement).value;
    raisingSearchTimer = setTimeout(() => {
      raisingSearchState.q = v.trim();
      raisingSearchState.results = searchRaisingPigs(v);
      renderRaisingSearchResults();
    }, 160);
  });

  $("#raisingFloorSelect")?.addEventListener("change", (e: Event) => {
    const floor = (e.target as HTMLSelectElement).value as RaisingFloor;
    setRaisingFloor(floor);
    syncRaisingFloorSelect();
    renderRaisingBody();
    renderRaisingSearchResults();
  });

  $("#raisingNotifyBtn")?.addEventListener("click", requestRaisingNotificationPermission);
  $("#raisingClearBtn")?.addEventListener("click", clearRaisingPigs);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) checkRaisingReminders();
  });

  // 订阅事件: 数据变化 → 重渲染
  on("raising-updated", () => {
    renderRaisingBody();
    renderRaisingSearchResults();
    updateRaisingCountdownNodes();
  });
  // 倒计时 tick (来自 logic 的 startRaisingTicker)
  on("raising-tick", () => {
    updateRaisingCountdownNodes();
  });
}
