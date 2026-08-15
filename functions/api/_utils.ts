/**
 * Cloudflare Pages Functions 共享工具
 */

/** 统一 JSON 响应 */
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/** 400 错误响应 */
export function badRequest(message: string): Response {
  return jsonResponse({ ok: false, error: message }, 400);
}

/** 安全读取请求 JSON */
export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/** CORS 预检响应 */
export function corsOptionsResponse(methods = "GET, POST, OPTIONS"): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": methods,
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

/** 清理和验证昵称 (1-30 字符) */
export function cleanNickname(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 30) return null;
  const cleaned = trimmed.replace(/[\x00-\x1F\x7F-\x9F]/g, "");
  return cleaned.length > 0 ? cleaned : null;
}

/** 清理和验证设备码 (6 位大写字母+数字) */
export function cleanDeviceCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(trimmed)) return null;
  return trimmed;
}

/** 验证用户 ID (UUID v4 格式) */
export function validateUserId(userId: unknown): userId is string {
  if (typeof userId !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId);
}
