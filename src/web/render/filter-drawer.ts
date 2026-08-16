/**
 * 筛选抽屉 — 186 / Events / 拍卖场 共用的底部筛选弹层
 *
 * 顶部只保留搜索框 + 「筛选」按钮(带已选数量角标)。
 * 所有筛选条件以分组形式收纳在底部抽屉中, 点选即生效。
 */

import { state } from "../js/state.js";
import { $ } from "../js/utils.js";
import type { AtlasFilter, EventFilter } from "../js/types/index.js";

export type FilterSource = "atlas" | "events" | "auction";

interface DrawerSession {
  source: FilterSource;
  /** 抽屉打开时各 chip 的 active 状态快照, 用于「重置」 */
  snapshot: Record<string, string>;
}

let session: DrawerSession | null = null;

// ==================== 筛选行模板 ====================

function chipRowHTML(id: string, label: string, options: { value: string; text: string }[]): string {
  const chips = options.map(o =>
    `<button type="button" class="chip" data-value="${o.value}">${o.text}</button>`
  ).join("");
  return `<div class="filter-row" id="${id}">
    <span class="label">${label}</span>
    ${chips}
  </div>`;
}

const COLOR_CHIPS = (base: string): { value: string; text: string }[] => [
  { value: "肉色", text: '<span style="color:#ffcba4;text-shadow:0 0 1px rgba(0,0,0,0.2)">●</span> 肉色' },
  { value: "灰色", text: '<span style="color:#9e9e9e;text-shadow:0 0 1px rgba(0,0,0,0.2)">●</span> 灰色' },
  { value: "米色", text: '<span style="color:#a0522d;text-shadow:0 0 1px rgba(0,0,0,0.2)">●</span> 米色' },
  { value: "粉红", text: '<span style="color:#ffb6c1;text-shadow:0 0 1px rgba(0,0,0,0.2)">●</span> 粉红' },
  { value: "白色", text: '<span style="color:#ffffff;text-shadow:0 0 1px rgba(0,0,0,0.3)">●</span> 白色' },
  { value: "其他", text: '<span style="color:#8b4513;text-shadow:0 0 1px rgba(0,0,0,0.2)">●</span> 其他' },
];

const RARE_CHIPS = (): { value: string; text: string }[] => [
  { value: "1", text: '<span style="color:var(--star)">★</span>' },
  { value: "2", text: '<span style="color:var(--star)">★★</span>' },
  { value: "3", text: '<span style="color:var(--star)">★★★</span>' },
  { value: "4", text: '<span style="color:var(--star)">★★★★</span>' },
  { value: "5", text: '<span style="color:var(--star)">★★★★★</span>' },
];

const EVENT_RARE_CHIPS = (): { value: string; text: string }[] => [
  { value: "3", text: '<span style="color:var(--star-special)">★★★</span>' },
  { value: "4", text: '<span style="color:var(--star-special)">★★★★</span>' },
  { value: "5", text: '<span style="color:var(--star-special)">★★★★★</span>' },
  { value: "6", text: '<span style="color:var(--star-special)">★★★★★★</span>' },
];

const GRAZE_CHIPS = (): { value: string; text: string }[] => [
  { value: "yes", text: "放牧" },
  { value: "no", text: "不放牧" },
];

const PICKY_CHIPS = (): { value: string; text: string }[] => [
  { value: "none", text: "不挑食" },
  { value: "some", text: "有点挑食" },
  { value: "picky", text: "挑食" },
];

const METHOD_CHIPS = (): { value: string; text: string }[] => [
  { value: "shop", text: "商店进货" },
  { value: "hunt", text: "狩猎" },
  { value: "breed", text: "配种" },
  { value: "fail", text: "养成失败" },
];

const SHOP_RANK_CHIPS = (): { value: string; text: string }[] => [
  { value: "A", text: "A 级" },
  { value: "B", text: "B 级" },
  { value: "C", text: "C 级" },
];

const HUNT_REGION_CHIPS = (): { value: string; text: string }[] => [
  { value: "草原", text: "草原" },
  { value: "山林", text: "山林" },
  { value: "日本", text: "日本" },
  { value: "亚洲", text: "亚洲" },
  { value: "欧洲", text: "欧洲" },
  { value: "美洲", text: "美洲" },
  { value: "大洋洲", text: "大洋洲" },
];

