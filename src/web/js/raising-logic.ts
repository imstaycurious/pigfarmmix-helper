/**
 * 养成中 — 业务逻辑层 (CRUD + 倒计时计算 + 提醒)
 *
 * 与渲染分离: 本模块不操作 DOM (除了 toast 提示),只修改 state 并保存。
 * 渲染由 events.ts 的 "raising-updated" 事件驱动。
 */

import type { Pig, RaisingItem } from "./types/index.js";
import { state } from "./state.js";
import { toast } from "./utils.js";
import { RAISING_FLOORS } from "./constants.js";
import { saveRaisingPigs, saveRaisingFloor } from "./storage.js";
import { emit } from "./events.js";

const MS_MIN = 60 * 1000;
const MS_HOUR = 60 * MS_MIN;

let raisingTicker: ReturnType<typeof setInterval> | null = null;

// ---------- 时间工具 ----------

export function makeRaisingId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getPigByPNo(pNo: number): Pig | undefined {
  return state.pigsById.get(pNo) || state.eventPigsById.get(pNo) || state.hiddenPigsById.get(pNo);
}

export function currentRaisingFloor(): { label: string; multiplier: number } {
  return RAISING_FLOORS[state.raisingFloor] || RAISING_FLOORS.normal;
}

export function baseFeedIntervalMs(pig: Pig): number {
  const raw = pig && pig.feeding && typeof pig.feeding.interval === "number"
    ? pig.feeding.interval
    : 0;
  if (raw === 0) return 58 * MS_MIN;
  return Math.max(1, Math.round(raw * MS_HOUR));
}

