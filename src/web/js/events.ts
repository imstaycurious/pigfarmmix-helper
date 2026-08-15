/**
 * 类型安全事件总线
 *
 * 替代 runtime.ts 回调注册表,解决模块间的循环依赖:
 *   - drawer ↔ raising 互相调用 (showDetail / addRaisingPig)
 *   - import-export 通知 UI 刷新
 *   - cards/drawer 通知拥有状态变化
 *
 * 事件发射是同步的,handler 按注册顺序执行。类型由 PayloadMap 约束,
 * 写错事件名或载荷类型会在编译期报错。
 */

export type RaisingStatus = "active" | "waiting";

export interface AddRaisingPayload {
  pNo: number;
  status?: RaisingStatus;
}

/** 事件名 → 载荷类型映射 */
export interface AppEvents {
  /** 打开抽屉详情 (payload: pNo) */
  "show-detail": number;
  /** 加入养成 (payload: { pNo, status? }) */
  "add-raising": AddRaisingPayload;
  /** 收藏/数据变化 → 全量刷新 UI */
  "ui-refresh": void;
  /** 单猪拥有/徽章变化 → 定点刷新 (payload: pNo) */
  "owned-changed": number;
  /** 养成数据变化 → 保存 + 刷新养成相关 UI */
  "raising-updated": void;
  /** 养成数据已保存 → 调度云端同步 (由 raising-push 监听) */
  "raising-saved": void;
  /** 倒计时 tick (每秒) */
  "raising-tick": void;
}

type Handler<K extends keyof AppEvents> = (payload: AppEvents[K]) => void;

const handlers = new Map<keyof AppEvents, Set<(payload: never) => void>>();

/** 注册事件监听,返回取消函数 */
export function on<K extends keyof AppEvents>(event: K, handler: Handler<K>): () => void {
  let set = handlers.get(event);
  if (!set) {
    set = new Set();
    handlers.set(event, set);
  }
  set.add(handler as (payload: never) => void);
  return () => set!.delete(handler as (payload: never) => void);
}

/** 发射事件 (同步) */
export function emit<K extends keyof AppEvents>(event: K, payload: AppEvents[K]): void {
  const set = handlers.get(event);
  if (!set) return;
  for (const handler of set) {
    try {
      (handler as Handler<K>)(payload);
    } catch (err) {
      console.error(`[events] handler for "${event}" failed:`, err);
    }
  }
}
