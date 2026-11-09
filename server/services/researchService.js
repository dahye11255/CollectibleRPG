// 연구소 효과 계산. 연구 수치는 research_types 테이블에 있어 관리자가 코드 수정 없이 조정할 수 있다.
const db = require("../db");
const cfg = require("./gameConfig");

const round2 = (n) => Math.round(n * 100) / 100;

// 사용자별 연구 레벨 (행이 없으면 Lv0)
async function getLevels(userId, conn = db) {
  const [rows] = await conn.query(
    `SELECT t.*, COALESCE(u.level, 0) AS level, COALESCE(u.spent_gold, 0) AS spent_gold
       FROM research_types t
       LEFT JOIN user_researches u ON u.research_id = t.id AND u.user_id = ?
      ORDER BY FIELD(t.id, 'luck', 'alchemy', 'trade', 'chrono', 'auto-explore')`,
    [userId]
  );
  return rows;
}

// 행운 연구 반영 드롭 확률표 (기본 확률은 items.drop_rate, 합계 100 유지)
function applyLuck(baseRates, luckLevel, perLevel) {
  const shift = Math.min(luckLevel * perLevel, baseRates.COMMON);
  const rates = { ...baseRates, COMMON: round2(baseRates.COMMON - shift) };
  for (const [grade, ratio] of Object.entries(cfg.LUCK_DISTRIBUTION)) {
    rates[grade] = round2(baseRates[grade] + shift * ratio);
  }
  return rates;
}

async function getBaseDropRates(conn = db) {
  // 스테이지마다 확률이 같으므로 Stage 1 기준
  const [rows] = await conn.query("SELECT grade, drop_rate FROM items WHERE stage_id = 1");
  return Object.fromEntries(rows.map((r) => [r.grade, Number(r.drop_rate)]));
}

// 현재 적용되는 효과 합계
async function getEffects(userId, conn = db) {
  const levels = await getLevels(userId, conn);
  const byId = Object.fromEntries(levels.map((r) => [r.id, r]));
  const effect = (id) => round2(byId[id].level * Number(byId[id].effect_per_level));

  return {
    dropRates: applyLuck(await getBaseDropRates(conn), byId.luck.level, Number(byId.luck.effect_per_level)),
    synthesisFeeDiscountRate: effect("alchemy"),
    goldBonusRate: effect("trade"),
    instantCostDiscountRate: effect("chrono"),
    maxRepeatCount: 1 + effect("auto-explore"),
  };
}

// 할인 적용 (올림): applyDiscount(640, 25) → 480
function applyDiscount(amount, discountPercent) {
  return Math.ceil((amount * (10000 - Math.round(discountPercent * 100))) / 10000);
}

// 보너스 적용 (내림): applyBonus(15, 10) → 16
function applyBonus(amount, bonusPercent) {
  return Math.floor((amount * (10000 + Math.round(bonusPercent * 100))) / 10000);
}

// ─────────────── Research 라우터 ───────────────
const AppError = require("../utils/AppError");
const { withTransaction, lockUser } = require("../utils/transaction");

const EFFECT_UNITS = { luck: "%p", alchemy: "%", trade: "%", chrono: "%", "auto-explore": "회" };

// 현재 레벨에서 다음 레벨로 올리는 비용 = ceil(기본 비용 × 배수^현재 레벨)
function costAt(type, level) {
  return Math.ceil(round2(type.base_cost * Math.pow(Number(type.cost_multiplier), level)));
}

const effectAt = (type, level) => round2(level * Number(type.effect_per_level));

async function findTypeOrThrow(researchId, conn = db) {
  const [[type]] = await conn.query("SELECT * FROM research_types WHERE id = ?", [researchId]);
  if (!type) throw new AppError(404, "존재하지 않는 연구입니다.");
  return type;
}

async function getUserResearch(conn, userId, researchId) {
  const [[row]] = await conn.query(
    "SELECT level, spent_gold FROM user_researches WHERE user_id = ? AND research_id = ?",
    [userId, researchId]
  );
  return { level: row ? row.level : 0, spentGold: row ? row.spent_gold : 0 };
}

// 1. 연구 목록 + 내 레벨·다음 비용
async function listResearches(userId) {
  const [[user]] = await db.query("SELECT gold FROM users WHERE id = ?", [userId]);
  const rows = await getLevels(userId);
  return {
    gold: user.gold,
    researches: rows.map((r) => ({
      researchId: r.id,
      name: r.name,
      level: r.level,
      maxLevel: r.max_level,
      nextCost: r.level < r.max_level ? costAt(r, r.level) : null,
      currentEffect: effectAt(r, r.level),
      effectUnit: EFFECT_UNITS[r.id],
    })),
  };
}

