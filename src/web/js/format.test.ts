/**
 * format.ts 纯函数测试
 */

import { describe, it, expect } from "vitest";
import { formatDuration, formatIntervalMs, formatCountdown, formatDateTime } from "./format.js";

describe("formatDuration", () => {
  it("≤0 返回 可喂食", () => {
    expect(formatDuration(0)).toBe("可喂食");
    expect(formatDuration(-5000)).toBe("可喂食");
  });

  it("秒级", () => {
    expect(formatDuration(3000)).toBe("3s");
    expect(formatDuration(65000)).toBe("1m 5s");
  });

  it("分钟级", () => {
    expect(formatDuration(60000)).toBe("1m 0s");
    expect(formatDuration(125000)).toBe("2m 5s");
  });

  it("小时级", () => {
    expect(formatDuration(3600000)).toBe("1h 0m");
    expect(formatDuration(3660000)).toBe("1h 1m");
  });

  it("向上取整 (ceil)", () => {
    // 100ms → 1s
    expect(formatDuration(100)).toBe("1s");
    // 59.1s → 1m 0s
    expect(formatDuration(59100)).toBe("1m 0s");
  });
});

describe("formatIntervalMs", () => {
  it("分钟", () => {
    expect(formatIntervalMs(60000)).toBe("1 分钟");
    expect(formatIntervalMs(600000)).toBe("10 分钟");
  });

  it("小时", () => {
    expect(formatIntervalMs(3600000)).toBe("1 小时");
    expect(formatIntervalMs(5400000)).toBe("1 小时 30 分钟");
  });

  it("四舍五入", () => {
    expect(formatIntervalMs(90000)).toBe("2 分钟");
  });
});

describe("formatCountdown", () => {
  const now = 1_000_000_000;

  it("已结束", () => {
    expect(formatCountdown(now - 1000, now)).toEqual({ text: "已结束", cls: "urgent" });
    expect(formatCountdown(now, now)).toEqual({ text: "已结束", cls: "urgent" });
  });

  it("秒级 + urgent (10分钟内)", () => {
    const r = formatCountdown(now + 30_000, now);
    expect(r.text).toBe("30s");
    expect(r.cls).toBe("urgent");
  });

  it("分钟级 + soon (1小时内)", () => {
    const r = formatCountdown(now + 30 * 60_000, now);
    expect(r.text).toBe("30m 0s");
    expect(r.cls).toBe("soon");
  });

  it("小时级 + 无紧迫", () => {
    const r = formatCountdown(now + 3 * 3600_000, now);
    expect(r.text).toBe("3h 0m");
    expect(r.cls).toBe("");
  });

  it("10分钟边界: 599s urgent, 600s soon", () => {
    expect(formatCountdown(now + 599_000, now).cls).toBe("urgent");
    expect(formatCountdown(now + 600_000, now).cls).toBe("soon");
  });
});

describe("formatDateTime", () => {
  it("0 返回 —", () => {
    expect(formatDateTime(0)).toBe("—");
  });

  it("正常时间戳格式化", () => {
    // 2024-01-15 12:30 本地时间
    const ts = new Date(2024, 0, 15, 12, 30).getTime();
    const out = formatDateTime(ts);
    expect(out).toContain("01/15");
    expect(out).toContain("12:30");
  });
});
