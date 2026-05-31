# 数据文件说明

## 文件列表

- `pigs_full.json` - 繁体中文数据
- `pigs_full_zhs.json` - 简体中文数据

## 数据结构 (Schema v3)

### 顶层结构

```json
{
  "version": 3,
  "source": "https://pigfarmmix.net/",
  "generatedAt": "2026-05-31T02:08:45.123Z",
  "count": 646,
  "pigs": [...],
  "breeding": [...]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `version` | number | 数据结构版本号 (当前为 3) |
| `source` | string | 数据来源 |
| `generatedAt` | string | 数据生成时间 (ISO 8601) |
| `count` | number | 猪的总数 |
| `pigs` | array | 猪数据数组 |
| `breeding` | array | 配种关系数组 |

---

## 猪数据结构 (`pigs` 数组)

### 基础信息

```json
{
  "pNo": 1,
  "name": "杂种猪(肉色)",
  "rare": 1,
  "color": 1,
  "description": "虽然自己没能成为特别的猪，但是或许会做出特别的事情。"
}
```

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `pNo` | number | ✅ | 猪的唯一编号 |
| `name` | string | ✅ | 猪的名称 |
| `rare` | number | ✅ | 星级 (1-6) |
| `color` | number | ✅ | 颜色编号 (1=肉色, 2=灰色, 3=米色, 4=粉红, 5=白色, 6=其他) |
| `description` | string | ✅ | 描述文本 |

---

### 图鉴位置 (`atlas`)

```json
{
  "atlas": {
    "type": 1,
    "index": 1,
    "visible": true
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `atlas.type` | number | 图鉴类型 (1-6=主图鉴, 7=活动图鉴) |
| `atlas.index` | number | 图鉴内的序号 (listno) |
| `atlas.visible` | boolean | 是否在图鉴中可见 |

---

### 状态标记 (`status`)

```json
{
  "status": "hidden"
}
```

| 值 | 说明 |
|----|------|
| `"normal"` | 普通猪 (默认，可省略) |
| `"hidden"` | 隐藏猪 (集齐 186 后解锁，如国王猪、皇后猪) |
| `"removed"` | 已移除的猪 (不再显示) |

---

### 特殊标记 (`special`)

```json
{
  "special": true
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `special` | boolean | 是否为特殊猪 (活动猪、六星猪等) |

---

### 体型 (`weight`)

```json
{
  "weight": {
    "small": 3.9,
    "big": 40
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `weight.small` | number | 最小体重 (kg) |
| `weight.big` | number | 最大体重 (kg) |

---

### 租借/售价

```json
{
  "rent": 300,
  "price": 500
}
```

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `rent` | number | ✅ | 租借价格 (pt) |
| `price` | number | ❌ | 售价 (pt)，可选 |

---

### 养成属性

```json
{
  "lifespan": 3,
  "graze": false,
  "feeding": {
    "interval": 2,
    "times": 10,
    "picky": [6]
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `lifespan` | number | 寿命 (天) |
| `graze` | boolean | 是否可以放牧 |
| `feeding` | object | 喂食属性 (可选，不挑食的猪省略) |
| `feeding.interval` | number | 喂食间隔 (小时) |
| `feeding.times` | number | 需要喂食次数 |
| `feeding.picky` | array | 挑食列表 (食物编号数组) |

**食物编号对照表：**
- 1 = 杂粮
- 2 = 素食MIX
- 3 = 红薯
- 4 = 玉米
- 5 = 草本饲料
- 6 = 橡子
- 7 = 高级MIX
- 8 = 松露

---

### 获得方式 (`acquisition`)

```json
{
  "acquisition": {
    "shop": [0.003, 0, 0],
    "hunt": {
      "sites": [1, 2, 5, 12],
      "prob": {
        "any": { "5": 0.0189, "12": 0.0286 },
        "same": { "5": 0.0526, "12": 0.0667 }
      }
    },
    "fail": [609, 543],
    "specialFeeding": true
  }
}
```

#### 商店进货 (`shop`)

| 字段 | 类型 | 说明 |
|------|------|------|
| `acquisition.shop` | array | 三个等级的进货概率 [A级, B级, C级] |

- A级: 1000pt
- B级: 500pt
- C级: 100pt

#### 狩猎 (`hunt`)

| 字段 | 类型 | 说明 |
|------|------|------|
| `acquisition.hunt.sites` | array | 狩猎地点编号数组 |
| `acquisition.hunt.prob` | object | 狩猎概率 |
| `acquisition.hunt.prob.any` | object | 任意幼猪的概率 (地点编号 → 概率) |
| `acquisition.hunt.prob.same` | object | 按幼猪种类的概率 (地点编号 → 概率) |

**狩猎地点编号对照表：**
- 3 = 草原 (普通券)
- 4 = 山林 (普通券)
- 5 = 草原 (稀有券)
- 6 = 山林 (稀有券)
- 7 = 日本 (普通券)
- 8 = 日本 (稀有券)
- 9 = 亚洲 (普通券)
- 10 = 亚洲 (稀有券)
- 11 = 欧洲 (普通券)
- 12 = 欧洲 (稀有券)
- 13 = 美洲和西印度群岛 (普通券)
- 14 = 美洲和西印度群岛 (稀有券)
- 15 = 大洋洲 (普通券)
- 16 = 大洋洲 (稀有券)
- 81-92 = 特别活动狩猎 (一月至十二月)
- 98, 99 = 特别活动狩猎

#### 养成失败 (`fail`)

| 字段 | 类型 | 说明 |
|------|------|------|
| `acquisition.fail` | array | 养成失败来源的猪编号数组 (pNo) |

#### 超分歧/超出世 (`specialFeeding`)

| 字段 | 类型 | 说明 |
|------|------|------|
| `acquisition.specialFeeding` | boolean | 是否有超分歧/超出世系条件 (详情见 description 或 breedingGuide) |

---

### 养成要求和提示

#### 养成要求 (`breedingGuide`)

```json
{
  "breedingGuide": {
    "requirements": "成猪前体重限制 ≥128.0 kg",
    "tips": "建议先喂橡子"
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `breedingGuide` | object | 养成要求和建议 (可选) |
| `breedingGuide.requirements` | string | 强制要求 (必填，如果有 breedingGuide) |
| `breedingGuide.tips` | string\|null | 养成建议 (可选) |

**适用范围：**
- 186 图鉴猪的体重限制、时间限制等
- 活动六星猪的获得方式和养成条件

#### 提示 (`hints`)

```json
{
  "hints": [
    "父母都戴着很华丽的帽子",
    "好像有遗传到父母的鲁莽",
    "好像有遗传到当领导的才能"
  ]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `hints` | array | 配种提示数组 (主要用于活动六星猪) |

---

## 配种关系数据结构 (`breeding` 数组)

```json
{
  "parents": [1, 1],
  "outcomes": [
    { "pNo": 1, "prob": 60 },
    { "pNo": 143, "prob": 20 },
    { "pNo": 164, "prob": 20 }
  ],
  "visible": false,
  "order": 0
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `parents` | array | 父母猪编号 `[pNo1, pNo2]` 或 `[pNo, "*"]` (任意猪) |
| `outcomes` | array | 产出结果数组 |
| `outcomes[].pNo` | number | 产出猪的编号 |
| `outcomes[].prob` | number | 产出概率 (0-100) |
| `visible` | boolean | 是否在图鉴中可见 |
| `order` | number | 系统图序号 (仅 visible=true 时有意义) |

**特殊值：**
- `parents[1] === "*"` 表示任意猪

---

## 数据示例

### 普通猪 (pNo 1 - 杂种猪)

```json
{
  "pNo": 1,
  "name": "杂种猪(肉色)",
  "rare": 1,
  "color": 1,
  "description": "虽然自己没能成为特别的猪，但是或许会做出特别的事情。",
  "atlas": {
    "type": 1,
    "index": 1,
    "visible": true
  },
  "weight": {
    "small": 3.9,
    "big": 40
  },
  "rent": 300,
  "price": 500,
  "lifespan": 3,
  "graze": false,
  "acquisition": {
    "hunt": {
      "sites": [2]
    },
    "fail": [609, 543]
  }
}
```

### 有养成要求的猪 (pNo 7 - 伊比利亚猪)

```json
{
  "pNo": 7,
  "name": "伊比利亚猪/(橡子喂食)",
  "rare": 5,
  "color": 2,
  "description": "最高等级的西班牙猪。只有通过一些严格条件，才能以此自称的猪。",
  "atlas": {
    "type": 2,
    "index": 2,
    "visible": true
  },
  "weight": {
    "small": 55,
    "big": 80
  },
  "rent": 8000,
  "price": 10000,
  "lifespan": 40,
  "graze": true,
  "feeding": {
    "interval": 2,
    "times": 10,
    "picky": [6]
  },
  "acquisition": {
    "shop": [0.003030303030303, 0, 0],
    "hunt": {
      "sites": [1, 2, 5, 12],
      "prob": {
        "any": {
          "5": 0.018867924528302,
          "12": 0.028571428571429
        },
        "same": {
          "5": 0.052631578947368,
          "12": 0.066666666666667
        }
      }
    },
    "specialFeeding": true
  },
  "breedingGuide": {
    "requirements": "成猪前体重限制 ≥128.0 kg",
    "tips": null
  }
}
```

### 活动六星猪 (pNo 403 - 海贼猪胡子)

```json
{
  "pNo": 403,
  "name": "海贼猪胡子",
  "rare": 6,
  "color": 3,
  "description": "威震八方的传说中的海贼。若有猪猪违抗就会毫不客气地将对方变成烤猪。唯一不可逆的是被出货的命运。",
  "atlas": {
    "type": 7,
    "index": 52,
    "visible": true
  },
  "special": true,
  "weight": {
    "small": 8.5,
    "big": 98.2
  },
  "price": 10000,
  "lifespan": 30,
  "graze": true,
  "feeding": {
    "interval": 0,
    "times": 5,
    "picky": []
  },
  "acquisition": {
    "hunt": {
      "sites": [2]
    },
    "specialFeeding": true
  },
  "breedingGuide": {
    "requirements": "获得方式：交易所需提前兑换配方；红票消耗：10",
    "tips": null
  },
  "hints": [
    "父母都戴着很华丽的帽子",
    "好像有遗传到父母的鲁莽",
    "好像有遗传到当领导的才能",
    "待在海上的时间好像比较多",
    "似乎很擅长打斗"
  ]
}
```

### 隐藏猪 (pNo 904 - 国王猪)

```json
{
  "pNo": 904,
  "name": "国王猪",
  "rare": 5,
  "color": 1,
  "description": "...",
  "atlas": {
    "type": 6,
    "index": 31,
    "visible": true
  },
  "status": "hidden",
  "weight": {
    "small": 55,
    "big": 80
  },
  "rent": 8000,
  "lifespan": 40,
  "graze": true,
  "breedingGuide": {
    "requirements": "成猪前体重限制 ≥128.0 kg",
    "tips": null
  }
}
```

### 配种关系示例

```json
{
  "parents": [1, "*"],
  "outcomes": [
    { "pNo": 1, "prob": 60 },
    { "pNo": 143, "prob": 20 },
    { "pNo": 164, "prob": 20 }
  ],
  "visible": false
}
```

**说明：** pNo 1 (杂种猪) 与任意猪配种，有 60% 概率产出 pNo 1，20% 概率产出 pNo 143，20% 概率产出 pNo 164。
