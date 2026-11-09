const express = require("express");
const { sendSuccess } = require("../utils/response");

const router = express.Router();

// 서버 동작 확인용
router.get("/health", (req, res) => sendSuccess(res, { status: "ok" }));

// 라우터 연결 (Auth는 회원 관리, 나머지 5개가 과제 인정 라우터)
router.use("/auth", require("./auth"));
router.use("/stages", require("./stages"));
router.use("/battles", require("./battles"));
router.use("/items", require("./items"));
router.use("/characters", require("./characters"));
router.use("/researches", require("./researches"));

module.exports = router;
