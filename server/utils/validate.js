// 요청 값 검사 도우미 (라우터에서 사용)
const AppError = require("./AppError");
const { GRADES } = require("../services/gameConfig");

// 경로 파라미터: 양의 정수가 아니면 404 (존재할 수 없는 리소스)
function parseIdParam(value, label) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new AppError(404, `존재하지 않는 ${label}입니다.`);
  return id;
}

// 선택 쿼리: 없으면 undefined, 양의 정수가 아니면 400
function parseOptionalInt(value, name) {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new AppError(400, `${name}는 1 이상의 정수여야 합니다.`);
  return n;
}

function parseOptionalGrade(value) {
  if (value === undefined) return undefined;
  const grade = String(value).toUpperCase();
  if (!GRADES.includes(grade)) throw new AppError(400, `grade는 ${GRADES.join(", ")} 중 하나여야 합니다.`);
  return grade;
}

// 페이지 쿼리 (기본 page 1, size 10, 최대 50)
function parsePaging(query) {
  const page = parseOptionalInt(query.page, "page") ?? 1;
  const size = parseOptionalInt(query.size, "size") ?? 10;
  if (size > 50) throw new AppError(400, "size는 50 이하여야 합니다.");
  return { page, size, offset: (page - 1) * size };
}

module.exports = { parseIdParam, parseOptionalInt, parseOptionalGrade, parsePaging };
