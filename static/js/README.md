# 代码模块化说明

### 模块划分

```
static/
├── app.js                 # 主入口文件 (导入所有模块，包含 UI 渲染和事件处理)
└── js/
    ├── constants.js       # 常量定义 (存储键、标签、映射表等)
    ├── storage.js         # localStorage 操作
    ├── state.js           # 全局状态管理
    ├── utils.js           # 工具函数和 DOM 辅助函数
    ├── data.js            # 数据加载和处理
    └── filters.js         # 筛选和搜索逻辑
```

## 📦 各模块功能

### constants.js
- 存储键常量 (STORAGE_KEY, LANG_KEY 等)
- 数据 URL 映射 (DATA_URL_BY_LANG)
- 标签映射 (METHOD_LABELS, HUNT_SITES, FEED_LABELS 等)
- 颜色和图鉴相关常量

### storage.js
- localStorage 读写操作
- 收藏数据持久化 (loadCollection, saveCollection)
- 活动猪拥有状态 (loadOwnedEventPigs, saveOwnedEventPigs)
- 徽章数据 (loadBadgeSet, saveBadgeSet)
- 语言设置 (currentLang, saveLang)

### state.js
- 全局状态对象 (state)
- 包含所有运行时数据：
  - pigsById: 186 主图鉴数据
  - eventPigsById: 活动猪数据
  - collection: 用户收藏
  - 筛选器状态等

### utils.js
- DOM 辅助函数 ($, $$, el, text)
- UI 工具 (toast, escHtml, imgUrl)
- 显示格式化 (stars, fmtKg, badgeWeights)
- 业务逻辑辅助 (pigPicky, pigIsOwned, isEventPigId)
- 特殊 UI (showUnlockCelebration)

### data.js
- 数据加载 (loadData)
- 数据处理 (enrichPig, deriveAcquisitions)
- 配种索引 (buildBreedingIndex)
- 隐藏图鉴解锁 (checkAndUnlockHidden)
- 拥有状态操作 (setPigOwned, setPigBadge)

### filters.js
- 猪列表筛选 (filterPigs, filterEventPigs)
- 排序 (sortPigs)
- 获取当前筛选结果 (currentAtlasPigs, currentEventPigs, currentMinePigs)

### app.js
- 主入口文件
- 导入所有模块
- UI 渲染函数 (buildCard, renderAtlasBody, renderEventsBody 等)
- 抽屉详情 (showDetail, closeDrawer)
- 拍卖场功能 (renderAuctionTab)
- 导入导出 (buildExportPayload, runImport, runExport)
- 事件处理和初始化

## 🔄 模块依赖关系

```
app.js
  ├── constants.js (无依赖)
  ├── storage.js → constants.js
  ├── state.js → storage.js, constants.js
  ├── utils.js → constants.js, state.js
  ├── data.js → constants.js, state.js, storage.js, utils.js
  └── filters.js → state.js, utils.js, data.js
```