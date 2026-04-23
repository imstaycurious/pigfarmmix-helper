# 养猪场mix图鉴助手 🐷

一个帮你整理「养猪场 MIX」收藏进度的小 PWA，数据取自 [pigfarmmix.net](https://pigfarmmix.net/)。

- 在手机/电脑浏览器上打开即可使用，支持离线、可装到主屏幕。
- 完全跑在前端：一次性加载 `static/data/pigs.json`（约 640 KB，186 只图鉴的可见猪），收藏列表持久化在 `localStorage`。
- 支持按 **图鉴/页/格** 三元组添加、**按名字** 搜索添加、**批量** 元组添加。
- 支持按 **颜色**、**获得方式** 筛选；选「狩猎」时追加 **场所 + 券种** 子筛选；选「商店进货」时追加 **A/B/C 等级** 子筛选。

📖 **详细图文使用手册**：[docs/USAGE.md](docs/USAGE.md)

## 目录结构

```
static/                — 部署用的纯静态站点（GitHub Pages 指向这里即可）
  index.html
  app.js
  sw.js
  manifest.webmanifest
  icon-*.png
  data/pigs.json       — 冻结的图鉴数据
tools/make_icons.py    — 重新生成 PWA 图标
docs/USAGE.md          — 图文使用手册
```

## 本地预览

因为站点是纯静态的，随便起一个静态服务器就行：

```bash
# Python stdlib
python -m http.server -d static 5055
# 浏览器打开 http://localhost:5055
```

## 部署到 GitHub Pages

推荐用 GitHub Actions 把 `static/` 作为发布目录：

1. 在仓库 `Settings → Pages` 里选择 `GitHub Actions`。
2. 新建 `.github/workflows/pages.yml`：

```yaml
name: Deploy to Pages
on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: static
      - id: deployment
        uses: actions/deploy-pages@v4
```

Service Worker 会登记在 `/sw.js`，GitHub Pages 会自动把 `static/` 映射到域名根路径，所以不需要改代码。

> 如果你的仓库是 `user.github.io/<repo>/` 形式（非用户主页），Service Worker 作用域会变成子路径 —— 现有代码里 `navigator.serviceWorker.register("/sw.js")` 和 `manifest.webmanifest` 的 `start_url` 都使用绝对路径，需要按你的 Pages 子路径适配（例如改成相对路径或加上 base）。最简单的办法是使用自定义域名 / 用户主页仓库。

## 许可 / 署名

图鉴数据来源于 [pigfarmmix.net](https://pigfarmmix.net/)，所有图片版权归原作者所有。本项目仅作学习用途。
