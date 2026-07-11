/**
 * 全局状态管理
 */

import {
  loadCollection,
  loadOwnedEventPigs,
  loadBadgeSet,
  loadHiddenUnlocked,
  loadRaisingPigs,
  loadRaisingFloor,
} from './storage.js';
import { STORAGE_KEY_BADGE_SMALL, STORAGE_KEY_BADGE_BIG } from './constants.js';

export const state = {
  dataLoaded: false,
  pigsById: new Map(),           // pNo -> pig detail (186 只, 进入全图鉴)
  eventPigsById: new Map(),      // pNo -> 活动猪详情 (仅用于反向配种索引 + 抽屉产出显示)
  pigsByListKey: new Map(),      // `${book}-${listno}` -> pNo
  collection: loadCollection(),  // array of pNo
  ownedSet: new Set(loadCollection()), // 与 collection 同步的成员判断镜像 (O(1) has)，由 refreshOwnedSet 维护
  ownedEventPigs: loadOwnedEventPigs(), // Set<pNo>, 仅针对活动猪
  smallBadges: loadBadgeSet(STORAGE_KEY_BADGE_SMALL), // Set<pNo>, 已拿过小章
  bigBadges: loadBadgeSet(STORAGE_KEY_BADGE_BIG),   // Set<pNo>, 已拿过大章
  raisingPigs: loadRaisingPigs(),      // [{ id, pNo, startedAt, lastFedAt, notifiedAt, feedCount }]
  raisingFloor: loadRaisingFloor(),    // woodchip | normal | straw
  hiddenUnlocked: loadHiddenUnlocked(),  // 集齐 186 触发的彩蛋图鉴是否已解锁
  hiddenPigsById: new Map(),              // 隐藏猪的完整数据 (4 只), 解锁后并入 pigsById
  atlasFilter: { color: "", rare: "", method: "", q: "", huntRegion: "", huntTicket: "", shopRank: "", graze: "", picky: "" }, // 186图鉴 tab
  eventFilter: { color: "", rare: "", q: "", graze: "", picky: "" }, // Events图鉴 tab
  // 我的 tab 有两层导航: mineView = "menu" | "main" | "event" | "add"
  // 主/活动子视图共享 mineFilter; 子视图决定数据源 (186 vs 活动)
  mineView: "menu",
  mineFilter: { owned: "", small: "", big: "", q: "", color: "", rare: "" },
  // 配种索引 (反向索引: 某猪作为父母时能产出哪些后代)
  breedByParent: new Map(), // pNo -> [{ partner, isview, any, result }, ...]
  breedingTable: [],        // 原始配种表 (从 JSON 加载)
};
