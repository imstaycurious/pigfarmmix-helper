/**
 * 养成中 (Raising) — 模块化
 *
 * 依赖注入: 通过 runtime 注册表调用 drawer / 渲染
 */
import { state } from "../js/state.js";
import { $, $$, el, toast, imgUrl, stars, fmtKg, badgeWeights } from "../js/utils.js";
import { customConfirm } from "../js/modal.js";
import { RAISING_FLOORS, VAPID_PUBLIC_KEY } from "../js/constants.js";
import { loadPushEnabled, savePushEnabled, loadDeviceId } from "../js/storage.js";
import { saveRaisingPigs, saveRaisingFloor } from "../js/storage.js";
import { runtime } from "../js/runtime.js";
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
export function makeRaisingId() {
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
    if (!("serviceWorker" in navigator))
        return Promise.reject(new Error("service worker unsupported"));
    if (!serviceWorkerReadyPromise) {
        serviceWorkerReadyPromise = navigator.serviceWorker.ready;
    }
    return serviceWorkerReadyPromise;
}
async function apiJson(path, body) {
    return fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    }).then(async (res) => {
        let data = null;
        try {
            data = await res.json();
        }
        catch { /* ignore */ }
        if (!res.ok || (data && data.ok === false)) {
            const msg = data && data.error ? String(data.error) : `HTTP ${res.status}`;
            throw new Error(msg);
        }
        return data || {};
    });
}
function getPigByPNo(pNo) {
    return state.pigsById.get(pNo) || state.eventPigsById.get(pNo) || state.hiddenPigsById.get(pNo);
}
function currentRaisingFloor() {
    return RAISING_FLOORS[state.raisingFloor] || RAISING_FLOORS.normal;
}
export function baseFeedIntervalMs(pig) {
    const raw = pig && pig.feeding && typeof pig.feeding.interval === "number"
        ? pig.feeding.interval
        : 0;
    if (raw === 0)
        return 58 * MS_MIN;
    return Math.max(1, Math.round(raw * MS_HOUR));
}
export function adjustedFeedIntervalMs(pig) {
    return Math.max(1, Math.round(baseFeedIntervalMs(pig) * currentRaisingFloor().multiplier));
}
export function formatDuration(ms) {
    if (ms <= 0)
        return "可喂食";
    const totalSec = Math.ceil(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0)
        return `${h}h ${m}m`;
    if (m > 0)
        return `${m}m ${s}s`;
    return `${s}s`;
}
export function formatIntervalMs(ms) {
    const mins = Math.round(ms / MS_MIN);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0 && m > 0)
        return `${h} 小时 ${m} 分钟`;
    if (h > 0)
        return `${h} 小时`;
    return `${m} 分钟`;
}
function formatDateTime(ms) {
    if (!ms)
        return "—";
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
function getRaisingClockNow(item, now = Date.now()) {
    const pausedAt = Number(item && item.pausedAt) || 0;
    return pausedAt > 0 ? pausedAt : now;
}
function getRaisingRemainingMs(item, pig, now = Date.now()) {
    return getRaisingDueMs(item, pig) - getRaisingClockNow(item, now);
}
let vapidPublicKeyPromise = null;
async function getVapidPublicKey() {
    if (VAPID_PUBLIC_KEY)
        return VAPID_PUBLIC_KEY;
    if (!vapidPublicKeyPromise) {
        vapidPublicKeyPromise = fetch("/api/push-config")
            .then(async (res) => {
            if (!res.ok)
                throw new Error(`HTTP ${res.status}`);
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
    if (!state.dataLoaded)
        return [];
    return state.raisingPigs
        .map(item => {
        if (item.status === "waiting" || item.pausedAt)
            return null;
        const pig = getPigByPNo(item.pNo);
        if (!pig)
            return null;
        return {
            id: String(item.id),
            pNo: item.pNo,
            pigName: pig.name || "",
            floor: RAISING_FLOORS[state.raisingFloor] ? state.raisingFloor : "normal",
            startedAt: Number(item.startedAt) || Date.now(),
            lastFedAt: Number(item.lastFedAt) || Date.now(),
            feedCount: Math.max(0, Number.parseInt(String(item.feedCount || 0), 10) || 0),
            nextFeedAt: getRaisingDueMs(item, pig),
            notifiedNextFeedAt: item.notifiedAt || null,
        };
    })
        .filter((x) => x !== null);
}
async function syncRaisingRecordsToCloud({ silent = true } = {}) {
    if (!raisingPushEnabled || !state.dataLoaded)
        return;
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
        if (!silent)
            toast("后台提醒数据已同步");
    })
        .catch(err => {
        console.warn("[raising] cloud sync failed:", err);
        if (!silent)
            toast(`后台提醒同步失败: ${err instanceof Error ? err.message : String(err)}`);
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
    if (!raisingPushEnabled || !state.dataLoaded)
        return;
    if (raisingPushSyncTimer)
        clearTimeout(raisingPushSyncTimer);
    raisingPushSyncTimer = setTimeout(() => {
        syncRaisingRecordsToCloud({ silent: true });
    }, delay);
}
function raisingStatusClass(dueMs) {
    const diff = dueMs - Date.now();
    if (diff <= 0)
        return "due";
    if (diff <= RAISING_SOON_MS)
        return "soon";
    return "";
}
export function saveRaisingState() {
    saveRaisingPigs(state.raisingPigs);
    scheduleRaisingPushSync();
}
export function addRaisingPig(pNo, status = "active") {
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
        pausedAt: 0,
        status,
    });
    saveRaisingState();
    runtime.renderRaisingBody();
    runtime.renderRaisingSearchResults();
    runtime.updateRaisingCountdownNodes();
    if (status === "waiting") {
        toast(`已加入等待进货中: ${pig.name}`);
    }
    else {
        toast(`已加入养成中: ${pig.name}`);
    }
}
function markRaisingFed(id) {
    const item = state.raisingPigs.find(x => x.id === id);
    if (!item)
        return;
    if (item.status === "waiting" || item.pausedAt)
        return;
    item.lastFedAt = Date.now();
    item.notifiedAt = 0;
    item.feedCount = Math.max(0, (Number.parseInt(String(item.feedCount || 0), 10) || 0) + 1);
    saveRaisingState();
    runtime.renderRaisingBody();
    checkRaisingReminders();
    const pig = getPigByPNo(item.pNo);
    toast(pig ? `已记录喂食: ${pig.name}` : "已记录喂食");
}
function adjustRaisingFeedCount(id, delta) {
    const item = state.raisingPigs.find(x => x.id === id);
    if (!item || item.status === "waiting")
        return;
    item.feedCount = Math.max(0, (Number.parseInt(String(item.feedCount || 0), 10) || 0) + delta);
    saveRaisingState();
    runtime.renderRaisingBody();
}
function toggleRaisingPause(id) {
    const item = state.raisingPigs.find(x => x.id === id);
    if (!item || item.status === "waiting")
        return;
    const pig = getPigByPNo(item.pNo);
    const now = Date.now();
    const pausedAt = Number(item.pausedAt) || 0;
    if (pausedAt > 0) {
        item.lastFedAt += Math.max(0, now - pausedAt);
        item.pausedAt = 0;
        item.notifiedAt = 0;
        saveRaisingState();
        runtime.renderRaisingBody();
        runtime.updateRaisingCountdownNodes();
        checkRaisingReminders();
        toast(pig ? `${pig.name} 已继续倒计时` : "已继续倒计时");
        return;
    }
    item.pausedAt = now;
    item.notifiedAt = 0;
    saveRaisingState();
    runtime.renderRaisingBody();
    runtime.updateRaisingCountdownNodes();
    toast(pig ? `${pig.name} 已使用晚安药` : "已使用晚安药");
}
function moveRaisingPig(id) {
    const item = state.raisingPigs.find(x => x.id === id);
    if (!item)
        return;
    const pig = getPigByPNo(item.pNo);
    if (item.status === "waiting") {
        item.lastFedAt = Date.now();
        item.notifiedAt = 0;
        item.feedCount = 0;
        item.pausedAt = 0;
        item.status = "active";
        saveRaisingState();
        runtime.renderRaisingBody();
        runtime.updateRaisingCountdownNodes();
        toast(pig ? `已移回养成中: ${pig.name}` : "已移回养成中");
    }
    else {
        item.pausedAt = 0;
        item.status = "waiting";
        saveRaisingState();
        runtime.renderRaisingBody();
        runtime.updateRaisingCountdownNodes();
        toast(pig ? `已移入等待进货中: ${pig.name}` : "已移入等待进货中");
    }
}
async function removeRaisingPig(id) {
    const item = state.raisingPigs.find(x => x.id === id);
    const pig = item ? getPigByPNo(item.pNo) : null;
    if (!item)
        return;
    const confirmed = await customConfirm(`确定从养成中移除${pig ? "「" + pig.name + "」" : "这条记录"}吗?`);
    if (!confirmed)
        return;
    state.raisingPigs = state.raisingPigs.filter(x => x.id !== id);
    saveRaisingState();
    runtime.renderRaisingBody();
    runtime.renderRaisingSearchResults();
    toast("已移除养成记录");
}
async function clearRaisingPigs() {
    if (state.raisingPigs.length === 0) {
        toast("养成中已经是空的");
        return;
    }
    const confirmed = await customConfirm(`确定清空养成中的 ${state.raisingPigs.length} 条记录吗?`);
    if (!confirmed)
        return;
    state.raisingPigs = [];
    saveRaisingState();
    runtime.renderRaisingBody();
    runtime.renderRaisingSearchResults();
    toast("已清空养成中");
}
function searchRaisingPigs(q) {
    const ql = q.trim().toLowerCase();
    if (!ql || !state.dataLoaded)
        return [];
    const byId = new Map();
    for (const p of state.pigsById.values())
        byId.set(p.pNo, p);
    for (const p of state.eventPigsById.values())
        byId.set(p.pNo, p);
    for (const p of state.hiddenPigsById.values()) {
        if (state.pigsById.has(p.pNo))
            byId.set(p.pNo, p);
    }
    const out = [];
    for (const p of byId.values()) {
        const hay = ((p.name || "") + " " + (p.description || "") + " #" + p.pNo).toLowerCase();
        if (hay.includes(ql))
            out.push(p);
        if (out.length >= 80)
            break;
    }
    out.sort((a, b) => {
        const aMain = a.book && a.book <= 6 ? 0 : 1;
        const bMain = b.book && b.book <= 6 ? 0 : 1;
        if (aMain !== bMain)
            return aMain - bMain;
        if (aMain === 0)
            return (a.book - b.book) || (a.page - b.page) || (a.slot - b.slot) || (a.pNo - b.pNo);
        return a.pNo - b.pNo;
    });
    return out;
}
export function renderRaisingSearchResults() {
    const box = $("#raisingResults");
    if (!box)
        return;
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
    for (const item of state.raisingPigs)
        counts.set(item.pNo, (counts.get(item.pNo) || 0) + 1);
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
    if (item.status === "waiting") {
        return buildWaitingRow(item, pig);
    }
    return buildActiveRow(item, pig);
}
function buildActiveRow(item, pig) {
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
            onclick: (ev) => {
                ev.stopPropagation();
                removeRaisingPig(item.id);
            },
        }, "×"),
        el("div", {
            class: "raising-main",
            onclick: () => runtime.showDetail(pig.pNo),
        }, [
            el("div", { class: "raising-thumb" }, el("img", { src: imgUrl(pig.pNo), loading: "lazy", alt: pig.name })),
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
                            onclick: (ev) => {
                                ev.stopPropagation();
                                adjustRaisingFeedCount(item.id, -1);
                            },
                        }, "−"),
                        el("span", { class: "raising-feed-count" }, String(feedCount)),
                        el("button", {
                            type: "button",
                            title: "增加一次",
                            onclick: (ev) => {
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
                    onclick: (ev) => {
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
                onclick: () => runtime.showDetail(pig.pNo),
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
function buildWaitingRow(item, pig) {
    return el("div", { class: "raising-card is-waiting" }, [
        el("button", {
            type: "button",
            class: "raising-remove",
            title: "移除",
            onclick: (ev) => {
                ev.stopPropagation();
                removeRaisingPig(item.id);
            },
        }, "×"),
        el("div", {
            class: "raising-main",
            onclick: () => runtime.showDetail(pig.pNo),
        }, [
            el("div", { class: "raising-thumb" }, el("img", { src: imgUrl(pig.pNo), loading: "lazy", alt: pig.name })),
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
                onclick: () => runtime.showDetail(pig.pNo),
            }, "详情"),
        ]),
    ]);
}
function renderRaisingStats() {
    const stats = $("#raisingStatsBar");
    if (!stats)
        return;
    if (!state.dataLoaded) {
        stats.textContent = "加载中...";
        return;
    }
    const floor = currentRaisingFloor();
    let active = 0, waiting = 0, paused = 0, due = 0;
    const now = Date.now();
    for (const item of state.raisingPigs) {
        if (item.status === "waiting") {
            waiting++;
            continue;
        }
        active++;
        if (item.pausedAt) {
            paused++;
            continue;
        }
        const pig = getPigByPNo(item.pNo);
        if (pig && getRaisingDueMs(item, pig) <= now)
            due++;
    }
    const head = waiting > 0 ? `· 等待进货中 ${waiting} ` : "";
    const pausedText = paused > 0 ? `· 晚安药 ${paused} ` : "";
    const tail = `· 养成中 ${active} 只 ${pausedText}· ${floor.label} · 待喂 ${due}`;
    stats.textContent = (head + tail).trim();
}
export function renderRaisingBody() {
    renderRaisingStats();
    updateRaisingNotificationButton();
    const box = $("#raisingBody");
    if (!box)
        return;
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
    const active = [];
    const waiting = [];
    for (const item of state.raisingPigs) {
        if (item.status === "waiting")
            waiting.push(item);
        else
            active.push(item);
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
export function updateRaisingCountdownNodes() {
    const now = Date.now();
    $$("#raisingBody [data-raising-countdown]").forEach(node => {
        if (node.dataset.raisingWaiting === "1")
            return;
        const dueMs = Number(node.getAttribute("data-due-ms")) || 0;
        const lastFedMs = Number(node.getAttribute("data-last-fed-ms")) || 0;
        const intervalMs = Number(node.getAttribute("data-interval-ms")) || 1;
        const pausedAt = Number(node.getAttribute("data-paused-at")) || 0;
        const clockNow = pausedAt > 0 ? pausedAt : now;
        const diff = dueMs - clockNow;
        const cls = pausedAt > 0 ? "paused" : raisingStatusClass(dueMs);
        node.textContent = formatDuration(diff);
        node.classList.remove("due", "soon", "paused");
        if (cls)
            node.classList.add(cls);
        const card = node.closest(".raising-card");
        if (card) {
            card.classList.toggle("is-due", cls === "due");
            card.classList.toggle("is-soon", cls === "soon");
            card.classList.toggle("is-paused", cls === "paused");
        }
        const fill = document.querySelector(`[data-raising-progress="${node.dataset.raisingCountdown}"]`);
        if (fill) {
            const pct = Math.max(0, Math.min(100, ((clockNow - lastFedMs) / intervalMs) * 100));
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
    if (!btn)
        return;
    if (!notificationsSupported()) {
        btn.textContent = "不支持提醒";
        btn.disabled = true;
        return;
    }
    btn.disabled = Notification.permission === "denied";
    if (Notification.permission === "granted") {
        btn.textContent = raisingPushEnabled ? "后台提醒已开启" : "提醒已开启";
    }
    else if (Notification.permission === "denied") {
        btn.textContent = "提醒被拒绝";
    }
    else {
        btn.textContent = "开启提醒";
    }
}
function classifyPushError(err) {
    const msg = err instanceof Error ? String(err.message) : String(err);
    const lower = msg.toLowerCase();
    if (lower.includes("push service") || lower.includes("registration failed") || lower.includes("not subscribed")) {
        return { type: "push-service", message: "浏览器推送服务不可用(可能是夸克/UC/QQ 等浏览器,或无法连接 Google FCM)", canRetry: true };
    }
    if (lower.includes("permission") || lower.includes("denied") || lower.includes("not allowed")) {
        return { type: "permission", message: "通知权限被浏览器或系统拒绝", canRetry: false };
    }
    if (lower.includes("network") || lower.includes("fetch") || lower.includes("internet") || lower.includes("abort")) {
        return { type: "network", message: "网络连接失败,无法连接推送服务器", canRetry: true };
    }
    if (lower.includes("vapid") || lower.includes("application server key") || lower.includes("invalid key")) {
        return { type: "vapid", message: "推送服务配置错误(VAPID 公钥无效)", canRetry: false };
    }
    return { type: "unknown", message: msg || "未知错误", canRetry: true };
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
        }
        catch (err) {
            console.warn("[raising] failed to unsubscribe old push subscription:", err);
        }
        subscription = null;
    }
    try {
        subscription = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
    }
    catch (err) {
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
    const classified = err instanceof Error && err.type ? err : classifyPushError(err);
    const suffix = classified.canRetry ? ",可刷新页面后重试" : "";
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
            }
            catch (err) {
                console.warn("[raising] push subscribe failed:", err);
                pushSubscribeErrorToast(err);
            }
        }
        else {
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
        }
        catch (err) {
            console.warn("[raising] push subscribe failed:", err);
            pushSubscribeErrorToast(err);
        }
        updateRaisingNotificationButton();
        const now = Date.now();
        let changed = false;
        for (const item of state.raisingPigs) {
            if (item.status === "waiting" || item.pausedAt)
                continue;
            const pig = getPigByPNo(item.pNo);
            if (pig && getRaisingDueMs(item, pig) <= now) {
                item.notifiedAt = 0;
                changed = true;
            }
        }
        if (changed)
            saveRaisingState();
        checkRaisingReminders();
    }
}
export function checkRaisingReminders() {
    if (!state.dataLoaded || state.raisingPigs.length === 0)
        return;
    const now = Date.now();
    let changed = false;
    for (const item of state.raisingPigs) {
        if (item.status === "waiting" || item.pausedAt)
            continue;
        const pig = getPigByPNo(item.pNo);
        if (!pig)
            continue;
        const dueMs = getRaisingDueMs(item, pig);
        if (now < dueMs || item.notifiedAt === dueMs)
            continue;
        item.notifiedAt = dueMs;
        changed = true;
        toast(`#${pig.pNo} ${pig.name} 可以喂食了`, 2600);
    }
    if (changed)
        saveRaisingState();
    updateRaisingCountdownNodes();
}
export function startRaisingTicker() {
    if (raisingTicker)
        return;
    raisingTicker = setInterval(() => {
        checkRaisingReminders();
        updateRaisingCountdownNodes();
    }, 1000);
    checkRaisingReminders();
    updateRaisingCountdownNodes();
}
export function syncRaisingFloorSelect() {
    const select = $("#raisingFloorSelect");
    if (!select)
        return;
    select.value = RAISING_FLOORS[state.raisingFloor] ? state.raisingFloor : "normal";
}
// ---- Wire up raising tab events (called from app.ts) ----
export function setupRaising() {
    syncRaisingFloorSelect();
    let raisingSearchTimer = null;
    $("#raisingSearch")?.addEventListener("input", (e) => {
        if (raisingSearchTimer)
            clearTimeout(raisingSearchTimer);
        const v = e.target.value;
        raisingSearchTimer = setTimeout(() => {
            raisingSearchState.q = v.trim();
            raisingSearchState.results = searchRaisingPigs(v);
            renderRaisingSearchResults();
        }, 160);
    });
    $("#raisingFloorSelect")?.addEventListener("change", (e) => {
        const floor = e.target.value;
        if (!RAISING_FLOORS[floor])
            return;
        state.raisingFloor = floor;
        saveRaisingFloor(floor);
        for (const item of state.raisingPigs) {
            if (item.status === "waiting")
                continue;
            item.notifiedAt = 0;
        }
        saveRaisingState();
        syncRaisingFloorSelect();
        renderRaisingBody();
        renderRaisingSearchResults();
        checkRaisingReminders();
    });
    $("#raisingNotifyBtn")?.addEventListener("click", requestRaisingNotificationPermission);
    $("#raisingClearBtn")?.addEventListener("click", clearRaisingPigs);
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden)
            checkRaisingReminders();
    });
}
