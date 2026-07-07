/**
 * Cloudflare Pages Function: 收藏数据同步
 * POST /api/sync/collection - 上传本地数据并获取合并后的云端数据
 * GET  /api/sync/collection - 仅获取云端数据
 */

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
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

/**
 * 验证用户 ID 格式
 */
function validateUserId(userId) {
  if (typeof userId !== "string") return false;
  // UUID v4 格式：xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId);
}

/**
 * 清理和验证编号数组
 */
function cleanNumberArray(arr, maxLength = 1000) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter(n => Number.isInteger(n) && n > 0)
    .slice(0, maxLength); // 限制数组长度
}

/**
 * 从数据库加载用户的收藏数据
 */
async function loadCloudData(db, userId) {
  const [collections, eventCollections, badges] = await Promise.all([
    // 186 图鉴
    db.prepare("SELECT p_no FROM collections WHERE user_id = ? ORDER BY p_no")
      .bind(userId)
      .all(),
    // Events 猪
    db.prepare("SELECT p_no FROM event_collections WHERE user_id = ? ORDER BY p_no")
      .bind(userId)
      .all(),
    // 徽章（小徽章和大徽章）
    db.prepare("SELECT badge_type, p_no FROM badges WHERE user_id = ? ORDER BY badge_type, p_no")
      .bind(userId)
      .all(),
  ]);

  const smallBadges = [];
  const bigBadges = [];
  for (const row of badges.results || []) {
    if (row.badge_type === "small") {
      smallBadges.push(row.p_no);
    } else if (row.badge_type === "big") {
      bigBadges.push(row.p_no);
    }
  }

  return {
    collection: (collections.results || []).map(row => row.p_no),
    eventPigs: (eventCollections.results || []).map(row => row.p_no),
    smallBadges,
    bigBadges,
  };
}

/**
 * 用本地数据完全替换云端数据（Last-Write-Wins：本地胜出时调用）
 * 先删除该用户所有数据，再插入本地数据 —— 这样删除操作也能同步
 */
async function overwriteCloudData(db, userId, localData, now, localModifiedAt) {
  const statements = [];

  // 先清空该用户所有旧数据（支持删除同步）
  statements.push(db.prepare("DELETE FROM collections WHERE user_id = ?").bind(userId));
  statements.push(db.prepare("DELETE FROM event_collections WHERE user_id = ?").bind(userId));
  statements.push(db.prepare("DELETE FROM badges WHERE user_id = ?").bind(userId));

  // 处理 186 图鉴收藏
  const collection = cleanNumberArray(localData.collection);
  for (const pNo of collection) {
    statements.push(
      db.prepare(`
        INSERT INTO collections (user_id, p_no, added_at)
        VALUES (?, ?, ?)
        ON CONFLICT (user_id, p_no) DO NOTHING
      `).bind(userId, pNo, now)
    );
  }

  // 处理 Events 猪收藏
  const eventPigs = cleanNumberArray(localData.eventPigs);
  for (const pNo of eventPigs) {
    statements.push(
      db.prepare(`
        INSERT INTO event_collections (user_id, p_no, added_at)
        VALUES (?, ?, ?)
        ON CONFLICT (user_id, p_no) DO NOTHING
      `).bind(userId, pNo, now)
    );
  }

  // 处理小徽章
  const smallBadges = cleanNumberArray(localData.smallBadges);
  for (const pNo of smallBadges) {
    statements.push(
      db.prepare(`
        INSERT INTO badges (user_id, badge_type, p_no, added_at)
        VALUES (?, 'small', ?, ?)
        ON CONFLICT (user_id, badge_type, p_no) DO NOTHING
      `).bind(userId, pNo, now)
    );
  }

  // 处理大徽章
  const bigBadges = cleanNumberArray(localData.bigBadges);
  for (const pNo of bigBadges) {
    statements.push(
      db.prepare(`
        INSERT INTO badges (user_id, badge_type, p_no, added_at)
        VALUES (?, 'big', ?, ?)
        ON CONFLICT (user_id, badge_type, p_no) DO NOTHING
      `).bind(userId, pNo, now)
    );
  }

  // 更新用户最后同步时间和数据修改时间
  statements.push(
    db.prepare("UPDATE users SET last_sync_at = ?, updated_at = ?, data_modified_at = ? WHERE id = ?")
      .bind(now, now, localModifiedAt, userId)
  );

  // 批量执行（D1 最多支持 100 条，需要分批）
  const batchSize = 100;
  for (let i = 0; i < statements.length; i += batchSize) {
    const batch = statements.slice(i, i + batchSize);
    await db.batch(batch);
  }
}

