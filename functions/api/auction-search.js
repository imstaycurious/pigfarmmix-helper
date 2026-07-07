/**
 * Cloudflare Pages Function：拍卖场接口代理
 *
 * 浏览器直接调上游 http://pig2cnt.j-o-e.jp/auctionSearch_new.php 不通：
 *   - 站点跑在 HTTPS（CF Pages），明文 HTTP 触发 mixed-content
 *   - 上游不发 Access-Control-Allow-Origin，CORS 直接挡
 * Worker 跑在 CF 边缘，**不受**浏览器这两条限制，可以放心 fetch 上游。
 *
 * 部署：把这个文件放在仓库根的 functions/api/auction-search.js
 * 路由：POST /api/auction-search?<query params>
 *
 * 跟 server.py 等价，便于本地用 python server.py 调试 / 生产用本 Function。
 */

// 上游有两套：台服 (pig2cnt) 默认；日服 (pig2) 由 ?server=jp 切换
const AUCTION_ENDPOINTS = {
  tw: "http://pig2cnt.j-o-e.jp/auctionSearch_new.php",
  jp: "http://pig2.j-o-e.jp/auctionSearch_new.php",
};
const DEFAULT_SERVER = "tw";
const DEFAULT_USER_AGENT =
  "Dalvik/2.1.0 (Linux; U; Android 12; sdk_gphone64_arm64 Build/SE1A.220203.002.A1)";

// 完整 bType 白名单：1-1199 覆盖普通 / 事件 / 配种衍生 / 双特殊 全部段
const ALL_BTYPES = Array.from({ length: 1199 }, (_, i) => i + 1);

// 响应中每条记录的 15 个逗号分隔字段
const RECORD_FIELDS = [
  "pigNo", "nowPrice", "weight", "limitdate", "owner",
  "rare", "isExer", "foodtype", "pNo", "pigletOrSex",
  "ownername", "bidownername", "bidowner", "bidcount", "bType",
];


/** e/f 字段必须带尾随逗号才被上游识别为筛选（实测）。空 = 不限。 */
function csvFilter(v) {
  return v ? `${v},` : "";
}


function buildAuctionBody({ count, rare, isExer, foodtype, sex, sort, color }) {
  const fields = [
    ["p", color || "0"],
    ["r", rare || "0"],
    ["e", csvFilter(isExer)],
    ["f", csvFilter(foodtype)],
    ["w", "99"],
    ["d", sort || "1"],
    ["s", sex || "99"],
    ["ownerNo", "1123455"],
    ["cnt", String(count)],
    ["list", ALL_BTYPES.join(",")],
    ["cash", String(Math.floor(Math.random() * 100))],
  ];
  // URLSearchParams 会把逗号 encode 成 %2C，但 list 和 e/f 都需要原始逗号 →
  // 用 encodeURIComponent 然后手动 unescape 逗号回去
  return fields
    .map(([k, v]) => `${k}=${encodeURIComponent(v).replace(/%2C/g, ",")}`)
    .join("&");
}


function parseResponse(body) {
  const cleaned = body.replace(/^﻿/, "").trim();
  if (!cleaned || cleaned === "-1") return [];
  const parts = cleaned.split("&");
  const records = [];
  for (const raw of parts.slice(1)) {
    const cols = raw.split(",");
    if (cols.length !== RECORD_FIELDS.length) continue;
    const pigNo = parseInt(cols[0], 10);
    if (Number.isNaN(pigNo)) continue;
    records.push({
      pigNo,
      nowPrice: parseInt(cols[1], 10),
      weight: parseFloat(cols[2]),
      limitdate: cols[3],
      owner: parseInt(cols[4], 10),
      rare: parseInt(cols[5], 10),
      isExer: parseInt(cols[6], 10),
      foodtype: parseInt(cols[7], 10),
      pNo: parseInt(cols[8], 10),
      pigletOrSex: parseInt(cols[9], 10),
      ownername: cols[10],
      bidownername: cols[11],
      bidowner: cols[12] ? parseInt(cols[12], 10) : null,
      bidcount: parseInt(cols[13], 10),
      bType: parseInt(cols[14], 10),
    });
  }
  return records;
}


function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}


function unauthorizedResponse() {
  return jsonResponse(
    { status: "error", error: "请先登录才能使用拍卖场功能" },
    401,
  );
}


/** 验证用户是否存在 */
async function verifyUser(db, userId) {
  if (!userId || typeof userId !== "string") return false;
  // UUID v4 格式验证
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    return false;
  }
  const user = await db
    .prepare("SELECT id FROM users WHERE id = ? LIMIT 1")
    .bind(userId)
    .first();
  return !!user;
}


