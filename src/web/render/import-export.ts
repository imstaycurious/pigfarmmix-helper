/**
 * 导入导出 — UI 渲染层
 *
 * 业务逻辑在 js/import-export-core.ts (可独立测试),
 * 本文件只负责 DOM 渲染 + 事件绑定。
 */

import type { Pig } from "../js/types.js";
import { state } from "../js/state.js";
import { $, el, toast, escHtml, imgUrl } from "../js/utils.js";
import { customConfirm } from "../js/modal.js";
import { emit } from "../js/events.js";
import { checkRaisingReminders } from "../js/raising-logic.js";
import {
  searchByName, parseTriple, addByPNo, addFromTriple, parseBatchLines,
  buildExportPayload, parseImportText, applyImport,
} from "../js/import-export-core.js";

// ---- 按名字添加 ----
const nameState = { q: "", results: [] as Pig[] };

function renderNameResults(): void {
  const box = $("#nameResults");
  if (!box) return;
  box.innerHTML = "";
  if (!nameState.q) {
    box.classList.remove("show");
    return;
  }
  box.classList.add("show");
  if (nameState.results.length === 0) {
    box.appendChild(el("div", { class: "empty-row" }, "没有匹配的猪"));
    return;
  }
  for (const p of nameState.results) {
    const already = state.ownedSet.has(p.pNo);
    const posText = p.book && p.book <= 6
      ? `图鉴${p.book}/页${p.page}/格${p.slot}`
      : (p.book === 7 ? "活动图鉴" : "");
    const row = el("div", {
      class: "row",
      onclick: () => { const res = addByPNo(p.pNo); if (res.err) { toast(res.err); return; } toast(res.msg || "已添加"); emit("ui-refresh", undefined); },
    }, [
      el("img", { src: imgUrl(p.pNo), loading: "lazy", alt: p.name }),
      el("div", { class: "meta" }, [
        el("div", { class: "r-name" }, `#${p.pNo} ${p.name}`),
        el("div", { class: "r-sub" }, `${p.color_text || ""}${posText ? " · " + posText : ""}`),
      ]),
      already ? el("span", { class: "r-in" }, "已添加") : null,
    ]);
    box.appendChild(row);
  }
}

// ---- 导出 ----

async function copyText(txt: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(txt);
      return true;
    }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = txt;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function runExport(alsoCopy: boolean): void {
  const out = $("#exportOut") as HTMLTextAreaElement | null;
  const msg = $("#exportMsg");
  if (!state.dataLoaded) {
    if (msg) msg.innerHTML = `<span class="err">数据还没加载好</span>`;
    return;
  }
  const payload = buildExportPayload();
  const txt = JSON.stringify(payload, null, 2);
  if (out) out.value = txt;
  const nColl = payload.owned186Pigs.length;
  const nOwned = payload.ownedEventPigs.length;
  const nSmall = payload.smallBadges.length;
  const nBig = payload.bigBadges.length;
  const nRaising = payload.raisingPigs.length;
  if (nColl === 0 && nOwned === 0 && nSmall === 0 && nBig === 0 && nRaising === 0) {
    if (msg) msg.innerHTML = `<span class="err">记录为空, 没什么可导出</span>`;
    return;
  }
  const summary = `186 已拥有 ${nColl} · Events 已拥有 ${nOwned} · 小章 ${nSmall} · 大章 ${nBig}`;
  if (alsoCopy) {
    copyText(txt).then(ok => {
      if (ok) {
        if (msg) msg.innerHTML = `<span class="ok">已复制到剪贴板: ${summary}</span>`;
        toast("已复制到剪贴板");
      } else {
        if (out) { out.focus(); out.select(); }
        if (msg) msg.innerHTML = `<span class="err">复制失败, 请手动选中上方文本复制</span>`;
      }
    });
  } else {
    if (out) { out.focus(); out.select(); }
    if (msg) msg.innerHTML = `<span class="ok">已导出: ${summary}</span>`;
  }
}

