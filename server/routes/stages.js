const express = require("express");
const AppError = require("../utils/AppError");
const { sendSuccess } = require("../utils/response");
const { requireAuth, requireAdmin } = require("../middlewares/auth");
const stageService = require("../services/stageService");

const router = express.Router();

// Stage 라우터의 모든 API는 로그인 필요
router.use(requireAuth);

// :stageId가 양의 정수가 아니면 없는 스테이지로 처리
function parseStageId(req) {
  const stageId = Number(req.params.stageId);
  if (!Number.isInteger(stageId) || stageId < 1) {
    throw new AppError(404, "존재하지 않는 스테이지입니다.");
  }
  return stageId;
}

// 1. 스테이지 목록 조회
router.get("/", async (req, res) => {
  const stages = await stageService.listStages(req.user.userId);
  return sendSuccess(res, { stages });
});

// 2. 스테이지 상세 조회
router.get("/:stageId", async (req, res) => {
  const data = await stageService.getStage(req.user.userId, parseStageId(req));
  return sendSuccess(res, data);
});

// 3. 진입 조건 조회
router.get("/:stageId/requirements", async (req, res) => {
  const data = await stageService.getRequirements(req.user.userId, parseStageId(req));
  return sendSuccess(res, data);
});

// 4. 드롭 테이블 조회
router.get("/:stageId/drops", async (req, res) => {
  const drops = await stageService.getDrops(parseStageId(req));
  return sendSuccess(res, { drops });
});

// 5. 스테이지 해금 (핵심 API)
router.post("/:stageId/unlock", async (req, res) => {
  const data = await stageService.unlockStage(req.user.userId, parseStageId(req));
  return sendSuccess(res, data, 201);
});

// 6. 최초 탐사 보상 수령
router.post("/:stageId/first-clear-reward", async (req, res) => {
  const data = await stageService.claimFirstClearReward(req.user.userId, parseStageId(req));
  return sendSuccess(res, data, 201);
});

// 7. [관리자] 스테이지 수정
router.patch("/:stageId", requireAdmin, async (req, res) => {
  const stageId = parseStageId(req);
  const { name, requiredPower, baseDurationSec } = req.body || {};

  if (name === undefined && requiredPower === undefined && baseDurationSec === undefined) {
    throw new AppError(400, "수정할 값(name, requiredPower, baseDurationSec)이 없습니다.");
  }
  if (name !== undefined && (typeof name !== "string" || name.trim() === "" || name.length > 30)) {
    throw new AppError(400, "name은 1~30자 문자열이어야 합니다.");
  }
  for (const [key, value] of Object.entries({ requiredPower, baseDurationSec })) {
    if (value !== undefined && (!Number.isInteger(value) || value < 1)) {
      throw new AppError(400, `${key}는 1 이상의 정수여야 합니다.`);
    }
  }

  const data = await stageService.updateStage(stageId, { name, requiredPower, baseDurationSec });
  return sendSuccess(res, data);
});

module.exports = router;
