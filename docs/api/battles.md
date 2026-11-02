# Battle 라우터 (탐사)

기본 경로: `/api/battles` · 응답 형식: `result` / `data` / `error`

| # | 메서드 | URL | 기능 |
|---|---|---|---|
| 1 | POST | `/api/battles` | 탐사 시작 API |
| 2 | GET | `/api/battles/current` | 진행 중 탐사 조회 API |
| 3 | GET | `/api/battles/:battleId` | 탐사 상세 조회 API |
| 4 | POST | `/api/battles/:battleId/completion` | 탐사 완료 및 보상 수령 API **(핵심)** |
| 5 | POST | `/api/battles/:battleId/instant-completion` | 골드로 즉시 완료 API |
| 6 | PATCH | `/api/battles/:battleId` | 탐사 취소 API |
| 7 | GET | `/api/battles` | 탐사 기록 조회 API |

## 1. 탐사 시작 API

Request: POST, `/api/battles` (로그인 필요)

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| Authorization | String | 필수 | 헤더. `Bearer <JWT 토큰>` |
| stageId | Number | 필수 | body. 탐사할 스테이지 번호 |

Response

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| battleId | 2 | 숫자 | 탐사 번호 |
| stageId | 2 | 숫자 | 스테이지 번호 |
| status | 2 | IN_PROGRESS | 탐사 상태 |
| startedAt | 2 | 날짜 문자열 | 시작 시각 (서버 기준) |
| endTime | 2 | 날짜 문자열 | 완료 가능 시각. DB에 고정 저장 |
| durationSec | 2 | 숫자 | 도감 버프 반영 후 탐사 시간(초) |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

Json (성공, 201)

```json
{ "result": "success", "data": { "battleId": 15, "stageId": 1, "status": "IN_PROGRESS", "startedAt": "2026-11-02T15:00:00Z", "endTime": "2026-11-02T15:00:54Z", "durationSec": 54 } }
```

실패 상황

- 토큰 없음·만료 → 401
- stageId 누락 → 400
- 없는 스테이지 → 404
- 미해금 스테이지 → 403
- 장착 장비 없음 → 400
- 전투력 부족 → 403
- 인벤토리 가득 참 → 409
- 이미 진행 중인 탐사 있음 → 409

## 2. 진행 중 탐사 조회 API

Request: GET, `/api/battles/current` (로그인 필요)

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| Authorization | String | 필수 | 헤더. `Bearer <JWT 토큰>` |

Response

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| battle | 2 | 객체/null | 진행 중 탐사 (없으면 null) |
| remainingSec | 2 | 숫자 | 완료까지 남은 시간(초). 0이면 완료 가능 |
| appliedReductionRate | 2 | 숫자 | 적용된 총 단축 비율(%) |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

Json (성공, 200)

```json
{ "result": "success", "data": { "battle": { "battleId": 15, "stageId": 1, "status": "IN_PROGRESS", "endTime": "2026-11-02T15:00:54Z" }, "remainingSec": 24, "appliedReductionRate": 10 } }
```

실패 상황

- 토큰 없음·만료 → 401

## 3. 탐사 상세 조회 API

Request: GET, `/api/battles/:battleId` (로그인 필요)

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| Authorization | String | 필수 | 헤더. `Bearer <JWT 토큰>` |
| battleId | Number | 필수 | path. 탐사 번호 |

Response

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| battleId | 2 | 숫자 | 탐사 번호 |
| stageId | 2 | 숫자 | 스테이지 번호 |
| status | 2 | IN_PROGRESS/COMPLETED/CANCELED | 탐사 상태 |
| startedAt | 2 | 날짜 문자열 | 시작 시각 |
| endTime | 2 | 날짜 문자열 | 완료 가능 시각 |
| reward | 2 | 객체/null | 받은 보상 (item, gold). 완료 전이면 null |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

Json (성공, 200)

```json
{ "result": "success", "data": { "battleId": 15, "stageId": 1, "status": "COMPLETED", "startedAt": "2026-11-02T15:00:00Z", "endTime": "2026-11-02T15:00:54Z", "reward": { "item": { "userItemId": 22, "name": "Stage 1 Uncommon", "grade": "UNCOMMON" }, "gold": 15 } } }
```