function runExportDownload(): void {
  const msg = $("#exportMsg");
  if (!state.dataLoaded) {
    if (msg) msg.innerHTML = `<span class="err">数据还没加载好</span>`;
    return;
  }
  const payload = buildExportPayload();
  if (payload.owned186Pigs.length === 0 && payload.ownedEventPigs.length === 0 && payload.smallBadges.length === 0 && payload.bigBadges.length === 0 && payload.raisingPigs.length === 0) {
    if (msg) msg.innerHTML = `<span class="err">记录为空, 没什么可导出</span>`;
    return;
  }
  const txt = JSON.stringify(payload, null, 2);
  const out = $("#exportOut") as HTMLTextAreaElement | null;
  if (out) out.value = txt;
  try {
    const blob = new Blob([txt], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    a.href = url;
    a.download = `pigfarm-helper-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (msg) msg.innerHTML = `<span class="ok">已下载备份文件</span>`;
  } catch (err) {
    console.error(err);
    if (msg) msg.innerHTML = `<span class="err">下载失败:${escHtml(err instanceof Error ? err.message : String(err))}</span>`;
  }
}

// ---- 导入 ----

async function runImport(replace: boolean): Promise<void> {
  const msg = $("#importMsg");
  if (!state.dataLoaded) {
    if (msg) msg.innerHTML = `<span class="err">数据还没加载好</span>`;
    return;
  }
  const raw = ($("#importIn") as HTMLTextAreaElement | null)?.value || "";
  const parsed = parseImportText(raw);
  if (parsed.err) {
    if (msg) msg.innerHTML = `<span class="err">${escHtml(parsed.err)}</span>`;
    return;
  }
  const nColl = parsed.collection.length;
  const nOwned = parsed.ownedEventPigs.length;
  const nSmall = parsed.smallBadges.length;
  const nBig = parsed.bigBadges.length;
  const nRaising = (parsed.raisingPigs || []).length;
  if (nColl === 0 && nOwned === 0 && nSmall === 0 && nBig === 0 && nRaising === 0) {
    if (msg) msg.innerHTML = `<span class="err">解析成功但内容为空 (可能 pNo 对不上当前数据)</span>`;
    return;
  }
  if (replace) {
    const fmtHint = parsed.formatVersion === 1 ? `\n\n已识别为 v1 老版备份` : "";
    const confirmTitle = "覆盖导入会替换你现有的全部记录";
    const confirmDetails =
      `186 已拥有 ${state.collection.length} → 导入 ${nColl}\n` +
      `Events 已拥有 ${state.ownedEventPigs.size} → 导入 ${nOwned}\n` +
      `小章 ${state.smallBadges.size} → 导入 ${nSmall}\n` +
      `大章 ${state.bigBadges.size} → 导入 ${nBig}` + fmtHint;
    if (!(await customConfirm(confirmTitle, confirmDetails))) return;
  }
  const r = applyImport(parsed, { replace });
  emit("ui-refresh", undefined);
  emit("raising-updated", undefined);
  checkRaisingReminders();
  const parts: string[] = [];
  if (r.addedColl) parts.push(`186新增 ${r.addedColl}`);
  if (r.removedColl) parts.push(`186移除 ${r.removedColl}`);
  if (r.addedOwned) parts.push(`Events新增 ${r.addedOwned}`);
  if (r.removedOwned) parts.push(`Events移除 ${r.removedOwned}`);
  if (r.addedSmall) parts.push(`小章新增 ${r.addedSmall}`);
  if (r.removedSmall) parts.push(`小章移除 ${r.removedSmall}`);
  if (r.addedBig) parts.push(`大章新增 ${r.addedBig}`);
  if (r.removedBig) parts.push(`大章移除 ${r.removedBig}`);
  if (r.addedRaising) parts.push(`养成新增 ${r.addedRaising}`);
  if (r.removedRaising) parts.push(`养成移除 ${r.removedRaising}`);
  const tags: string[] = [];
  if (parsed.source === "triplets") tags.push("三元组裸文本");
  else if (parsed.formatVersion === 1) tags.push("v1 老版 · 已自动反转 collection");
  else if (parsed.formatVersion >= 3) tags.push(`v${parsed.formatVersion} 新版`);
  else tags.push("v2 新版");
  if (r.unlocked) tags.push("隐藏图鉴已解锁");
  const suffix = ` <span style="color:var(--muted)">· ${tags.join(" · ")}</span>`;
  if (msg) {
    msg.innerHTML = parts.length
      ? `<span class="ok">导入完成: ${parts.join(" · ")}</span>${suffix}`
      : `<span class="ok">导入完成: 没有变化 (全部已存在)</span>${suffix}`;
  }
  toast("导入完成");
}

// ---- Wire up events (called from app.ts) ----
export function setupImportExport(): void {
  // Name search
  let nameSearchTimer: ReturnType<typeof setTimeout> | null = null;
  $("#nameIn")?.addEventListener("input", (e: Event) => {
    if (nameSearchTimer) clearTimeout(nameSearchTimer);
    const v = (e.target as HTMLInputElement).value;
    nameSearchTimer = setTimeout(() => {
      nameState.q = v;
      nameState.results = state.dataLoaded ? searchByName(v) : [];
      const msg = $("#nameMsg");
      if (!v.trim()) {
        if (msg) msg.textContent = "输入至少 1 个字符开始搜索,点击结果即可添加";
      } else if (!state.dataLoaded) {
        if (msg) msg.innerHTML = `<span class="err">数据还没加载好</span>`;
      } else {
        if (msg) msg.textContent = `找到 ${nameState.results.length} 只匹配的猪`;
      }
      renderNameResults();
    }, 160);
  });

  // Triplet add
  $("#addForm")?.addEventListener("submit", (ev: Event) => {
    ev.preventDefault();
    const b = ($("#bookIn") as HTMLInputElement | null)?.value || "";
    const p = ($("#pageIn") as HTMLInputElement | null)?.value || "";
    const s = ($("#slotIn") as HTMLInputElement | null)?.value || "";
    const res = addFromTriple(b, p, s);
    const msg = $("#addMsg");
    if (res.err) {
      if (msg) msg.innerHTML = `<span class="err">${res.err}</span>`;
      return;
    }
    if (msg) msg.innerHTML = res.ok ? `<span class="ok">${res.msg || ""}</span>` : `<span class="err">${res.msg || ""}</span>`;
    if (res.ok) {
      toast(res.msg || "已添加");
      emit("ui-refresh", undefined);
      const bookIn = $("#bookIn") as HTMLInputElement | null;
      const pageIn = $("#pageIn") as HTMLInputElement | null;
      const slotIn = $("#slotIn") as HTMLInputElement | null;
      if (bookIn) bookIn.value = "";
      if (pageIn) pageIn.value = "";
      if (slotIn) slotIn.value = "";
      bookIn?.focus();
    }
  });

  // Auto-advance
  const order = ["bookIn", "pageIn", "slotIn"];
  for (let i = 0; i < order.length; i++) {
    const cur = $(`#${order[i]}`) as HTMLInputElement | null;
    if (!cur) continue;
    cur.addEventListener("input", () => {
      const v = cur.value;
      const maxDigits = order[i] === "bookIn" ? 1 : (order[i] === "slotIn" ? 1 : 2);
      if (v && v.length >= maxDigits && i < order.length - 1) {
        ($(`#${order[i + 1]}`) as HTMLInputElement | null)?.focus();
      }
    });
    cur.addEventListener("paste", (e: ClipboardEvent) => {
      const data = e.clipboardData?.getData("text") || "";
      const parts = data.trim().split(/[\s\/,.;#]+/).filter(Boolean);
      if (parts.length >= 3) {
        e.preventDefault();
        const bookIn = $("#bookIn") as HTMLInputElement | null;
        const pageIn = $("#pageIn") as HTMLInputElement | null;
        const slotIn = $("#slotIn") as HTMLInputElement | null;
        if (bookIn) bookIn.value = parts[0] || "";
        if (pageIn) pageIn.value = parts[1] || "";
        if (slotIn) slotIn.value = parts[2] || "";
        ($("#addBtn") as HTMLButtonElement | null)?.focus();
      }
    });
  }

  // Batch
  $("#batchAddBtn")?.addEventListener("click", () => {
    const ta = $("#batchIn") as HTMLTextAreaElement | null;
    const report = $("#batchReport");
    if (report) report.innerHTML = "";
    if (!state.dataLoaded) {
      if (report) report.innerHTML = `<div class="line err">数据还没加载好</div>`;
      return;
    }
    const text = ta?.value || "";
    const items = parseBatchLines(text);
    if (items.length === 0) {
      if (report) report.innerHTML = `<div class="line err">没有有效的三元组输入</div>`;
      return;
    }
    let okCount = 0, dupCount = 0, errCount = 0;
    const frag = document.createDocumentFragment();
    for (const it of items) {
      if (it.parts.length < 3) {
        frag.appendChild(el("div", { class: "line err" }, `L${it.idx}: "${it.raw}" — 需要 3 个数字`));
        errCount++;
        continue;
      }
      const [b, p, s] = it.parts;
      const res = addFromTriple(b, p, s);
      if (res.err) {
        frag.appendChild(el("div", { class: "line err" }, `L${it.idx}: ${b}/${p}/${s} — ${res.err}`));
        errCount++;
      } else if (res.ok) {
        frag.appendChild(el("div", { class: "line ok" }, `L${it.idx}: ${b}/${p}/${s} → #${res.pig!.pNo} ${res.pig!.name}`));
        okCount++;
      } else {
        frag.appendChild(el("div", { class: "line dup" }, `L${it.idx}: ${b}/${p}/${s} → #${res.pig!.pNo} ${res.pig!.name} (已在收藏中)`));
        dupCount++;
      }
    }
    const summary = el("div", { class: "line" }, `总结: 新增 ${okCount} · 重复 ${dupCount} · 失败 ${errCount}`);
    summary.style.fontWeight = "600";
    summary.style.paddingBottom = "4px";
    summary.style.borderBottom = "1px solid var(--border)";
    summary.style.marginBottom = "4px";
    report?.appendChild(summary);
    report?.appendChild(frag);
    if (okCount > 0) {
      toast(`已添加 ${okCount} 只` + (dupCount ? ` · 重复 ${dupCount}` : "") + (errCount ? ` · 失败 ${errCount}` : ""));
      emit("ui-refresh", undefined);
    } else if (dupCount > 0 && errCount === 0) {
      toast(`全部 ${dupCount} 只已在收藏中`);
    }
  });

  $("#batchClearBtn")?.addEventListener("click", () => {
    const ta = $("#batchIn") as HTMLTextAreaElement | null;
    const report = $("#batchReport");
    if (ta) ta.value = "";
    if (report) report.innerHTML = "";
  });

  // Export / Import
  $("#exportBtn")?.addEventListener("click", () => runExport(false));
  $("#exportCopyBtn")?.addEventListener("click", () => runExport(true));
  $("#exportDownloadBtn")?.addEventListener("click", runExportDownload);

  $("#importMergeBtn")?.addEventListener("click", () => runImport(false));
  $("#importReplaceBtn")?.addEventListener("click", () => runImport(true));
  $("#importClearBtn")?.addEventListener("click", () => {
    const ta = $("#importIn") as HTMLTextAreaElement | null;
    const msg = $("#importMsg");
    if (ta) ta.value = "";
    if (msg) msg.textContent = "合并:只追加缺失的项;覆盖:用导入数据替换现有全部配置";
  });
  $("#importFileBtn")?.addEventListener("click", () => ($("#importFile") as HTMLInputElement | null)?.click());
  ($("#importFile") as HTMLInputElement | null)?.addEventListener("change", async (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      const ta = $("#importIn") as HTMLTextAreaElement | null;
      const msg = $("#importMsg");
      if (ta) ta.value = text;
      if (msg) msg.innerHTML = `<span class="ok">已读取文件 ${escHtml(f.name)},点击「合并导入」或「覆盖导入」继续</span>`;
    } catch (err) {
      const msg = $("#importMsg");
      if (msg) msg.innerHTML = `<span class="err">读取文件失败: ${escHtml(err instanceof Error ? err.message : String(err))}</span>`;
    } finally {
      (e.target as HTMLInputElement).value = "";
    }
  });
}
