function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function badRequest(message) {
  return jsonResponse({ ok: false, error: message }, 400);
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function normalizeSubscription(raw) {
  if (!raw || typeof raw !== "object") return null;
  const endpoint = typeof raw.endpoint === "string" ? raw.endpoint : "";
  const keys = raw.keys && typeof raw.keys === "object" ? raw.keys : {};
  const p256dh = typeof keys.p256dh === "string" ? keys.p256dh : "";
  const auth = typeof keys.auth === "string" ? keys.auth : "";
  if (!endpoint || !p256dh || !auth) return null;
  return { endpoint, p256dh, auth };
}

function makeSubscriptionId(deviceId, endpoint) {
  return `${deviceId}:${endpoint}`;
}

export async function onRequestPost(context) {
  const db = context.env.DB;
  if (!db) return jsonResponse({ ok: false, error: "D1 binding DB is missing" }, 500);

  const body = await readJson(context.request);
  if (!body || typeof body !== "object") return badRequest("Invalid JSON body");

  const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : "";
  if (!deviceId || deviceId.length > 120) return badRequest("Invalid deviceId");

  const subscription = normalizeSubscription(body.subscription);
  if (!subscription) return badRequest("Invalid push subscription");

  const now = Date.now();
  const subscriptionId = makeSubscriptionId(deviceId, subscription.endpoint);

  await db.batch([
    db.prepare(`
      INSERT INTO devices (id, created_at, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at
    `).bind(deviceId, now, now),
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
