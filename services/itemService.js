// Item 관련 DB 로직: 아이템 정보, 도감, 합성 (빙고는 bingoService)
const db = require("../db");
const AppError = require("../utils/AppError");
const cfg = require("./gameConfig");
const { withTransaction, lockUser } = require("../utils/transaction");
const { grantItem } = require("./inventoryService");
const { getReductionRates } = require("./buffService");
const { getEffects, applyDiscount } = require("./researchService");

const ITEMS_PER_STAGE = cfg.GRADES.length; // 5
const TOTAL_ITEMS = 25;

async function findStageOrThrow(stageId, conn = db) {
  const [rows] = await conn.query("SELECT id FROM stages WHERE id = ?", [stageId]);
  if (rows.length === 0) throw new AppError(404, "존재하지 않는 스테이지입니다.");
}

// 1. 전체 아이템 목록 (?stageId=&grade=)
async function listItems({ stageId, grade }) {
  const conditions = [];
  const params = [];
  if (stageId !== undefined) {
    conditions.push("stage_id = ?");
    params.push(stageId);
  }
  if (grade !== undefined) {
    conditions.push("grade = ?");
    params.push(grade);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [rows] = await db.query(
    `SELECT id AS itemId, name, stage_id AS stageId, grade, power FROM items ${where} ORDER BY id`,
    params
  );
  return rows;
}

// 2. 아이템 상세
async function getItem(itemId) {
  const [[item]] = await db.query(
    `SELECT id AS itemId, name, stage_id AS stageId, grade, power, drop_rate AS dropRate, sell_price AS sellPrice
       FROM items WHERE id = ?`,
    [itemId]
  );
  if (!item) throw new AppError(404, "존재하지 않는 아이템입니다.");
  return { ...item, dropRate: Number(item.dropRate) };
}

// 3. 도감 수집률 요약
async function getCodexSummary(userId) {
  const [rows] = await db.query(
    `SELECT s.id AS stageId,
            COUNT(c.item_id) AS collectedCount,
            (r.user_id IS NOT NULL) AS rewardClaimed
       FROM stages s
       LEFT JOIN items i ON i.stage_id = s.id
       LEFT JOIN user_codex c ON c.item_id = i.id AND c.user_id = ?
       LEFT JOIN codex_rewards r ON r.stage_id = s.id AND r.user_id = ?
      GROUP BY s.id, r.user_id
      ORDER BY s.id`,
    [userId, userId]
  );
  const collected = rows.reduce((sum, r) => sum + r.collectedCount, 0);
  return {
    totalRate: Math.round((collected / TOTAL_ITEMS) * 100),
    stages: rows.map((r) => ({
      stageId: r.stageId,
      collectedCount: r.collectedCount,
      completed: r.collectedCount === ITEMS_PER_STAGE,
      rewardClaimed: Boolean(r.rewardClaimed),
    })),
  };
}

// 4. 스테이지별 도감 상세 (등급별 획득 여부)
async function getCodexStage(userId, stageId) {
  await findStageOrThrow(stageId);
  const [rows] = await db.query(
    `SELECT i.grade, c.first_acquired_at
       FROM items i LEFT JOIN user_codex c ON c.item_id = i.id AND c.user_id = ?
      WHERE i.stage_id = ? ORDER BY i.grade`,
    [userId, stageId]
  );
  return {
    stageId,
    entries: rows.map((r) => ({
      grade: r.grade,
      acquired: r.first_acquired_at !== null,
      firstAcquiredAt: r.first_acquired_at,
    })),
  };
}

// 5. 도감 보상 수령: 5종 모두 획득 시 골드 + 탐사 시간 5% 단축 (스테이지당 1회)
async function claimCodexReward(userId, stageId) {
  try {
    return await withTransaction(async (conn) => {
      const user = await lockUser(conn, userId);
      await findStageOrThrow(stageId, conn);

      const [[{ count }]] = await conn.query(
        `SELECT COUNT(*) AS count FROM user_codex c JOIN items i ON i.id = c.item_id
          WHERE c.user_id = ? AND i.stage_id = ?`,
        [userId, stageId]
      );
      if (count < ITEMS_PER_STAGE) {
        throw new AppError(400, `도감이 완성되지 않았습니다. (${count}/${ITEMS_PER_STAGE})`);
      }

      // PK(user_id, stage_id)가 중복 수령을 막는다
      await conn.query("INSERT INTO codex_rewards (user_id, stage_id) VALUES (?, ?)", [userId, stageId]);
      const gold = user.gold + cfg.CODEX_REWARD_GOLD;
      await conn.query("UPDATE users SET gold = ? WHERE id = ?", [gold, userId]);

      return { stageId, earnedGold: cfg.CODEX_REWARD_GOLD, ...(await getReductionRates(userId, conn)) };
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") throw new AppError(409, "이미 이 스테이지의 도감 보상을 받았습니다.");
    throw err;
  }
}

// 6. 합성 규칙 (연금술 연구 할인 반영 수수료 포함)
async function getRecipes(userId) {
  const [rows] = await db.query(
    "SELECT * FROM synthesis_recipes ORDER BY FIELD(from_grade, 'COMMON', 'UNCOMMON', 'EPIC', 'ANCIENT')"
  );
  const { synthesisFeeDiscountRate } = await getEffects(userId);
  return rows.map((r) => ({
    fromGrade: r.from_grade,
    toGrade: r.to_grade,
    requiredCount: r.required_count,
    baseFee: r.fee,
    fee: applyDiscount(r.fee, synthesisFeeDiscountRate),
  }));
}

// 7. 합성 (핵심): 같은 스테이지·등급 4개(장착 장비 제외) → 상위 등급 1개, 수수료 차감
async function synthesize(userId, stageId, grade) {
  return withTransaction(async (conn) => {
    const user = await lockUser(conn, userId);
    await findStageOrThrow(stageId, conn);

    const [[recipe]] = await conn.query("SELECT * FROM synthesis_recipes WHERE from_grade = ?", [grade]);
    if (!recipe) throw new AppError(400, "SUPREME 등급은 합성 재료로 쓸 수 없습니다.");

    // 재료: 오래된 것부터, 장착 중인 장비는 자동 제외
    const [materials] = await conn.query(
      `SELECT ui.id FROM user_items ui JOIN items i ON i.id = ui.item_id
        WHERE ui.user_id = ? AND i.stage_id = ? AND i.grade = ? AND ui.id <> COALESCE(?, 0)
        ORDER BY ui.id LIMIT ?`,
      [userId, stageId, grade, user.equipped_user_item_id, recipe.required_count]
    );
    if (materials.length < recipe.required_count) {
      throw new AppError(
        400,
        `재료가 부족합니다. (장착 장비 제외 ${materials.length}/${recipe.required_count}개)`
      );
    }

    const { synthesisFeeDiscountRate } = await getEffects(userId, conn);
    const fee = applyDiscount(recipe.fee, synthesisFeeDiscountRate);
    if (user.gold < fee) throw new AppError(400, `골드가 부족합니다. (필요: ${fee})`);

    const consumedItemIds = materials.map((m) => m.id);
    await conn.query("DELETE FROM user_items WHERE id IN (?)", [consumedItemIds]);
    await conn.query("UPDATE users SET gold = gold - ? WHERE id = ?", [fee, userId]);

    // 결과 아이템 지급 (도감·빙고 자동 등록). 재료를 먼저 지웠으므로 인벤토리 칸은 항상 남는다
    const [[target]] = await conn.query("SELECT id, name, grade FROM items WHERE stage_id = ? AND grade = ?", [
      stageId,
      recipe.to_grade,
    ]);
    const granted = await grantItem(conn, userId, target.id, "SYNTHESIS");

    return {
      newItem: { userItemId: granted.userItemId, name: target.name, grade: target.grade },
      newCodex: granted.newCodex,
      bingoCellIndex: granted.bingoCellIndex,
      consumedItemIds,
      spentFee: fee,
      gold: user.gold - fee,
    };
  });
}

module.exports = {
  listItems,
  getItem,
  getCodexSummary,
  getCodexStage,
  claimCodexReward,
  getRecipes,
  synthesize,
};
