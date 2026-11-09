// Battle(탐사) 로직. 서버 타이머 없이 DB 시각(NOW())만으로 판단한다.
// - 연속 탐사: repeat_total회를 한 번에 예약, k회차 종료 시각 = started_at + k × duration_sec
// - 정산: 종료 시각이 지난 회차를 요청 시점에 몰아서 처리 (완료·즉시 완료·취소가 같은 함수 사용)
const db = require("../db");
const AppError = require("../utils/AppError");
const cfg = require("./gameConfig");
const { withTransaction, lockUser } = require("../utils/transaction");
const { grantItem, getFreeSlots } = require("./inventoryService");
const { getReductionRates, calcDurationSec } = require("./buffService");
const { getEffects, applyBonus, applyDiscount } = require("./researchService");
const { rollGrade } = require("./dropService");

// 내 탐사 1건 + DB 기준 경과 시간. lock이면 FOR UPDATE (정산 중복 방지)
async function findBattleOrThrow(conn, userId, battleId, { lock = false } = {}) {
  const [[battle]] = await conn.query(
    `SELECT *, TIMESTAMPDIFF(SECOND, started_at, NOW()) AS elapsed_sec,
            GREATEST(TIMESTAMPDIFF(SECOND, NOW(), end_time), 0) AS remaining_sec
       FROM battles WHERE id = ? AND user_id = ? ${lock ? "FOR UPDATE" : ""}`,
    [battleId, userId]
  );
  if (!battle) throw new AppError(404, "존재하지 않는 탐사입니다.");
  return battle;
}

// 지금까지 끝난 회차 수 (최대 repeat_total)
const finishedRounds = (b) => Math.min(b.repeat_total, Math.floor(b.elapsed_sec / b.duration_sec));

function assertInProgress(battle) {
  if (battle.status !== "IN_PROGRESS") {
    throw new AppError(409, `이미 ${battle.status === "COMPLETED" ? "완료" : "취소"}된 탐사입니다.`);
  }
}

/**
 * 회차 정산 (트랜잭션 안에서 호출): 회차마다 등급 뽑기 → grantItem(도감·빙고) → 골드(교역 보너스) → 기록
 * 인벤토리가 가득 차면 그 회차부터 멈춘다.
 */
async function settleRounds(conn, userId, battle, count) {
  const effects = await getEffects(userId, conn);
  const [[stage]] = await conn.query("SELECT reward_gold FROM stages WHERE id = ?", [battle.stage_id]);
  const roundGold = applyBonus(stage.reward_gold, effects.goldBonusRate);

  const settled = [];
  let stoppedByInventory = false;
  for (let i = 0; i < count; i++) {
    const roundNo = battle.repeat_done + settled.length + 1;
    const grade = rollGrade(effects.dropRates);
    const [[item]] = await conn.query("SELECT id, name, grade FROM items WHERE stage_id = ? AND grade = ?", [
      battle.stage_id,
      grade,
    ]);

    let granted;
    try {
      granted = await grantItem(conn, userId, item.id, "DROP");
    } catch (err) {
      if (err.status === 409) {
        stoppedByInventory = true;
        break;
      }
      throw err;
    }

    // PK(battle_id, round_no)가 같은 회차의 중복 지급을 한 번 더 막는다
    await conn.query(
      "INSERT INTO battle_rewards (battle_id, round_no, item_id, user_item_id, gold) VALUES (?, ?, ?, ?, ?)",
      [battle.id, roundNo, item.id, granted.userItemId, roundGold]
    );
    settled.push({
      roundNo,
      item: { itemId: item.id, name: item.name, grade: item.grade, userItemId: granted.userItemId },
      gold: roundGold,
      newCodex: granted.newCodex,
      bingoCellIndex: granted.bingoCellIndex,
    });
  }

  const earnedGold = settled.length * roundGold;
  const repeatDone = battle.repeat_done + settled.length;
  if (settled.length > 0) {
    await conn.query("UPDATE users SET gold = gold + ? WHERE id = ?", [earnedGold, userId]);
    await conn.query("UPDATE battles SET repeat_done = ? WHERE id = ?", [repeatDone, battle.id]);
  }
  return { settled, earnedGold, repeatDone, stoppedByInventory };
}

async function finish(conn, battleId, status) {
  await conn.query("UPDATE battles SET status = ?, completed_at = NOW() WHERE id = ?", [status, battleId]);
}

async function currentGold(conn, userId) {
  const [[user]] = await conn.query("SELECT gold FROM users WHERE id = ?", [userId]);
  return user.gold;
}

function toBattleSummary(b) {
  return {
    battleId: b.id,
    stageId: b.stage_id,
    status: b.status,
    repeatTotal: b.repeat_total,
    repeatDone: b.repeat_done,
    durationSec: b.duration_sec,
    appliedReductionRate: Number(b.applied_reduction_rate),
    startedAt: b.started_at,
    endTime: b.end_time,
  };
}

