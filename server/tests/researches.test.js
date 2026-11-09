// Research(연구소) 라우터 테스트 (실제 MySQL 사용: 먼저 npm run db:init 으로 DB를 준비해야 함)
const request = require("supertest");
const app = require("../app");
const { db, createUser, getUser, cleanup } = require("./helpers/dbHelper");

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const upgrade = (user, id) => request(app).post(`/api/researches/${id}/upgrades`).set(auth(user.token));
const levelOf = async (userId, id) => {
  const [[row]] = await db.query("SELECT level FROM user_researches WHERE user_id = ? AND research_id = ?", [userId, id]);
  return row ? row.level : 0;
};

afterAll(cleanup);

// ─────────────────────────────────────────────
// 핵심 API: POST /api/researches/:researchId/upgrades
// ─────────────────────────────────────────────
describe("POST /api/researches/:researchId/upgrades (핵심 API)", () => {
  test("골드 충분 → 201, Lv0→1, 100골드 차감, 효과 2%p, 기록 저장", async () => {
    const user = await createUser({ gold: 500 });
    const res = await upgrade(user, "luck");

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({
      researchId: "luck", fromLevel: 0, toLevel: 1, spentGold: 100, gold: 400, currentEffect: 2,
    });
    expect(await levelOf(user.userId, "luck")).toBe(1);

    const [logs] = await db.query("SELECT action, gold_change FROM research_logs WHERE user_id = ?", [user.userId]);
    expect(logs).toEqual([{ action: "UPGRADE", gold_change: -100 }]);
  });

  test("레벨마다 비용 1.5배 (100 → 150 → 225), 효과 반영 (행운 Lv1 → Common 48%)", async () => {
    const user = await createUser({ gold: 1000 });
    const costs = [];
    for (let i = 0; i < 3; i++) costs.push((await upgrade(user, "alchemy")).body.data.spentGold);
    expect(costs).toEqual([100, 150, 225]);

    await upgrade(user, "luck");
    const effects = await request(app).get("/api/researches/effects").set(auth(user.token));
    expect(effects.body.data).toMatchObject({
      dropRates: { COMMON: 48, UNCOMMON: 26, EPIC: 15.6, ANCIENT: 9.3, SUPREME: 1.1 },
      synthesisFeeDiscountRate: 15,
    });
  });

  test("골드 부족 → 400, 레벨·골드 그대로", async () => {
    const user = await createUser({ gold: 99 });
    const res = await upgrade(user, "trade");
    expect(res.status).toBe(400);
    expect(await levelOf(user.userId, "trade")).toBe(0);
    expect((await getUser(user.userId)).gold).toBe(99);
  });

  test("최대 레벨 → 409 (자동 탐사 Lv4 = 연속 5회)", async () => {
    const user = await createUser({ gold: 99999 });
    for (let i = 0; i < 4; i++) expect((await upgrade(user, "auto-explore")).status).toBe(201);

    const res = await upgrade(user, "auto-explore");
    expect(res.status).toBe(409);
    const effects = await request(app).get("/api/researches/effects").set(auth(user.token));
    expect(effects.body.data.maxRepeatCount).toBe(5);
  });

  test("동시에 레벨업 2건, 골드는 1번 분량만 있음 → 1건만 성공 (골드 이중 차감 없음)", async () => {
    const user = await createUser({ gold: 120 });
    const results = await Promise.all([upgrade(user, "chrono"), upgrade(user, "chrono")]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(await levelOf(user.userId, "chrono")).toBe(1);
    expect((await getUser(user.userId)).gold).toBe(20);
  });

  test("없는 연구 → 404 / 토큰 없음 → 401", async () => {
    const user = await createUser({ gold: 500 });
    expect((await upgrade(user, "magic")).status).toBe(404);
    expect((await request(app).post("/api/researches/luck/upgrades")).status).toBe(401);
  });
});

// ─────────────────────────────────────────────
// 조회
// ─────────────────────────────────────────────
describe("연구 조회", () => {
  test("GET /api/researches → 5종, 신규 사용자는 모두 Lv0", async () => {
    const user = await createUser({ gold: 50 });
    const res = await request(app).get("/api/researches").set(auth(user.token));

    expect(res.status).toBe(200);
    expect(res.body.data.gold).toBe(50);
    expect(res.body.data.researches.map((r) => [r.researchId, r.level, r.nextCost, r.effectUnit])).toEqual([
      ["luck", 0, 100, "%p"],
      ["alchemy", 0, 100, "%"],
      ["trade", 0, 100, "%"],
      ["chrono", 0, 100, "%"],
      ["auto-explore", 0, 300, "회"],
    ]);
  });

  test("GET /api/researches/:researchId → 레벨별 비용·누적 효과 표 / 없는 연구 → 404", async () => {
    const user = await createUser();
    const res = await request(app).get("/api/researches/trade").set(auth(user.token));
    expect(res.body.data.levels).toEqual([
      { level: 1, cost: 100, effect: 10 },
      { level: 2, cost: 150, effect: 20 },
      { level: 3, cost: 225, effect: 30 },
      { level: 4, cost: 338, effect: 40 },
      { level: 5, cost: 507, effect: 50 },
    ]);
    expect((await request(app).get("/api/researches/nothing").set(auth(user.token))).status).toBe(404);
  });

  test("GET /api/researches/history → 최신순 기록 / 잘못된 page → 400", async () => {
    const user = await createUser({ gold: 500 });
    await upgrade(user, "luck");
    await upgrade(user, "trade");

    const res = await request(app).get("/api/researches/history").set(auth(user.token));
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.logs.map((l) => l.researchId)).toEqual(["trade", "luck"]);

    expect((await request(app).get("/api/researches/history?page=0").set(auth(user.token))).status).toBe(400);
  });
});

