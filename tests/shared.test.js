// 공유 서비스 테스트: 빙고 판정·배치, 아이템 지급, 탐사 시간 계산, 드롭, 연구 효과
const { computeLines } = require("../services/bingoService");
const { calcDurationSec, getReductionRates } = require("../services/buffService");
const { rollGrade } = require("../services/dropService");
const { applyLuck, applyDiscount, applyBonus, getEffects } = require("../services/researchService");
const { withTransaction } = require("../utils/transaction");
const { grantItem } = require("../services/inventoryService");
const { db, createUser, giveItem, cleanup } = require("./helpers/dbHelper");

afterAll(cleanup);

const BASE_RATES = { COMMON: 50, UNCOMMON: 25, EPIC: 15, ANCIENT: 9, SUPREME: 1 };
const cellsOf = async (userId) =>
  (await db.query("SELECT item_id, cell_index FROM user_bingo_cells WHERE user_id = ? ORDER BY item_id", [userId]))[0];

// ─────────────────────────────────────────────
// 빙고 줄 판정 (DB 없음)
// ─────────────────────────────────────────────
describe("빙고 줄 판정 computeLines", () => {
  test("빈 판 → 0줄", () => {
    expect(computeLines([])).toEqual([]);
  });

  test("가로 1줄 / 세로 1줄 / 대각선 2줄", () => {
    expect(computeLines([5, 6, 7, 8, 9])).toEqual([{ type: "row", index: 1 }]);
    expect(computeLines([2, 7, 12, 17, 22])).toEqual([{ type: "column", index: 2 }]);
    expect(computeLines([0, 6, 12, 18, 24])).toEqual([{ type: "diagonal", index: 0 }]);
    expect(computeLines([4, 8, 12, 16, 20])).toEqual([{ type: "diagonal", index: 1 }]);
  });

  test("4칸만 찬 줄은 미완성", () => {
    expect(computeLines([0, 1, 2, 3])).toEqual([]);
  });

  test("꽉 찬 판 → 12줄", () => {
    expect(computeLines([...Array(25).keys()])).toHaveLength(12);
  });
});

// ─────────────────────────────────────────────
// 아이템 지급 → 도감·빙고 등록 (실제 DB)
// ─────────────────────────────────────────────
describe("grantItem: 도감·빙고 자동 등록", () => {
  test("가입 시 시작 아이템이 빙고판에 1칸 배치됨", async () => {
    const user = await createUser();
    const cells = await cellsOf(user.userId);
    expect(cells).toHaveLength(1);
    expect(cells[0].item_id).toBe(1);
  });

  test("새 종류 → 배치 / 같은 종류 재획득 → 칸 수 그대로, 위치 유지", async () => {
    const user = await createUser();
    await giveItem(user.userId, 2);
    const before = await cellsOf(user.userId);
    expect(before).toHaveLength(2);

    await giveItem(user.userId, 2);
    await giveItem(user.userId, 1);
    expect(await cellsOf(user.userId)).toEqual(before);
  });

  test("25종 모두 획득 → 25칸 모두 다른 위치", async () => {
    const user = await createUser();
    await db.query("UPDATE users SET inventory_slots = 50 WHERE id = ?", [user.userId]);
    for (let itemId = 2; itemId <= 25; itemId++) await giveItem(user.userId, itemId);

    const cells = await cellsOf(user.userId);
    expect(cells).toHaveLength(25);
    expect(new Set(cells.map((c) => c.cell_index)).size).toBe(25);
  });

  test("판매(아이템 삭제) 후에도 도감·빙고 기록 유지", async () => {
    const user = await createUser();
    const userItemId = await giveItem(user.userId, 3);
    await db.query("DELETE FROM user_items WHERE id = ?", [userItemId]);

    expect((await cellsOf(user.userId)).map((c) => c.item_id)).toEqual([1, 3]);
    const [codex] = await db.query("SELECT item_id FROM user_codex WHERE user_id = ? ORDER BY item_id", [user.userId]);
    expect(codex.map((c) => c.item_id)).toEqual([1, 3]);
  });

  test("인벤토리 가득 참 → 409, 아이템·도감·빙고 모두 기록 안 됨 (롤백)", async () => {
    const user = await createUser();
    await db.query("UPDATE users SET inventory_slots = 1 WHERE id = ?", [user.userId]);

    await expect(giveItem(user.userId, 4)).rejects.toMatchObject({ status: 409 });
    expect(await cellsOf(user.userId)).toHaveLength(1);
    const [codex] = await db.query("SELECT 1 FROM user_codex WHERE user_id = ? AND item_id = 4", [user.userId]);
    expect(codex).toHaveLength(0);
  });

  test("같은 빈칸을 고르도록 강제한 동시 지급 2건 → 칸이 겹치지 않음 (사용자 행 잠금)", async () => {
    const user = await createUser();
    const pickFirst = () => 0; // 두 요청 모두 '첫 번째 빈칸'을 고름
    await Promise.all([
      withTransaction((conn) => grantItem(conn, user.userId, 6, "DROP", { pick: pickFirst })),
      withTransaction((conn) => grantItem(conn, user.userId, 7, "DROP", { pick: pickFirst })),
    ]);

    const cells = await cellsOf(user.userId);
    expect(cells).toHaveLength(3);
    expect(new Set(cells.map((c) => c.cell_index)).size).toBe(3);
  });
});

