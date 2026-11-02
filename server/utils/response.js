// 모든 성공 응답은 { result: "success", data } 형식으로 통일한다.
function sendSuccess(res, data = {}, status = 200) {
  return res.status(status).json({ result: "success", data });
}

// 실패 응답은 { result: "fail", error } 형식으로 통일한다.
function sendFail(res, status, error) {
  return res.status(status).json({ result: "fail", error });
}

module.exports = { sendSuccess, sendFail };
