# Item 라우터

- 기본 경로: `/api/items`
- 응답 형식: `result` / `data` / `error`
- 빙고 규칙: 아이템 종류를 처음 얻으면(드롭·합성·가입 시작 아이템) 5×5 판의 빈칸 하나에 무작위 배치, 위치 영구 유지. 가로 5·세로 5·대각선 2 = 최대 12빙고. 1·3·5빙고 보상(탐사 시간 10%·5%·5% 단축, 빙고 최대 20%)
- 경로 순서: `/codex`, `/recipes`, `/bingo` 같은 고정 경로를 `/:itemId`보다 먼저 등록한다

| # | 메서드 | URL | 기능 |
| --- | --- | --- | --- |
| 1 | GET | `/api/items` | 전체 아이템 목록 조회 API |
| 2 | GET | `/api/items/:itemId` | 아이템 상세 조회 API |
| 3 | GET | `/api/items/codex` | 도감 수집률 조회 API |
| 4 | GET | `/api/items/codex/:stageId` | 스테이지별 도감 상세 조회 API |
| 5 | POST | `/api/items/codex/:stageId/reward` | 도감 보상 수령 API |
| 6 | GET | `/api/items/recipes` | 합성 규칙 조회 API |
| 7 | POST | `/api/items/syntheses` | 아이템 합성 API **(핵심)** |
| 8 | GET | `/api/items/bingo` | 빙고판 조회 API |
| 9 | GET | `/api/items/bingo/rewards` | 빙고 보상 현황 조회 API |
| 10 | POST | `/api/items/bingo/rewards/:threshold` | 빙고 보상 수령 API |

## 1. 전체 아이템 목록 조회 API

**Request:** `GET /api/items` (로그인 필요)

| Parameter | 타입 | 필수여부 | 설명 |
| --- | --- | --- | --- |
| Authorization | String | 필수 | 헤더. `Bearer <JWT 토큰>` |
| stageId | Number | 선택 | query. 스테이지 필터 |
| grade | String | 선택 | query. 등급 필터 (COMMON~SUPREME) |

### Response

| Element | Depth | 값 구분 | 설명 |
| --- | --- | --- | --- |
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| items | 2 | 배열 | 전체 25종 아이템 |
| itemId | 3 | 숫자 | 아이템 번호 |
| name | 3 | 문자열 | 이름 (Stage X Grade) |
| stageId | 3 | 숫자 | 스테이지 번호 |
| grade | 3 | 문자열 | 등급 |
| power | 3 | 숫자 | 장착 시 전투력 |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

### JSON 예시 (성공, 200)

```json
{ "result": "success", "data": { "items": [ { "itemId": 1, "name": "Stage 1 Common", "stageId": 1, "grade": "COMMON", "power": 10 } ] } }
```

### 실패 상황

- 토큰 없음·만료 → 401
- 잘못된 grade 값 → 400

## 2. 아이템 상세 조회 API

**Request:** `GET /api/items/:itemId` (로그인 필요)

| Parameter | 타입 | 필수여부 | 설명 |
| --- | --- | --- | --- |
| Authorization | String | 필수 | 헤더. `Bearer <JWT 토큰>` |
| itemId | Number | 필수 | path. 아이템 번호 |

### Response

| Element | Depth | 값 구분 | 설명 |
| --- | --- | --- | --- |
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| itemId | 2 | 숫자 | 아이템 번호 |
| name | 2 | 문자열 | 이름 |
| stageId | 2 | 숫자 | 스테이지 번호 |
| grade | 2 | 문자열 | 등급 |
| power | 2 | 숫자 | 장착 시 전투력 |
| dropRate | 2 | 숫자 | 드롭 확률(%) |
| sellPrice | 2 | 숫자 | 판매 가격 |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

### JSON 예시 (성공, 200)

```json
{ "result": "success", "data": { "itemId": 1, "name": "Stage 1 Common", "stageId": 1, "grade": "COMMON", "power": 10, "dropRate": 50, "sellPrice": 5 } }
```

### 실패 상황

- 토큰 없음·만료 → 401
- 없는 아이템 → 404

## 3. 도감 수집률 조회 API

**Request:** `GET /api/items/codex` (로그인 필요)

| Parameter | 타입 | 필수여부 | 설명 |
| --- | --- | --- | --- |
| Authorization | String | 필수 | 헤더. `Bearer <JWT 토큰>` |

### Response

| Element | Depth | 값 구분 | 설명 |
| --- | --- | --- | --- |
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| totalRate | 2 | 숫자 | 전체 수집률(%) (25종 기준) |
| stages | 2 | 배열 | 스테이지별 요약 |
| stageId | 3 | 숫자 | 스테이지 번호 |
| collectedCount | 3 | 숫자 | 획득한 종류 수 (0~5) |
| completed | 3 | true/false | 5종 모두 획득 여부 |
| rewardClaimed | 3 | true/false | 보상 수령 여부 |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

