/**
 * 工具函数和 DOM 辅助函数
 */

import { IMG_BASE, FEED_LABELS, WEIGHT_OFFSET_BASE } from './constants.js';
import { state } from './state.js';

// DOM 辅助函数
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function text(s) {
  return document.createTextNode(String(s));
}

export function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "onclick") e.addEventListener("click", v);
    else if (k === "html") e.innerHTML = v;
    else e.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    e.appendChild(typeof c === "string" ? text(c) : c);
  }
  return e;
}

export function toast(msg, ms = 1800) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), ms);
}

export function escHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function imgUrl(pNo) {
  return pNo ? `${IMG_BASE}${pNo}.png` : "";
}

// 星级显示
export function stars(rare, special) {
  const n = rare || 0;
  if (n >= 6) return "★".repeat(6);
  const filled = Math.max(0, Math.min(5, n));
  return "★".repeat(filled) + "☆".repeat(5 - filled);
}

// 体型徽章相关
export function badgeOffset(_pNo) {
  return WEIGHT_OFFSET_BASE;
}

export function fmtKg(v) {
  if (typeof v !== "number" || !isFinite(v)) return "?";
  return (Math.round(v * 10) / 10).toFixed(1);
}

export function badgeWeights(pig) {
  if (!pig || !pig.weight || typeof pig.weight.big !== "number" || typeof pig.weight.small !== "number") {
    return null;
  }
  const off = badgeOffset(pig.pNo);
  return {
    small: pig.weight.small + off,
    big: pig.weight.big + off,
    smallRaw: pig.weight.small,
    bigRaw: pig.weight.big,
    offset: off,
  };
}

export function badgeMetaHTML(pig) {
  const w = badgeWeights(pig);
  if (!w) return "";
  const hasSmall = state.smallBadges.has(pig.pNo);
  const hasBig = state.bigBadges.has(pig.pNo);
  const chip = (kind, ownedAttr, value, op, iconSrc, label) =>
    `<div class="badge-chip badge-${kind}${ownedAttr ? " is-on" : ""}"` +
    ` data-badge-kind="${kind}" data-badge-pno="${pig.pNo}">` +
    `<img class="badge-icon" src="${iconSrc}" alt="${label}">` +
    `<span class="badge-text">${op} ${fmtKg(value)} kg</span>` +
    `<button type="button" class="badge-state" data-badge-kind="${kind}" data-badge-pno="${pig.pNo}"` +
    ` aria-pressed="${ownedAttr}" title="点击切换是否已获得${label}">${ownedAttr ? "✅ 已拥有" : "⬜ 未拥有"}</button>` +
    `</div>`;
  return `<div class="meta badge-line">` +
    chip("small", hasSmall, w.small, "≤", "/img/small.png", "小章") +
    chip("big", hasBig, w.big, "≥", "/img/big.png", "大章") +
    `</div>`;
}

// 喂食间隔文本
export function feedIntervalText(eatable_time) {
  if (eatable_time == null) return "?";
  if (eatable_time === 0) return "58 分钟";
  if (eatable_time < 1) return `${Math.round(eatable_time * 60)} 分钟`;
  return `${eatable_time} 小时`;
}

// 挑食程度判定
export function pigPicky(p) {
  const ids = (p.eatable || []).filter(i => FEED_LABELS[i]);
  const foods = ids.map(i => FEED_LABELS[i]);
  if (ids.length === 0) return { level: "none", label: "不挑食", foods };
  if (ids.length === 1) return { level: "picky", label: "挑食", foods };
  return { level: "some", label: "有点挑食", foods };
}

// 判断是否为活动猪
export function isEventPigId(pNo) {
  return !state.pigsById.has(pNo) && state.eventPigsById.has(pNo);
}

// 判断猪是否已拥有
export function pigIsOwned(p) {
  if (p.book === 7) return state.ownedEventPigs.has(p.pNo);
  return state.collection.includes(p.pNo);
}

// 集齐 186 后的解锁庆祝弹窗
export function showUnlockCelebration() {
  if (document.getElementById("celebrationModal")) return;
  const names = Array.from(state.hiddenPigsById.values())
    .map(p => p.name)
    .filter(Boolean);
  const modal = document.createElement("div");
  modal.id = "celebrationModal";
  modal.className = "celebration-bg";
  modal.innerHTML = `
    <div class="celebration-card" role="dialog" aria-modal="true" aria-labelledby="celebrationTitle">
      <div class="celebration-confetti">🎉 ✨ 🎊 ✨ 🎉</div>
      <div class="celebration-crown">👑</div>
      <h2 id="celebrationTitle">恭喜你 · 大成就解锁!</h2>
      <p class="celebration-line">你已集齐 <b>主图鉴 186 只</b>,养猪场名册圆满 ✨</p>
      <p class="celebration-sub">作为奖赏,隐藏图鉴「皇室成员」向你开放:</p>
      <ul class="celebration-list">
        ${names.map(n => `<li>👑 ${escHtml(n)}</li>`).join("")}
      </ul>
      <p class="celebration-foot">现在到 <b>186图鉴 → 野猪图鉴第 3 页</b> 可以看到他们 🐷</p>
      <button type="button" class="add-btn celebration-ok" id="celebrationOk">收下这份荣耀 ✨</button>
    </div>
  `;
  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add("show"));
  const close = () => {
    modal.classList.remove("show");
    setTimeout(() => modal.remove(), 220);
    document.removeEventListener("keydown", onKey);
  };
  const onKey = e => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  modal.addEventListener("click", e => {
    if (e.target === modal || e.target.id === "celebrationOk") close();
  });
}
