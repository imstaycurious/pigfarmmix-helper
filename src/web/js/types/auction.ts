/**
 * 拍卖场类型
 */

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