/**
 * GET 请求：仅获取云端数据
 */
export async function onRequestGet(context) {
  const db = context.env.DB;
  if (!db) {
    return jsonResponse({ ok: false, error: "数据库未配置" }, 500);
  }

  const url = new URL(context.request.url);
  const userId = url.searchParams.get("userId");

  if (!validateUserId(userId)) {
    return badRequest("用户 ID 格式不正确");
  }

  try {
    // 验证用户是否存在
    const user = await db
      .prepare("SELECT id, last_sync_at FROM users WHERE id = ? LIMIT 1")
      .bind(userId)
      .first();

    if (!user) {
      return jsonResponse({ ok: false, error: "用户不存在" }, 404);
    }

    const cloudData = await loadCloudData(db, userId);

    return jsonResponse({
      ok: true,
      data: cloudData,
      lastSyncAt: user.last_sync_at,
    });
  } catch (error) {
    console.error("[sync/collection GET] Error:", error);
    return jsonResponse({ ok: false, error: "获取数据失败" }, 500);
  }
}

/**
 * POST 请求：Last-Write-Wins 同步
 * 比较本地和云端的 modifiedAt 时间戳，谁更新就用谁的数据
 */
export async function onRequestPost(context) {
  const db = context.env.DB;
  if (!db) {
    return jsonResponse({ ok: false, error: "数据库未配置" }, 500);
  }

  const body = await readJson(context.request);
  if (!body || typeof body !== "object") {
    return badRequest("请求格式错误");
  }

  const userId = body.userId;
  if (!validateUserId(userId)) {
    return badRequest("用户 ID 格式不正确");
  }

  const localData = body.localData || {};
  if (typeof localData !== "object") {
    return badRequest("本地数据格式错误");
  }

  const localModifiedAt = body.localModifiedAt || 0;

  try {
    // 验证用户是否存在，并获取云端数据修改时间
    const user = await db
      .prepare("SELECT id, data_modified_at FROM users WHERE id = ? LIMIT 1")
      .bind(userId)
      .first();

    if (!user) {
      return jsonResponse({ ok: false, error: "用户不存在" }, 404);
    }

    const cloudModifiedAt = user.data_modified_at || 0;
    const now = Date.now();

    let winner = "local";
    let resultData = null;

    // Last-Write-Wins 策略：谁的时间戳更新，谁胜出
    if (localModifiedAt > cloudModifiedAt) {
      // 本地更新 → 用本地数据完全覆盖云端（支持删除同步）
      winner = "local";
      await overwriteCloudData(db, userId, localData, now, localModifiedAt);
      resultData = localData; // 客户端已经是最新的，不需要更新
    } else {
      // 云端更新 → 返回云端数据让客户端覆盖本地
      winner = "cloud";
      resultData = await loadCloudData(db, userId);

      // 更新用户最后同步时间（但不修改 data_modified_at）
      await db
        .prepare("UPDATE users SET last_sync_at = ?, updated_at = ? WHERE id = ?")
        .bind(now, now, userId)
        .run();
    }

    return jsonResponse({
      ok: true,
      winner,
      cloudData: resultData,
      dataModifiedAt: winner === "local" ? localModifiedAt : cloudModifiedAt,
      lastSyncAt: now,
    });
  } catch (error) {
    console.error("[sync/collection POST] Error:", error);
    return jsonResponse({ ok: false, error: "同步失败，请稍后重试" }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
