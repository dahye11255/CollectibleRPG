# Battle 라우터 (탐사)

- 기본 경로: `/api/battles`
- 응답 형식: `result` / `data` / `error`
- 연속 탐사: 회차별 종료 시각 = 시작 시각 + 회차 × durationSec. 끝난 회차는 완료 요청 때 한꺼번에 정산한다 (타이머 미사용)
- 탐사 시간 = ceil(기본 탐사 시간 × (1 − min(도감 버프 + 빙고 버프, 45%)))

| # | 메서드 | URL | 기능 |
| --- | --- | --- | --- |
| 1 | POST | `/api/battles` | 탐사 시작 API |
| 2 | GET | `/api/battles/current` | 진행 중 탐사 조회 API |
| 3 | GET | `/api/battles/:battleId` | 탐사 상세 조회 API |
| 4 | POST | `/api/battles/:battleId/completion` | 탐사 완료 및 보상 수령 API **(핵심)** |
| 5 | POST | `/api/battles/:battleId/instant-completion` | 골드로 즉시 완료 API |
| 6 | PATCH | `/api/battles/:battleId` | 탐사 취소 API |
| 7 | GET | `/api/battles` | 탐사 기록 조회 API |

## 1. 탐사 시작 API

**Request:** `POST /api/battles` (로그인 필요)

| Parameter | 타입 | 필수여부 | 설명 |
| --- | --- | --- | --- |
| Authorization | String | 필수 | 헤더. `Bearer <JWT 토큰>` |
| stageId | Number | 필수 | body. 탐사할 스테이지 번호 |
| repeatCount | Number | 선택 | body. 연속 탐사 횟수 (기본 1, 최대 1 + 자동 탐사 연구 레벨) |

### Response

| Element | Depth | 값 구분 | 설명 |
| --- | --- | --- | --- |
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| battleId | 2 | 숫자 | 탐사 번호 |
| stageId | 2 | 숫자 | 스테이지 번호 |
| status | 2 | IN_PROGRESS | 탐사 상태 |
| repeatTotal | 2 | 숫자 | 예약한 회차 수 |
| durationSec | 2 | 숫자 | 1회차 탐사 시간(초). 단축률 반영 후 올림 |
| appliedReductionRate | 2 | 숫자 | 적용한 단축률(%) = min(도감 + 빙고, 45) |
| startedAt | 2 | 날짜 문자열 | 시작 시각 (서버 기준) |
| endTime | 2 | 날짜 문자열 | 마지막 회차 종료 시각. DB에 고정 저장 |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

### JSON 예시 (성공, 201)

```json
{ "result": "success", "data": { "battleId": 15, "stageId": 1, "status": "IN_PROGRESS", "repeatTotal": 3, "durationSec": 51, "appliedReductionRate": 15, "startedAt": "2026-11-09T15:00:00Z", "endTime": "2026-11-09T15:02:33Z" } }
```

### 실패 상황

- 토큰 없음·만료 → 401
- stageId 누락 → 400
- repeatCount가 1 미만이거나 연구 레벨로 허용된 횟수 초과 → 400
- 없는 스테이지 → 404
- 미해금 스테이지 → 403
- 장착 장비 없음 → 400
- 전투력 부족 → 403
- 인벤토리 가득 참 → 409
- 이미 진행 중인 탐사 있음 → 409

## 2. 진행 중 탐사 조회 API

**Request:** `GET /api/battles/current` (로그인 필요)

| Parameter | 타입 | 필수여부 | 설명 |
| --- | --- | --- | --- |
| Authorization | String | 필수 | 헤더. `Bearer <JWT 토큰>` |

### Response

| Element | Depth | 값 구분 | 설명 |
| --- | --- | --- | --- |
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| battle | 2 | 객체/null | 진행 중 탐사 (없으면 null) |
| battleId | 3 | 숫자 | 탐사 번호 |
| stageId | 3 | 숫자 | 스테이지 번호 |
| repeatTotal | 3 | 숫자 | 예약한 회차 수 |
| repeatDone | 3 | 숫자 | 정산한 회차 수 |
| settleableRounds | 3 | 숫자 | 끝났지만 아직 정산하지 않은 회차 수 |
| nextRoundEndTime | 3 | 날짜 문자열/null | 다음 회차 종료 시각 |
| remainingSec | 3 | 숫자 | 마지막 회차까지 남은 시간(초) |
| appliedReductionRate | 3 | 숫자 | 시작 시 적용한 단축률(%) |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

