/**
 * 养猪场mix图鉴助手 — 纯静态客户端
 *
 * 加载一次 /data/pigs_full.json (~2.5MB, 621 只),客户端分流为
 * pigsById (186 主图鉴) + eventPigsById (425 活动猪)
 * Tabs: 全图鉴 (默认) / 收藏 / 添加
 * 用户收藏 (pNo 列表) 持久化在 localStorage
 * 筛选/搜索全在客户端, 全图鉴与收藏各有独立的 filter 状态
 */
(function () {
  "use strict";

  const STORAGE_KEY = "pig_collection_v1";
  // 独立于 186 主猪收藏的 "活动猪已拥有" 勾选。抽屉里 "它能配出的崽"
  // 如果产出是活动猪，旁边会有一个勾选框让用户标记是否已获得。
  const STORAGE_KEY_OWNED_EVENT = "pig_owned_event_v1";
  // 体型徽章独立持久化: 每只猪 (含活动猪) 都有「小章」「大章」两个独立目标，
  // 用 Set<pNo> 各自存一份，对称于 ownedEventPigs 的形状，便于简洁的 import/export。
  const STORAGE_KEY_BADGE_SMALL = "pig_badge_small_v1";
  const STORAGE_KEY_BADGE_BIG = "pig_badge_big_v1";
  // 集齐 186 后解锁的隐藏图鉴。这些 pNo 在 186图鉴 的 typeno=6 第3页里, 上游
  // 标的 isview=2 表示隐藏。解锁前完全不出现在任何 UI / 抽屉 / 配种引用里。
  const HIDDEN_PNOS = new Set([904, 905, 920, 921]);
  // pNo 800-805: 已从页面隐藏，不计入统计（数据仍保留在 JSON 中）
  const REMOVED_PNOS = new Set([800, 801, 802, 803, 804, 805]);
  const STORAGE_KEY_HIDDEN_UNLOCK = "pig_hidden_unlocked_v1";
  // 数据有两份: 上游原始繁体 (pigs_full.json) + zhconv 转的简体 (pigs_full_zhs.json)
  // 切换按钮 (#langBtn) 持久化偏好,默认简体
  const LANG_KEY = "lang_v1";
  const DATA_URL_BY_LANG = {
    zhs: "/data/pigs_full_zhs.json",
    zht: "/data/pigs_full.json",
  };
  function currentLang() {
    try { return localStorage.getItem(LANG_KEY) === "zht" ? "zht" : "zhs"; }
    catch { return "zhs"; }
  }
  // Local front-facing portrait per pig, downloaded by tools/download_portraits.py.
  const IMG_BASE = "/img/pigs/";

  const METHOD_LABELS = {
    shop: "商店进货",
    hunt: "狩猎",
    hunt_event: "活动狩猎",
    breed: "配种",
    fail: "养成失败",
    feed_special: "超分歧/超出世",
  };

  const HUNT_SITES = {
    3: "草原 (普通券)", 4: "山林 (普通券)",
    5: "草原 (稀有券)", 6: "山林 (稀有券)",
    7: "日本 (普通券)", 8: "日本 (稀有券)",
    9: "亚洲 (普通券)", 10: "亚洲 (稀有券)",
    11: "欧洲 (普通券)", 12: "欧洲 (稀有券)",
    13: "美洲和西印度群岛 (普通券)", 14: "美洲和西印度群岛 (稀有券)",
    15: "大洋洲 (普通券)", 16: "大洋洲 (稀有券)",
    81: "特别活动狩猎 一月", 82: "特别活动狩猎 二月",
    83: "特别活动狩猎 三月", 84: "特别活动狩猎 四月",
    85: "特别活动狩猎 五月", 86: "特别活动狩猎 六月",
    87: "特别活动狩猎 七月", 88: "特别活动狩猎 八月",
    89: "特别活动狩猎 九月", 90: "特别活动狩猎 十月",
    91: "特别活动狩猎 十一月", 92: "特别活动狩猎 十二月",
    98: "特别活动狩猎", 99: "特别活动狩猎",
  };

  // hunt region -> [normal_code, rare_code]
  const HUNT_REGION_CODES = {
    "草原": [3, 5],
    "山林": [4, 6],
    "日本": [7, 8],
    "亚洲": [9, 10],
    "欧洲": [11, 12],
    "美洲": [13, 14],
    "大洋洲": [15, 16],
  };
  const HUNT_NORMAL_CODES = new Set([3, 4, 7, 9, 11, 13, 15]);
  const HUNT_RARE_CODES = new Set([5, 6, 8, 10, 12, 14, 16]);

  // eatable id (1~8) -> 饲料名。上游 pigs.json 只存 id, 手工补上映射。
  const FEED_LABELS = {
    1: "杂粮",
    2: "素食MIX",
    3: "红薯",
    4: "玉米",
    5: "草本饲料",
    6: "橡子",
    7: "高级MIX",
    8: "松露",
  };

  // 图鉴 book (1~6) -> 颜色分类。上游 pig.color 字段对图鉴 6 (野猪) 的猪是错的
  // (都写作 1), 所以统一改按 book 派生 color_text。
  const BOOK_COLOR_TEXT = {
    1: "肉色",
    2: "灰色",
    3: "米色",
    4: "粉红",
    5: "白色",
    6: "其他",
  };

  // 上游 pig.color (1~6) -> 文本。给非主图鉴 (book=7 活动猪) 的兜底用,
  // 因为它们不参与 BOOK_COLOR_TEXT 的派生。
  const COLOR_TEXT = {
    1: "肉色", 2: "灰色", 3: "米色", 4: "粉红", 5: "白色", 6: "其他",
  };

  const BLEED_TYPE_TEXT = {
    1: "猪猪广场交配",
    0: "猪猪广场交配 [不能租借公猪]",
    "-1": "猪猪广场交配 [隐藏, 不能租借公猪]",
    3: "系统图交换所",
    4: "系统图交换所 [不能租借公猪]",
    "-3": "系统图交换所 (未开放)",
    "-4": "系统图交换所 [不能租借公猪] (未开放)",
    2: "活动限定系统图 [现时无法获得]",
  };

  // ----- state -----
  const state = {
    dataLoaded: false,
    pigsById: new Map(),           // pNo -> pig detail (186 只, 进入全图鉴)
    eventPigsById: new Map(),      // pNo -> 活动猪详情 (仅用于反向配种索引 + 抽屉产出显示)
    pigsByListKey: new Map(),      // `${book}-${listno}` -> pNo
    collection: loadCollection(),  // array of pNo
    ownedEventPigs: loadOwnedEventPigs(), // Set<pNo>, 仅针对活动猪
    smallBadges: loadBadgeSet(STORAGE_KEY_BADGE_SMALL), // Set<pNo>, 已拿过小章
    bigBadges: loadBadgeSet(STORAGE_KEY_BADGE_BIG),   // Set<pNo>, 已拿过大章
    hiddenUnlocked: loadHiddenUnlocked(),  // 集齐 186 触发的彩蛋图鉴是否已解锁
    hiddenPigsById: new Map(),              // 隐藏猪的完整数据 (4 只), 解锁后并入 pigsById
    atlasFilter: { color: "", rare: "", method: "", q: "", huntRegion: "", huntTicket: "", shopRank: "", graze: "", picky: "" }, // 186图鉴 tab
    eventFilter: { color: "", rare: "", q: "", graze: "", picky: "" }, // Events图鉴 tab
    // 我的 tab 有两层导航: mineView = "menu" | "main" | "event" | "add"
    // 主/活动子视图共享 mineFilter; 子视图决定数据源 (186 vs 活动)
    mineView: "menu",
    mineFilter: { owned: "", small: "", big: "", q: "" },
  };

  function loadCollection() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter(n => Number.isInteger(n)) : [];
    } catch {
      return [];
    }
  }
  function saveCollection() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.collection));
  }

  function loadOwnedEventPigs() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_OWNED_EVENT);
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return new Set(Array.isArray(arr) ? arr.filter(n => Number.isInteger(n)) : []);
    } catch {
      return new Set();
    }
  }
  function saveOwnedEventPigs() {
    localStorage.setItem(
      STORAGE_KEY_OWNED_EVENT,
      JSON.stringify(Array.from(state.ownedEventPigs))
    );
  }

  // 体型徽章 Set<pNo> 持久化 — 一个 key 只装一个 set。两个 key 共用这套读写
  // 逻辑，避免重复样板代码（小章 / 大章 形状完全一样）。
  function loadBadgeSet(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return new Set(Array.isArray(arr) ? arr.filter(n => Number.isInteger(n)) : []);
    } catch {
      return new Set();
    }
  }
  function saveBadgeSet(key, set) {
    localStorage.setItem(key, JSON.stringify(Array.from(set).sort((a, b) => a - b)));
  }
  function saveSmallBadges() { saveBadgeSet(STORAGE_KEY_BADGE_SMALL, state.smallBadges); }
  function saveBigBadges() { saveBadgeSet(STORAGE_KEY_BADGE_BIG, state.bigBadges); }

  function loadHiddenUnlocked() {
    try { return localStorage.getItem(STORAGE_KEY_HIDDEN_UNLOCK) === "1"; }
    catch { return false; }
  }
  function saveHiddenUnlocked() {
    try { localStorage.setItem(STORAGE_KEY_HIDDEN_UNLOCK, state.hiddenUnlocked ? "1" : "0"); }
    catch { }
  }

  // ----- 拥有/徽章 写入封装 (带联动) -----
  // 判定一只猪是不是活动猪 (走 ownedEventPigs 而非 collection)
  function isEventPigId(pNo) {
    return !state.pigsById.has(pNo) && state.eventPigsById.has(pNo);
  }
  // 标记/取消一只猪的"已拥有"。取消时联动清掉小章/大章。
  function setPigOwned(pNo, owned) {
    if (isEventPigId(pNo)) {
      if (owned) state.ownedEventPigs.add(pNo);
      else state.ownedEventPigs.delete(pNo);
      saveOwnedEventPigs();
    } else {
      const i = state.collection.indexOf(pNo);
      if (owned && i < 0) state.collection.push(pNo);
      else if (!owned && i >= 0) state.collection.splice(i, 1);
      saveCollection();
    }
    // 取消已拥有 → 联动清掉这只猪的小章/大章
    if (!owned) {
      let changed = false;
      if (state.smallBadges.has(pNo)) { state.smallBadges.delete(pNo); saveSmallBadges(); changed = true; }
      if (state.bigBadges.has(pNo)) { state.bigBadges.delete(pNo); saveBigBadges(); changed = true; }
      void changed;
    }
    // 标记拥有 → 顺手检查是否集齐 186 触发彩蛋
    if (owned && !isEventPigId(pNo)) checkAndUnlockHidden();
  }
  // 标记/取消小章或大章。标记时联动把猪自动标为已拥有。
  function setPigBadge(pNo, kind, on) {
    const set = kind === "small" ? state.smallBadges : state.bigBadges;
    if (on) set.add(pNo);
    else set.delete(pNo);
    if (kind === "small") saveSmallBadges();
    else saveBigBadges();
    // 勾上徽章 → 联动把猪标为已拥有 (若还没标)
    if (on) {
      const alreadyOwned = isEventPigId(pNo)
        ? state.ownedEventPigs.has(pNo)
        : state.collection.includes(pNo);
      if (!alreadyOwned) setPigOwned(pNo, true);
    }
  }

  // ----- picky-eating derivation -----
  // 按 eatable 长度判定挑食程度 (与 arrival_comment 里的 挑食/不挑食 100% 对齐):
  //   0 种 -> 不挑食
  //   1 种 -> 挑食 (只吃这一种)
  //   2+ 种 -> 有点挑食 (吃这几种)
  function pigPicky(p) {
    const ids = (p.eatable || []).filter(i => FEED_LABELS[i]);
    const foods = ids.map(i => FEED_LABELS[i]);
    if (ids.length === 0) return { level: "none", label: "不挑食", foods };
    if (ids.length === 1) return { level: "picky", label: "挑食", foods };
    return { level: "some", label: "有点挑食", foods };
  }

  // ----- dom helpers -----
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  function text(s) { return document.createTextNode(String(s)); }
  function el(tag, attrs = {}, children = []) {
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

  function toast(msg, ms = 1800) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), ms);
  }

  // 集齐 186 后的解锁庆祝弹窗 — 动态注入, 点关闭按钮 / 背景 / Esc 消失
  function showUnlockCelebration() {
    // 防止重复弹
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

  // Every pig has one canonical portrait at /img/pigs/{pNo}.png.
  // pNo is always present on both top-level pigs and nested pigKind refs.
  function imgUrl(pNo) {
    return pNo ? `${IMG_BASE}${pNo}.png` : "";
  }

  // ----- badge weight (体型徽章) display formula -----
  // Upstream API stores `bigWeight` / `smallWeight` as raw "growth points".
  // The in-game scale adds a fixed +120 kg adult-baseline offset.
  const WEIGHT_OFFSET_BASE = 120;
  function badgeOffset(_pNo) {
    return WEIGHT_OFFSET_BASE;
  }
  // Format a weight value to one decimal, trimming a useless trailing ".0"
  // when it'd just add visual noise (e.g. 175 vs 175.0 — keep the .0 for
  // consistency with the official site).
  function fmtKg(v) {
    if (typeof v !== "number" || !isFinite(v)) return "?";
    return (Math.round(v * 10) / 10).toFixed(1);
  }
  function badgeWeights(pig) {
    if (!pig || typeof pig.bigWeight !== "number" || typeof pig.smallWeight !== "number") {
      return null;
    }
    const off = badgeOffset(pig.pNo);
    return {
      small: pig.smallWeight + off,
      big: pig.bigWeight + off,
      smallRaw: pig.smallWeight,
      bigRaw: pig.bigWeight,
      offset: off,
    };
  }
  // Render the "体型徽章" inline meta row that lives directly in the drawer
  // hero. Each pig has two independent badge targets (小章 / 大章); each
  // chip is a click-to-toggle "已获得" tracker that mirrors the activity-pig
  // owned-toggle pattern (Set<pNo> in state, persisted to localStorage).
  // The chip itself also conveys the threshold weight using the same +120kg
  // adult-baseline formula as the official site, so players can match
  // numbers directly against the in-game scale without doing any math.
  function badgeMetaHTML(pig) {
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

  function stars(rare, special) {
    // 与拍卖场对齐: 满槽 5 颗,实心 ★ + 空心 ☆。
    // 6 星 (活动猪最高档) 直接显示 6 颗实心,没有空槽。
    // 活动猪 special=true 沿用 .stars.special 颜色区分。
    const n = rare || 0;
    if (n >= 6) return "★".repeat(6);
    const filled = Math.max(0, Math.min(5, n));
    return "★".repeat(filled) + "☆".repeat(5 - filled);
  }

  // 上游 eatable_time 字段语义 (按玩家实测):
  //   0   → 默认最短间隔 58 分钟 (绝大多数猪)
  //   0.5 → 30 分钟
  //   N≥1 → N 小时
  function feedIntervalText(eatable_time) {
    if (eatable_time == null) return "?";
    if (eatable_time === 0) return "58 分钟";
    if (eatable_time < 1) return `${Math.round(eatable_time * 60)} 分钟`;
    return `${eatable_time} 小时`;
  }

  // ----- data load -----
  // 把上游原始 list.typeno/listno 推导成 book/page/slot/color_text
  // (旧 pigs.json 由 scrape_all.py 的 enrich() 预先生成,
  // 新 pigs_full.json 是原始数据,需要客户端补)。
  function enrichPig(p) {
    const info = p.list || {};
    const typeno = info.typeno;
    const listno = info.listno;
    if (typeno && typeno >= 1 && typeno <= 6 && listno) {
      p.book = typeno;
      p.page = Math.ceil(listno / 6);
      p.slot = ((listno - 1) % 6) + 1;
    } else if (typeno === 7 && listno) {
      p.book = 7;
      p.page = null;
      p.slot = null;
    } else {
      p.book = typeno;
      p.page = null;
      p.slot = null;
    }
    const bookColor = BOOK_COLOR_TEXT[p.book];
    if (bookColor) {
      p.color_text = bookColor;
    } else if (COLOR_TEXT[p.color]) {
      p.color_text = COLOR_TEXT[p.color];
    } else if (p.special) {
      p.color_text = "其他";
    }
    return p;
  }

  async function loadData() {
    // 每次重新加载时根据当前语言挑选 URL,允许运行时切换
    const res = await fetch(DATA_URL_BY_LANG[currentLang()]);
    if (!res.ok) throw new Error("加载数据失败: " + res.status);
    const bundle = await res.json();
    if (!bundle || !Array.isArray(bundle.pigs)) throw new Error("数据格式错误");

    // 从 pigs_full.json 派生:
    //   - pigsById   = typeno 1~6 + isview=1 的 186 只主图鉴 (进入全图鉴/收藏/添加)
    //   - eventPigsById = typeno=7 的活动猪 (进入新 Events tab + 抽屉反向配种)
    //   - 其他 (isview=0/2、typeno=False) 只入 eventPigsById, 不参与主流程
    //   - 隐藏 pNo (HIDDEN_PNOS) 单独入 hiddenPigsById, 解锁后才并入 pigsById
    for (const raw of bundle.pigs) {
      const p = enrichPig(raw);
      // REMOVED_PNOS: 从页面完全隐藏，不计入任何统计
      if (REMOVED_PNOS.has(p.pNo)) continue;
      const info = p.list || {};
      if (HIDDEN_PNOS.has(p.pNo)) {
        state.hiddenPigsById.set(p.pNo, p);
        continue;
      }
      const isMain = info.typeno >= 1 && info.typeno <= 6 && info.isview === 1;
      if (isMain) {
        state.pigsById.set(p.pNo, p);
        if (info.typeno && info.listno) {
          state.pigsByListKey.set(`${info.typeno}-${info.listno}`, p.pNo);
        }
      } else {
        state.eventPigsById.set(p.pNo, p);
      }
    }

    // 已解锁过 → 把隐藏图鉴并进主图鉴
    if (state.hiddenUnlocked) mergeHiddenIntoMain();

    buildBreedingIndex();
    state.dataLoaded = true;
    return bundle;
  }

  // 把隐藏猪并入 pigsById + pigsByListKey (不触发庆祝弹窗)
  function mergeHiddenIntoMain() {
    for (const p of state.hiddenPigsById.values()) {
      state.pigsById.set(p.pNo, p);
      const info = p.list || {};
      if (info.typeno && info.listno) {
        state.pigsByListKey.set(`${info.typeno}-${info.listno}`, p.pNo);
      }
    }
  }

  // 集齐 186 主图鉴的判定 (彩蛋触发条件)
  function basePigPNos() {
    const out = [];
    for (const pNo of state.pigsById.keys()) {
      if (!HIDDEN_PNOS.has(pNo)) out.push(pNo);
    }
    return out;
  }
  function checkAndUnlockHidden() {
    if (state.hiddenUnlocked) return false;
    if (!state.dataLoaded) return false;
    const base = basePigPNos();
    if (base.length === 0) return false;
    const ownedSet = new Set(state.collection);
    for (const pNo of base) {
      if (!ownedSet.has(pNo)) return false;
    }
    // 全集齐 → 解锁
    state.hiddenUnlocked = true;
    saveHiddenUnlocked();
    mergeHiddenIntoMain();
    buildBreedingIndex();
    showUnlockCelebration();
    return true;
  }

  // Reverse breeding index: pNo -> Array<{ partner, isview, any, result }>.
  // The upstream `arrival_bleed` on each pig Y lists recipes that PRODUCE Y
  // ("A + B -> Y"). To answer "what can X breed?", walk every Y's recipes and
  // register X under both parent slots it appears in. A single pairing
  // (A + B, isview) usually shows up on multiple children's arrival_bleed
  // (each carrying the full result[] of outcomes), so we dedupe per parent.
  function buildBreedingIndex() {
    state.breedByParent = new Map();
    const seen = new Map();
    function addEntry(pNo, entry) {
      const key = `${entry.partner ? entry.partner.pNo : "any"}-${entry.isview}-${entry.any ? 1 : 0}`;
      if (!seen.has(pNo)) seen.set(pNo, new Set());
      const s = seen.get(pNo);
      if (s.has(key)) return;
      s.add(key);
      if (!state.breedByParent.has(pNo)) state.breedByParent.set(pNo, []);
      state.breedByParent.get(pNo).push(entry);
    }
    // 同时遍历 186 + 活动猪的 arrival_bleed。
    // 活动猪配方的意义: 某个 186 猪 X 与某个亲本 B 配 -> 活动猪 Y。
    // 这样从 X 的抽屉里就能看到活动猪 Y 作为产出。
    const sources = [state.pigsById.values(), state.eventPigsById.values()];
    for (const iter of sources) {
      for (const pig of iter) {
        for (const r of pig.arrival_bleed || []) {
          const p1 = r.pNo1 || {}, p2 = r.pNo2 || {};
          const result = r.result || [];
          if (p1.pNo) {
            addEntry(p1.pNo, {
              partner: r.any ? null : (p2.pNo ? p2 : null),
              isview: r.isview,
              any: !!r.any,
              result,
            });
          }
          if (p2.pNo && !r.any) {
            addEntry(p2.pNo, {
              partner: p1.pNo ? p1 : null,
              isview: r.isview,
              any: false,
              result,
            });
          }
        }
      }
    }
  }

  // ----- acquisition derivation (from upstream pig detail) -----
  function deriveAcquisitions(pig) {
    const groups = { shop: [], hunt: [], hunt_event: [], fail: [], feed_special: [] };

    const add = pig.add_rank || [0, 0, 0];
    const costs = [1000, 500, 100], labels = ["A", "B", "C"];
    for (let i = 0; i < 3; i++) {
      if (add[i] > 0) {
        groups.shop.push(`${labels[i]}级 ${costs[i]}pt  概率 ${(add[i] * 100).toFixed(2)}%`);
      }
    }

    const places = pig.arrival_place || [];
    const hp = pig.hunt_prob || [];
    const pickProb = (m, code) => {
      if (!m || typeof m !== "object") return null;
      return m[String(code)] != null ? m[String(code)] : m[code];
    };
    const hAny = hp[0] || {}, hSame = hp[1] || {};
    for (const code of places) {
      if (code >= 3 && code <= 16) {
        const site = HUNT_SITES[code] || `siteid=${code}`;
        const a = pickProb(hAny, code), s = pickProb(hSame, code);
        const ex = (a || s) ? `  [任意 ${((a || 0) * 100).toFixed(2)}% / 按幼猪 ${((s || 0) * 100).toFixed(2)}%]` : "";
        groups.hunt.push(site + ex);
      } else if (code >= 81 && code <= 99) {
        const site = HUNT_SITES[code] || `siteid=${code}`;
        groups.hunt_event.push(site);
      }
    }


    for (const f of pig.arrival_fail || []) {
      groups.fail.push(`养成失败自 #${f.pNo} ${f.name}`);
    }

    // feed_special: check if THIS pig has its own evolution requirements
    const fs = pig.feed_special || {};
    if (fs && typeof fs === "object" && fs[String(pig.pNo)]) {
      groups.feed_special.push("有超分歧/超出世系条件 (详情见描述)");
    }

    return groups;
  }

  function pigHasMethod(pig, method) {
    if (!method) return true;
    const g = deriveAcquisitions(pig);
    if (method === "breed") return (pig.arrival_bleed || []).length > 0;
    return (g[method] || []).length > 0;
  }

  // Return true iff `pig` has a positive add_rank probability for the given letter.
  // rank: "" | "A" | "B" | "C"
  function pigMatchesShopRank(pig, rank) {
    if (!rank) return true;
    const idx = rank === "A" ? 0 : rank === "B" ? 1 : rank === "C" ? 2 : -1;
    if (idx < 0) return true;
    const add = pig.add_rank || [0, 0, 0];
    return (add[idx] || 0) > 0;
  }

  // Return true iff `pig` has a hunt entry matching (region, ticket).
  // region: "" | "草原" | "山林" | ... ; ticket: "" | "normal" | "rare"
  function pigMatchesHunt(pig, region, ticket) {
    if (!region && !ticket) return true;
    const places = pig.arrival_place || [];
    for (const code of places) {
      if (!(code >= 3 && code <= 16)) continue;
      if (region) {
        const pair = HUNT_REGION_CODES[region];
        if (!pair || pair.indexOf(code) < 0) continue;
      }
      if (ticket === "normal" && !HUNT_NORMAL_CODES.has(code)) continue;
      if (ticket === "rare" && !HUNT_RARE_CODES.has(code)) continue;
      return true;
    }
    return false;
  }

  // ----- render: grid -----
  function filterPigs(pigs, filter) {
    const { color, rare, method, q, huntRegion, huntTicket, shopRank, graze, picky } = filter;
    const ql = (q || "").toLowerCase();
    return pigs.filter(p => {
      if (color && p.color_text !== color) return false;
      if (rare && String(p.rare) !== rare) return false;
      if (method && !pigHasMethod(p, method)) return false;
      if (method === "hunt" && !pigMatchesHunt(p, huntRegion, huntTicket)) return false;
      if (method === "shop" && !pigMatchesShopRank(p, shopRank)) return false;
      if (graze === "yes" && !p.isExer) return false;
      if (graze === "no" && p.isExer) return false;
      if (picky && pigPicky(p).level !== picky) return false;
      if (ql) {
        const hay = ((p.name || "") + " " + (p.description || "") + " " + (p.pNo ?? "")).toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      return true;
    });
  }

  function sortPigs(pigs) {
    return pigs.slice().sort((a, b) =>
      (a.book - b.book) || (a.page - b.page) || (a.slot - b.slot) || (a.pNo - b.pNo)
    );
  }

  // 我的 tab: 把 186 主图鉴 + 活动猪并到一起,按 mineFilter 筛
  //   type:  ""|main|event  - 类型
  //   owned: ""|yes|no       - 是否已拥有 (186 看 collection, 活动看 ownedEventPigs)
  //   small: ""|yes|no       - 小章是否已拿
  //   big:   ""|yes|no       - 大章是否已拿
  //   q:     搜索 (name + description)
  function pigIsOwned(p) {
    if (p.book === 7) return state.ownedEventPigs.has(p.pNo);
    return state.collection.includes(p.pNo);
  }
  function currentMinePigs() {
    const { owned, small, big, q } = state.mineFilter;
    const ql = (q || "").toLowerCase();
    const out = [];
    // 数据源由当前子视图决定: main 只看 186, event 只看活动猪
    const sources = [];
    if (state.mineView === "main") sources.push(state.pigsById.values());
    else if (state.mineView === "event") sources.push(state.eventPigsById.values());
    // mineView=menu/add 时不渲染列表, sources 留空即可
    for (const iter of sources) {
      for (const p of iter) {
        const isOwn = pigIsOwned(p);
        if (owned === "yes" && !isOwn) continue;
        if (owned === "no" && isOwn) continue;
        const hasSmall = state.smallBadges.has(p.pNo);
        const hasBig = state.bigBadges.has(p.pNo);
        if (small === "yes" && !hasSmall) continue;
        if (small === "no" && hasSmall) continue;
        if (big === "yes" && !hasBig) continue;
        if (big === "no" && hasBig) continue;
        if (ql) {
          const hay = ((p.name || "") + " " + (p.description || "") + " " + (p.pNo ?? "")).toLowerCase();
          if (!hay.includes(ql)) continue;
        }
        out.push(p);
      }
    }
    // 排序: 主图鉴在前(按 book/page/slot), 活动在后(按 pNo)
    out.sort((a, b) => {
      const aMain = a.book && a.book <= 6 ? 0 : 1;
      const bMain = b.book && b.book <= 6 ? 0 : 1;
      if (aMain !== bMain) return aMain - bMain;
      if (aMain === 0) {
        return (a.book - b.book) || (a.page - b.page) || (a.slot - b.slot) || (a.pNo - b.pNo);
      }
      return a.pNo - b.pNo;
    });
    return out;
  }

  function currentAtlasPigs() {
    return sortPigs(filterPigs([...state.pigsById.values()], state.atlasFilter));
  }

  // 活动猪过滤: 颜色 / 星级 / 放牧 / 挑食 / 搜索;
  // 已拥有/未拥有的视图在 我的 tab 里看。按 pNo 升序展示。
  function filterEventPigs(pigs, filter) {
    const { color, rare, q, graze, picky } = filter;
    const ql = (q || "").toLowerCase();
    return pigs.filter(p => {
      if (color && p.color_text !== color) return false;
      if (rare && String(p.rare) !== rare) return false;
      if (graze === "yes" && !p.isExer) return false;
      if (graze === "no" && p.isExer) return false;
      if (picky && pigPicky(p).level !== picky) return false;
      if (ql) {
        const hay = ((p.name || "") + " " + (p.description || "") + " " + (p.pNo ?? "")).toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      return true;
    });
  }

  function currentEventPigs() {
    const pigs = filterEventPigs([...state.eventPigsById.values()], state.eventFilter);
    return pigs.sort((a, b) => (a.pNo - b.pNo));
  }

  // Shared card renderer。统一行为:
  //   - 角上恒有「✅ 已拥有 / ⬜ 未拥有」按钮(186 改 collection, 活动改 ownedEventPigs)
  //   - 已拥有的卡片画绿色边框 (.collected)
  //   - opts.showBadges = true 时在卡片底部展示小章/大章 chip (可点切换)
  // opts:
  //   showCollected (default true) - 是否高亮已拥有的卡 + 显示角标。
  //                                  关掉用于纯只读列表。
  //   showBadges    (default false) - 是否在底部显示徽章 chip。
  function buildCard(p, opts) {
    const { showCollected = true, showBadges = false } = opts || {};
    const posText = p.book && p.book <= 6
      ? `图鉴${p.book} 页${p.page} #${p.slot}`
      : (p.book === 7 ? "Events图鉴" : "");
    const isEvent = p.book === 7 || !state.pigsById.has(p.pNo);
    const isOwn = isEvent
      ? state.ownedEventPigs.has(p.pNo)
      : state.collection.includes(p.pNo);
    const children = [];
    if (showCollected) {
      children.push(el("button", {
        class: "card-owned-toggle" + (isOwn ? " is-on" : ""),
        "aria-pressed": String(isOwn),
        title: isOwn ? "已拥有 — 点击取消" : "标记为已拥有",
        onclick: ev => {
          ev.stopPropagation();
          setPigOwned(p.pNo, !isOwn);
          render();
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
    const pickyEl = el("span", {
      class: "picky " + picky.level,
      title: pickyTitle,
    }, pickyLabel);
    const feedN = p.eat_times || 0;
    const feedBadge = el("span", {
      class: "feed",
      title: `最少喂食 ${feedN} 次`,
    }, `🍚 ${feedN}`);
    // 小章 / 大章 chip: 始终显示, 默认空 chip;showBadges=true 时可点击切换
    const w = badgeWeights(p);
    const hasSm = state.smallBadges.has(p.pNo);
    const hasBg = state.bigBadges.has(p.pNo);
    const makeBadgeChip = (kind, has, weight, op, iconSrc, label) => {
      const cls = `card-badge-chip ${kind}${has ? " is-on" : ""}`;
      const attrs = {
        class: cls,
        title: `${label}: ${op} ${fmtKg(weight)}kg${has ? " · 已拥有" : ""}`,
      };
      if (showBadges) {
        attrs.onclick = ev => {
          ev.stopPropagation();
          const set = kind === "small" ? state.smallBadges : state.bigBadges;
          setPigBadge(p.pNo, kind, !set.has(p.pNo));
          render();
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
      el("div", { class: "name" }, [
        el("span", { class: "pno" }, `#${p.pNo}`),
        ` ${p.name}`,
      ]),
      el("div", { class: "stars-row" + (p.special ? " special" : "") }, [
        el("span", { class: "stars" + (p.special ? " special" : "") }, stars(p.rare, p.special)),
      ]),
      el("div", { class: "sub" }, `${p.color_text || ""}${posText ? " · " + posText : ""}`),
      el("div", { class: "chip-row" }, [feedBadge, grazeBadge, pickyEl].filter(Boolean)),
      badgeRow,
    ]));
    return el("div", {
      class: "card" + (showCollected && isOwn ? " collected" : ""),
      onclick: () => showDetail(p.pNo),
    }, children);
  }

  function renderMineMenuCounts() {
    // 主菜单的两张猪图鉴卡片右下角显示拥有数 / 总数
    const m = $("#mineMenuMainCount");
    const e = $("#mineMenuEventCount");
    const pg = $("#mineMenuProgressSub");
    if (m) m.textContent = state.dataLoaded
      ? `已拥有 ${state.collection.length} / ${state.pigsById.size} 只`
      : "加载中…";
    if (e) e.textContent = state.dataLoaded
      ? `已拥有 ${state.ownedEventPigs.size} / ${state.eventPigsById.size} 只`
      : "加载中…";
    if (pg) {
      if (!state.dataLoaded) {
        pg.textContent = "加载中…";
      } else {
        const allOwn = state.collection.length + state.ownedEventPigs.size;
        const allTot = state.pigsById.size + state.eventPigsById.size;
        const pct = allTot > 0 ? ((allOwn / allTot) * 100).toFixed(1) : "0.0";
        pg.textContent = `按图鉴 / 星级 / 颜色 · 整体 ${allOwn}/${allTot} · ${pct}%`;
      }
    }
  }

  // ----- 进度面板 (我的 tab → menu view) -----
  // 把 186 主图鉴 + 活动猪按几个维度聚合,显示每个维度下"已拥有/总数"进度条。
  // 维度选择: 186 按章别/星级/颜色; 活动按章别/星级/颜色
  const COLOR_ORDER_PROG = ["肉色", "灰色", "米色", "粉红", "白色", "其他"];
  const COLOR_DOT_PROG = {
    "肉色": "#ffcba4",
    "灰色": "#9e9e9e",
    "米色": "#a0522d",
    "粉红": "#ffb6c1",
    "白色": "#ffffff",
    "其他": "#8b4513",
  };

  function bucketAdd(map, key, isOwn) {
    if (key == null || key === "") return;
    let cur = map.get(key);
    if (!cur) { cur = { total: 0, owned: 0 }; map.set(key, cur); }
    cur.total++;
    if (isOwn) cur.owned++;
  }
  function buildProgressBuckets() {
    const main = {
      byRare: new Map(),
      byColor: new Map(),
      byBadge: new Map(),
    };
    const ownedMain = new Set(state.collection);
    for (const p of state.pigsById.values()) {
      const isOwn = ownedMain.has(p.pNo);
      bucketAdd(main.byRare, p.rare, isOwn);
      bucketAdd(main.byColor, p.color_text, isOwn);
      // 小章/大章: 只统计有 weight 字段的猪 (否则该猪不参与章别系统)
      if (typeof p.smallWeight === "number") {
        bucketAdd(main.byBadge, "small", state.smallBadges.has(p.pNo));
      }
      if (typeof p.bigWeight === "number") {
        bucketAdd(main.byBadge, "big", state.bigBadges.has(p.pNo));
      }
    }
    const event = {
      byRare: new Map(),
      byColor: new Map(),
      byBadge: new Map(),
    };
    for (const p of state.eventPigsById.values()) {
      const isOwn = state.ownedEventPigs.has(p.pNo);
      bucketAdd(event.byRare, p.rare, isOwn);
      bucketAdd(event.byColor, p.color_text, isOwn);
      if (typeof p.smallWeight === "number") {
        bucketAdd(event.byBadge, "small", state.smallBadges.has(p.pNo));
      }
      if (typeof p.bigWeight === "number") {
        bucketAdd(event.byBadge, "big", state.bigBadges.has(p.pNo));
      }
    }
    return { main, event };
  }
  // 单行进度: <label> <bar> <count>。集齐时 bar/count 加 .full 高亮。
  function progressRowHTML(label, bucket) {
    const pct = bucket.total > 0 ? (bucket.owned / bucket.total) * 100 : 0;
    const full = bucket.total > 0 && bucket.owned >= bucket.total;
    return `<div class="mp-row${full ? " full" : ""}">` +
      `<span class="mp-label">${label}</span>` +
      `<div class="mp-bar"><div class="mp-bar-fill" style="width:${pct.toFixed(1)}%"></div></div>` +
      `<span class="mp-count">${bucket.owned}/${bucket.total}${full ? " ✓" : ""}</span>` +
      `</div>`;
  }
  function progressGroupHTML(title, rowsHTML) {
    if (!rowsHTML) return "";
    return `<div class="mp-group">` +
      `<div class="mp-group-title">${title}</div>` +
      rowsHTML +
      `</div>`;
  }
  // Map<key, bucket> + keyOrder + 标签转换 → 拼一段 row HTML
  function bucketsToRows(map, keyOrder, labelFn) {
    return keyOrder
      .filter(k => map.has(k))
      .map(k => progressRowHTML(labelFn(k), map.get(k)))
      .join("");
  }
  function renderProgressPanel() {
    const root = $("#mineProgress");
    if (!root) return;
    if (!state.dataLoaded) {
      root.innerHTML = "";
      return;
    }
    const { main, event } = buildProgressBuckets();

    const rareOrder = [5, 4, 3, 2, 1];   // 5★ 在前,玩家更关心稀有
    const eventRareOrder = [6, 5, 4, 3, 2]; // Events 进度总览不显示 1★
    const badgeOrder = ["small", "big"];

    const starsLabel = (n, isEvent = false) => {
      // Events 里 3 星及以上用紫色 (--star-special), 与 Events 筛选 chip 一致
      const cls = isEvent && n >= 3 ? "mp-stars special" : "mp-stars";
      return `<span class="${cls}">${stars(n, false)}</span>`;
    };
    const colorLabel = c => {
      const dot = COLOR_DOT_PROG[c];
      return dot
        ? `<span class="mp-color-dot" style="background:${dot}"></span>${escHtml(c)}`
        : escHtml(c);
    };
    const badgeLabel = k => {
      const src = k === "small" ? "/img/small.png" : "/img/big.png";
      const name = k === "small" ? "小章" : "大章";
      return `<img src="${src}" class="badge-icon-tiny" alt="${name}"> ${name}`;
    };

    const mainRareRows = bucketsToRows(main.byRare, rareOrder, n => starsLabel(n, false));
    const mainColorRows = bucketsToRows(main.byColor, COLOR_ORDER_PROG, colorLabel);
    const mainBadgeRows = bucketsToRows(main.byBadge, badgeOrder, badgeLabel);
    const eventRareRows = bucketsToRows(event.byRare, eventRareOrder, n => starsLabel(n, true));
    const eventColorRows = bucketsToRows(event.byColor, COLOR_ORDER_PROG, colorLabel);
    const eventBadgeRows = bucketsToRows(event.byBadge, badgeOrder, badgeLabel);

    // 顶部总览数字
    const mainOwned = state.collection.length;
    const mainTotal = state.pigsById.size;
    // Events 总览排除 1★ (已在 eventRareOrder 中不显示 1★ 行)
    let eventOwned = 0, eventTotal = 0;
    for (const p of state.eventPigsById.values()) {
      if (p.rare === 1) continue;
      eventTotal++;
      if (state.ownedEventPigs.has(p.pNo)) eventOwned++;
    }
    const mainPct = mainTotal > 0 ? (mainOwned / mainTotal * 100).toFixed(1) : "0.0";
    const eventPct = eventTotal > 0 ? (eventOwned / eventTotal * 100).toFixed(1) : "0.0";

    const mainSection = `
      <details class="mp-section" open>
        <summary>
          <span class="mp-summary-title">📖 186图鉴</span>
          <span class="mp-summary-stat">${mainOwned}/${mainTotal} · ${mainPct}%</span>
        </summary>
        <div class="mp-body">
          ${progressGroupHTML("按章别", mainBadgeRows)}
          ${progressGroupHTML("按星级", mainRareRows)}
          ${progressGroupHTML("按颜色", mainColorRows)}
        </div>
      </details>
    `;
    const eventSection = `
      <details class="mp-section" open>
        <summary>
          <span class="mp-summary-title">🎉 Events图鉴</span>
          <span class="mp-summary-stat">${eventOwned}/${eventTotal} · ${eventPct}%</span>
        </summary>
        <div class="mp-body">
          ${progressGroupHTML("按章别", eventBadgeRows)}
          ${progressGroupHTML("按星级", eventRareRows)}
          ${progressGroupHTML("按颜色", eventColorRows)}
        </div>
      </details>
    `;

    root.innerHTML = `
      ${mainSection}
      ${eventSection}
    `;
  }

  function renderMineBody() {
    renderMineMenuCounts();
    renderProgressPanel();
    // mineView=menu/add 时列表不需要渲染 (DOM 已隐藏)
    if (state.mineView !== "main" && state.mineView !== "event") return;
    const box = $("#mineBody");
    if (!box) return;
    box.innerHTML = "";

    if (!state.dataLoaded) {
      box.appendChild(el("div", { class: "loading" }, [
        el("div", { class: "spinner" }),
        "正在加载图鉴数据…",
      ]));
      return;
    }

    const pigs = currentMinePigs();
    if (pigs.length === 0) {
      const f = state.mineFilter;
      const hasFilter = f.q || f.owned || f.small || f.big;
      const tabName = state.mineView === "event" ? "Events图鉴" : "186图鉴";
      if (!hasFilter) {
        box.appendChild(el("div", { class: "empty" }, [
          el("div", { class: "big" }, "🐽"),
          el("div", { class: "title" }, `${tabName} 还没有数据`),
          el("div", { class: "hint" }, `到 ${tabName} tab 点开一头猪,角上点「⬜ 未拥有」就能加进来`),
        ]));
      } else {
        box.appendChild(el("div", { class: "empty" }, [
          el("div", { class: "title" }, "没有符合筛选条件的猪"),
          el("div", { class: "hint" }, "调一下上面的「拥有 / 小章 / 大章」或清空搜索词"),
        ]));
      }
      return;
    }

    const grid = el("div", { class: "grid" });
    for (const p of pigs) grid.appendChild(buildCard(p, { showCollected: true, showBadges: true }));
    box.appendChild(grid);
  }

  function renderAtlasBody() {
    const box = $("#atlasBody");
    if (!box) return;
    box.innerHTML = "";

    if (!state.dataLoaded) {
      box.appendChild(el("div", { class: "loading" }, [
        el("div", { class: "spinner" }),
        "正在加载图鉴数据…",
      ]));
      return;
    }

    const pigs = currentAtlasPigs();
    if (pigs.length === 0) {
      box.appendChild(el("div", { class: "empty" }, [
        el("div", { class: "title" }, "没有符合筛选条件的猪"),
        el("div", { class: "hint" }, "试试换个颜色/获得方式，或清空搜索词"),
      ]));
      return;
    }

    const grid = el("div", { class: "grid" });
    for (const p of pigs) grid.appendChild(buildCard(p, { showCollected: true, showBadges: true }));
    box.appendChild(grid);
  }

  function renderEventsBody() {
    const box = $("#eventBody");
    if (!box) return;
    box.innerHTML = "";

    if (!state.dataLoaded) {
      box.appendChild(el("div", { class: "loading" }, [
        el("div", { class: "spinner" }),
        "正在加载图鉴数据…",
      ]));
      return;
    }

    const pigs = currentEventPigs();
    if (pigs.length === 0) {
      box.appendChild(el("div", { class: "empty" }, [
        el("div", { class: "title" }, "没有符合筛选条件的活动猪"),
        el("div", { class: "hint" }, "试试换个颜色 / 星级,或清空搜索词"),
      ]));
      return;
    }

    const grid = el("div", { class: "grid" });
    for (const p of pigs) grid.appendChild(buildCard(p, { showCollected: true, showBadges: true }));
    box.appendChild(grid);
  }

  function renderStatsBar() {
    // 186图鉴 tab: 当前筛选结果 / 总数 · 已拥有
    const asb = $("#atlasStatsBar");
    if (asb) {
      if (!state.dataLoaded) {
        asb.textContent = "";
      } else {
        const total = state.pigsById.size;
        const shown = currentAtlasPigs().length;
        const coll = state.collection.length;
        asb.textContent = `显示 ${shown} / 共 ${total} 只 · 已拥有 ${coll}`;
      }
    }

    // Events图鉴 tab: 当前筛选结果 / 共 425 · 已拥有
    const esb = $("#eventStatsBar");
    if (esb) {
      if (!state.dataLoaded) {
        esb.textContent = "";
      } else {
        const total = state.eventPigsById.size;
        const shown = currentEventPigs().length;
        const owned = state.ownedEventPigs.size;
        esb.textContent = `显示 ${shown} / 共 ${total} 只 · 已拥有 ${owned}`;
      }
    }

    // 我的 tab: 当前筛选结果 + 总览
    const msb = $("#mineStatsBar");
    if (msb) {
      if (!state.dataLoaded || (state.mineView !== "main" && state.mineView !== "event")) {
        msb.textContent = "";
      } else {
        const shown = currentMinePigs().length;
        const isMain = state.mineView === "main";
        const total = isMain ? state.pigsById.size : state.eventPigsById.size;
        const own = isMain ? state.collection.length : state.ownedEventPigs.size;
        // 小章/大章: 只统计属于当前子视图范围的猪
        const inScope = isMain
          ? (pNo) => state.pigsById.has(pNo)
          : (pNo) => state.eventPigsById.has(pNo);
        let sm = 0, bg = 0;
        for (const pNo of state.smallBadges) if (inScope(pNo)) sm++;
        for (const pNo of state.bigBadges) if (inScope(pNo)) bg++;
        msb.textContent = `显示 ${shown} 只 · 已拥有 ${own}/${total} · 小章 ${sm} · 大章 ${bg}`;
      }
    }
  }

  $("#clearBtn").addEventListener("click", () => {
    const nColl = state.collection.length;
    const nEv = state.ownedEventPigs.size;
    const nSm = state.smallBadges.size;
    const nBg = state.bigBadges.size;
    const wasUnlocked = state.hiddenUnlocked;
    const total = nColl + nEv + nSm + nBg + (wasUnlocked ? 1 : 0);
    if (total === 0) {
      toast("记录已经是空的");
      return;
    }
    if (!confirm("确定要清空全部记录吗?")) return;
    state.collection = [];
    state.ownedEventPigs = new Set();
    state.smallBadges = new Set();
    state.bigBadges = new Set();
    saveCollection();
    saveOwnedEventPigs();
    saveSmallBadges();
    saveBigBadges();
    // 重置隐藏图鉴解锁状态 + 把 4 只皇室猪从 pigsById / pigsByListKey 抽回去
    if (state.hiddenUnlocked) {
      state.hiddenUnlocked = false;
      saveHiddenUnlocked();
      for (const pNo of HIDDEN_PNOS) {
        const p = state.pigsById.get(pNo);
        if (!p) continue;
        state.pigsById.delete(pNo);
        const info = p.list || {};
        if (info.typeno && info.listno) {
          state.pigsByListKey.delete(`${info.typeno}-${info.listno}`);
        }
      }
      buildBreedingIndex();
    }
    if ($("#drawer").classList.contains("open")) closeDrawer();
    render();
    toast("已清空全部记录");
  });

  function render() {
    renderStatsBar();
    renderAtlasBody();
    renderEventsBody();
    renderMineBody();
    // sync 我的 tab 收藏管理 count
    const mc = $("#manageCount");
    if (mc) mc.textContent = `186 已拥有 ${state.collection.length} 只 · Events 已拥有 ${state.ownedEventPigs.size} 只 · 小章 ${state.smallBadges.size} · 大章 ${state.bigBadges.size}`;
    // keep name-search results fresh (e.g. "已添加" tag)
    if ($("#tabMine") && $("#tabMine").classList.contains("active")) renderNameResults();
  }

  // ----- triplet add flow -----
  function parseTriple(book, page, slot) {
    const b = parseInt(book, 10), p = parseInt(page, 10), s = parseInt(slot, 10);
    if (!(b >= 1 && b <= 6)) return { err: "图鉴需为 1~6" };
    if (!(p >= 1)) return { err: "页需 ≥ 1" };
    if (!(s >= 1 && s <= 6)) return { err: "格需为 1~6" };
    return { book: b, page: p, slot: s, listno: (p - 1) * 6 + s };
  }

  function addByPNo(pNo) {
    if (!state.dataLoaded) return { err: "数据还没加载好" };
    const p = state.pigsById.get(pNo);
    if (!p) return { err: `找不到 #${pNo}` };
    if (state.collection.includes(pNo)) {
      return { ok: false, pig: p, msg: `已在收藏中: #${pNo} ${p.name}` };
    }
    state.collection.push(pNo);
    saveCollection();
    return { ok: true, pig: p, msg: `已添加: #${pNo} ${p.name}` };
  }

  function addFromTriple(book, page, slot) {
    if (!state.dataLoaded) return { err: "数据还没加载好" };
    const parsed = parseTriple(book, page, slot);
    if (parsed.err) return { err: parsed.err };
    const key = `${parsed.book}-${parsed.listno}`;
    const pNo = state.pigsByListKey.get(key);
    if (!pNo) {
      return { err: `图鉴${parsed.book} 页${parsed.page} #${parsed.slot} 找不到对应的猪` };
    }
    return addByPNo(pNo);
  }

  function removePig(pNo) {
    const p = state.pigsById.get(pNo);
    const i = state.collection.indexOf(pNo);
    if (i < 0) return;
    state.collection.splice(i, 1);
    saveCollection();
    render();
    if (p) toast(`已移除: ${p.name}`);
  }

  $("#addForm").addEventListener("submit", ev => {
    ev.preventDefault();
    const b = $("#bookIn").value;
    const p = $("#pageIn").value;
    const s = $("#slotIn").value;
    const res = addFromTriple(b, p, s);
    const msg = $("#addMsg");
    if (res.err) {
      msg.innerHTML = `<span class="err">${res.err}</span>`;
      return;
    }
    msg.innerHTML = res.ok
      ? `<span class="ok">${res.msg}</span>`
      : `<span class="err">${res.msg}</span>`;
    if (res.ok) {
      toast(res.msg);
      render();
      // reset & focus first input for rapid entry
      $("#bookIn").value = "";
      $("#pageIn").value = "";
      $("#slotIn").value = "";
      $("#bookIn").focus();
    }
  });

  // auto-advance between fields
  function wireAutoAdvance() {
    const order = ["bookIn", "pageIn", "slotIn"];
    for (let i = 0; i < order.length; i++) {
      const cur = $("#" + order[i]);
      cur.addEventListener("input", e => {
        const v = e.target.value;
        // trigger advance once input reaches natural max length (digit count)
        const maxDigits = order[i] === "bookIn" ? 1 : (order[i] === "slotIn" ? 1 : 2);
        if (v && v.length >= maxDigits && i < order.length - 1) {
          $("#" + order[i + 1]).focus();
        }
      });
      cur.addEventListener("paste", e => {
        const data = (e.clipboardData || window.clipboardData).getData("text");
        const parts = data.trim().split(/[\s\/,.;#]+/).filter(Boolean);
        if (parts.length >= 3) {
          e.preventDefault();
          $("#bookIn").value = parts[0] || "";
          $("#pageIn").value = parts[1] || "";
          $("#slotIn").value = parts[2] || "";
          $("#addBtn").focus();
        }
      });
    }
  }
  wireAutoAdvance();

  // ----- filters & search -----
  function wireFilter(rootSel, filterObj, key, onChange) {
    $(rootSel).addEventListener("click", e => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      $$(".chip", $(rootSel)).forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      filterObj[key] = chip.dataset.value;
      if (onChange) onChange(chip.dataset.value);
      render();
    });
  }

  function resetChipRow(rootSel) {
    $$(".chip", $(rootSel)).forEach(c =>
      c.classList.toggle("active", c.dataset.value === ""));
  }

  // Each tab has its own method-driven sub-filter visibility (狩猎/商店).
  // 收藏 tab 用 prefix="" + lower-camel ID (huntRegionFilter ...)
  // 全图鉴 tab 用 prefix="atlas" + PascalCase (atlasHuntRegionFilter ...)
  function makeMethodSubUpdater(prefix, filterObj) {
    const id = (base) => prefix
      ? prefix + base[0].toUpperCase() + base.slice(1)
      : base;
    const regionSel = `#${id("huntRegionFilter")}`;
    const ticketSel = `#${id("huntTicketFilter")}`;
    const shopSel = `#${id("shopRankFilter")}`;
    return function update() {
      const m = filterObj.method;
      const showHunt = m === "hunt", showShop = m === "shop";
      $(regionSel).style.display = showHunt ? "" : "none";
      $(ticketSel).style.display = showHunt ? "" : "none";
      $(shopSel).style.display = showShop ? "" : "none";
      if (!showHunt) {
        filterObj.huntRegion = ""; filterObj.huntTicket = "";
        resetChipRow(regionSel); resetChipRow(ticketSel);
      }
      if (!showShop) {
        filterObj.shopRank = "";
        resetChipRow(shopSel);
      }
    };
  }
  const updateAtlasMethodSub = makeMethodSubUpdater("atlas", state.atlasFilter);

  // 186图鉴 tab filters (atlas prefix)
  wireFilter("#atlasColorFilter", state.atlasFilter, "color");
  wireFilter("#atlasRareFilter", state.atlasFilter, "rare");
  wireFilter("#atlasGrazeFilter", state.atlasFilter, "graze");
  wireFilter("#atlasPickyFilter", state.atlasFilter, "picky");
  wireFilter("#atlasMethodFilter", state.atlasFilter, "method", updateAtlasMethodSub);
  wireFilter("#atlasHuntRegionFilter", state.atlasFilter, "huntRegion");
  wireFilter("#atlasHuntTicketFilter", state.atlasFilter, "huntTicket");
  wireFilter("#atlasShopRankFilter", state.atlasFilter, "shopRank");

  // Events图鉴 tab filters
  wireFilter("#eventColorFilter", state.eventFilter, "color");
  wireFilter("#eventRareFilter", state.eventFilter, "rare");
  wireFilter("#eventGrazeFilter", state.eventFilter, "graze");
  wireFilter("#eventPickyFilter", state.eventFilter, "picky");

  // 我的 tab filters (子视图共用)
  wireFilter("#mineOwnedFilter", state.mineFilter, "owned");
  wireFilter("#mineSmallFilter", state.mineFilter, "small");
  wireFilter("#mineBigFilter", state.mineFilter, "big");

  // 我的 tab 两层导航: menu (默认) → main / event / add
  // 子视图标题 (显示在 mineSubHead 返回按钮右侧)
  const MINE_VIEW_TITLES = {
    main: "📖 186图鉴",
    event: "🎉 Events图鉴",
    progress: "📊 进度总览",
    add: "➕ 导入/导出",
    about: "ℹ️ 关于项目",
  };

  function setMineView(view) {
    state.mineView = view;
    const menu = $("#mineMenu");
    const listView = $("#mineListView");
    const addView = $("#mineAddView");
    const aboutView = $("#mineAboutView");
    const progressView = $("#mineProgressView");
    const subhead = $("#mineSubHead");
    const subheadTitle = $("#mineSubHeadTitle");
    menu.style.display = view === "menu" ? "" : "none";
    listView.style.display = (view === "main" || view === "event") ? "" : "none";
    addView.style.display = view === "add" ? "" : "none";
    if (aboutView) aboutView.style.display = view === "about" ? "" : "none";
    if (progressView) progressView.style.display = view === "progress" ? "" : "none";
    subhead.style.display = view === "menu" ? "none" : "";
    if (subheadTitle) subheadTitle.textContent = MINE_VIEW_TITLES[view] || "";
    render(); // 重新渲染列表 + 菜单上的统计
  }
  // 菜单卡片点击
  document.querySelectorAll("#mineMenu .mine-menu-card").forEach(btn => {
    btn.addEventListener("click", () => {
      const v = btn.dataset.mineView;
      if (v) setMineView(v);
    });
  });
  // 返回按钮
  $("#mineBackBtn").addEventListener("click", () => setMineView("menu"));

  function wireSearch(inputSel, filterObj) {
    let timer = null;
    $(inputSel).addEventListener("input", e => {
      const v = e.target.value;
      clearTimeout(timer);
      timer = setTimeout(() => {
        filterObj.q = v.trim();
        render();
      }, 200);
    });
  }
  wireSearch("#atlasSearch", state.atlasFilter);
  wireSearch("#eventSearch", state.eventFilter);
  wireSearch("#mineSearch", state.mineFilter);

  // Return true if a pNo resolves to either a 186 pig or an event pig.
  function isKnownPig(pNo) {
    return state.pigsById.has(pNo) || state.eventPigsById.has(pNo);
  }
  // `data-pno` attribute snippet — only emitted when the pNo resolves to a
  // pig we have data for (so drawer navigation never dead-links).
  function linkAttr(pNo) {
    return pNo && isKnownPig(pNo) ? ` data-pno="${pNo}"` : "";
  }

  // ----- drawer (detail) -----
  // Track the pig currently shown in the drawer so the delegated nav click
  // handler can ignore same-pig clicks.
  let currentDetailPNo = null;

  function showDetail(pNo) {
    const p = state.pigsById.get(pNo) || state.eventPigsById.get(pNo);
    if (!p) return;
    currentDetailPNo = pNo;
    const isEventPig = state.eventPigsById.has(pNo);
    const box = $("#drawerContent");
    let posText = "";
    if (p.book && p.book <= 6) {
      posText = `图鉴${p.book} 页${p.page} #${p.slot}`;
    } else if (isEventPig) {
      posText = `活动图鉴`;
    }

    // 统一: 主猪 + 活动猪都用同一个 已拥有/未拥有 切换按钮
    const isOwn = isEventPig
      ? state.ownedEventPigs.has(p.pNo)
      : state.collection.includes(p.pNo);
    const collectBtn = isOwn
      ? `<button type="button" class="add-btn danger" id="drawerCollectBtn">✅ 已拥有 — 点击取消</button>`
      : `<button type="button" class="add-btn" id="drawerCollectBtn">⬜ 未拥有 — 点击标记</button>`;

    const groups = deriveAcquisitions(p);
    const acqOrder = ["shop", "hunt", "hunt_event", "fail", "feed_special"];
    const acqHTML = [];
    for (const g of acqOrder) {
      if (!groups[g] || groups[g].length === 0) continue;
      const lines = groups[g].map(s => `<div>${escHtml(s)}</div>`).join("");
      acqHTML.push(
        `<div class="kv"><div class="k">${METHOD_LABELS[g] || g}</div>` +
        `<div class="v">${lines}</div></div>`
      );
    }
    if (acqHTML.length === 0) {
      acqHTML.push(`<div class="kv"><div class="v">无一般获得途径 (可能仅靠配种)</div></div>`);
    }

    // breed recipes
    const bleeds = p.arrival_bleed || [];
    const order = [1, 0, -1, 3, 4, -3, -4, 2];
    const byView = new Map();
    for (const b of bleeds) {
      const k = String(b.isview);
      if (!byView.has(k)) byView.set(k, []);
      byView.get(k).push(b);
    }
    // --- A + B = C 等式渲染 helpers -------------------------------------
    // 每个 .slot 展示 [图 + 名字 + (可选) 借猪费 / 概率 / 已拥有勾选]; 父母 slot
    // 若有已知 pNo 会带 data-pno 以支持点击跳转。"任意猪" 没有具体 pNo, 显示
    // 一个占位空盒。"产出" slot (右侧) 额外附概率; 若为当前猪本身, 加 is-self
    // 高亮; 活动猪再挂一个 owned-toggle。
    const renderParentSlot = (info) => {
      if (!info || info.any) {
        return `<div class="slot any">` +
          `<div class="slot-img-placeholder" aria-hidden="true">?</div>` +
          `<div class="pname">任意猪</div>` +
          `</div>`;
      }
      const img = imgUrl(info.pNo);
      return `<div class="slot"${linkAttr(info.pNo)}>` +
        (img ? `<img src="${img}" loading="lazy" alt="${escHtml(info.name || "")}">` : `<div class="slot-img-placeholder" aria-hidden="true">?</div>`) +
        `<div class="pname">${escHtml(info.name || "?")}</div>` +
        (info.rent ? `<div class="prent">借 ${info.rent}pt</div>` : "") +
        `</div>`;
    };
    const renderOutcomeSlot = (k, prob, { isSelf = false } = {}) => {
      const img = imgUrl(k.pNo);
      let ownedToggle = "";
      if (k.pNo && state.eventPigsById.has(k.pNo)) {
        const isOwned = state.ownedEventPigs.has(k.pNo);
        ownedToggle = `<span class="owned-toggle${isOwned ? " is-on" : ""}" data-owned-pno="${k.pNo}" role="checkbox" aria-checked="${isOwned}" title="标记是否已获得此活动猪">${isOwned ? "✅ 已拥有" : "⬜ 未拥有"}</span>`;
      }
      return `<div class="slot out${isSelf ? " is-self" : ""}"${linkAttr(k.pNo)}>` +
        (img ? `<img src="${img}" loading="lazy" alt="${escHtml(k.name || "")}">` : `<div class="slot-img-placeholder" aria-hidden="true">?</div>`) +
        `<div class="pname">${escHtml(k.name || "?")}</div>` +
        (prob != null ? `<div class="prob">${prob}%</div>` : "") +
        ownedToggle +
        `</div>`;
    };

    const recipeHTML = [];
    for (const iv of order) {
      const items = byView.get(String(iv));
      if (!items) continue;
      for (const r of items) {
        const p1 = r.pNo1 || {}, p2 = r.pNo2 || {};
        const p1Slot = renderParentSlot({ pNo: p1.pNo, name: p1.name, rent: p1.rent });
        const p2Slot = renderParentSlot(r.any ? { any: true } : { pNo: p2.pNo, name: p2.name, rent: p2.rent });
        const smTag = (iv === 3 || iv === 4 || iv === -3 || iv === -4) && r.result && r.result[0]
          ? ` · 系统图 #${r.result[0].orderNo} x${r.result[0].pigKind && r.result[0].pigKind.rare === 6 ? 10 : r.result[0].pigKind && r.result[0].pigKind.rare}`
          : "";
        // 每个产出单独一行 A + B = C
        const equations = (r.result || []).map(o => {
          const outSlot = renderOutcomeSlot(o.pigKind || {}, o.prob);
          return `<div class="equation">${p1Slot}<div class="op">+</div>${p2Slot}<div class="op">=</div>${outSlot}</div>`;
        }).join("");
        recipeHTML.push(
          `<div class="recipe">` +
          `<div class="tag">${BLEED_TYPE_TEXT[iv] || `isview=${iv}`}${smTag}</div>` +
          equations +
          `</div>`
        );
      }
    }
    const recipeBlock = recipeHTML.length > 0
      ? recipeHTML.join("")
      : `<div class="kv">没有已公开的配种组合</div>`;

    const pigImg = imgUrl(p.pNo);

    // Reverse: "this pig as a parent → what it can breed"
    const asParent = (state.breedByParent && state.breedByParent.get(p.pNo)) || [];
    const asParentByView = new Map();
    for (const b of asParent) {
      const k = String(b.isview);
      if (!asParentByView.has(k)) asParentByView.set(k, []);
      asParentByView.get(k).push(b);
    }
    const parentRecipeHTML = [];
    for (const iv of order) {
      const items = asParentByView.get(String(iv));
      if (!items) continue;
      // sort partners by name for stable, readable output
      items.sort((a, b) => {
        const an = a.partner ? (a.partner.name || "") : "zzz任意";
        const bn = b.partner ? (b.partner.name || "") : "zzz任意";
        return an.localeCompare(bn, "zh");
      });
      // 左边的 A 就是当前猪自己 (整段共用)
      const selfSlot = renderParentSlot({ pNo: p.pNo, name: p.name, rent: p.rent });
      for (const r of items) {
        const partnerSlot = renderParentSlot(
          (r.any || !r.partner)
            ? { any: true }
            : { pNo: r.partner.pNo, name: r.partner.name, rent: r.partner.rent }
        );
        const equations = (r.result || []).map(o => {
          const k = o.pigKind || {};
          const outSlot = renderOutcomeSlot(k, o.prob, { isSelf: k.pNo === p.pNo });
          return `<div class="equation">${selfSlot}<div class="op">+</div>${partnerSlot}<div class="op">=</div>${outSlot}</div>`;
        }).join("");
        parentRecipeHTML.push(
          `<div class="recipe">` +
          `<div class="tag">${BLEED_TYPE_TEXT[iv] || `isview=${iv}`}</div>` +
          equations +
          `</div>`
        );
      }
    }
    const parentBlock = parentRecipeHTML.length > 0
      ? parentRecipeHTML.join("")
      : `<div class="kv">没有已知的配种产出 (可能仅作为被配出的结果)</div>`;
    const picky = pigPicky(p);
    const pickyChipText = picky.level === "none" ? "不挑食" : picky.label;
    const pickyChipTitle = picky.level === "none"
      ? "不挑食"
      : `${picky.label}: ${picky.foods.join(" / ")}`;
    const pickyChipClass = picky.level === "none"
      ? "chip"
      : (picky.level === "picky" ? "chip danger" : "chip warn");
    const grazeChip = p.isExer
      ? `<span class="chip ok"><span class="chip-icon">🌿</span><span class="chip-v">放牧</span></span>`
      : `<span class="chip"><span class="chip-icon">🏠</span><span class="chip-v">不放牧</span></span>`;
    const feedChip = `<span class="chip"><span class="chip-k">🍚 最少喂</span><span class="chip-v">${p.eat_times || 0} 次</span></span>`;
    const intervalChip = (p.eat_times || 0) > 0
      ? `<span class="chip"><span class="chip-k">⏱️ 喂食间隔</span><span class="chip-v">${escHtml(feedIntervalText(p.eatable_time))}</span></span>`
      : "";
    const lifespanChip = p.lifespan
      ? `<span class="chip"><span class="chip-k">📅 成猪</span><span class="chip-v">${p.lifespan} 小时</span></span>`
      : "";
    const rentChip = p.rent
      ? `<span class="chip"><span class="chip-k">借猪</span><span class="chip-v">${p.rent}pt</span></span>`
      : "";
    const priceChip = `<span class="chip"><span class="chip-k">售价</span><span class="chip-v">${p.price}pt</span></span>`;
    const pickyChip = `<span class="${pickyChipClass}" title="${escHtml(pickyChipTitle)}"><span class="chip-icon">🍽️</span><span class="chip-v">${escHtml(pickyChipText)}</span></span>`;
    const pickyDetail = picky.level !== "none"
      ? `<div class="hero-foods"><span class="hero-foods-k">挑食食材</span><span class="hero-foods-v">${escHtml(picky.foods.join(" / "))}</span></div>`
      : "";

    box.innerHTML = `
      <h2>#${p.pNo} ${escHtml(p.name)}</h2>
      <div class="drawer-actions">${collectBtn}</div>
      <div class="hero">
        ${pigImg ? `<img src="${pigImg}" alt="${escHtml(p.name)}">` : ""}
        <div class="info">
          <div class="hero-title">
            <span class="hero-color">${escHtml(p.color_text || "")}</span>
            <span class="${p.special ? "stars special" : "stars"}">${stars(p.rare, p.special)}</span>
          </div>
          ${posText ? `<div class="hero-pos">${escHtml(posText)}</div>` : ""}
          <div class="hero-chips">
            ${rentChip}
            ${priceChip}
            ${grazeChip}
            ${feedChip}
            ${intervalChip}
            ${lifespanChip}
            ${pickyChip}
          </div>
          ${pickyDetail}
          ${badgeMetaHTML(p)}
        </div>
      </div>
      ${p.description ? `<div class="kv note" style="margin-top:10px"><div class="k">描述</div><div class="v">${escHtml(p.description)}</div></div>` : ""}
      ${p.breeding_guide?.requirements ? `<div class="kv note warn" style="margin-top:10px"><div class="k">强制要求</div><div class="v">${escHtml(p.breeding_guide.requirements)}</div></div>` : ""}
      ${p.breeding_guide?.tips ? `<div class="kv note tip" style="margin-top:6px"><div class="k">养成建议</div><div class="v">${escHtml(p.breeding_guide.tips)}</div></div>` : ""}
      ${p.hints && p.hints.length > 0 ? `<div class="kv note hints" style="margin-top:10px"><div class="k">提示</div><div class="v"><ul class="hints-list">${p.hints.map(h => `<li>${escHtml(h)}</li>`).join("")}</ul></div></div>` : ""}
      <div class="section"><h3>获得方式</h3>${acqHTML.join("")}</div>
      ${p.rare !== 6 ? `<div class="section"><h3>它能配出的崽</h3>${parentBlock}</div>` : ""}
      ${p.rare !== 6 || bleeds.length > 0 ? `<div class="section"><h3>配种配出它的方式</h3>${recipeBlock}</div>` : ""}
    `;
    // Wire the collect/uncollect button inside the drawer. Rebuilds the
    // 切换已拥有/未拥有 (主猪 + 活动猪都走 setPigOwned, 取消时联动清掉徽章)
    const cbtn = $("#drawerCollectBtn");
    if (cbtn) {
      cbtn.addEventListener("click", () => {
        const wasOwn = isOwn;
        setPigOwned(p.pNo, !wasOwn);
        toast(wasOwn ? `已取消: ${p.name}` : `已标记拥有: ${p.name}`);
        render();
        showDetail(p.pNo); // re-render drawer so the button label flips
      });
    }

    $("#drawer").classList.add("open");
    $("#drawerBg").classList.add("open");
  }

  function escHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function closeDrawer() {
    const drawer = $("#drawer"), bg = $("#drawerBg");
    drawer.classList.remove("open");
    bg.classList.remove("open");
    // Reset any inline styles left over from a swipe gesture.
    drawer.style.transform = "";
    drawer.style.transition = "";
    bg.style.opacity = "";
    currentDetailPNo = null;
  }
  $("#drawerBg").addEventListener("click", closeDrawer);

  // Swipe-down-to-dismiss on the drawer itself (touch / mouse / pen).
  // Gesture is only armed when the drawer is at scrollTop=0 (so upward scroll
  // still works normally), or when the user touches the top handle bar.
  // Dragged past SWIPE_CLOSE_PX closes; otherwise snaps back.
  (function setupDrawerSwipe() {
    const drawer = $("#drawer");
    const bg = $("#drawerBg");
    const SWIPE_CLOSE_PX = 100;
    const DRAG_START_PX = 6; // jitter tolerance before we consider it a drag
    let startY = 0, currentY = 0, activePointerId = null;
    let armed = false, dragging = false;

    drawer.addEventListener("pointerdown", e => {
      if (!drawer.classList.contains("open")) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const onHandle = e.target.closest(".handle");
      // Arm only if finger started at the handle OR drawer is scrolled to top.
      if (!onHandle && drawer.scrollTop > 0) return;
      armed = true;
      dragging = false;
      startY = e.clientY;
      currentY = startY;
      activePointerId = e.pointerId;
      drawer.style.transition = "none";
    });

    drawer.addEventListener("pointermove", e => {
      if (!armed || e.pointerId !== activePointerId) return;
      currentY = e.clientY;
      const dy = currentY - startY;
      if (dy <= 0) {
        // Moving up — give up the gesture, let native scrolling resume.
        drawer.style.transform = "";
        bg.style.opacity = "";
        return;
      }
      if (dy > DRAG_START_PX) {
        dragging = true;
        // Capture so we keep receiving move/up even if finger leaves the drawer
        // (e.g. drags onto the backdrop).
        if (drawer.setPointerCapture && activePointerId !== null) {
          try { drawer.setPointerCapture(activePointerId); } catch (_) { }
        }
      }
      if (dragging) {
        drawer.style.transform = `translateY(${dy}px)`;
        // Fade the backdrop proportionally for tactile feedback.
        const progress = Math.min(1, dy / 300);
        bg.style.opacity = String(Math.max(0.2, 1 - progress * 0.8));
      }
    });

    // Safety net for PWA standalone (esp. iOS home-screen installs): pointer
    // events on iOS don't reliably cancel native scroll — a downward drag on
    // `overflow-y: auto` content can be claimed by the scroll machinery
    // before our pointermove fires, making the sheet "un-swipe-dismissable".
    // A touchmove listener registered with `{ passive: false }` is the only
    // way to call `preventDefault()` on the native scroll for that finger,
    // which is what actually frees our gesture to run.
    drawer.addEventListener("touchmove", e => {
      if (!armed) return;
      const dy = (e.touches[0] ? e.touches[0].clientY : currentY) - startY;
      if (dy > DRAG_START_PX && e.cancelable) {
        e.preventDefault();
      }
    }, { passive: false });

    function endDrag() {
      if (!armed) return;
      const dy = currentY - startY;
      // Restore CSS transitions BEFORE clearing inline styles so the snap-back
      // or close animation is smooth.
      drawer.style.transition = "";
      bg.style.opacity = "";
      if (dragging && dy > SWIPE_CLOSE_PX) {
        closeDrawer();
      } else {
        drawer.style.transform = "";
      }
      armed = false;
      dragging = false;
      activePointerId = null;
    }
    drawer.addEventListener("pointerup", endDrag);
    drawer.addEventListener("pointercancel", endDrag);
    drawer.addEventListener("pointerleave", e => {
      // Only end on leave if we never captured (pointer capture keeps events
      // flowing even off-element).
      if (!drawer.hasPointerCapture || !drawer.hasPointerCapture(e.pointerId)) {
        endDrag();
      }
    });
  })();

  // Delegated nav: clicking a parent block or outcome chip marked with
  // `data-pno` re-renders the drawer for that pig (works for both 186 and
  // event pigs, and cross-navigates between them). Attached once; survives
  // drawer innerHTML re-renders because it listens on the container.
  $("#drawerContent").addEventListener("click", e => {
    // 体型徽章 (小章 / 大章) 勾选 — 只响应 badge-state 按钮的点击，不触发抽屉导航。
    // 同一只猪可能在抽屉里出现多次（比如配种产出 slot），但徽章块目前只有
    // 一处（hero 区），不需要 ownedEventPigs 的多元素同步逻辑。
    const badgeStateBtn = e.target.closest(".badge-state");
    if (badgeStateBtn) {
      e.stopPropagation();
      const pNo = parseInt(badgeStateBtn.dataset.badgePno, 10);
      const kind = badgeStateBtn.dataset.badgeKind;
      if (!pNo || (kind !== "small" && kind !== "big")) return;
      const set = kind === "small" ? state.smallBadges : state.bigBadges;
      setPigBadge(pNo, kind, !set.has(pNo));
      // 联动可能改了 owned 状态 → 整个抽屉重渲染最简洁
      render();
      if (currentDetailPNo) showDetail(currentDetailPNo);
      return;
    }
    // 配种产出 slot 的 "已拥有" 勾选 (针对该 slot 指向的猪本身)
    const chk = e.target.closest("[data-owned-pno]");
    if (chk) {
      e.stopPropagation();
      const pNo = parseInt(chk.dataset.ownedPno, 10);
      if (!pNo) return;
      setPigOwned(pNo, !state.ownedEventPigs.has(pNo));
      render();
      if (currentDetailPNo) showDetail(currentDetailPNo);
      return;
    }
    const t = e.target.closest("[data-pno]");
    if (!t) return;
    const target = parseInt(t.dataset.pno, 10);
    if (!target || target === currentDetailPNo) return;
    e.stopPropagation();
    showDetail(target);
    // keep the scroll position comfortable when deep-diving a lineage
    $("#drawerContent").scrollTop = 0;
  });

  // ----- 简/繁切换 -----
  function updateLangButton() {
    const btn = $("#langBtn");
    if (!btn) return;
    const lang = currentLang();
    // 按钮显示的是「点一下会切到这个语言」, 跟 theme 按钮风格一致
    btn.textContent = lang === "zhs" ? "繁" : "简";
    btn.setAttribute("aria-label", lang === "zhs" ? "切换为繁体" : "切换为简体");
    btn.title = lang === "zhs" ? "当前简体, 点击切换为繁体" : "当前繁体, 点击切换为简体";
  }
  updateLangButton();
  $("#langBtn").addEventListener("click", async () => {
    const next = currentLang() === "zhs" ? "zht" : "zhs";
    try { localStorage.setItem(LANG_KEY, next); } catch { }
    updateLangButton();
    // 清掉已加载的数据,重新拉对应语言版本
    state.dataLoaded = false;
    state.pigsById.clear();
    state.eventPigsById.clear();
    state.pigsByListKey.clear();
    state.breedByParent = new Map();
    render();
    try {
      await loadData();
      render();
      toast(next === "zhs" ? "已切换为简体" : "已切换为繁体");
    } catch (err) {
      console.error(err);
      toast("切换失败: " + err.message);
    }
  });

  // ----- theme toggle -----
  const THEME_KEY = "theme";
  function currentTheme() {
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  }
  function updateThemeChrome(mode) {
    document.documentElement.dataset.theme = mode;
    const meta = document.getElementById("themeColorMeta");
    if (meta) meta.setAttribute("content", mode === "dark" ? "#0b1220" : "#ffffff");
    const btn = $("#themeBtn");
    if (btn) {
      btn.textContent = mode === "dark" ? "☀" : "☾";
      btn.setAttribute("aria-label", mode === "dark" ? "切换为浅色主题" : "切换为深色主题");
    }
  }
  // Sync button icon with the theme set by the inline head script; do not persist.
  updateThemeChrome(currentTheme());
  $("#themeBtn").addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    updateThemeChrome(next);
    try { localStorage.setItem(THEME_KEY, next); } catch { }
  });
  // Follow system only if the user hasn't clicked (no saved pref).
  if (window.matchMedia) {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onSysChange = e => {
      if (localStorage.getItem(THEME_KEY)) return;
      updateThemeChrome(e.matches ? "dark" : "light");
    };
    if (mql.addEventListener) mql.addEventListener("change", onSysChange);
    else if (mql.addListener) mql.addListener(onSysChange);
  }

  // ----- PWA bits -----
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(console.warn);
  }

  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    deferredPrompt = e;
    $("#install").classList.add("show");
  });
  $("#installBtn").addEventListener("click", async () => {
    if (!deferredPrompt) {
      const ua = navigator.userAgent;
      const isIOS = /iPad|iPhone|iPod/.test(ua);
      alert(isIOS
        ? "iOS:点击 Safari 下方分享按钮 → 加到主屏幕"
        : "请用浏览器菜单选择「安装 App / 加到主屏幕」");
      return;
    }
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    $("#install").classList.remove("show");
  });
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) && !window.navigator.standalone) {
    $("#install").classList.add("show");
    $("#installText").textContent = "在 Safari 点击分享 → 加到主屏幕";
  }

  // ----- tab switching -----
  const TABS = {
    atlas: { panel: "#tabAtlas", btn: "#tabBtnAtlas" },
    events: { panel: "#tabEvents", btn: "#tabBtnEvents" },
    auction: { panel: "#tabAuction", btn: "#tabBtnAuction" },
    mine: { panel: "#tabMine", btn: "#tabBtnMine" },
  };
  function activateTab(name) {
    if (!TABS[name]) name = "atlas";
    for (const [k, ids] of Object.entries(TABS)) {
      const active = k === name;
      $(ids.panel).classList.toggle("active", active);
      $(ids.btn).classList.toggle("active", active);
      $(ids.btn).setAttribute("aria-selected", String(active));
    }
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
    if (name === "mine") renderNameResults();
    if (name === "auction") renderAuctionTab();
  }
  $("#tabBtnAtlas").addEventListener("click", () => activateTab("atlas"));
  $("#tabBtnEvents").addEventListener("click", () => activateTab("events"));
  $("#tabBtnAuction").addEventListener("click", () => activateTab("auction"));
  $("#tabBtnMine").addEventListener("click", () => activateTab("mine"));

  // ----- 拍卖场 tab -----
  const AUCTION_PAGE_SIZE = 30;
  const auctionState = {
    loading: false,
    loadingMore: false,           // 滚到底部加载更多时为 true
    records: [],                  // 上次请求成功的记录
    error: null,                  // 上次请求失败的错误文本
    fetchedAt: null,              // ms timestamp
    hasSearched: false,           // 是否主动查询过，影响初始空状态文案
    count: AUCTION_PAGE_SIZE,     // 当前向上游请求的 cnt 值
    atEnd: false,                 // 已无更多 —— count 加大也没新增记录
    server: "tw",                 // "tw" 台服 / "jp" 日服 —— 上次查询用的服务器
  };
  let auctionLoadMoreObserver = null;
  // UI 上"空字符串"= 不限；"0" 是有效筛选值（不挑食/不放牧/公），不能跟"不限"混淆
  const auctionFilter = {
    color: "",
    rare: "",
    isExer: "",
    foodtype: "",
    sex: "",
    sort: "1",
    // own 是本地筛选 (上游不支持), fetchAuctions 时跳过, renderAuctionTab 时按它过滤
    //   ""        全部
    //   "no"      未拥有 (含未知品种)
    //   "yes"     已拥有
    //   "no_small" 已拥有但缺小章
    //   "no_big"   已拥有但缺大章
    own: "",
  };
  // 颜色 → 上游 p 字段的视觉色组代码（默认 0=全部）。跟响应里 pNo 字段同空间
  const COLOR_TO_P = {
    "肉色": "700",
    "灰色": "704",
    "米色": "708",
    "粉色": "712",
    "白色": "716",
    "其他": "720",
  };
  let auctionCountdownTimer = null;

  // 给筛选 chip 装点击处理：高亮 + 写入 auctionFilter，不自动 fetch。
  // own 是例外：它是本地筛选,切换时直接 re-render (避免玩家还要再点一次 🔍)
  document.querySelectorAll("#tabAuction .filter-row").forEach(row => {
    const field = row.dataset.filter;
    if (!field) return;
    row.addEventListener("click", e => {
      const chip = e.target.closest(".chip");
      if (!chip || !row.contains(chip)) return;
      auctionFilter[field] = chip.dataset.value || "";
      row.querySelectorAll(".chip").forEach(c =>
        c.classList.toggle("active", c === chip));
      if (field === "own" && auctionState.records.length) {
        renderAuctionTab();
      }
    });
  });

  async function fetchAuctions({ append = false, server } = {}) {
    if (auctionState.loading || auctionState.loadingMore) return;
    if (!append) {
      // 全新查询：重置分页状态。server 由调用者传入；append 时沿用 state.server
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
      const qs = new URLSearchParams({
        count: String(auctionState.count),
        server: auctionState.server,
      });
      for (const [k, v] of Object.entries(auctionFilter)) {
        if (v === "") continue;
        // own 是本地筛选,不上传给上游
        if (k === "own") continue;
        if (k === "color") {
          const code = COLOR_TO_P[v];
          if (code) qs.set("color", code);
          continue;
        }
        qs.set(k === "isExer" ? "is_exer" : k, v);
      }
      const res = await fetch("/api/auction-search?" + qs.toString(), { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.status !== "ok") throw new Error(data.error || "未知错误");
      const newRecords = data.records || [];
      // append 时若总数没增长 → 已经到底
      if (append && newRecords.length <= prevCount) {
        auctionState.atEnd = true;
      }
      auctionState.records = newRecords;
      auctionState.fetchedAt = Date.now();
    } catch (err) {
      auctionState.error = err && err.message ? err.message : String(err);
      console.warn("[auction] fetch failed:", err);
    } finally {
      auctionState.loading = false;
      auctionState.loadingMore = false;
      renderAuctionTab();
    }
  }

  async function loadMoreAuctions() {
    if (auctionState.loading || auctionState.loadingMore || auctionState.atEnd) return;
    auctionState.count += AUCTION_PAGE_SIZE;
    await fetchAuctions({ append: true });
  }

  $("#auctionSearchBtnTw").addEventListener("click", () => fetchAuctions({ server: "tw" }));
  $("#auctionSearchBtnJp").addEventListener("click", () => fetchAuctions({ server: "jp" }));

  // 上游 bType 对应静态数据 pigs.json 的 pNo（pNo 字段是另一个视觉编号，不是品种号）。
  function lookupPig(bType) {
    return state.pigsById.get(bType) || state.eventPigsById.get(bType) || null;
  }

  // 拍卖场本地"我的拥有状态"过滤。上游不支持这维度,所以拿到 records 后再筛。
  //   no       → 未拥有 (含数据里查不到的未知品种,这种情况一律视为"我没有")
  //   yes      → 已拥有
  //   no_small → 已拥有但缺小章 (帮玩家定位"补章"的目标)
  //   no_big   → 已拥有但缺大章
  function filterAuctionByOwn(records, own) {
    if (!own) return records;
    return records.filter(rec => {
      const pNo = rec.bType;
      const known = state.pigsById.has(pNo) || state.eventPigsById.has(pNo);
      const owned = known && (
        isEventPigId(pNo)
          ? state.ownedEventPigs.has(pNo)
          : state.collection.includes(pNo)
      );
      if (own === "no") return !owned;
      if (own === "yes") return owned;
      if (own === "no_small") return owned && !state.smallBadges.has(pNo);
      if (own === "no_big") return owned && !state.bigBadges.has(pNo);
      return true;
    });
  }

  // 上游 limitdate 比本地时间晚 8 小时（实测）。+8h 后当本地时间渲染。
  const LIMITDATE_OFFSET_HOURS = 8;
  function parseLimitdate(s) {
    if (!s) return null;
    // "2026-05-20 03:09:50"
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    d.setHours(d.getHours() + LIMITDATE_OFFSET_HOURS);
    return d;
  }

  // 上游 weight 是相对基线的偏移量，显示需 +22 还原成 kg。
  const WEIGHT_OFFSET_KG = 22;
  // 成猪体重 = 显示体重 + 98 = (rec.weight + 22) + 98 = rec.weight + 120
  // 在 rec.weight 这个 raw scale 上,成猪 offset 就是 22+98=120 — 用于判断能否冲小/大章
  const ADULT_OFFSET_KG = WEIGHT_OFFSET_KG + 98;

  function formatCountdown(targetMs) {
    const now = Date.now();
    const diff = targetMs - now;
    if (diff <= 0) return { text: "已结束", cls: "urgent" };
    const sec = Math.floor(diff / 1000);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    let cls = "";
    if (sec < 600) cls = "urgent";
    else if (sec < 3600) cls = "soon";
    if (h > 0) return { text: `${h}h ${m}m`, cls };
    if (m > 0) return { text: `${m}m ${s}s`, cls };
    return { text: `${s}s`, cls };
  }

  function rareStars(n) {
    const v = n || 0;
    if (v >= 6) return "★".repeat(6);
    const safe = Math.max(0, Math.min(5, v));
    return "★".repeat(safe) + "☆".repeat(5 - safe);
  }

  // foodtype: 0=不挑食 / 1=有点挑食 / 2=挑食 (推断, 跟 .so 里 picky 等级一致)
  const FOOD_LABELS = { 0: "🍽️ 不挑食", 1: "🍽️ 有点挑食", 2: "🍽️ 挑食" };
  // 响应里第 10 字段 (pigletOrSex)：0=雄 / 1=雌
  const SEX_LABELS = { 0: "雄", 1: "雌" };
  const SEX_CLS = { 0: "sex male", 1: "sex female" };

  function buildSexBadge(v) {
    if (!(v in SEX_LABELS)) return null;
    return el("span", { class: SEX_CLS[v] }, SEX_LABELS[v]);
  }

  // 拍卖场卡片/列表行用的「我是否拥有 + 大小章」一行 chip
  function buildAuctionOwnershipRow(pNo) {
    if (!pNo) return null;
    const known = state.pigsById.has(pNo) || state.eventPigsById.has(pNo);
    if (!known) return null;
    const owned = isEventPigId(pNo)
      ? state.ownedEventPigs.has(pNo)
      : state.collection.includes(pNo);
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

  // 章别预测 chip: 根据"成猪体重 = weight + 98"预估这只幼猪能冲哪种章
  //   adult < small  → 还有机会拿小章 (距上限还可涨 X kg)
  //   adult ≥ small  → 错过小章, 还差 X kg 到大章
  // 游戏机制下 adult 不会 ≥ 大章阈值, 所以无须第三种情况。
  // 该品种数据里没 weight 字段 (badgeWeights == null) → 不显示。
  function buildBadgeForecast(rec, pig) {
    if (!pig) return null;
    const w = badgeWeights(pig);
    if (!w) return null;
    const adult = (rec.weight || 0) + ADULT_OFFSET_KG;
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

  function buildAuctionRow(rec) {
    const pig = lookupPig(rec.bType);
    const name = pig ? pig.name : "未知品种";
    const sublineParts = [];
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
    const nameChildren = [name];
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
        if (lookupPig(rec.bType)) showDetail(rec.bType);
      },
    }, [thumb, info, priceCol]);
  }

  function renderAuctionTab() {
    const box = $("#auctionBody");
    const statsBar = $("#auctionStatsBar");
    box.innerHTML = "";
    stopAuctionCountdown();

    if (auctionState.loading) {
      statsBar.textContent = "加载中…";
      box.appendChild(el("div", { class: "loading" }, [
        el("div", { class: "spinner" }),
        el("div", {}, "正在拉取拍卖场数据…"),
      ]));
      return;
    }

    if (auctionState.error) {
      statsBar.textContent = "加载失败";
      box.appendChild(el("div", { class: "auction-error" }, [
        el("div", {}, "❌ " + auctionState.error),
      ]));
      return;
    }

    if (!auctionState.records.length) {
      if (!auctionState.hasSearched) {
        statsBar.textContent = "未加载";
        box.appendChild(el("div", { class: "loading" }, [
          el("div", {}, "选好筛选条件后点 🔍 查询"),
        ]));
      } else {
        statsBar.textContent = "无结果";
        box.appendChild(el("div", { class: "loading" }, [
          el("div", {}, "没有符合条件的拍品，调一下筛选再试。"),
        ]));
      }
      return;
    }

    const fetched = new Date(auctionState.fetchedAt);
    const fetchedText = fetched.toLocaleTimeString([], {
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    const serverLabel = auctionState.server === "jp" ? "日服" : "台服";

    // 本地按"我的拥有状态"过滤,不影响 auctionState.records (无限滚动还要拉更多)
    const shown = filterAuctionByOwn(auctionState.records, auctionFilter.own);
    const filterHint = auctionFilter.own
      ? ` · 筛后 ${shown.length} 条`
      : "";
    statsBar.textContent =
      `${serverLabel} · 共 ${auctionState.records.length} 条${filterHint} · 更新于 ${fetchedText}`;

    if (shown.length === 0 && auctionFilter.own) {
      box.appendChild(el("div", { class: "loading" }, [
        el("div", {}, "当前结果里没有符合「我的」筛选的拍品 — 切换条件或多加载几条试试"),
      ]));
    } else {
      const list = el("div", { class: "auction-list" },
        shown.map(buildAuctionRow));
      box.appendChild(list);
    }

    // 底部 sentinel + 加载更多状态
    const footer = el("div", { class: "auction-footer" }, [
      auctionState.loadingMore
        ? el("div", { class: "loading-more" }, [
            el("div", { class: "spinner small" }), el("div", {}, "加载更多…"),
          ])
        : auctionState.atEnd
          ? el("div", { class: "load-end" }, `— 没有更多了 (cnt=${auctionState.count}) —`)
          : el("div", { class: "auction-sentinel" }, ""),
    ]);
    box.appendChild(footer);

    setupAuctionLoadMore();
    startAuctionCountdown();
  }

  function setupAuctionLoadMore() {
    if (auctionLoadMoreObserver) {
      auctionLoadMoreObserver.disconnect();
      auctionLoadMoreObserver = null;
    }
    const sentinel = document.querySelector("#auctionBody .auction-sentinel");
    if (!sentinel) return;
    auctionLoadMoreObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) loadMoreAuctions();
      }
    }, { rootMargin: "240px" });
    auctionLoadMoreObserver.observe(sentinel);
  }

  function startAuctionCountdown() {
    stopAuctionCountdown();
    auctionCountdownTimer = setInterval(() => {
      const nodes = document.querySelectorAll("#auctionBody .auction-countdown");
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

  function stopAuctionCountdown() {
    if (auctionCountdownTimer) {
      clearInterval(auctionCountdownTimer);
      auctionCountdownTimer = null;
    }
  }

  // ----- name search (add-tab) -----
  const nameState = { q: "", results: [] };

  function searchByName(q) {
    const ql = q.trim().toLowerCase();
    if (!ql) return [];
    const out = [];
    for (const p of state.pigsById.values()) {
      const hay = ((p.name || "") + " " + (p.description || "") + " #" + p.pNo).toLowerCase();
      if (hay.includes(ql)) out.push(p);
      if (out.length >= 60) break;
    }
    out.sort((a, b) =>
      (a.book - b.book) || (a.page - b.page) || (a.slot - b.slot) || (a.pNo - b.pNo)
    );
    return out;
  }

  function renderNameResults() {
    const box = $("#nameResults");
    if (!box) return;
    box.innerHTML = "";
    if (!nameState.q) {
      box.classList.remove("show");
      return;
    }
    if (nameState.results.length === 0) {
      box.classList.add("show");
      box.appendChild(el("div", { class: "empty-row" }, "没有匹配的猪"));
      return;
    }
    box.classList.add("show");
    for (const p of nameState.results) {
      const already = state.collection.includes(p.pNo);
      const posText = p.book && p.book <= 6
        ? `图鉴${p.book}/页${p.page}/格${p.slot}`
        : (p.list && p.list.typeno === 7 ? "活动图鉴" : "");
      const row = el("div", {
        class: "row",
        onclick: () => {
          const res = addByPNo(p.pNo);
          if (res.err) { toast(res.err); return; }
          if (res.ok) {
            toast(res.msg);
            render();
          } else {
            toast(res.msg); // 已在收藏中
          }
        },
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

  let nameSearchTimer = null;
  $("#nameIn").addEventListener("input", e => {
    clearTimeout(nameSearchTimer);
    const v = e.target.value;
    nameSearchTimer = setTimeout(() => {
      nameState.q = v;
      nameState.results = state.dataLoaded ? searchByName(v) : [];
      const msg = $("#nameMsg");
      if (!v.trim()) {
        msg.textContent = "输入至少 1 个字符开始搜索，点击结果即可添加";
      } else if (!state.dataLoaded) {
        msg.innerHTML = `<span class="err">数据还没加载好</span>`;
      } else {
        msg.textContent = `找到 ${nameState.results.length} 只匹配的猪`;
      }
      renderNameResults();
    }, 160);
  });

  // ----- batch triples -----
  function parseBatchLines(text) {
    const lines = text.split(/\r?\n/);
    const parsed = [];
    lines.forEach((raw, idx) => {
      const line = raw.trim();
      if (!line || line.startsWith("#") || line.startsWith("//")) return;
      const parts = line.split(/[\s\/,.;]+/).filter(Boolean);
      parsed.push({ raw: line, idx: idx + 1, parts });
    });
    return parsed;
  }

  $("#batchAddBtn").addEventListener("click", () => {
    const ta = $("#batchIn");
    const report = $("#batchReport");
    report.innerHTML = "";
    if (!state.dataLoaded) {
      report.innerHTML = `<div class="line err">数据还没加载好</div>`;
      return;
    }
    const items = parseBatchLines(ta.value);
    if (items.length === 0) {
      report.innerHTML = `<div class="line err">没有有效的三元组输入</div>`;
      return;
    }
    let okCount = 0, dupCount = 0, errCount = 0;
    const frag = document.createDocumentFragment();
    for (const it of items) {
      if (it.parts.length < 3) {
        frag.appendChild(el("div", { class: "line err" },
          `L${it.idx}: "${it.raw}" — 需要 3 个数字`));
        errCount++;
        continue;
      }
      const [b, p, s] = it.parts;
      const res = addFromTriple(b, p, s);
      if (res.err) {
        frag.appendChild(el("div", { class: "line err" },
          `L${it.idx}: ${b}/${p}/${s} — ${res.err}`));
        errCount++;
      } else if (res.ok) {
        frag.appendChild(el("div", { class: "line ok" },
          `L${it.idx}: ${b}/${p}/${s} → #${res.pig.pNo} ${res.pig.name}`));
        okCount++;
      } else {
        frag.appendChild(el("div", { class: "line dup" },
          `L${it.idx}: ${b}/${p}/${s} → #${res.pig.pNo} ${res.pig.name} (已在收藏中)`));
        dupCount++;
      }
    }
    const summary = el("div", { class: "line" },
      `总结: 新增 ${okCount} · 重复 ${dupCount} · 失败 ${errCount}`);
    summary.style.fontWeight = "600";
    summary.style.paddingBottom = "4px";
    summary.style.borderBottom = "1px solid var(--border)";
    summary.style.marginBottom = "4px";
    report.appendChild(summary);
    report.appendChild(frag);
    if (okCount > 0) {
      toast(`已添加 ${okCount} 只` + (dupCount ? ` · 重复 ${dupCount}` : "") + (errCount ? ` · 失败 ${errCount}` : ""));
      render();
    } else if (dupCount > 0 && errCount === 0) {
      toast(`全部 ${dupCount} 只已在收藏中`);
    }
  });
  $("#batchClearBtn").addEventListener("click", () => {
    $("#batchIn").value = "";
    $("#batchReport").innerHTML = "";
  });

  // ----- export / import flow -----
  // 导出的 JSON 结构。version 用于日后兼容性升级。
  //
  // v1 (老版): collection / collectionTriplets 装的是 "未拥有" 列表 (inverted)
  // v2 (本版): owned186Pigs / owned186Triplets 装的是 "已拥有" 列表 (positive),
  //            语义跟 ownedEventPigs / smallBadges / bigBadges 一致。
  //
  // 导入时按 version 字段或具体字段存在性自动判定语义,详见 parseImportText。
  const EXPORT_TYPE = "pigfarm-helper-backup";
  const EXPORT_VERSION = 2;

  function buildExportPayload() {
    // 主图鉴按 book/page/slot 排序后只输出 pNo 列表 (owned186Triplets 已废弃,
    // pNo 是唯一可靠标识; 导入侧仍保留 triplets 兼容)
    const sortedMain = [];
    for (const pNo of state.collection) {
      const p = state.pigsById.get(pNo);
      if (p) sortedMain.push(p);
    }
    sortedMain.sort((a, b) =>
      (a.book - b.book) || (a.page - b.page) || (a.slot - b.slot) || (a.pNo - b.pNo));
    return {
      type: EXPORT_TYPE,
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      owned186Pigs: sortedMain.map(p => p.pNo),
      ownedEventPigs: Array.from(state.ownedEventPigs).sort((a, b) => a - b),
      smallBadges: Array.from(state.smallBadges).sort((a, b) => a - b),
      bigBadges: Array.from(state.bigBadges).sort((a, b) => a - b),
      hiddenUnlocked: state.hiddenUnlocked,
    };
  }

  function buildExportJson() {
    return JSON.stringify(buildExportPayload(), null, 2);
  }

  async function copyText(txt) {
    // Prefer async Clipboard API; fall back to execCommand for older / http 环境
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

  function runExport(alsoCopy) {
    const out = $("#exportOut");
    const msg = $("#exportMsg");
    if (!state.dataLoaded) {
      msg.innerHTML = `<span class="err">数据还没加载好</span>`;
      return;
    }
    const payload = buildExportPayload();
    const txt = JSON.stringify(payload, null, 2);
    out.value = txt;
    const nColl = payload.owned186Pigs.length;
    const nOwned = payload.ownedEventPigs.length;
    const nSmall = payload.smallBadges.length;
    const nBig = payload.bigBadges.length;
    if (nColl === 0 && nOwned === 0 && nSmall === 0 && nBig === 0) {
      msg.innerHTML = `<span class="err">记录为空, 没什么可导出</span>`;
      return;
    }
    const summary = `186 已拥有 ${nColl} · Events 已拥有 ${nOwned} · 小章 ${nSmall} · 大章 ${nBig}`;
    if (alsoCopy) {
      copyText(txt).then(ok => {
        if (ok) {
          msg.innerHTML = `<span class="ok">已复制到剪贴板: ${summary}</span>`;
          toast(`已复制到剪贴板`);
        } else {
          out.focus(); out.select();
          msg.innerHTML = `<span class="err">复制失败, 请手动选中上方文本复制</span>`;
        }
      });
    } else {
      out.focus(); out.select();
      msg.innerHTML = `<span class="ok">已导出: ${summary}</span>`;
    }
  }

  function runExportDownload() {
    const msg = $("#exportMsg");
    if (!state.dataLoaded) {
      msg.innerHTML = `<span class="err">数据还没加载好</span>`;
      return;
    }
    const payload = buildExportPayload();
    if (payload.owned186Pigs.length === 0 && payload.ownedEventPigs.length === 0 && payload.smallBadges.length === 0 && payload.bigBadges.length === 0) {
      msg.innerHTML = `<span class="err">记录为空, 没什么可导出</span>`;
      return;
    }
    const txt = JSON.stringify(payload, null, 2);
    $("#exportOut").value = txt;
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
      msg.innerHTML = `<span class="ok">已下载备份文件</span>`;
    } catch (err) {
      console.error(err);
      msg.innerHTML = `<span class="err">下载失败：${escHtml(err.message || String(err))}</span>`;
    }
  }

  // 解析导入文本,返回 { collection, ownedEventPigs, smallBadges, bigBadges,
  //                       hiddenUnlocked?, source, formatVersion } 或 { err }。
  //
  // 兼容三种来源:
  //   A) v2+ JSON (本版): owned186Pigs / owned186Triplets 是 "已拥有" 列表 → 直读
  //   B) v1 JSON (老版):  collection / collectionTriplets 是 "未拥有" 列表 → 翻转
  //                        owned = base 186 pNos − collection
  //   C) 三元组裸文本 (老式按格添加): 视为 "已拥有" 列表 → 直读
  //
  // 解析所有非主图鉴字段 (ownedEventPigs, smallBadges, bigBadges) 都是 positive 语义,两版一致。
  function parseImportText(raw) {
    const txt = (raw || "").trim();
    if (!txt) return { err: "输入为空" };

    if (txt.startsWith("{") || txt.startsWith("[")) {
      let obj;
      try {
        obj = JSON.parse(txt);
      } catch (err) {
        return { err: `JSON 解析失败: ${err.message}` };
      }
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
        return { err: "JSON 顶层必须是一个对象" };
      }
      if (obj.type && obj.type !== EXPORT_TYPE) {
        return { err: `不是本工具的备份文件 (type=${obj.type})` };
      }

      const fileVersion = Number.parseInt(obj.version, 10) || 1;
      const hasV2 = Array.isArray(obj.owned186Pigs) || Array.isArray(obj.owned186Triplets);
      const isV2 = hasV2 || fileVersion >= 2;

      const collection = [];
      const tripletToPNo = (s) => {
        const m = String(s).match(/^(\d+)[\/\s,.;]+(\d+)[\/\s,.;]+(\d+)$/);
        if (!m) return null;
        const key = `${+m[1]}-${(+m[2] - 1) * 6 + +m[3]}`;
        return state.pigsByListKey.get(key) || null;
      };

      if (isV2) {
        // v2: 直读 已拥有 列表
        if (Array.isArray(obj.owned186Pigs)) {
          for (const v of obj.owned186Pigs) {
            const n = Number.parseInt(v, 10);
            if (Number.isInteger(n) && state.pigsById.has(n)) collection.push(n);
          }
        } else if (Array.isArray(obj.owned186Triplets)) {
          for (const s of obj.owned186Triplets) {
            const pNo = tripletToPNo(s);
            if (pNo) collection.push(pNo);
          }
        }
      } else {
        // v1: collection 字段是 未拥有 列表, 翻转 (排除隐藏猪)
        const unowned = new Set();
        if (Array.isArray(obj.collection)) {
          for (const v of obj.collection) {
            const n = Number.parseInt(v, 10);
            if (Number.isInteger(n)) unowned.add(n);
          }
        } else if (Array.isArray(obj.collectionTriplets)) {
          for (const s of obj.collectionTriplets) {
            const pNo = tripletToPNo(s);
            if (pNo) unowned.add(pNo);
          }
        }
        for (const pNo of state.pigsById.keys()) {
          if (HIDDEN_PNOS.has(pNo)) continue;
          if (!unowned.has(pNo)) collection.push(pNo);
        }
      }

      const ownedEventPigs = [];
      if (Array.isArray(obj.ownedEventPigs)) {
        for (const v of obj.ownedEventPigs) {
          const n = Number.parseInt(v, 10);
          if (Number.isInteger(n) && state.eventPigsById.has(n)) ownedEventPigs.push(n);
        }
      }
      const smallBadges = [];
      if (Array.isArray(obj.smallBadges)) {
        for (const v of obj.smallBadges) {
          const n = Number.parseInt(v, 10);
          if (Number.isInteger(n) && (state.pigsById.has(n) || state.eventPigsById.has(n))) smallBadges.push(n);
        }
      }
      const bigBadges = [];
      if (Array.isArray(obj.bigBadges)) {
        for (const v of obj.bigBadges) {
          const n = Number.parseInt(v, 10);
          if (Number.isInteger(n) && (state.pigsById.has(n) || state.eventPigsById.has(n))) bigBadges.push(n);
        }
      }
      const hiddenUnlocked = obj.hiddenUnlocked === true ? true : undefined;
      return { collection, ownedEventPigs, smallBadges, bigBadges,
               hiddenUnlocked, source: "json", formatVersion: isV2 ? 2 : 1 };
    }

    // Fallback: 三元组裸文本 (positive — 用户手动列出 "已拥有" 的)
    const items = parseBatchLines(txt);
    if (items.length === 0) return { err: "没有可识别的 JSON 或三元组内容" };
    const collection = [];
    let skipped = 0;
    for (const it of items) {
      if (it.parts.length < 3) { skipped++; continue; }
      const [b, p, s] = it.parts.map(n => parseInt(n, 10));
      if (!(b >= 1 && b <= 6 && p >= 1 && s >= 1 && s <= 6)) { skipped++; continue; }
      const pNo = state.pigsByListKey.get(`${b}-${(p - 1) * 6 + s}`);
      if (pNo) collection.push(pNo); else skipped++;
    }
    return { collection, ownedEventPigs: [], smallBadges: [], bigBadges: [],
             source: "triplets", formatVersion: 2, skipped };
  }

  function applyImport(parsed, { replace }) {
    // Dedupe and preserve order for collection; event pigs use a Set.
    const desiredColl = Array.from(new Set(parsed.collection));
    const desiredOwned = new Set(parsed.ownedEventPigs);
    const desiredSmall = new Set(parsed.smallBadges || []);
    const desiredBig = new Set(parsed.bigBadges || []);

    let addedColl = 0, removedColl = 0;
    let addedOwned = 0, removedOwned = 0;
    let addedSmall = 0, removedSmall = 0;
    let addedBig = 0, removedBig = 0;

    if (replace) {
      const prevColl = new Set(state.collection);
      const nextColl = new Set(desiredColl);
      state.collection = desiredColl.slice();
      for (const n of nextColl) if (!prevColl.has(n)) addedColl++;
      for (const n of prevColl) if (!nextColl.has(n)) removedColl++;

      const prevOwned = new Set(state.ownedEventPigs);
      state.ownedEventPigs = new Set(desiredOwned);
      for (const n of desiredOwned) if (!prevOwned.has(n)) addedOwned++;
      for (const n of prevOwned) if (!desiredOwned.has(n)) removedOwned++;

      const prevSmall = new Set(state.smallBadges);
      state.smallBadges = new Set(desiredSmall);
      for (const n of desiredSmall) if (!prevSmall.has(n)) addedSmall++;
      for (const n of prevSmall) if (!desiredSmall.has(n)) removedSmall++;

      const prevBig = new Set(state.bigBadges);
      state.bigBadges = new Set(desiredBig);
      for (const n of desiredBig) if (!prevBig.has(n)) addedBig++;
      for (const n of prevBig) if (!desiredBig.has(n)) removedBig++;
    } else {
      const have = new Set(state.collection);
      for (const n of desiredColl) {
        if (!have.has(n)) { state.collection.push(n); have.add(n); addedColl++; }
      }
      for (const n of desiredOwned) {
        if (!state.ownedEventPigs.has(n)) { state.ownedEventPigs.add(n); addedOwned++; }
      }
      for (const n of desiredSmall) {
        if (!state.smallBadges.has(n)) { state.smallBadges.add(n); addedSmall++; }
      }
      for (const n of desiredBig) {
        if (!state.bigBadges.has(n)) { state.bigBadges.add(n); addedBig++; }
      }
    }

    saveCollection();
    saveOwnedEventPigs();
    saveSmallBadges();
    saveBigBadges();
    // hiddenUnlocked: 备份里如果带 true 就尊重它(已解锁过的就别再藏起来),
    // 反之不动 (覆盖导入不强制 re-lock,避免误清成就)
    let unlocked = false;
    if (parsed.hiddenUnlocked === true && !state.hiddenUnlocked) {
      state.hiddenUnlocked = true;
      saveHiddenUnlocked();
      mergeHiddenIntoMain();
      buildBreedingIndex();
      unlocked = true;
    }
    return { addedColl, removedColl, addedOwned, removedOwned,
             addedSmall, removedSmall, addedBig, removedBig, unlocked };
  }

  function runImport(replace) {
    const msg = $("#importMsg");
    if (!state.dataLoaded) {
      msg.innerHTML = `<span class="err">数据还没加载好</span>`;
      return;
    }
    const raw = $("#importIn").value;
    const parsed = parseImportText(raw);
    if (parsed.err) {
      msg.innerHTML = `<span class="err">${escHtml(parsed.err)}</span>`;
      return;
    }
    const nColl = parsed.collection.length;
    const nOwned = parsed.ownedEventPigs.length;
    const nSmall = parsed.smallBadges.length;
    const nBig = parsed.bigBadges.length;
    if (nColl === 0 && nOwned === 0 && nSmall === 0 && nBig === 0) {
      msg.innerHTML = `<span class="err">解析成功但内容为空 (可能 pNo 对不上当前数据)</span>`;
      return;
    }
    if (replace) {
      const fmtHint = parsed.formatVersion === 1
        ? `\n\n已识别为 v1 老版备份`
        : "";
      const confirmMsg =
        `覆盖导入会替换你现有的全部记录:\n` +
        `  186 已拥有 ${state.collection.length} → 导入 ${nColl}\n` +
        `  Events 已拥有 ${state.ownedEventPigs.size} → 导入 ${nOwned}\n` +
        `  小章 ${state.smallBadges.size} → 导入 ${nSmall}\n` +
        `  大章 ${state.bigBadges.size} → 导入 ${nBig}` + fmtHint + `\n\n` +
        `确定要覆盖吗?`;
      if (!confirm(confirmMsg)) return;
    }
    const r = applyImport(parsed, { replace });
    // 抽屉里可能在显示活动猪的「已拥有」勾选，导入后直接关掉以避免 UI 不同步。
    if ($("#drawer").classList.contains("open")) closeDrawer();
    // 导入后只要 186 满了就提示解锁 —— 不管之前是否解锁过,
    // 这样用户从备份恢复时也能看到反馈。
    const allBaseOwned = (() => {
      const ownedSet = new Set(state.collection);
      for (const pNo of state.pigsById.keys()) {
        if (HIDDEN_PNOS.has(pNo)) continue;
        if (!ownedSet.has(pNo)) return false;
      }
      return state.pigsById.size > HIDDEN_PNOS.size; // 至少有数据
    })();
    if (allBaseOwned) {
      if (!state.hiddenUnlocked) {
        state.hiddenUnlocked = true;
        saveHiddenUnlocked();
        mergeHiddenIntoMain();
        buildBreedingIndex();
        r.unlocked = true;
      }
      showUnlockCelebration();
    }
    render();
    const parts = [];
    if (r.addedColl) parts.push(`186新增 ${r.addedColl}`);
    if (r.removedColl) parts.push(`186移除 ${r.removedColl}`);
    if (r.addedOwned) parts.push(`Events新增 ${r.addedOwned}`);
    if (r.removedOwned) parts.push(`Events移除 ${r.removedOwned}`);
    if (r.addedSmall) parts.push(`小章新增 ${r.addedSmall}`);
    if (r.removedSmall) parts.push(`小章移除 ${r.removedSmall}`);
    if (r.addedBig) parts.push(`大章新增 ${r.addedBig}`);
    if (r.removedBig) parts.push(`大章移除 ${r.removedBig}`);
    const tags = [];
    if (parsed.source === "triplets") tags.push("三元组裸文本");
    else if (parsed.formatVersion === 1) tags.push("v1 老版 · 已自动反转 collection");
    else tags.push("v2 新版");
    if (r.unlocked) tags.push("隐藏图鉴已解锁");
    const suffix = ` <span style="color:var(--muted)">· ${tags.join(" · ")}</span>`;
    msg.innerHTML = parts.length
      ? `<span class="ok">导入完成: ${parts.join(" · ")}</span>${suffix}`
      : `<span class="ok">导入完成: 没有变化 (全部已存在)</span>${suffix}`;
    toast("导入完成");
  }

  $("#exportBtn").addEventListener("click", () => runExport(false));
  $("#exportCopyBtn").addEventListener("click", () => runExport(true));
  $("#exportDownloadBtn").addEventListener("click", runExportDownload);

  $("#importMergeBtn").addEventListener("click", () => runImport(false));
  $("#importReplaceBtn").addEventListener("click", () => runImport(true));
  $("#importClearBtn").addEventListener("click", () => {
    $("#importIn").value = "";
    $("#importMsg").textContent = "合并：只追加缺失的项；覆盖：用导入数据替换现有全部配置";
  });
  $("#importFileBtn").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", async e => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      const text = await f.text();
      $("#importIn").value = text;
      $("#importMsg").innerHTML = `<span class="ok">已读取文件 ${escHtml(f.name)}，点击「合并导入」或「覆盖导入」继续</span>`;
    } catch (err) {
      $("#importMsg").innerHTML = `<span class="err">读取文件失败: ${escHtml(err.message || String(err))}</span>`;
    } finally {
      // allow re-picking the same file
      e.target.value = "";
    }
  });

  // ----- bootstrap -----
  render(); // initial loading state
  loadData()
    .then(() => {
      // 启动时已经 owned 186 但 hiddenUnlocked 还是 false (比如导入备份场景)
      // → 解锁并弹庆祝。注意这里 hiddenUnlocked=true 时 loadData 已经把隐藏并入了。
      checkAndUnlockHidden();
      render();
    })
    .catch(err => {
      console.error(err);
      $("#body").innerHTML = `<div class="empty">
        <div class="title">图鉴数据加载失败</div>
        <div class="hint">${escHtml(err.message || err)}</div>
      </div>`;
    });
})();
