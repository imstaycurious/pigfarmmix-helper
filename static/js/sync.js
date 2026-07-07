/**
 * 云端数据同步模块
 */

import {
  loadCollection,
  saveCollection,
  loadOwnedEventPigs,
  saveOwnedEventPigs,
  loadBadgeSet,
  saveBadgeSet,
} from './storage.js';
import {
  STORAGE_KEY_BADGE_SMALL,
  STORAGE_KEY_BADGE_BIG,
} from './constants.js';
import { getCurrentUser } from './auth.js';

const API_BASE = ""; // 使用相对路径

/**
 * 同步状态枚举
 */
export const SyncStatus = {
  IDLE: "idle",           // 空闲
  SYNCING: "syncing",     // 同步中
  SUCCESS: "success",     // 同步成功
  ERROR: "error",         // 同步失败
  OFFLINE: "offline",     // 离线模式
};

// 同步状态回调函数列表
const syncStatusCallbacks = [];

/**
 * 注册同步状态变化回调
 */
export function onSyncStatusChange(callback) {
  syncStatusCallbacks.push(callback);
}

/**
 * 触发同步状态变化
 */
function notifySyncStatus(status, message = "") {
  for (const callback of syncStatusCallbacks) {
    try {
      callback(status, message);
    } catch (err) {
      console.error("Sync status callback error:", err);
    }
  }
}

/**
 * 从云端拉取数据（仅下载）
 */
export async function pullFromCloud() {
  const user = getCurrentUser();
  if (!user) {
    return { ok: false, error: "未登录" };
  }

  try {
    notifySyncStatus(SyncStatus.SYNCING, "正在从云端拉取数据...");

    const response = await fetch(`${API_BASE}/api/sync/collection?userId=${encodeURIComponent(user.id)}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const result = await response.json();

    if (!result.ok) {
      notifySyncStatus(SyncStatus.ERROR, result.error || "拉取失败");
      return result;
    }

    // 合并云端数据到本地（取并集）
    const cloudData = result.data || {};

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

    return {
      ok: true,
      merged: {
        collection: mergedCollection.length,
        eventPigs: mergedEventPigs.size,
        smallBadges: mergedSmallBadges.size,
        bigBadges: mergedBigBadges.size,
      },
    };
  } catch (error) {
    console.error("Pull from cloud error:", error);
    notifySyncStatus(SyncStatus.OFFLINE, "网络错误");
    return { ok: false, error: "网络错误，请检查连接" };
  }
}

/**
 * 上传本地数据到云端并获取合并结果
 */
export async function syncWithCloud() {
  const user = getCurrentUser();
  if (!user) {
    return { ok: false, error: "未登录" };
  }

  try {
    notifySyncStatus(SyncStatus.SYNCING, "正在同步数据...");

    // 收集本地数据
    const localData = {
      collection: loadCollection(),
      eventPigs: Array.from(loadOwnedEventPigs()),
      smallBadges: Array.from(loadBadgeSet(STORAGE_KEY_BADGE_SMALL)),
      bigBadges: Array.from(loadBadgeSet(STORAGE_KEY_BADGE_BIG)),
    };

    const response = await fetch(`${API_BASE}/api/sync/collection`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId: user.id,
        localData,
      }),
    });

    const result = await response.json();

    if (!result.ok) {
      notifySyncStatus(SyncStatus.ERROR, result.error || "同步失败");
      return result;
    }

    // 用云端合并后的数据更新本地
    const cloudData = result.cloudData || {};
    saveCollection(cloudData.collection || []);
    saveOwnedEventPigs(new Set(cloudData.eventPigs || []));
    saveBadgeSet(STORAGE_KEY_BADGE_SMALL, new Set(cloudData.smallBadges || []));
    saveBadgeSet(STORAGE_KEY_BADGE_BIG, new Set(cloudData.bigBadges || []));

    // 更新用户的最后同步时间
    if (result.lastSyncAt) {
      user.lastSyncAt = result.lastSyncAt;
      const { saveCurrentUser } = await import('./auth.js');
      saveCurrentUser(user);
    }

    notifySyncStatus(SyncStatus.SUCCESS, "同步完成");

    return result;
  } catch (error) {
    console.error("Sync with cloud error:", error);
    notifySyncStatus(SyncStatus.OFFLINE, "网络错误");
    return { ok: false, error: "网络错误，请检查连接" };
  }
}

/**
 * 自动同步（登录后调用）
 */
export async function autoSync() {
  const user = getCurrentUser();
  if (!user) return;

  // 检查是否需要同步（距离上次同步超过 5 分钟）
  const now = Date.now();
  const lastSyncAt = user.lastSyncAt || 0;
  const fiveMinutes = 5 * 60 * 1000;

  if (now - lastSyncAt < fiveMinutes) {
    console.log("Skip auto sync: synced recently");
    return;
  }

  console.log("Auto syncing...");
  await syncWithCloud();
}
