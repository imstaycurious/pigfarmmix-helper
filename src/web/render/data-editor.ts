/**
 * 数据管理 — 编辑已有猪 / 新增猪 / 新增配种
 *
 * 数据写入 D1 (POST /api/atlas/update), 保存成功后重新拉取图鉴数据。
 * 表单字段友好化: JSON 字段翻译成具体字段, 高级 JSON 折叠保留。
 */

import type { Pig, PigAcquisition, PigFeeding, BreedingGuide } from "../js/types/index.js";
import { state } from "../js/state.js";
import { $ } from "../js/utils.js";
import { getCurrentUser } from "../js/auth.js";
import { toast } from "../js/utils.js";
import { loadData } from "../js/data.js";
import { emit } from "../js/events.js";
import { COLOR_TEXT } from "../js/constants.js";

// ---------- 小工具 ----------

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fieldHTML(id: string, label: string, value: string, opts: { type?: string; placeholder?: string; hint?: string } = {}): string {
  const { type = "text", placeholder = "", hint = "" } = opts;
  return `<div class="de-field">
    <label for="${id}">${label}</label>
    <input type="${type}" id="${id}" value="${esc(value)}" placeholder="${esc(placeholder)}" step="any">
    ${hint ? `<span class="de-hint">${hint}</span>` : ""}
  </div>`;
}

function textareaHTML(id: string, label: string, value: string, opts: { rows?: number; placeholder?: string; hint?: string } = {}): string {
  const { rows = 3, placeholder = "", hint = "" } = opts;
  return `<div class="de-field">
    <label for="${id}">${label}</label>
    <textarea id="${id}" rows="${rows}" placeholder="${esc(placeholder)}">${esc(value)}</textarea>
    ${hint ? `<span class="de-hint">${hint}</span>` : ""}
  </div>`;
}

function numListToStr(arr: number[] | undefined): string {
  return (arr || []).join(", ");
}

function strToNumList(s: string): number[] {
  return s.split(/[,，、\s]+/).map(x => Number(x)).filter(n => Number.isFinite(n) && n > 0);
}

// ---------- JSON 字段 → 表单字段的取值 ----------

function acqShopValue(a: PigAcquisition | undefined, idx: 0 | 1 | 2): string {
  const shop = a?.shop || [0, 0, 0];
  const v = shop[idx];
  return v != null && v > 0 ? String(Math.round(v * 10000) / 100) : ""; // 转百分比
}

function acqHuntSitesValue(a: PigAcquisition | undefined): string {
  return numListToStr(a?.hunt?.sites?.filter(s => s <= 16));
}

function acqFailValue(a: PigAcquisition | undefined): string {
  return numListToStr(a?.fail);
}

// ---------- 猪编辑表单 ----------

