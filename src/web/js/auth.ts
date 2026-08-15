/**
 * 用户认证模块
 */

import type { User, SyncResult } from "./types.js";
import { API_BASE } from "./constants.js";

const STORAGE_KEY_USER = "pigfarm_user";

/** 获取当前登录的用户信息 */
export function getCurrentUser(): User | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USER);
    if (!raw) return null;
    const user = JSON.parse(raw);
    if (!user || !user.id || !user.nickname || !user.deviceCode) return null;
    return user as User;
  } catch {
    return null;
  }
}

/** 保存用户信息到本地 */
export function saveCurrentUser(user: User | null): void {
  try {
    if (!user) {
      localStorage.removeItem(STORAGE_KEY_USER);
      return;
    }
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
  } catch (err) {
    console.error("Failed to save user:", err);
  }
}

/** 检查是否已登录 */
export function isLoggedIn(): boolean {
  return getCurrentUser() !== null;
}

/** 退出登录 */
export function logout(): void {
  saveCurrentUser(null);
}

/** 注册新用户 */
export async function register(nickname: string): Promise<SyncResult> {
  try {
    const response = await fetch(`${API_BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname }),
    });

    const result = await response.json();

    if (result.ok && result.user) {
      saveCurrentUser(result.user);
    }

    return result as SyncResult;
  } catch {
    return { ok: false, error: "网络错误,请检查连接" };
  }
}

/** 用户登录 */
export async function login(nickname: string, deviceCode: string): Promise<SyncResult> {
  try {
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname, deviceCode }),
    });

    const result = await response.json();

    if (result.ok && result.user) {
      saveCurrentUser(result.user);
    }

    return result as SyncResult;
  } catch {
    return { ok: false, error: "网络错误,请检查连接" };
  }
}
