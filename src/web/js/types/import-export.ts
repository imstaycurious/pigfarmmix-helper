/**
 * 导入导出类型
 */

import type { RaisingItem, RaisingFloor } from "./state.js";

/** 导出备份 v4 */
export interface ExportPayload {
  type: string;
  version: number;
  exportedAt: string;
  owned186Pigs: number[];
  ownedEventPigs: number[];
  smallBadges: number[];
  bigBadges: number[];
  raisingPigs: RaisingItem[];
  raisingFloor?: RaisingFloor;
  hiddenUnlocked?: boolean;
}

/** 解析后的导入结果 */
export interface ParsedImport {
  collection: number[];
  ownedEventPigs: number[];
  smallBadges: number[];
  bigBadges: number[];
  raisingPigs: RaisingItem[];
  raisingFloor?: RaisingFloor;
  hiddenUnlocked?: boolean;
  source: "json" | "triplets";
  formatVersion: number;
  skipped?: number;
  err?: string;
}

/** 导入应用结果 */
export interface ImportApplyResult {
  addedColl: number;
  removedColl: number;
  addedOwned: number;
  removedOwned: number;
  addedSmall: number;
  removedSmall: number;
  addedBig: number;
  removedBig: number;
  addedRaising: number;
  removedRaising: number;
  unlocked: boolean;
}