/** 记录拍卖场搜索行为（用于统计） */
async function logAuctionSearch(db, userId, searchParams, resultCount) {
  try {
    const searchId = crypto.randomUUID();
    const now = Date.now();
    await db
      .prepare(`
        INSERT INTO auction_searches (
          id, user_id, searched_at, server, rare, is_exer,
          foodtype, sex, color, sort, result_count
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        searchId,
        userId,
        now,
        searchParams.server || DEFAULT_SERVER,
        searchParams.rare || null,
        searchParams.isExer || null,
        searchParams.foodtype || null,
        searchParams.sex || null,
        searchParams.color || null,
        searchParams.sort || "1",
        resultCount,
      )
      .run();
  } catch (err) {
    // 记录失败不影响主功能
    console.error("[auction-search] Failed to log search:", err);
  }
}


/** 上游单次最多 30 条；按色组 fan-out 才能拿全。 */
const COLOR_CODES = ["700", "704", "708", "712", "716", "720"];


async function fetchOnce(opts) {
  const body = buildAuctionBody(opts);
  const endpoint = AUCTION_ENDPOINTS[opts.server] || AUCTION_ENDPOINTS[DEFAULT_SERVER];
  const r = await fetch(endpoint, {
    method: "POST",
    body,
    headers: {
      "User-Agent": DEFAULT_USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "*/*",
    },
  });
  if (!r.ok) throw new Error(`upstream HTTP ${r.status}`);
  return parseResponse(await r.text());
}


async function scrapeAllColors(opts) {
  // 6 个色组并行；任一子请求失败不影响其它色组的结果
  const results = await Promise.allSettled(
    COLOR_CODES.map(code => fetchOnce({ ...opts, color: code })),
  );
  // 用 (pigNo, owner) 当唯一键去重（理论上色组之间无重叠，留个保险）
  const seen = new Map();
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const rec of r.value) {
      seen.set(`${rec.pigNo}-${rec.owner}`, rec);
    }
  }
  const merged = Array.from(seen.values());
  // 按 limitdate 排序，跟 sort 方向对齐（无限滚动要稳定顺序）
  const asc = opts.sort === "0";
  merged.sort((a, b) =>
    asc ? a.limitdate.localeCompare(b.limitdate)
        : b.limitdate.localeCompare(a.limitdate),
  );
  return merged;
}


export async function onRequestPost(context) {
  const db = context.env.DB;

  // 从请求中获取 userId（支持 query 参数或 body）
  const url = new URL(context.request.url);
  let userId = url.searchParams.get("userId");

  // 如果 query 中没有，尝试从 body 中读取
  if (!userId) {
    try {
      const contentType = context.request.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const body = await context.request.json();
        userId = body.userId;
        // 注意：读取 body 后需要重新构造 request（但这里不需要原始 body）
      }
    } catch {
      // JSON 解析失败，忽略
    }
  }

  // 验证用户登录状态
  if (!db || !(await verifyUser(db, userId))) {
    return unauthorizedResponse();
  }

  const sp = url.searchParams;
  const get = (k, def = "") => sp.get(k) ?? def;

  let count = parseInt(get("count", "30"), 10);
  if (Number.isNaN(count)) count = 30;
  count = Math.max(1, Math.min(count, 1000));

  const serverParam = get("server", DEFAULT_SERVER);
  const server = AUCTION_ENDPOINTS[serverParam] ? serverParam : DEFAULT_SERVER;

  const opts = {
    count,
    rare: get("rare"),
    isExer: get("is_exer"),
    foodtype: get("foodtype"),
    sex: get("sex"),
    sort: get("sort", "1"),
    color: get("color"),
    server,
  };

  try {
    let records;
    if (opts.color) {
      // 选了具体色组 → 单次请求就够
      records = await fetchOnce(opts);
    } else {
      // 色组=全部 → 并行扫 6 个色组合并去重
      records = await scrapeAllColors(opts);
    }

    // 记录搜索行为（异步，不阻塞响应）
    context.waitUntil(logAuctionSearch(db, userId, opts, records.length));

    return jsonResponse({
      status: "ok",
      count: records.length,
      records,
      fetched_at: new Date().toISOString(),
      scraped: !opts.color,
    });
  } catch (err) {
    return jsonResponse({
      status: "error",
      error: `${err.name}: ${err.message}`,
    });
  }
}


/** 防止有人误用 GET，给一个明确的提示。 */
export function onRequestGet() {
  return jsonResponse(
    { status: "error", error: "method not allowed; use POST" },
    405,
  );
}


export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
