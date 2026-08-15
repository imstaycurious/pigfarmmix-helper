/**
 * 导入导出 — 纯业务逻辑层 (无 DOM 操作, 可独立测试)
 *
 * 包含: 按名字搜索 / 三元组解析 / 批量解析 / 导出构建 / 导入解析 / 导入应用
 * UI 渲染在 render/import-export.ts
 */

import type { Pig, ParsedImport, ImportApplyResult, ExportPayload, RaisingItem, RaisingFloor } from "./types.js";
import { state } from "./state.js";
import { RAISING_FLOORS, EXPORT_TYPE, EXPORT_VERSION } from "./constants.js";
import { saveCollection, saveOwnedEventPigs, saveSmallBadges, saveBigBadges, saveHiddenUnlocked, saveRaisingFloor } from "./storage.js";
import { mergeHiddenIntoMain, buildBreedingIndex, replaceCollectionState, replaceOwnedEventPigs, replaceBadges, replaceRaisingPigs } from "./data.js";
import { emit } from "./events.js";
import { saveRaisingState } from "./raising-logic.js";

// ---------- 按名字搜索 ----------

export function searchByName(q: string): Pig[] {
  const ql = q.trim().toLowerCase();
  if (!ql) return [];
  const out: Pig[] = [];
  for (const p of state.pigsById.values()) {
    const hay = ((p.name || "") + " " + (p.description || "") + " #" + p.pNo).toLowerCase();
    if (hay.includes(ql)) out.push(p);
    if (out.length >= 60) break;
  }
  out.sort((a, b) => (a.book! - b.book!) || (a.page! - b.page!) || (a.slot! - b.slot!) || (a.pNo - b.pNo));
  return out;
}

// ---------- 三元组解析 ----------

export interface TripleResult {
  err?: string;
  book?: number;
  page?: number;
  slot?: number;
  listno?: number;
}

export function parseTriple(book: string, page: string, slot: string): TripleResult {
  const b = parseInt(book, 10), p = parseInt(page, 10), s = parseInt(slot, 10);
  if (!(b >= 1 && b <= 6)) return { err: "图鉴需为 1~6" };
  if (!(p >= 1)) return { err: "页需 ≥ 1" };
  if (!(s >= 1 && s <= 6)) return { err: "格需为 1~6" };
  return { book: b, page: p, slot: s, listno: (p - 1) * 6 + s };
}

export interface AddByPNoResult {
  ok?: boolean;
  err?: string;
  msg?: string;
  pig?: Pig;
}

/** 按 pNo 添加收藏 (含保存) */
export function addByPNo(pNo: number): AddByPNoResult {
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

export function addFromTriple(book: string, page: string, slot: string): AddByPNoResult {
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

// ---------- 批量三元组 ----------

export interface BatchLine {
  raw: string;
  idx: number;
  parts: string[];
}

export function parseBatchLines(text: string): BatchLine[] {
  const lines = text.split(/\r?\n/);
  const parsed: BatchLine[] = [];
  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) return;
    const parts = line.split(/[\s\/,.;]+/).filter(Boolean);
    parsed.push({ raw: line, idx: idx + 1, parts });
  });
  return parsed;
}

// ---------- 导出 ----------

export function buildExportPayload(): ExportPayload {
  const sortedMain: Pig[] = [];
  for (const pNo of state.collection) {
    const p = state.pigsById.get(pNo);
    if (p) sortedMain.push(p);
  }
  sortedMain.sort((a, b) => (a.book! - b.book!) || (a.page! - b.page!) || (a.slot! - b.slot!) || (a.pNo - b.pNo));
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
      feedCount: Math.max(0, Number.parseInt(String(item.feedCount || 0), 10) || 0),
      pausedAt: item.status === "waiting" ? 0 : (Number(item.pausedAt) || 0),
      status: item.status === "waiting" ? "waiting" : "active",
    })),
    raisingFloor: state.raisingFloor,
    hiddenUnlocked: state.hiddenUnlocked,
  };
}

// ---------- 导入解析 ----------

function makeRaisingId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyResult(err: string): ParsedImport {
  return { err, collection: [], ownedEventPigs: [], smallBadges: [], bigBadges: [], raisingPigs: [], source: "json", formatVersion: 0 };
}

