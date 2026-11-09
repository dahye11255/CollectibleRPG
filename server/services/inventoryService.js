// 아이템 지급 공유 로직. 회원가입·탐사 보상·합성은 모두 grantItem 하나만 거친다.
// → 인벤토리 검사, 도감 기록, 빙고 배치가 어떤 경로로 얻든 똑같이 처리된다.
const AppError = require("../utils/AppError");
const { lockUser } = require("../utils/transaction");
const bingoService = require("./bingoService");

async function countItems(conn, userId) {
  const [[{ count }]] = await conn.query("SELECT COUNT(*) AS count FROM user_items WHERE user_id = ?", [userId]);
  return count;
}

// 인벤토리 빈칸 수
async function getFreeSlots(conn, userId) {
  const [[user]] = await conn.query("SELECT inventory_slots FROM users WHERE id = ?", [userId]);
  return user.inventory_slots - (await countItems(conn, userId));
}

/**
 * 아이템 1개 지급 (트랜잭션 안에서 호출)
 * 1) 사용자 행 잠금 2) 인벤토리 빈칸 검사 3) 지급 4) 도감 기록 5) 처음 얻은 종류면 빙고 칸 배치
 * @returns {{ userItemId, newCodex, bingoCellIndex }}
 */
async function grantItem(conn, userId, itemId, acquiredFrom, { pick } = {}) {
  const user = await lockUser(conn, userId);
  if ((await countItems(conn, userId)) >= user.inventory_slots) {
    throw new AppError(409, "인벤토리가 가득 찼습니다.");
  }

  const [result] = await conn.query(
    "INSERT INTO user_items (user_id, item_id, acquired_from) VALUES (?, ?, ?)",
    [userId, itemId, acquiredFrom]
  );

  // 처음 얻은 종류일 때만 1행이 들어간다 (PK(user_id, item_id))
  const [codex] = await conn.query("INSERT IGNORE INTO user_codex (user_id, item_id) VALUES (?, ?)", [
    userId,
    itemId,
  ]);
  const newCodex = codex.affectedRows === 1;
  const bingoCellIndex = newCodex ? await bingoService.placeItem(conn, userId, itemId, pick) : null;

  return { userItemId: result.insertId, newCodex, bingoCellIndex };
}

module.exports = { countItems, getFreeSlots, grantItem };
