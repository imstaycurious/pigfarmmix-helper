/**
 * 养猪场mix图鉴助手 — 纯静态客户端
 *
 * 加载一次 /data/pigs.json (~640KB, 186 只)
 * 用户收藏 (pNo 列表) 持久化在 localStorage
 * 筛选/搜索全在客户端
 */
(function () {
  "use strict";

  const IMG_BASE = "https://pigfarmmix.net/";
  const STORAGE_KEY = "pig_collection_v1";
  const DATA_URL = "/data/pigs.json";

  const METHOD_LABELS = {
    shop: "商店进货",
    hunt: "狩猎",
    hunt_event: "活动狩猎",
    quest: "任务",
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
    pigsById: new Map(),           // pNo -> pig detail
    pigsByListKey: new Map(),      // `${book}-${listno}` -> pNo
    collection: loadCollection(),  // array of pNo
    filter: { color: "", method: "", q: "", huntRegion: "", huntTicket: "", shopRank: "" },
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

  function imgUrl(p) {
    if (!p) return "";
    if (Array.isArray(p)) p = p[0] || "";
    if (!p) return "";
    if (p.startsWith("http")) return p;
    return IMG_BASE + p;
  }

  function stars(rare, special) {
    const glyph = special ? "✦" : "★";
    return glyph.repeat(Math.min(6, rare || 0));
  }

  // ----- data load -----
  async function loadData() {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error("加载数据失败: " + res.status);
    const bundle = await res.json();
    if (!bundle || !Array.isArray(bundle.pigs)) throw new Error("数据格式错误");

    for (const p of bundle.pigs) {
      state.pigsById.set(p.pNo, p);
      if (p.list && p.list.typeno && p.list.listno) {
        state.pigsByListKey.set(`${p.list.typeno}-${p.list.listno}`, p.pNo);
      }
    }
    state.dataLoaded = true;
    return bundle;
  }

  // ----- acquisition derivation (from upstream pig detail) -----
  function deriveAcquisitions(pig) {
    const groups = { shop: [], hunt: [], hunt_event: [], quest: [], fail: [], feed_special: [] };

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

    const q = pig.quest || {};
    if (q.quest || q.action || q.type) {
      const bits = [];
      if (q.type)   bits.push(`type=${q.type}`);
      if (q.action) bits.push(`action=${q.action}`);
      if (q.quest)  bits.push(`quest=${q.quest}`);
      groups.quest.push(bits.join(" · "));
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
  function currentCollectionPigs() {
    const { color, method, q, huntRegion, huntTicket, shopRank } = state.filter;
    const ql = q.toLowerCase();
    const out = [];
    for (const pNo of state.collection) {
      const p = state.pigsById.get(pNo);
      if (!p) continue;
      if (color && p.color_text !== color) continue;
      if (method && !pigHasMethod(p, method)) continue;
      if (method === "hunt" && !pigMatchesHunt(p, huntRegion, huntTicket)) continue;
      if (method === "shop" && !pigMatchesShopRank(p, shopRank)) continue;
      if (ql) {
        const hay = ((p.name || "") + " " + (p.description || "")).toLowerCase();
        if (!hay.includes(ql)) continue;
      }
      out.push(p);
    }
    out.sort((a, b) =>
      (a.book - b.book) || (a.page - b.page) || (a.slot - b.slot) || (a.pNo - b.pNo)
    );
    return out;
  }

  function renderBody() {
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
        el("div", { class: "hint" }, "切换到下方「添加」页来登记你的第一只猪"),
        el("div", {
          class: "arrow",
          style: "cursor:pointer",
          onclick: () => activateTab("add"),
        }, "👇"),
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
    for (const p of pigs) {
      const posText = p.book && p.book <= 6
        ? `图鉴${p.book} 页${p.page} #${p.slot}`
        : "";
      const remove = el("button", {
        class: "remove",
        "aria-label": "移除",
        onclick: (ev) => {
          ev.stopPropagation();
          removePig(p.pNo);
        },
      }, "×");
      const card = el("div", {
        class: "card",
        onclick: () => showDetail(p.pNo),
      }, [
        remove,
        el("div", { class: "img" },
          p.png ? el("img", { src: imgUrl(p.png), loading: "lazy", alt: p.name }) : null
        ),
        el("div", { class: "body" }, [
          el("div", { class: "name" }, `#${p.pNo} ${p.name}`),
          el("div", { class: "sub" }, `${p.color_text || ""} · ${posText}`),
          el("div", { class: "stars" + (p.special ? " special" : "") }, stars(p.rare, p.special)),
        ]),
      ]);
      grid.appendChild(card);
    }
    box.appendChild(grid);
  }

  function renderStatsBar() {
    $("#count").textContent = state.dataLoaded
      ? `${state.collection.length} 只收藏 / 共 ${state.pigsById.size} 只`
      : "加载中…";

    const sb = $("#statsBar");
    sb.innerHTML = "";
    if (state.collection.length === 0) return;
    const byColor = {};
    const byMethod = {};
    for (const pNo of state.collection) {
      const p = state.pigsById.get(pNo);
      if (!p) continue;
      const c = p.color_text || "?";
      byColor[c] = (byColor[c] || 0) + 1;
      const g = deriveAcquisitions(p);
      for (const k of Object.keys(g)) {
        if (g[k].length > 0) byMethod[k] = (byMethod[k] || 0) + 1;
      }
      if ((p.arrival_bleed || []).length > 0) byMethod.breed = (byMethod.breed || 0) + 1;
    }
    const colorBits = Object.entries(byColor).sort((a, b) => b[1] - a[1])
      .map(([c, n]) => `${c} ${n}`).join(" · ");
    if (colorBits) sb.appendChild(text("颜色: " + colorBits));
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
    renderBody();
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
  function wireFilter(rootSel, key, onChange) {
    $(rootSel).addEventListener("click", e => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      $$(".chip", $(rootSel)).forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      state.filter[key] = chip.dataset.value;
      if (onChange) onChange(chip.dataset.value);
      render();
    });
  }

  function resetChipRow(rootSel) {
    $$(".chip", $(rootSel)).forEach(c =>
      c.classList.toggle("active", c.dataset.value === ""));
  }
  function resetHuntSubFilter() {
    state.filter.huntRegion = "";
    state.filter.huntTicket = "";
    resetChipRow("#huntRegionFilter");
    resetChipRow("#huntTicketFilter");
  }
  function resetShopSubFilter() {
    state.filter.shopRank = "";
    resetChipRow("#shopRankFilter");
  }
  function updateMethodSubFilterVisibility() {
    const m = state.filter.method;
    const showHunt = m === "hunt";
    const showShop = m === "shop";
    $("#huntRegionFilter").style.display = showHunt ? "" : "none";
    $("#huntTicketFilter").style.display = showHunt ? "" : "none";
    $("#shopRankFilter").style.display   = showShop ? "" : "none";
    if (!showHunt) resetHuntSubFilter();
    if (!showShop) resetShopSubFilter();
  }

  wireFilter("#colorFilter", "color");
  wireFilter("#methodFilter", "method", () => updateMethodSubFilterVisibility());
  wireFilter("#huntRegionFilter", "huntRegion");
  wireFilter("#huntTicketFilter", "huntTicket");
  wireFilter("#shopRankFilter", "shopRank");

  let searchTimer = null;
  $("#search").addEventListener("input", e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.filter.q = e.target.value.trim();
      render();
    }, 200);
  });

  // ----- drawer (detail) -----
  function showDetail(pNo) {
    const p = state.pigsById.get(pNo);
    if (!p) return;
    const box = $("#drawerContent");
    const posText = p.book && p.book <= 6
      ? `图鉴${p.book} 页${p.page} #${p.slot}  (listno=${p.list && p.list.listno})`
      : "";

    const groups = deriveAcquisitions(p);
    const acqOrder = ["shop", "hunt", "hunt_event", "quest", "fail", "feed_special"];
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
        const p1Png = imgUrl(p1.png);
        const p2Png = imgUrl(p2.png);
        const partner = r.any
          ? `<div class="pname" style="color:var(--danger)">任意猪</div>`
          : `<div class="pname">${escHtml(p2.name || "?")}</div>` +
            (p2.rent ? `<div class="prent">借 ${p2.rent}pt</div>` : "");
        const outs = (r.result || []).map(o => {
          const k = o.pigKind || {};
          return `<span class="outcome">${escHtml(k.name || "?")} ${o.prob}%</span>`;
        }).join("");
        const smTag = (iv === 3 || iv === 4 || iv === -3 || iv === -4) && r.result && r.result[0]
          ? ` · 系统图 #${r.result[0].orderNo} x${r.result[0].pigKind && r.result[0].pigKind.rare === 6 ? 10 : r.result[0].pigKind && r.result[0].pigKind.rare}`
          : "";
        recipeHTML.push(`
          <div class="recipe">
            <div class="tag">${BLEED_TYPE_TEXT[iv] || `isview=${iv}`}${smTag}</div>
            <div class="parents">
              <div class="parent">
                ${p1Png ? `<img src="${p1Png}" loading="lazy">` : ""}
                <div class="pname">${escHtml(p1.name || "?")}</div>
                ${p1.rent ? `<div class="prent">借 ${p1.rent}pt</div>` : ""}
              </div>
              <div class="plus">+</div>
              <div class="parent">
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

    const pigImg = imgUrl(p.png) || "";
    box.innerHTML = `
      <h2>#${p.pNo} ${escHtml(p.name)}</h2>
      <div class="hero">
        ${pigImg ? `<img src="${pigImg}" alt="${escHtml(p.name)}">` : ""}
        <div class="info">
          <div><b>${escHtml(p.color_text || "")}</b> · <span class="${p.special ? "stars special" : "stars"}">${stars(p.rare, p.special)}</span></div>
          <div class="meta">${posText}</div>
          <div class="meta">借猪 ${p.rent}pt · 售价 ${p.price}pt · 寿命 ${p.lifespan}</div>
        </div>
      </div>
      ${p.description ? `<div class="kv" style="margin-top:10px"><div class="k">描述</div><div class="v">${escHtml(p.description)}</div></div>` : ""}
      ${p.arrival_comment ? `<div class="kv"><div class="k">饲养备注</div><div class="v">${escHtml(p.arrival_comment)}</div></div>` : ""}
      <div class="section"><h3>获得方式</h3>${acqHTML.join("")}</div>
      <div class="section"><h3>配种配出它的方式</h3>${recipeBlock}</div>
    `;
    $("#drawer").classList.add("open");
    $("#drawerBg").classList.add("open");
  }

  function escHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  $("#drawerBg").addEventListener("click", () => {
    $("#drawer").classList.remove("open");
    $("#drawerBg").classList.remove("open");
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
  function activateTab(name) {
    const isAdd = name === "add";
    $("#tabCollect").classList.toggle("active", !isAdd);
    $("#tabAdd").classList.toggle("active", isAdd);
    $("#tabBtnCollect").classList.toggle("active", !isAdd);
    $("#tabBtnAdd").classList.toggle("active", isAdd);
    $("#tabBtnCollect").setAttribute("aria-selected", String(!isAdd));
    $("#tabBtnAdd").setAttribute("aria-selected", String(isAdd));
    // scroll to top of the new panel
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
    // refresh name-search rendering (e.g. "已添加" tags)
    if (isAdd) renderNameResults();
  }
  $("#tabBtnCollect").addEventListener("click", () => activateTab("collect"));
  $("#tabBtnAdd").addEventListener("click", () => activateTab("add"));

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
        p.png ? el("img", { src: imgUrl(p.png), loading: "lazy", alt: p.name }) : el("div", { style: "width:36px;height:36px" }),
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
