const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const AppError = require("../utils/AppError");
const { sendSuccess } = require("../utils/response");
const { requireAuth, signToken } = require("../middlewares/auth");

const router = express.Router();

const STARTER_ITEM_ID = 1; // Stage 1 Common
const FIRST_STAGE_ID = 1;

// 회원가입 API: 계정 생성 + Stage 1 Common 지급·자동 장착 + Stage 1 해금
router.post("/register", async (req, res) => {
  const { loginId, password, nickname } = req.body || {};

  if (!loginId || !password || !nickname) {
    throw new AppError(400, "필수값이 누락되었습니다.");
  }
  if (loginId.length < 4 || loginId.length > 20 || password.length < 8) {
    throw new AppError(400, "입력 형식(아이디 4~20자, 비밀번호 8자 이상)을 확인해주세요.");
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [existing] = await conn.query("SELECT id FROM users WHERE login_id = ?", [loginId]);
    if (existing.length > 0) {
      throw new AppError(409, "이미 사용 중인 loginId입니다.");
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [userResult] = await conn.query(
      "INSERT INTO users (login_id, password_hash, nickname) VALUES (?, ?, ?)",
      [loginId, passwordHash, nickname]
    );
    const userId = userResult.insertId;

    // 기본 장비 지급 → 장착 → 도감 기록 → Stage 1 해금
    const [itemResult] = await conn.query(
      "INSERT INTO user_items (user_id, item_id, acquired_from) VALUES (?, ?, 'STARTER')",
      [userId, STARTER_ITEM_ID]
    );
    const userItemId = itemResult.insertId;
    await conn.query("UPDATE users SET equipped_user_item_id = ? WHERE id = ?", [userItemId, userId]);
    await conn.query("INSERT INTO user_codex (user_id, item_id) VALUES (?, ?)", [userId, STARTER_ITEM_ID]);
    await conn.query("INSERT INTO stage_unlocks (user_id, stage_id) VALUES (?, ?)", [userId, FIRST_STAGE_ID]);

    await conn.commit();

    return sendSuccess(
      res,
      { userId, nickname, starterItem: { userItemId, name: "Stage 1 Common" } },
      201
    );
  } catch (err) {
    await conn.rollback();
    // 동시에 같은 ID로 가입한 경우 UNIQUE 제약 위반
    if (err.code === "ER_DUP_ENTRY") throw new AppError(409, "이미 사용 중인 loginId입니다.");
    throw err; // 나머지는 errorHandler가 처리
  } finally {
    conn.release();
  }
});

// 로그인 API
router.post("/login", async (req, res) => {
  const { loginId, password } = req.body || {};

  if (!loginId || !password) {
    throw new AppError(400, "필수값이 누락되었습니다.");
  }

  const [rows] = await db.query(
    "SELECT id, password_hash, role FROM users WHERE login_id = ?",
    [loginId]
  );
  const user = rows[0];
  // 아이디가 없을 때와 비밀번호가 틀릴 때 같은 메시지 (아이디 존재 여부 노출 방지)
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw new AppError(401, "ID 또는 비밀번호가 일치하지 않습니다.");
  }

  const token = signToken({ userId: user.id, role: user.role });
  return sendSuccess(res, { token, userId: user.id });
});

// 내 정보 조회 API
router.get("/me", requireAuth, async (req, res) => {
  const [rows] = await db.query(
    "SELECT id, login_id, nickname FROM users WHERE id = ?",
    [req.user.userId]
  );
  if (rows.length === 0) {
    throw new AppError(401, "존재하지 않는 사용자입니다.");
  }

  const user = rows[0];
  return sendSuccess(res, { userId: user.id, loginId: user.login_id, nickname: user.nickname });
});

module.exports = router;
