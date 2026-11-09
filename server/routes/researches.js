const express = require("express");
const AppError = require("../utils/AppError");
const { sendSuccess } = require("../utils/response");
const { requireAuth, requireAdmin } = require("../middlewares/auth");
const { parsePaging } = require("../utils/validate");
const researchService = require("../services/researchService");

const router = express.Router();

// Research(연구소) 라우터의 모든 API는 로그인 필요
router.use(requireAuth);

// 연구 ID: 영문 소문자와 하이픈 (luck, alchemy, trade, chrono, auto-explore)
function parseResearchId(req) {
  const id = String(req.params.researchId);
  if (!/^[a-z-]{1,20}$/.test(id)) throw new AppError(404, "존재하지 않는 연구입니다.");
  return id;
}

// 1. 연구 목록
router.get("/", async (req, res) => {
  return sendSuccess(res, await researchService.listResearches(req.user.userId));
});

// 2. 적용 효과 (고정 경로라 /:researchId 보다 먼저 등록)
router.get("/effects", async (req, res) => {
  return sendSuccess(res, await researchService.getEffects(req.user.userId));
});

// 3. 연구 기록 (?page=&size=)
router.get("/history", async (req, res) => {
  return sendSuccess(res, await researchService.getHistory(req.user.userId, parsePaging(req.query)));
});

// 4. 연구 상세
router.get("/:researchId", async (req, res) => {
  return sendSuccess(res, await researchService.getResearch(req.user.userId, parseResearchId(req)));
});

// 5. 연구 레벨업 (핵심 API)
router.post("/:researchId/upgrades", async (req, res) => {
  return sendSuccess(res, await researchService.upgradeResearch(req.user.userId, parseResearchId(req)), 201);
});

// 6. [관리자] 연구 수치 수정: body { baseCost?, costMultiplier?, effectPerLevel? }
router.patch("/:researchId", requireAdmin, async (req, res) => {
  const researchId = parseResearchId(req);
  const { baseCost, costMultiplier, effectPerLevel } = req.body || {};

  if (baseCost === undefined && costMultiplier === undefined && effectPerLevel === undefined) {
    throw new AppError(400, "수정할 값(baseCost, costMultiplier, effectPerLevel)이 없습니다.");
  }
  if (baseCost !== undefined && (!Number.isInteger(baseCost) || baseCost < 1)) {
    throw new AppError(400, "baseCost는 1 이상의 정수여야 합니다.");
  }
  if (costMultiplier !== undefined && (typeof costMultiplier !== "number" || costMultiplier < 1 || costMultiplier > 10)) {
    throw new AppError(400, "costMultiplier는 1 이상 10 이하의 숫자여야 합니다.");
  }
  if (effectPerLevel !== undefined && (typeof effectPerLevel !== "number" || effectPerLevel <= 0 || effectPerLevel > 100)) {
    throw new AppError(400, "effectPerLevel은 0 초과 100 이하의 숫자여야 합니다.");
  }

  const data = await researchService.updateResearchType(researchId, { baseCost, costMultiplier, effectPerLevel });
  return sendSuccess(res, data);
});

// 7. 연구 초기화 (사용한 골드의 50% 환급)
router.delete("/:researchId", async (req, res) => {
  return sendSuccess(res, await researchService.resetResearch(req.user.userId, parseResearchId(req)));
});

module.exports = router;
