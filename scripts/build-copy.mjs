#!/usr/bin/env node
/**
 * 构建辅助脚本: 把 static/ 下的静态资源同步到 dist/
 *
 * 规则: 整个 static/ 目录递归复制到 dist/。
 * (static/ 只含手写源资源 — HTML/CSS/图片/数据 JSON,
 *  编译产物由 tsc 直接输出到 dist/, 二者不冲突,
 *  因为 build 流程先 clean 再 copy 再编译。)
 *
 * 以后往 static/ 加文件(新图标/新目录)无需改 package.json。
 */

import { cpSync, mkdirSync, existsSync, statSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const src = join(root, "static");
const dest = join(root, "dist");

if (!existsSync(src)) {
  console.error(`[build-copy] 源目录不存在: ${src}`);
  process.exit(1);
}

// dist 由 build 流程的 clean 步骤清空, 这里直接整树复制
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });

// 统计复制结果
function countFiles(dir) {
  let count = 0;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) count += countFiles(p);
    else count++;
  }
  return count;
}

console.log(`✅ 静态资源已复制: static/ → dist/ (${countFiles(dest)} 个文件)`);
