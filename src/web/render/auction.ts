/**
 * 拍卖场 (Auction) — 模块化
 */

import type { AuctionRecord, AuctionFilter, AuctionState, Pig } from "../js/types/index.js";
import { state } from "../js/state.js";
import { $, el, imgUrl, fmtKg, badgeWeights } from "../js/utils.js";
import { isLoggedIn, getCurrentUser } from "../js/auth.js";
import { AUCTION_PAGE_SIZE, LIMITDATE_OFFSET_HOURS, WEIGHT_OFFSET_KG, ADULT_OFFSET_KG, COLOR_TO_P, FOOD_LABELS, SEX_LABELS, SEX_CLS } from "../js/constants.js";
import { emit } from "../js/events.js";
import { formatCountdown } from "../js/format.js";

const auctionState: AuctionState = {
  loading: false,
  loadingMore: false,
  records: [],
  error: null,
  fetchedAt: null,
  hasSearched: false,
  count: AUCTION_PAGE_SIZE,
  atEnd: false,
  server: "tw",
};

const auctionFilter: AuctionFilter = {
  color: "",
  rare: "",
  isExer: "",
  foodtype: "",
  sex: "",
  sort: "1",
  own: "",
};

let auctionLoadMoreObserver: IntersectionObserver | null = null;
let auctionCountdownTimer: ReturnType<typeof setInterval> | null = null;

function lookupPig(bType: number) {
  return state.pigsById.get(bType) || state.eventPigsById.get(bType) || null;
}

function isEventPigId(pNo: number): boolean {
  return !state.pigsById.has(pNo) && state.eventPigsById.has(pNo);
}

function filterAuctionByOwn(records: AuctionRecord[], own: string): AuctionRecord[] {
  if (!own) return records;
  return records.filter(rec => {
    const pNo = rec.bType;
    const known = state.pigsById.has(pNo) || state.eventPigsById.has(pNo);
    const owned = known && (
      isEventPigId(pNo)
        ? state.ownedEventPigs.has(pNo)
        : state.ownedSet.has(pNo)
    );
    if (own === "no") return !owned;
    if (own === "yes") return owned;
    if (own === "no_small") return owned && !state.smallBadges.has(pNo);
    if (own === "no_big") return owned && !state.bigBadges.has(pNo);
    return true;
  });
}

function parseLimitdate(s: string): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  d.setHours(d.getHours() + LIMITDATE_OFFSET_HOURS);
  return d;
}

function rareStars(n: number): string {
  const v = n || 0;
  if (v >= 6) return "★".repeat(6);
  const safe = Math.max(0, Math.min(5, v));
  return "★".repeat(safe) + "☆".repeat(5 - safe);
}

function buildSexBadge(v: number): HTMLElement | null {
  if (!(v in SEX_LABELS)) return null;
  return el("span", { class: SEX_CLS[v] }, SEX_LABELS[v]);
}

function buildAuctionOwnershipRow(pNo: number): HTMLElement | null {
  if (!pNo) return null;
  const known = state.pigsById.has(pNo) || state.eventPigsById.has(pNo);
  if (!known) return null;
  const owned = isEventPigId(pNo)
    ? state.ownedEventPigs.has(pNo)
    : state.ownedSet.has(pNo);
  const sm = state.smallBadges.has(pNo);
  const bg = state.bigBadges.has(pNo);
  return el("div", { class: "auction-own-row" }, [
    el("span", { class: "auction-own-chip pig" + (owned ? " is-on" : "") },
      owned ? "✅ 已拥有" : "⬜ 未拥有"),
    el("img", {
      src: "/img/small.png",
      class: "auction-own-badge" + (sm ? " is-on" : ""),
      alt: "小章",
      title: sm ? "已拿小章" : "未拿小章",
    }),
    el("img", {
      src: "/img/big.png",
      class: "auction-own-badge" + (bg ? " is-on" : ""),
      alt: "大章",
      title: bg ? "已拿大章" : "未拿大章",
    }),
  ]);
}

