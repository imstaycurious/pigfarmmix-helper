/**
 * 数据管理 — 编辑已有猪 / 新增猪 / 新增配种
 *
 * 数据写入 D1 (POST /api/atlas/update), 保存成功后重新拉取图鉴数据。
 */

import type { Pig } from "../js/types/index.js";
import { state } from "../js/state.js";
import { $, el } from "../js/utils.js";
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

// ---------- 猪编辑表单 ----------

function pigFormHTML(p: Pig | null): string {
  const isNew = !p;
  const v = (key: keyof Pig): string => {
    const val = p ? p[key] : undefined;
    if (val == null) return "";
    if (typeof val === "boolean") return val ? "1" : "0";
    if (typeof val === "object") return JSON.stringify(val);
    return String(val);
  };
  const colorOptions = Object.entries(COLOR_TEXT)
    .map(([code, name]) => `<option value="${code}" ${p && String(p.color) === code ? "selected" : ""}>${name} (${code})</option>`)
    .join("");
  return `
  <div class="de-form">
    <div class="de-section-title">${isNew ? "新增猪" : `编辑猪 #${p!.pNo} ${esc(p!.name)}`}</div>
    ${isNew ? "" : `<input type="hidden" id="dePNo" value="${p!.pNo}">`}
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
    ${`<div class="de-field">
        <label for="deDesc">描述</label>
        <textarea id="deDesc" rows="3" placeholder="猪的描述">${esc(isNew ? "" : v("description"))}</textarea>
      </div>`}
    <div class="de-grid2">
      ${fieldHTML("deAtlasType", "图鉴号 (1-7)", isNew ? "" : p?.atlas?.type ? String(p.atlas.type) : "", { hint: "7 = Events" })}
      ${fieldHTML("deAtlasIndex", "页内序号", isNew ? "" : p?.atlas?.index ? String(p.atlas.index) : "", { hint: "1-based" })}
    </div>
    <div class="de-grid2">
      ${fieldHTML("deWeightSmall", "小章体重 (kg)", isNew ? "" : p?.weight?.small != null ? String(p.weight.small) : "")}
      ${fieldHTML("deWeightBig", "大章体重 (kg)", isNew ? "" : p?.weight?.big != null ? String(p.weight.big) : "")}
    </div>
    <div class="de-grid2">
      ${fieldHTML("deRent", "借猪费用 (pt)", isNew ? "" : v("rent"))}
      ${fieldHTML("dePrice", "售价 (pt)", isNew ? "" : v("price"))}
    </div>
    <div class="de-grid2">
      ${fieldHTML("deLifespan", "成猪寿命 (小时)", isNew ? "" : v("lifespan"))}
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
      ${fieldHTML("deHints", "提示 (JSON 数组)", isNew ? "" : p?.hints ? JSON.stringify(p.hints) : "", { placeholder: '["提示1", "提示2"]' })}
    </div>
    ${fieldHTML("deAcquisition", "获取途径 (JSON)", isNew ? "" : p?.acquisition ? JSON.stringify(p.acquisition) : "", { placeholder: '{"shop": [0.1, 0, 0]}' })}
    ${fieldHTML("deFeeding", "喂食 (JSON)", isNew ? "" : p?.feeding ? JSON.stringify(p.feeding) : "", { placeholder: '{"interval": 8, "times": 3, "picky": []}' })}
    ${fieldHTML("deBreedingGuide", "配种指南 (JSON)", isNew ? "" : p?.breedingGuide ? JSON.stringify(p.breedingGuide) : "", { placeholder: '{"requirements": "…", "tips": "…"}' })}
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

async function savePigFromForm(isNew: boolean): Promise<void> {
  const name = ($("#deName") as HTMLInputElement | null)?.value.trim() || "";
  if (!name) {
    const m = $("#deMsg"); if (m) { m.textContent = "请填写名称"; m.className = "account-form-hint error"; }
    return;
  }
  const pig: Record<string, unknown> = {
    name,
    rare: Number(($("#deRare") as HTMLSelectElement)?.value || 1),
    color: Number(($("#deColor") as HTMLSelectElement)?.value || 0),
    status: ($("#deStatus") as HTMLSelectElement)?.value || "normal",
    description: ($("#deDesc") as HTMLTextAreaElement | null)?.value || undefined,
    atlasType: numOrNull(($("#deAtlasType") as HTMLInputElement | null)?.value || "") || undefined,
    atlasIndex: numOrNull(($("#deAtlasIndex") as HTMLInputElement | null)?.value || "") || undefined,
    weightSmall: numOrNull(($("#deWeightSmall") as HTMLInputElement | null)?.value || ""),
    weightBig: numOrNull(($("#deWeightBig") as HTMLInputElement | null)?.value || ""),
    rent: numOrNull(($("#deRent") as HTMLInputElement | null)?.value || ""),
    price: numOrNull(($("#dePrice") as HTMLInputElement | null)?.value || ""),
    lifespan: numOrNull(($("#deLifespan") as HTMLInputElement | null)?.value || ""),
    graze: ($("#deGraze") as HTMLSelectElement)?.value === "1",
    special: ($("#deSpecial") as HTMLSelectElement)?.value === "1",
  };
  if (!isNew) {
    pig.pNo = Number(($("#dePNo") as HTMLInputElement | null)?.value || 0);
  }
  const parseJson = (sel: string): unknown => {
    const v = ($(sel) as HTMLInputElement | null)?.value.trim();
    if (!v) return undefined;
    try { return JSON.parse(v); } catch { return undefined; }
  };
  const hints = parseJson("#deHints");
  const acquisition = parseJson("#deAcquisition");
  const feeding = parseJson("#deFeeding");
  const breedingGuide = parseJson("#deBreedingGuide");
  if (hints !== undefined) pig.hints = hints;
  if (acquisition !== undefined) pig.acquisition = acquisition;
  if (feeding !== undefined) pig.feeding = feeding;
  if (breedingGuide !== undefined) pig.breedingGuide = breedingGuide;

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
      const parts = l.split(/[\s,，]+/);
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

// 供 app.ts 使用
