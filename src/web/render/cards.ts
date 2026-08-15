/**
 * 猪卡片构建 — 列表 / 我的 共用
 */

import type { Pig } from "../js/types/index.js";
import { state } from "../js/state.js";
import { el, text, imgUrl, stars, fmtKg, badgeWeights, pigPicky } from "../js/utils.js";
import { setPigOwned, setPigBadge } from "../js/data.js";
import { customConfirm } from "../js/modal.js";
import { emit } from "../js/events.js";

async function confirmCancelOwned(p: Pig): Promise<boolean> {
  const name = p && p.name ? `「${p.name}」` : "这只猪";
  return await customConfirm(
    `确定要把${name}改为未拥有吗?`,
    `取消后,小章和大章记录也会一起清除。`
  );
}

async function setPigOwnedAfterConfirm(pNo: number, owned: boolean): Promise<boolean> {
  const p = state.pigsById.get(pNo) || state.eventPigsById.get(pNo) || state.hiddenPigsById.get(pNo);
  if (!owned && p && !(await confirmCancelOwned(p))) return false;
  setPigOwned(pNo, owned);
  return true;
}

export interface CardOptions {
  showCollected?: boolean;
  showBadges?: boolean;
}

export function buildCard(p: Pig, opts: CardOptions = {}): HTMLElement {
  const { showCollected = true, showBadges = false } = opts;
  const posText = p.book && p.book <= 6
    ? `图鉴${p.book} 页${p.page} #${p.slot}`
    : (p.book === 7 ? "Events图鉴" : "");
  const isEvent = p.book === 7 || !state.pigsById.has(p.pNo);
  const isOwn = isEvent
    ? state.ownedEventPigs.has(p.pNo)
    : state.ownedSet.has(p.pNo);
  const children: (HTMLElement | Text | string)[] = [];

  if (showCollected) {
    children.push(el("button", {
      class: "card-owned-toggle" + (isOwn ? " is-on" : ""),
      "aria-pressed": String(isOwn),
      title: isOwn ? "已拥有 — 点击取消" : "标记为已拥有",
      onclick: async (ev: Event) => {
        ev.stopPropagation();
        if (!(await setPigOwnedAfterConfirm(p.pNo, !isOwn))) return;
        emit("owned-changed", p.pNo);
      },
    }, isOwn ? "✅ 已拥有" : "⬜ 未拥有"));
  }

  children.push(el("div", { class: "img" },
    el("img", { src: imgUrl(p.pNo), loading: "lazy", alt: p.name })
  ));

  const grazeBadge = p.isExer
    ? el("span", { class: "graze yes", title: "放牧" }, "🌿 放牧")
    : el("span", { class: "graze no", title: "不放牧" }, "🏠 不放牧");
  const picky = pigPicky(p);
  const pickyTitle = picky.level === "none"
    ? "🍽️ 不挑食"
    : `🍽️ ${picky.label}: ${picky.foods.join(" / ")}`;
  const pickyLabel = picky.level === "none" ? "🍽️ 不挑食" : `🍽️ ${picky.label}`;
  const pickyEl = el("span", { class: "picky " + picky.level, title: pickyTitle }, pickyLabel);
  const feedN = (p.feeding && p.feeding.times) || 0;
  const feedBadge = el("span", { class: "feed", title: `最少喂食 ${feedN} 次` }, `🍚 ${feedN}`);

  // 小章 / 大章 chip
  const w = badgeWeights(p);
  const hasSm = showBadges && state.smallBadges.has(p.pNo);
  const hasBg = showBadges && state.bigBadges.has(p.pNo);
  const makeBadgeChip = (kind: "small" | "big", has: boolean, weight: number, op: string, iconSrc: string, label: string): HTMLElement => {
    const cls = `card-badge-chip ${kind}${has ? " is-on" : ""}`;
    const attrs: Record<string, unknown> = {
      class: cls,
      title: `${label}: ${op} ${fmtKg(weight)}kg${has ? " · 已拥有" : ""}`,
    };
    if (showBadges) {
      attrs.onclick = (ev: Event) => {
        ev.stopPropagation();
        const set = kind === "small" ? state.smallBadges : state.bigBadges;
        setPigBadge(p.pNo, kind, !set.has(p.pNo));
        emit("owned-changed", p.pNo);
      };
    }
    const tag = showBadges ? "button" : "span";
    return el(tag as "button", attrs, [
      el("img", { class: "card-badge-img", src: iconSrc, alt: label }),
      el("span", { class: "card-badge-w" }, `${op}${fmtKg(weight)}`),
    ]);
  };
  const badgeRow = w
    ? el("div", { class: "card-badge-row" + (showBadges ? " interactive" : "") }, [
      makeBadgeChip("small", hasSm, w.small, "≤", "/img/small.png", "小章"),
      makeBadgeChip("big", hasBg, w.big, "≥", "/img/big.png", "大章"),
    ])
    : null;

  children.push(el("div", { class: "body" }, [
    el("div", { class: "name" }, p.name),
    el("div", { class: "stars-row" + (p.special ? " special" : "") }, [
      el("span", { class: "stars" + (p.special ? " special" : "") }, stars(p.rare, p.special)),
    ]),
    el("div", { class: "sub" }, `${p.color_text || ""}${posText ? " · " + posText : ""}`),
    el("div", { class: "chip-row" }, [feedBadge, grazeBadge, pickyEl].filter(Boolean)),
    badgeRow,
  ]));

  return el("div", {
    class: "card" + (showCollected && isOwn ? " collected" : ""),
    "data-pno": String(p.pNo),
    "data-show-collected": showCollected ? "1" : "0",
    "data-show-badges": showBadges ? "1" : "0",
    onclick: () => emit("show-detail", p.pNo),
  }, children);
}

export { setPigOwnedAfterConfirm };
