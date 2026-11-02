const request = require("supertest");
const express = require("express");
const app = require("../app");
const { requireAuth, requireAdmin, signToken } = require("../middlewares/auth");
const { errorHandler } = require("../middlewares/errorHandler");
const { sendSuccess } = require("../utils/response");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

describe("공통 응답·에러 처리", () => {
  test("GET /api/health → 200, success 형식", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ result: "success", data: { status: "ok" } });
  });

  test("없는 경로 → 404, fail 형식", async () => {
    const res = await request(app).get("/api/nothing");
    expect(res.status).toBe(404);
    expect(res.body.result).toBe("fail");
    expect(res.body.error).toBeDefined();
  });

  test("잘못된 JSON 본문 → 400", async () => {
    const res = await request(app)
      .post("/api/health")
      .set("Content-Type", "application/json")
      .send("{bad json");
    expect(res.status).toBe(400);
    expect(res.body.result).toBe("fail");
  });
});

describe("JWT 미들웨어", () => {
  const testApp = express();
  testApp.get("/me", requireAuth, (req, res) => sendSuccess(res, req.user));
  testApp.get("/admin", requireAuth, requireAdmin, (req, res) => sendSuccess(res));
  testApp.use(errorHandler);

  test("토큰 없음 → 401", async () => {
    const res = await request(testApp).get("/me");
    expect(res.status).toBe(401);
  });

  test("잘못된 토큰 → 401", async () => {
    const res = await request(testApp).get("/me").set("Authorization", "Bearer abc");
    expect(res.status).toBe(401);
  });

  test("정상 토큰 → 200, req.user 전달", async () => {
    const token = signToken({ userId: 7, role: "user" });
    const res = await request(testApp).get("/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ userId: 7, role: "user" });
  });

  test("일반 사용자가 관리자 API → 403", async () => {
    const token = signToken({ userId: 7, role: "user" });
    const res = await request(testApp).get("/admin").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
