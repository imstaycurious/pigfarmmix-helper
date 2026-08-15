/**
 * 导入导出 / 按名字添加 / 批量三元组
 */
import { state } from "../js/state.js";
import { $, el, toast, escHtml, imgUrl } from "../js/utils.js";
import { customConfirm } from "../js/modal.js";
import { RAISING_FLOORS, EXPORT_TYPE, EXPORT_VERSION } from "../js/constants.js";
import { saveCollection, saveOwnedEventPigs, saveSmallBadges, saveBigBadges, saveHiddenUnlocked, saveRaisingFloor } from "../js/storage.js";
import { mergeHiddenIntoMain, buildBreedingIndex } from "../js/data.js";
import { runtime } from "../js/runtime.js";
// ---- 按名字添加 ----
const nameState = { q: "", results: [] };
function searchByName(q) {
    const ql = q.trim().toLowerCase();
    if (!ql)
        return [];
    const out = [];
    for (const p of state.pigsById.values()) {
        const hay = ((p.name || "") + " " + (p.description || "") + " #" + p.pNo).toLowerCase();
        if (hay.includes(ql))
            out.push(p);
        if (out.length >= 60)
            break;
    }
    out.sort((a, b) => (a.book - b.book) || (a.page - b.page) || (a.slot - b.slot) || (a.pNo - b.pNo));
    return out;
}
function renderNameResults() {
    const box = $("#nameResults");
    if (!box)
        return;
    box.innerHTML = "";
    if (!nameState.q) {
        box.classList.remove("show");
        return;
    }
    box.classList.add("show");
    if (nameState.results.length === 0) {
        box.appendChild(el("div", { class: "empty-row" }, "没有匹配的猪"));
        return;
    }
    for (const p of nameState.results) {
        const already = state.ownedSet.has(p.pNo);
        const posText = p.book && p.book <= 6
            ? `图鉴${p.book}/页${p.page}/格${p.slot}`
            : (p.book === 7 ? "活动图鉴" : "");
        const row = el("div", {
            class: "row",
            onclick: () => { const res = addByPNo(p.pNo); if (res.err) {
                toast(res.err);
                return;
            } toast(res.msg || "已添加"); runtime.render(); },
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
// ---- 三元组添加 ----
function parseTriple(book, page, slot) {
    const b = parseInt(book, 10), p = parseInt(page, 10), s = parseInt(slot, 10);
    if (!(b >= 1 && b <= 6))
        return { err: "图鉴需为 1~6" };
    if (!(p >= 1))
        return { err: "页需 ≥ 1" };
    if (!(s >= 1 && s <= 6))
        return { err: "格需为 1~6" };
    return { book: b, page: p, slot: s, listno: (p - 1) * 6 + s };
}
function addByPNo(pNo) {
    if (!state.dataLoaded)
        return { err: "数据还没加载好" };
    const p = state.pigsById.get(pNo);
    if (!p)
        return { err: `找不到 #${pNo}` };
    if (state.ownedSet.has(pNo)) {
        return { ok: false, pig: p, msg: `已在收藏中: #${pNo} ${p.name}` };
    }
    state.collection.push(pNo);
    state.ownedSet.add(pNo);
    saveCollection(state.collection);
    return { ok: true, pig: p, msg: `已添加: #${pNo} ${p.name}` };
}
function addFromTriple(book, page, slot) {
    if (!state.dataLoaded)
        return { err: "数据还没加载好" };
    const parsed = parseTriple(book, page, slot);
    if (parsed.err)
        return { err: parsed.err };
    const key = `${parsed.book}-${parsed.listno}`;
    const pNo = state.pigsByListKey.get(key);
    if (!pNo) {
        return { err: `图鉴${parsed.book} 页${parsed.page} #${parsed.slot} 找不到对应的猪` };
    }
    return addByPNo(pNo);
}
// ---- 批量三元组 ----
function parseBatchLines(text) {
    const lines = text.split(/\r?\n/);
    const parsed = [];
    lines.forEach((raw, idx) => {
        const line = raw.trim();
        if (!line || line.startsWith("#") || line.startsWith("//"))
            return;
        const parts = line.split(/[\s\/,.;]+/).filter(Boolean);
        parsed.push({ raw: line, idx: idx + 1, parts });
    });
    return parsed;
}
// ---- 导出 ----
function buildExportPayload() {
    const sortedMain = [];
    for (const pNo of state.collection) {
        const p = state.pigsById.get(pNo);
        if (p)
            sortedMain.push(p);
    }
    sortedMain.sort((a, b) => (a.book - b.book) || (a.page - b.page) || (a.slot - b.slot) || (a.pNo - b.pNo));
    return {
        type: EXPORT_TYPE,
        version: EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        owned186Pigs: sortedMain.map(p => p.pNo),
        ownedEventPigs: Array.from(state.ownedEventPigs).sort((a, b) => a - b),
        smallBadges: Array.from(state.smallBadges).sort((a, b) => a - b),
        bigBadges: Array.from(state.bigBadges).sort((a, b) => a - b),
        raisingPigs: state.raisingPigs.map(item => ({
            id: item.id,
            pNo: item.pNo,
            startedAt: item.startedAt,
            lastFedAt: item.lastFedAt,
            notifiedAt: item.notifiedAt || 0,
            feedCount: Math.max(0, Number.parseInt(String(item.feedCount || 0), 10) || 0),
            pausedAt: item.status === "waiting" ? 0 : (Number(item.pausedAt) || 0),
            status: item.status === "waiting" ? "waiting" : "active",
        })),
        raisingFloor: state.raisingFloor,
        hiddenUnlocked: state.hiddenUnlocked,
    };
}
async function copyText(txt) {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(txt);
            return true;
        }
    }
    catch { /* fall through */ }
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
    }
    catch {
        return false;
    }
}
function runExport(alsoCopy) {
    const out = $("#exportOut");
    const msg = $("#exportMsg");
    if (!state.dataLoaded) {
        if (msg)
            msg.innerHTML = `<span class="err">数据还没加载好</span>`;
        return;
    }
    const payload = buildExportPayload();
    const txt = JSON.stringify(payload, null, 2);
    if (out)
        out.value = txt;
    const nColl = payload.owned186Pigs.length;
    const nOwned = payload.ownedEventPigs.length;
    const nSmall = payload.smallBadges.length;
    const nBig = payload.bigBadges.length;
    const nRaising = payload.raisingPigs.length;
    if (nColl === 0 && nOwned === 0 && nSmall === 0 && nBig === 0 && nRaising === 0) {
        if (msg)
            msg.innerHTML = `<span class="err">记录为空, 没什么可导出</span>`;
        return;
    }
    const summary = `186 已拥有 ${nColl} · Events 已拥有 ${nOwned} · 小章 ${nSmall} · 大章 ${nBig}`;
    if (alsoCopy) {
        copyText(txt).then(ok => {
            if (ok) {
                if (msg)
                    msg.innerHTML = `<span class="ok">已复制到剪贴板: ${summary}</span>`;
                toast("已复制到剪贴板");
            }
            else {
                if (out) {
                    out.focus();
                    out.select();
                }
                if (msg)
                    msg.innerHTML = `<span class="err">复制失败, 请手动选中上方文本复制</span>`;
            }
        });
    }
    else {
        if (out) {
            out.focus();
            out.select();
        }
        if (msg)
            msg.innerHTML = `<span class="ok">已导出: ${summary}</span>`;
    }
}
function runExportDownload() {
    const msg = $("#exportMsg");
    if (!state.dataLoaded) {
        if (msg)
            msg.innerHTML = `<span class="err">数据还没加载好</span>`;
        return;
    }
    const payload = buildExportPayload();
    if (payload.owned186Pigs.length === 0 && payload.ownedEventPigs.length === 0 && payload.smallBadges.length === 0 && payload.bigBadges.length === 0 && payload.raisingPigs.length === 0) {
        if (msg)
            msg.innerHTML = `<span class="err">记录为空, 没什么可导出</span>`;
        return;
    }
    const txt = JSON.stringify(payload, null, 2);
    const out = $("#exportOut");
    if (out)
        out.value = txt;
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
        if (msg)
            msg.innerHTML = `<span class="ok">已下载备份文件</span>`;
    }
    catch (err) {
        console.error(err);
        if (msg)
            msg.innerHTML = `<span class="err">下载失败:${escHtml(err instanceof Error ? err.message : String(err))}</span>`;
    }
}
// ---- 导入 ----
function parseImportText(raw) {
    const txt = (raw || "").trim();
    const emptyResult = (err) => ({ err, collection: [], ownedEventPigs: [], smallBadges: [], bigBadges: [], raisingPigs: [], source: "json", formatVersion: 0 });
    if (!txt)
        return emptyResult("输入为空");
    if (txt.startsWith("{") || txt.startsWith("[")) {
        let obj;
        try {
            obj = JSON.parse(txt);
        }
        catch (err) {
            return emptyResult(`JSON 解析失败: ${err instanceof Error ? err.message : String(err)}`);
        }
        if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
            return emptyResult("JSON 顶层必须是一个对象");
        }
        if (obj.type && obj.type !== EXPORT_TYPE) {
            return emptyResult(`不是本工具的备份文件 (type=${obj.type})`);
        }
        const fileVersion = Number.parseInt(String(obj.version), 10) || 1;
        const hasV2 = Array.isArray(obj.owned186Pigs) || Array.isArray(obj.owned186Triplets);
        const isV2 = hasV2 || fileVersion >= 2;
        const collection = [];
        const tripletToPNo = (s) => {
            const m = String(s).match(/^(\d+)[\/\s,.;]+(\d+)[\/\s,.;]+(\d+)$/);
            if (!m)
                return null;
            const key = `${+m[1]}-${(+m[2] - 1) * 6 + +m[3]}`;
            return state.pigsByListKey.get(key) || null;
        };
        if (isV2) {
            if (Array.isArray(obj.owned186Pigs)) {
                for (const v of obj.owned186Pigs) {
                    const n = Number.parseInt(String(v), 10);
                    if (Number.isInteger(n) && state.pigsById.has(n))
                        collection.push(n);
                }
            }
            else if (Array.isArray(obj.owned186Triplets)) {
                for (const s of obj.owned186Triplets) {
                    const pNo = tripletToPNo(s);
                    if (pNo)
                        collection.push(pNo);
                }
            }
        }
        else {
            const unowned = new Set();
            if (Array.isArray(obj.collection)) {
                for (const v of obj.collection) {
                    const n = Number.parseInt(String(v), 10);
                    if (Number.isInteger(n))
                        unowned.add(n);
                }
            }
            else if (Array.isArray(obj.collectionTriplets)) {
                for (const s of obj.collectionTriplets) {
                    const pNo = tripletToPNo(s);
                    if (pNo)
                        unowned.add(pNo);
                }
            }
            for (const [pNo, pig] of state.pigsById) {
                if (pig.status === "hidden")
                    continue;
                if (!unowned.has(pNo))
                    collection.push(pNo);
            }
        }
        const ownedEventPigs = [];
        if (Array.isArray(obj.ownedEventPigs)) {
            for (const v of obj.ownedEventPigs) {
                const n = Number.parseInt(String(v), 10);
                if (Number.isInteger(n) && state.eventPigsById.has(n))
                    ownedEventPigs.push(n);
            }
        }
        const smallBadges = [];
        if (Array.isArray(obj.smallBadges)) {
            for (const v of obj.smallBadges) {
                const n = Number.parseInt(String(v), 10);
                if (Number.isInteger(n) && (state.pigsById.has(n) || state.eventPigsById.has(n)))
                    smallBadges.push(n);
            }
        }
        const bigBadges = [];
        if (Array.isArray(obj.bigBadges)) {
            for (const v of obj.bigBadges) {
                const n = Number.parseInt(String(v), 10);
                if (Number.isInteger(n) && (state.pigsById.has(n) || state.eventPigsById.has(n)))
                    bigBadges.push(n);
            }
        }
        const raisingPigs = [];
        if (Array.isArray(obj.raisingPigs)) {
            const now = Date.now();
            for (const raw of obj.raisingPigs) {
                const r = raw;
                const pNo = Number.parseInt(String(r.pNo), 10);
                if (!Number.isInteger(pNo) || !(state.pigsById.has(pNo) || state.eventPigsById.has(pNo)))
                    continue;
                const startedAt = Number.parseInt(String(r.startedAt), 10);
                const lastFedAt = Number.parseInt(String(r.lastFedAt), 10);
                const notifiedAt = Number.parseInt(String(r.notifiedAt ?? 0), 10) || 0;
                const feedCount = Math.max(0, Number.parseInt(String(r.feedCount ?? 0), 10) || 0);
                const status = r.status === "waiting" ? "waiting" : "active";
                const pausedAt = status === "active" ? Math.max(0, Number.parseInt(String(r.pausedAt ?? 0), 10) || 0) : 0;
                raisingPigs.push({
                    id: String(r.id || makeRaisingId()),
                    pNo,
                    startedAt: Number.isFinite(startedAt) ? startedAt : now,
                    lastFedAt: Number.isFinite(lastFedAt) ? lastFedAt : now,
                    notifiedAt, feedCount, pausedAt, status,
                });
            }
        }
        const rf = String(obj.raisingFloor);
        const raisingFloor = (rf === "woodchip" || rf === "normal" || rf === "straw") ? rf : undefined;
        const hiddenUnlocked = obj.hiddenUnlocked === true ? true : undefined;
        return {
            collection, ownedEventPigs, smallBadges, bigBadges, raisingPigs, raisingFloor,
            hiddenUnlocked, source: "json", formatVersion: isV2 ? Math.max(2, fileVersion) : 1,
        };
    }
    // Fallback: 三元组裸文本
    const items = parseBatchLines(txt);
    if (items.length === 0)
        return emptyResult("没有可识别的 JSON 或三元组内容");
    const coll = [];
    let skipped = 0;
    for (const it of items) {
        if (it.parts.length < 3) {
            skipped++;
            continue;
        }
        const [b, p, s] = it.parts.map(n => parseInt(n, 10));
        if (!(b >= 1 && b <= 6 && p >= 1 && s >= 1 && s <= 6)) {
            skipped++;
            continue;
        }
        const pNo = state.pigsByListKey.get(`${b}-${(p - 1) * 6 + s}`);
        if (pNo)
            coll.push(pNo);
        else
            skipped++;
    }
    return {
        collection: coll, ownedEventPigs: [], smallBadges: [], bigBadges: [], raisingPigs: [],
        source: "triplets", formatVersion: 2, skipped,
    };
}
function applyImport(parsed, { replace }) {
    const desiredColl = Array.from(new Set(parsed.collection));
    const desiredOwned = new Set(parsed.ownedEventPigs);
    const desiredSmall = new Set(parsed.smallBadges || []);
    const desiredBig = new Set(parsed.bigBadges || []);
    const desiredRaising = Array.isArray(parsed.raisingPigs) ? parsed.raisingPigs : [];
    let addedColl = 0, removedColl = 0;
    let addedOwned = 0, removedOwned = 0;
    let addedSmall = 0, removedSmall = 0;
    let addedBig = 0, removedBig = 0;
    let addedRaising = 0, removedRaising = 0;
    if (replace) {
        const prevColl = new Set(state.collection);
        const nextColl = new Set(desiredColl);
        state.collection = desiredColl.slice();
        for (const n of nextColl)
            if (!prevColl.has(n))
                addedColl++;
        for (const n of prevColl)
            if (!nextColl.has(n))
                removedColl++;
        const prevOwned = new Set(state.ownedEventPigs);
        state.ownedEventPigs = new Set(desiredOwned);
        for (const n of desiredOwned)
            if (!prevOwned.has(n))
                addedOwned++;
        for (const n of prevOwned)
            if (!desiredOwned.has(n))
                removedOwned++;
        const prevSmall = new Set(state.smallBadges);
        state.smallBadges = new Set(desiredSmall);
        for (const n of desiredSmall)
            if (!prevSmall.has(n))
                addedSmall++;
        for (const n of prevSmall)
            if (!desiredSmall.has(n))
                removedSmall++;
        const prevBig = new Set(state.bigBadges);
        state.bigBadges = new Set(desiredBig);
        for (const n of desiredBig)
            if (!prevBig.has(n))
                addedBig++;
        for (const n of prevBig)
            if (!desiredBig.has(n))
                removedBig++;
        const prevRaising = state.raisingPigs.length;
        state.raisingPigs = desiredRaising.map(item => ({ ...item }));
        addedRaising = state.raisingPigs.length;
        removedRaising = prevRaising;
    }
    else {
        const have = new Set(state.collection);
        for (const n of desiredColl) {
            if (!have.has(n)) {
                state.collection.push(n);
                have.add(n);
                addedColl++;
            }
        }
        for (const n of desiredOwned) {
            if (!state.ownedEventPigs.has(n)) {
                state.ownedEventPigs.add(n);
                addedOwned++;
            }
        }
        for (const n of desiredSmall) {
            if (!state.smallBadges.has(n)) {
                state.smallBadges.add(n);
                addedSmall++;
            }
        }
        for (const n of desiredBig) {
            if (!state.bigBadges.has(n)) {
                state.bigBadges.add(n);
                addedBig++;
            }
        }
        const haveIds = new Set(state.raisingPigs.map(item => item.id));
        for (const item of desiredRaising) {
            const next = { ...item };
            if (haveIds.has(next.id))
                next.id = makeRaisingId();
            state.raisingPigs.push(next);
            haveIds.add(next.id);
            addedRaising++;
        }
    }
    if (parsed.raisingFloor && RAISING_FLOORS[parsed.raisingFloor]) {
        state.raisingFloor = parsed.raisingFloor;
        saveRaisingFloor(state.raisingFloor);
        runtime.syncRaisingFloorSelect();
    }
    saveCollection(state.collection);
    saveOwnedEventPigs(state.ownedEventPigs);
    saveSmallBadges(state.smallBadges);
    saveBigBadges(state.bigBadges);
    runtime.saveRaisingState();
    let unlocked = false;
    if (parsed.hiddenUnlocked === true && !state.hiddenUnlocked) {
        state.hiddenUnlocked = true;
        saveHiddenUnlocked(state.hiddenUnlocked);
        mergeHiddenIntoMain();
        buildBreedingIndex(state.breedingTable);
        unlocked = true;
    }
    return {
        addedColl, removedColl, addedOwned, removedOwned,
        addedSmall, removedSmall, addedBig, removedBig,
        addedRaising, removedRaising, unlocked,
    };
}
async function runImport(replace) {
    const msg = $("#importMsg");
    if (!state.dataLoaded) {
        if (msg)
            msg.innerHTML = `<span class="err">数据还没加载好</span>`;
        return;
    }
    const raw = $("#importIn")?.value || "";
    const parsed = parseImportText(raw);
    if (parsed.err) {
        if (msg)
            msg.innerHTML = `<span class="err">${escHtml(parsed.err)}</span>`;
        return;
    }
    const nColl = parsed.collection.length;
    const nOwned = parsed.ownedEventPigs.length;
    const nSmall = parsed.smallBadges.length;
    const nBig = parsed.bigBadges.length;
    const nRaising = (parsed.raisingPigs || []).length;
    if (nColl === 0 && nOwned === 0 && nSmall === 0 && nBig === 0 && nRaising === 0) {
        if (msg)
            msg.innerHTML = `<span class="err">解析成功但内容为空 (可能 pNo 对不上当前数据)</span>`;
        return;
    }
    if (replace) {
        const fmtHint = parsed.formatVersion === 1 ? `\n\n已识别为 v1 老版备份` : "";
        const confirmTitle = "覆盖导入会替换你现有的全部记录";
        const confirmDetails = `186 已拥有 ${state.collection.length} → 导入 ${nColl}\n` +
            `Events 已拥有 ${state.ownedEventPigs.size} → 导入 ${nOwned}\n` +
            `小章 ${state.smallBadges.size} → 导入 ${nSmall}\n` +
            `大章 ${state.bigBadges.size} → 导入 ${nBig}` + fmtHint;
        if (!(await customConfirm(confirmTitle, confirmDetails)))
            return;
    }
    const r = applyImport(parsed, { replace });
    runtime.render();
    runtime.renderRaisingSearchResults();
    runtime.checkRaisingReminders();
    const parts = [];
    if (r.addedColl)
        parts.push(`186新增 ${r.addedColl}`);
    if (r.removedColl)
        parts.push(`186移除 ${r.removedColl}`);
    if (r.addedOwned)
        parts.push(`Events新增 ${r.addedOwned}`);
    if (r.removedOwned)
        parts.push(`Events移除 ${r.removedOwned}`);
    if (r.addedSmall)
        parts.push(`小章新增 ${r.addedSmall}`);
    if (r.removedSmall)
        parts.push(`小章移除 ${r.removedSmall}`);
    if (r.addedBig)
        parts.push(`大章新增 ${r.addedBig}`);
    if (r.removedBig)
        parts.push(`大章移除 ${r.removedBig}`);
    if (r.addedRaising)
        parts.push(`养成新增 ${r.addedRaising}`);
    if (r.removedRaising)
        parts.push(`养成移除 ${r.removedRaising}`);
    const tags = [];
    if (parsed.source === "triplets")
        tags.push("三元组裸文本");
    else if (parsed.formatVersion === 1)
        tags.push("v1 老版 · 已自动反转 collection");
    else if (parsed.formatVersion >= 3)
        tags.push(`v${parsed.formatVersion} 新版`);
    else
        tags.push("v2 新版");
    if (r.unlocked)
        tags.push("隐藏图鉴已解锁");
    const suffix = ` <span style="color:var(--muted)">· ${tags.join(" · ")}</span>`;
    if (msg) {
        msg.innerHTML = parts.length
            ? `<span class="ok">导入完成: ${parts.join(" · ")}</span>${suffix}`
            : `<span class="ok">导入完成: 没有变化 (全部已存在)</span>${suffix}`;
    }
    toast("导入完成");
}
function makeRaisingId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
// ---- Wire up events (called from app.ts) ----
export function setupImportExport() {
    // Name search
    let nameSearchTimer = null;
    $("#nameIn")?.addEventListener("input", (e) => {
        if (nameSearchTimer)
            clearTimeout(nameSearchTimer);
        const v = e.target.value;
        nameSearchTimer = setTimeout(() => {
            nameState.q = v;
            nameState.results = state.dataLoaded ? searchByName(v) : [];
            const msg = $("#nameMsg");
            if (!v.trim()) {
                if (msg)
                    msg.textContent = "输入至少 1 个字符开始搜索,点击结果即可添加";
            }
            else if (!state.dataLoaded) {
                if (msg)
                    msg.innerHTML = `<span class="err">数据还没加载好</span>`;
            }
            else {
                if (msg)
                    msg.textContent = `找到 ${nameState.results.length} 只匹配的猪`;
            }
            renderNameResults();
        }, 160);
    });
    // Triplet add
    $("#addForm")?.addEventListener("submit", (ev) => {
        ev.preventDefault();
        const b = $("#bookIn")?.value || "";
        const p = $("#pageIn")?.value || "";
        const s = $("#slotIn")?.value || "";
        const res = addFromTriple(b, p, s);
        const msg = $("#addMsg");
        if (res.err) {
            if (msg)
                msg.innerHTML = `<span class="err">${res.err}</span>`;
            return;
        }
        if (msg)
            msg.innerHTML = res.ok ? `<span class="ok">${res.msg || ""}</span>` : `<span class="err">${res.msg || ""}</span>`;
        if (res.ok) {
            toast(res.msg || "已添加");
            runtime.render();
            const bookIn = $("#bookIn");
            const pageIn = $("#pageIn");
            const slotIn = $("#slotIn");
            if (bookIn)
                bookIn.value = "";
            if (pageIn)
                pageIn.value = "";
            if (slotIn)
                slotIn.value = "";
            bookIn?.focus();
        }
    });
    // Auto-advance
    const order = ["bookIn", "pageIn", "slotIn"];
    for (let i = 0; i < order.length; i++) {
        const cur = $(`#${order[i]}`);
        if (!cur)
            continue;
        cur.addEventListener("input", () => {
            const v = cur.value;
            const maxDigits = order[i] === "bookIn" ? 1 : (order[i] === "slotIn" ? 1 : 2);
            if (v && v.length >= maxDigits && i < order.length - 1) {
                $(`#${order[i + 1]}`)?.focus();
            }
        });
        cur.addEventListener("paste", (e) => {
            const data = e.clipboardData?.getData("text") || "";
            const parts = data.trim().split(/[\s\/,.;#]+/).filter(Boolean);
            if (parts.length >= 3) {
                e.preventDefault();
                const bookIn = $("#bookIn");
                const pageIn = $("#pageIn");
                const slotIn = $("#slotIn");
                if (bookIn)
                    bookIn.value = parts[0] || "";
                if (pageIn)
                    pageIn.value = parts[1] || "";
                if (slotIn)
                    slotIn.value = parts[2] || "";
                $("#addBtn")?.focus();
            }
        });
    }
    // Batch
    $("#batchAddBtn")?.addEventListener("click", () => {
        const ta = $("#batchIn");
        const report = $("#batchReport");
        if (report)
            report.innerHTML = "";
        if (!state.dataLoaded) {
            if (report)
                report.innerHTML = `<div class="line err">数据还没加载好</div>`;
            return;
        }
        const text = ta?.value || "";
        const items = parseBatchLines(text);
        if (items.length === 0) {
            if (report)
                report.innerHTML = `<div class="line err">没有有效的三元组输入</div>`;
            return;
        }
        let okCount = 0, dupCount = 0, errCount = 0;
        const frag = document.createDocumentFragment();
        for (const it of items) {
            if (it.parts.length < 3) {
                frag.appendChild(el("div", { class: "line err" }, `L${it.idx}: "${it.raw}" — 需要 3 个数字`));
                errCount++;
                continue;
            }
            const [b, p, s] = it.parts;
            const res = addFromTriple(b, p, s);
            if (res.err) {
                frag.appendChild(el("div", { class: "line err" }, `L${it.idx}: ${b}/${p}/${s} — ${res.err}`));
                errCount++;
            }
            else if (res.ok) {
                frag.appendChild(el("div", { class: "line ok" }, `L${it.idx}: ${b}/${p}/${s} → #${res.pig.pNo} ${res.pig.name}`));
                okCount++;
            }
            else {
                frag.appendChild(el("div", { class: "line dup" }, `L${it.idx}: ${b}/${p}/${s} → #${res.pig.pNo} ${res.pig.name} (已在收藏中)`));
                dupCount++;
            }
        }
        const summary = el("div", { class: "line" }, `总结: 新增 ${okCount} · 重复 ${dupCount} · 失败 ${errCount}`);
        summary.style.fontWeight = "600";
        summary.style.paddingBottom = "4px";
        summary.style.borderBottom = "1px solid var(--border)";
        summary.style.marginBottom = "4px";
        report?.appendChild(summary);
        report?.appendChild(frag);
        if (okCount > 0) {
            toast(`已添加 ${okCount} 只` + (dupCount ? ` · 重复 ${dupCount}` : "") + (errCount ? ` · 失败 ${errCount}` : ""));
            runtime.render();
        }
        else if (dupCount > 0 && errCount === 0) {
            toast(`全部 ${dupCount} 只已在收藏中`);
        }
    });
    $("#batchClearBtn")?.addEventListener("click", () => {
        const ta = $("#batchIn");
        const report = $("#batchReport");
        if (ta)
            ta.value = "";
        if (report)
            report.innerHTML = "";
    });
    // Export / Import
    $("#exportBtn")?.addEventListener("click", () => runExport(false));
    $("#exportCopyBtn")?.addEventListener("click", () => runExport(true));
    $("#exportDownloadBtn")?.addEventListener("click", runExportDownload);
    $("#importMergeBtn")?.addEventListener("click", () => runImport(false));
    $("#importReplaceBtn")?.addEventListener("click", () => runImport(true));
    $("#importClearBtn")?.addEventListener("click", () => {
        const ta = $("#importIn");
        const msg = $("#importMsg");
        if (ta)
            ta.value = "";
        if (msg)
            msg.textContent = "合并:只追加缺失的项;覆盖:用导入数据替换现有全部配置";
    });
    $("#importFileBtn")?.addEventListener("click", () => $("#importFile")?.click());
    $("#importFile")?.addEventListener("change", async (e) => {
        const f = e.target.files?.[0];
        if (!f)
            return;
        try {
            const text = await f.text();
            const ta = $("#importIn");
            const msg = $("#importMsg");
            if (ta)
                ta.value = text;
            if (msg)
                msg.innerHTML = `<span class="ok">已读取文件 ${escHtml(f.name)},点击「合并导入」或「覆盖导入」继续</span>`;
        }
        catch (err) {
            const msg = $("#importMsg");
            if (msg)
                msg.innerHTML = `<span class="err">读取文件失败: ${escHtml(err instanceof Error ? err.message : String(err))}</span>`;
        }
        finally {
            e.target.value = "";
        }
    });
}
