# Auth 라우터 (회원 관리, 라우터 개수 미포함)

- 기본 경로: `/api/auth`
- 응답 형식: `result` / `data` / `error`

| # | 메서드 | URL | 기능 |
| --- | --- | --- | --- |
| 1 | POST | `/api/auth/register` | 회원가입 API |
| 2 | POST | `/api/auth/login` | 로그인 API |
| 3 | GET | `/api/auth/me` | 내 정보 조회 API |

## 1. 회원가입 API

**Request:** `POST /api/auth/register`

| Parameter | 타입 | 필수여부 | 설명 |
| --- | --- | --- | --- |
| loginId | String | 필수 | body. 로그인 ID (4~20자) |
| password | String | 필수 | body. 비밀번호 (8자 이상) |
| nickname | String | 필수 | body. 닉네임 |

### Response

| Element | Depth | 값 구분 | 설명 |
| --- | --- | --- | --- |
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| userId | 2 | 숫자 | 생성된 회원 번호 |
| nickname | 2 | 문자열 | 닉네임 |
| starterItem | 2 | 객체 | 기본 지급·자동 장착된 아이템 (Stage 1 Common) |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

### JSON 예시 (성공, 201)

```json
{ "result": "success", "data": { "userId": 1, "nickname": "용사", "starterItem": { "userItemId": 1, "name": "Stage 1 Common" } } }
```

### 실패 상황

- 필수값 누락·형식 오류 → 400
- 이미 사용 중인 loginId → 409

## 2. 로그인 API

**Request:** `POST /api/auth/login`

| Parameter | 타입 | 필수여부 | 설명 |
| --- | --- | --- | --- |
| loginId | String | 필수 | body. 로그인 ID |
| password | String | 필수 | body. 비밀번호 |

### Response

| Element | Depth | 값 구분 | 설명 |
| --- | --- | --- | --- |
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| token | 2 | 문자열 | JWT 액세스 토큰 |
| userId | 2 | 숫자 | 회원 번호 |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

### JSON 예시 (성공, 200)

```json
{ "result": "success", "data": { "token": "eyJhbGci...", "userId": 1 } }
```

### 실패 상황

- 필수값 누락 → 400
- ID 또는 비밀번호 불일치 → 401

## 3. 내 정보 조회 API

**Request:** `GET /api/auth/me` (로그인 필요)

| Parameter | 타입 | 필수여부 | 설명 |
| --- | --- | --- | --- |
| Authorization | String | 필수 | 헤더. `Bearer <JWT 토큰>` |

### Response

| Element | Depth | 값 구분 | 설명 |
| --- | --- | --- | --- |
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| userId | 2 | 숫자 | 회원 번호 |
| loginId | 2 | 문자열 | 로그인 ID |
| nickname | 2 | 문자열 | 닉네임 |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

### JSON 예시 (성공, 200)

```json
{ "result": "success", "data": { "userId": 1, "loginId": "hero01", "nickname": "용사" } }
```

### 실패 상황

- 토큰 없음·만료 → 401
