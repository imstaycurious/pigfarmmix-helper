/**
 * 配种相关类型
 */

import type { Pig } from "./pig.js";

/** 配种产出 */
export interface BreedingOutcome {
  pNo: number;
  prob: number;
}

/** 配种记录 (对应 D1 `breeding` 表) */
export interface BreedingRecord {
  /** 父母 pNo 列表 (1~2 个, 第 2 个可为 "*" 表示任意) */
  parents: (number | "*")[];
  /** 产出列表 */
  outcomes: BreedingOutcome[];
  /** 是否公开可见 */
  visible: boolean;
}

/** 数据包 (API / JSON 加载的顶层结构) */
export interface PigDataBundle {
  version: number;
  count: number;
  pigs: Pig[];
  breeding: BreedingRecord[];
}

/** 配种条目 (反向索引中的一条) */
export interface BreedingEntry {
  partner: { pNo: number; name?: string; rent?: number } | null;
  isview: number;
  any: boolean;
  result: BreedingResultKind[];
}

/** 配种结果 (带猪详情的产出) */
export interface BreedingResultKind {
  prob: number;
  pigKind: {
    pNo: number;
    name?: string;
    rare?: number;
    special?: boolean;
    rent?: number;
    bigWeight?: number;
    smallWeight?: number;
    color?: number;
    orderNo?: number;
  };
}
