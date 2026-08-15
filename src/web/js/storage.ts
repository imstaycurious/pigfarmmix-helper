/**
 * localStorage 操作
 */

import type { RaisingItem, RaisingFloor } from "./types.js";
import {
  STORAGE_KEY,
  STORAGE_KEY_OWNED_EVENT,
  STORAGE_KEY_BADGE_SMALL,
  STORAGE_KEY_BADGE_BIG,
  STORAGE_KEY_HIDDEN_UNLOCK,
  STORAGE_KEY_RAISING,
  STORAGE_KEY_RAISING_FLOOR,
  STORAGE_KEY_DEVICE_ID,
  STORAGE_KEY_PUSH_ENABLED,
  STORAGE_KEY_DATA_MODIFIED,
  RAISING_FLOORS,
  LANG_KEY,
} from "./constants.js";

// 数据修改时间戳管理
export function getDataModifiedTime(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DATA_MODIFIED);
    return raw ? parseInt(raw, 10) : 0;
  } catch {
    return 0;
  }
}

export function setDataModifiedTime(timestamp: number = Date.now()): void {
  localStorage.setItem(STORAGE_KEY_DATA_MODIFIED, String(timestamp));
}

export function loadCollection(): number[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((n: unknown) => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
}

export function saveCollection(collection: number[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(collection));
  setDataModifiedTime();
}

export function loadOwnedEventPigs(): Set<number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_OWNED_EVENT);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.filter((n: unknown) => Number.isInteger(n)) : []);
  } catch {
    return new Set();
  }
}

export function saveOwnedEventPigs(ownedEventPigs: Set<number>): void {
  localStorage.setItem(STORAGE_KEY_OWNED_EVENT, JSON.stringify(Array.from(ownedEventPigs)));
  setDataModifiedTime();
}

export function loadBadgeSet(key: string): Set<number> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.filter((n: unknown) => Number.isInteger(n)) : []);
  } catch {
    return new Set();
  }
}

export function saveBadgeSet(key: string, set: Set<number>): void {
  localStorage.setItem(key, JSON.stringify(Array.from(set).sort((a, b) => a - b)));
  setDataModifiedTime();
}

export function saveSmallBadges(smallBadges: Set<number>): void {
  saveBadgeSet(STORAGE_KEY_BADGE_SMALL, smallBadges);
}

export function saveBigBadges(bigBadges: Set<number>): void {
  saveBadgeSet(STORAGE_KEY_BADGE_BIG, bigBadges);
}

export function loadHiddenUnlocked(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY_HIDDEN_UNLOCK) === "1";
  } catch {
    return false;
  }
}

export function saveHiddenUnlocked(unlocked: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY_HIDDEN_UNLOCK, unlocked ? "1" : "0");
  } catch { /* ignore */ }
}

export function loadRaisingPigs(): RaisingItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RAISING);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((item: Record<string, unknown>) => ({
        id: String(item.id || ""),
        pNo: Number.parseInt(item.pNo as string, 10),
        startedAt: Number.parseInt(item.startedAt as string, 10),
        lastFedAt: Number.parseInt(item.lastFedAt as string, 10),
        notifiedAt: Number.parseInt((item.notifiedAt ?? 0) as string, 10) || 0,
        feedCount: Math.max(0, Number.parseInt((item.feedCount ?? 0) as string, 10) || 0),
        pausedAt: item.status === "waiting"
          ? 0
          : Math.max(0, Number.parseInt((item.pausedAt ?? 0) as string, 10) || 0),
        status: item.status === "waiting" ? "waiting" as const : "active" as const,
      }))
      .filter((item: RaisingItem) =>
        item.id &&
        Number.isInteger(item.pNo) &&
        Number.isFinite(item.startedAt) &&
        Number.isFinite(item.lastFedAt)
      );
  } catch {
    return [];
  }
}

export function saveRaisingPigs(raisingPigs: RaisingItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_RAISING, JSON.stringify(raisingPigs || []));
  } catch { /* ignore */ }
}

export function loadRaisingFloor(): RaisingFloor {
  try {
    const floor = localStorage.getItem(STORAGE_KEY_RAISING_FLOOR);
    return (floor && floor in RAISING_FLOORS) ? floor as RaisingFloor : "normal";
  } catch {
    return "normal";
  }
}

export function saveRaisingFloor(floor: RaisingFloor): void {
  try {
    localStorage.setItem(STORAGE_KEY_RAISING_FLOOR, floor in RAISING_FLOORS ? floor : "normal");
  } catch { /* ignore */ }
}

function makeLocalId(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && cryptoObj.randomUUID) return cryptoObj.randomUUID();
  const bytes = new Uint8Array(16);
  if (cryptoObj && cryptoObj.getRandomValues) {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

export function loadDeviceId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY_DEVICE_ID);
    if (existing) return existing;
    const next = makeLocalId();
    localStorage.setItem(STORAGE_KEY_DEVICE_ID, next);
    return next;
  } catch {
    return makeLocalId();
  }
}

export function loadPushEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY_PUSH_ENABLED) === "1";
  } catch {
    return false;
  }
}

export function savePushEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY_PUSH_ENABLED, enabled ? "1" : "0");
  } catch { /* ignore */ }
}

export function currentLang(): string {
  try {
    return localStorage.getItem(LANG_KEY) === "zht" ? "zht" : "zhs";
  } catch {
    return "zhs";
  }
}

export function saveLang(lang: string): void {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch { /* ignore */ }
}
