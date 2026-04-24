/**
 * 养猪场mix图鉴助手 — 纯静态客户端
 *
 * 加载一次 /data/pigs.json (~640KB, 186 只)
 * Tabs: 全图鉴 (默认) / 收藏 / 添加
 * 用户收藏 (pNo 列表) 持久化在 localStorage
 * 筛选/搜索全在客户端, 全图鉴与收藏各有独立的 filter 状态
 */
(function () {
  "use strict";

  const STORAGE_KEY = "pig_collection_v1";
  const DATA_URL = "/data/pigs.json";
  const EVENT_DATA_URL = "/data/pigs_event.json";
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
    3:  "草原 (普通券)", 4:  "山林 (普通券)",
    5:  "草原 (稀有券)", 6:  "山林 (稀有券)",
    7:  "日本 (普通券)", 8:  "日本 (稀有券)",
    9:  "亚洲 (普通券)", 10: "亚洲 (稀有券)",
    11: "欧洲 (普通券)", 12: "欧洲 (稀有券)",
    13: "美洲和西印度群岛 (普通券)", 14: "美洲和西印度群岛 (稀有券)",
    15: "大洋洲 (普通券)",          16: "大洋洲 (稀有券)",
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
    "草原":   [3, 5],
    "山林":   [4, 6],
    "日本":   [7, 8],
    "亚洲":   [9, 10],
    "欧洲":   [11, 12],
    "美洲":   [13, 14],
    "大洋洲": [15, 16],
  };
  const HUNT_NORMAL_CODES = new Set([3, 4, 7, 9, 11, 13, 15]);
  const HUNT_RARE_CODES   = new Set([5, 6, 8, 10, 12, 14, 16]);

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
    6: "野猪色",
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
    filter:      { color: "", method: "", q: "", huntRegion: "", huntTicket: "", shopRank: "", graze: "" }, // 收藏 tab
    atlasFilter: { color: "", method: "", q: "", huntRegion: "", huntTicket: "", shopRank: "", graze: "" }, // 全图鉴 tab
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

  // ----- picky-eating derivation -----
  // 按 eatable 长度判定挑食程度 (与 arrival_comment 里的 挑食/不挑食 100% 对齐):
  //   0 种 -> 不挑食
  //   1 种 -> 挑食 (只吃这一种)
  //   2+ 种 -> 有点挑食 (吃这几种)
  function pigPicky(p) {
    const ids = (p.eatable || []).filter(i => FEED_LABELS[i]);
    const foods = ids.map(i => FEED_LABELS[i]);
    if (ids.length === 0) return { level: "none",  label: "不挑食", foods };
    if (ids.length === 1) return { level: "picky", label: "挑食",   foods };
    return                       { level: "some",  label: "有点挑食", foods };
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

  // Every pig has one canonical portrait at /img/pigs/{pNo}.png.
  // pNo is always present on both top-level pigs and nested pigKind refs.
  function imgUrl(pNo) {
    return pNo ? `${IMG_BASE}${pNo}.png` : "";
  }

  function stars(rare, special) {
    const glyph = special ? "✦" : "★";
    return glyph.repeat(Math.min(6, rare || 0));
  }

  // ----- data load -----
  async function loadData() {
    // 并行请求 186 本体和活动猪。活动猪只用于丰富抽屉（反向配种产出 +
    // 作为 186 配方里的亲本/产出），不进入全图鉴 / 收藏 / 添加流程。
    const [mainRes, evRes] = await Promise.all([
      fetch(DATA_URL),
      fetch(EVENT_DATA_URL).catch(() => null),
    ]);
    if (!mainRes.ok) throw new Error("加载数据失败: " + mainRes.status);
    const bundle = await mainRes.json();
    if (!bundle || !Array.isArray(bundle.pigs)) throw new Error("数据格式错误");

    for (const p of bundle.pigs) {
      // color_text 的真实分类按图鉴 book (== list.typeno, 1~6) 而非 p.color 字段:
      // 图鉴 6 (野猪) 里的猪上游 color 字段会被标成 1, 但实际应归为 "野猪色"。
      const bookColor = BOOK_COLOR_TEXT[p.book];
      if (bookColor) p.color_text = bookColor;
      state.pigsById.set(p.pNo, p);
      if (p.list && p.list.typeno && p.list.listno) {
        state.pigsByListKey.set(`${p.list.typeno}-${p.list.listno}`, p.pNo);
      }
    }

    if (evRes && evRes.ok) {
      try {
        const evBundle = await evRes.json();
        if (evBundle && Array.isArray(evBundle.pigs)) {
          for (const p of evBundle.pigs) state.eventPigsById.set(p.pNo, p);
        }
      } catch (err) {
        console.warn("活动猪数据解析失败:", err);
      }
    } else {
      console.warn("未加载活动猪数据 (pigs_event.json), 抽屉反向配种将不含活动猪产出");
    }

    buildBreedingIndex();
    state.dataLoaded = true;
    return bundle;
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
        const ex = (a || s) ? `  [任意 ${((a||0)*100).toFixed(2)}% / 按幼猪 ${((s||0)*100).toFixed(2)}%]` : "";
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
      if (ticket === "rare"   && !HUNT_RARE_CODES.has(code))   continue;
      return true;
    }
    return false;
  }

  // ----- render: grid -----
  function filterPigs(pigs, filter) {
    const { color, method, q, huntRegion, huntTicket, shopRank, graze } = filter;
    const ql = (q || "").toLowerCase();
    return pigs.filter(p => {
      if (color && p.color_text !== color) return false;
      if (method && !pigHasMethod(p, method)) return false;
      if (method === "hunt" && !pigMatchesHunt(p, huntRegion, huntTicket)) return false;
      if (method === "shop" && !pigMatchesShopRank(p, shopRank)) return false;
      if (graze === "yes" && !p.isExer) return false;
      if (graze === "no"  &&  p.isExer) return false;
      if (ql) {
        const hay = ((p.name || "") + " " + (p.description || "")).toLowerCase();
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

  function currentCollectionPigs() {
    const pigs = [];
    for (const pNo of state.collection) {
      const p = state.pigsById.get(pNo);
      if (p) pigs.push(p);
    }
    return sortPigs(filterPigs(pigs, state.filter));
  }

  function currentAtlasPigs() {
    return sortPigs(filterPigs([...state.pigsById.values()], state.atlasFilter));
  }

  // Shared card renderer. `showRemove` shows the × (收藏 tab); `showCollected`
  // draws a green tick + border when the pig is already in the collection
  // (全图鉴 tab).
  function buildCard(p, opts) {
    const { showRemove = false, showCollected = false } = opts || {};
    const posText = p.book && p.book <= 6
      ? `图鉴${p.book} 页${p.page} #${p.slot}` : "";
    const isColl = state.collection.includes(p.pNo);
    const children = [];
    if (showRemove) {
      children.push(el("button", {
        class: "remove",
        "aria-label": "移除",
        onclick: ev => { ev.stopPropagation(); removePig(p.pNo); },
      }, "×"));
    }
    if (showCollected && isColl) {
      children.push(el("span", { class: "tick", "aria-label": "已收藏" }, "✓"));
    }
    children.push(el("div", { class: "img" },
      p.png ? el("img", { src: imgUrl(p.pNo), loading: "lazy", alt: p.name }) : null
    ));
    const grazeBadge = p.isExer
      ? el("span", { class: "graze yes", title: "放牧" },  "🌿 放牧")
      : el("span", { class: "graze no",  title: "不放牧" }, "🏠 不放牧");
    const picky = pigPicky(p);
    const pickyText = picky.level === "none"
      ? "🍽️ 不挑食"
      : `🍽️ ${picky.label}: ${picky.foods.join(" / ")}`;
    const pickyEl = el("div", {
      class: "picky " + picky.level,
      title: pickyText,
    }, pickyText);
    const feedN = p.eat_times || 0;
    const feedBadge = el("span", {
      class: "feed",
      title: `最少喂食 ${feedN} 次`,
    }, `🍚 ${feedN}次`);
    children.push(el("div", { class: "body" }, [
      el("div", { class: "name" }, `#${p.pNo} ${p.name}`),
      el("div", { class: "sub" }, `${p.color_text || ""} · ${posText}`),
      el("div", { class: "meta-row" }, [
        el("span", { class: "stars" + (p.special ? " special" : "") }, stars(p.rare, p.special)),
        el("span", { class: "badges" }, [feedBadge, grazeBadge].filter(Boolean)),
      ]),
      pickyEl,
    ]));
    return el("div", {
      class: "card" + (showCollected && isColl ? " collected" : ""),
      onclick: () => showDetail(p.pNo),
    }, children);
  }

  function renderCollectionBody() {
    const box = $("#body");
    box.innerHTML = "";

    if (!state.dataLoaded) {
      box.appendChild(el("div", { class: "loading" }, [
        el("div", { class: "spinner" }),
        "正在加载图鉴数据…",
      ]));
      return;
    }

    if (state.collection.length === 0) {
      box.appendChild(el("div", { class: "empty" }, [
        el("div", { class: "big" }, "🐽"),
        el("div", { class: "title" }, "你的收藏还是空的"),
        el("div", { class: "hint" }, "到「全图鉴」点开一头猪即可加入收藏，或到「添加」页批量录入"),
        el("div", {
          class: "arrow",
          style: "cursor:pointer",
          onclick: () => activateTab("atlas"),
        }, "�"),
      ]));
      return;
    }

    const pigs = currentCollectionPigs();
    if (pigs.length === 0) {
      box.appendChild(el("div", { class: "empty" }, [
        el("div", { class: "title" }, "没有符合筛选条件的猪"),
        el("div", { class: "hint" }, "试试换个颜色/获得方式，或清空搜索词"),
      ]));
      return;
    }

    const grid = el("div", { class: "grid" });
    for (const p of pigs) grid.appendChild(buildCard(p, { showRemove: true }));
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
    for (const p of pigs) grid.appendChild(buildCard(p, { showCollected: true }));
    box.appendChild(grid);
  }

  function renderStatsBar() {
    $("#count").textContent = state.dataLoaded
      ? `${state.collection.length} 只收藏 / 共 ${state.pigsById.size} 只`
      : "加载中…";

    // 收藏 tab: 颜色分布
    const sb = $("#statsBar");
    sb.innerHTML = "";
    if (state.collection.length > 0) {
      const byColor = {};
      for (const pNo of state.collection) {
        const p = state.pigsById.get(pNo);
        if (!p) continue;
        const c = p.color_text || "?";
        byColor[c] = (byColor[c] || 0) + 1;
      }
      const colorBits = Object.entries(byColor).sort((a, b) => b[1] - a[1])
        .map(([c, n]) => `${c} ${n}`).join(" · ");
      if (colorBits) sb.appendChild(text("颜色: " + colorBits));
    }

    // 全图鉴 tab: 当前筛选结果 / 总数 · 已收藏
    const asb = $("#atlasStatsBar");
    if (asb) {
      if (!state.dataLoaded) {
        asb.textContent = "";
      } else {
        const total = state.pigsById.size;
        const shown = currentAtlasPigs().length;
        const coll = state.collection.length;
        asb.textContent = `显示 ${shown} / 共 ${total} 只 · 已收藏 ${coll}`;
      }
    }
  }

  $("#clearBtn").addEventListener("click", () => {
    if (state.collection.length === 0) {
      toast("收藏已经是空的");
      return;
    }
    if (!confirm(`确定要清空全部 ${state.collection.length} 只收藏？`)) return;
    state.collection = [];
    saveCollection();
    render();
    toast("已清空收藏");
  });

  function render() {
    renderStatsBar();
    renderCollectionBody();
    renderAtlasBody();
    // sync 添加-tab 收藏管理 count
    const mc = $("#manageCount");
    if (mc) mc.textContent = `当前收藏 ${state.collection.length} 只`;
    // keep name-search results fresh (e.g. "已添加" tag)
    if ($("#tabAdd").classList.contains("active")) renderNameResults();
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
    const shopSel   = `#${id("shopRankFilter")}`;
    return function update() {
      const m = filterObj.method;
      const showHunt = m === "hunt", showShop = m === "shop";
      $(regionSel).style.display = showHunt ? "" : "none";
      $(ticketSel).style.display = showHunt ? "" : "none";
      $(shopSel).style.display   = showShop ? "" : "none";
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
  const updateCollectMethodSub = makeMethodSubUpdater("", state.filter);
  const updateAtlasMethodSub   = makeMethodSubUpdater("atlas", state.atlasFilter);

  // 收藏 tab filters (no prefix, legacy IDs)
  wireFilter("#colorFilter",      state.filter, "color");
  wireFilter("#grazeFilter",      state.filter, "graze");
  wireFilter("#methodFilter",     state.filter, "method", updateCollectMethodSub);
  wireFilter("#huntRegionFilter", state.filter, "huntRegion");
  wireFilter("#huntTicketFilter", state.filter, "huntTicket");
  wireFilter("#shopRankFilter",   state.filter, "shopRank");

  // 全图鉴 tab filters (atlas prefix)
  wireFilter("#atlasColorFilter",      state.atlasFilter, "color");
  wireFilter("#atlasGrazeFilter",      state.atlasFilter, "graze");
  wireFilter("#atlasMethodFilter",     state.atlasFilter, "method", updateAtlasMethodSub);
  wireFilter("#atlasHuntRegionFilter", state.atlasFilter, "huntRegion");
  wireFilter("#atlasHuntTicketFilter", state.atlasFilter, "huntTicket");
  wireFilter("#atlasShopRankFilter",   state.atlasFilter, "shopRank");

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
  wireSearch("#search",      state.filter);
  wireSearch("#atlasSearch", state.atlasFilter);

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

    // Event pigs don't participate in the 186-only collection list, so we
    // replace the add/remove button with a muted caption on their drawers.
    const inColl = !isEventPig && state.collection.includes(p.pNo);
    let collectBtn;
    if (isEventPig) {
      collectBtn = `<div class="hint-strip" style="flex:1;color:var(--muted);font-size:13px;padding:8px 10px;background:var(--card);border:1px solid var(--border);border-radius:10px;text-align:center">活动猪不列入全图鉴 / 收藏</div>`;
    } else if (inColl) {
      collectBtn = `<button type="button" class="add-btn danger" id="drawerCollectBtn">从收藏中移除</button>`;
    } else {
      collectBtn = `<button type="button" class="add-btn" id="drawerCollectBtn">加入收藏</button>`;
    }

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
    const recipeHTML = [];
    for (const iv of order) {
      const items = byView.get(String(iv));
      if (!items) continue;
      for (const r of items) {
        const p1 = r.pNo1 || {}, p2 = r.pNo2 || {};
        const p1Png = imgUrl(p1.pNo);
        const p2Png = imgUrl(p2.pNo);
        const partner = r.any
          ? `<div class="pname" style="color:var(--danger)">任意猪</div>`
          : `<div class="pname">${escHtml(p2.name || "?")}</div>` +
            (p2.rent ? `<div class="prent">借 ${p2.rent}pt</div>` : "");
        const outs = (r.result || []).map(o => {
          const k = o.pigKind || {};
          return `<span class="outcome"${linkAttr(k.pNo)}>${escHtml(k.name || "?")} ${o.prob}%</span>`;
        }).join("");
        const smTag = (iv === 3 || iv === 4 || iv === -3 || iv === -4) && r.result && r.result[0]
          ? ` · 系统图 #${r.result[0].orderNo} x${r.result[0].pigKind && r.result[0].pigKind.rare === 6 ? 10 : r.result[0].pigKind && r.result[0].pigKind.rare}`
          : "";
        recipeHTML.push(`
          <div class="recipe">
            <div class="tag">${BLEED_TYPE_TEXT[iv] || `isview=${iv}`}${smTag}</div>
            <div class="parents">
              <div class="parent"${linkAttr(p1.pNo)}>
                ${p1Png ? `<img src="${p1Png}" loading="lazy">` : ""}
                <div class="pname">${escHtml(p1.name || "?")}</div>
                ${p1.rent ? `<div class="prent">借 ${p1.rent}pt</div>` : ""}
              </div>
              <div class="plus">+</div>
              <div class="parent"${r.any ? "" : linkAttr(p2.pNo)}>
                ${p2Png && !r.any ? `<img src="${p2Png}" loading="lazy">` : ""}
                ${partner}
              </div>
            </div>
            <div class="outcomes">${outs}</div>
          </div>
        `);
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
      for (const r of items) {
        const partnerPng = r.partner ? imgUrl(r.partner.pNo) : "";
        const partnerBlock = r.any || !r.partner
          ? `<div class="pname" style="color:var(--danger)">任意猪</div>`
          : `<div class="pname">${escHtml(r.partner.name || "?")}</div>` +
            (r.partner.rent ? `<div class="prent">借 ${r.partner.rent}pt</div>` : "");
        const outs = (r.result || []).map(o => {
          const k = o.pigKind || {};
          const isSelf = k.pNo === p.pNo;
          const styleAttr = isSelf ? ' style="background:var(--ok);color:#fff"' : "";
          return `<span class="outcome"${styleAttr}${linkAttr(k.pNo)}>${escHtml(k.name || "?")} ${o.prob}%</span>`;
        }).join("");
        parentRecipeHTML.push(`
          <div class="recipe">
            <div class="tag">${BLEED_TYPE_TEXT[iv] || `isview=${iv}`}</div>
            <div class="parents">
              <div class="parent">
                ${pigImg ? `<img src="${pigImg}" loading="lazy">` : ""}
                <div class="pname">${escHtml(p.name)}</div>
              </div>
              <div class="plus">+</div>
              <div class="parent"${r.any || !r.partner ? "" : linkAttr(r.partner.pNo)}>
                ${partnerPng && !r.any && r.partner ? `<img src="${partnerPng}" loading="lazy">` : ""}
                ${partnerBlock}
              </div>
            </div>
            <div class="outcomes">${outs}</div>
          </div>
        `);
      }
    }
    const parentBlock = parentRecipeHTML.length > 0
      ? parentRecipeHTML.join("")
      : `<div class="kv">没有已知的配种产出 (可能仅作为被配出的结果)</div>`;
    box.innerHTML = `
      <h2>#${p.pNo} ${escHtml(p.name)}</h2>
      <div class="drawer-actions">${collectBtn}</div>
      <div class="hero">
        ${pigImg ? `<img src="${pigImg}" alt="${escHtml(p.name)}">` : ""}
        <div class="info">
          <div><b>${escHtml(p.color_text || "")}</b> · <span class="${p.special ? "stars special" : "stars"}">${stars(p.rare, p.special)}</span></div>
          <div class="meta">${posText}</div>
          <div class="meta">借猪 ${p.rent}pt · 售价 ${p.price}pt · ${p.isExer ? "🌿 放牧" : "🏠 不放牧"} · 🍚 最少喂 ${p.eat_times || 0} 次</div>
          <div class="meta">${(() => {
            const k = pigPicky(p);
            return k.level === "none"
              ? "🍽️ 不挑食"
              : `🍽️ ${k.label}: ${escHtml(k.foods.join(" / "))}`;
          })()}</div>
        </div>
      </div>
      ${p.description ? `<div class="kv" style="margin-top:10px"><div class="k">描述</div><div class="v">${escHtml(p.description)}</div></div>` : ""}
      <div class="section"><h3>获得方式</h3>${acqHTML.join("")}</div>
      <div class="section"><h3>它能配出的崽</h3>${parentBlock}</div>
      <div class="section"><h3>配种配出它的方式</h3>${recipeBlock}</div>
    `;
    // Wire the collect/uncollect button inside the drawer. Rebuilds the
    // drawer in place so the button label flips without closing the sheet.
    // (Event pigs have no button, just a muted caption.)
    const cbtn = $("#drawerCollectBtn");
    if (cbtn) {
      cbtn.addEventListener("click", () => {
        if (state.collection.includes(p.pNo)) {
          const i = state.collection.indexOf(p.pNo);
          state.collection.splice(i, 1);
          saveCollection();
          render();
          toast(`已移除: ${p.name}`);
        } else {
          const res = addByPNo(p.pNo);
          if (res.ok) { toast(res.msg); render(); }
          else if (res.msg) toast(res.msg);
        }
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
          try { drawer.setPointerCapture(activePointerId); } catch (_) {}
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
    const t = e.target.closest("[data-pno]");
    if (!t) return;
    const target = parseInt(t.dataset.pno, 10);
    if (!target || target === currentDetailPNo) return;
    e.stopPropagation();
    showDetail(target);
    // keep the scroll position comfortable when deep-diving a lineage
    $("#drawerContent").scrollTop = 0;
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
    try { localStorage.setItem(THEME_KEY, next); } catch {}
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
    atlas:   { panel: "#tabAtlas",   btn: "#tabBtnAtlas" },
    collect: { panel: "#tabCollect", btn: "#tabBtnCollect" },
    add:     { panel: "#tabAdd",     btn: "#tabBtnAdd" },
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
    if (name === "add") renderNameResults();
  }
  $("#tabBtnAtlas").addEventListener("click",   () => activateTab("atlas"));
  $("#tabBtnCollect").addEventListener("click", () => activateTab("collect"));
  $("#tabBtnAdd").addEventListener("click",     () => activateTab("add"));

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
        p.png ? el("img", { src: imgUrl(p.pNo), loading: "lazy", alt: p.name }) : el("div", { style: "width:36px;height:36px" }),
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

  // ----- bootstrap -----
  render(); // initial loading state
  loadData()
    .then(() => {
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
