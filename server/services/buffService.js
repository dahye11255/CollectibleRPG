// 탐사 시간 단축률 계산 (도감 + 빙고, 합산 최대 45%)
const db = require("../db");
const cfg = require("./gameConfig");

async function getReductionRates(userId, conn = db) {
  const [[codex]] = await conn.query("SELECT COUNT(*) AS count FROM codex_rewards WHERE user_id = ?", [userId]);
  const [[bingo]] = await conn.query(
    `SELECT COALESCE(SUM(t.reduction_rate), 0) AS rate
       FROM bingo_rewards r JOIN bingo_reward_tiers t ON t.threshold = r.threshold
      WHERE r.user_id = ?`,
    [userId]
  );

  const codexReductionRate = Math.min(codex.count * cfg.CODEX_REDUCTION_PER_STAGE, cfg.MAX_CODEX_REDUCTION);
  const bingoReductionRate = Math.min(Number(bingo.rate), cfg.MAX_BINGO_REDUCTION);
  const totalReductionRate = Math.min(codexReductionRate + bingoReductionRate, cfg.MAX_TOTAL_REDUCTION);
  return { codexReductionRate, bingoReductionRate, totalReductionRate };
}

// ceil(기본 시간 × (1 − 단축률)) — 소수 오차가 없도록 정수(1/10000 단위)로 계산
function calcDurationSec(baseDurationSec, reductionRatePercent) {
  const remainBp = 10000 - Math.round(reductionRatePercent * 100);
  return Math.ceil((baseDurationSec * remainBp) / 10000);
}

module.exports = { getReductionRates, calcDurationSec };
