/**
 * Cloudflare Pages Function: 用户登录
 * POST /api/auth/login
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
 * 清理和验证昵称
 */
function cleanNickname(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 30) return null;
  const cleaned = trimmed.replace(/[\x00-\x1F\x7F-\x9F]/g, "");
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * 清理和验证设备码
 */
function cleanDeviceCode(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toUpperCase();
  // 设备码应该是 6 位大写字母+数字
  if (!/^[A-Z0-9]{6}$/.test(trimmed)) return null;
  return trimmed;
}

export async function onRequestPost(context) {
  const db = context.env.DB;
  if (!db) {
    return jsonResponse({ ok: false, error: "数据库未配置" }, 500);
  }

  const body = await readJson(context.request);
  if (!body || typeof body !== "object") {
    return badRequest("请求格式错误");
  }

  const nickname = cleanNickname(body.nickname);
  const deviceCode = cleanDeviceCode(body.deviceCode);

  if (!nickname) {
    return badRequest("昵称格式不正确");
  }

  if (!deviceCode) {
    return badRequest("设备码格式不正确（6位字母数字）");
  }

  try {
    // 验证昵称和设备码匹配
    const user = await db
      .prepare(`
        SELECT id, nickname, device_code, created_at, last_sync_at
        FROM users
        WHERE nickname = ? AND device_code = ?
        LIMIT 1
      `)
      .bind(nickname, deviceCode)
      .first();

    if (!user) {
      return jsonResponse(
        { ok: false, error: "昵称或设备码不正确" },
        401
      );
    }

    // 更新最后登录时间
    const now = Date.now();
    await db
      .prepare("UPDATE users SET updated_at = ? WHERE id = ?")
      .bind(now, user.id)
      .run();

    return jsonResponse({
      ok: true,
      user: {
        id: user.id,
        nickname: user.nickname,
        deviceCode: user.device_code,
        createdAt: user.created_at,
        lastSyncAt: user.last_sync_at,
      },
    });
  } catch (error) {
    console.error("[auth/login] Error:", error);
    return jsonResponse({ ok: false, error: "登录失败，请稍后重试" }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
