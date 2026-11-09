// Character 관련 DB 로직: 내 상태, 인벤토리, 장비
const db = require("../db");
const AppError = require("../utils/AppError");
const cfg = require("./gameConfig");
const { withTransaction, lockUser } = require("../utils/transaction");
const { countItems, findEquippedItem } = require("./inventoryService");
const { getReductionRates } = require("./buffService");

// 1. 캐릭터 상태
async function getStatus(userId) {
  const [[user]] = await db.query("SELECT nickname, gold FROM users WHERE id = ?", [userId]);
  const equipped = await findEquippedItem(userId);
  return {
    nickname: user.nickname,
    gold: user.gold,
    equippedItem: equipped ? { userItemId: equipped.userItemId, name: equipped.name } : null,
    ...(await getReductionRates(userId)),
  };
}

// 2. 능력치 (전투력 = 장착 장비 전투력)
async function getStats(userId) {
  const equipped = await findEquippedItem(userId);
  const [stages] = await db.query("SELECT stage_id FROM codex_rewards WHERE user_id = ? ORDER BY stage_id", [userId]);
  return {
    power: equipped ? equipped.power : 0,
    ...(await getReductionRates(userId)),
    completedCodexStages: stages.map((s) => s.stage_id),
  };
}

// 3. 인벤토리 (필터는 목록에만 적용, 칸 수·등급별 수량은 전체 기준)
async function getInventory(userId, { stageId, grade }) {
  const [[user]] = await db.query("SELECT inventory_slots, equipped_user_item_id FROM users WHERE id = ?", [userId]);

  const conditions = ["ui.user_id = ?"];
  const params = [userId];
  if (stageId !== undefined) {
    conditions.push("i.stage_id = ?");
    params.push(stageId);
  }
  if (grade !== undefined) {
    conditions.push("i.grade = ?");
    params.push(grade);
  }
  const [items] = await db.query(
    `SELECT ui.id AS userItemId, i.id AS itemId, i.name, i.stage_id AS stageId, i.grade, i.power
       FROM user_items ui JOIN items i ON i.id = ui.item_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY i.stage_id, i.grade, ui.id`,
    params
  );

  const [counts] = await db.query(
    `SELECT i.grade, COUNT(*) AS count
       FROM user_items ui JOIN items i ON i.id = ui.item_id
      WHERE ui.user_id = ? GROUP BY i.grade`,
    [userId]
  );

  return {
    slots: user.inventory_slots,
    usedSlots: await countItems(db, userId),
    items: items.map((item) => ({ ...item, equipped: item.userItemId === user.equipped_user_item_id })),
    countsByGrade: Object.fromEntries(counts.map((c) => [c.grade, c.count])),
  };
}

// 4. 인벤토리 확장
async function expandInventory(userId) {
  return withTransaction(async (conn) => {
    const user = await lockUser(conn, userId);
    if (user.inventory_slots >= cfg.MAX_INVENTORY_SLOTS) {
      throw new AppError(409, `인벤토리는 최대 ${cfg.MAX_INVENTORY_SLOTS}칸까지 확장할 수 있습니다.`);
    }
    if (user.gold < cfg.INVENTORY_EXPANSION_COST) {
      throw new AppError(400, `골드가 부족합니다. (필요: ${cfg.INVENTORY_EXPANSION_COST})`);
    }

    const slots = Math.min(user.inventory_slots + cfg.INVENTORY_EXPANSION_SLOTS, cfg.MAX_INVENTORY_SLOTS);
    const gold = user.gold - cfg.INVENTORY_EXPANSION_COST;
    await conn.query("UPDATE users SET inventory_slots = ?, gold = ? WHERE id = ?", [slots, gold, userId]);
    return { slots, spentGold: cfg.INVENTORY_EXPANSION_COST, gold };
  });
}

// 5. 아이템 판매 (도감·빙고 기록은 유지됨)
async function sellItem(userId, userItemId) {
  return withTransaction(async (conn) => {
    const user = await lockUser(conn, userId);
    const [[item]] = await conn.query(
      `SELECT ui.id, i.sell_price FROM user_items ui JOIN items i ON i.id = ui.item_id
        WHERE ui.id = ? AND ui.user_id = ?`,
      [userItemId, userId]
    );
    if (!item) throw new AppError(404, "보유하지 않은 아이템입니다.");
    if (user.equipped_user_item_id === userItemId) {
      throw new AppError(409, "장착 중인 아이템은 판매할 수 없습니다. 먼저 해제하세요.");
    }

    await conn.query("DELETE FROM user_items WHERE id = ?", [userItemId]);
    const gold = user.gold + item.sell_price;
    await conn.query("UPDATE users SET gold = ? WHERE id = ?", [gold, userId]);
    return { userItemId, earnedGold: item.sell_price, gold };
  });
}

// 6. 장비 장착 (핵심 API): 기존 장비가 있으면 교체. 진행 중 탐사의 종료 시각은 바뀌지 않음
async function equipItem(userId, userItemId) {
  return withTransaction(async (conn) => {
    const user = await lockUser(conn, userId);
    const [[item]] = await conn.query(
      `SELECT ui.id AS userItemId, i.name, i.grade, i.power
         FROM user_items ui JOIN items i ON i.id = ui.item_id
        WHERE ui.id = ? AND ui.user_id = ?`,
      [userItemId, userId]
    );
    if (!item) throw new AppError(404, "보유하지 않은 아이템입니다.");
    if (user.equipped_user_item_id === userItemId) throw new AppError(409, "이미 장착 중인 아이템입니다.");

    await conn.query("UPDATE users SET equipped_user_item_id = ? WHERE id = ?", [userItemId, userId]);
    return {
      equippedItem: { userItemId: item.userItemId, name: item.name, grade: item.grade },
      replacedItemId: user.equipped_user_item_id,
      power: item.power,
    };
  });
}

// 7. 장비 해제 (장비가 없으면 탐사를 시작할 수 없음)
async function unequipItem(userId) {
  return withTransaction(async (conn) => {
    const user = await lockUser(conn, userId);
    if (user.equipped_user_item_id === null) throw new AppError(404, "장착 중인 장비가 없습니다.");

    await conn.query("UPDATE users SET equipped_user_item_id = NULL WHERE id = ?", [userId]);
    return { unequippedItemId: user.equipped_user_item_id, power: 0 };
  });
}

module.exports = { getStatus, getStats, getInventory, expandInventory, sellItem, equipItem, unequipItem };
