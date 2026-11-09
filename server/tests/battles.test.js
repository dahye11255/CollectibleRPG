// Battle(탐사) 라우터 테스트 (실제 MySQL 사용: 먼저 npm run db:init 으로 DB를 준비해야 함)
// 시간은 기다리지 않고 rewindBattle로 탐사 시각을 과거로 당겨서 만든다.
const request = require("supertest");
const app = require("../app");
const { setRandomSource } = require("../services/dropService");
const { db, createUser, getUser, setGold, rewindBattle, cleanup } = require("./helpers/dbHelper");

const auth = (token) => ({ Authorization: `Bearer ${token}` });

const start = (user, body = { stageId: 1 }) => request(app).post("/api/battles").set(auth(user.token)).send(body);
const complete = (user, id) => request(app).post(`/api/battles/${id}/completion`).set(auth(user.token));

afterEach(() => setRandomSource(null)); // 드롭 난수 원래대로
afterAll(cleanup);

// ─────────────────────────────────────────────
// 핵심 API: POST /api/battles/:battleId/completion
// ─────────────────────────────────────────────
describe("POST /api/battles/:battleId/completion (핵심 API)", () => {
  test("종료 시각 이후 → 201, 아이템 1개·골드 10 지급, COMPLETED", async () => {
    const user = await createUser();
    const { body } = await start(user);
    await rewindBattle(body.data.battleId, 60);

    const res = await complete(user, body.data.battleId);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ earnedGold: 10, gold: 10, repeatDone: 1, repeatTotal: 1, status: "COMPLETED" });
    expect(res.body.data.settledRounds).toHaveLength(1);
    expect(res.body.data.settledRounds[0].item.name).toMatch(/^Stage 1 /);

    const [items] = await db.query("SELECT COUNT(*) AS n FROM user_items WHERE user_id = ?", [user.userId]);
    expect(items[0].n).toBe(2); // 시작 장비 + 보상
  });

  test("종료 시각 전 → 400, 보상 없음", async () => {
    const user = await createUser();
    const { body } = await start(user);
    const res = await complete(user, body.data.battleId);
    expect(res.status).toBe(400);
    expect((await getUser(user.userId)).gold).toBe(0);
  });

  test("같은 탐사 두 번 완료 → 409 (중복 지급 없음)", async () => {
    const user = await createUser();
    const { body } = await start(user);
    await rewindBattle(body.data.battleId, 60);
    await complete(user, body.data.battleId);

    const again = await complete(user, body.data.battleId);
    expect(again.status).toBe(409);
    expect((await getUser(user.userId)).gold).toBe(10);
  });

  test("동시에 완료 요청 2건 → 1건만 성공", async () => {
    const user = await createUser();
    const { body } = await start(user);
    await rewindBattle(body.data.battleId, 60);

    const results = await Promise.all([complete(user, body.data.battleId), complete(user, body.data.battleId)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await getUser(user.userId)).gold).toBe(10);
  });

  test("인벤토리가 가득 차서 1회차도 정산 불가 → 409", async () => {
    const user = await createUser();
    const { body } = await start(user);
    await db.query("UPDATE users SET inventory_slots = 1 WHERE id = ?", [user.userId]); // 시작 장비로 가득 참
    await rewindBattle(body.data.battleId, 60);

    const res = await complete(user, body.data.battleId);
    expect(res.status).toBe(409);
  });

  test("연속 3회 중 2회차까지만 끝남 → 2회 정산, IN_PROGRESS 유지 → 나머지 끝난 뒤 COMPLETED", async () => {
    const user = await createUser();
    await db.query("INSERT INTO user_researches (user_id, research_id, level) VALUES (?, 'auto-explore', 2)", [user.userId]);
    const { body } = await start(user, { stageId: 1, repeatCount: 3 });
    expect(body.data.repeatTotal).toBe(3);

    await rewindBattle(body.data.battleId, 125); // 60초 × 2회 + 5초
    const first = await complete(user, body.data.battleId);
    expect(first.body.data).toMatchObject({ repeatDone: 2, status: "IN_PROGRESS" });
    expect(first.body.data.settledRounds.map((r) => r.roundNo)).toEqual([1, 2]);

    await rewindBattle(body.data.battleId, 60);
    const second = await complete(user, body.data.battleId);
    expect(second.body.data).toMatchObject({ repeatDone: 3, status: "COMPLETED" });
    expect(second.body.data.settledRounds.map((r) => r.roundNo)).toEqual([3]);
  });

  test("인벤토리 빈칸이 1칸뿐이면 1회차만 정산하고 멈춤 (stoppedByInventory)", async () => {
    const user = await createUser();
    await db.query("INSERT INTO user_researches (user_id, research_id, level) VALUES (?, 'auto-explore', 1)", [user.userId]);
    const { body } = await start(user, { stageId: 1, repeatCount: 2 });
    await db.query("UPDATE users SET inventory_slots = 2 WHERE id = ?", [user.userId]);
    await rewindBattle(body.data.battleId, 120);

    const res = await complete(user, body.data.battleId);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ repeatDone: 1, status: "IN_PROGRESS", stoppedByInventory: true });
  });

  test("교역 Lv5(+50%) → 회차 골드 15 / 드롭 난수 고정 → Supreme 획득·도감·빙고 등록", async () => {
    const user = await createUser();
    await db.query("INSERT INTO user_researches (user_id, research_id, level) VALUES (?, 'trade', 5)", [user.userId]);
    setRandomSource(() => 0.995); // 상위 1% → SUPREME
    const { body } = await start(user);
    await rewindBattle(body.data.battleId, 60);

    const res = await complete(user, body.data.battleId);
    const round = res.body.data.settledRounds[0];
    expect(round).toMatchObject({ gold: 15, newCodex: true, item: { name: "Stage 1 Supreme" } });
    expect(round.bingoCellIndex).toEqual(expect.any(Number));
  });

  test("다른 사용자의 탐사 → 404 / 토큰 없음 → 401", async () => {
    const owner = await createUser();
    const other = await createUser();
    const { body } = await start(owner);

    expect((await complete(other, body.data.battleId)).status).toBe(404);
    expect((await request(app).post(`/api/battles/${body.data.battleId}/completion`)).status).toBe(401);
  });
});