실패 상황

- 토큰 없음·만료 → 401
- 내 탐사가 아님·없는 탐사 → 404

## 4. 탐사 완료 및 보상 수령 API (핵심 API)

Request: POST, `/api/battles/:battleId/completion` (로그인 필요)

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| Authorization | String | 필수 | 헤더. `Bearer <JWT 토큰>` |
| battleId | Number | 필수 | path. 탐사 번호 |

Response

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| item | 2 | 객체 | 획득 아이템 (userItemId, name, grade) |
| earnedGold | 2 | 숫자 | 획득 골드 |
| gold | 2 | 숫자 | 수령 후 보유 골드 |
| newCodexEntry | 2 | true/false | 도감에 새로 등록됐는지 |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

Json (성공, 201)

```json
{ "result": "success", "data": { "item": { "userItemId": 22, "name": "Stage 1 Uncommon", "grade": "UNCOMMON" }, "earnedGold": 15, "gold": 135, "newCodexEntry": true } }
```

실패 상황

- 토큰 없음·만료 → 401
- 없는 탐사 → 404
- 아직 종료 시각 전 (NOW() < end_time) → 400
- 이미 완료·취소된 탐사 → 409
- 인벤토리 가득 참 → 409

## 5. 골드로 즉시 완료 API

Request: POST, `/api/battles/:battleId/instant-completion` (로그인 필요)

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| Authorization | String | 필수 | 헤더. `Bearer <JWT 토큰>` |
| battleId | Number | 필수 | path. 탐사 번호 |

Response

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| spentGold | 2 | 숫자 | 사용한 골드 (남은 시간에 비례) |
| item | 2 | 객체 | 획득 아이템 |
| earnedGold | 2 | 숫자 | 획득 골드 |
| gold | 2 | 숫자 | 처리 후 보유 골드 |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

Json (성공, 201)

```json
{ "result": "success", "data": { "spentGold": 3, "item": { "userItemId": 23, "name": "Stage 1 Common", "grade": "COMMON" }, "earnedGold": 15, "gold": 147 } }
```

실패 상황

- 토큰 없음·만료 → 401
- 없는 탐사 → 404
- 이미 완료·취소된 탐사 → 409
- 골드 부족 → 400
- 인벤토리 가득 참 → 409

## 6. 탐사 취소 API

Request: PATCH, `/api/battles/:battleId` (로그인 필요)

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| Authorization | String | 필수 | 헤더. `Bearer <JWT 토큰>` |
| battleId | Number | 필수 | path. 탐사 번호 |
| status | String | 필수 | body. CANCELED만 허용 |

Response

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| battleId | 2 | 숫자 | 탐사 번호 |
| status | 2 | CANCELED | 변경된 상태 |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

Json (성공, 200)

```json
{ "result": "success", "data": { "battleId": 15, "status": "CANCELED" } }
```

실패 상황

- 토큰 없음·만료 → 401
- status 값 오류 → 400
- 없는 탐사 → 404
- 이미 완료·취소된 탐사 → 409

## 7. 탐사 기록 조회 API

Request: GET, `/api/battles` (로그인 필요)

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| Authorization | String | 필수 | 헤더. `Bearer <JWT 토큰>` |
| page | Number | 선택 | query. 페이지 번호 (기본 1) |
| size | Number | 선택 | query. 페이지 크기 (기본 10) |

Response

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| battles | 2 | 배열 | 탐사 목록 (battleId, stageId, status, startedAt, rewardItemName) |
| page | 2 | 숫자 | 현재 페이지 |
| total | 2 | 숫자 | 전체 개수 |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

Json (성공, 200)

```json
{ "result": "success", "data": { "battles": [ { "battleId": 15, "stageId": 1, "status": "COMPLETED", "startedAt": "2026-11-02T15:00:00Z", "rewardItemName": "Stage 1 Uncommon" } ], "page": 1, "total": 23 } }
```

실패 상황

- 토큰 없음·만료 → 401
- page·size 값 오류 → 400
