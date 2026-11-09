const db = require("../db");

// 트랜잭션 안에서 fn(conn)을 실행한다. 성공하면 커밋, 에러가 나면 롤백 후 에러를 그대로 던진다.
// 사용: const result = await withTransaction(async (conn) => { ... return 결과; });
async function withTransaction(fn) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// 사용자 행을 잠근다. 같은 사용자의 골드·인벤토리·빙고를 바꾸는 요청을 한 번에 하나씩 처리하기 위함
async function lockUser(conn, userId) {
  const [[user]] = await conn.query("SELECT * FROM users WHERE id = ? FOR UPDATE", [userId]);
  return user;
}

module.exports = { withTransaction, lockUser };