// 3. 연구 기록 (최신순, 페이지)
async function getHistory(userId, { page, size, offset }) {
  const [rows] = await db.query(
    "SELECT * FROM research_logs WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?",
    [userId, size, offset]
  );
  const [[{ total }]] = await db.query("SELECT COUNT(*) AS total FROM research_logs WHERE user_id = ?", [userId]);
  return {
    logs: rows.map((r) => ({
      logId: r.id,
      researchId: r.research_id,
      action: r.action,
      fromLevel: r.from_level,
      toLevel: r.to_level,
      goldChange: r.gold_change,
      createdAt: r.created_at,
    })),
    page,
    total,
  };
}

// 4. 연구 상세 + 레벨별 비용·누적 효과 표
async function getResearch(userId, researchId) {
  const type = await findTypeOrThrow(researchId);
  const { level } = await getUserResearch(db, userId, researchId);
  const levels = [];
  for (let lv = 1; lv <= type.max_level; lv++) {
    levels.push({ level: lv, cost: costAt(type, lv - 1), effect: effectAt(type, lv) });
  }
  return {
    researchId: type.id,
    name: type.name,
    description: type.description,
    level,
    maxLevel: type.max_level,
    effectUnit: EFFECT_UNITS[type.id],
    levels,
  };
}

// 5. 연구 레벨업 (핵심): 사용자 행을 잠가 같은 요청이 동시에 와도 골드를 한 번만 쓴다
async function upgradeResearch(userId, researchId) {
  return withTransaction(async (conn) => {
    const user = await lockUser(conn, userId);
    const type = await findTypeOrThrow(researchId, conn);
    const { level } = await getUserResearch(conn, userId, researchId);

    if (level >= type.max_level) throw new AppError(409, `이미 최대 레벨(Lv${type.max_level})입니다.`);
    const cost = costAt(type, level);
    if (user.gold < cost) throw new AppError(400, `골드가 부족합니다. (필요: ${cost}, 보유: ${user.gold})`);

    await conn.query("UPDATE users SET gold = gold - ? WHERE id = ?", [cost, userId]);
    await conn.query(
      `INSERT INTO user_researches (user_id, research_id, level, spent_gold) VALUES (?, ?, 1, ?)
       ON DUPLICATE KEY UPDATE level = level + 1, spent_gold = spent_gold + VALUES(spent_gold)`,
      [userId, researchId, cost]
    );
    await conn.query(
      "INSERT INTO research_logs (user_id, research_id, action, from_level, to_level, gold_change) VALUES (?, ?, 'UPGRADE', ?, ?, ?)",
      [userId, researchId, level, level + 1, -cost]
    );

    return {
      researchId,
      fromLevel: level,
      toLevel: level + 1,
      spentGold: cost,
      gold: user.gold - cost,
      currentEffect: effectAt(type, level + 1),
    };
  });
}

// 6. [관리자] 연구 수치 수정 (전달된 값만)
async function updateResearchType(researchId, changes) {
  await findTypeOrThrow(researchId);
  const columns = { baseCost: "base_cost", costMultiplier: "cost_multiplier", effectPerLevel: "effect_per_level" };
  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(columns)) {
    if (changes[key] !== undefined) {
      sets.push(`${column} = ?`);
      values.push(changes[key]);
    }
  }
  await db.query(`UPDATE research_types SET ${sets.join(", ")} WHERE id = ?`, [...values, researchId]);
  return { researchId };
}

// 7. 연구 초기화: Lv0으로 되돌리고 사용한 골드의 50%(내림) 환급
async function resetResearch(userId, researchId) {
  return withTransaction(async (conn) => {
    const user = await lockUser(conn, userId);
    await findTypeOrThrow(researchId, conn);
    const { level, spentGold } = await getUserResearch(conn, userId, researchId);
    if (level === 0) throw new AppError(409, "이미 Lv0인 연구입니다.");

    const refund = Math.floor(spentGold * cfg.RESEARCH_RESET_REFUND_RATE);
    await conn.query("UPDATE users SET gold = gold + ? WHERE id = ?", [refund, userId]);
    await conn.query("DELETE FROM user_researches WHERE user_id = ? AND research_id = ?", [userId, researchId]);
    await conn.query(
      "INSERT INTO research_logs (user_id, research_id, action, from_level, to_level, gold_change) VALUES (?, ?, 'RESET', ?, 0, ?)",
      [userId, researchId, level, refund]
    );
    return { researchId, fromLevel: level, refundedGold: refund, gold: user.gold + refund };
  });
}

module.exports = {
  getLevels,
  getEffects,
  applyLuck,
  applyDiscount,
  applyBonus,
  costAt,
  listResearches,
  getHistory,
  getResearch,
  upgradeResearch,
  updateResearchType,
  resetResearch,
};
