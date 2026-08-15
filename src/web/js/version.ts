/**
 * 版本更新检查和提示
 */

import { STORAGE_KEY_APP_VERSION } from "./constants.js";
import { customAlert } from "./modal.js";

function getStoredVersion(): string {
  try {
    return localStorage.getItem(STORAGE_KEY_APP_VERSION) || "";
  } catch {
    return "";
  }
}

function setStoredVersion(version: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_APP_VERSION, version);
  } catch { /* ignore */ }
}

/** 从 Service Worker 获取当前 CACHE 版本号 */
async function getCurrentVersion(): Promise<string | null> {
  if (!navigator.serviceWorker || !navigator.serviceWorker.controller) {
    return null;
  }

  return new Promise<string | null>((resolve) => {
    const controller = navigator.serviceWorker.controller;
    if (!controller) {
      resolve(null);
      return;
    }
    const channel = new MessageChannel();
    channel.port1.onmessage = (event: MessageEvent) => {
      resolve(event.data.version || null);
    };

    controller.postMessage(
      { type: "GET_VERSION" },
      [channel.port2]
    );

    setTimeout(() => resolve(null), 1000);
  });
}

/** 检查版本更新并显示提示 */
export async function checkAndShowUpdateNotice(): Promise<void> {
  const currentVersion = await getCurrentVersion();
  if (!currentVersion) return;

  const storedVersion = getStoredVersion();

  if (storedVersion !== currentVersion) {
    await showUpdateNotice(currentVersion);
    setStoredVersion(currentVersion);
  }
}

/** 显示更新内容 */
async function showUpdateNotice(_version: string): Promise<void> {
  const updateContent = `
由于一些客观原因,本项目未来可能会在某个时间点停止维护。

目前暂无明确的停止维护时间,项目仍会继续运行和使用。但从长期来看,后续可能不再提供新功能、版本更新以及问题修复。

感谢一直以来的使用、关注和支持。如果未来项目真的走到停止维护的那一天,也希望它曾经能够为你带来一些帮助。
  `.trim();

  await customAlert(updateContent, "更新提示");
}

/** 手动显示更新内容 (供按钮调用) */
export async function showUpdateManually(): Promise<void> {
  await showUpdateNotice("");
}
