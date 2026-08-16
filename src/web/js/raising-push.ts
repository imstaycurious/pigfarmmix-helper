/**
 * 养成中 — 推送通知 + 云端同步
 *
 * 独立模块,不依赖渲染层。通过 events.ts 监听 "raising-saved" 事件
 * 自动调度云端同步。
 */

import { state } from "./state.js";
import { toast } from "./utils.js";
import { RAISING_FLOORS, VAPID_PUBLIC_KEY } from "./constants.js";
import { loadPushEnabled, savePushEnabled } from "./storage.js";
import { on } from "./events.js";
import { getPigByPNo, getRaisingDueMs } from "./raising-logic.js";
import { getCurrentUser } from "./auth.js";

// ---------- 变量 ----------

let raisingPushEnabled = loadPushEnabled();
let raisingPushSyncTimer: ReturnType<typeof setTimeout> | null = null;
let raisingPushSyncInFlight: Promise<void> | null = null;
let raisingPushSyncPending = false;
let serviceWorkerReadyPromise: Promise<ServiceWorkerRegistration> | null = null;
let vapidPublicKeyPromise: Promise<string> | null = null;

/**
 * 推送标识 = 登录用户的 id (账号体系)。
 * 未登录返回空串, 调用方应跳过同步/订阅。
 */
