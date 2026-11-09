// Auth 라우터 테스트 (실제 MySQL 사용: 먼저 npm run db:init 으로 DB를 준비해야 함)
const request = require("supertest");
const app = require("../app");
const { db, cleanup } = require("./helpers/dbHelper");

// 실행마다 다른 아이디를 써서 기존 데이터와 겹치지 않게 한다
const suffix = Date.now().toString(36).slice(-6);
const newUser = { loginId: `auth${suffix}`, password: "password123", nickname: "용사" };

afterAll(async () => {
  await db.query("UPDATE users SET equipped_user_item_id = NULL WHERE login_id LIKE ?", [`auth${suffix}%`]);
  await db.query("DELETE FROM users WHERE login_id LIKE ?", [`auth${suffix}%`]);
  await cleanup();
});

describe("POST /api/auth/register", () => {
  test("정상 가입 → 201, 기본 장비 지급·장착, Stage 1 해금, 도감·빙고 등록", async () => {
    const res = await request(app).post("/api/auth/register").send(newUser);

    expect(res.status).toBe(201);
    expect(res.body.result).toBe("success");
    expect(res.body.data.starterItem.name).toBe("Stage 1 Common");

    const { userId } = res.body.data;
    const [[user]] = await db.query("SELECT equipped_user_item_id FROM users WHERE id = ?", [userId]);
    expect(user.equipped_user_item_id).toBe(res.body.data.starterItem.userItemId);

    const [unlocks] = await db.query("SELECT stage_id FROM stage_unlocks WHERE user_id = ?", [userId]);
    expect(unlocks.map((u) => u.stage_id)).toEqual([1]);

    const [codex] = await db.query("SELECT item_id FROM user_codex WHERE user_id = ?", [userId]);
    expect(codex.map((c) => c.item_id)).toEqual([1]);

    const [cells] = await db.query("SELECT item_id FROM user_bingo_cells WHERE user_id = ?", [userId]);
    expect(cells.map((c) => c.item_id)).toEqual([1]);
  });

  test("이미 있는 loginId → 409", async () => {
    const res = await request(app).post("/api/auth/register").send(newUser);
    expect(res.status).toBe(409);
    expect(res.body.result).toBe("fail");
  });

  test("필수값 누락 → 400", async () => {
    const res = await request(app).post("/api/auth/register").send({ loginId: `auth${suffix}x` });
    expect(res.status).toBe(400);
  });

  test("비밀번호 8자 미만 → 400", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...newUser, loginId: `auth${suffix}y`, password: "short" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/login, GET /api/auth/me", () => {
  test("로그인 → 토큰 발급 → 내 정보 조회", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ loginId: newUser.loginId, password: newUser.password });
    expect(login.status).toBe(200);
    expect(login.body.data.token).toBeDefined();

    const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${login.body.data.token}`);
    expect(me.status).toBe(200);
    expect(me.body.data.loginId).toBe(newUser.loginId);
    expect(me.body.data.nickname).toBe("용사");
  });

  test("비밀번호 틀림 → 401", async () => {
    const res = await request(app).post("/api/auth/login").send({ loginId: newUser.loginId, password: "wrongpass" });
    expect(res.status).toBe(401);
  });

  test("없는 아이디 → 401", async () => {
    const res = await request(app).post("/api/auth/login").send({ loginId: "nobody_zz", password: "password123" });
    expect(res.status).toBe(401);
  });

  test("토큰 없이 내 정보 조회 → 401", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });
});
