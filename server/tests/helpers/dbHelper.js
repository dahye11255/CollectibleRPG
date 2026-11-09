// 실제 MySQL(project DB)을 쓰는 테스트용 도우미.
// 테스트마다 고유한 사용자를 만들고, 끝나면 그 사용자만 지운다(다른 데이터는 건드리지 않음).
const db = require("../../db");
const { signToken } = require("../../middlewares/auth");

const createdUserIds = [];

// 테스트용 사용자 생성: Stage 1 Common 장착 + Stage 1 해금 (회원가입과 같은 초기 상태)
async function createUser({ role = "user", gold = 0 } = {}) {
  const loginId = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`.slice(0, 20);
  const [user] = await db.query(
    "INSERT INTO users (login_id, password_hash, nickname, role, gold) VALUES (?, 'x', '테스트', ?, ?)",
    [loginId, role, gold]
  );
  const userId = user.insertId;
  createdUserIds.push(userId);

  const userItemId = await giveItem(userId, 1);
  await equip(userId, userItemId);
  await db.query("INSERT INTO stage_unlocks (user_id, stage_id) VALUES (?, 1)", [userId]);

  return { userId, token: signToken({ userId, role }) };
}

// 아이템 지급 (itemId = (스테이지-1)*5 + 등급순번, 예: Stage 1 Supreme = 5)
async function giveItem(userId, itemId) {
  const [result] = await db.query(
    "INSERT INTO user_items (user_id, item_id, acquired_from) VALUES (?, ?, 'DROP')",
    [userId, itemId]
  );
  return result.insertId;
}

async function equip(userId, userItemId) {
  await db.query("UPDATE users SET equipped_user_item_id = ? WHERE id = ?", [userItemId, userId]);
}

// 완료된 탐사 기록 추가 (최초 탐사 보상 테스트용)
async function addCompletedBattle(userId, stageId) {
  await db.query(
    `INSERT INTO battles (user_id, stage_id, status, duration_sec, end_time, completed_at)
     VALUES (?, ?, 'COMPLETED', 60, NOW(), NOW())`,
    [userId, stageId]
  );
}

// 테스트에서 만든 사용자 삭제 (관련 데이터는 ON DELETE CASCADE로 함께 삭제) 후 DB 연결 종료
async function cleanup() {
  if (createdUserIds.length > 0) {
    await db.query("UPDATE users SET equipped_user_item_id = NULL WHERE id IN (?)", [createdUserIds]);
    await db.query("DELETE FROM users WHERE id IN (?)", [createdUserIds]);
  }
  await db.end();
}

module.exports = { db, createUser, giveItem, equip, addCompletedBattle, cleanup };
