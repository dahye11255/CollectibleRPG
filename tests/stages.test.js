// Stage 라우터 테스트 (실제 MySQL 사용: 먼저 npm run db:init 으로 DB를 준비해야 함)
const request = require("supertest");
const app = require("../app");
const { db, createUser, giveItem, equip, addCompletedBattle, cleanup } = require("./helpers/dbHelper");

const STAGE1_SUPREME = 5; // items.id
const auth = (token) => ({ Authorization: `Bearer ${token}` });

afterAll(cleanup);

// ─────────────────────────────────────────────
// 핵심 API: POST /api/stages/:stageId/unlock
// ─────────────────────────────────────────────
describe("POST /api/stages/:stageId/unlock (핵심 API)", () => {
  test("Stage 1 Supreme 장착 → 201, 이후 목록에서 Stage 2 unlocked=true", async () => {
    const user = await createUser();
    await equip(user.userId, await giveItem(user.userId, STAGE1_SUPREME));

    const res = await request(app).post("/api/stages/2/unlock").set(auth(user.token));
    expect(res.status).toBe(201);
    expect(res.body.result).toBe("success");
    expect(res.body.data.stageId).toBe(2);
    expect(res.body.data.unlockedAt).toBeDefined();

    const list = await request(app).get("/api/stages").set(auth(user.token));
    expect(list.body.data.stages.find((s) => s.stageId === 2).unlocked).toBe(true);
  });

  test("Supreme을 갖고만 있고 장착하지 않음 → 403 (Supreme Door-lock)", async () => {
    const user = await createUser();
    await giveItem(user.userId, STAGE1_SUPREME); // 보유만 함

    const res = await request(app).post("/api/stages/2/unlock").set(auth(user.token));
    expect(res.status).toBe(403);
    expect(res.body.result).toBe("fail");
  });

  test("이미 해금한 스테이지 → 409", async () => {
    const user = await createUser();
    await equip(user.userId, await giveItem(user.userId, STAGE1_SUPREME));
    await request(app).post("/api/stages/2/unlock").set(auth(user.token));

    const res = await request(app).post("/api/stages/2/unlock").set(auth(user.token));
    expect(res.status).toBe(409);
  });

  test("해금 후 장비를 바꿔도 해금은 유지됨 (영구 해금)", async () => {
    const user = await createUser();
    await equip(user.userId, await giveItem(user.userId, STAGE1_SUPREME));
    await request(app).post("/api/stages/2/unlock").set(auth(user.token));
    await equip(user.userId, await giveItem(user.userId, 1)); // Stage 1 Common으로 교체

    const res = await request(app).get("/api/stages/2").set(auth(user.token));
    expect(res.body.data.unlocked).toBe(true);
  });

  test("없는 스테이지 → 404", async () => {
    const user = await createUser();
    const res = await request(app).post("/api/stages/99/unlock").set(auth(user.token));
    expect(res.status).toBe(404);
  });

  test("토큰 없음 → 401", async () => {
    const res = await request(app).post("/api/stages/2/unlock");
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────
// 조회 API
// ─────────────────────────────────────────────
describe("Stage 조회 API", () => {
  test("GET /api/stages → 5개, 신규 사용자는 Stage 1만 해금", async () => {
    const user = await createUser();
    const res = await request(app).get("/api/stages").set(auth(user.token));

    expect(res.status).toBe(200);
    expect(res.body.data.stages).toHaveLength(5);
    expect(res.body.data.stages.map((s) => s.unlocked)).toEqual([true, false, false, false, false]);
  });

  test("GET /api/stages/:stageId → 상세와 아이템 5종 (등급 순)", async () => {
    const user = await createUser();
    const res = await request(app).get("/api/stages/1").set(auth(user.token));

    expect(res.status).toBe(200);
    expect(res.body.data.items.map((i) => i.grade)).toEqual(["COMMON", "UNCOMMON", "EPIC", "ANCIENT", "SUPREME"]);
  });

  test("GET /api/stages/abc → 404", async () => {
    const user = await createUser();
    const res = await request(app).get("/api/stages/abc").set(auth(user.token));
    expect(res.status).toBe(404);
  });

  test("GET /api/stages/:stageId/requirements → Supreme 장착 전후 canUnlock 변화", async () => {
    const user = await createUser();
    const before = await request(app).get("/api/stages/2/requirements").set(auth(user.token));
    expect(before.body.data.requiredItem.name).toBe("Stage 1 Supreme");
    expect(before.body.data.canUnlock).toBe(false);

    await equip(user.userId, await giveItem(user.userId, STAGE1_SUPREME));
    const after = await request(app).get("/api/stages/2/requirements").set(auth(user.token));
    expect(after.body.data.equippedOk).toBe(true);
    expect(after.body.data.canUnlock).toBe(true);
  });

  test("GET /api/stages/:stageId/drops → 확률 합계 100%", async () => {
    const user = await createUser();
    const res = await request(app).get("/api/stages/1/drops").set(auth(user.token));

    expect(res.status).toBe(200);
    expect(res.body.data.drops.map((d) => d.rate)).toEqual([50, 25, 15, 9, 1]);
  });
});

// ─────────────────────────────────────────────
// 최초 탐사 보상
// ─────────────────────────────────────────────
describe("POST /api/stages/:stageId/first-clear-reward", () => {
  test("탐사 완료 기록 없음 → 400", async () => {
    const user = await createUser();
    const res = await request(app).post("/api/stages/1/first-clear-reward").set(auth(user.token));
    expect(res.status).toBe(400);
  });

  test("탐사 완료 후 수령 → 201, 골드 지급 / 두 번째 → 409, 골드 그대로", async () => {
    const user = await createUser();
    await addCompletedBattle(user.userId, 1);

    const first = await request(app).post("/api/stages/1/first-clear-reward").set(auth(user.token));
    expect(first.status).toBe(201);
    expect(first.body.data).toEqual({ stageId: 1, earnedGold: 100, gold: 100 });

    const second = await request(app).post("/api/stages/1/first-clear-reward").set(auth(user.token));
    expect(second.status).toBe(409);

    const [[row]] = await db.query("SELECT gold FROM users WHERE id = ?", [user.userId]);
    expect(row.gold).toBe(100);
  });
});

// ─────────────────────────────────────────────
// 관리자 수정
// ─────────────────────────────────────────────
describe("PATCH /api/stages/:stageId (관리자)", () => {
  test("일반 사용자 → 403", async () => {
    const user = await createUser();
    const res = await request(app).patch("/api/stages/5").set(auth(user.token)).send({ requiredPower: 90 });
    expect(res.status).toBe(403);
  });

  test("관리자 → 200, 값 변경 (테스트 후 원래 값으로 복구)", async () => {
    const admin = await createUser({ role: "admin" });
    const [[original]] = await db.query("SELECT required_power FROM stages WHERE id = 5");

    const res = await request(app).patch("/api/stages/5").set(auth(admin.token)).send({ requiredPower: 90 });
    expect(res.status).toBe(200);
    const [[changed]] = await db.query("SELECT required_power FROM stages WHERE id = 5");
    expect(changed.required_power).toBe(90);

    await db.query("UPDATE stages SET required_power = ? WHERE id = 5", [original.required_power]);
  });

  test("수정할 값 없음 → 400, 잘못된 값 → 400", async () => {
    const admin = await createUser({ role: "admin" });
    const empty = await request(app).patch("/api/stages/5").set(auth(admin.token)).send({});
    expect(empty.status).toBe(400);

    const invalid = await request(app).patch("/api/stages/5").set(auth(admin.token)).send({ requiredPower: -1 });
    expect(invalid.status).toBe(400);
  });
});
