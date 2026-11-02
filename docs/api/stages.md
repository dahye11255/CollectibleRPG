# Stage 라우터

기본 경로: `/api/stages` · 응답 형식: `result` / `data` / `error`

| # | 메서드 | URL | 기능 |
|---|---|---|---|
| 1 | GET | `/api/stages` | 스테이지 목록 조회 API |
| 2 | GET | `/api/stages/:stageId` | 스테이지 상세 조회 API |
| 3 | GET | `/api/stages/:stageId/requirements` | 진입 조건 조회 API |
| 4 | GET | `/api/stages/:stageId/drops` | 드롭 테이블 조회 API |
| 5 | POST | `/api/stages/:stageId/unlock` | 스테이지 해금 API **(핵심)** |
| 6 | POST | `/api/stages/:stageId/first-clear-reward` | 최초 탐사 보상 수령 API |
| 7 | PATCH | `/api/stages/:stageId` | [관리자] 스테이지 수정 API |

## 1. 스테이지 목록 조회 API

Request: GET, `/api/stages` (로그인 필요)

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| Authorization | String | 필수 | 헤더. `Bearer <JWT 토큰>` |

Response

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| stages | 2 | 배열 | 스테이지 1~5 목록 |
| stageId | 3 | 숫자 | 스테이지 번호 |
| name | 3 | 문자열 | 스테이지 이름 |
| requiredPower | 3 | 숫자 | 필요 전투력 |
| baseDurationSec | 3 | 숫자 | 기본 탐사 시간(초) |
| unlocked | 3 | true/false | 내 해금 여부 |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

Json (성공, 200)

```json
{ "result": "success", "data": { "stages": [ { "stageId": 1, "name": "초원", "requiredPower": 10, "baseDurationSec": 60, "unlocked": true } ] } }
```

실패 상황

- 토큰 없음·만료 → 401

## 2. 스테이지 상세 조회 API

Request: GET, `/api/stages/:stageId` (로그인 필요)

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| Authorization | String | 필수 | 헤더. `Bearer <JWT 토큰>` |
| stageId | Number | 필수 | path. 스테이지 번호 |

Response

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| stageId | 2 | 숫자 | 스테이지 번호 |
| name | 2 | 문자열 | 이름 |
| description | 2 | 문자열 | 설명 |
| requiredPower | 2 | 숫자 | 필요 전투력 |
| baseDurationSec | 2 | 숫자 | 기본 탐사 시간(초) |
| items | 2 | 배열 | 드롭 가능 아이템 C~S 5종 (itemId, name, grade) |
| unlocked | 2 | true/false | 내 해금 여부 |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

Json (성공, 200)

```json
{ "result": "success", "data": { "stageId": 2, "name": "숲", "description": "...", "requiredPower": 50, "baseDurationSec": 120, "items": [ { "itemId": 6, "name": "Stage 2 Common", "grade": "COMMON" } ], "unlocked": false } }
```

실패 상황

- 토큰 없음·만료 → 401
- 없는 스테이지 → 404

## 3. 진입 조건 조회 API

Request: GET, `/api/stages/:stageId/requirements` (로그인 필요)

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| Authorization | String | 필수 | 헤더. `Bearer <JWT 토큰>` |
| stageId | Number | 필수 | path. 스테이지 번호 |

Response

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| requiredItem | 2 | 객체/null | 해금에 필요한 장착 장비 (직전 스테이지 Supreme). Stage 1은 null |
| requiredPower | 2 | 숫자 | 필요 전투력 |
| equippedOk | 2 | true/false | 현재 필요 장비를 장착했는지 |
| powerOk | 2 | true/false | 현재 전투력이 충분한지 |
| canUnlock | 2 | true/false | 지금 해금 요청이 가능한지 |
| unlocked | 2 | true/false | 이미 해금했는지 |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

Json (성공, 200)

```json
{ "result": "success", "data": { "requiredItem": { "itemId": 5, "name": "Stage 1 Supreme" }, "requiredPower": 50, "equippedOk": true, "powerOk": true, "canUnlock": true, "unlocked": false } }
```

실패 상황

- 토큰 없음·만료 → 401
- 없는 스테이지 → 404

## 4. 드롭 테이블 조회 API

Request: GET, `/api/stages/:stageId/drops` (로그인 필요)

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| Authorization | String | 필수 | 헤더. `Bearer <JWT 토큰>` |
| stageId | Number | 필수 | path. 스테이지 번호 |

Response

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| drops | 2 | 배열 | 등급별 드롭 확률 |
| itemId | 3 | 숫자 | 아이템 번호 |
| grade | 3 | COMMON~SUPREME | 등급 |
| rate | 3 | 숫자 | 드롭 확률(%) 50/25/15/9/1 |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

Json (성공, 200)

```json
{ "result": "success", "data": { "drops": [ { "itemId": 1, "grade": "COMMON", "rate": 50 }, { "itemId": 5, "grade": "SUPREME", "rate": 1 } ] } }
```

실패 상황

- 토큰 없음·만료 → 401
- 없는 스테이지 → 404

## 5. 스테이지 해금 API (핵심 API)

Request: POST, `/api/stages/:stageId/unlock` (로그인 필요)

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| Authorization | String | 필수 | 헤더. `Bearer <JWT 토큰>` |
| stageId | Number | 필수 | path. 해금할 스테이지 번호 (2~5) |

Response

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| stageId | 2 | 숫자 | 해금된 스테이지 번호 |
| unlockedAt | 2 | 날짜 문자열 | 해금 시각 |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

Json (성공, 201)

```json
{ "result": "success", "data": { "stageId": 2, "unlockedAt": "2026-11-02T14:50:00Z" } }
```

실패 상황

- 토큰 없음·만료 → 401
- 없는 스테이지 → 404
- 이미 해금됨 → 409
- 직전 스테이지 Supreme 미장착 → 403 (Supreme Door-lock)

## 6. 최초 탐사 보상 수령 API

Request: POST, `/api/stages/:stageId/first-clear-reward` (로그인 필요)

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| Authorization | String | 필수 | 헤더. `Bearer <JWT 토큰>` |
| stageId | Number | 필수 | path. 스테이지 번호 |

Response

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| stageId | 2 | 숫자 | 스테이지 번호 |
| earnedGold | 2 | 숫자 | 받은 보상 골드 |
| gold | 2 | 숫자 | 수령 후 보유 골드 |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

Json (성공, 201)

```json
{ "result": "success", "data": { "stageId": 1, "earnedGold": 100, "gold": 220 } }
```

실패 상황

- 토큰 없음·만료 → 401
- 없는 스테이지 → 404
- 이 스테이지 탐사를 완료한 적 없음 → 400
- 이미 수령함 → 409

## 7. [관리자] 스테이지 수정 API

Request: PATCH, `/api/stages/:stageId` (로그인 필요)

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| Authorization | String | 필수 | 헤더. `Bearer <JWT 토큰>` |
| stageId | Number | 필수 | path. 스테이지 번호 |
| name | String | 선택 | body. 이름 |
| requiredPower | Number | 선택 | body. 필요 전투력 |
| baseDurationSec | Number | 선택 | body. 기본 탐사 시간(초) |

Response

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| stageId | 2 | 숫자 | 수정된 스테이지 번호 |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

Json (성공, 200)

```json
{ "result": "success", "data": { "stageId": 2 } }
```

실패 상황

- 토큰 없음·만료 → 401
- 관리자 아님 → 403
- 없는 스테이지 → 404
- 수정할 값 없음 → 400