function buildBadgeForecast(rec: AuctionRecord, pig: Pig | null): HTMLElement | null {
  if (!pig) return null;
  const w = badgeWeights(pig);
  if (!w) return null;
  const adultOffset = pig.pNo === 50 ? (WEIGHT_OFFSET_KG + 278) : ADULT_OFFSET_KG;
  const adult = (rec.weight || 0) + adultOffset;
  const adultStr = adult.toFixed(1);
  if (adult < w.small) {
    const delta = (w.small - adult).toFixed(1);
    return el("span", {
      class: "auction-forecast small-ok",
      title: `预测成猪 ${adultStr}kg · 小章 ≤ ${fmtKg(w.small)}kg`,
    }, [
      el("img", { src: "/img/small.png", class: "auction-forecast-icon", alt: "小章" }),
      `可拿小章 · 还能涨 ${delta} kg`,
    ]);
  }
  const delta = (w.big - adult).toFixed(1);
  return el("span", {
    class: "auction-forecast big-todo",
    title: `预测成猪 ${adultStr}kg · 大章 ≥ ${fmtKg(w.big)}kg (小章已错过)`,
  }, [
    el("img", { src: "/img/big.png", class: "auction-forecast-icon", alt: "大章" }),
    `距大章 ${delta} kg`,
  ]);
}

function buildAuctionRow(rec: AuctionRecord): HTMLElement {
  const pig = lookupPig(rec.bType);
  const name = pig ? pig.name : "未知品种";
  const sublineParts: string[] = [];
  if (pig && pig.color_text) sublineParts.push(pig.color_text);
  else sublineParts.push(`bType=${rec.bType}`);
  const displayWeight = (rec.weight + WEIGHT_OFFSET_KG).toFixed(1);

  const thumb = el("div", { class: "thumb" },
    el("img", {
      src: imgUrl(rec.bType),
      loading: "lazy",
      alt: name,
      onerror: "this.style.display='none'",
    }),
  );

  const limit = parseLimitdate(rec.limitdate);
  const limitMs = limit ? limit.getTime() : 0;
  const cd = formatCountdown(limitMs);
  const countdownEl = el("span", {
    class: "auction-countdown " + cd.cls,
    "data-limit-ms": String(limitMs),
  }, "⏱ " + cd.text);

  const metaParts = [
    `⚖ ${displayWeight}kg`,
    FOOD_LABELS[rec.foodtype] || "🍽️ ?",
    rec.isExer ? "🌿 放牧" : "🏠 不放牧",
    rec.bidcount > 0 ? `已 ${rec.bidcount} 次出价` : "未出价",
  ];

  const sexBadge = buildSexBadge(rec.pigletOrSex);
  const nameChildren: (HTMLElement | Text | string)[] = [name];
  if (sexBadge) nameChildren.push(sexBadge);
  nameChildren.push(el("span", { class: "stars" }, rareStars(rec.rare)));

  const ownRow = buildAuctionOwnershipRow(rec.bType);
  const forecast = buildBadgeForecast(rec, pig);
  if (ownRow && forecast) ownRow.appendChild(forecast);
  const info = el("div", { class: "info" }, [
    el("div", { class: "name" }, nameChildren),
    el("div", { class: "meta" }, metaParts.join(" · ")),
    el("div", { class: "owner", title: rec.ownername },
      `${sublineParts.join(" · ")} · 出品 ${rec.ownername || "(匿名)"} · #${rec.pigNo}`),
    ownRow,
  ]);

  const priceCol = el("div", { class: "price-col" }, [
    el("div", { class: "price" }, [
      String(rec.nowPrice.toLocaleString()),
      el("span", { class: "pt" }, "pt"),
    ]),
    countdownEl,
  ]);

  return el("div", {
    class: "auction-list-row",
    onclick: () => {
      if (lookupPig(rec.bType)) emit("show-detail", rec.bType);
    },
  }, [thumb, info, priceCol]);
}

