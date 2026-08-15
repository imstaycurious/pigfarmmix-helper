/**
 * 时间/时长格式化工具 (统一入口)
 *
 * raising-logic 与 auction 各自的时间格式化收敛到这里,
 * 避免重复实现。
 */

/** 时长 → "Xh Ym" / "Xm Ys" / "Xs" (倒计时用, ≤0 → "可喂食") */
export function formatDuration(ms: number): string {
  if (ms <= 0) return "可喂食";
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** 毫秒间隔 → "X 小时 Y 分钟" (喂食间隔用) */
export function formatIntervalMs(ms: number): string {
  const mins = Math.round(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h} 小时 ${m} 分钟`;
  if (h > 0) return `${h} 小时`;
  return `${m} 分钟`;
}

/** 时间戳 → "MM/DD HH:mm" (养成卡片用) */
export function formatDateTime(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString([], {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export interface CountdownResult {
  text: string;
  cls: string;
}

/**
 * 距目标时间戳的倒计时 + 紧迫级别 (拍卖场用)
 * cls: "" 正常 / "soon" 1小时内 / "urgent" 10分钟内或已结束
 */
export function formatCountdown(targetMs: number, now = Date.now()): CountdownResult {
  const diff = targetMs - now;
  if (diff <= 0) return { text: "已结束", cls: "urgent" };
  const sec = Math.floor(diff / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  let cls = "";
  if (sec < 600) cls = "urgent";
  else if (sec < 3600) cls = "soon";
  if (h > 0) return { text: `${h}h ${m}m`, cls };
  if (m > 0) return { text: `${m}m ${s}s`, cls };
  return { text: `${s}s`, cls };
}
