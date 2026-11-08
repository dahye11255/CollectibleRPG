const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');

// 회원가입 API
router.post('/register', async (req, res) => {
    const { loginId, password, nickname } = req.body;

    if (!loginId || !password || !nickname) {
        return res.status(400).json({ result: 'fail', error: '필수값이 누락되었습니다.' });
    }
    if (loginId.length < 4 || loginId.length > 20 || password.length < 8) {
        return res.status(400).json({ result: 'fail', error: '입력 형식(아이디 4~20자, 비밀번호 8자 이상)을 확인해주세요.' });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [existing] = await connection.query('SELECT id FROM users WHERE login_id = ?', [loginId]);
        if (existing.length > 0) {
            connection.release();
            return res.status(409).json({ result: 'fail', error: '이미 사용 중인 loginId입니다.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const [userResult] = await connection.query(
            'INSERT INTO users (login_id, password, nickname) VALUES (?, ?, ?)',
            [loginId, hashedPassword, nickname]
        );
        const userId = userResult.insertId;

        const [itemResult] = await connection.query(
            'INSERT INTO user_items (user_id, item_id, is_equipped) VALUES (?, 1, 1)',
            [userId]
        );
        const userItemId = itemResult.insertId;

        await connection.commit();
        connection.release();

        return res.status(201).json({
            result: 'success',
            data: {
                userId,
                nickname,
                starterItem: {
                    userItemId,
                    name: 'Stage 1 Common'
                }
            }
        });
    } catch (err) {
        await connection.rollback();
        connection.release();
        console.error(err);
        return res.status(500).json({ result: 'fail', error: '서버 오류가 발생했습니다.' });
    }
});

// 로그인 API
router.post('/login', async (req, res) => {
    const { loginId, password } = req.body;

    if (!loginId || !password) {
        return res.status(400).json({ result: 'fail', error: '필수값이 누락되었습니다.' });
    }

    try {
        const [rows] = await db.query('SELECT * FROM users WHERE login_id = ?', [loginId]);
        if (rows.length === 0) {
            return res.status(401).json({ result: 'fail', error: 'ID 또는 비밀번호가 일치하지 않습니다.' });
        }

        const user = rows[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ result: 'fail', error: 'ID 또는 비밀번호가 일치하지 않습니다.' });
        }

        const token = jwt.sign(
            { userId: user.id, loginId: user.login_id },
            process.env.JWT_SECRET || 'collectible-rpg-secret',
            { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
        );

        return res.status(200).json({
            result: 'success',
            data: {
                token,
                userId: user.id
            }
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ result: 'fail', error: '서버 오류가 발생했습니다.' });
    }
});

// 내 정보 조회 API
router.get('/me', async (req, res) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ result: 'fail', error: '토큰이 없거나 만료되었습니다.' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'collectible-rpg-secret');
        const [rows] = await db.query('SELECT id, login_id, nickname FROM users WHERE id = ?', [decoded.userId]);

        if (rows.length === 0) {
            return res.status(401).json({ result: 'fail', error: '존재하지 않는 사용자입니다.' });
        }

        const user = rows[0];
        return res.status(200).json({
            result: 'success',
            data: {
                userId: user.id,
                loginId: user.login_id,
                nickname: user.nickname
            }
        });
    } catch (err) {
        return res.status(401).json({ result: 'fail', error: '토큰이 유효하지 않습니다.' });
    }
});

module.exports = router;