function renderAuctionTab(): void {
  const box = $("#auctionBody");
  if (!box) return;
  const statsBar = $("#auctionStatsBar");
  box.innerHTML = "";
  stopAuctionCountdown();

  if (auctionState.loading) {
    if (statsBar) statsBar.textContent = "加载中...";
    box.appendChild(el("div", { class: "loading" }, [
      el("div", { class: "spinner" }),
      el("div", {}, "正在拉取拍卖场数据..."),
    ]));
    return;
  }

  if (auctionState.error) {
    if (statsBar) statsBar.textContent = "加载失败";
    box.appendChild(el("div", { class: "auction-error" }, [
      el("div", {}, "❌ " + auctionState.error),
    ]));
    return;
  }

  if (!auctionState.records.length) {
    if (!auctionState.hasSearched) {
      if (statsBar) statsBar.textContent = "未加载";
      box.appendChild(el("div", { class: "loading" }, [
        el("div", {}, "选好筛选条件后点 🔍 查询"),
      ]));
    } else {
      if (statsBar) statsBar.textContent = "无结果";
      box.appendChild(el("div", { class: "loading" }, [
        el("div", {}, "没有符合条件的拍品,调一下筛选再试。"),
      ]));
    }
    return;
  }

  const fetched = auctionState.fetchedAt ? new Date(auctionState.fetchedAt) : null;
  const fetchedText = fetched ? fetched.toLocaleTimeString([], {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }) : "";
  const serverLabel = auctionState.server === "jp" ? "日服" : "台服";

  const shown = filterAuctionByOwn(auctionState.records, auctionFilter.own);
  const filterHint = auctionFilter.own ? ` · 筛后 ${shown.length} 条` : "";
  if (statsBar) statsBar.textContent =
    `${serverLabel} · 共 ${auctionState.records.length} 条${filterHint} · 更新于 ${fetchedText}`;

  if (shown.length === 0 && auctionFilter.own) {
    box.appendChild(el("div", { class: "loading" }, [
      el("div", {}, "当前结果里没有符合「我的」筛选的拍品 — 切换条件或多加载几条试试"),
    ]));
  } else {
    const list = el("div", { class: "auction-list" }, shown.map(buildAuctionRow));
    box.appendChild(list);
  }

  const footer = el("div", { class: "auction-footer" }, [
    auctionState.loadingMore
      ? el("div", { class: "loading-more" }, [
        el("div", { class: "spinner small" }), el("div", {}, "加载更多..."),
      ])
      : auctionState.atEnd
        ? el("div", { class: "load-end" }, `— 没有更多了 (cnt=${auctionState.count}) —`)
        : el("div", { class: "auction-sentinel" }, ""),
  ]);
  box.appendChild(footer);

  setupAuctionLoadMore();
  startAuctionCountdown();
}

function setupAuctionLoadMore(): void {
  if (auctionLoadMoreObserver) {
    auctionLoadMoreObserver.disconnect();
    auctionLoadMoreObserver = null;
  }
  const sentinel = document.querySelector<HTMLElement>("#auctionBody .auction-sentinel");
  if (!sentinel) return;
  auctionLoadMoreObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) loadMoreAuctions();
    }
  }, { rootMargin: "240px" });
  auctionLoadMoreObserver.observe(sentinel);
}

function startAuctionCountdown(): void {
  stopAuctionCountdown();
  auctionCountdownTimer = setInterval(() => {
    const nodes = document.querySelectorAll<HTMLElement>("#auctionBody .auction-countdown");
    nodes.forEach(node => {
      const ms = Number(node.getAttribute("data-limit-ms")) || 0;
      if (!ms) return;
      const cd = formatCountdown(ms);
      node.textContent = "⏱ " + cd.text;
      node.classList.remove("urgent", "soon");
      if (cd.cls) node.classList.add(cd.cls);
    });
  }, 1000);
}

