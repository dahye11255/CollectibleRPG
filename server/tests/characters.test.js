// Character 라우터 테스트 (실제 MySQL 사용: 먼저 npm run db:init 으로 DB를 준비해야 함)
const request = require("supertest");
const app = require("../app");
const { db, createUser, giveItem, setGold, getUser, cleanup } = require("./helpers/dbHelper");

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const STAGE1_SUPREME = 5;

afterAll(cleanup);

// ─────────────────────────────────────────────
// 핵심 API: PUT /api/characters/me/equipment
// ─────────────────────────────────────────────
describe("PUT /api/characters/me/equipment (핵심 API)", () => {
  test("정상 장착 → 200, 전투력 반영, 교체된 아이템 번호 반환", async () => {
    const user = await createUser();
    const starterId = (await getUser(user.userId)).equipped_user_item_id;
    const supremeId = await giveItem(user.userId, STAGE1_SUPREME);

    const res = await request(app)
      .put("/api/characters/me/equipment")
      .set(auth(user.token))
      .send({ userItemId: supremeId });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      equippedItem: { userItemId: supremeId, name: "Stage 1 Supreme", grade: "SUPREME" },
      replacedItemId: starterId,
      power: 160,
    });

    const stats = await request(app).get("/api/characters/me/stats").set(auth(user.token));
    expect(stats.body.data.power).toBe(160);
  });

  test("다른 사용자의 아이템 → 404", async () => {
    const owner = await createUser();
    const other = await createUser();
    const othersItem = await giveItem(other.userId, 2);

    const res = await request(app)
      .put("/api/characters/me/equipment")
      .set(auth(owner.token))
      .send({ userItemId: othersItem });
    expect(res.status).toBe(404);
  });

  test("이미 장착 중인 아이템 → 409", async () => {
    const user = await createUser();
    const starterId = (await getUser(user.userId)).equipped_user_item_id;
    const res = await request(app)
      .put("/api/characters/me/equipment")
      .set(auth(user.token))
      .send({ userItemId: starterId });
    expect(res.status).toBe(409);
  });

  test("userItemId 누락 → 400", async () => {
    const user = await createUser();
    const res = await request(app).put("/api/characters/me/equipment").set(auth(user.token)).send({});
    expect(res.status).toBe(400);
  });

  test("토큰 없음 → 401", async () => {
    const res = await request(app).put("/api/characters/me/equipment").send({ userItemId: 1 });
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/characters/me/equipment", () => {
  test("해제 → 200, 전투력 0 / 다시 해제 → 404", async () => {
    const user = await createUser();
    const first = await request(app).delete("/api/characters/me/equipment").set(auth(user.token));
    expect(first.status).toBe(200);
    expect(first.body.data.power).toBe(0);

    const second = await request(app).delete("/api/characters/me/equipment").set(auth(user.token));
    expect(second.status).toBe(404);
  });
});

// ─────────────────────────────────────────────
// 상태·능력치
// ─────────────────────────────────────────────
describe("GET /api/characters/me, /me/stats", () => {
  test("신규 사용자 상태: 시작 장비 장착, 단축률 0", async () => {
    const user = await createUser({ gold: 50 });
    const res = await request(app).get("/api/characters/me").set(auth(user.token));

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      gold: 50,
      equippedItem: { name: "Stage 1 Common" },
      codexReductionRate: 0,
      bingoReductionRate: 0,
      totalReductionRate: 0,
    });
  });

  test("도감 보상 2개 → completedCodexStages [1, 2], 도감 단축률 10", async () => {
    const user = await createUser();
    await db.query("INSERT INTO codex_rewards (user_id, stage_id) VALUES (?, 1), (?, 2)", [user.userId, user.userId]);

    const res = await request(app).get("/api/characters/me/stats").set(auth(user.token));
    expect(res.body.data.completedCodexStages).toEqual([1, 2]);
    expect(res.body.data.codexReductionRate).toBe(10);
  });
});

// ─────────────────────────────────────────────
// 인벤토리
// ─────────────────────────────────────────────
describe("인벤토리 조회·확장·판매", () => {
  test("GET /api/characters/me/inventory → 칸 수, 장착 표시, 등급별 수량, 필터", async () => {
    const user = await createUser();
    await giveItem(user.userId, 2);
    await giveItem(user.userId, 2);

    const all = await request(app).get("/api/characters/me/inventory").set(auth(user.token));
    expect(all.status).toBe(200);
    expect(all.body.data.slots).toBe(20);
    expect(all.body.data.usedSlots).toBe(3);
    expect(all.body.data.countsByGrade).toEqual({ COMMON: 1, UNCOMMON: 2 });
    expect(all.body.data.items.filter((i) => i.equipped)).toHaveLength(1);

    const filtered = await request(app).get("/api/characters/me/inventory?grade=uncommon").set(auth(user.token));
    expect(filtered.body.data.items).toHaveLength(2);

    const invalid = await request(app).get("/api/characters/me/inventory?grade=LEGEND").set(auth(user.token));
    expect(invalid.status).toBe(400);
  });

  test("POST /api/characters/me/inventory/expansions → 201, +5칸·100골드 / 골드 부족 → 400", async () => {
    const user = await createUser({ gold: 150 });
    const ok = await request(app).post("/api/characters/me/inventory/expansions").set(auth(user.token));
    expect(ok.status).toBe(201);
    expect(ok.body.data).toEqual({ slots: 25, spentGold: 100, gold: 50 });

    const poor = await request(app).post("/api/characters/me/inventory/expansions").set(auth(user.token));
    expect(poor.status).toBe(400);
  });

  test("최대 50칸 → 409", async () => {
    const user = await createUser({ gold: 1000 });
    await db.query("UPDATE users SET inventory_slots = 50 WHERE id = ?", [user.userId]);
    const res = await request(app).post("/api/characters/me/inventory/expansions").set(auth(user.token));
    expect(res.status).toBe(409);
  });

  test("DELETE /api/characters/me/inventory/:userItemId → 판매가만큼 골드, 도감·빙고는 유지", async () => {
    const user = await createUser();
    await setGold(user.userId, 10);
    const itemId = await giveItem(user.userId, 2); // Stage 1 Uncommon, 판매가 20

    const res = await request(app).delete(`/api/characters/me/inventory/${itemId}`).set(auth(user.token));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ userItemId: itemId, earnedGold: 20, gold: 30 });

    const [cells] = await db.query("SELECT 1 FROM user_bingo_cells WHERE user_id = ? AND item_id = 2", [user.userId]);
    expect(cells).toHaveLength(1);
  });

  test("장착 중인 아이템 판매 → 409 / 없는 아이템 → 404", async () => {
    const user = await createUser();
    const starterId = (await getUser(user.userId)).equipped_user_item_id;

    const equipped = await request(app).delete(`/api/characters/me/inventory/${starterId}`).set(auth(user.token));
    expect(equipped.status).toBe(409);

    const missing = await request(app).delete("/api/characters/me/inventory/999999").set(auth(user.token));
    expect(missing.status).toBe(404);
  });
});
