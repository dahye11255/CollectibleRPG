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

module.exports = { getLevels, getEffects, applyLuck, applyDiscount, applyBonus };
