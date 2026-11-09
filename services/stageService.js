// Stage 관련 DB 로직. 라우터(routes/stages.js)는 요청 검사와 응답만 맡고, 실제 처리는 여기서 한다.
const db = require("../db");
const AppError = require("../utils/AppError");
const { findEquippedItem } = require("./inventoryService");

// 존재하는 스테이지인지 확인하고 행을 돌려준다. 없으면 404.
async function findStageOrThrow(stageId, conn = db) {
  const [rows] = await conn.query("SELECT * FROM stages WHERE id = ?", [stageId]);
  if (rows.length === 0) {
    throw new AppError(404, "존재하지 않는 스테이지입니다.");
  }
  return rows[0];
}

async function isUnlocked(userId, stageId, conn = db) {
  const [rows] = await conn.query(
    "SELECT 1 FROM stage_unlocks WHERE user_id = ? AND stage_id = ?",
    [userId, stageId]
  );
  return rows.length > 0;
}

// 해금에 필요한 장비 = 직전 스테이지의 Supreme. Stage 1은 null
async function findRequiredItem(stageId, conn = db) {
  if (stageId <= 1) return null;
  const [rows] = await conn.query(
    "SELECT id, name FROM items WHERE stage_id = ? AND grade = 'SUPREME'",
    [stageId - 1]
  );
  return rows[0] ? { itemId: rows[0].id, name: rows[0].name } : null;
}

// 1. 스테이지 목록 + 내 해금 여부
async function listStages(userId) {
  const [rows] = await db.query(
    `SELECT s.id, s.name, s.required_power, s.base_duration_sec,
            (su.user_id IS NOT NULL) AS unlocked
       FROM stages s
       LEFT JOIN stage_unlocks su ON su.stage_id = s.id AND su.user_id = ?
      ORDER BY s.id`,
    [userId]
  );
  return rows.map((r) => ({
    stageId: r.id,
    name: r.name,
    requiredPower: r.required_power,
    baseDurationSec: r.base_duration_sec,
    unlocked: Boolean(r.unlocked),
  }));
}

// 2. 스테이지 상세 + 드롭 가능 아이템 5종
async function getStage(userId, stageId) {
  const stage = await findStageOrThrow(stageId);
  const [items] = await db.query(
    "SELECT id, name, grade FROM items WHERE stage_id = ? ORDER BY grade",
    [stageId]
  );
  return {
    stageId: stage.id,
    name: stage.name,
    description: stage.description,
    requiredPower: stage.required_power,
    baseDurationSec: stage.base_duration_sec,
    items: items.map((i) => ({ itemId: i.id, name: i.name, grade: i.grade })),
    unlocked: await isUnlocked(userId, stageId),
  };
}

// 3. 진입(해금) 조건과 현재 충족 여부
async function getRequirements(userId, stageId) {
  const stage = await findStageOrThrow(stageId);
  const requiredItem = await findRequiredItem(stageId);
  const equipped = (await findEquippedItem(userId)) || { itemId: null, power: 0 };
  const unlocked = await isUnlocked(userId, stageId);

  const equippedOk = requiredItem ? equipped.itemId === requiredItem.itemId : true;
  return {
    requiredItem,
    requiredPower: stage.required_power,
    equippedOk,
    powerOk: equipped.power >= stage.required_power,
    canUnlock: !unlocked && equippedOk,
    unlocked,
  };
}

// 4. 드롭 테이블
async function getDrops(stageId) {
  await findStageOrThrow(stageId);
  const [rows] = await db.query(
    "SELECT id, grade, drop_rate FROM items WHERE stage_id = ? ORDER BY grade",
    [stageId]
  );
  return rows.map((r) => ({ itemId: r.id, grade: r.grade, rate: Number(r.drop_rate) }));
}

// 5. 스테이지 해금 (핵심 API): 직전 스테이지 Supreme 장착 시 영구 해금
async function unlockStage(userId, stageId) {
  await findStageOrThrow(stageId);

  if (await isUnlocked(userId, stageId)) {
    throw new AppError(409, "이미 해금한 스테이지입니다.");
  }

  const requiredItem = await findRequiredItem(stageId);
  const equipped = (await findEquippedItem(userId)) || { itemId: null, power: 0 };
  if (!requiredItem || equipped.itemId !== requiredItem.itemId) {
    const need = requiredItem ? requiredItem.name : "직전 스테이지 Supreme";
    throw new AppError(403, `${need} 장비를 장착해야 해금할 수 있습니다.`);
  }

  try {
    await db.query("INSERT INTO stage_unlocks (user_id, stage_id) VALUES (?, ?)", [userId, stageId]);
  } catch (err) {
    // 같은 요청이 동시에 두 번 들어온 경우 PK 중복
    if (err.code === "ER_DUP_ENTRY") throw new AppError(409, "이미 해금한 스테이지입니다.");
    throw err;
  }

  const [rows] = await db.query(
    "SELECT unlocked_at FROM stage_unlocks WHERE user_id = ? AND stage_id = ?",
    [userId, stageId]
  );
  return { stageId, unlockedAt: rows[0].unlocked_at };
}

// 6. 최초 탐사 보상 수령: 해당 스테이지 탐사를 1번 이상 완료했으면 1회 지급
async function claimFirstClearReward(userId, stageId) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const stage = await findStageOrThrow(stageId, conn);

    // 회차 보상을 1번이라도 받았으면 탐사를 완료한 것 (연속 탐사의 일부 회차 포함)
    const [cleared] = await conn.query(
      `SELECT 1 FROM battle_rewards br
         JOIN battles b ON b.id = br.battle_id
        WHERE b.user_id = ? AND b.stage_id = ? LIMIT 1`,
      [userId, stageId]
    );
    if (cleared.length === 0) {
      throw new AppError(400, "이 스테이지의 탐사를 완료한 적이 없습니다.");
    }

    // PK(user_id, stage_id)가 중복 수령을 막는다
    await conn.query("INSERT INTO first_clear_rewards (user_id, stage_id) VALUES (?, ?)", [userId, stageId]);
    await conn.query("UPDATE users SET gold = gold + ? WHERE id = ?", [stage.first_clear_gold, userId]);
    const [[user]] = await conn.query("SELECT gold FROM users WHERE id = ?", [userId]);

    await conn.commit();
    return { stageId, earnedGold: stage.first_clear_gold, gold: user.gold };
  } catch (err) {
    await conn.rollback();
    if (err.code === "ER_DUP_ENTRY") throw new AppError(409, "이미 최초 탐사 보상을 받았습니다.");
    throw err;
  } finally {
    conn.release();
  }
}

// 7. [관리자] 스테이지 수정: 전달된 값만 바꾼다
async function updateStage(stageId, changes) {
  await findStageOrThrow(stageId);

  const columns = { name: "name", requiredPower: "required_power", baseDurationSec: "base_duration_sec" };
  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(columns)) {
    if (changes[key] !== undefined) {
      sets.push(`${column} = ?`);
      values.push(changes[key]);
    }
  }

  await db.query(`UPDATE stages SET ${sets.join(", ")} WHERE id = ?`, [...values, stageId]);
  return { stageId };
}

module.exports = {
  listStages,
  getStage,
  getRequirements,
  getDrops,
  unlockStage,
  claimFirstClearReward,
  updateStage,
};