const HUNT_TICKET_CHIPS = (): { value: string; text: string }[] => [
  { value: "normal", text: "普通券" },
  { value: "rare", text: "稀有券" },
];

// 拍卖场
const AUCTION_COLOR_CHIPS = (): { value: string; text: string }[] => [
  { value: "肉色", text: '<span style="color:#ffcba4;text-shadow:0 0 1px rgba(0,0,0,0.2)">●</span> 肉色' },
  { value: "灰色", text: '<span style="color:#9e9e9e;text-shadow:0 0 1px rgba(0,0,0,0.2)">●</span> 灰色' },
  { value: "米色", text: '<span style="color:#a0522d;text-shadow:0 0 1px rgba(0,0,0,0.2)">●</span> 米色' },
  { value: "粉色", text: '<span style="color:#ffb6c1;text-shadow:0 0 1px rgba(0,0,0,0.2)">●</span> 粉色' },
  { value: "白色", text: '<span style="color:#ffffff;text-shadow:0 0 1px rgba(0,0,0,0.3)">●</span> 白色' },
  { value: "其他", text: '<span style="color:#8b4513;text-shadow:0 0 1px rgba(0,0,0,0.2)">●</span> 其他' },
];

const AUCTION_FOOD_CHIPS = (): { value: string; text: string }[] => [
  { value: "1", text: "不挑食" },
  { value: "2", text: "有点挑食" },
  { value: "3", text: "挑食" },
];

const AUCTION_SEX_CHIPS = (): { value: string; text: string }[] => [
  { value: "0", text: "雄" },
  { value: "1", text: "雌" },
];

const AUCTION_SORT_CHIPS = (): { value: string; text: string }[] => [
  { value: "1", text: "最新上架" },
  { value: "0", text: "即将结束" },
];

const AUCTION_OWN_CHIPS = (): { value: string; text: string }[] => [
  { value: "no", text: "未拥有" },
  { value: "yes", text: "已拥有" },
  { value: "no_small", text: "缺小章" },
  { value: "no_big", text: "缺大章" },
];

// ==================== 各 tab 的筛选内容 ====================

function atlasDrawerHTML(): string {
  return [
    chipRowHTML("atlasColorFilter", "颜色", COLOR_CHIPS("atlas")),
    chipRowHTML("atlasRareFilter", "星级", RARE_CHIPS()),
    chipRowHTML("atlasGrazeFilter", "放牧", GRAZE_CHIPS()),
    chipRowHTML("atlasPickyFilter", "挑食", PICKY_CHIPS()),
    chipRowHTML("atlasMethodFilter", "方式", METHOD_CHIPS()),
    chipRowHTML("atlasShopRankFilter", "商店等级", SHOP_RANK_CHIPS()),
    chipRowHTML("atlasHuntRegionFilter", "狩猎区域", HUNT_REGION_CHIPS()),
    chipRowHTML("atlasHuntTicketFilter", "狩猎券", HUNT_TICKET_CHIPS()),
  ].join("");
}

function eventDrawerHTML(): string {
  return [
    chipRowHTML("eventColorFilter", "颜色", COLOR_CHIPS("event")),
    chipRowHTML("eventRareFilter", "星级", EVENT_RARE_CHIPS()),
    chipRowHTML("eventGrazeFilter", "放牧", GRAZE_CHIPS()),
    chipRowHTML("eventPickyFilter", "挑食", PICKY_CHIPS()),
  ].join("");
}

function auctionDrawerHTML(): string {
  return [
    chipRowHTML("auctionColorFilter", "颜色", AUCTION_COLOR_CHIPS()),
    chipRowHTML("auctionRareFilter", "星级", RARE_CHIPS()),
    chipRowHTML("auctionGrazeFilter", "放牧", GRAZE_CHIPS()),
    chipRowHTML("auctionFoodFilter", "挑食", AUCTION_FOOD_CHIPS()),
    chipRowHTML("auctionSexFilter", "性别", AUCTION_SEX_CHIPS()),
    chipRowHTML("auctionSortFilter", "排序", AUCTION_SORT_CHIPS()),
    chipRowHTML("auctionOwnFilter", "我的", AUCTION_OWN_CHIPS()),
  ].join("");
}

// ==================== 已选数量角标 ====================

