/**
 * 版本更新检查和提示
 */

import { STORAGE_KEY_APP_VERSION } from './constants.js';
import { customAlert } from './modal.js';

/**
 * 获取本地存储的版本号
 */
function getStoredVersion() {
  try {
    return localStorage.getItem(STORAGE_KEY_APP_VERSION) || '';
  } catch {
    return '';
  }
}

/**
 * 保存版本号到本地
 */
function setStoredVersion(version) {
  try {
    localStorage.setItem(STORAGE_KEY_APP_VERSION, version);
  } catch {
    // ignore
  }
}

/**
 * 从 Service Worker 获取当前 CACHE 版本号
 */
async function getCurrentVersion() {
  if (!navigator.serviceWorker || !navigator.serviceWorker.controller) {
    return null;
  }

  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => {
      resolve(event.data.version || null);
    };

    navigator.serviceWorker.controller.postMessage(
      { type: 'GET_VERSION' },
      [channel.port2]
    );

    // 超时保护
    setTimeout(() => resolve(null), 1000);
  });
}

/**
 * 检查版本更新并显示提示
 */
export async function checkAndShowUpdateNotice() {
  const currentVersion = await getCurrentVersion();
  if (!currentVersion) return; // SW 未就绪或获取失败

  const storedVersion = getStoredVersion();

  // 如果版本不一致，显示更新提示
  if (storedVersion !== currentVersion) {
    await showUpdateNotice(currentVersion);
    setStoredVersion(currentVersion);
  }
}

/**
 * 显示更新内容
 */
async function showUpdateNotice(version) {
  const updateContent = `
🎉 新功能：
• 账号系统上线：支持多设备数据同步
• 智能同步：自动检测最新修改

✨ 优化：
• 简洁账号卡片布局

⚠️ 重要提示：
• 首次使用请先注册账号
• 务必保存好你的设备码（6位）
• 建议注册后立即同步数据到云端
  `.trim();

  await customAlert(updateContent, '更新提示');
}
