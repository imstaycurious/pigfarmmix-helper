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

function toInt(value, fallback = 0) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function cleanFloor(value) {
  return value === "woodchip" || value === "straw" || value === "normal" ? value : "normal";
}

function cleanRecord(raw, deviceId, fallbackFloor) {
  if (!raw || typeof raw !== "object") return null;
  const localId = typeof raw.id === "string" ? raw.id.trim() : "";
  const pNo = toInt(raw.pNo);
  if (!localId || localId.length > 120 || !Number.isInteger(pNo) || pNo <= 0) return null;

  const now = Date.now();
  const startedAt = Math.max(0, toInt(raw.startedAt, now));
  const lastFedAt = Math.max(0, toInt(raw.lastFedAt, now));
  const feedCount = Math.max(0, toInt(raw.feedCount, 0));
  const nextFeedAt = Math.max(0, toInt(raw.nextFeedAt, lastFedAt));
  const notifiedNextFeedAt = raw.notifiedNextFeedAt ? Math.max(0, toInt(raw.notifiedNextFeedAt, 0)) : null;

  return {
    id: `${deviceId}:${localId}`,
    deviceId,
    pNo,
    floor: cleanFloor(raw.floor || fallbackFloor),
    startedAt,
    lastFedAt,
    feedCount,
    nextFeedAt,
    notifiedNextFeedAt,
  };
}

export async function onRequestPost(context) {
  const db = context.env.DB;
  if (!db) return jsonResponse({ ok: false, error: "D1 binding DB is missing" }, 500);

  const body = await readJson(context.request);
  if (!body || typeof body !== "object") return badRequest("Invalid JSON body");

  const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : "";
  if (!deviceId || deviceId.length > 120) return badRequest("Invalid deviceId");

  const floor = cleanFloor(body.floor);
  const inputRecords = Array.isArray(body.records) ? body.records : [];
  if (inputRecords.length > 200) return badRequest("Too many raising records");

  const records = [];
  const seen = new Set();
  for (const raw of inputRecords) {
    const record = cleanRecord(raw, deviceId, floor);
    if (!record || seen.has(record.id)) continue;
    seen.add(record.id);
    records.push(record);
  }

  const now = Date.now();
  const statements = [
    db.prepare(`
      INSERT INTO devices (id, created_at, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at
    `).bind(deviceId, now, now),
  ];

  if (records.length === 0) {
    statements.push(
      db.prepare("DELETE FROM raising_records WHERE device_id = ?").bind(deviceId)
    );
  } else {
    const placeholders = records.map(() => "?").join(",");
    statements.push(
      db.prepare(`DELETE FROM raising_records WHERE device_id = ? AND id NOT IN (${placeholders})`)
        .bind(deviceId, ...records.map(record => record.id))
    );
  }

  for (const record of records) {
    statements.push(
      db.prepare(`
        INSERT INTO raising_records (
          id, device_id, p_no, floor, started_at, last_fed_at,
          feed_count, next_feed_at, notified_next_feed_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          device_id = excluded.device_id,
          p_no = excluded.p_no,
          floor = excluded.floor,
          started_at = excluded.started_at,
          last_fed_at = excluded.last_fed_at,
          feed_count = excluded.feed_count,
          next_feed_at = excluded.next_feed_at,
          notified_next_feed_at = excluded.notified_next_feed_at,
          updated_at = excluded.updated_at
      `).bind(
        record.id,
        record.deviceId,
        record.pNo,
        record.floor,
        record.startedAt,
        record.lastFedAt,
        record.feedCount,
        record.nextFeedAt,
        record.notifiedNextFeedAt,
        now,
      )
    );
  }

  await db.batch(statements);
  return jsonResponse({ ok: true, synced: records.length });
}