function atlasActiveCount(): number {
  const f = state.atlasFilter as unknown as Record<string, string>;
  const keys: (keyof AtlasFilter)[] = ["color", "rare", "graze", "picky", "method", "shopRank", "huntRegion", "huntTicket"];
  return keys.filter(k => f[k as string]).length;
}

function eventActiveCount(): number {
  const f = state.eventFilter as unknown as Record<string, string>;
  const keys: (keyof EventFilter)[] = ["color", "rare", "graze", "picky"];
  return keys.filter(k => f[k as string]).length;
}

// 拍卖场筛选计数 — 由 auction.ts 提供
let auctionActiveCountFn: (() => number) | null = null;
export function setAuctionActiveCountFn(fn: () => number): void {
  auctionActiveCountFn = fn;
}
function auctionActiveCount(): number {
  return auctionActiveCountFn ? auctionActiveCountFn() : 0;
}

export function refreshFilterBadges(): void {
  const set = (id: string, n: number) => {
    const b = $(id) as HTMLElement | null;
    if (!b) return;
    if (n > 0) {
      b.hidden = false;
      b.textContent = String(n);
    } else {
      b.hidden = true;
    }
  };
  set("#atlasFilterBadge", atlasActiveCount());
  set("#eventFilterBadge", eventActiveCount());
  set("#auctionFilterBadge", auctionActiveCount());
}

// ==================== 抽屉开关 ====================

function setActiveChips(root: HTMLElement, activeValues: Record<string, string>): void {
  root.querySelectorAll<HTMLElement>(".filter-row").forEach(row => {
    const id = row.id;
    const activeVal = activeValues[id] ?? "";
    row.querySelectorAll<HTMLElement>(".chip").forEach(c =>
      c.classList.toggle("active", c.dataset.value === activeVal)
    );
  });
}

function collectActiveValues(root: HTMLElement): Record<string, string> {
  const out: Record<string, string> = {};
  root.querySelectorAll<HTMLElement>(".filter-row").forEach(row => {
    const chip = row.querySelector<HTMLElement>(".chip.active");
    out[row.id] = chip ? chip.dataset.value || "" : "";
  });
  return out;
}

function drawerHTMLFor(source: FilterSource): string {
  if (source === "atlas") return atlasDrawerHTML();
  if (source === "events") return eventDrawerHTML();
  return auctionDrawerHTML();
}

function titleFor(source: FilterSource): string {
  if (source === "atlas") return "📖 186图鉴 · 筛选";
  if (source === "events") return "🎉 Events图鉴 · 筛选";
  return "🏷️ 拍卖场 · 筛选";
}

export function openFilterDrawer(source: FilterSource, activeValues: Record<string, string>, onApply: (values?: Record<string, string>) => void): void {
  session = { source, snapshot: { ...activeValues } };
  const body = $("#filterDrawerBody");
  const bg = $("#filterDrawerBg");
  const drawer = $("#filterDrawer");
  const title = $("#filterDrawerTitle");
  if (!body || !bg || !drawer || !title) return;

  body.innerHTML = drawerHTMLFor(source);
  setActiveChips(body, activeValues);
  title.textContent = titleFor(source);

  // 186图鉴: 根据「获得方式」联动显示 狩猎区域/门票/商店等级
  if (source === "atlas") {
    updateAtlasMethodSubrows(body, activeValues.method || "");
  }

  bg.classList.add("open");
  drawer.classList.add("open");
  document.body.style.overflow = "hidden";

  // 点击 chip: 已选中的再点一次取消(不选=全部); 拍卖场即时写回生效
  body.addEventListener("click", (e: Event) => {
    const chip = (e.target as HTMLElement).closest(".chip") as HTMLElement | null;
    if (!chip) return;
    const row = chip.closest(".filter-row") as HTMLElement | null;
    if (!row) return;
    const wasActive = chip.classList.contains("active");
    // 排序行: 始终二选一, 点击当前项不取消
    const isSortRow = row.id === "auctionSortFilter";
    row.querySelectorAll<HTMLElement>(".chip").forEach(c => c.classList.remove("active"));
    if (!wasActive || isSortRow) chip.classList.add("active");

    if (source === "atlas" && row.id === "atlasMethodFilter") {
      const val = wasActive ? "" : (chip.dataset.value || "");
      updateAtlasMethodSubrows(body, val);
      // 切换获得方式时清空其子筛选
      if (val !== "hunt") {
        state.atlasFilter.huntRegion = "";
        state.atlasFilter.huntTicket = "";
      }
      if (val !== "shop") {
        state.atlasFilter.shopRank = "";
      }
      resetSubrowChips(body, val);
    }

    if (source === "auction") {
      onApply(collectActiveValues(body));
    }
  });

  // 拍卖场: chip 点击即时生效(写回 + 重渲染), 完成只是关闭
  // 186/Events: 完成时统一写回 state 并应用
  const done = $("#filterDrawerDone");
  if (done) {
    done.onclick = () => {
      if (!session) return;
      const values = collectActiveValues(body);
      if (source === "atlas") {
        Object.assign(state.atlasFilter, values);
      } else if (source === "events") {
        Object.assign(state.eventFilter, values);
      } else {
        // auction: 即时生效, 无需再次写回 (onApply 已处理)
      }
      closeFilterDrawer();
      onApply();
    };
  }

  // 「重置」
  const reset = $("#filterDrawerReset");
  if (reset) {
    reset.onclick = () => {
      if (!session) return;
      if (source === "atlas") {
        Object.assign(state.atlasFilter, {
          color: "", rare: "", graze: "", picky: "", method: "",
          shopRank: "", huntRegion: "", huntTicket: "",
        });
        body.querySelectorAll<HTMLElement>(".chip").forEach(c => c.classList.remove("active"));
        updateAtlasMethodSubrows(body, "");
      } else if (source === "events") {
        Object.assign(state.eventFilter, {
          color: "", rare: "", graze: "", picky: "",
        });
        body.querySelectorAll<HTMLElement>(".chip").forEach(c => c.classList.remove("active"));
      }
      closeFilterDrawer();
      onApply();
    };
  }
}

