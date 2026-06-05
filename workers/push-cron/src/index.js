const DEFAULT_LIMIT = 100;
const DEFAULT_TTL_SECONDS = 3600;

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function bytesToBase64Url(bytes) {
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function textToBase64Url(value) {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

function publicKeyToJwk(publicKey, privateKey) {
  const bytes = base64UrlToBytes(publicKey);
  if (bytes.length !== 65 || bytes[0] !== 4) {
    throw new Error("Invalid VAPID_PUBLIC_KEY");
  }
  return {
    kty: "EC",
    crv: "P-256",
    x: bytesToBase64Url(bytes.slice(1, 33)),
    y: bytesToBase64Url(bytes.slice(33, 65)),
    d: privateKey,
    ext: false,
  };
}

async function signVapidJwt(endpoint, env) {
  const publicKey = env.VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error("VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY is missing");
  }

  const audience = new URL(endpoint).origin;
  const subject = env.VAPID_SUBJECT || "mailto:admin@example.com";
  const exp = Math.floor(Date.now() / 1000) + 12 * 60 * 60;
  const header = { typ: "JWT", alg: "ES256" };
  const payload = { aud: audience, exp, sub: subject };
  const unsigned = `${textToBase64Url(JSON.stringify(header))}.${textToBase64Url(JSON.stringify(payload))}`;

  const key = await crypto.subtle.importKey(
    "jwk",
    publicKeyToJwk(publicKey, privateKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(unsigned),
  ));
  return `vapid t=${unsigned}.${bytesToBase64Url(signature)}, k=${publicKey}`;
}

async function sendPush(endpoint, env) {
  const authorization = await signVapidJwt(endpoint, env);
  return fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: authorization,
      TTL: String(DEFAULT_TTL_SECONDS),
      Urgency: "normal",
    },
  });
}

async function loadDueRecords(env) {
  const limit = Math.max(1, Math.min(
    Number.parseInt(env.CRON_LIMIT || DEFAULT_LIMIT, 10) || DEFAULT_LIMIT,
    500,
  ));
  return env.DB.prepare(`
    SELECT
      r.id,
      r.device_id,
      r.p_no,
      r.next_feed_at,
      s.endpoint
    FROM raising_records r
    INNER JOIN push_subscriptions s ON s.device_id = r.device_id
    WHERE r.next_feed_at <= ?
      AND (r.notified_next_feed_at IS NULL OR r.notified_next_feed_at != r.next_feed_at)
    ORDER BY r.next_feed_at ASC
    LIMIT ?
  `).bind(Date.now(), limit).all();
}

function groupByEndpoint(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!row.endpoint) continue;
    if (!groups.has(row.endpoint)) groups.set(row.endpoint, []);
    groups.get(row.endpoint).push(row);
  }
  return groups;
}

async function markRowsNotified(env, rows) {
  const now = Date.now();
  await env.DB.batch(rows.map(row =>
    env.DB.prepare(`
      UPDATE raising_records
      SET notified_next_feed_at = next_feed_at,
          updated_at = ?
      WHERE id = ?
    `).bind(now, row.id)
  ));
}

async function deleteSubscription(env, endpoint) {
  await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(endpoint).run();
}

async function runReminderCron(env) {
  if (!env.DB) throw new Error("D1 binding DB is missing");

  const result = await loadDueRecords(env);
  const rows = result.results || [];
  const groups = groupByEndpoint(rows);
  const summary = {
    dueRows: rows.length,
    endpoints: groups.size,
    sent: 0,
    expired: 0,
    failed: 0,
    marked: 0,
  };

  for (const [endpoint, endpointRows] of groups) {
    try {
      const res = await sendPush(endpoint, env);
      if (res.status === 404 || res.status === 410) {
        await deleteSubscription(env, endpoint);
        summary.expired++;
        continue;
      }
      if (!res.ok) {
        summary.failed++;
        console.warn("[push-cron] push failed", res.status, await res.text());
        continue;
      }
      await markRowsNotified(env, endpointRows);
      summary.sent++;
      summary.marked += endpointRows.length;
    } catch (err) {
      summary.failed++;
      console.warn("[push-cron] push error", err);
    }
  }

  return summary;
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runReminderCron(env));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/run") {
      const token = env.CRON_TEST_TOKEN || "";
      if (token && request.headers.get("Authorization") !== `Bearer ${token}`) {
        return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
      }
      const summary = await runReminderCron(env);
      return jsonResponse({ ok: true, summary });
    }
    return jsonResponse({ ok: true, service: "pigfarmmix-push-cron" });
  },
};