function stopAuctionCountdown(): void {
  if (auctionCountdownTimer) {
    clearInterval(auctionCountdownTimer);
    auctionCountdownTimer = null;
  }
}

async function fetchAuctions({ append = false, server }: { append?: boolean; server?: "tw" | "jp" } = {}): Promise<void> {
  if (auctionState.loading || auctionState.loadingMore) return;
  if (!append) {
    auctionState.count = AUCTION_PAGE_SIZE;
    auctionState.atEnd = false;
    auctionState.records = [];
    if (server) auctionState.server = server;
  }
  if (append) auctionState.loadingMore = true;
  else auctionState.loading = true;
  auctionState.error = null;
  auctionState.hasSearched = true;
  renderAuctionTab();

  const prevCount = auctionState.records.length;
  try {
    if (!isLoggedIn()) {
      throw new Error("请先登录才能使用拍卖场功能");
    }

    const user = getCurrentUser();
    const qs = new URLSearchParams({
      count: String(auctionState.count),
      server: auctionState.server,
      userId: user!.id,
    });
    for (const [k, v] of Object.entries(auctionFilter)) {
      if (v === "") continue;
      if (k === "own") continue;
      if (k === "color") {
        const code = COLOR_TO_P[v];
        if (code) qs.set("color", code);
        continue;
      }
      qs.set(k === "isExer" ? "is_exer" : k, v);
    }
    const res = await fetch("/api/auction-search?" + qs.toString(), { method: "POST" });
    if (!res.ok) {
      if (res.status === 401) {
        throw new Error("登录已过期,请重新登录");
      }
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json() as { status?: string; error?: string; records?: AuctionRecord[] };
    if (data.status !== "ok") throw new Error(data.error || "未知错误");
    const newRecords = data.records || [];
    if (append && newRecords.length <= prevCount) {
      auctionState.atEnd = true;
    }
    auctionState.records = newRecords;
    auctionState.fetchedAt = Date.now();
  } catch (err) {
    auctionState.error = err instanceof Error ? err.message : String(err);
    console.warn("[auction] fetch failed:", err);
  } finally {
    auctionState.loading = false;
    auctionState.loadingMore = false;
    renderAuctionTab();
  }
}

async function loadMoreAuctions(): Promise<void> {
  if (auctionState.loading || auctionState.loadingMore || auctionState.atEnd) return;
  auctionState.count += AUCTION_PAGE_SIZE;
  await fetchAuctions({ append: true });
}

export function setupAuction(): void {
  // 筛选 chip 点击
  document.querySelectorAll<HTMLElement>("#tabAuction .filter-row").forEach(row => {
    const field = row.dataset.filter;
    if (!field) return;
    row.addEventListener("click", (e: Event) => {
      const chip = (e.target as HTMLElement).closest(".chip") as HTMLElement | null;
      if (!chip || !row.contains(chip)) return;
      auctionFilter[field as keyof AuctionFilter] = chip.dataset.value || "";
      row.querySelectorAll(".chip").forEach(c => c.classList.toggle("active", c === chip));
      if (field === "own" && auctionState.records.length) {
        renderAuctionTab();
      }
    });
  });

  $("#auctionSearchBtnTw")?.addEventListener("click", () => fetchAuctions({ server: "tw" }));
  $("#auctionSearchBtnJp")?.addEventListener("click", () => fetchAuctions({ server: "jp" }));
}

export function renderAuctionTabEntry(): void {
  renderAuctionTab();
}

export function stopAuctionForTeardown(): void {
  stopAuctionCountdown();
  if (auctionLoadMoreObserver) {
    auctionLoadMoreObserver.disconnect();
    auctionLoadMoreObserver = null;
  }
}
