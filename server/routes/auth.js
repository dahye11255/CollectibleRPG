const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken } = require('../middlewares/auth');

const router = express.Router();

router.post('/signup', async (req, res, next) => {
  try {
    const { login_id, password, nickname } = req.body;
    const password_hash = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO users (login_id, password_hash, nickname) VALUES (?, ?, ?)',
      [login_id, password_hash, nickname]
    );
    return res.status(201).json({ result: 'success', data: { userId: result.insertId } });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ result: 'fail', error: '이미 존재하는 아이디입니다.' });
    }
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { login_id, password } = req.body;
    const [rows] = await db.query('SELECT * FROM users WHERE login_id = ?', [login_id]);
    const user = rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ result: 'fail', error: '아이디 또는 비밀번호가 일치하지 않습니다.' });
    }

    const token = signToken({ userId: user.id, role: user.role });
    return res.status(200).json({ result: 'success', data: { token } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;