// ─────────────────────────────────────────────
// 탐사 시간·단축률
// ─────────────────────────────────────────────
describe("탐사 시간 계산", () => {
  test("ceil(기본 × (1 − 단축률)), 소수 오차 없음", () => {
    expect(calcDurationSec(60, 0)).toBe(60);
    expect(calcDurationSec(60, 15)).toBe(51); // 60 × 0.85 = 51 (부동소수점이면 52가 될 수 있는 경우)
    expect(calcDurationSec(60, 45)).toBe(33);
    expect(calcDurationSec(120, 10)).toBe(108);
    expect(calcDurationSec(61, 10)).toBe(55); // 54.9 → 55
  });

  test("도감 25% + 빙고 20% → 합계 45% 상한", async () => {
    const user = await createUser();
    for (let stageId = 1; stageId <= 5; stageId++) {
      await db.query("INSERT INTO codex_rewards (user_id, stage_id) VALUES (?, ?)", [user.userId, stageId]);
    }
    for (const threshold of [1, 3, 5]) {
      await db.query("INSERT INTO bingo_rewards (user_id, threshold) VALUES (?, ?)", [user.userId, threshold]);
    }
    expect(await getReductionRates(user.userId)).toEqual({
      codexReductionRate: 25,
      bingoReductionRate: 20,
      totalReductionRate: 45,
    });
  });
});

// ─────────────────────────────────────────────
// 드롭·연구 효과
// ─────────────────────────────────────────────
describe("드롭과 연구 효과", () => {
  test("난수 경계값으로 등급 결정 (50/25/15/9/1)", () => {
    const at = (v) => rollGrade(BASE_RATES, () => v);
    expect(at(0)).toBe("COMMON");
    expect(at(0.4999)).toBe("COMMON");
    expect(at(0.5)).toBe("UNCOMMON");
    expect(at(0.75)).toBe("EPIC");
    expect(at(0.9)).toBe("ANCIENT");
    expect(at(0.99)).toBe("SUPREME");
    expect(at(0.9999)).toBe("SUPREME");
  });

  test("행운 Lv5 → C40 / UC30 / EP18 / A10.5 / S1.5, 합계 100", () => {
    const rates = applyLuck(BASE_RATES, 5, 2);
    expect(rates).toEqual({ COMMON: 40, UNCOMMON: 30, EPIC: 18, ANCIENT: 10.5, SUPREME: 1.5 });
    expect(Object.values(rates).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 6);
  });

  test("10만 회 시뮬레이션 비율 ±0.5%p", () => {
    const counts = { COMMON: 0, UNCOMMON: 0, EPIC: 0, ANCIENT: 0, SUPREME: 0 };
    const N = 100000;
    for (let i = 0; i < N; i++) counts[rollGrade(BASE_RATES)]++;
    for (const [grade, rate] of Object.entries(BASE_RATES)) {
      expect(Math.abs((counts[grade] / N) * 100 - rate)).toBeLessThan(0.5);
    }
  });

  test("할인은 올림, 보너스는 내림", () => {
    expect(applyDiscount(640, 25)).toBe(480);
    expect(applyDiscount(10, 15)).toBe(9); // 8.5 → 9
    expect(applyBonus(15, 10)).toBe(16); // 16.5 → 16
  });

  test("연구 없는 신규 사용자 효과 = 기본값", async () => {
    const user = await createUser();
    expect(await getEffects(user.userId)).toEqual({
      dropRates: BASE_RATES,
      synthesisFeeDiscountRate: 0,
      goldBonusRate: 0,
      instantCostDiscountRate: 0,
      maxRepeatCount: 1,
    });
  });
});
