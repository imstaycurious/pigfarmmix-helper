/**
 * 数据加载和处理
 */

import {
  DATA_URL_BY_LANG,
  BOOK_COLOR_TEXT,
  COLOR_TEXT,
  HUNT_SITES,
  HUNT_REGION_CODES,
  HUNT_NORMAL_CODES,
  HUNT_RARE_CODES,
} from './constants.js';
import { state } from './state.js';
import { currentLang } from './storage.js';
import {
  saveHiddenUnlocked,
  saveCollection,
  saveOwnedEventPigs,
  saveSmallBadges,
  saveBigBadges,
} from './storage.js';
import { showUnlockCelebration } from './utils.js';

// 把上游原始 atlas.type/index 推导成 book/page/slot/color_text
export function enrichPig(p) {
  const atlas = p.atlas || {};
  const type = atlas.type;
  const index = atlas.index;

  if (type && type >= 1 && type <= 6 && index) {
    p.book = type;
    p.page = Math.ceil(index / 6);
    p.slot = ((index - 1) % 6) + 1;
  } else if (type === 7 && index) {
    p.book = 7;
    p.page = null;
    p.slot = null;
  } else {
    p.book = type;
    p.page = null;
    p.slot = null;
  }

  const bookColor = BOOK_COLOR_TEXT[p.book];
  if (bookColor) {
    p.color_text = bookColor;
  } else if (COLOR_TEXT[p.color]) {
    p.color_text = COLOR_TEXT[p.color];
  } else if (p.special) {
    p.color_text = "其他";
  }

  return p;
}

// 把隐藏猪并入 pigsById + pigsByListKey (不触发庆祝弹窗)
export function mergeHiddenIntoMain() {
  for (const p of state.hiddenPigsById.values()) {
    state.pigsById.set(p.pNo, p);
    const atlas = p.atlas || {};
    if (atlas.type && atlas.index) {
      state.pigsByListKey.set(`${atlas.type}-${atlas.index}`, p.pNo);
    }
  }
}

// 集齐 186 主图鉴的判定 (彩蛋触发条件)
export function basePigPNos() {
  const out = [];
  for (const [pNo, pig] of state.pigsById) {
    if (pig.status !== "hidden") out.push(pNo);
  }
  return out;
}

export function checkAndUnlockHidden() {
  if (state.hiddenUnlocked) return false;
  if (!state.dataLoaded) return false;
  const base = basePigPNos();
  if (base.length === 0) return false;
  const ownedSet = new Set(state.collection);
  for (const pNo of base) {
    if (!ownedSet.has(pNo)) return false;
  }
  // 全集齐 → 解锁
  state.hiddenUnlocked = true;
  saveHiddenUnlocked(state.hiddenUnlocked);
  mergeHiddenIntoMain();
  buildBreedingIndex();
  showUnlockCelebration();
  return true;
}