export function adjustedFeedIntervalMs(pig: Pig): number {
  return Math.max(1, Math.round(baseFeedIntervalMs(pig) * currentRaisingFloor().multiplier));
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return "可喂食";
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatIntervalMs(ms: number): string {
  const mins = Math.round(ms / MS_MIN);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h} 小时 ${m} 分钟`;
  if (h > 0) return `${h} 小时`;
  return `${m} 分钟`;
}

export function formatDateTime(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString([], {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------- 倒计时计算 ----------

export function getRaisingDueMs(item: RaisingItem, pig: Pig): number {
  return item.lastFedAt + adjustedFeedIntervalMs(pig);
}

export function getRaisingClockNow(item: RaisingItem, now = Date.now()): number {
  const pausedAt = Number(item && item.pausedAt) || 0;
  return pausedAt > 0 ? pausedAt : now;
}

export function getRaisingRemainingMs(item: RaisingItem, pig: Pig, now = Date.now()): number {
  return getRaisingDueMs(item, pig) - getRaisingClockNow(item, now);
}

export function raisingStatusClass(dueMs: number): string {
  const diff = dueMs - Date.now();
  if (diff <= 0) return "due";
  if (diff <= 10 * MS_MIN) return "soon";
  return "";
}

// ---------- 状态保存 ----------

/** 保存养成状态 + 触发云端同步 (通过事件, 由 raising-push 监听) */
export function saveRaisingState(): void {
  saveRaisingPigs(state.raisingPigs);
  emit("raising-saved", undefined);
}

function notifyRaisingChanged(): void {
  emit("raising-updated", undefined);
}

// ---------- CRUD ----------

export function addRaisingPig(pNo: number, status: "active" | "waiting" = "active"): void {
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
  notifyRaisingChanged();
  toast(status === "waiting" ? `已加入等待进货中: ${pig.name}` : `已加入养成中: ${pig.name}`);
}

export function markRaisingFed(id: string): void {
  const item = state.raisingPigs.find(x => x.id === id);
  if (!item) return;
  if (item.status === "waiting" || item.pausedAt) return;
  item.lastFedAt = Date.now();
  item.notifiedAt = 0;
  item.feedCount = Math.max(0, (Number.parseInt(String(item.feedCount || 0), 10) || 0) + 1);
  saveRaisingState();
  notifyRaisingChanged();
  checkRaisingReminders();
  const pig = getPigByPNo(item.pNo);
  toast(pig ? `已记录喂食: ${pig.name}` : "已记录喂食");
}

export function adjustRaisingFeedCount(id: string, delta: number): void {
  const item = state.raisingPigs.find(x => x.id === id);
  if (!item || item.status === "waiting") return;
  item.feedCount = Math.max(0, (Number.parseInt(String(item.feedCount || 0), 10) || 0) + delta);
  saveRaisingState();
  notifyRaisingChanged();
}

export function toggleRaisingPause(id: string): void {
  const item = state.raisingPigs.find(x => x.id === id);
  if (!item || item.status === "waiting") return;
  const pig = getPigByPNo(item.pNo);
  const now = Date.now();
  const pausedAt = Number(item.pausedAt) || 0;

  if (pausedAt > 0) {
    item.lastFedAt += Math.max(0, now - pausedAt);
    item.pausedAt = 0;
    item.notifiedAt = 0;
    saveRaisingState();
    notifyRaisingChanged();
    checkRaisingReminders();
    toast(pig ? `${pig.name} 已继续倒计时` : "已继续倒计时");
    return;
  }

  item.pausedAt = now;
  item.notifiedAt = 0;
  saveRaisingState();
  notifyRaisingChanged();
  toast(pig ? `${pig.name} 已使用晚安药` : "已使用晚安药");
}

export function moveRaisingPig(id: string): void {
  const item = state.raisingPigs.find(x => x.id === id);
  if (!item) return;
  const pig = getPigByPNo(item.pNo);
  if (item.status === "waiting") {
    item.lastFedAt = Date.now();
    item.notifiedAt = 0;
    item.feedCount = 0;
    item.pausedAt = 0;
    item.status = "active";
    saveRaisingState();
    notifyRaisingChanged();
    toast(pig ? `已移回养成中: ${pig.name}` : "已移回养成中");
  } else {
    item.pausedAt = 0;
    item.status = "waiting";
    saveRaisingState();
    notifyRaisingChanged();
    toast(pig ? `已移入等待进货中: ${pig.name}` : "已移入等待进货中");
  }
}

export async function removeRaisingPig(id: string): Promise<void> {
  const item = state.raisingPigs.find(x => x.id === id);
  const pig = item ? getPigByPNo(item.pNo) : null;
  if (!item) return;
  // 延迟 import 避免 modal 与逻辑层循环
  const { customConfirm } = await import("./modal.js");
  const confirmed = await customConfirm(
    `确定从养成中移除${pig ? "「" + pig.name + "」" : "这条记录"}吗?`
  );
  if (!confirmed) return;
  state.raisingPigs = state.raisingPigs.filter(x => x.id !== id);
  saveRaisingState();
  notifyRaisingChanged();
  toast("已移除养成记录");
}

export async function clearRaisingPigs(): Promise<void> {
  if (state.raisingPigs.length === 0) {
    toast("养成中已经是空的");
    return;
  }
  const { customConfirm } = await import("./modal.js");
  const confirmed = await customConfirm(
    `确定清空养成中的 ${state.raisingPigs.length} 条记录吗?`
  );
  if (!confirmed) return;
  state.raisingPigs = [];
  saveRaisingState();
  notifyRaisingChanged();
  toast("已清空养成中");
}

// ---------- 搜索 ----------

export function searchRaisingPigs(q: string): Pig[] {
  const ql = q.trim().toLowerCase();
  if (!ql || !state.dataLoaded) return [];
  const byId = new Map<number, Pig>();
  for (const p of state.pigsById.values()) byId.set(p.pNo, p);
  for (const p of state.eventPigsById.values()) byId.set(p.pNo, p);
  for (const p of state.hiddenPigsById.values()) {
    if (state.pigsById.has(p.pNo)) byId.set(p.pNo, p);
  }
  const out: Pig[] = [];
  for (const p of byId.values()) {
    const hay = ((p.name || "") + " " + (p.description || "") + " #" + p.pNo).toLowerCase();
    if (hay.includes(ql)) out.push(p);
    if (out.length >= 80) break;
  }
  out.sort((a, b) => {
    const aMain = a.book && a.book <= 6 ? 0 : 1;
    const bMain = b.book && b.book <= 6 ? 0 : 1;
    if (aMain !== bMain) return aMain - bMain;
    if (aMain === 0) return (a.book! - b.book!) || (a.page! - b.page!) || (a.slot! - b.slot!) || (a.pNo - b.pNo);
    return a.pNo - b.pNo;
  });
  return out;
}

// ---------- 提醒引擎 ----------

export function checkRaisingReminders(): void {
  if (!state.dataLoaded || state.raisingPigs.length === 0) return;
  const now = Date.now();
  let changed = false;
  for (const item of state.raisingPigs) {
    if (item.status === "waiting" || item.pausedAt) continue;
    const pig = getPigByPNo(item.pNo);
    if (!pig) continue;
    const dueMs = getRaisingDueMs(item, pig);
    if (now < dueMs || item.notifiedAt === dueMs) continue;
    item.notifiedAt = dueMs;
    changed = true;
    toast(`#${pig.pNo} ${pig.name} 可以喂食了`, 2600);
  }
  if (changed) saveRaisingState();
  emit("raising-updated", undefined);
}

export function startRaisingTicker(): void {
  if (raisingTicker) return;
  raisingTicker = setInterval(() => {
    checkRaisingReminders();
    emit("raising-tick", undefined);
  }, 1000);
  checkRaisingReminders();
  emit("raising-tick", undefined);
}

/** 更换地板 (由 render 层调用, 保存到 storage 并重置提醒) */
export function setRaisingFloor(floor: string): void {
  if (!RAISING_FLOORS[floor as keyof typeof RAISING_FLOORS]) return;
  state.raisingFloor = floor as keyof typeof RAISING_FLOORS;
  saveRaisingFloor(state.raisingFloor);
  for (const item of state.raisingPigs) {
    if (item.status === "waiting") continue;
    item.notifiedAt = 0;
  }
  saveRaisingState();
  emit("raising-updated", undefined);
}

/** 重置到点提醒标记 (推送权限授予后调用) */
export function resetDueNotifications(): void {
  const now = Date.now();
  let changed = false;
  for (const item of state.raisingPigs) {
    if (item.status === "waiting" || item.pausedAt) continue;
    const pig = getPigByPNo(item.pNo);
    if (pig && getRaisingDueMs(item, pig) <= now) {
      item.notifiedAt = 0;
      changed = true;
    }
  }
  if (changed) saveRaisingState();
  checkRaisingReminders();
}