// 1. 탐사 시작
async function startBattle(userId, stageId, repeatCount) {
  try {
    return await withTransaction(async (conn) => {
      const user = await lockUser(conn, userId);

      const [[stage]] = await conn.query("SELECT * FROM stages WHERE id = ?", [stageId]);
      if (!stage) throw new AppError(404, "존재하지 않는 스테이지입니다.");

      const [unlocked] = await conn.query("SELECT 1 FROM stage_unlocks WHERE user_id = ? AND stage_id = ?", [
        userId,
        stageId,
      ]);
      if (unlocked.length === 0) throw new AppError(403, "해금하지 않은 스테이지입니다.");

      if (user.equipped_user_item_id === null) throw new AppError(400, "장비를 1개 이상 장착해야 탐사할 수 있습니다.");
      const [[equipped]] = await conn.query(
        "SELECT i.power FROM user_items ui JOIN items i ON i.id = ui.item_id WHERE ui.id = ?",
        [user.equipped_user_item_id]
      );
      if (equipped.power < stage.required_power) {
        throw new AppError(403, `전투력이 부족합니다. (현재 ${equipped.power}, 필요 ${stage.required_power})`);
      }

      const { maxRepeatCount } = await getEffects(userId, conn);
      if (repeatCount > maxRepeatCount) {
        throw new AppError(400, `연속 탐사는 최대 ${maxRepeatCount}회까지 예약할 수 있습니다. (자동 탐사 연구)`);
      }
      if ((await getFreeSlots(conn, userId)) < 1) throw new AppError(409, "인벤토리가 가득 찼습니다.");

      const [inProgress] = await conn.query(
        "SELECT id FROM battles WHERE user_id = ? AND status = 'IN_PROGRESS'",
        [userId]
      );
      if (inProgress.length > 0) throw new AppError(409, "이미 진행 중인 탐사가 있습니다.");

      // 시작 시점의 단축률을 적용하고 기록 (이후 보상을 받아도 이 탐사의 종료 시각은 그대로)
      const { totalReductionRate } = await getReductionRates(userId, conn);
      const durationSec = calcDurationSec(stage.base_duration_sec, totalReductionRate);
      const [result] = await conn.query(
        `INSERT INTO battles (user_id, stage_id, duration_sec, applied_reduction_rate, repeat_total, started_at, end_time)
         VALUES (?, ?, ?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? SECOND))`,
        [userId, stageId, durationSec, totalReductionRate, repeatCount, durationSec * repeatCount]
      );

      const battle = await findBattleOrThrow(conn, userId, result.insertId);
      const { repeatDone, ...summary } = toBattleSummary(battle);
      return summary;
    });
  } catch (err) {
    // 동시에 두 번 시작한 경우: UNIQUE(user_id, in_progress_flag)
    if (err.code === "ER_DUP_ENTRY") throw new AppError(409, "이미 진행 중인 탐사가 있습니다.");
    throw err;
  }
}

// 2. 진행 중 탐사
async function getCurrent(userId) {
  const [[row]] = await db.query("SELECT id FROM battles WHERE user_id = ? AND status = 'IN_PROGRESS'", [userId]);
  if (!row) return { battle: null };

  const b = await findBattleOrThrow(db, userId, row.id);
  const finished = finishedRounds(b);
  const nextRoundEndTime =
    finished < b.repeat_total ? new Date(b.started_at.getTime() + (finished + 1) * b.duration_sec * 1000) : null;
  return {
    battle: {
      battleId: b.id,
      stageId: b.stage_id,
      repeatTotal: b.repeat_total,
      repeatDone: b.repeat_done,
      settleableRounds: finished - b.repeat_done,
      nextRoundEndTime,
      remainingSec: Number(b.remaining_sec),
      appliedReductionRate: Number(b.applied_reduction_rate),
    },
  };
}

// 3. 탐사 상세 + 회차별 보상
async function getBattle(userId, battleId) {
  const b = await findBattleOrThrow(db, userId, battleId);
  const [rewards] = await db.query(
    `SELECT r.round_no, r.gold, i.id AS itemId, i.name, i.grade
       FROM battle_rewards r JOIN items i ON i.id = r.item_id
      WHERE r.battle_id = ? ORDER BY r.round_no`,
    [battleId]
  );
  return {
    ...toBattleSummary(b),
    rewards: rewards.map((r) => ({
      roundNo: r.round_no,
      item: { itemId: r.itemId, name: r.name, grade: r.grade },
      gold: r.gold,
    })),
  };
}

