// 의도한 실패를 표현하는 에러. 컨트롤러·서비스에서 throw하면 errorHandler가 응답으로 바꾼다.
class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = AppError;
