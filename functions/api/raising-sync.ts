/**
 * Cloudflare Pages Function: 养成记录同步
 * POST /api/raising-sync
 */

import { jsonResponse, badRequest, readJson } from "./_utils.ts";

interface Env {
  DB: D1Database;
}

interface RawRecord {
  id?: unknown;
  pNo?: unknown;
  pigName?: unknown;
  floor?: unknown;
  startedAt?: unknown;
  lastFedAt?: unknown;
  feedCount?: unknown;
  nextFeedAt?: unknown;
  notifiedNextFeedAt?: unknown;
}

interface CleanRecord {
  id: string;
  deviceId: string;
  pNo: number;
  pigName: string;
  floor: "woodchip" | "normal" | "straw";
  startedAt: number;
  lastFedAt: number;
  feedCount: number;
  nextFeedAt: number;
  notifiedNextFeedAt: number | null;
}

function toInt(value: unknown, fallback = 0): number {
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? n : fallback;
}

function cleanFloor(value: unknown): "woodchip" | "normal" | "straw" {
  return value === "woodchip" || value === "straw" || value === "normal" ? value : "normal";
}

function cleanPigName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 80);
}

function cleanRecord(raw: unknown, deviceId: string, fallbackFloor: "woodchip" | "normal" | "straw"): CleanRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as RawRecord;
  const localId = typeof r.id === "string" ? r.id.trim() : "";
  const pNo = toInt(r.pNo);
  if (!localId || localId.length > 120 || !Number.isInteger(pNo) || pNo <= 0) return null;

  const now = Date.now();
  const startedAt = Math.max(0, toInt(r.startedAt, now));
  const lastFedAt = Math.max(0, toInt(r.lastFedAt, now));
  const feedCount = Math.max(0, toInt(r.feedCount, 0));
  const nextFeedAt = Math.max(0, toInt(r.nextFeedAt, lastFedAt));
  const notifiedNextFeedAt = r.notifiedNextFeedAt ? Math.max(0, toInt(r.notifiedNextFeedAt, 0)) : null;

  return {
    id: `${deviceId}:${localId}`,
    deviceId,
    pNo,
    pigName: cleanPigName(r.pigName),
    floor: cleanFloor(r.floor || fallbackFloor),
    startedAt,
    lastFedAt,
    feedCount,
    nextFeedAt,
    notifiedNextFeedAt,
  };
}

async function hasPigNameColumn(db: D1Database): Promise<boolean> {
  const result = await db.prepare("PRAGMA table_info(raising_records)").all<{ name: string }>();
  return (result.results || []).some(row => row.name === "pig_name");
}

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const db = context.env.DB;
  if (!db) return jsonResponse({ ok: false, error: "D1 binding DB is missing" }, 500);

  const body = await readJson(context.request);
  if (!body) return badRequest("Invalid JSON body");

  const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : "";
  if (!deviceId || deviceId.length > 120) return badRequest("Invalid deviceId");

  const floor = cleanFloor(body.floor);
  const inputRecords = Array.isArray(body.records) ? body.records : [];
  if (inputRecords.length > 200) return badRequest("Too many raising records");

  const records: CleanRecord[] = [];
  const seen = new Set<string>();
  for (const raw of inputRecords) {
    const record = cleanRecord(raw, deviceId, floor);
    if (!record || seen.has(record.id)) continue;
    seen.add(record.id);
    records.push(record);
  }

  const now = Date.now();
  const canStorePigName = await hasPigNameColumn(db);
  const statements: D1PreparedStatement[] = [
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
    if (canStorePigName) {
      statements.push(
        db.prepare(`
        INSERT INTO raising_records (
          id, device_id, p_no, pig_name, floor, started_at, last_fed_at,
          feed_count, next_feed_at, notified_next_feed_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          device_id = excluded.device_id,
          p_no = excluded.p_no,
          pig_name = excluded.pig_name,
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
        record.pigName,
        record.floor,
        record.startedAt,
        record.lastFedAt,
        record.feedCount,
        record.nextFeedAt,
        record.notifiedNextFeedAt,
        now,
      )
      );
      continue;
    }

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
  return jsonResponse({ ok: true, synced: records.length, pigName: canStorePigName });
}