// ─────────────────────────────────────────────
// 초기화·관리자 수정
// ─────────────────────────────────────────────
describe("연구 초기화·관리자 수정", () => {
  test("DELETE /api/researches/:researchId → Lv2(사용 250) 초기화 시 125 환급 / 다시 초기화 → 409", async () => {
    const user = await createUser({ gold: 500 });
    await upgrade(user, "luck");
    await upgrade(user, "luck"); // 100 + 150 사용 → 250 남음

    const res = await request(app).delete("/api/researches/luck").set(auth(user.token));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ researchId: "luck", fromLevel: 2, refundedGold: 125, gold: 375 });
    expect(await levelOf(user.userId, "luck")).toBe(0);

    expect((await request(app).delete("/api/researches/luck").set(auth(user.token))).status).toBe(409);
  });

  test("PATCH /api/researches/:researchId → 일반 사용자 403 / 관리자 200 (테스트 후 복구) / 잘못된 값 400", async () => {
    const user = await createUser();
    const admin = await createUser({ role: "admin" });
    expect((await request(app).patch("/api/researches/trade").set(auth(user.token)).send({ baseCost: 50 })).status).toBe(403);

    const [[original]] = await db.query("SELECT base_cost FROM research_types WHERE id = 'trade'");
    const ok = await request(app).patch("/api/researches/trade").set(auth(admin.token)).send({ baseCost: 50 });
    expect(ok.status).toBe(200);
    const [[changed]] = await db.query("SELECT base_cost FROM research_types WHERE id = 'trade'");
    expect(changed.base_cost).toBe(50);
    await db.query("UPDATE research_types SET base_cost = ? WHERE id = 'trade'", [original.base_cost]);

    expect((await request(app).patch("/api/researches/trade").set(auth(admin.token)).send({})).status).toBe(400);
    expect((await request(app).patch("/api/researches/trade").set(auth(admin.token)).send({ costMultiplier: 0.5 })).status).toBe(400);
  });
});
