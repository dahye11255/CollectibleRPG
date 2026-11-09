require("dotenv").config({ quiet: true });

const express = require("express");
const cors = require("cors");
const apiRouter = require("./routes");
const { notFound, errorHandler } = require("./middlewares/errorHandler");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api", apiRouter);

app.use(notFound);
app.use(errorHandler);

// 테스트(Supertest)에서 서버를 띄우지 않고 쓰기 위해 app만 내보낸다.
module.exports = app;
