// 신규 사용자 초기 상태 만들기 (회원가입과 테스트 도우미가 같이 사용)
const { grantItem } = require("./inventoryService");

const STARTER_ITEM_ID = 1; // Stage 1 Common
const FIRST_STAGE_ID = 1;

/**
 * 계정 생성 → Stage 1 Common 지급(도감·빙고 등록 포함) → 자동 장착 → Stage 1 해금
 * 트랜잭션 안에서 호출한다.
 */
async function createUserWithStarter(conn, { loginId, passwordHash, nickname, role = "user", gold = 0 }) {
  const [result] = await conn.query(
    "INSERT INTO users (login_id, password_hash, nickname, role, gold) VALUES (?, ?, ?, ?, ?)",
    [loginId, passwordHash, nickname, role, gold]
  );
  const userId = result.insertId;

  const starter = await grantItem(conn, userId, STARTER_ITEM_ID, "STARTER");
  await conn.query("UPDATE users SET equipped_user_item_id = ? WHERE id = ?", [starter.userItemId, userId]);
  await conn.query("INSERT INTO stage_unlocks (user_id, stage_id) VALUES (?, ?)", [userId, FIRST_STAGE_ID]);

  return { userId, starter };
}

module.exports = { createUserWithStarter, STARTER_ITEM_ID };