### JSON 예시 (성공, 200)

```json
{ "result": "success", "data": { "totalRate": 28, "stages": [ { "stageId": 1, "collectedCount": 5, "completed": true, "rewardClaimed": false } ] } }
```

### 실패 상황

- 토큰 없음·만료 → 401

## 4. 스테이지별 도감 상세 조회 API

**Request:** `GET /api/items/codex/:stageId` (로그인 필요)

| Parameter | 타입 | 필수여부 | 설명 |
| --- | --- | --- | --- |
| Authorization | String | 필수 | 헤더. `Bearer <JWT 토큰>` |
| stageId | Number | 필수 | path. 스테이지 번호 |

### Response

| Element | Depth | 값 구분 | 설명 |
| --- | --- | --- | --- |
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| stageId | 2 | 숫자 | 스테이지 번호 |
| entries | 2 | 배열 | 등급별 획득 기록 |
| grade | 3 | 문자열 | 등급 |
| acquired | 3 | true/false | 획득 여부 |
| firstAcquiredAt | 3 | 날짜 문자열/null | 최초 획득 시각 |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

### JSON 예시 (성공, 200)

```json
{ "result": "success", "data": { "stageId": 1, "entries": [ { "grade": "COMMON", "acquired": true, "firstAcquiredAt": "2026-11-02T15:01:00Z" }, { "grade": "SUPREME", "acquired": false, "firstAcquiredAt": null } ] } }
```

### 실패 상황

- 토큰 없음·만료 → 401
- 없는 스테이지 → 404

## 5. 도감 보상 수령 API

**Request:** `POST /api/items/codex/:stageId/reward` (로그인 필요)

| Parameter | 타입 | 필수여부 | 설명 |
| --- | --- | --- | --- |
| Authorization | String | 필수 | 헤더. `Bearer <JWT 토큰>` |
| stageId | Number | 필수 | path. 스테이지 번호 |

### Response

| Element | Depth | 값 구분 | 설명 |
| --- | --- | --- | --- |
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| stageId | 2 | 숫자 | 보상을 받은 스테이지 |
| earnedGold | 2 | 숫자 | 받은 보상 골드 |
| codexReductionRate | 2 | 숫자 | 도감 단축률 합계(%) (최대 25) |
| bingoReductionRate | 2 | 숫자 | 빙고 단축률 합계(%) (최대 20) |
| totalReductionRate | 2 | 숫자 | 다음 탐사부터 적용할 단축률(%) = min(도감 + 빙고, 45) |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

### JSON 예시 (성공, 201)

```json
{ "result": "success", "data": { "stageId": 1, "earnedGold": 200, "codexReductionRate": 5, "bingoReductionRate": 0, "totalReductionRate": 5 } }
```

### 실패 상황

- 토큰 없음·만료 → 401
- 없는 스테이지 → 404
- 도감 미완성 → 400
- 이미 수령함 (reward_claimed) → 409

## 6. 합성 규칙 조회 API

**Request:** `GET /api/items/recipes` (로그인 필요)

| Parameter | 타입 | 필수여부 | 설명 |
| --- | --- | --- | --- |
| Authorization | String | 필수 | 헤더. `Bearer <JWT 토큰>` |

### Response

| Element | Depth | 값 구분 | 설명 |
| --- | --- | --- | --- |
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| recipes | 2 | 배열 | 등급별 합성 규칙 |
| fromGrade | 3 | 문자열 | 재료 등급 |
| toGrade | 3 | 문자열 | 결과 등급 |
| requiredCount | 3 | 숫자 | 필요 개수 (4) |
| baseFee | 3 | 숫자 | 기본 골드 수수료 |
| fee | 3 | 숫자 | 내게 적용되는 수수료 (연금술 연구 할인 반영, 올림) |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

### JSON 예시 (성공, 200)

```json
{ "result": "success", "data": { "recipes": [ { "fromGrade": "COMMON", "toGrade": "UNCOMMON", "requiredCount": 4, "baseFee": 10, "fee": 10 } ] } }
```

### 실패 상황

- 토큰 없음·만료 → 401

## 7. 아이템 합성 API (핵심 API)

**Request:** `POST /api/items/syntheses` (로그인 필요)

| Parameter | 타입 | 필수여부 | 설명 |
| --- | --- | --- | --- |
| Authorization | String | 필수 | 헤더. `Bearer <JWT 토큰>` |
| stageId | Number | 필수 | body. 합성할 스테이지 |
| grade | String | 필수 | body. 재료 등급 (COMMON~ANCIENT) |

### Response

| Element | Depth | 값 구분 | 설명 |
| --- | --- | --- | --- |
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| newItem | 2 | 객체 | 생성된 상위 등급 아이템 (userItemId, name, grade) |
| newCodex | 2 | true/false | 처음 얻은 종류인지 (도감 신규 등록) |
| bingoCellIndex | 2 | 숫자/null | 처음 얻은 종류면 빙고판에 배치된 칸 번호 |
| consumedItemIds | 2 | 배열 | 소모된 보유 아이템 번호 4개 (장착 장비 자동 제외) |
| spentFee | 2 | 숫자 | 사용한 수수료 (연금술 연구 할인 반영) |
| gold | 2 | 숫자 | 수수료 차감 후 보유 골드 |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

