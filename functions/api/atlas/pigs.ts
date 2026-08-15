/**
 * Cloudflare Pages Function: 图鉴数据 API
 * GET /api/atlas/pigs — 返回全部猪数据和配种表
 * (调用前需 D1 已通过 schema.sql 建表 + seed 脚本导入数据)
 *
 * 类型: D1 相关类型使用 @cloudflare/workers-types。
 */

export interface Pig {
  pNo: number;
  name: string;
  rare: number;
  color: number;
  description?: string;
  atlas?: { type: number; index: number; visible: boolean };
  weight?: { small: number; big: number };
  rent?: number;
  price?: number;
  lifespan?: number;
  graze?: boolean;
  special?: boolean;
  status?: "normal" | "hidden" | "removed";
  acquisition?: Record<string, unknown>;
  feeding?: Record<string, unknown>;
  breedingGuide?: Record<string, unknown>;
  hints?: string[];
}

export interface BreedingRecord {
  parents: (number | "*")[];
  outcomes: { pNo: number; prob: number }[];
  visible: boolean;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function parseJsonField(value: unknown): unknown {
  if (value == null) return undefined;
  try { return JSON.parse(String(value)); } catch { return undefined; }
}

function rowToPig(row: Record<string, unknown>): Pig {
  const pig: Pig = {
    pNo: Number(row.p_no),
    name: String(row.name),
    rare: Number(row.rare),
    color: Number(row.color),
    description: row.description ? String(row.description) : undefined,
    atlas: {
      type: row.atlas_type ? Number(row.atlas_type) : 0,
      index: row.atlas_index ? Number(row.atlas_index) : 0,
      visible: Boolean(row.atlas_visible),
    },
    weight: (row.weight_small != null && row.weight_big != null)
      ? { small: Number(row.weight_small), big: Number(row.weight_big) }
      : undefined,
    rent: row.rent != null ? Number(row.rent) : undefined,
    price: row.price != null ? Number(row.price) : undefined,
    lifespan: row.lifespan != null ? Number(row.lifespan) : undefined,
    graze: Boolean(row.graze),
    special: Boolean(row.special),
    status: (row.status as string) as Pig["status"] || "normal",
    acquisition: parseJsonField(row.acquisition) as Record<string, unknown> | undefined,
    feeding: parseJsonField(row.feeding) as Record<string, unknown> | undefined,
    breedingGuide: parseJsonField(row.breeding_guide) as Record<string, unknown> | undefined,
    hints: parseJsonField(row.hints) as string[] | undefined,
  };
  return pig;
}

export async function onRequestGet(context: { env: { DB: D1Database } }): Promise<Response> {
  const db = context.env.DB;

  try {
    const [pigsResult, breedingResult] = await Promise.all([
      db.prepare("SELECT * FROM pigs ORDER BY p_no").all(),
      db.prepare("SELECT * FROM breeding ORDER BY id").all(),
    ]);

    const pigs: Pig[] = (pigsResult.results || []).map(rowToPig);

    // 按 parent1,parent2 聚合成配种记录
    const breedingMap = new Map<string, { parents: (number | "*")[]; outcomes: { pNo: number; prob: number }[]; visible: boolean }>();
    for (const row of breedingResult.results || []) {
      const r = row as Record<string, unknown>;
      const p1 = Number(r.parent1);
      const p2 = Number(r.parent2);
      const p2Final: number | "*" = p2 === -1 ? "*" : p2;
      const key = `${p1}-${p2Final}`;
      const outcome = { pNo: Number(r.outcome_p_no), prob: Number(r.outcome_prob) };

      if (!breedingMap.has(key)) {
        breedingMap.set(key, {
          parents: [p1, p2Final],
          outcomes: [],
          visible: Boolean(r.visible),
        });
      }
      breedingMap.get(key)!.outcomes.push(outcome);
    }

    const breeding: BreedingRecord[] = Array.from(breedingMap.values());
    // 合并 outcomes 中相同 pNo 的概率
    for (const rec of breeding) {
      const merged = new Map<number, number>();
      for (const o of rec.outcomes) {
        merged.set(o.pNo, (merged.get(o.pNo) || 0) + o.prob);
      }
      rec.outcomes = Array.from(merged.entries()).map(([pNo, prob]) => ({ pNo, prob }));
    }

    return jsonResponse({
      version: 3,
      count: pigs.length,
      pigs,
      breeding,
    });
  } catch (error) {
    console.error("[atlas] Error:", error);
    return jsonResponse({ ok: false, error: "服务器内部错误" }, 500);
  }
}
