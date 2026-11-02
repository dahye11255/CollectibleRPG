const express = require("express");
const { sendSuccess } = require("../utils/response");

const router = express.Router();

// 서버 동작 확인용
router.get("/health", (req, res) => sendSuccess(res, { status: "ok" }));

// 라우터는 구현하면서 여기에 하나씩 연결한다.
// router.use("/auth", require("./auth"));
// router.use("/stages", require("./stages"));
// router.use("/battles", require("./battles"));
// router.use("/items", require("./items"));
// router.use("/characters", require("./characters"));

module.exports = router;