function deviceId(): string {
  const user = getCurrentUser();
  return user ? user.id : "";
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function webPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function serviceWorkerReady(): Promise<ServiceWorkerRegistration> {
  if (!("serviceWorker" in navigator)) return Promise.reject(new Error("service worker unsupported"));
  if (!serviceWorkerReadyPromise) {
    serviceWorkerReadyPromise = navigator.serviceWorker.ready;
  }
  return serviceWorkerReadyPromise;
}

async function apiJson(path: string, body: unknown): Promise<Record<string, unknown>> {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(async res => {
    let data: Record<string, unknown> | null = null;
    try { data = await res.json(); } catch { /* ignore */ }
    if (!res.ok || (data && data.ok === false)) {
      const msg = data && data.error ? String(data.error) : `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data || {};
  });
}

interface RaisingCloudRecord {
  id: string; pNo: number; pigName: string; floor: string;
  startedAt: number; lastFedAt: number; feedCount: number;
  nextFeedAt: number; notifiedNextFeedAt: number | null;
}

function buildRaisingCloudRecords(): RaisingCloudRecord[] {
  if (!state.dataLoaded) return [];
  return state.raisingPigs
    .map(item => {
      if (item.status === "waiting" || item.pausedAt) return null;
      const pig = getPigByPNo(item.pNo);
      if (!pig) return null;
      const floor: string = RAISING_FLOORS[state.raisingFloor] ? state.raisingFloor : "normal";
      return {
        id: String(item.id),
        pNo: item.pNo,
        pigName: pig.name || "",
        floor,
        startedAt: Number(item.startedAt) || Date.now(),
        lastFedAt: Number(item.lastFedAt) || Date.now(),
        feedCount: Math.max(0, Number.parseInt(String(item.feedCount || 0), 10) || 0),
        nextFeedAt: getRaisingDueMs(item, pig),
        notifiedNextFeedAt: item.notifiedAt || null,
      };
    })
    .filter((x): x is RaisingCloudRecord => x !== null);
}

async function syncRaisingRecordsToCloud({ silent = true }: { silent?: boolean } = {}): Promise<void> {
  if (!raisingPushEnabled || !state.dataLoaded) return;
  const did = deviceId();
  // 未登录: 不同步 (养成记录绑定账号)
  if (!did) return;
  if (raisingPushSyncInFlight) {
    raisingPushSyncPending = true;
    return raisingPushSyncInFlight;
  }

  raisingPushSyncPending = false;
  const payload = {
    deviceId: did,
    floor: RAISING_FLOORS[state.raisingFloor] ? state.raisingFloor : "normal",
    records: buildRaisingCloudRecords(),
  };

  raisingPushSyncInFlight = apiJson("/api/raising-sync", payload)
    .then(() => {
      if (!silent) toast("后台提醒数据已同步");
    })
    .catch(err => {
      console.warn("[raising] cloud sync failed:", err);
      if (!silent) toast(`后台提醒同步失败: ${err instanceof Error ? err.message : String(err)}`);
    })
    .finally(() => {
      raisingPushSyncInFlight = null;
      if (raisingPushSyncPending) {
        raisingPushSyncPending = false;
        scheduleRaisingPushSync(0);
      }
    });
  return raisingPushSyncInFlight;
}

function scheduleRaisingPushSync(delay = 500): void {
  if (!raisingPushEnabled || !state.dataLoaded) return;
  if (raisingPushSyncTimer) clearTimeout(raisingPushSyncTimer);
  raisingPushSyncTimer = setTimeout(() => {
    syncRaisingRecordsToCloud({ silent: true });
  }, delay);
}

async function getVapidPublicKey(): Promise<string> {
  if (VAPID_PUBLIC_KEY) return VAPID_PUBLIC_KEY;
  if (!vapidPublicKeyPromise) {
    vapidPublicKeyPromise = fetch("/api/push-config")
      .then(async res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as { publicKey?: string };
        return data && data.publicKey ? String(data.publicKey) : "";
      })
      .catch(err => {
        console.warn("[raising] VAPID config failed:", err);
        return "";
      });
  }
  return vapidPublicKeyPromise;
}

function classifyPushError(err: unknown): { type: string; message: string; canRetry: boolean } {
  const msg = err instanceof Error ? String(err.message) : String(err);
  const lower = msg.toLowerCase();
  if (lower.includes("push service") || lower.includes("registration failed") || lower.includes("not subscribed")) {
    return { type: "push-service", message: "浏览器推送服务不可用(可能是夸克/UC/QQ 等浏览器,或无法连接 Google FCM)", canRetry: true };
  }
  if (lower.includes("permission") || lower.includes("denied") || lower.includes("not allowed")) {
    return { type: "permission", message: "通知权限被浏览器或系统拒绝", canRetry: false };
  }
  if (lower.includes("network") || lower.includes("fetch") || lower.includes("internet") || lower.includes("abort")) {
    return { type: "network", message: "网络连接失败,无法连接推送服务器", canRetry: true };
  }
  if (lower.includes("vapid") || lower.includes("application server key") || lower.includes("invalid key")) {
    return { type: "vapid", message: "推送服务配置错误(VAPID 公钥无效)", canRetry: false };
  }
  return { type: "unknown", message: msg || "未知错误", canRetry: true };
}

async function subscribeRaisingPush(): Promise<PushSubscription> {
  if (!webPushSupported()) {
    throw new Error("当前浏览器不支持后台推送");
  }
  const did = deviceId();
  // 未登录: 推送绑定账号, 必须先登录
  if (!did) {
    throw new Error("请先登录后再开启后台提醒");
  }
  const publicKey = await getVapidPublicKey();
  if (!publicKey) {
    throw new Error("还没有配置 VAPID_PUBLIC_KEY");
  }
  const reg = await serviceWorkerReady();
  let subscription = await reg.pushManager.getSubscription();
  if (subscription) {
    try {
      await subscription.unsubscribe();
    } catch (err) {
      console.warn("[raising] failed to unsubscribe old push subscription:", err);
    }
    subscription = null;
  }
  try {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
    });
  } catch (err) {
    const classified = classifyPushError(err);
    const wrapped = new Error(classified.message);
    (wrapped as Error & { type?: string; canRetry?: boolean; original?: unknown }).type = classified.type;
    (wrapped as Error & { canRetry?: boolean }).canRetry = classified.canRetry;
    (wrapped as Error & { original?: unknown }).original = err;
    throw wrapped;
  }
  await apiJson("/api/push-subscribe", {
    deviceId: did,
    subscription: subscription.toJSON(),
  });
  raisingPushEnabled = true;
  savePushEnabled(true);
  await syncRaisingRecordsToCloud({ silent: true });
  return subscription;
}

function pushSubscribeErrorToast(err: unknown): void {
  const classified = err instanceof Error && (err as Error & { type?: string }).type
    ? err as Error & { type: string; canRetry?: boolean }
    : classifyPushError(err);
  const suffix = classified.canRetry ? ",可刷新页面后重试" : "";
  toast(`${classified.message}${suffix}`, 4000);
}

/** 获取推送启用状态 (供渲染层更新按钮文字) */
export function getRaisingPushEnabled(): boolean {
  return raisingPushEnabled;
}

function notificationsSupported(): boolean {
  return "Notification" in window;
}

/** 请求通知权限 + 订阅推送 */
export async function requestRaisingNotificationPermission(): Promise<void> {
  if (!notificationsSupported()) {
    toast("当前浏览器不支持系统通知");
    return;
  }
  if (Notification.permission === "granted") {
    if (!raisingPushEnabled) {
      try {
        await subscribeRaisingPush();
        toast("后台提醒已开启");
      } catch (err) {
        console.warn("[raising] push subscribe failed:", err);
        pushSubscribeErrorToast(err);
      }
    } else {
      syncRaisingRecordsToCloud({ silent: true });
      toast("提醒已经开启");
    }
    return;
  }
  if (Notification.permission === "denied") {
    toast("提醒权限已被浏览器拒绝");
    return;
  }
  const permission = await Notification.requestPermission();
  toast(permission === "granted" ? "提醒已开启" : "没有开启提醒权限");
  if (permission === "granted") {
    try {
      await subscribeRaisingPush();
      toast("后台提醒已开启");
    } catch (err) {
      console.warn("[raising] push subscribe failed:", err);
      pushSubscribeErrorToast(err);
    }
    // 重置到期提醒
    const { resetDueNotifications } = await import("./raising-logic.js");
    resetDueNotifications();
  }
}

// ---------- 初始化 (监听事件) ----------

let initialized = false;
export function initRaisingPush(): void {
  if (initialized) return;
  initialized = true;

  // 监听 "raising-saved" → 调度云端同步
  on("raising-saved", () => {
    scheduleRaisingPushSync();
  });
}
