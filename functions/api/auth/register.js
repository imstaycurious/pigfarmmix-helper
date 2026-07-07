/**
 * Cloudflare Pages Function: 用户注册
 * POST /api/auth/register
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
 * 生成 6 位设备识别码
 * 格式：大写字母+数字混合，避免易混淆字符（0/O, 1/I/L）
 */
function generateDeviceCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 排除 0,O,1,I,L
  let code = "";
  const randomValues = new Uint8Array(6);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < 6; i++) {
    code += chars[randomValues[i] % chars.length];
  }
  return code;
}

/**
 * 生成 UUID v4
 */
function generateUUID() {
  return crypto.randomUUID();
}

/**
 * 清理和验证昵称
 */
function cleanNickname(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 30) return null;
  // 过滤掉控制字符和特殊字符
  const cleaned = trimmed.replace(/[\x00-\x1F\x7F-\x9F]/g, "");
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * 尝试生成唯一的设备码（最多重试 10 次）
 */
async function generateUniqueDeviceCode(db) {
  for (let i = 0; i < 10; i++) {
    const code = generateDeviceCode();
    const existing = await db
      .prepare("SELECT id FROM users WHERE device_code = ? LIMIT 1")
      .bind(code)
      .first();
    if (!existing) return code;
  }
  throw new Error("Failed to generate unique device code");
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
  if (!nickname) {
    return badRequest("昵称格式不正确（1-30 字符）");
  }

  try {
    const userId = generateUUID();
    const deviceCode = await generateUniqueDeviceCode(db);
    const now = Date.now();

    await db
      .prepare(`
        INSERT INTO users (id, nickname, device_code, created_at, updated_at, last_sync_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .bind(userId, nickname, deviceCode, now, now, null)
      .run();

    return jsonResponse({
      ok: true,
      user: {
        id: userId,
        nickname: nickname,
        deviceCode: deviceCode,
        createdAt: now,
      },
    });
  } catch (error) {
    console.error("[auth/register] Error:", error);
    return jsonResponse({ ok: false, error: "注册失败，请稍后重试" }, 500);
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
