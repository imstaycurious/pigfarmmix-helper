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
🐷 本次更新：
• 养成中新增「📦 等待进货中」分类
• 正在养的猪可一键移入等待进货,不再发送喂食提醒
• 等待进货中的猪可一键移回养成,自动重置上次喂食时间
  `.trim();

  await customAlert(updateContent, '更新提示');
}

/**
 * 手动显示更新内容（供按钮调用）
 */
export async function showUpdateManually() {
  await showUpdateNotice();
}
