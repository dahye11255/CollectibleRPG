const AppError = require("../utils/AppError");
const { sendFail } = require("../utils/response");

// 등록되지 않은 경로
function notFound(req, res, next) {
  next(new AppError(404, `존재하지 않는 API입니다: ${req.method} ${req.originalUrl}`));
}

// 모든 에러를 { result: "fail", error } 형식으로 응답한다.
// Express 5는 async 핸들러에서 throw한 에러도 여기로 전달한다.
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return sendFail(res, err.status, err.message);
  }
  // 잘못된 JSON 본문
  if (err.type === "entity.parse.failed") {
    return sendFail(res, 400, "요청 본문이 올바른 JSON 형식이 아닙니다.");
  }
  console.error(err);
  return sendFail(res, 500, "서버 내부 오류가 발생했습니다.");
}

module.exports = { notFound, errorHandler };