// ─────────────────────────────────────────────
// 탐사 시작
// ─────────────────────────────────────────────
describe("POST /api/battles (탐사 시작)", () => {
  test("정상 시작 → 201, 단축률 0이면 60초", async () => {
    const user = await createUser();
    const res = await start(user);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ stageId: 1, status: "IN_PROGRESS", repeatTotal: 1, durationSec: 60, appliedReductionRate: 0 });
  });

  test("단축률 15%(도감 5 + 빙고 10) → ceil(60 × 0.85) = 51초", async () => {
    const user = await createUser();
    await db.query("INSERT INTO codex_rewards (user_id, stage_id) VALUES (?, 1)", [user.userId]);
    await db.query("INSERT INTO bingo_rewards (user_id, threshold) VALUES (?, 1)", [user.userId]);
    const res = await start(user);
    expect(res.body.data).toMatchObject({ durationSec: 51, appliedReductionRate: 15 });
  });

  test("이미 진행 중 → 409 / 동시에 2번 시작 → 1번만 성공", async () => {
    const user = await createUser();
    const results = await Promise.all([start(user), start(user)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await start(user)).status).toBe(409);
  });

  test("장비 없음 → 400 / 전투력 부족 → 403 / 미해금 → 403 / 없는 스테이지 → 404 / stageId 누락 → 400", async () => {
    const user = await createUser();
    expect((await start(user, { stageId: 2 })).status).toBe(403); // 미해금
    expect((await start(user, { stageId: 99 })).status).toBe(404);
    expect((await start(user, {})).status).toBe(400);

    await db.query("INSERT INTO stage_unlocks (user_id, stage_id) VALUES (?, 2)", [user.userId]);
    expect((await start(user, { stageId: 2 })).status).toBe(403); // 전투력 10 < 20

    await db.query("UPDATE users SET equipped_user_item_id = NULL WHERE id = ?", [user.userId]);
    expect((await start(user)).status).toBe(400);
  });

  test("연구 없이 repeatCount 2 → 400 / repeatCount 0 → 400", async () => {
    const user = await createUser();
    expect((await start(user, { stageId: 1, repeatCount: 2 })).status).toBe(400);
    expect((await start(user, { stageId: 1, repeatCount: 0 })).status).toBe(400);
  });

  test("인벤토리 가득 참 → 409", async () => {
    const user = await createUser();
    await db.query("UPDATE users SET inventory_slots = 1 WHERE id = ?", [user.userId]);
    expect((await start(user)).status).toBe(409);
  });
});

