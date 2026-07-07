/**
 * 用户认证模块
 */

const STORAGE_KEY_USER = "pigfarm_user";
const API_BASE = ""; // 使用相对路径，自动使用当前域名

/**
 * 获取当前登录的用户信息
 */
export function getCurrentUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USER);
    if (!raw) return null;
    const user = JSON.parse(raw);
    if (!user || !user.id || !user.nickname || !user.deviceCode) return null;
    return user;
  } catch {
    return null;
  }
}

/**
 * 保存用户信息到本地
 */
export function saveCurrentUser(user) {
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

/**
 * 检查是否已登录
 */
export function isLoggedIn() {
  return getCurrentUser() !== null;
}

/**
 * 退出登录
 */
export function logout() {
  saveCurrentUser(null);
}

/**
 * 注册新用户
 * @param {string} nickname - 用户昵称
 * @returns {Promise<{ok: boolean, user?: object, error?: string}>}
 */
export async function register(nickname) {
  try {
    const response = await fetch(`${API_BASE}/api/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ nickname }),
    });

    const result = await response.json();

    if (result.ok && result.user) {
      saveCurrentUser(result.user);
    }

    return result;
  } catch (error) {
    console.error("Register error:", error);
    return { ok: false, error: "网络错误，请检查连接" };
  }
}

/**
 * 用户登录
 * @param {string} nickname - 用户昵称
 * @param {string} deviceCode - 设备识别码
 * @returns {Promise<{ok: boolean, user?: object, error?: string}>}
 */
export async function login(nickname, deviceCode) {
  try {
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ nickname, deviceCode }),
    });

    const result = await response.json();

    if (result.ok && result.user) {
      saveCurrentUser(result.user);
    }

    return result;
  } catch (error) {
    console.error("Login error:", error);
    return { ok: false, error: "网络错误，请检查连接" };
  }
}
