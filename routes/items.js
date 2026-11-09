const express = require("express");
const AppError = require("../utils/AppError");
const { sendSuccess } = require("../utils/response");
const { requireAuth } = require("../middlewares/auth");
const { parseIdParam, parseOptionalInt, parseOptionalGrade } = require("../utils/validate");
const itemService = require("../services/itemService");
const bingoService = require("../services/bingoService");

const router = express.Router();

// Item 라우터의 모든 API는 로그인 필요
router.use(requireAuth);

// ⚠️ 경로 순서 주의: /codex, /recipes, /bingo 같은 고정 경로를 /:itemId 보다 먼저 등록해야 한다.
//    (/:itemId 가 먼저 있으면 "/items/bingo" 를 itemId = "bingo" 로 해석함)

// 1. 전체 아이템 목록 (?stageId=&grade=)
router.get("/", async (req, res) => {
  const stageId = parseOptionalInt(req.query.stageId, "stageId");
  const grade = parseOptionalGrade(req.query.grade);
  return sendSuccess(res, { items: await itemService.listItems({ stageId, grade }) });
});

// ───────────── 도감 ─────────────

// 3. 도감 수집률 조회
router.get("/codex", async (req, res) => {
  return sendSuccess(res, await itemService.getCodexSummary(req.user.userId));
});

// 4. 스테이지별 도감 상세
router.get("/codex/:stageId", async (req, res) => {
  const stageId = parseIdParam(req.params.stageId, "스테이지");
  return sendSuccess(res, await itemService.getCodexStage(req.user.userId, stageId));
});

// 5. 도감 보상 수령
router.post("/codex/:stageId/reward", async (req, res) => {
  const stageId = parseIdParam(req.params.stageId, "스테이지");
  return sendSuccess(res, await itemService.claimCodexReward(req.user.userId, stageId), 201);
});

// ───────────── 합성 ─────────────

// 6. 합성 규칙 조회
router.get("/recipes", async (req, res) => {
  return sendSuccess(res, { recipes: await itemService.getRecipes(req.user.userId) });
});

// 7. 아이템 합성 (핵심 API): body { stageId, grade }
router.post("/syntheses", async (req, res) => {
  const { stageId, grade } = req.body || {};
  if (stageId === undefined || grade === undefined) {
    throw new AppError(400, "stageId와 grade(재료 등급)가 필요합니다.");
  }
  const parsedStageId = Number(stageId);
  if (!Number.isInteger(parsedStageId) || parsedStageId < 1) {
    throw new AppError(400, "stageId는 1 이상의 정수여야 합니다.");
  }
  const parsedGrade = parseOptionalGrade(grade);
  return sendSuccess(res, await itemService.synthesize(req.user.userId, parsedStageId, parsedGrade), 201);
});

// ───────────── 빙고 ─────────────

// 8. 빙고판 조회
router.get("/bingo", async (req, res) => {
  return sendSuccess(res, await bingoService.getBoard(req.user.userId));
});

// 9. 빙고 보상 현황
router.get("/bingo/rewards", async (req, res) => {
  return sendSuccess(res, await bingoService.getRewardStatus(req.user.userId));
});

// 10. 빙고 보상 수령 (1·3·5빙고)
router.post("/bingo/rewards/:threshold", async (req, res) => {
  const threshold = parseIdParam(req.params.threshold, "보상 단계");
  return sendSuccess(res, await bingoService.claimReward(req.user.userId, threshold), 201);
});

// ───────────── 마지막: 아이템 상세 ─────────────

// 2. 아이템 상세 (고정 경로들보다 뒤에 둔다)
router.get("/:itemId", async (req, res) => {
  const itemId = parseIdParam(req.params.itemId, "아이템");
  return sendSuccess(res, await itemService.getItem(itemId));
});

module.exports = router;
