/**
 * 全局状态与筛选类型
 */

import type { Pig } from "./pig.js";
import type { BreedingEntry, BreedingRecord } from "./breeding.js";

/** 养成中猪的条目 */
export interface RaisingItem {
  id: string;
  pNo: number;
  startedAt: number;
  lastFedAt: number;
  /** 上次提醒时间戳 (0 = 未提醒) */
  notifiedAt: number;
  /** 已喂次数 */
  feedCount: number;
  /** 晚安药暂停时间戳 (0 = 未暂停) */
  pausedAt: number;
  /** active = 正在养成; waiting = 等待进货中 */
  status: "active" | "waiting";
}

/** 地板类型 */
export type RaisingFloor = "woodchip" | "normal" | "straw";

/** 全局筛选状态 (186图鉴 tab) */
export interface AtlasFilter {
  color: string;
  rare: string;
  method: string;
  q: string;
  huntRegion: string;
  huntTicket: string;
  shopRank: string;
  graze: string;
  picky: string;
  /** 我的收藏: yes / no / no_small / no_big */
  own: string;
}

/** 全局筛选状态 (Events tab) */
export interface EventFilter {
  color: string;
  rare: string;
  q: string;
  graze: string;
  picky: string;
  /** 我的收藏: yes / no / no_small / no_big */
  own: string;
}

/** 我的 tab 子视图 */
export type MineView = "menu" | "add" | "about" | "progress" | "data";

/** 全局状态 */
export interface AppState {
  dataLoaded: boolean;
  /** pNo -> 主图鉴猪 (186) */
  pigsById: Map<number, Pig>;
  /** pNo -> 活动猪 */
  eventPigsById: Map<number, Pig>;
  /** `${book}-${listno}` -> pNo */
  pigsByListKey: Map<string, number>;
  /** 已拥有 pNo 列表 */
  collection: number[];
  /** collection 的 O(1) 镜像 Set */
  ownedSet: Set<number>;
  /** 已拥有活动猪 */
  ownedEventPigs: Set<number>;
  /** 已拿小章 */
  smallBadges: Set<number>;
  /** 已拿大章 */
  bigBadges: Set<number>;
  /** 养成中 */
  raisingPigs: RaisingItem[];
  raisingFloor: RaisingFloor;
  /** 隐藏图鉴是否解锁 */
  hiddenUnlocked: boolean;
  /** 隐藏猪 (4只, 解锁后并入 pigsById) */
  hiddenPigsById: Map<number, Pig>;
  atlasFilter: AtlasFilter;
  eventFilter: EventFilter;
  mineView: MineView;
  /** 反向配种索引: pNo -> 以它为父母的配种记录 */
  breedByParent: Map<number, BreedingEntry[]>;
  /** 原始配种表 */
  breedingTable: BreedingRecord[];
}