function resetSubrowChips(body: HTMLElement, method: string): void {
  if (method !== "hunt") {
    body.querySelectorAll<HTMLElement>("#atlasHuntRegionFilter .chip, #atlasHuntTicketFilter .chip").forEach(c =>
      c.classList.remove("active")
    );
  }
  if (method !== "shop") {
    body.querySelectorAll<HTMLElement>("#atlasShopRankFilter .chip").forEach(c =>
      c.classList.remove("active")
    );
  }
}

function updateAtlasMethodSubrows(body: HTMLElement, method: string): void {
  const showHunt = method === "hunt", showShop = method === "shop";
  const region = body.querySelector("#atlasHuntRegionFilter") as HTMLElement | null;
  const ticket = body.querySelector("#atlasHuntTicketFilter") as HTMLElement | null;
  const shop = body.querySelector("#atlasShopRankFilter") as HTMLElement | null;
  if (region) region.style.display = showHunt ? "" : "none";
  if (ticket) ticket.style.display = showHunt ? "" : "none";
  if (shop) shop.style.display = showShop ? "" : "none";
}

export function closeFilterDrawer(): void {
  const bg = $("#filterDrawerBg");
  const drawer = $("#filterDrawer");
  if (bg) bg.classList.remove("open");
  if (drawer) drawer.classList.remove("open");
  document.body.style.overflow = "";
  session = null;
}

export function isFilterDrawerOpen(): boolean {
  return session !== null;
}

/** 绑定三个 tab 的「筛选」按钮 (由 app.ts 调用) */
export function setupFilterDrawer(opts: {
  atlasApply: () => void;
  eventsApply: () => void;
  auctionApply: (values: Record<string, string>) => void;
  auctionActiveValues: () => Record<string, string>;
  atlasActiveValues: () => Record<string, string>;
  eventsActiveValues: () => Record<string, string>;
}): void {
  $("#atlasFilterBtn")?.addEventListener("click", () => {
    openFilterDrawer("atlas", opts.atlasActiveValues(), () => opts.atlasApply());
  });
  $("#eventFilterBtn")?.addEventListener("click", () => {
    openFilterDrawer("events", opts.eventsActiveValues(), () => opts.eventsApply());
  });
  $("#auctionFilterBtn")?.addEventListener("click", () => {
    openFilterDrawer("auction", opts.auctionActiveValues(), (values) => {
      opts.auctionApply(values ?? {});
    });
  });

  // 点击背景关闭
  $("#filterDrawerBg")?.addEventListener("click", () => {
    closeFilterDrawer();
  });
}