### JSON 예시 (성공, 201)

```json
{ "result": "success", "data": { "newItem": { "userItemId": 31, "name": "Stage 1 Uncommon", "grade": "UNCOMMON" }, "newCodex": true, "bingoCellIndex": 8, "consumedItemIds": [4, 5, 6, 7], "spentFee": 10, "gold": 110 } }
```

### 실패 상황

- 토큰 없음·만료 → 401
- 필수값 누락·SUPREME 재료 → 400
- 장착 장비 제외 후 재료 4개 미만 → 400
- 골드 부족 → 400

## 8. 빙고판 조회 API

**Request:** `GET /api/items/bingo` (로그인 필요)

| Parameter | 타입 | 필수여부 | 설명 |
| --- | --- | --- | --- |
| Authorization | String | 필수 | 헤더. `Bearer <JWT 토큰>` |

### Response

| Element | Depth | 값 구분 | 설명 |
| --- | --- | --- | --- |
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| board | 2 | 배열 (5×5) | 행 단위 2차원 배열. 칸은 아이템 객체 또는 null |
| filledCount | 2 | 숫자 | 채운 칸 수 (0~25) |
| lines | 2 | 배열 | 완성된 줄 (type: row/column/diagonal, index) |
| lineCount | 2 | 숫자 | 완성된 빙고 수 (0~12) |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

### JSON 예시 (성공, 200)

```json
{ "result": "success", "data": { "board": [ [ null, { "itemId": 1, "name": "Stage 1 Common", "stageId": 1, "grade": "COMMON" }, null, null, null ], [ null, null, null, null, null ], [ null, null, null, null, null ], [ null, null, null, null, null ], [ null, null, null, null, null ] ], "filledCount": 1, "lines": [], "lineCount": 0 } }
```

### 실패 상황

- 토큰 없음·만료 → 401

## 9. 빙고 보상 현황 조회 API

**Request:** `GET /api/items/bingo/rewards` (로그인 필요)

| Parameter | 타입 | 필수여부 | 설명 |
| --- | --- | --- | --- |
| Authorization | String | 필수 | 헤더. `Bearer <JWT 토큰>` |

### Response

| Element | Depth | 값 구분 | 설명 |
| --- | --- | --- | --- |
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| lineCount | 2 | 숫자 | 현재 빙고 수 |
| bingoReductionRate | 2 | 숫자 | 받은 빙고 단축률 합계(%) (최대 20) |
| tiers | 2 | 배열 | 단계별 현황 |
| threshold | 3 | 숫자 | 필요 빙고 수 (1·3·5) |
| reductionRate | 3 | 숫자 | 단축률(%) |
| achieved | 3 | true/false | 달성 여부 |
| claimed | 3 | true/false | 수령 여부 |
| claimedAt | 3 | 날짜 문자열/null | 수령 시각 |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

### JSON 예시 (성공, 200)

```json
{ "result": "success", "data": { "lineCount": 1, "bingoReductionRate": 0, "tiers": [ { "threshold": 1, "reductionRate": 10, "achieved": true, "claimed": false, "claimedAt": null } ] } }
```

### 실패 상황

- 토큰 없음·만료 → 401

## 10. 빙고 보상 수령 API

**Request:** `POST /api/items/bingo/rewards/:threshold` (로그인 필요)

| Parameter | 타입 | 필수여부 | 설명 |
| --- | --- | --- | --- |
| Authorization | String | 필수 | 헤더. `Bearer <JWT 토큰>` |
| threshold | Number | 필수 | path. 보상 단계 (1·3·5) |

### Response

| Element | Depth | 값 구분 | 설명 |
| --- | --- | --- | --- |
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| threshold | 2 | 숫자 | 수령한 단계 |
| reductionRate | 2 | 숫자 | 이번에 받은 단축률(%) |
| bingoReductionRate | 2 | 숫자 | 빙고 단축률 합계(%) (최대 20) |
| codexReductionRate | 2 | 숫자 | 도감 단축률 합계(%) (최대 25) |
| totalReductionRate | 2 | 숫자 | 다음 탐사부터 적용할 단축률(%) = min(도감 + 빙고, 45) |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

### JSON 예시 (성공, 201)

```json
{ "result": "success", "data": { "threshold": 1, "reductionRate": 10, "bingoReductionRate": 10, "codexReductionRate": 5, "totalReductionRate": 15 } }
```

### 실패 상황

- 토큰 없음·만료 → 401
- 없는 단계 (1·3·5가 아님) → 404
- 빙고 수 부족 → 400
- 이미 수령함 → 409