// Reverse breeding index - 从独立的 breeding 表构建
export function buildBreedingIndex(breedingTable) {
  state.breedByParent = new Map();
  const seen = new Map();

  // 辅助函数：根据 pNo 查找猪对象
  function getPigByPNo(pNo) {
    return state.pigsById.get(pNo) || state.eventPigsById.get(pNo) || state.hiddenPigsById.get(pNo);
  }

  // 辅助函数：将 outcomes 中的 pNo 转换为 pigKind 对象
  function enrichOutcomes(outcomes) {
    return outcomes.map(o => {
      const pig = getPigByPNo(o.pNo);
      return {
        prob: o.prob,
        pigKind: pig ? {
          pNo: pig.pNo,
          name: pig.name,
          rare: pig.rare,
          special: pig.special,
          rent: pig.rent,
          bigWeight: pig.weight?.big,
          smallWeight: pig.weight?.small,
          color: pig.color
        } : { pNo: o.pNo }
      };
    });
  }

  function addEntry(pNo, entry) {
    const key = `${entry.partner ? entry.partner.pNo : "any"}-${entry.isview}-${entry.any ? 1 : 0}`;
    if (!seen.has(pNo)) seen.set(pNo, new Set());
    const s = seen.get(pNo);
    if (s.has(key)) return;
    s.add(key);
    if (!state.breedByParent.has(pNo)) state.breedByParent.set(pNo, []);
    state.breedByParent.get(pNo).push(entry);
  }

  for (const record of breedingTable || []) {
    const [p1, p2] = record.parents;
    const isAny = p2 === "*";
    const isview = record.visible ? 1 : -1;

    // 将 outcomes 转换为包含 pigKind 的格式
    const enrichedResults = enrichOutcomes(record.outcomes || []);

    // 查找父母猪的详细信息
    const p1Pig = getPigByPNo(p1);
    const p2Pig = isAny ? null : getPigByPNo(p2);

    const entry = {
      partner: isAny ? null : (p2Pig ? {
        pNo: p2Pig.pNo,
        name: p2Pig.name,
        rent: p2Pig.rent
      } : { pNo: p2 }),
      isview,
      any: isAny,
      result: enrichedResults
    };

    // p1 作为父母
    addEntry(p1, entry);

    // 如果不是 any，p2 也作为父母
    if (!isAny) {
      addEntry(p2, {
        partner: p1Pig ? {
          pNo: p1Pig.pNo,
          name: p1Pig.name,
          rent: p1Pig.rent
        } : { pNo: p1 },
        isview,
        any: false,
        result: enrichedResults
      });
    }
  }
}

// 获得方式推导 - 适配新数据结构
export function deriveAcquisitions(pig) {
  const groups = { shop: [], hunt: [], hunt_event: [], fail: [], feed_special: [] };
  const acq = pig.acquisition || {};

  // 商店
  const shop = acq.shop || [0, 0, 0];
  const costs = [1000, 500, 100], labels = ["A", "B", "C"];
  for (let i = 0; i < 3; i++) {
    if (shop[i] > 0) {
      groups.shop.push(`${labels[i]}级 ${costs[i]}pt  概率 ${(shop[i] * 100).toFixed(2)}%`);
    }
  }

  // 狩猎
  const hunt = acq.hunt || {};
  const sites = hunt.sites || [];
  const prob = hunt.prob || { any: {}, same: {} };
  const pickProb = (m, code) => {
    if (!m || typeof m !== "object") return null;
    return m[String(code)] != null ? m[String(code)] : m[code];
  };
  const hAny = prob.any || {}, hSame = prob.same || {};

  for (const code of sites) {
    if (code >= 3 && code <= 16) {
      const site = HUNT_SITES[code] || `siteid=${code}`;
      const a = pickProb(hAny, code), s = pickProb(hSame, code);
      const ex = (a || s) ? `  [任意 ${((a || 0) * 100).toFixed(2)}% / 按幼猪 ${((s || 0) * 100).toFixed(2)}%]` : "";
      groups.hunt.push(site + ex);
    } else if (code >= 81 && code <= 99) {
      const site = HUNT_SITES[code] || `siteid=${code}`;
      groups.hunt_event.push(site);
    }
  }

  // 养成失败来源（新结构只存 pNo）
  for (const pNo of acq.fail || []) {
    const failPig = state.pigsById.get(pNo) || state.eventPigsById.get(pNo);
    if (failPig) {
      groups.fail.push(`养成失败自 #${pNo} ${failPig.name}`);
    }
  }

  // 超分歧/超出世（新结构是布尔值）
  if (acq.specialFeeding) {
    groups.feed_special.push("有超分歧/超出世系条件 (详情见描述)");
  }

  return groups;
}

export function pigHasMethod(pig, method) {
  if (!method) return true;
  const g = deriveAcquisitions(pig);
  if (method === "breed") {
    // 检查是否有配种记录（从反向索引查）
    return state.breedByParent.has(pig.pNo);
  }
  return (g[method] || []).length > 0;
}

