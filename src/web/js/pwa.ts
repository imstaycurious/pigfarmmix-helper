/**
 * PWA + 主题 — 独立模块
 *
 * 从 app.ts 抽出: Service Worker 注册、安装提示、主题切换。
 */

import { $ } from "./utils.js";
import { customAlert } from "./modal.js";
import { THEME_KEY } from "./constants.js";

// ---------- 主题 ----------

export function currentTheme(): "dark" | "light" {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function updateThemeChrome(mode: "dark" | "light"): void {
  document.documentElement.dataset.theme = mode;
  const meta = document.getElementById("themeColorMeta");
  if (meta) meta.setAttribute("content", mode === "dark" ? "#0b1220" : "#ffffff");
  const btn = $("#themeBtn");
  if (btn) {
    btn.textContent = mode === "dark" ? "☀" : "☾";
    btn.setAttribute("aria-label", mode === "dark" ? "切换为浅色主题" : "切换为深色主题");
  }
}

/** 装配主题按钮 + 系统主题跟随 */
export function setupTheme(): void {
  updateThemeChrome(currentTheme());
  $("#themeBtn")?.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    updateThemeChrome(next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
  });
  if (window.matchMedia) {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onSysChange = (e: MediaQueryListEvent) => {
      if (localStorage.getItem(THEME_KEY)) return;
      updateThemeChrome(e.matches ? "dark" : "light");
    };
    if (mql.addEventListener) mql.addEventListener("change", onSysChange);
    else if (mql.addListener) mql.addListener(onSysChange);
  }
}

// ---------- PWA ----------

/** 装配 Service Worker 注册 + 安装提示 */
export function setupPwa(): void {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(console.warn);
  }

  let deferredPrompt: Event & { prompt?: () => void; userChoice?: Promise<unknown> } | null = null;
  window.addEventListener("beforeinstallprompt", (e: Event) => {
    e.preventDefault();
    deferredPrompt = e as typeof deferredPrompt;
    $("#install")?.classList.add("show");
  });
  $("#installBtn")?.addEventListener("click", async () => {
    if (!deferredPrompt) {
      const ua = navigator.userAgent;
      const isIOS = /iPad|iPhone|iPod/.test(ua);
      await customAlert(
        isIOS
          ? "iOS:点击 Safari 下方分享按钮 → 加到主屏幕"
          : "请用浏览器菜单选择「安装 App / 加到主屏幕」"
      );
      return;
    }
    deferredPrompt.prompt?.();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    $("#install")?.classList.remove("show");
  });
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) && !(window.navigator as Navigator & { standalone?: boolean }).standalone) {
    $("#install")?.classList.add("show");
    const t = $("#installText");
    if (t) t.textContent = "在 Safari 点击分享 → 加到主屏幕";
  }
}

/** 监听 SW 消息 (打开指定 tab) */
export function onServiceWorkerMessage(handler: (tab: string) => void): void {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (e: MessageEvent) => {
      if (e.data && e.data.type === "open-tab") handler(e.data.tab);
    });
  }
}