function pigFormHTML(p: Pig | null): string {
  const isNew = !p;
  const v = (key: keyof Pig): string => {
    const val = p ? p[key] : undefined;
    if (val == null) return "";
    if (typeof val === "boolean") return val ? "1" : "0";
    return String(val);
  };
  const colorOptions = Object.entries(COLOR_TEXT)
    .map(([code, name]) => `<option value="${code}" ${p && String(p.color) === code ? "selected" : ""}>${name} (${code})</option>`)
    .join("");
  const acq = p?.acquisition;
  const feed = p?.feeding;
  const guide = p?.breedingGuide;
  const hints = p?.hints || [];
  return `
  <div class="de-form">
    <div class="de-section-title">${isNew ? "新增猪" : `编辑猪 #${p!.pNo} ${esc(p!.name)}`}</div>
    ${isNew ? "" : `<input type="hidden" id="dePNo" value="${p!.pNo}">`}

    <div class="de-section-sub">基本信息</div>
    <div class="de-grid2">
      ${fieldHTML("deName", "名称 *", isNew ? "" : v("name"), { placeholder: "猪的名称" })}
      <div class="de-field">
        <label for="deRare">星级</label>
        <select id="deRare">
          ${[1, 2, 3, 4, 5, 6].map(n => `<option value="${n}" ${p && p.rare === n ? "selected" : ""}>${"★".repeat(n)}</option>`).join("")}
        </select>
      </div>
    </div>
    <div class="de-grid2">
      <div class="de-field">
        <label for="deColor">颜色</label>
        <select id="deColor">${colorOptions}</select>
      </div>
      <div class="de-field">
        <label for="deStatus">状态</label>
        <select id="deStatus">
          <option value="normal" ${p && p.status === "normal" ? "selected" : ""}>正常</option>
          <option value="hidden" ${p && p.status === "hidden" ? "selected" : ""}>隐藏</option>
          <option value="removed" ${p && p.status === "removed" ? "selected" : ""}>已移除</option>
        </select>
      </div>
    </div>
    ${textareaHTML("deDesc", "描述", isNew ? "" : v("description"), { rows: 2, placeholder: "猪的描述" })}

    <div class="de-section-sub">图鉴位置</div>
    <div class="de-grid2">
      ${fieldHTML("deAtlasType", "图鉴号", isNew ? "" : p?.atlas?.type ? String(p.atlas.type) : "", { type: "number", hint: "1-6 主图鉴, 7 = Events" })}
      ${fieldHTML("deAtlasIndex", "页内序号", isNew ? "" : p?.atlas?.index ? String(p.atlas.index) : "", { type: "number", hint: "1-based, 每页 6 格" })}
    </div>

    <div class="de-section-sub">成长与价格</div>
    <div class="de-grid2">
      ${fieldHTML("deWeightSmall", "小章体重 (kg)", isNew ? "" : p?.weight?.small != null ? String(p.weight.small) : "", { type: "number" })}
      ${fieldHTML("deWeightBig", "大章体重 (kg)", isNew ? "" : p?.weight?.big != null ? String(p.weight.big) : "", { type: "number" })}
    </div>
    <div class="de-grid2">
      ${fieldHTML("deRent", "借猪费用 (pt)", isNew ? "" : v("rent"), { type: "number" })}
      ${fieldHTML("dePrice", "售价 (pt)", isNew ? "" : v("price"), { type: "number" })}
    </div>
    <div class="de-grid2">
      ${fieldHTML("deLifespan", "成猪寿命 (小时)", isNew ? "" : v("lifespan"), { type: "number" })}
      <div class="de-field">
        <label for="deGraze">放牧</label>
        <select id="deGraze">
          <option value="0" ${p && !p.graze ? "selected" : ""}>否</option>
          <option value="1" ${p && p.graze ? "selected" : ""}>是</option>
        </select>
      </div>
    </div>
    <div class="de-grid2">
      <div class="de-field">
        <label for="deSpecial">特殊猪</label>
        <select id="deSpecial">
          <option value="0" ${p && !p.special ? "selected" : ""}>否</option>
          <option value="1" ${p && p.special ? "selected" : ""}>是</option>
        </select>
      </div>
    </div>

    <div class="de-section-sub">获取途径</div>
    <div class="de-grid3">
      ${fieldHTML("deShopA", "商店 A 级概率 (%)", acqShopValue(acq, 0), { type: "number", placeholder: "如 10" })}
      ${fieldHTML("deShopB", "商店 B 级概率 (%)", acqShopValue(acq, 1), { type: "number", placeholder: "如 5" })}
      ${fieldHTML("deShopC", "商店 C 级概率 (%)", acqShopValue(acq, 2), { type: "number", placeholder: "如 3" })}
    </div>
    ${fieldHTML("deHuntSites", "狩猎站点 (逗号分隔)", acqHuntSitesValue(acq), { placeholder: "如 1, 4, 11" })}
    ${fieldHTML("deFailFrom", "养成失败来源 (pNo, 逗号分隔)", acqFailValue(acq), { placeholder: "如 609, 543" })}
    <div class="de-field">
      <label class="de-check">
        <input type="checkbox" id="deSpecialFeeding" ${acq?.specialFeeding ? "checked" : ""}> 有超分歧 / 超出世系条件
      </label>
    </div>

    <div class="de-section-sub">喂食</div>
    <div class="de-grid3">
      ${fieldHTML("deFeedInterval", "喂食间隔 (小时)", feed?.interval != null ? String(feed.interval) : "", { type: "number", placeholder: "如 8" })}
      ${fieldHTML("deFeedTimes", "最少喂食次数", feed?.times != null ? String(feed.times) : "", { type: "number", placeholder: "如 3" })}
      ${fieldHTML("deFeedPicky", "挑食食材 (逗号分隔)", numListToStr(feed?.picky), { placeholder: "如 4, 6" })}
    </div>

    <div class="de-section-sub">配种指南</div>
    ${textareaHTML("deGuideReq", "要求", guide?.requirements || "", { rows: 2, placeholder: "如: 成猪前体重限制 ≥128.0 kg" })}
    ${textareaHTML("deGuideTips", "提示", guide?.tips || "", { rows: 2, placeholder: "如: 每种食物最少吃一次" })}

    <div class="de-section-sub">提示</div>
    ${textareaHTML("deHints", "提示 (每行一条)", hints.join("\n"), { rows: 3, placeholder: "每行一条提示" })}

    <details class="de-advanced">
      <summary>高级 (JSON 原始字段)</summary>
      <div class="de-advanced-body">
        ${fieldHTML("deAcquisitionJSON", "获取途径 JSON", isNew ? "" : p?.acquisition ? JSON.stringify(p.acquisition) : "", { placeholder: '{"shop": [0.1, 0, 0]}' })}
        ${fieldHTML("deFeedingJSON", "喂食 JSON", isNew ? "" : p?.feeding ? JSON.stringify(p.feeding) : "", { placeholder: '{"interval": 8, "times": 3, "picky": []}' })}
        ${fieldHTML("deBreedingGuideJSON", "配种指南 JSON", isNew ? "" : p?.breedingGuide ? JSON.stringify(p.breedingGuide) : "", { placeholder: '{"requirements": "...", "tips": "..."}' })}
        ${fieldHTML("deHintsJSON", "提示 JSON", isNew ? "" : p?.hints ? JSON.stringify(p.hints) : "", { placeholder: '["提示1", "提示2"]' })}
      </div>
    </details>

    <div class="de-actions">
      <button type="button" class="add-btn" id="deSaveBtn">保存</button>
      <button type="button" class="add-btn secondary" id="deCancelBtn">取消</button>
    </div>
    <p class="account-form-hint" id="deMsg"></p>
  </div>`;
}

// ---------- 配种表单 ----------

function breedingFormHTML(): string {
  return `
  <div class="de-form">
    <div class="de-section-title">新增配种</div>
    <div class="de-grid2">
      <div class="de-field">
        <label for="dbParent1">父/母 1 (pNo) *</label>
        <input type="number" id="dbParent1" placeholder="如 12" min="1">
      </div>
      <div class="de-field">
        <label for="dbParent2">父/母 2 (pNo)</label>
        <input type="text" id="dbParent2" placeholder="如 34, 或 * (任意)">
      </div>
    </div>
    <div class="de-section-sub">产出 (每行: 猪pNo 概率%)</div>
    <textarea id="dbOutcomes" class="de-textarea" rows="4" placeholder="每行一个产出, 格式: pNo 概率&#10;例如:&#10;55 30&#10;56 20"></textarea>
    <div class="de-field">
      <label class="de-check">
        <input type="checkbox" id="dbVisible" checked> 公开可见
      </label>
    </div>
    <div class="de-actions">
      <button type="button" class="add-btn" id="dbSaveBtn">保存配种</button>
      <button type="button" class="add-btn secondary" id="dbCancelBtn">取消</button>
    </div>
    <p class="account-form-hint" id="dbMsg"></p>
  </div>`;
}

// ---------- 保存 ----------

async function apiSave(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const user = getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };
  try {
    const res = await fetch("/api/atlas/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, ...body }),
    });
    const data = await res.json() as { ok?: boolean; error?: string };
    if (!res.ok || data.ok === false) {
      return { ok: false, error: data.error || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "网络错误,请稍后重试" };
  }
}

function numOrNull(v: string): number | null {
  const s = v.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function val(sel: string): string {
  return ($(sel) as HTMLInputElement | null)?.value.trim() || "";
}

function parseJsonField(sel: string): unknown {
  const v = val(sel);
  if (!v) return undefined;
  try { return JSON.parse(v); } catch { return undefined; }
}

/** 从友好字段构建 acquisition 对象 */
function buildAcquisition(): PigAcquisition {
  const a: PigAcquisition = {};
  const shopA = numOrNull(val("#deShopA"));
  const shopB = numOrNull(val("#deShopB"));
  const shopC = numOrNull(val("#deShopC"));
  if (shopA != null || shopB != null || shopC != null) {
    a.shop = [shopA != null ? shopA / 100 : 0, shopB != null ? shopB / 100 : 0, shopC != null ? shopC / 100 : 0];
  }
  const sites = strToNumList(val("#deHuntSites"));
  const fail = strToNumList(val("#deFailFrom"));
  const specialFeeding = ($("#deSpecialFeeding") as HTMLInputElement | null)?.checked ?? false;
  if (sites.length) a.hunt = { ...(a.hunt || {}), sites };
  if (fail.length) a.fail = fail;
  if (specialFeeding) a.specialFeeding = true;
  return a;
}

/** 从友好字段构建 feeding 对象 */
function buildFeeding(): PigFeeding {
  const f: PigFeeding = {};
  const interval = numOrNull(val("#deFeedInterval"));
  const times = numOrNull(val("#deFeedTimes"));
  const picky = strToNumList(val("#deFeedPicky"));
  if (interval != null) f.interval = interval;
  if (times != null) f.times = times;
  if (picky.length) f.picky = picky;
  return f;
}

/** 从友好字段构建 breedingGuide 对象 */
function buildGuide(): BreedingGuide {
  const g: BreedingGuide = {};
  const req = val("#deGuideReq");
  const tips = val("#deGuideTips");
  if (req) g.requirements = req;
  if (tips) g.tips = tips;
  return g;
}

async function savePigFromForm(isNew: boolean): Promise<void> {
  const name = val("#deName");
  if (!name) {
    const m = $("#deMsg"); if (m) { m.textContent = "请填写名称"; m.className = "account-form-hint error"; }
    return;
  }
  const pig: Record<string, unknown> = {
    name,
    rare: Number(($("#deRare") as HTMLSelectElement)?.value || 1),
    color: Number(($("#deColor") as HTMLSelectElement)?.value || 0),
    status: ($("#deStatus") as HTMLSelectElement)?.value || "normal",
    description: val("#deDesc") || undefined,
    atlasType: numOrNull(val("#deAtlasType")) || undefined,
    atlasIndex: numOrNull(val("#deAtlasIndex")) || undefined,
    weightSmall: numOrNull(val("#deWeightSmall")),
    weightBig: numOrNull(val("#deWeightBig")),
    rent: numOrNull(val("#deRent")),
    price: numOrNull(val("#dePrice")),
    lifespan: numOrNull(val("#deLifespan")),
    graze: ($("#deGraze") as HTMLSelectElement)?.value === "1",
    special: ($("#deSpecial") as HTMLSelectElement)?.value === "1",
  };
  if (!isNew) {
    pig.pNo = Number(($("#dePNo") as HTMLInputElement | null)?.value || 0);
  }

  // 友好字段优先; 若高级 JSON 填了, 以 JSON 为准
  const acqJSON = parseJsonField("#deAcquisitionJSON");
  const feedJSON = parseJsonField("#deFeedingJSON");
  const guideJSON = parseJsonField("#deBreedingGuideJSON");
  const hintsJSON = parseJsonField("#deHintsJSON");

  const acq = buildAcquisition();
  if (Object.keys(acq).length > 0 || acqJSON === undefined) pig.acquisition = acqJSON !== undefined ? acqJSON : (Object.keys(acq).length ? acq : undefined);
  const feed = buildFeeding();
  if (Object.keys(feed).length > 0 || feedJSON === undefined) pig.feeding = feedJSON !== undefined ? feedJSON : (Object.keys(feed).length ? feed : undefined);
  const guide = buildGuide();
  if (Object.keys(guide).length > 0 || guideJSON === undefined) pig.breedingGuide = guideJSON !== undefined ? guideJSON : (Object.keys(guide).length ? guide : undefined);

  // 提示: 每行一条; 高级 JSON 优先
  if (hintsJSON !== undefined) {
    pig.hints = hintsJSON;
  } else {
    const hintLines = val("#deHints").split("\n").map(s => s.trim()).filter(Boolean);
    if (hintLines.length) pig.hints = hintLines;
  }

  const result = await apiSave({ pig });
  const m = $("#deMsg");
  if (!m) return;
  if (result.ok) {
    m.textContent = "保存成功,正在刷新数据...";
    m.className = "account-form-hint success";
    await reloadData();
  } else {
    m.textContent = result.error || "保存失败";
    m.className = "account-form-hint error";
  }
}

async function saveBreedingFromForm(): Promise<void> {
  const p1 = Number(($("#dbParent1") as HTMLInputElement | null)?.value || 0);
  const p2raw = ($("#dbParent2") as HTMLInputElement | null)?.value.trim() || "";
  const p2 = p2raw === "*" ? "*" : Number(p2raw);
  const outcomesText = ($("#dbOutcomes") as HTMLTextAreaElement | null)?.value || "";
  const visible = ($("#dbVisible") as HTMLInputElement | null)?.checked ?? true;

  if (!p1 || p1 <= 0 || (!p2raw || (!(p2 === "*") && (!p2 || p2 <= 0)))) {
    const m = $("#dbMsg"); if (m) { m.textContent = "请填写有效的父母 pNo"; m.className = "account-form-hint error"; }
    return;
  }

  const outcomes = outcomesText.split("\n")
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => {
      const parts = l.split(/[\s,,]+/);
      const pNo = Number(parts[0]);
      const prob = parts.length > 1 ? Number(parts[1]) : 0;
      if (!pNo || pNo <= 0) return null;
      return { pNo, prob: Number.isFinite(prob) ? prob : 0 };
    })
    .filter((x): x is { pNo: number; prob: number } => x !== null);

  if (outcomes.length === 0) {
    const m = $("#dbMsg"); if (m) { m.textContent = "请至少填写一个产出"; m.className = "account-form-hint error"; }
    return;
  }

  const result = await apiSave({ breeding: { parent1: p1, parent2: p2, outcomes, visible } });
  const m = $("#dbMsg");
  if (!m) return;
  if (result.ok) {
    m.textContent = "配种已保存,正在刷新数据...";
    m.className = "account-form-hint success";
    await reloadData();
  } else {
    m.textContent = result.error || "保存失败";
    m.className = "account-form-hint error";
  }
}

/** 保存成功后重新加载图鉴数据 (本地状态 + 索引重建) */
async function reloadData(): Promise<void> {
  state.dataLoaded = false;
  state.pigsById = new Map();
  state.eventPigsById = new Map();
  state.hiddenPigsById = new Map();
  state.pigsByListKey = new Map();
  state.breedingTable = [];
  state.breedByParent = new Map();
  try {
    await loadData();
    emit("ui-refresh", undefined);
    toast("数据已更新");
  } catch {
    toast("数据刷新失败,请刷新页面");
  }
}

// ---------- 视图渲染 ----------

export function renderDataView(): void {
  const root = $("#mineDataView");
  if (!root) return;

  if (!getCurrentUser()) {
    root.innerHTML = `<div class="empty"><div class="title">请先登录</div><div class="hint">登录后才能编辑图鉴数据</div></div>`;
    return;
  }

  root.innerHTML = `
    <div class="de-tabs">
      <button type="button" class="de-tab active" data-de-tab="edit">编辑猪</button>
      <button type="button" class="de-tab" data-de-tab="new">新增猪</button>
      <button type="button" class="de-tab" data-de-tab="breeding">新增配种</button>
    </div>
    <div class="de-body" id="deBody"></div>
  `;

  const showTab = (tab: string): void => {
    root.querySelectorAll<HTMLElement>(".de-tab").forEach(t => t.classList.toggle("active", t.dataset.deTab === tab));
    const body = $("#deBody");
    if (!body) return;
    if (tab === "edit") {
      body.innerHTML = renderPigPicker();
      wirePigPicker();
    } else if (tab === "new") {
      body.innerHTML = pigFormHTML(null);
      wirePigForm(true);
    } else {
      body.innerHTML = breedingFormHTML();
      wireBreedingForm();
    }
  };

  root.querySelectorAll<HTMLElement>(".de-tab").forEach(btn => {
    btn.addEventListener("click", () => showTab(btn.dataset.deTab || "edit"));
  });
  showTab("edit");
}

function renderPigPicker(): string {
  const pigs = [...state.pigsById.values(), ...state.eventPigsById.values()]
    .sort((a, b) => a.pNo - b.pNo);
  return `
    <div class="de-picker">
      <input type="search" id="dePigSearch" class="search" placeholder="搜索 pNo / 名称...">
      <div class="de-pig-list" id="dePigList">
        ${pigs.map(p => `
          <button type="button" class="de-pig-item" data-pno="${p.pNo}">
            <span class="de-pig-no">#${p.pNo}</span>
            <span class="de-pig-name">${esc(p.name)}</span>
            <span class="de-pig-rare">${"★".repeat(Math.max(1, Math.min(6, p.rare)))}</span>
          </button>
        `).join("")}
      </div>
    </div>
  `;
}

function wirePigPicker(): void {
  const search = $("#dePigSearch") as HTMLInputElement | null;
  const list = $("#dePigList");
  if (!list) return;
  if (search) {
    search.addEventListener("input", () => {
      const q = search.value.trim().toLowerCase();
      list.querySelectorAll<HTMLElement>(".de-pig-item").forEach(item => {
        const no = item.dataset.pno || "";
        const name = item.querySelector(".de-pig-name")?.textContent || "";
        item.style.display = (!q || no.includes(q) || name.toLowerCase().includes(q)) ? "" : "none";
      });
    });
  }
  list.querySelectorAll<HTMLElement>(".de-pig-item").forEach(item => {
    item.addEventListener("click", () => {
      const pNo = Number(item.dataset.pno || 0);
      const p = state.pigsById.get(pNo) || state.eventPigsById.get(pNo) || state.hiddenPigsById.get(pNo);
      if (!p) return;
      const body = $("#deBody");
      if (!body) return;
      body.innerHTML = pigFormHTML(p);
      wirePigForm(false);
    });
  });
}

function wirePigForm(isNew: boolean): void {
  $("#deSaveBtn")?.addEventListener("click", () => savePigFromForm(isNew));
  $("#deCancelBtn")?.addEventListener("click", () => {
    const body = $("#deBody");
    if (!body) return;
    body.innerHTML = renderPigPicker();
    wirePigPicker();
  });
}

function wireBreedingForm(): void {
  $("#dbSaveBtn")?.addEventListener("click", () => saveBreedingFromForm());
  $("#dbCancelBtn")?.addEventListener("click", () => {
    const body = $("#deBody");
    if (!body) return;
    body.innerHTML = breedingFormHTML();
    wireBreedingForm();
  });
}