### JSON 예시 (성공, 200)

```json
{ "result": "success", "data": { "battle": { "battleId": 15, "stageId": 1, "repeatTotal": 3, "repeatDone": 0, "settleableRounds": 1, "nextRoundEndTime": "2026-11-09T15:01:42Z", "remainingSec": 80, "appliedReductionRate": 15 } } }
```

### 실패 상황

- 토큰 없음·만료 → 401

## 3. 탐사 상세 조회 API

**Request:** `GET /api/battles/:battleId` (로그인 필요)

| Parameter | 타입 | 필수여부 | 설명 |
| --- | --- | --- | --- |
| Authorization | String | 필수 | 헤더. `Bearer <JWT 토큰>` |
| battleId | Number | 필수 | path. 탐사 번호 |

### Response

| Element | Depth | 값 구분 | 설명 |
| --- | --- | --- | --- |
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| battleId | 2 | 숫자 | 탐사 번호 |
| stageId | 2 | 숫자 | 스테이지 번호 |
| status | 2 | IN_PROGRESS/COMPLETED/CANCELED | 탐사 상태 |
| repeatTotal | 2 | 숫자 | 예약한 회차 수 |
| repeatDone | 2 | 숫자 | 정산한 회차 수 |
| durationSec | 2 | 숫자 | 1회차 탐사 시간(초) |
| appliedReductionRate | 2 | 숫자 | 적용한 단축률(%) |
| startedAt | 2 | 날짜 문자열 | 시작 시각 |
| endTime | 2 | 날짜 문자열 | 마지막 회차 종료 시각 |
| rewards | 2 | 배열 | 회차별 보상 (roundNo, item, gold) |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

### JSON 예시 (성공, 200)

```json
{ "result": "success", "data": { "battleId": 15, "stageId": 1, "status": "COMPLETED", "repeatTotal": 1, "repeatDone": 1, "durationSec": 60, "appliedReductionRate": 0, "startedAt": "2026-11-09T15:00:00Z", "endTime": "2026-11-09T15:01:00Z", "rewards": [ { "roundNo": 1, "item": { "itemId": 2, "name": "Stage 1 Uncommon", "grade": "UNCOMMON" }, "gold": 10 } ] } }
```

### 실패 상황

- 토큰 없음·만료 → 401
- 내 탐사가 아님·없는 탐사 → 404

## 4. 탐사 완료 및 보상 수령 API (핵심 API)

**Request:** `POST /api/battles/:battleId/completion` (로그인 필요)

| Parameter | 타입 | 필수여부 | 설명 |
| --- | --- | --- | --- |
| Authorization | String | 필수 | 헤더. `Bearer <JWT 토큰>` |
| battleId | Number | 필수 | path. 탐사 번호 |

### Response

| Element | Depth | 값 구분 | 설명 |
| --- | --- | --- | --- |
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| settledRounds | 2 | 배열 | 이번에 정산한 회차 (roundNo, item, gold, newCodex, bingoCellIndex) |
| earnedGold | 2 | 숫자 | 이번에 받은 골드 합계 (교역 연구 반영) |
| gold | 2 | 숫자 | 정산 후 보유 골드 |
| repeatDone | 2 | 숫자 | 정산한 회차 수 |
| repeatTotal | 2 | 숫자 | 예약한 회차 수 |
| status | 2 | IN_PROGRESS/COMPLETED | 모든 회차를 정산하면 COMPLETED |
| stoppedByInventory | 2 | true/false | 인벤토리가 가득 차서 정산을 멈췄는지 |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

### JSON 예시 (성공, 201)

```json
{ "result": "success", "data": { "settledRounds": [ { "roundNo": 1, "item": { "itemId": 2, "name": "Stage 1 Uncommon", "grade": "UNCOMMON" }, "gold": 11, "newCodex": true, "bingoCellIndex": 17 } ], "earnedGold": 11, "gold": 131, "repeatDone": 1, "repeatTotal": 1, "status": "COMPLETED", "stoppedByInventory": false } }
```

### 실패 상황

