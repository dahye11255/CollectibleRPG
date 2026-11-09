// database/schema.sql → seed.sql 순서로 실행해 DB를 초기화한다.
// 실행: npm run db:init   (주의: 기존 데이터가 모두 삭제됨)
require("dotenv").config({ quiet: true });
require("../config/checkEnv")();
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  });

  for (const file of ["schema.sql", "seed.sql"]) {
    const sql = fs.readFileSync(path.join(__dirname, "../../database", file), "utf8");
    await conn.query(sql);
    console.log(`${file} 실행 완료`);
  }

  const [[{ stages }]] = await conn.query("SELECT COUNT(*) AS stages FROM stages");
  const [[{ items }]] = await conn.query("SELECT COUNT(*) AS items FROM items");
  console.log(`확인: stages ${stages}개, items ${items}개`);
  await conn.end();
}

main().catch((err) => {
  console.error("DB 초기화 실패:", err.message);
  process.exit(1);
});
