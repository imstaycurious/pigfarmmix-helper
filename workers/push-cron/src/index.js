const DEFAULT_LIMIT = 100;
const DEFAULT_TTL_SECONDS = 3600;
const PAYLOAD_PADDING_BYTES = 0;

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

function concatBytes(...chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

async function hmacSha256(keyBytes, dataBytes) {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, dataBytes));
}

async function hkdf(ikm, salt, info, length) {
  const prk = await hmacSha256(salt, ikm);
  const blocks = [];
  let previous = new Uint8Array(0);
  let blockIndex = 1;
  let generated = 0;

  while (generated < length) {
    previous = await hmacSha256(prk, concatBytes(previous, info, new Uint8Array([blockIndex])));
    blocks.push(previous);
    generated += previous.length;
    blockIndex++;
  }

  return concatBytes(...blocks).slice(0, length);
}

async function importP256dh(publicKeyBytes) {
  if (publicKeyBytes.length !== 65 || publicKeyBytes[0] !== 4) {
    throw new Error("Invalid push subscription p256dh");
  }
  return crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x: bytesToBase64Url(publicKeyBytes.slice(1, 33)),
      y: bytesToBase64Url(publicKeyBytes.slice(33, 65)),
      ext: true,
    },
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
}

async function encryptPushPayload(subscription, payload) {
  const userPublicKey = base64UrlToBytes(subscription.p256dh);
  const authSecret = base64UrlToBytes(subscription.auth);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const localKeys = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const localPublicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", localKeys.publicKey));
  const remotePublicKey = await importP256dh(userPublicKey);
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "ECDH", public: remotePublicKey },
    localKeys.privateKey,
    256,
  ));

  const info = concatBytes(
    new TextEncoder().encode("WebPush: info\0"),
    userPublicKey,
    localPublicRaw,
  );
  const ikm = await hkdf(sharedSecret, authSecret, info, 32);
  const cek = await hkdf(ikm, salt, new TextEncoder().encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(ikm, salt, new TextEncoder().encode("Content-Encoding: nonce\0"), 12);
  const plaintext = concatBytes(
    new TextEncoder().encode(JSON.stringify(payload)),
    new Uint8Array(PAYLOAD_PADDING_BYTES),
    new Uint8Array([2]),
  );
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, tagLength: 128 },
    key,
    plaintext,
  ));
  const recordSize = new Uint8Array([0, 0, 16, 0]);
  const keyIdLength = new Uint8Array([localPublicRaw.length]);

  return concatBytes(salt, recordSize, keyIdLength, localPublicRaw, ciphertext);
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

async function sendPush(subscription, env, payload) {
  const authorization = await signVapidJwt(subscription.endpoint, env);
  const encryptedPayload = await encryptPushPayload(subscription, payload);
  return fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(DEFAULT_TTL_SECONDS),
      Urgency: "normal",
    },
    body: encryptedPayload,
  });
}

async function loadDueRecords(env) {
  const limit = Math.max(1, Math.min(
    Number.parseInt(env.CRON_LIMIT || DEFAULT_LIMIT, 10) || DEFAULT_LIMIT,
    500,
  ));
  const tableInfo = await env.DB.prepare("PRAGMA table_info(raising_records)").all();
  const hasPigName = (tableInfo.results || []).some(row => row.name === "pig_name");
  const pigNameSelect = hasPigName ? "r.pig_name" : "NULL AS pig_name";
  return env.DB.prepare(`
    SELECT
      r.id,
      r.device_id,
      r.p_no,
      ${pigNameSelect},
      r.next_feed_at,
      s.endpoint,
      s.p256dh,
      s.auth
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

function buildNotificationPayload(rows) {
  const names = rows.map(row => row.pig_name || `#${row.p_no}`).filter(Boolean);
  const uniqueNames = Array.from(new Set(names));
  const visibleNames = uniqueNames.slice(0, 3);
  const suffix = uniqueNames.length > visibleNames.length
    ? ` 等 ${uniqueNames.length} 只猪`
    : "";
  const body = visibleNames.length
    ? `${visibleNames.join("、")}${suffix} 可以喂食了`
    : "有猪可以喂食了";

  return {
    title: "又到了喂猪的时候了",
    body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: "raising-feed-due",
    data: { tab: "raising" },
  };
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
      const first = endpointRows[0];
      const subscription = {
        endpoint,
        p256dh: first.p256dh,
        auth: first.auth,
      };
      const res = await sendPush(subscription, env, buildNotificationPayload(endpointRows));
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