// 4. 탐사 완료 및 보상 수령 (핵심): 종료 시각이 지난 회차만 정산
async function completeBattle(userId, battleId) {
  return withTransaction(async (conn) => {
    await lockUser(conn, userId);
    const battle = await findBattleOrThrow(conn, userId, battleId, { lock: true });
    assertInProgress(battle);

    const settleable = finishedRounds(battle) - battle.repeat_done;
    if (settleable <= 0) {
      throw new AppError(400, `아직 탐사가 끝나지 않았습니다. (남은 시간 ${Number(battle.remaining_sec)}초)`);
    }

    const result = await settleRounds(conn, userId, battle, settleable);
    if (result.settled.length === 0) {
      throw new AppError(409, "인벤토리가 가득 차서 보상을 받을 수 없습니다. 아이템을 판매하거나 확장하세요.");
    }

    const status = result.repeatDone === battle.repeat_total ? "COMPLETED" : "IN_PROGRESS";
    if (status === "COMPLETED") await finish(conn, battle.id, "COMPLETED");

    return {
      settledRounds: result.settled,
      earnedGold: result.earnedGold,
      gold: await currentGold(conn, userId),
      repeatDone: result.repeatDone,
      repeatTotal: battle.repeat_total,
      status,
      stoppedByInventory: result.stoppedByInventory,
    };
  });
}

// 5. 골드로 즉시 완료: 남은 회차 전부 정산
async function instantComplete(userId, battleId) {
  return withTransaction(async (conn) => {
    const user = await lockUser(conn, userId);
    const battle = await findBattleOrThrow(conn, userId, battleId, { lock: true });
    assertInProgress(battle);

    const remainingRounds = battle.repeat_total - battle.repeat_done;
    const { instantCostDiscountRate } = await getEffects(userId, conn);
    const baseCost = Math.ceil(Number(battle.remaining_sec) / cfg.INSTANT_COMPLETION_SECONDS_PER_GOLD);
    const cost = applyDiscount(baseCost, instantCostDiscountRate);

    // 골드를 빼기 전에 모두 검사
    if ((await getFreeSlots(conn, userId)) < remainingRounds) {
      throw new AppError(409, `남은 ${remainingRounds}회차 보상을 받을 인벤토리 빈칸이 부족합니다.`);
    }
    if (user.gold < cost) throw new AppError(400, `골드가 부족합니다. (필요: ${cost})`);

    await conn.query("UPDATE users SET gold = gold - ? WHERE id = ?", [cost, userId]);
    await conn.query("UPDATE battles SET spent_gold = spent_gold + ? WHERE id = ?", [cost, battle.id]);
    const result = await settleRounds(conn, userId, battle, remainingRounds);
    await finish(conn, battle.id, "COMPLETED");

    return {
      spentGold: cost,
      settledRounds: result.settled,
      earnedGold: result.earnedGold,
      gold: await currentGold(conn, userId),
      status: "COMPLETED",
    };
  });
}

// 6. 탐사 취소: 이미 끝난 회차는 정산하고, 남은 회차는 보상 없이 취소
async function cancelBattle(userId, battleId) {
  return withTransaction(async (conn) => {
    await lockUser(conn, userId);
    const battle = await findBattleOrThrow(conn, userId, battleId, { lock: true });
    assertInProgress(battle);

    const settleable = finishedRounds(battle) - battle.repeat_done;
    if (settleable > 0 && (await getFreeSlots(conn, userId)) < settleable) {
      throw new AppError(409, `끝난 ${settleable}회차 보상을 받을 인벤토리 빈칸이 부족합니다.`);
    }
    const result = settleable > 0 ? await settleRounds(conn, userId, battle, settleable) : { settled: [], repeatDone: battle.repeat_done };
    await finish(conn, battle.id, "CANCELED");

    return {
      battleId: battle.id,
      status: "CANCELED",
      settledRounds: result.settled,
      canceledRounds: battle.repeat_total - result.repeatDone,
    };
  });
}

// 7. 탐사 기록 (최신순, 페이지)
async function listBattles(userId, { page, size, offset, status }) {
  const where = status ? "WHERE user_id = ? AND status = ?" : "WHERE user_id = ?";
  const params = status ? [userId, status] : [userId];
  const [rows] = await db.query(`SELECT * FROM battles ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, [
    ...params,
    size,
    offset,
  ]);
  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM battles ${where}`, params);
  return {
    battles: rows.map((b) => ({
      battleId: b.id,
      stageId: b.stage_id,
      status: b.status,
      repeatTotal: b.repeat_total,
      repeatDone: b.repeat_done,
      startedAt: b.started_at,
    })),
    page,
    total,
  };
}

module.exports = {
  startBattle,
  getCurrent,
  getBattle,
  completeBattle,
  instantComplete,
  cancelBattle,
  listBattles,
};
