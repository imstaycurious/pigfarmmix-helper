/**
 * 常量定义
 */

export const STORAGE_KEY = "pig_collection_v1";
export const STORAGE_KEY_OWNED_EVENT = "pig_owned_event_v1";
export const STORAGE_KEY_BADGE_SMALL = "pig_badge_small_v1";
export const STORAGE_KEY_BADGE_BIG = "pig_badge_big_v1";
export const STORAGE_KEY_HIDDEN_UNLOCK = "pig_hidden_unlocked_v1";
export const STORAGE_KEY_RAISING = "pig_raising_v1";
export const STORAGE_KEY_RAISING_FLOOR = "pig_raising_floor_v1";
export const STORAGE_KEY_DEVICE_ID = "pig_device_id_v1";
export const STORAGE_KEY_PUSH_ENABLED = "pig_push_enabled_v1";
export const LANG_KEY = "lang_v1";

// Web Push 的 VAPID public key。生成 VAPID keys 后把 public key 填到这里。
// private key 只放 Cloudflare Pages/Worker 环境变量，不能写进前端代码。
export const VAPID_PUBLIC_KEY = "";

export const DATA_URL_BY_LANG = {
  zhs: "/data/pigs_full_zhs.json",
  zht: "/data/pigs_full.json",
};

export const IMG_BASE = "/img/pigs/";

export const METHOD_LABELS = {
  shop: "商店进货",
  hunt: "狩猎",
  hunt_event: "活动狩猎",
  breed: "配种",
  fail: "养成失败",
  feed_special: "超分歧/超出世",
};

export const HUNT_SITES = {
  3: "草原 (普通券)", 4: "山林 (普通券)",
  5: "草原 (稀有券)", 6: "山林 (稀有券)",
  7: "日本 (普通券)", 8: "日本 (稀有券)",
  9: "亚洲 (普通券)", 10: "亚洲 (稀有券)",
  11: "欧洲 (普通券)", 12: "欧洲 (稀有券)",
  13: "美洲和西印度群岛 (普通券)", 14: "美洲和西印度群岛 (稀有券)",
  15: "大洋洲 (普通券)", 16: "大洋洲 (稀有券)",
  81: "特别活动狩猎 一月", 82: "特别活动狩猎 二月",
  83: "特别活动狩猎 三月", 84: "特别活动狩猎 四月",
  85: "特别活动狩猎 五月", 86: "特别活动狩猎 六月",
  87: "特别活动狩猎 七月", 88: "特别活动狩猎 八月",
  89: "特别活动狩猎 九月", 90: "特别活动狩猎 十月",
  91: "特别活动狩猎 十一月", 92: "特别活动狩猎 十二月",
  98: "特别活动狩猎", 99: "特别活动狩猎",
};

export const HUNT_REGION_CODES = {
  "草原": [3, 5],
  "山林": [4, 6],
  "日本": [7, 8],
  "亚洲": [9, 10],
  "欧洲": [11, 12],
  "美洲": [13, 14],
  "大洋洲": [15, 16],
};

export const HUNT_NORMAL_CODES = new Set([3, 4, 7, 9, 11, 13, 15]);
export const HUNT_RARE_CODES = new Set([5, 6, 8, 10, 12, 14, 16]);

export const FEED_LABELS = {
  1: "杂粮",
  2: "素食MIX",
  3: "红薯",
  4: "玉米",
  5: "草本饲料",
  6: "橡子",
  7: "高级MIX",
  8: "松露",
};

export const BOOK_COLOR_TEXT = {
  1: "肉色",
  2: "灰色",
  3: "米色",
  4: "粉红",
  5: "白色",
  6: "其他",
};

export const COLOR_TEXT = {
  1: "肉色", 2: "灰色", 3: "米色", 4: "粉红", 5: "白色", 6: "其他",
};

export const BLEED_TYPE_TEXT = {
  1: "猪猪广场交配",
  0: "猪猪广场交配 [不能租借公猪]",
  "-1": "猪猪广场交配 [隐藏, 不能租借公猪]",
  3: "系统图交换所",
  4: "系统图交换所 [不能租借公猪]",
  "-3": "系统图交换所 (未开放)",
  "-4": "系统图交换所 [不能租借公猪] (未开放)",
  2: "活动限定系统图 [现时无法获得]",
};

export const COLOR_ORDER_PROG = ["肉色", "灰色", "米色", "粉红", "白色", "其他"];

export const COLOR_DOT_PROG = {
  "肉色": "#ffcba4",
  "灰色": "#9e9e9e",
  "米色": "#a0522d",
  "粉红": "#ffb6c1",
  "白色": "#ffffff",
  "其他": "#8b4513",
};

export const WEIGHT_OFFSET_BASE = 120;

export const RAISING_FLOORS = {
  woodchip: { label: "木屑地板", multiplier: 0.8 },
  normal: { label: "普通地板", multiplier: 1 },
  straw: { label: "稻草地板", multiplier: 1.2 },
};