export function pigMatchesShopRank(pig, rank) {
  if (!rank) return true;
  const idx = rank === "A" ? 0 : rank === "B" ? 1 : rank === "C" ? 2 : -1;
  if (idx < 0) return true;
  const shop = pig.acquisition?.shop || [0, 0, 0];
  return (shop[idx] || 0) > 0;
}

export function pigMatchesHunt(pig, region, ticket) {
  if (!region && !ticket) return true;
  const sites = pig.acquisition?.hunt?.sites || [];
  for (const code of sites) {
    if (!(code >= 3 && code <= 16)) continue;
    if (region) {
      const pair = HUNT_REGION_CODES[region];
      if (!pair || pair.indexOf(code) < 0) continue;
    }
    if (ticket === "normal" && !HUNT_NORMAL_CODES.has(code)) continue;
    if (ticket === "rare" && !HUNT_RARE_CODES.has(code)) continue;
    return true;
  }
  return false;
}

// 加载数据 - 适配 v3 数据结构
export async function loadData() {
  const res = await fetch(DATA_URL_BY_LANG[currentLang()]);
  if (!res.ok) throw new Error("加载数据失败: " + res.status);
  const bundle = await res.json();
  if (!bundle || !Array.isArray(bundle.pigs)) throw new Error("数据格式错误");

  for (const raw of bundle.pigs) {
    const p = enrichPig(raw);

    // 用 status 字段判断，不再用硬编码常量
    if (p.status === "removed") continue;

    const atlas = p.atlas || {};
    if (p.status === "hidden") {
      state.hiddenPigsById.set(p.pNo, p);
      continue;
    }

    const isMain = atlas.type >= 1 && atlas.type <= 6 && atlas.visible;
    if (isMain) {
      state.pigsById.set(p.pNo, p);
      if (atlas.type && atlas.index) {
        state.pigsByListKey.set(`${atlas.type}-${atlas.index}`, p.pNo);
      }
    } else {
      state.eventPigsById.set(p.pNo, p);
    }
  }

  if (state.hiddenUnlocked) mergeHiddenIntoMain();

  // 从独立的 breeding 表构建索引
  state.breedingTable = bundle.breeding || [];
  buildBreedingIndex(state.breedingTable);

  state.dataLoaded = true;
  return bundle;
}

// 拥有/徽章操作
export function setPigOwned(pNo, owned) {
  const isEvent = !state.pigsById.has(pNo) && state.eventPigsById.has(pNo);
  if (isEvent) {
    if (owned) state.ownedEventPigs.add(pNo);
    else state.ownedEventPigs.delete(pNo);
    saveOwnedEventPigs(state.ownedEventPigs);
  } else {
    const i = state.collection.indexOf(pNo);
    if (owned && i < 0) state.collection.push(pNo);
    else if (!owned && i >= 0) state.collection.splice(i, 1);
    saveCollection(state.collection);
  }
  if (!owned) {
    if (state.smallBadges.has(pNo)) {
      state.smallBadges.delete(pNo);
      saveSmallBadges(state.smallBadges);
    }
    if (state.bigBadges.has(pNo)) {
      state.bigBadges.delete(pNo);
      saveBigBadges(state.bigBadges);
    }
  }
  if (owned && !isEvent) checkAndUnlockHidden();
}

export function setPigBadge(pNo, kind, on) {
  const set = kind === "small" ? state.smallBadges : state.bigBadges;
  if (on) set.add(pNo);
  else set.delete(pNo);
  if (kind === "small") saveSmallBadges(state.smallBadges);
  else saveBigBadges(state.bigBadges);
  if (on) {
    const isEvent = !state.pigsById.has(pNo) && state.eventPigsById.has(pNo);
    const alreadyOwned = isEvent
      ? state.ownedEventPigs.has(pNo)
      : state.collection.includes(pNo);
    if (!alreadyOwned) setPigOwned(pNo, true);
  }
}
