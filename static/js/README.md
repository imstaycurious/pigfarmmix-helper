# 代码模块化说明

## 📁 模块结构

项目已经从单一的 `app.js` (3030行) 重构为多个模块，提高了代码的可维护性和可读性。

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

## 🚀 使用方式

### 开发
代码使用 ES6 模块，浏览器原生支持。只需在 HTML 中引入：

```html
<script type="module" src="/app.js"></script>
```

### 添加新功能
1. 确定功能属于哪个模块
2. 在对应模块中添加函数
3. 导出函数 (export function xxx)
4. 在需要的地方导入使用

### 示例：添加新的工具函数

```javascript
// 在 utils.js 中添加
export function formatDate(timestamp) {
  return new Date(timestamp).toLocaleDateString('zh-CN');
}

// 在 app.js 中使用
import { formatDate } from './js/utils.js';
// 或者在已有的导入中添加
const { ..., formatDate } = U;
```

## 📝 注意事项

1. **模块加载顺序**：浏览器会自动处理模块依赖，无需手动管理加载顺序
2. **作用域**：每个模块有独立的作用域，需要显式导出/导入
3. **兼容性**：ES6 模块需要现代浏览器支持 (Chrome 61+, Firefox 60+, Safari 11+)
4. **开发服务器**：本地开发需要使用 HTTP 服务器，不能直接打开 file:// 协议的文件

## 🔧 后续优化建议

1. **进一步拆分 app.js**：可以将 UI 渲染、抽屉、拍卖场、导入导出等功能拆分为独立模块
2. **添加类型检查**：考虑使用 JSDoc 或 TypeScript 添加类型注解
3. **单元测试**：为各个模块添加单元测试
4. **构建工具**：使用 Vite 或 Rollup 进行打包优化

## 📚 相关文档

- [ES6 模块](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Guide/Modules)
- [JavaScript 模块化](https://javascript.info/modules-intro)
