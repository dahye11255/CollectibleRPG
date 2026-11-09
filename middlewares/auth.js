const jwt = require("jsonwebtoken");
const AppError = require("../utils/AppError");

// Authorization: Bearer <토큰> 을 검사하고 req.user에 { userId, role }을 넣는다.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return next(new AppError(401, "로그인이 필요합니다."));
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { userId: payload.userId, role: payload.role };
    return next();
  } catch (e) {
    return next(new AppError(401, "토큰이 유효하지 않거나 만료되었습니다."));
  }
}

// 관리자 전용 API (requireAuth 뒤에 사용)
function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return next(new AppError(403, "관리자만 사용할 수 있습니다."));
  }
  return next();
}

// 로그인 성공 시 토큰 발급용
function signToken(user) {
  return jwt.sign(
    { userId: user.userId, role: user.role || "user" },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "1d" }
  );
}

module.exports = { requireAuth, requireAdmin, signToken };
