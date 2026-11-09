// 실제 MySQL(project DB)을 쓰는 테스트용 도우미.
// 테스트마다 고유한 사용자를 만들고, 끝나면 그 사용자만 지운다(다른 데이터는 건드리지 않음).
const db = require("../../db");
const { signToken } = require("../../middlewares/auth");
const { withTransaction } = require("../../utils/transaction");
const { createUserWithStarter } = require("../../services/userService");
const { grantItem } = require("../../services/inventoryService");

const createdUserIds = [];

// 테스트용 사용자 생성: 회원가입과 같은 함수 사용 (Stage 1 Common 장착·도감·빙고 등록 + Stage 1 해금)
async function createUser({ role = "user", gold = 0 } = {}) {
  const loginId = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`.slice(0, 20);
  const { userId } = await withTransaction((conn) =>
    createUserWithStarter(conn, { loginId, passwordHash: "x", nickname: "테스트", role, gold })
  );
  createdUserIds.push(userId);
  return { userId, token: signToken({ userId, role }) };
}

// 아이템 지급 (itemId = (스테이지-1)*5 + 등급순번, 예: Stage 1 Supreme = 5)
// 실제 지급 경로(grantItem)를 사용하므로 인벤토리 검사·도감·빙고까지 함께 처리된다
async function giveItem(userId, itemId, options) {
  const { userItemId } = await withTransaction((conn) => grantItem(conn, userId, itemId, "DROP", options));
  return userItemId;
}

// 같은 아이템 여러 개 지급
async function giveItems(userId, itemId, count) {
  const ids = [];
  for (let i = 0; i < count; i++) ids.push(await giveItem(userId, itemId));
  return ids;
}

async function equip(userId, userItemId) {
  await db.query("UPDATE users SET equipped_user_item_id = ? WHERE id = ?", [userItemId, userId]);
}

async function setGold(userId, gold) {
  await db.query("UPDATE users SET gold = ? WHERE id = ?", [gold, userId]);
}

async function getUser(userId) {
  const [[user]] = await db.query("SELECT * FROM users WHERE id = ?", [userId]);
  return user;
}

// 빙고판을 원하는 칸 배치로 설정 (기존 배치 삭제 후 아이템 1번부터 차례로 지정한 칸에 배치)
async function setBingoCells(userId, cellIndexes) {
  await db.query("DELETE FROM user_bingo_cells WHERE user_id = ?", [userId]);
  for (const [i, cellIndex] of cellIndexes.entries()) {
    await db.query("INSERT INTO user_bingo_cells (user_id, item_id, cell_index) VALUES (?, ?, ?)", [
      userId,
      i + 1,
      cellIndex,
    ]);
  }
}

// 완료된 탐사 기록 추가 (1회차 보상까지 받은 상태, 최초 탐사 보상 테스트용)
async function addCompletedBattle(userId, stageId) {
  const [battle] = await db.query(
    `INSERT INTO battles (user_id, stage_id, status, duration_sec, repeat_total, repeat_done, end_time, completed_at)
     VALUES (?, ?, 'COMPLETED', 60, 1, 1, NOW(), NOW())`,
    [userId, stageId]
  );
  await db.query(
    "INSERT INTO battle_rewards (battle_id, round_no, item_id, gold) VALUES (?, 1, ?, 10)",
    [battle.insertId, (stageId - 1) * 5 + 1]
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

module.exports = {
  db,
  createUser,
  giveItem,
  giveItems,
  equip,
  setGold,
  getUser,
  setBingoCells,
  addCompletedBattle,
  cleanup,
};
