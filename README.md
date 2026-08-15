# 猪猪图鉴 🐷

一个帮助玩家整理猪猪收藏进度的图鉴助手工具。

## ✨ 功能特性

- 📱 **PWA 应用**:支持安装到桌面,可离线使用
- 📖 **完整图鉴**:包含 186 图鉴和 Events 活动猪
- 🔍 **多维筛选**:按颜色、星级、获得方式、放牧、挑食等条件筛选
- ➕ **灵活添加**:支持按名字搜索、图鉴三元组、批量导入
- 📊 **进度总览**:按图鉴、星级、颜色分组查看收藏进度
- 🎯 **配种助手**:查看配种配方和产出结果
- 🏷️ **拍卖场**:查询台服/日服拍卖场信息
- 💾 **数据备份**:支持导出/导入收藏数据 (v4 格式,兼容 v1-v3)

## 🎯 项目特点

- **TypeScript 全栈**:前端 / Service Worker / Cloudflare Functions / Worker 全部使用 TypeScript
- **数据三级加载**:图鉴数据优先从 API (Cloudflare D1) 拉取,离线时回退 IndexedDB 缓存 / 本地 JSON
- **纯前端核心**:收藏数据存储在本地 localStorage,可选账号云同步
- **响应式设计**:适配手机、平板、电脑等各种设备
- **深色模式**:支持浅色/深色主题切换

## 🛠️ 技术栈

| 层 | 技术 |
|---|---|
| 前端 | TypeScript + 原生 DOM (无框架), 事件总线模块解耦 |
| 数据 | Cloudflare D1 (pigs + breeding 两张表) + IndexedDB 缓存 + JSON 兜底 |
| 部署 | Cloudflare Pages (Functions + Static Assets) |
| 推送 | Cloudflare Worker (push-cron) + Web Push |
| 测试 | Vitest (纯函数单元测试) |

## 📁 项目结构

```
src/
├── web/                    # 前端源码 (TypeScript)
│   ├── app.ts              # 主入口 (装配器)
│   ├── js/
│   │   ├── types/          # 领域类型 (pig/breeding/state/auction/auth/import-export)
│   │   ├── events.ts       # 类型安全事件总线
│   │   ├── data.ts         # 数据加载 (API→IndexedDB→JSON) + 状态操作
│   │   ├── state.ts        # 全局状态
│   │   ├── storage.ts      # localStorage 读写
│   │   ├── raising-logic.ts / raising-push.ts  # 养成逻辑 / 推送
│   │   ├── import-export-core.ts  # 导入导出纯逻辑 (可测试)
│   │   ├── format.ts       # 时间格式化
│   │   ├── pwa.ts / error-handler.ts / auth.ts / sync.ts ...
│   └── render/             # 渲染层 (cards/atlas/drawer/raising/auction/import-export/filters-wiring)
├── sw/sw.ts                # Service Worker
functions/                  # Cloudflare Pages Functions (TS)
├── api/                    # atlas/auth/sync/auction/push 接口
└── db/                     # D1 schema.sql + seed.sql (由脚本生成)
workers/push-cron/          # 推送提醒 Worker (TS)
scripts/                    # build-copy.mjs / seed-d1.mjs
static/                     # 手写静态资源 (HTML/CSS/图片/数据)
dist/                       # 构建产物 (npm run build 生成, 已 gitignore)
```

## 🚀 开发

```bash
npm install          # 安装依赖
npm run build        # 构建 dist/ (复制静态资源 + tsc 编译 web + sw)
npm run typecheck    # 全项目类型检查 (web/sw/functions/worker 四套)
npm test             # 运行单元测试 (Vitest)
npm run dev          # 本地预览 (wrangler pages dev dist)
```

## ☁️ 部署

```bash
npm run deploy:db    # 首次: 创建 D1 表 + 导入图鉴数据
npm run deploy       # 部署 dist/ 到 Cloudflare Pages
```

> 图鉴数据 API (`/api/atlas/pigs`) 需要 D1 已导入数据 (schema.sql + seed.sql)。
> 未导入时前端会自动回退到静态 JSON,不影响使用。

## 🔄 数据流

```
图鉴数据 (658 只猪 + 配种表)
  1. /api/atlas/pigs (Cloudflare D1)   ← 在线优先, 最新
  2. IndexedDB 缓存                    ← 离线可用
  3. static/data/*.json                ← 最终兜底

用户数据 (收藏/徽章/养成)
  localStorage ←→ 云端同步 (可选, 账号系统)
```

## 📖 使用说明

详细的图文使用手册请查看:
- [docs/USAGE.md](docs/USAGE.md)
- [小红书图文教程](https://www.xiaohongshu.com/user/profile/69c2b2fd00000000330244a4)

## ✨ 特别感谢

- 感谢游戏官方创造了如此有趣的猪猪世界
- 感谢小红书用户 [@最爱你寂寞](https://www.xiaohongshu.com/user/profile/687257f5000000001d00b658) 提供的最新数据共享文档
- 感谢所有为猪猪图鉴做出贡献的玩家们

## ⚠️ 免责声明

**本项目仅供学习交流使用,不得用于商业用途。**

所有游戏数据、图片等资源版权归原作者所有。本工具为非官方第三方辅助工具,与游戏官方无关。

## 📄 许可协议

本项目采用 MIT 许可协议,允许自由使用、修改和分发,但需保留原作者信息。详见 [LICENSE](LICENSE) 文件。
