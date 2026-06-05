/**
 * localStorage 操作
 */

import {
  STORAGE_KEY,
  STORAGE_KEY_OWNED_EVENT,
  STORAGE_KEY_BADGE_SMALL,
  STORAGE_KEY_BADGE_BIG,
  STORAGE_KEY_HIDDEN_UNLOCK,
  STORAGE_KEY_RAISING,
  STORAGE_KEY_RAISING_FLOOR,
  RAISING_FLOORS,
  LANG_KEY,
} from './constants.js';

export function loadCollection() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(n => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
}

export function saveCollection(collection) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(collection));
}

export function loadOwnedEventPigs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_OWNED_EVENT);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.filter(n => Number.isInteger(n)) : []);
  } catch {
    return new Set();
  }
}

export function saveOwnedEventPigs(ownedEventPigs) {
  localStorage.setItem(
    STORAGE_KEY_OWNED_EVENT,
    JSON.stringify(Array.from(ownedEventPigs))
  );
}

export function loadBadgeSet(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.filter(n => Number.isInteger(n)) : []);
  } catch {
    return new Set();
  }
}

export function saveBadgeSet(key, set) {
  localStorage.setItem(key, JSON.stringify(Array.from(set).sort((a, b) => a - b)));
}

export function saveSmallBadges(smallBadges) {
  saveBadgeSet(STORAGE_KEY_BADGE_SMALL, smallBadges);
}

export function saveBigBadges(bigBadges) {
  saveBadgeSet(STORAGE_KEY_BADGE_BIG, bigBadges);
}

export function loadHiddenUnlocked() {
  try {
    return localStorage.getItem(STORAGE_KEY_HIDDEN_UNLOCK) === "1";
  } catch {
    return false;
  }
}

export function saveHiddenUnlocked(unlocked) {
  try {
    localStorage.setItem(STORAGE_KEY_HIDDEN_UNLOCK, unlocked ? "1" : "0");
  } catch { }
}

export function loadRaisingPigs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RAISING);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map(item => ({
        id: String(item.id || ""),
        pNo: Number.parseInt(item.pNo, 10),
        startedAt: Number.parseInt(item.startedAt, 10),
        lastFedAt: Number.parseInt(item.lastFedAt, 10),
        notifiedAt: Number.parseInt(item.notifiedAt || 0, 10) || 0,
        feedCount: Math.max(0, Number.parseInt(item.feedCount || 0, 10) || 0),
      }))
      .filter(item =>
        item.id &&
        Number.isInteger(item.pNo) &&
        Number.isFinite(item.startedAt) &&
        Number.isFinite(item.lastFedAt)
      );
  } catch {
    return [];
  }
}

export function saveRaisingPigs(raisingPigs) {
  try {
    localStorage.setItem(STORAGE_KEY_RAISING, JSON.stringify(raisingPigs || []));
  } catch { }
}

export function loadRaisingFloor() {
  try {
    const floor = localStorage.getItem(STORAGE_KEY_RAISING_FLOOR);
    return RAISING_FLOORS[floor] ? floor : "normal";
  } catch {
    return "normal";
  }
}

export function saveRaisingFloor(floor) {
  try {
    localStorage.setItem(
      STORAGE_KEY_RAISING_FLOOR,
      RAISING_FLOORS[floor] ? floor : "normal"
    );
  } catch { }
}

export function currentLang() {
  try {
    return localStorage.getItem(LANG_KEY) === "zht" ? "zht" : "zhs";
  } catch {
    return "zhs";
  }
}

export function saveLang(lang) {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch { }
}