- 토큰 없음·만료 → 401
- 없는 탐사 → 404
- 정산할 회차 없음 (1회차 종료 전, NOW() < 회차 종료 시각) → 400
- 이미 완료·취소된 탐사 → 409
- 인벤토리가 가득 차서 1회차도 정산하지 못함 → 409

## 5. 골드로 즉시 완료 API

**Request:** `POST /api/battles/:battleId/instant-completion` (로그인 필요)

| Parameter | 타입 | 필수여부 | 설명 |
| --- | --- | --- | --- |
| Authorization | String | 필수 | 헤더. `Bearer <JWT 토큰>` |
| battleId | Number | 필수 | path. 탐사 번호 |

### Response

| Element | Depth | 값 구분 | 설명 |
| --- | --- | --- | --- |
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| spentGold | 2 | 숫자 | 사용한 골드 = ceil(남은 초 ÷ 10) × (1 − 시간술 할인) |
| settledRounds | 2 | 배열 | 정산한 회차 (완료 API와 같은 형식) |
| earnedGold | 2 | 숫자 | 받은 골드 합계 |
| gold | 2 | 숫자 | 처리 후 보유 골드 |
| status | 2 | COMPLETED | 탐사 상태 |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

### JSON 예시 (성공, 201)

```json
{ "result": "success", "data": { "spentGold": 3, "settledRounds": [ { "roundNo": 1, "item": { "itemId": 2, "name": "Stage 1 Uncommon", "grade": "UNCOMMON" }, "gold": 10, "newCodex": false, "bingoCellIndex": null } ], "earnedGold": 10, "gold": 127, "status": "COMPLETED" } }
```

### 실패 상황

- 토큰 없음·만료 → 401
- 없는 탐사 → 404
- 이미 완료·취소된 탐사 → 409
- 골드 부족 → 400
- 남은 회차만큼 인벤토리 빈칸 부족 → 409 (골드 차감 전에 검사)

## 6. 탐사 취소 API

**Request:** `PATCH /api/battles/:battleId` (로그인 필요)

| Parameter | 타입 | 필수여부 | 설명 |
| --- | --- | --- | --- |
| Authorization | String | 필수 | 헤더. `Bearer <JWT 토큰>` |
| battleId | Number | 필수 | path. 탐사 번호 |
| status | String | 필수 | body. CANCELED만 허용 |

### Response

| Element | Depth | 값 구분 | 설명 |
| --- | --- | --- | --- |
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| battleId | 2 | 숫자 | 탐사 번호 |
| status | 2 | CANCELED | 변경된 상태 |
| settledRounds | 2 | 배열 | 취소 전에 자동 정산한, 이미 끝난 회차 |
| canceledRounds | 2 | 숫자 | 보상 없이 취소된 회차 수 |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

### JSON 예시 (성공, 200)

```json
{ "result": "success", "data": { "battleId": 15, "status": "CANCELED", "settledRounds": [], "canceledRounds": 1 } }
```

### 실패 상황

- 토큰 없음·만료 → 401
- status 값 오류 → 400
- 없는 탐사 → 404
- 이미 완료·취소된 탐사 → 409
- 끝난 회차를 정산할 인벤토리 빈칸 부족 → 409

## 7. 탐사 기록 조회 API

**Request:** `GET /api/battles` (로그인 필요)

| Parameter | 타입 | 필수여부 | 설명 |
| --- | --- | --- | --- |
| Authorization | String | 필수 | 헤더. `Bearer <JWT 토큰>` |
| page | Number | 선택 | query. 페이지 번호 (기본 1) |
| size | Number | 선택 | query. 페이지 크기 (기본 10, 최대 50) |

### Response

| Element | Depth | 값 구분 | 설명 |
| --- | --- | --- | --- |
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| battles | 2 | 배열 | 탐사 목록 (battleId, stageId, status, repeatTotal, repeatDone, startedAt) |
| page | 2 | 숫자 | 현재 페이지 |
| total | 2 | 숫자 | 전체 개수 |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

### JSON 예시 (성공, 200)

```json
{ "result": "success", "data": { "battles": [ { "battleId": 15, "stageId": 1, "status": "COMPLETED", "repeatTotal": 1, "repeatDone": 1, "startedAt": "2026-11-09T15:00:00Z" } ], "page": 1, "total": 23 } }
```

### 실패 상황

- 토큰 없음·만료 → 401
- page·size 값 오류 → 400
