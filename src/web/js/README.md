# 代码结构说明 (TypeScript 重构版)

## 架构总览

```
src/
├── web/                          # 前端源码 (TypeScript)
│   ├── app.ts                    # 主入口: 装配模块 + 筛选/tab/主题/PWA/bootstrap
│   ├── js/
│   │   ├── types.ts              # 领域类型定义 (Pig/Breeding/State/Sync 等)
│   │   ├── constants.ts          # 常量 (存储键/标签/映射)
│   │   ├── storage.ts            # localStorage 操作
│   │   ├── state.ts              # 全局状态
│   │   ├── utils.ts              # DOM/格式化工具
│   │   ├── data.ts               # 数据加载 (API→IndexedDB→JSON) + 拥有/徽章操作
│   │   ├── filters.ts            # 筛选搜索
│   │   ├── modal.ts              # 通用模态框
│   │   ├── auth.ts / sync.ts / account-ui.ts   # 账号与云同步
│   │   ├── version.ts            # 版本更新检查
│   │   └── runtime.ts            # 跨模块回调注册表 (避免循环依赖)
│   └── render/
│       ├── cards.ts              # 猪卡片构建
│       ├── atlas.ts              # 图鉴列表渲染 (atlas/events/mine/进度)
│       ├── drawer.ts             # 抽屉详情 (含配种/获得方式/徽章)
│       ├── raising.ts            # 养成中 (倒计时/提醒/推送)
│       ├── auction.ts            # 拍卖场
│       └── import-export.ts      # 按名添加/三元组/批量/导入导出
└── sw/
    └── sw.ts                     # Service Worker

functions/
├── api/atlas/pigs.ts             # 图鉴数据 API (从 D1 读取 pigs + breeding)
├── api/... (其余 Cloudflare Functions, 沿用原 JS)
└── db/
    ├── schema.sql                # D1 表结构 (pigs + breeding + 用户同步)
    └── seed.sql                  # 由 seed-d1.mjs 生成的图鉴数据

scripts/
└── seed-d1.mjs                   # JSON → D1 SQL 迁移脚本

dist/                             # 完整可部署目录 (npm run build 生成)
  ├── app.js / js/ / render/       #   ← tsc 从 src/web 编译
  ├── sw.js                        #   ← tsc 从 src/sw 编译
  └── css/ img/ data/ index.html  #   ← 从 static/ 复制

static/                           # 手写静态资源 (HTML/CSS/图片/数据 JSON)
```

## 构建

```bash
npm install          # 安装 typescript
npm run build        # 生成完整 dist/ (复制静态资源 + tsc 编译)
npm run typecheck    # 只做类型检查
npm run dev          # 构建后本地预览 (wrangler pages dev dist)
npm run deploy       # 部署 dist/ 到 Cloudflare Pages
```

## 数据层: JSON → D1

1. `functions/db/schema.sql` — 建表 (pigs + breeding 两张核心表 + 用户同步表)
2. `node scripts/seed-d1.mjs` — 把 `static/data/pigs_full_zhs.json` 转成 `functions/db/seed.sql`
3. 导入 D1:
   ```bash
   npx wrangler d1 execute <DB_NAME> --file=functions/db/seed.sql --remote
   ```
4. 前端 `data.ts` 的 `loadData()` 按 **API → IndexedDB → JSON 兜底** 顺序加载:
   - 在线时从 `/api/atlas/pigs` (D1) 拉取并写入 IndexedDB 缓存
   - 离线时从 IndexedDB 读取
   - 两者都没有时回退到静态 JSON 文件

## 模块依赖关系

```
app.ts (装配)
  ├── render/cards.ts      → state, utils, data, runtime
  ├── render/atlas.ts      → state, filters, cards
  ├── render/drawer.ts     → state, data, runtime
  ├── render/raising.ts    → state, utils, runtime
  ├── render/auction.ts    → state, auth
  └── render/import-export.ts → state, data, runtime

js/data.ts (数据核心)
  ├── constants.ts / state.ts / storage.ts / utils.ts
  └── (加载: API → IndexedDB → JSON)
```

## 与原版 (JS) 的差异

- 全部前端逻辑改为 TypeScript, `src/` 下编写, `tsc` 编译到 `dist/`
- 3596 行 `app.js` 拆分为 6 个渲染模块 + 主入口
- 简繁切换已移除 (仅保留简体中文, 数据源统一 `pigs_full_zhs.json`)
- 图鉴数据由静态 JSON 改为 D1 数据库 + IndexedDB 缓存, 离线仍可用
