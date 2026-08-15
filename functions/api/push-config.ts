/**
 * Cloudflare Pages Function: 推送配置
 * GET /api/push-config — 返回 VAPID public key
 */

import { jsonResponse } from "./_utils.ts";

interface Env {
  VAPID_PUBLIC_KEY?: string;
}

export function onRequestGet(context: { env: Env }): Response {
  return jsonResponse({
    ok: true,
    publicKey: context.env.VAPID_PUBLIC_KEY || "",
  });
}