/** 解析导入文本 (兼容 v1/v2/v3/v4 + 三元组裸文本) */
export function parseImportText(raw: string): ParsedImport {
  const txt = (raw || "").trim();
  if (!txt) return emptyResult("输入为空");

  if (txt.startsWith("{") || txt.startsWith("[")) {
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(txt);
    } catch (err) {
      return emptyResult(`JSON 解析失败: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
      return emptyResult("JSON 顶层必须是一个对象");
    }
    if (obj.type && obj.type !== EXPORT_TYPE) {
      return emptyResult(`不是本工具的备份文件 (type=${obj.type})`);
    }

    const fileVersion = Number.parseInt(String(obj.version), 10) || 1;
    const hasV2 = Array.isArray(obj.owned186Pigs) || Array.isArray(obj.owned186Triplets);
    const isV2 = hasV2 || fileVersion >= 2;

    const collection: number[] = [];
    const tripletToPNo = (s: string): number | null => {
      const m = String(s).match(/^(\d+)[\/\s,.;]+(\d+)[\/\s,.;]+(\d+)$/);
      if (!m) return null;
      const key = `${+m[1]}-${(+m[2] - 1) * 6 + +m[3]}`;
      return state.pigsByListKey.get(key) || null;
    };

    if (isV2) {
      if (Array.isArray(obj.owned186Pigs)) {
        for (const v of obj.owned186Pigs) {
          const n = Number.parseInt(String(v), 10);
          if (Number.isInteger(n) && state.pigsById.has(n)) collection.push(n);
        }
      } else if (Array.isArray(obj.owned186Triplets)) {
        for (const s of obj.owned186Triplets) {
          const pNo = tripletToPNo(s as string);
          if (pNo) collection.push(pNo);
        }
      }
    } else {
      const unowned = new Set<number>();
      if (Array.isArray(obj.collection)) {
        for (const v of obj.collection) {
          const n = Number.parseInt(String(v), 10);
          if (Number.isInteger(n)) unowned.add(n);
        }
      } else if (Array.isArray(obj.collectionTriplets)) {
        for (const s of obj.collectionTriplets) {
          const pNo = tripletToPNo(s as string);
          if (pNo) unowned.add(pNo);
        }
      }
      for (const [pNo, pig] of state.pigsById) {
        if (pig.status === "hidden") continue;
        if (!unowned.has(pNo)) collection.push(pNo);
      }
    }

    const ownedEventPigs: number[] = [];
    if (Array.isArray(obj.ownedEventPigs)) {
      for (const v of obj.ownedEventPigs) {
        const n = Number.parseInt(String(v), 10);
        if (Number.isInteger(n) && state.eventPigsById.has(n)) ownedEventPigs.push(n);
      }
    }
    const smallBadges: number[] = [];
    if (Array.isArray(obj.smallBadges)) {
      for (const v of obj.smallBadges) {
        const n = Number.parseInt(String(v), 10);
        if (Number.isInteger(n) && (state.pigsById.has(n) || state.eventPigsById.has(n))) smallBadges.push(n);
      }
    }
    const bigBadges: number[] = [];
    if (Array.isArray(obj.bigBadges)) {
      for (const v of obj.bigBadges) {
        const n = Number.parseInt(String(v), 10);
        if (Number.isInteger(n) && (state.pigsById.has(n) || state.eventPigsById.has(n))) bigBadges.push(n);
      }
    }
    const raisingPigs: RaisingItem[] = [];
    if (Array.isArray(obj.raisingPigs)) {
      const now = Date.now();
      for (const raw of obj.raisingPigs) {
        const r = raw as Record<string, unknown>;
        const pNo = Number.parseInt(String(r.pNo), 10);
        if (!Number.isInteger(pNo) || !(state.pigsById.has(pNo) || state.eventPigsById.has(pNo))) continue;
        const startedAt = Number.parseInt(String(r.startedAt), 10);
        const lastFedAt = Number.parseInt(String(r.lastFedAt), 10);
        const notifiedAt = Number.parseInt(String(r.notifiedAt ?? 0), 10) || 0;
        const feedCount = Math.max(0, Number.parseInt(String(r.feedCount ?? 0), 10) || 0);
        const status = r.status === "waiting" ? "waiting" as const : "active" as const;
        const pausedAt = status === "active" ? Math.max(0, Number.parseInt(String(r.pausedAt ?? 0), 10) || 0) : 0;
        raisingPigs.push({
          id: String(r.id || makeRaisingId()),
          pNo,
          startedAt: Number.isFinite(startedAt) ? startedAt : now,
          lastFedAt: Number.isFinite(lastFedAt) ? lastFedAt : now,
          notifiedAt, feedCount, pausedAt, status,
        });
      }
    }
    const rf = String(obj.raisingFloor);
    const raisingFloor: RaisingFloor | undefined = (rf === "woodchip" || rf === "normal" || rf === "straw") ? rf : undefined;
    const hiddenUnlocked = obj.hiddenUnlocked === true ? true : undefined;
    return {
      collection, ownedEventPigs, smallBadges, bigBadges, raisingPigs, raisingFloor,
      hiddenUnlocked, source: "json", formatVersion: isV2 ? Math.max(2, fileVersion) : 1,
    };
  }

  // Fallback: 三元组裸文本
  const items = parseBatchLines(txt);
  if (items.length === 0) return emptyResult("没有可识别的 JSON 或三元组内容");
  const coll: number[] = [];
  let skipped = 0;
  for (const it of items) {
    if (it.parts.length < 3) { skipped++; continue; }
    const [b, p, s] = it.parts.map(n => parseInt(n, 10));
    if (!(b >= 1 && b <= 6 && p >= 1 && s >= 1 && s <= 6)) { skipped++; continue; }
    const pNo = state.pigsByListKey.get(`${b}-${(p - 1) * 6 + s}`);
    if (pNo) coll.push(pNo); else skipped++;
  }
  return {
    collection: coll, ownedEventPigs: [], smallBadges: [], bigBadges: [], raisingPigs: [],
    source: "triplets", formatVersion: 2, skipped,
  };
}

// ---------- 导入应用 ----------

/** 应用导入结果到 state (含保存), 返回统计 */
export function applyImport(parsed: ParsedImport, { replace }: { replace: boolean }): ImportApplyResult {
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
    replaceCollectionState(desiredColl);
    for (const n of nextColl) if (!prevColl.has(n)) addedColl++;
    for (const n of prevColl) if (!nextColl.has(n)) removedColl++;

    const prevOwned = new Set(state.ownedEventPigs);
    replaceOwnedEventPigs(desiredOwned);
    for (const n of desiredOwned) if (!prevOwned.has(n)) addedOwned++;
    for (const n of prevOwned) if (!desiredOwned.has(n)) removedOwned++;

    const prevSmall = new Set(state.smallBadges);
    const prevBig = new Set(state.bigBadges);
    replaceBadges(desiredSmall, desiredBig);
    for (const n of desiredSmall) if (!prevSmall.has(n)) addedSmall++;
    for (const n of prevSmall) if (!desiredSmall.has(n)) removedSmall++;
    for (const n of desiredBig) if (!prevBig.has(n)) addedBig++;
    for (const n of prevBig) if (!desiredBig.has(n)) removedBig++;

    const prevRaising = state.raisingPigs.length;
    replaceRaisingPigs(desiredRaising);
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
    emit("raising-updated", undefined);
  }

  saveCollection(state.collection);
  saveOwnedEventPigs(state.ownedEventPigs);
  saveSmallBadges(state.smallBadges);
  saveBigBadges(state.bigBadges);
  saveRaisingState();
  let unlocked = false;
  if (parsed.hiddenUnlocked === true && !state.hiddenUnlocked) {
    state.hiddenUnlocked = true;
    saveHiddenUnlocked(state.hiddenUnlocked);
    mergeHiddenIntoMain();
    buildBreedingIndex(state.breedingTable);
    unlocked = true;
  }
  return {
    addedColl, removedColl, addedOwned, removedOwned,
    addedSmall, removedSmall, addedBig, removedBig,
    addedRaising, removedRaising, unlocked,
  };
}
