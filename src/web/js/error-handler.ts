/**
 * 全局错误处理
 *
 * 在页面顶部显示一个可消除的错误横幅,用于:
 * - loadData 失败 (数据加载失败)
 * - 未捕获的 Promise rejection
 * - 全局运行时错误
 */

let errorBar: HTMLElement | null = null;

/** 显示错误横幅 */
export function showGlobalError(message: string): void {
  if (!errorBar) {
    errorBar = document.createElement("div");
    errorBar.id = "globalErrorBar";
    errorBar.style.cssText = [
      "position:fixed;top:0;left:0;right:0;z-index:9999;",
      "background:#c62828;color:#fff;padding:10px 16px;",
      "font-size:14px;line-height:1.5;display:flex;",
      "justify-content:space-between;align-items:center;",
      "transform:translateY(-100%);transition:transform 0.3s ease;",
    ].join("");
    const close = document.createElement("button");
    close.textContent = "✕";
    close.style.cssText = "background:none;border:none;color:#fff;font-size:18px;cursor:pointer;margin-left:12px;flex-shrink:0;";
    close.onclick = () => hideGlobalError();
    errorBar.appendChild(document.createTextNode(message));
    errorBar.appendChild(close);
    document.body.prepend(errorBar);
  } else {
    const closeBtn = errorBar.lastElementChild;
    errorBar.textContent = message;
    if (closeBtn) errorBar.appendChild(closeBtn);
  }
  requestAnimationFrame(() => {
    if (errorBar) errorBar.style.transform = "translateY(0)";
  });
}

/** 隐藏错误横幅 */
export function hideGlobalError(): void {
  if (errorBar) {
    errorBar.style.transform = "translateY(-100%)";
  }
}

/** 安装全局未捕获异常处理器 */
export function installGlobalErrorHandler(): void {
  window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    const msg = event.reason instanceof Error ? event.reason.message : String(event.reason);
    console.error("[unhandled rejection]", msg, event.reason);
    showGlobalError(`发生了一个错误: ${msg}. 请刷新页面重试。`);
    event.preventDefault();
  });

  window.addEventListener("error", (event: ErrorEvent) => {
    if (event.filename && (event.filename.includes("chrome-extension") || event.filename.includes("moz-extension"))) return;
    console.error("[global error]", event.message);
    showGlobalError(`页面发生错误: ${event.message}`);
  });
}
