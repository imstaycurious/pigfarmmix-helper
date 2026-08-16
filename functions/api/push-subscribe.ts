/**
 * Cloudflare Pages Function: 推送订阅
 * POST /api/push-subscribe — 保存设备的 push subscription
 */

import { jsonResponse, badRequest, readJson } from "./_utils.ts";

interface Env {
  DB: D1Database;
}

interface PushSubscriptionRaw {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
}

interface NormalizedSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

function normalizeSubscription(raw: unknown): NormalizedSubscription | null {
  if (!raw || typeof raw !== "object") return null;
  const sub = raw as PushSubscriptionRaw;
  const endpoint = typeof sub.endpoint === "string" ? sub.endpoint : "";
  const keys = sub.keys && typeof sub.keys === "object" ? sub.keys : {};
  const p256dh = typeof keys.p256dh === "string" ? keys.p256dh : "";
  const auth = typeof keys.auth === "string" ? keys.auth : "";
  if (!endpoint || !p256dh || !auth) return null;
  return { endpoint, p256dh, auth };
}

function makeSubscriptionId(deviceId: string, endpoint: string): string {
  return `${deviceId}:${endpoint}`;
}

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const db = context.env.DB;
  if (!db) return jsonResponse({ ok: false, error: "D1 binding DB is missing" }, 500);

  const body = await readJson(context.request);
  if (!body) return badRequest("Invalid JSON body");

  const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : "";
  if (!deviceId || deviceId.length > 120) return badRequest("Invalid deviceId");

  const subscription = normalizeSubscription(body.subscription);
  if (!subscription) return badRequest("Invalid push subscription");

  const now = Date.now();
  const subscriptionId = makeSubscriptionId(deviceId, subscription.endpoint);

  await db.batch([
    db.prepare(`
      INSERT INTO push_subscriptions (id, device_id, endpoint, p256dh, auth, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET
        id = excluded.id,
        device_id = excluded.device_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        updated_at = excluded.updated_at
    `).bind(subscriptionId, deviceId, subscription.endpoint, subscription.p256dh, subscription.auth, now, now),
  ]);

  return jsonResponse({ ok: true });
}
