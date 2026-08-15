/**
 * 猪卡片构建 — 列表 / 我的 共用
 */
import { state } from "../js/state.js";
import { el, imgUrl, stars, fmtKg, badgeWeights, pigPicky } from "../js/utils.js";
import { setPigOwned, setPigBadge } from "../js/data.js";
import { customConfirm } from "../js/modal.js";
import { runtime } from "../js/runtime.js";
async function confirmCancelOwned(p) {
    const name = p && p.name ? `「${p.name}」` : "这只猪";
    return await customConfirm(`确定要把${name}改为未拥有吗?`, `取消后,小章和大章记录也会一起清除。`);
}
async function setPigOwnedAfterConfirm(pNo, owned) {
    const p = state.pigsById.get(pNo) || state.eventPigsById.get(pNo) || state.hiddenPigsById.get(pNo);
    if (!owned && p && !(await confirmCancelOwned(p)))
        return false;
    setPigOwned(pNo, owned);
    return true;
}
export function buildCard(p, opts = {}) {
    const { showCollected = true, showBadges = false } = opts;
    const posText = p.book && p.book <= 6
        ? `图鉴${p.book} 页${p.page} #${p.slot}`
        : (p.book === 7 ? "Events图鉴" : "");
    const isEvent = p.book === 7 || !state.pigsById.has(p.pNo);
    const isOwn = isEvent
        ? state.ownedEventPigs.has(p.pNo)
        : state.ownedSet.has(p.pNo);
    const children = [];
    if (showCollected) {
        children.push(el("button", {
            class: "card-owned-toggle" + (isOwn ? " is-on" : ""),
            "aria-pressed": String(isOwn),
            title: isOwn ? "已拥有 — 点击取消" : "标记为已拥有",
            onclick: async (ev) => {
                ev.stopPropagation();
                if (!(await setPigOwnedAfterConfirm(p.pNo, !isOwn)))
                    return;
                updateOwnedUI(p.pNo);
            },
        }, isOwn ? "✅ 已拥有" : "⬜ 未拥有"));
    }
    children.push(el("div", { class: "img" }, el("img", { src: imgUrl(p.pNo), loading: "lazy", alt: p.name })));
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
    const makeBadgeChip = (kind, has, weight, op, iconSrc, label) => {
        const cls = `card-badge-chip ${kind}${has ? " is-on" : ""}`;
        const attrs = {
            class: cls,
            title: `${label}: ${op} ${fmtKg(weight)}kg${has ? " · 已拥有" : ""}`,
        };
        if (showBadges) {
            attrs.onclick = (ev) => {
                ev.stopPropagation();
                const set = kind === "small" ? state.smallBadges : state.bigBadges;
                setPigBadge(p.pNo, kind, !set.has(p.pNo));
                updateOwnedUI(p.pNo);
            };
        }
        const tag = showBadges ? "button" : "span";
        return el(tag, attrs, [
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
        onclick: () => runtime.showDetail(p.pNo),
    }, children);
}
// ---- 定点更新 (由 app.ts 注入) ----
let updateOwnedUIImpl = () => { };
export function setUpdateOwnedUI(fn) {
    updateOwnedUIImpl = fn;
}
function updateOwnedUI(pNo) {
    updateOwnedUIImpl(pNo);
}
export { setPigOwnedAfterConfirm };
