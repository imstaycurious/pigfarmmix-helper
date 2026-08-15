/**
 * parseImportText / applyImport 测试
 *
 * parseImportText 依赖全局 state (pigsById / pigsByListKey),
 * 这里在测试中注入假数据。
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { Pig } from "./types/index.js";
import { parseImportText, applyImport } from "./import-export-core.js";

// localStorage mock (node 环境不可用)
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { Object.keys(store).forEach(k => delete store[k]); },
};
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock });
import { state } from "./state.js";

// 构造测试用猪数据
function makePig(pNo: number, book: number, index: number): Pig {
  return {
    pNo,
    name: `猪${pNo}`,
    rare: 1,
    color: 1,
    atlas: { type: book, index, visible: true },
    book,
    page: Math.ceil(index / 6),
    slot: ((index - 1) % 6) + 1,
  };
}

beforeEach(() => {
  state.dataLoaded = true;
  state.pigsById.clear();
  state.eventPigsById.clear();
  state.pigsByListKey.clear();
  state.collection = [];
  state.ownedSet = new Set();
  state.ownedEventPigs = new Set();
  state.smallBadges = new Set();
  state.bigBadges = new Set();
  state.raisingPigs = [];

  // 3 只主图鉴猪: 1/1/1, 2/1/1, 3/1/1
  for (let b = 1; b <= 3; b++) {
    const p = makePig(b, b, 1);
    state.pigsById.set(p.pNo, p);
    state.pigsByListKey.set(`${b}-1`, p.pNo);
  }
  // 1 只活动猪 (pNo 100)
  state.eventPigsById.set(100, { ...makePig(100, 7, 1), book: 7 });
});

describe("parseImportText", () => {
  it("空输入返回错误", () => {
    const r = parseImportText("");
    expect(r.err).toBe("输入为空");
  });

  it("v4 JSON: 直读 owned186Pigs", () => {
    const raw = JSON.stringify({
      type: "pigfarm-helper-backup",
      version: 4,
      owned186Pigs: [1, 2],
      ownedEventPigs: [100],
      smallBadges: [1],
      bigBadges: [2],
      raisingPigs: [],
    });
    const r = parseImportText(raw);
    expect(r.err).toBeUndefined();
    expect(r.collection).toEqual([1, 2]);
    expect(r.ownedEventPigs).toEqual([100]);
    expect(r.smallBadges).toEqual([1]);
    expect(r.bigBadges).toEqual([2]);
    expect(r.formatVersion).toBe(4);
    expect(r.source).toBe("json");
  });

  it("v2 JSON: 兼容 owned186Triplets", () => {
    const raw = JSON.stringify({
      type: "pigfarm-helper-backup",
      version: 2,
      owned186Triplets: ["1/1/1", "2 1 1"],
    });
    const r = parseImportText(raw);
    expect(r.collection).toEqual([1, 2]);
    expect(r.formatVersion).toBe(2);
  });

  it("v1 JSON: collection 是未拥有列表, 自动反转", () => {
    // v1: collection = 未拥有 → owned = 全部 - collection
    const raw = JSON.stringify({
      type: "pigfarm-helper-backup",
      version: 1,
      collection: [3], // 只有 3 未拥有 → 1,2 已拥有
    });
    const r = parseImportText(raw);
    expect(r.collection).toEqual([1, 2]);
    expect(r.formatVersion).toBe(1);
  });

  it("非法 type 被拒绝", () => {
    const raw = JSON.stringify({ type: "other-app", version: 4 });
    const r = parseImportText(raw);
    expect(r.err).toContain("不是本工具的备份文件");
  });

  it("坏 JSON 报错", () => {
    const r = parseImportText("{ not valid json");
    expect(r.err).toContain("JSON 解析失败");
  });

  it("三元组裸文本", () => {
    const r = parseImportText("1/1/1\n2 1 1\n3,1,1");
    expect(r.collection).toEqual([1, 2, 3]);
    expect(r.source).toBe("triplets");
    expect(r.formatVersion).toBe(2);
  });

  it("三元组裸文本: 无效行跳过并计数", () => {
    const r = parseImportText("1/1/1\n9/9/9\nabc");
    expect(r.collection).toEqual([1]);
    expect(r.skipped).toBeGreaterThan(0);
  });

  it("未知 pNo 被过滤", () => {
    const raw = JSON.stringify({
      type: "pigfarm-helper-backup",
      version: 4,
      owned186Pigs: [1, 999],
    });
    const r = parseImportText(raw);
    expect(r.collection).toEqual([1]);
  });

  it("raisingPigs 解析 + status 归一化", () => {
    const raw = JSON.stringify({
      type: "pigfarm-helper-backup",
      version: 4,
      owned186Pigs: [],
      raisingPigs: [
        { id: "a", pNo: 1, startedAt: 1000, lastFedAt: 2000, status: "active" },
        { id: "b", pNo: 2, startedAt: 1000, lastFedAt: 2000, status: "waiting" },
      ],
    });
    const r = parseImportText(raw);
    expect(r.raisingPigs).toHaveLength(2);
    expect(r.raisingPigs![0].status).toBe("active");
    expect(r.raisingPigs![1].status).toBe("waiting");
    expect(r.raisingPigs![1].pausedAt).toBe(0);
  });
});

describe("applyImport", () => {
  it("合并导入只追加缺失", () => {
    state.collection = [1];
    state.ownedSet = new Set([1]);

    const parsed = parseImportText(JSON.stringify({
      type: "pigfarm-helper-backup",
      version: 4,
      owned186Pigs: [1, 2],
      ownedEventPigs: [100],
    }));

    const r = applyImport(parsed, { replace: false });
    expect(r.addedColl).toBe(1); // 只有 2 是新增
    expect(state.collection).toEqual([1, 2]);
    expect(state.ownedEventPigs.has(100)).toBe(true);
  });

  it("覆盖导入整体替换", () => {
    state.collection = [1, 2, 3];
    state.ownedSet = new Set([1, 2, 3]);

    const parsed = parseImportText(JSON.stringify({
      type: "pigfarm-helper-backup",
      version: 4,
      owned186Pigs: [2],
      ownedEventPigs: [],
    }));

    const r = applyImport(parsed, { replace: true });
    expect(r.removedColl).toBe(2); // 移除了 1,3
    expect(state.collection).toEqual([2]);
  });
});