// ─────────────────────────────────────────────
// 조회·즉시 완료·취소
// ─────────────────────────────────────────────
describe("조회·즉시 완료·취소", () => {
  test("GET /api/battles/current → 진행 중 탐사, 없으면 null", async () => {
    const user = await createUser();
    const none = await request(app).get("/api/battles/current").set(auth(user.token));
    expect(none.body.data.battle).toBeNull();

    await start(user);
    const res = await request(app).get("/api/battles/current").set(auth(user.token));
    expect(res.body.data.battle).toMatchObject({ repeatTotal: 1, repeatDone: 0, settleableRounds: 0 });
    expect(res.body.data.battle.remainingSec).toBeGreaterThan(55);
  });

  test("POST /instant-completion → 남은 60초 = 6골드, 즉시 보상 / 골드 부족 → 400", async () => {
    const user = await createUser();
    const { body } = await start(user);
    const poor = await request(app).post(`/api/battles/${body.data.battleId}/instant-completion`).set(auth(user.token));
    expect(poor.status).toBe(400);

    await setGold(user.userId, 100);
    const res = await request(app).post(`/api/battles/${body.data.battleId}/instant-completion`).set(auth(user.token));
    expect(res.status).toBe(201);
    expect(res.body.data.spentGold).toBeLessThanOrEqual(6);
    expect(res.body.data).toMatchObject({ status: "COMPLETED", earnedGold: 10 });
    expect(res.body.data.gold).toBe(100 - res.body.data.spentGold + 10);
  });

  test("PATCH /:battleId 취소 → 끝난 회차는 정산, 남은 회차는 취소 / 다시 취소 → 409 / 잘못된 status → 400", async () => {
    const user = await createUser();
    await db.query("INSERT INTO user_researches (user_id, research_id, level) VALUES (?, 'auto-explore', 2)", [user.userId]);
    const { body } = await start(user, { stageId: 1, repeatCount: 3 });
    await rewindBattle(body.data.battleId, 65); // 1회차만 끝남

    const bad = await request(app).patch(`/api/battles/${body.data.battleId}`).set(auth(user.token)).send({ status: "DONE" });
    expect(bad.status).toBe(400);

    const res = await request(app).patch(`/api/battles/${body.data.battleId}`).set(auth(user.token)).send({ status: "CANCELED" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: "CANCELED", canceledRounds: 2 });
    expect(res.body.data.settledRounds).toHaveLength(1);

    const again = await request(app).patch(`/api/battles/${body.data.battleId}`).set(auth(user.token)).send({ status: "CANCELED" });
    expect(again.status).toBe(409);
  });

  test("GET /:battleId 상세(회차 보상) / GET /api/battles 기록(최신순, 필터)", async () => {
    const user = await createUser();
    const { body } = await start(user);
    await rewindBattle(body.data.battleId, 60);
    await complete(user, body.data.battleId);
    await start(user);

    const detail = await request(app).get(`/api/battles/${body.data.battleId}`).set(auth(user.token));
    expect(detail.body.data.rewards).toHaveLength(1);

    const list = await request(app).get("/api/battles").set(auth(user.token));
    expect(list.body.data.total).toBe(2);
    expect(list.body.data.battles[0].status).toBe("IN_PROGRESS");

    const done = await request(app).get("/api/battles?status=completed").set(auth(user.token));
    expect(done.body.data.total).toBe(1);

    expect((await request(app).get("/api/battles?status=WRONG").set(auth(user.token))).status).toBe(400);
  });

  test("탐사 완료 후 최초 탐사 보상(Stage) 수령 가능", async () => {
    const user = await createUser();
    const { body } = await start(user);
    await rewindBattle(body.data.battleId, 60);
    await complete(user, body.data.battleId);

    const res = await request(app).post("/api/stages/1/first-clear-reward").set(auth(user.token));
    expect(res.status).toBe(201);
  });
});
