// 빙고: 아이템 종류를 처음 얻으면 5×5 빙고판의 빈칸 하나에 무작위로 배치한다.
// 줄 판정은 저장하지 않고 조회할 때마다 계산한다 (칸 25개, 줄 12개라 가볍고, 저장값과 어긋날 위험이 없음).
const { randomInt } = require("crypto");

const SIZE = 5;
const CELL_COUNT = SIZE * SIZE;

// 12줄: 가로 5, 세로 5, 대각선 2
const LINES = [
  ...[0, 1, 2, 3, 4].map((r) => ({ type: "row", index: r, cells: [0, 1, 2, 3, 4].map((c) => r * SIZE + c) })),
  ...[0, 1, 2, 3, 4].map((c) => ({ type: "column", index: c, cells: [0, 1, 2, 3, 4].map((r) => r * SIZE + c) })),
  { type: "diagonal", index: 0, cells: [0, 6, 12, 18, 24] },
  { type: "diagonal", index: 1, cells: [4, 8, 12, 16, 20] },
];

// 채워진 칸 번호 목록 → 완성된 줄 목록
function computeLines(filledCells) {
  const filled = new Set(filledCells);
  return LINES.filter((line) => line.cells.every((cell) => filled.has(cell))).map(({ type, index }) => ({
    type,
    index,
  }));
}

// 기본 난수: 0 이상 max 미만 정수. 테스트에서는 고정값 함수를 넣는다
const defaultPick = (max) => randomInt(max);

// 아이템을 빈칸에 배치하고 칸 번호를 돌려준다. 이미 배치된 아이템이면 null.
// 반드시 사용자 행을 잠근 트랜잭션 안에서 호출한다 (inventoryService.grantItem).
async function placeItem(conn, userId, itemId, pick = defaultPick) {
  const [existing] = await conn.query(
    "SELECT cell_index FROM user_bingo_cells WHERE user_id = ? AND item_id = ?",
    [userId, itemId]
  );
  if (existing.length > 0) return null;

  const [rows] = await conn.query("SELECT cell_index FROM user_bingo_cells WHERE user_id = ?", [userId]);
  const used = new Set(rows.map((r) => r.cell_index));
  const empty = [];
  for (let i = 0; i < CELL_COUNT; i++) if (!used.has(i)) empty.push(i);
  if (empty.length === 0) return null; // 25종이라 실제로는 일어나지 않음

  const cellIndex = empty[pick(empty.length)];
  await conn.query("INSERT INTO user_bingo_cells (user_id, item_id, cell_index) VALUES (?, ?, ?)", [
    userId,
    itemId,
    cellIndex,
  ]);
  return cellIndex;
}

// ─────────────── 조회·보상 (Item 라우터의 빙고 API) ───────────────
const db = require("../db");
const AppError = require("../utils/AppError");
const { withTransaction, lockUser } = require("../utils/transaction");
const { getReductionRates } = require("./buffService");

async function getFilledCells(userId, conn = db) {
  const [rows] = await conn.query("SELECT cell_index FROM user_bingo_cells WHERE user_id = ?", [userId]);
  return rows.map((r) => r.cell_index);
}

// 빙고판 5×5 (빈칸은 null) + 완성된 줄
async function getBoard(userId) {
  const [rows] = await db.query(
    `SELECT c.cell_index, c.placed_at, i.id AS itemId, i.name, i.stage_id AS stageId, i.grade
       FROM user_bingo_cells c JOIN items i ON i.id = c.item_id
      WHERE c.user_id = ?`,
    [userId]
  );
  const board = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  for (const r of rows) {
    board[Math.floor(r.cell_index / SIZE)][r.cell_index % SIZE] = {
      cellIndex: r.cell_index,
      itemId: r.itemId,
      name: r.name,
      stageId: r.stageId,
      grade: r.grade,
      placedAt: r.placed_at,
    };
  }
  const lines = computeLines(rows.map((r) => r.cell_index));
  return { board, filledCount: rows.length, lines, lineCount: lines.length };
}

// 1·3·5빙고 보상 현황
async function getRewardStatus(userId) {
  const lineCount = computeLines(await getFilledCells(userId)).length;
  const [tiers] = await db.query(
    `SELECT t.threshold, t.reduction_rate, r.claimed_at
       FROM bingo_reward_tiers t
       LEFT JOIN bingo_rewards r ON r.threshold = t.threshold AND r.user_id = ?
      ORDER BY t.threshold`,
    [userId]
  );
  const { bingoReductionRate } = await getReductionRates(userId);
  return {
    lineCount,
    bingoReductionRate,
    tiers: tiers.map((t) => ({
      threshold: t.threshold,
      reductionRate: Number(t.reduction_rate),
      achieved: lineCount >= t.threshold,
      claimed: t.claimed_at !== null,
      claimedAt: t.claimed_at,
    })),
  };
}

// 보상 수령 (핵심): 서버가 줄을 다시 판정하고, PK(user_id, threshold)로 1회만 지급
async function claimReward(userId, threshold) {
  return withTransaction(async (conn) => {
    await lockUser(conn, userId);
    const [[tier]] = await conn.query("SELECT * FROM bingo_reward_tiers WHERE threshold = ?", [threshold]);
    if (!tier) throw new AppError(404, "없는 보상 단계입니다. (1, 3, 5빙고만 있음)");

    const [claimed] = await conn.query("SELECT 1 FROM bingo_rewards WHERE user_id = ? AND threshold = ?", [
      userId,
      threshold,
    ]);
    if (claimed.length > 0) throw new AppError(409, `이미 ${threshold}빙고 보상을 받았습니다.`);

    const lineCount = computeLines(await getFilledCells(userId, conn)).length;
    if (lineCount < threshold) {
      throw new AppError(400, `빙고가 부족합니다. (현재 ${lineCount}빙고, 필요 ${threshold}빙고)`);
    }

    await conn.query("INSERT INTO bingo_rewards (user_id, threshold) VALUES (?, ?)", [userId, threshold]);
    return {
      threshold,
      reductionRate: Number(tier.reduction_rate),
      ...(await getReductionRates(userId, conn)),
    };
  });
}

module.exports = { SIZE, CELL_COUNT, LINES, computeLines, placeItem, getBoard, getRewardStatus, claimReward };
