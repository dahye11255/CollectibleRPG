const express = require("express");
const AppError = require("../utils/AppError");
const { sendSuccess } = require("../utils/response");
const { requireAuth } = require("../middlewares/auth");
const { parseIdParam, parsePaging } = require("../utils/validate");
const battleService = require("../services/battleService");

const router = express.Router();

// Battle 라우터의 모든 API는 로그인 필요
router.use(requireAuth);

const STATUSES = ["IN_PROGRESS", "COMPLETED", "CANCELED"];

// 1. 탐사 시작: body { stageId, repeatCount? (기본 1, 자동 탐사 연구로 최대 5) }
router.post("/", async (req, res) => {
  const { stageId, repeatCount = 1 } = req.body || {};
  if (stageId === undefined) throw new AppError(400, "stageId가 필요합니다.");
  const parsedStageId = Number(stageId);
  if (!Number.isInteger(parsedStageId) || parsedStageId < 1) throw new AppError(400, "stageId는 1 이상의 정수여야 합니다.");
  const parsedRepeat = Number(repeatCount);
  if (!Number.isInteger(parsedRepeat) || parsedRepeat < 1) throw new AppError(400, "repeatCount는 1 이상의 정수여야 합니다.");

  return sendSuccess(res, await battleService.startBattle(req.user.userId, parsedStageId, parsedRepeat), 201);
});

// 7. 탐사 기록 (?page=&size=&status=)
router.get("/", async (req, res) => {
  const paging = parsePaging(req.query);
  let status;
  if (req.query.status !== undefined) {
    status = String(req.query.status).toUpperCase();
    if (!STATUSES.includes(status)) throw new AppError(400, `status는 ${STATUSES.join(", ")} 중 하나여야 합니다.`);
  }
  return sendSuccess(res, await battleService.listBattles(req.user.userId, { ...paging, status }));
});

// 2. 진행 중 탐사 (고정 경로라 /:battleId 보다 먼저 등록)
router.get("/current", async (req, res) => {
  return sendSuccess(res, await battleService.getCurrent(req.user.userId));
});

// 3. 탐사 상세
router.get("/:battleId", async (req, res) => {
  const battleId = parseIdParam(req.params.battleId, "탐사");
  return sendSuccess(res, await battleService.getBattle(req.user.userId, battleId));
});

// 4. 탐사 완료 및 보상 수령 (핵심 API)
router.post("/:battleId/completion", async (req, res) => {
  const battleId = parseIdParam(req.params.battleId, "탐사");
  return sendSuccess(res, await battleService.completeBattle(req.user.userId, battleId), 201);
});

// 5. 골드로 즉시 완료
router.post("/:battleId/instant-completion", async (req, res) => {
  const battleId = parseIdParam(req.params.battleId, "탐사");
  return sendSuccess(res, await battleService.instantComplete(req.user.userId, battleId), 201);
});

// 6. 탐사 취소: body { status: "CANCELED" }
router.patch("/:battleId", async (req, res) => {
  const battleId = parseIdParam(req.params.battleId, "탐사");
  if (req.body?.status !== "CANCELED") throw new AppError(400, 'status는 "CANCELED"만 허용됩니다.');
  return sendSuccess(res, await battleService.cancelBattle(req.user.userId, battleId));
});

module.exports = router;
