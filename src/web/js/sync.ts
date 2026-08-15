/**
 * 云端数据同步模块
 */

import type { SyncResult, CloudCollectionData } from "./types/index.js";
import {
  loadCollection,
  saveCollection,
  loadOwnedEventPigs,
  saveOwnedEventPigs,
  loadBadgeSet,
  saveBadgeSet,
  getDataModifiedTime,
  setDataModifiedTime,
} from "./storage.js";
import { STORAGE_KEY_BADGE_SMALL, STORAGE_KEY_BADGE_BIG, API_BASE } from "./constants.js";
import { getCurrentUser, saveCurrentUser } from "./auth.js";

/** 同步状态枚举 */
export const SyncStatus = {
  IDLE: "idle",
  SYNCING: "syncing",
  SUCCESS: "success",
  ERROR: "error",
  OFFLINE: "offline",
} as const;

export type SyncStatusValue = (typeof SyncStatus)[keyof typeof SyncStatus];

// 同步状态回调函数列表
const syncStatusCallbacks: Array<(status: SyncStatusValue, message?: string) => void> = [];

/** 注册同步状态变化回调 */
export function onSyncStatusChange(callback: (status: SyncStatusValue, message?: string) => void): void {
  syncStatusCallbacks.push(callback);
}

/** 触发同步状态变化 */
function notifySyncStatus(status: SyncStatusValue, message = ""): void {
  for (const callback of syncStatusCallbacks) {
    try {
      callback(status, message);
    } catch (err) {
      console.error("Sync status callback error:", err);
    }
  }
}

interface SyncOptions {
  onDataUpdated?: () => void;
}

/** 从云端拉取数据 (仅下载) */
export async function pullFromCloud(options: SyncOptions = {}): Promise<SyncResult> {
  const { onDataUpdated } = options;
  const user = getCurrentUser();
  if (!user) {
    return { ok: false, error: "未登录" };
  }

  try {
    notifySyncStatus(SyncStatus.SYNCING, "正在从云端拉取数据...");

    const response = await fetch(`${API_BASE}/api/sync/collection?userId=${encodeURIComponent(user.id)}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    const result = await response.json();

    if (!result.ok) {
      notifySyncStatus(SyncStatus.ERROR, result.error || "拉取失败");
      return result;
    }

    // 合并云端数据到本地 (取并集)
    const cloudData: CloudCollectionData = result.data || {};

    const localCollection = loadCollection();
    const mergedCollection = Array.from(new Set([...localCollection, ...(cloudData.collection || [])]));
    saveCollection(mergedCollection);

    const localEventPigs = loadOwnedEventPigs();
    const mergedEventPigs = new Set([...localEventPigs, ...(cloudData.eventPigs || [])]);
    saveOwnedEventPigs(mergedEventPigs);

    const localSmallBadges = loadBadgeSet(STORAGE_KEY_BADGE_SMALL);
    const mergedSmallBadges = new Set([...localSmallBadges, ...(cloudData.smallBadges || [])]);
    saveBadgeSet(STORAGE_KEY_BADGE_SMALL, mergedSmallBadges);

    const localBigBadges = loadBadgeSet(STORAGE_KEY_BADGE_BIG);
    const mergedBigBadges = new Set([...localBigBadges, ...(cloudData.bigBadges || [])]);
    saveBadgeSet(STORAGE_KEY_BADGE_BIG, mergedBigBadges);

    notifySyncStatus(SyncStatus.SUCCESS, "数据已同步");

    if (onDataUpdated && typeof onDataUpdated === "function") {
      onDataUpdated();
    }

    return {
      ok: true,
      merged: {
        collection: mergedCollection.length,
        eventPigs: mergedEventPigs.size,
        smallBadges: mergedSmallBadges.size,
        bigBadges: mergedBigBadges.size,
      },
    };
  } catch {
    console.error("Pull from cloud error");
    notifySyncStatus(SyncStatus.OFFLINE, "网络错误");
    return { ok: false, error: "网络错误,请检查连接" };
  }
}

/** 上传本地数据到云端并获取合并结果 */
export async function syncWithCloud(options: SyncOptions = {}): Promise<SyncResult> {
  const { onDataUpdated } = options;
  const user = getCurrentUser();
  if (!user) {
    return { ok: false, error: "未登录" };
  }

  try {
    notifySyncStatus(SyncStatus.SYNCING, "正在同步数据...");

    // 收集本地数据
    const localData: CloudCollectionData = {
      collection: loadCollection(),
      eventPigs: Array.from(loadOwnedEventPigs()),
      smallBadges: Array.from(loadBadgeSet(STORAGE_KEY_BADGE_SMALL)),
      bigBadges: Array.from(loadBadgeSet(STORAGE_KEY_BADGE_BIG)),
    };
    let localModifiedAt = getDataModifiedTime();

    // 老用户首次同步保护
    const hasLocalData = localData.collection.length > 0 ||
                         localData.eventPigs.length > 0 ||
                         localData.smallBadges.length > 0 ||
                         localData.bigBadges.length > 0;
    if (hasLocalData && localModifiedAt === 0) {
      localModifiedAt = Date.now();
      setDataModifiedTime(localModifiedAt);
    }

    const response = await fetch(`${API_BASE}/api/sync/collection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, localData, localModifiedAt }),
    });

    const result = await response.json();

    if (!result.ok) {
      notifySyncStatus(SyncStatus.ERROR, result.error || "同步失败");
      return result;
    }

    // Last-Write-Wins: 服务器返回胜出方数据
    const cloudData: CloudCollectionData = result.cloudData || {};
    if (result.winner === "cloud") {
      saveCollection(cloudData.collection || []);
      saveOwnedEventPigs(new Set(cloudData.eventPigs || []));
      saveBadgeSet(STORAGE_KEY_BADGE_SMALL, new Set(cloudData.smallBadges || []));
      saveBadgeSet(STORAGE_KEY_BADGE_BIG, new Set(cloudData.bigBadges || []));
      if (result.dataModifiedAt) {
        setDataModifiedTime(result.dataModifiedAt);
      }
    }

    // 更新用户的最后同步时间
    if (result.lastSyncAt) {
      user.lastSyncAt = result.lastSyncAt;
      saveCurrentUser(user);
    }

    notifySyncStatus(SyncStatus.SUCCESS, "同步完成");

    if (result.winner === "cloud" && onDataUpdated && typeof onDataUpdated === "function") {
      onDataUpdated();
    }

    return result;
  } catch {
    console.error("Sync with cloud error");
    notifySyncStatus(SyncStatus.OFFLINE, "网络错误");
    return { ok: false, error: "网络错误,请检查连接" };
  }
}

/** 自动同步 (登录后调用) */
export async function autoSync(): Promise<void> {
  const user = getCurrentUser();
  if (!user) return;

  const now = Date.now();
  const lastSyncAt = user.lastSyncAt || 0;
  const fiveMinutes = 5 * 60 * 1000;

  if (now - lastSyncAt < fiveMinutes) {
    return;
  }

  await syncWithCloud();
}
