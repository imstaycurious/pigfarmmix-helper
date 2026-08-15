/**
 * 养猪场mix图鉴助手 — 领域类型定义
 */

// ---------- 猪基础信息 ----------

/** 图鉴三元组位置 */
export interface AtlasPosition {
  /** 图鉴号 1~7 (7 = Events/活动) */
  type: number;
  /** 页内序号 (1-based, 每页 6 格) */
  index: number;
  /** 是否在对应图鉴中可见 */
  visible: boolean;
}

/** 体重阈值 (小章/大章) */
export interface PigWeights {
  small: number;
  big: number;
}

/** 喂食信息 */
export interface PigFeeding {
  /** 喂食间隔 (小时) */
  interval?: number;
  /** 最少喂食次数 */
  times?: number;
  /** 挑食食材 ID 列表 */
  picky?: number[];
}

/** 配种指南 */
export interface BreedingGuide {
  requirements?: string;
  tips?: string | null;
}

/** 获取途径 */
export interface PigAcquisition {
  /** 商店等级概率 [A, B, C], 值为概率 (0~1) */
  shop?: number[];
  /** 狩猎 */
  hunt?: {
    /** 狩猎场 site id 列表 */
    sites?: number[];
    /** 概率 { any: {siteId: prob}, same: {siteId: prob} } */
    prob?: {
      any?: Record<string, number>;
      same?: Record<string, number>;
    };
  };
  /** 养成失败来源 pNo 列表 */
  fail?: number[];
  /** 超分歧/超出世 */
  specialFeeding?: boolean;
}

/** 猪的状态 */
export type PigStatus = "normal" | "hidden" | "removed";

/** 挑食程度 */
export type PickyLevel = "none" | "some" | "picky";

/** 猪基础信息 (对应 D1 `pigs` 表) */
export interface Pig {
  /** 猪的编号 (主键) */
  pNo: number;
  /** 名称 */
  name: string;
  /** 星级 1~6 */
  rare: number;
  /** 颜色代码 1~6 */
  color: number;
  /** 颜色文本 (由 book 或 color 推导) */
  color_text?: string;
  /** 描述 */
  description?: string;
  /** 图鉴位置 */
  atlas?: AtlasPosition;
  /** 推导出的图鉴号 (1~7) */
  book?: number;
  /** 推导出的页码 */
  page?: number | null;
  /** 推导出的格号 */
  slot?: number | null;
  /** 小章/大章阈值 */
  weight?: PigWeights;
  /** 借猪费用 */
  rent?: number;
  /** 售价 */
  price?: number;
  /** 成猪寿命 (小时) */
  lifespan?: number;
  /** 是否放牧 */
  graze?: boolean;
  /** 是否放牧 (isExer 别名) */
  isExer?: boolean;
  /** 是否特殊猪 (6星/超稀有) */
  special?: boolean;
  /** 状态: normal / hidden / removed */
  status?: PigStatus;
  /** 获取途径 */
  acquisition?: PigAcquisition;
  /** 喂食信息 */
  feeding?: PigFeeding;
  /** 配种指南 */
  breedingGuide?: BreedingGuide;
  /** 提示列表 */
  hints?: string[];
}

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

// ---------- 用户收藏状态 ----------

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
}

/** 全局筛选状态 (Events tab) */
export interface EventFilter {
  color: string;
  rare: string;
  q: string;
  graze: string;
  picky: string;
}

/** 我的 tab 筛选 */
export interface MineFilter {
  owned: string;
  small: string;
  big: string;
  q: string;
  color: string;
  rare: string;
}

/** 我的 tab 子视图 */
export type MineView = "menu" | "main" | "event" | "add" | "about" | "progress";

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
  mineFilter: MineFilter;
  /** 反向配种索引: pNo -> 以它为父母的配种记录 */
  breedByParent: Map<number, BreedingEntry[]>;
  /** 原始配种表 */
  breedingTable: BreedingRecord[];
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

// ---------- 拍卖场 ----------

/** 拍卖场一条记录 (上游 API 响应) */
export interface AuctionRecord {
  bType: number;
  pigNo: number;
  ownername: string;
  nowPrice: number;
  limitdate: string;
  weight: number;
  foodtype: number;
  isExer: boolean;
  bidcount: number;
  pigletOrSex: number;
  rare: number;
}

/** 拍卖场筛选 */
export interface AuctionFilter {
  color: string;
  rare: string;
  isExer: string;
  foodtype: string;
  sex: string;
  sort: string;
  own: string;
}

/** 拍卖场状态 */
export interface AuctionState {
  loading: boolean;
  loadingMore: boolean;
  records: AuctionRecord[];
  error: string | null;
  fetchedAt: number | null;
  hasSearched: boolean;
  count: number;
  atEnd: boolean;
  server: "tw" | "jp";
}

// ---------- 账号 / 云同步 ----------

/** 用户信息 */
export interface User {
  id: string;
  nickname: string;
  deviceCode: string;
  createdAt?: number;
  lastSyncAt?: number;
}

/** 云同步的收藏数据 */
export interface CloudCollectionData {
  collection: number[];
  eventPigs: number[];
  smallBadges: number[];
  bigBadges: number[];
}

/** 同步结果 */
export interface SyncResult {
  ok: boolean;
  error?: string;
  winner?: "local" | "cloud";
  cloudData?: CloudCollectionData;
  dataModifiedAt?: number;
  lastSyncAt?: number;
  merged?: { collection: number; eventPigs: number; smallBadges: number; bigBadges: number };
  user?: User;
}

// ---------- 导入导出 ----------

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

// ---------- 索引/常量 ----------

/** 图鉴颜色 */
export type BookColor = 1 | 2 | 3 | 4 | 5 | 6;

/** 获得方式 */
export type AcquireMethod = "shop" | "hunt" | "hunt_event" | "breed" | "fail" | "feed_special";
