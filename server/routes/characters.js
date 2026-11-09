const express = require("express");
const AppError = require("../utils/AppError");
const { sendSuccess } = require("../utils/response");
const { requireAuth } = require("../middlewares/auth");
const { parseIdParam, parseOptionalInt, parseOptionalGrade } = require("../utils/validate");
const characterService = require("../services/characterService");

const router = express.Router();

// Character 라우터의 모든 API는 로그인 필요 (기본 경로 /api/characters/me)
router.use(requireAuth);

// 1. 캐릭터 상태 조회
router.get("/me", async (req, res) => {
  return sendSuccess(res, await characterService.getStatus(req.user.userId));
});

// 2. 능력치 조회
router.get("/me/stats", async (req, res) => {
  return sendSuccess(res, await characterService.getStats(req.user.userId));
});

// 3. 인벤토리 조회 (?stageId=&grade=)
router.get("/me/inventory", async (req, res) => {
  const stageId = parseOptionalInt(req.query.stageId, "stageId");
  const grade = parseOptionalGrade(req.query.grade);
  return sendSuccess(res, await characterService.getInventory(req.user.userId, { stageId, grade }));
});

// 4. 인벤토리 확장
router.post("/me/inventory/expansions", async (req, res) => {
  return sendSuccess(res, await characterService.expandInventory(req.user.userId), 201);
});

// 5. 아이템 판매
router.delete("/me/inventory/:userItemId", async (req, res) => {
  const userItemId = parseIdParam(req.params.userItemId, "아이템");
  return sendSuccess(res, await characterService.sellItem(req.user.userId, userItemId));
});

// 6. 장비 장착 (핵심 API)
router.put("/me/equipment", async (req, res) => {
  const userItemId = Number(req.body?.userItemId);
  if (!Number.isInteger(userItemId) || userItemId < 1) {
    throw new AppError(400, "userItemId(보유 아이템 번호)가 필요합니다.");
  }
  return sendSuccess(res, await characterService.equipItem(req.user.userId, userItemId));
});

// 7. 장비 해제
router.delete("/me/equipment", async (req, res) => {
  return sendSuccess(res, await characterService.unequipItem(req.user.userId));
});

module.exports = router;
