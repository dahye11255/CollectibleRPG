// Auth 라우터 테스트: 실제 MySQL 대신 가짜 db를 넣어 로직만 검증한다.
process.env.JWT_SECRET = "test-secret";

const bcrypt = require("bcryptjs");

// 가짜 DB 상태
const mockDb = { users: [], userItems: [], codex: [], unlocks: [] };

function mockRunQuery(sql, params) {
  if (sql.startsWith("SELECT id FROM users WHERE login_id")) {
    return [mockDb.users.filter((u) => u.login_id === params[0]).map((u) => ({ id: u.id }))];
  }
  if (sql.startsWith("INSERT INTO users")) {
    const user = { id: mockDb.users.length + 1, login_id: params[0], password_hash: params[1], nickname: params[2], role: "user" };
    mockDb.users.push(user);
    return [{ insertId: user.id }];
  }
  if (sql.startsWith("INSERT INTO user_items")) {
    mockDb.userItems.push({ id: mockDb.userItems.length + 1, user_id: params[0], item_id: params[1] });
    return [{ insertId: mockDb.userItems.length }];
  }
  if (sql.startsWith("UPDATE users SET equipped_user_item_id")) {
    mockDb.users.find((u) => u.id === params[1]).equipped_user_item_id = params[0];
    return [{ affectedRows: 1 }];
  }
  if (sql.startsWith("INSERT INTO user_codex")) { mockDb.codex.push(params); return [{}]; }
  if (sql.startsWith("INSERT INTO stage_unlocks")) { mockDb.unlocks.push(params); return [{}]; }
  if (sql.startsWith("SELECT id, password_hash, role FROM users")) {
    return [mockDb.users.filter((u) => u.login_id === params[0])];
  }
  if (sql.startsWith("SELECT id, login_id, nickname FROM users")) {
    return [mockDb.users.filter((u) => u.id === params[0])];
  }
  throw new Error("테스트에 정의되지 않은 쿼리: " + sql);
}

jest.mock("../db", () => {
  const conn = {
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
    query: jest.fn(async (sql, params) => mockRunQuery(sql, params)),
  };
  return {
    conn,
    getConnection: jest.fn(async () => conn),
    query: jest.fn(async (sql, params) => mockRunQuery(sql, params)),
  };
});

const request = require("supertest");
const app = require("../app");
const db = require("../db");

beforeEach(() => {
  mockDb.users = [];
  mockDb.userItems = [];
  mockDb.codex = [];
  mockDb.unlocks = [];
  jest.clearAllMocks();
});

const newUser = { loginId: "hero01", password: "password123", nickname: "용사" };

describe("POST /api/auth/register", () => {
  test("정상 가입 → 201, 기본 장비 지급·장착, Stage 1 해금", async () => {
    const res = await request(app).post("/api/auth/register").send(newUser);

    expect(res.status).toBe(201);
    expect(res.body.result).toBe("success");
    expect(res.body.data.starterItem.name).toBe("Stage 1 Common");
    expect(mockDb.users[0].equipped_user_item_id).toBe(res.body.data.starterItem.userItemId);
    expect(mockDb.unlocks).toEqual([[1, 1]]);
    expect(await bcrypt.compare("password123", mockDb.users[0].password_hash)).toBe(true);
    expect(db.conn.commit).toHaveBeenCalled();
  });

  test("이미 있는 loginId → 409, 롤백", async () => {
    await request(app).post("/api/auth/register").send(newUser);
    const res = await request(app).post("/api/auth/register").send(newUser);

    expect(res.status).toBe(409);
    expect(res.body.result).toBe("fail");
    expect(db.conn.rollback).toHaveBeenCalled();
    expect(db.conn.release).toHaveBeenCalledTimes(2);
  });

  test("필수값 누락 → 400", async () => {
    const res = await request(app).post("/api/auth/register").send({ loginId: "hero01" });
    expect(res.status).toBe(400);
  });

  test("비밀번호 8자 미만 → 400", async () => {
    const res = await request(app).post("/api/auth/register").send({ ...newUser, password: "short" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/login, GET /api/auth/me", () => {
  test("로그인 → 토큰 발급 → 내 정보 조회", async () => {
    await request(app).post("/api/auth/register").send(newUser);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ loginId: "hero01", password: "password123" });
    expect(login.status).toBe(200);
    expect(login.body.data.token).toBeDefined();

    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${login.body.data.token}`);
    expect(me.status).toBe(200);
    expect(me.body.data).toEqual({ userId: 1, loginId: "hero01", nickname: "용사" });
  });

  test("비밀번호 틀림 → 401", async () => {
    await request(app).post("/api/auth/register").send(newUser);
    const res = await request(app)
      .post("/api/auth/login")
      .send({ loginId: "hero01", password: "wrongpass" });
    expect(res.status).toBe(401);
  });

  test("없는 아이디 → 401", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ loginId: "nobody", password: "password123" });
    expect(res.status).toBe(401);
  });

  test("토큰 없이 내 정보 조회 → 401", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });
});
