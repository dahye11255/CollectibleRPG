// Item 라우터 테스트 (실제 MySQL 사용: 먼저 npm run db:init 으로 DB를 준비해야 함)
const request = require("supertest");
const app = require("../app");
const { db, createUser, giveItems, giveItem, equip, setGold, getUser, setBingoCells, cleanup } = require("./helpers/dbHelper");

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const countOf = async (userId, itemId) =>
  (await db.query("SELECT COUNT(*) AS n FROM user_items WHERE user_id = ? AND item_id = ?", [userId, itemId]))[0][0].n;

afterAll(cleanup);

// ─────────────────────────────────────────────
// 핵심 API: POST /api/items/syntheses
// ─────────────────────────────────────────────
describe("POST /api/items/syntheses (핵심 API)", () => {
  test("Common 4개 → 201, 재료 4개 삭제·Uncommon 1개 생성·수수료 10 차감·도감·빙고 등록", async () => {
    const user = await createUser({ gold: 100 });
    await equip(user.userId, null); // 시작 장비도 재료로 쓸 수 있게 해제
    const extra = await giveItems(user.userId, 1, 3); // 시작 장비 1 + 3 = Common 4개

    const res = await request(app)
      .post("/api/items/syntheses")
      .set(auth(user.token))
      .send({ stageId: 1, grade: "COMMON" });

    expect(res.status).toBe(201);
    expect(res.body.data.newItem).toMatchObject({ name: "Stage 1 Uncommon", grade: "UNCOMMON" });
    expect(res.body.data.consumedItemIds).toHaveLength(4);
    expect(res.body.data.consumedItemIds).toEqual(expect.arrayContaining(extra));
    expect(res.body.data).toMatchObject({ spentFee: 10, gold: 90, newCodex: true });
    expect(res.body.data.bingoCellIndex).toEqual(expect.any(Number));

    expect(await countOf(user.userId, 1)).toBe(0);
    expect(await countOf(user.userId, 2)).toBe(1);
  });

  test("장착 장비 제외 후 3개 → 400, 아무것도 바뀌지 않음", async () => {
    const user = await createUser({ gold: 100 });
    await giveItems(user.userId, 1, 3); // 장착 중인 시작 장비 + 3개 = 4개지만 재료는 3개

    const res = await request(app)
      .post("/api/items/syntheses")
      .set(auth(user.token))
      .send({ stageId: 1, grade: "COMMON" });

    expect(res.status).toBe(400);
    expect(await countOf(user.userId, 1)).toBe(4);
    expect((await getUser(user.userId)).gold).toBe(100);
  });

  test("장착 장비는 재료에서 자동 제외 (5개 중 장착 1개 남음)", async () => {
    const user = await createUser({ gold: 100 });
    const starterId = (await getUser(user.userId)).equipped_user_item_id;
    await giveItems(user.userId, 1, 4);

    const res = await request(app)
      .post("/api/items/syntheses")
      .set(auth(user.token))
      .send({ stageId: 1, grade: "COMMON" });

    expect(res.status).toBe(201);
    expect(res.body.data.consumedItemIds).not.toContain(starterId);
    const [[left]] = await db.query("SELECT id FROM user_items WHERE user_id = ? AND item_id = 1", [user.userId]);
    expect(left.id).toBe(starterId);
  });

  test("SUPREME 재료 → 400 / 필수값 누락 → 400 / 잘못된 등급 → 400", async () => {
    const user = await createUser({ gold: 100 });
    const supreme = await request(app).post("/api/items/syntheses").set(auth(user.token)).send({ stageId: 1, grade: "SUPREME" });
    expect(supreme.status).toBe(400);

    const missing = await request(app).post("/api/items/syntheses").set(auth(user.token)).send({ stageId: 1 });
    expect(missing.status).toBe(400);

    const invalid = await request(app).post("/api/items/syntheses").set(auth(user.token)).send({ stageId: 1, grade: "LEGEND" });
    expect(invalid.status).toBe(400);
  });

  test("골드 부족 → 400, 재료 그대로", async () => {
    const user = await createUser({ gold: 5 });
    await giveItems(user.userId, 2, 4); // Uncommon 4개 (수수료 40)

    const res = await request(app)
      .post("/api/items/syntheses")
      .set(auth(user.token))
      .send({ stageId: 1, grade: "UNCOMMON" });
    expect(res.status).toBe(400);
    expect(await countOf(user.userId, 2)).toBe(4);
  });

  test("연금술 Lv5 → 수수료 25% 할인 (Ancient 640 → 480)", async () => {
    const user = await createUser({ gold: 1000 });
    await db.query("INSERT INTO user_researches (user_id, research_id, level) VALUES (?, 'alchemy', 5)", [user.userId]);
    await giveItems(user.userId, 4, 4);

    const res = await request(app)
      .post("/api/items/syntheses")
      .set(auth(user.token))
      .send({ stageId: 1, grade: "ANCIENT" });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ spentFee: 480, gold: 520 });
    expect(res.body.data.newItem.name).toBe("Stage 1 Supreme");
  });

  test("토큰 없음 → 401", async () => {
    const res = await request(app).post("/api/items/syntheses").send({ stageId: 1, grade: "COMMON" });
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────
// 아이템 정보·합성 규칙
// ─────────────────────────────────────────────
describe("아이템 정보", () => {
  test("GET /api/items → 25종, 필터 동작", async () => {
    const user = await createUser();
    const all = await request(app).get("/api/items").set(auth(user.token));
    expect(all.body.data.items).toHaveLength(25);

    const supremes = await request(app).get("/api/items?grade=SUPREME").set(auth(user.token));
    expect(supremes.body.data.items.map((i) => i.name)).toEqual([1, 2, 3, 4, 5].map((s) => `Stage ${s} Supreme`));

    const stage2 = await request(app).get("/api/items?stageId=2").set(auth(user.token));
    expect(stage2.body.data.items).toHaveLength(5);
  });

  test("GET /api/items/:itemId → 상세 / 없는 아이템 → 404", async () => {
    const user = await createUser();
    const ok = await request(app).get("/api/items/5").set(auth(user.token));
    expect(ok.body.data).toEqual({
      itemId: 5, name: "Stage 1 Supreme", stageId: 1, grade: "SUPREME", power: 160, dropRate: 1, sellPrice: 1280,
    });
    const missing = await request(app).get("/api/items/99").set(auth(user.token));
    expect(missing.status).toBe(404);
  });

  test("GET /api/items/recipes → 기본 수수료와 내 수수료", async () => {
    const user = await createUser();
    const res = await request(app).get("/api/items/recipes").set(auth(user.token));
    expect(res.body.data.recipes.map((r) => [r.fromGrade, r.baseFee, r.fee])).toEqual([
      ["COMMON", 10, 10], ["UNCOMMON", 40, 40], ["EPIC", 160, 160], ["ANCIENT", 640, 640],
    ]);
  });
});

// ─────────────────────────────────────────────
// 도감
// ─────────────────────────────────────────────
describe("도감", () => {
  test("GET /api/items/codex, /codex/:stageId → 신규 사용자는 Stage 1 Common만 획득", async () => {
    const user = await createUser();
    const summary = await request(app).get("/api/items/codex").set(auth(user.token));
    expect(summary.body.data.totalRate).toBe(4); // 1/25
    expect(summary.body.data.stages[0]).toEqual({ stageId: 1, collectedCount: 1, completed: false, rewardClaimed: false });

    const detail = await request(app).get("/api/items/codex/1").set(auth(user.token));
    expect(detail.body.data.entries.map((e) => e.acquired)).toEqual([true, false, false, false, false]);
  });

  test("POST /api/items/codex/:stageId/reward → 미완성 400 / 완성 201(골드 200, 단축 5%) / 재수령 409", async () => {
    const user = await createUser();
    const before = await request(app).post("/api/items/codex/1/reward").set(auth(user.token));
    expect(before.status).toBe(400);

    for (const itemId of [2, 3, 4, 5]) await giveItem(user.userId, itemId);
    const ok = await request(app).post("/api/items/codex/1/reward").set(auth(user.token));
    expect(ok.status).toBe(201);
    expect(ok.body.data).toEqual({
      stageId: 1, earnedGold: 200, codexReductionRate: 5, bingoReductionRate: 0, totalReductionRate: 5,
    });

    const again = await request(app).post("/api/items/codex/1/reward").set(auth(user.token));
    expect(again.status).toBe(409);
    expect((await getUser(user.userId)).gold).toBe(200);
  });

  test("없는 스테이지 → 404", async () => {
    const user = await createUser();
    const res = await request(app).post("/api/items/codex/9/reward").set(auth(user.token));
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────
// 빙고
// ─────────────────────────────────────────────
describe("빙고", () => {
  test("GET /api/items/bingo → 5×5 판, 시작 아이템 1칸, 0빙고 (경로가 /:itemId 로 잡히지 않음)", async () => {
    const user = await createUser();
    const res = await request(app).get("/api/items/bingo").set(auth(user.token));
    expect(res.status).toBe(200);
    expect(res.body.data.board).toHaveLength(5);
    expect(res.body.data.board.flat().filter(Boolean)).toHaveLength(1);
    expect(res.body.data).toMatchObject({ filledCount: 1, lineCount: 0, lines: [] });
  });

  test("가로 1줄 완성 → lines [{row, 0}]", async () => {
    const user = await createUser();
    await setBingoCells(user.userId, [0, 1, 2, 3, 4]);
    const res = await request(app).get("/api/items/bingo").set(auth(user.token));
    expect(res.body.data.lines).toEqual([{ type: "row", index: 0 }]);
  });

  test("POST /api/items/bingo/rewards/:threshold → 부족 400 / 1빙고 201 / 재수령 409 / 없는 단계 404", async () => {
    const user = await createUser();
    const short = await request(app).post("/api/items/bingo/rewards/1").set(auth(user.token));
    expect(short.status).toBe(400);

    await setBingoCells(user.userId, [0, 1, 2, 3, 4]);
    const ok = await request(app).post("/api/items/bingo/rewards/1").set(auth(user.token));
    expect(ok.status).toBe(201);
    expect(ok.body.data).toEqual({
      threshold: 1, reductionRate: 10, codexReductionRate: 0, bingoReductionRate: 10, totalReductionRate: 10,
    });

    const again = await request(app).post("/api/items/bingo/rewards/1").set(auth(user.token));
    expect(again.status).toBe(409);

    const noTier = await request(app).post("/api/items/bingo/rewards/2").set(auth(user.token));
    expect(noTier.status).toBe(404);
  });

  test("5빙고 → 1·3·5단계 모두 수령, 빙고 단축 20% / 보상 현황 반영", async () => {
    const user = await createUser();
    await setBingoCells(user.userId, [...Array(25).keys()]); // 꽉 찬 판 = 12빙고
    for (const t of [1, 3, 5]) {
      const res = await request(app).post(`/api/items/bingo/rewards/${t}`).set(auth(user.token));
      expect(res.status).toBe(201);
    }
    const status = await request(app).get("/api/items/bingo/rewards").set(auth(user.token));
    expect(status.body.data.lineCount).toBe(12);
    expect(status.body.data.bingoReductionRate).toBe(20);
    expect(status.body.data.tiers.every((t) => t.achieved && t.claimed)).toBe(true);
  });

  test("도감 25% + 빙고 20% → 합계 45% 상한", async () => {
    const user = await createUser();
    for (let s = 1; s <= 5; s++) await db.query("INSERT INTO codex_rewards (user_id, stage_id) VALUES (?, ?)", [user.userId, s]);
    await setBingoCells(user.userId, [...Array(25).keys()]);
    let last;
    for (const t of [1, 3, 5]) last = await request(app).post(`/api/items/bingo/rewards/${t}`).set(auth(user.token));
    expect(last.body.data).toMatchObject({ codexReductionRate: 25, bingoReductionRate: 20, totalReductionRate: 45 });
  });

  test("합성으로 처음 얻은 아이템도 빙고에 등록", async () => {
    const user = await createUser({ gold: 100 });
    await giveItems(user.userId, 6, 4); // Stage 2 Common 4개
    await request(app).post("/api/items/syntheses").set(auth(user.token)).send({ stageId: 2, grade: "COMMON" });

    const [cells] = await db.query("SELECT item_id FROM user_bingo_cells WHERE user_id = ? ORDER BY item_id", [user.userId]);
    expect(cells.map((c) => c.item_id)).toEqual([1, 6, 7]);
  });
});
