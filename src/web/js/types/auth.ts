/**
 * 账号与云同步类型
 */

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
