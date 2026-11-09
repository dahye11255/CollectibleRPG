# Research 라우터 (연구소)

- 기본 경로: `/api/researches`
- 응답 형식: `result` / `data` / `error`
- 연구 5종: 행운(luck), 연금술(alchemy), 교역(trade), 시간술(chrono), 자동 탐사(auto-explore)
- 레벨업 비용 = ceil(기본 비용 × 비용 배수^현재 레벨), 행이 없으면 Lv0

| # | 메서드 | URL | 기능 |
| --- | --- | --- | --- |
| 1 | GET | `/api/researches` | 연구 목록 조회 API |
| 2 | GET | `/api/researches/effects` | 적용 효과 조회 API |
| 3 | GET | `/api/researches/history` | 연구 기록 조회 API |
| 4 | GET | `/api/researches/:researchId` | 연구 상세 조회 API |
| 5 | POST | `/api/researches/:researchId/upgrades` | 연구 레벨업 API **(핵심)** |
| 6 | PATCH | `/api/researches/:researchId` | [관리자] 연구 수치 수정 API |
| 7 | DELETE | `/api/researches/:researchId` | 연구 초기화 API |

## 1. 연구 목록 조회 API

**Request:** `GET /api/researches` (로그인 필요)

| Parameter | 타입 | 필수여부 | 설명 |
| --- | --- | --- | --- |
| Authorization | String | 필수 | 헤더. `Bearer <JWT 토큰>` |

### Response

| Element | Depth | 값 구분 | 설명 |
| --- | --- | --- | --- |
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| gold | 2 | 숫자 | 보유 골드 |
| researches | 2 | 배열 | 연구 5종 |
| researchId | 3 | 문자열 | luck / alchemy / trade / chrono / auto-explore |
| name | 3 | 문자열 | 연구 이름 |
| level | 3 | 숫자 | 내 레벨 |
| maxLevel | 3 | 숫자 | 최대 레벨 |
| nextCost | 3 | 숫자/null | 다음 레벨 비용 (최대 레벨이면 null) |
| currentEffect | 3 | 숫자 | 현재 효과 (단위는 effectUnit) |
| effectUnit | 3 | 문자열 | %p / % / 회 |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

### JSON 예시 (성공, 200)

```json
{ "result": "success", "data": { "gold": 500, "researches": [ { "researchId": "luck", "name": "행운 연구", "level": 1, "maxLevel": 5, "nextCost": 150, "currentEffect": 2, "effectUnit": "%p" } ] } }
```

### 실패 상황

- 토큰 없음·만료 → 401

## 2. 적용 효과 조회 API

**Request:** `GET /api/researches/effects` (로그인 필요)

| Parameter | 타입 | 필수여부 | 설명 |
| --- | --- | --- | --- |
| Authorization | String | 필수 | 헤더. `Bearer <JWT 토큰>` |

### Response

| Element | Depth | 값 구분 | 설명 |
| --- | --- | --- | --- |
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| dropRates | 2 | 객체 | 행운 연구 반영 후 등급별 드롭 확률(%) (COMMON~SUPREME, 합계 100) |
| synthesisFeeDiscountRate | 2 | 숫자 | 합성 수수료 할인율(%) |
| goldBonusRate | 2 | 숫자 | 탐사 골드 보너스(%) |
| instantCostDiscountRate | 2 | 숫자 | 즉시 완료 비용 할인율(%) |
| maxRepeatCount | 2 | 숫자 | 예약 가능한 연속 탐사 횟수 (1~5) |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

### JSON 예시 (성공, 200)

```json
{ "result": "success", "data": { "dropRates": { "COMMON": 48, "UNCOMMON": 26, "EPIC": 15.6, "ANCIENT": 9.3, "SUPREME": 1.1 }, "synthesisFeeDiscountRate": 0, "goldBonusRate": 10, "instantCostDiscountRate": 0, "maxRepeatCount": 1 } }
```

### 실패 상황

- 토큰 없음·만료 → 401

## 3. 연구 기록 조회 API

**Request:** `GET /api/researches/history` (로그인 필요)

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
| logs | 2 | 배열 | 기록 최신순 (logId, researchId, action, fromLevel, toLevel, goldChange, createdAt) |
| page | 2 | 숫자 | 현재 페이지 |
| total | 2 | 숫자 | 전체 개수 |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

### JSON 예시 (성공, 200)

```json
{ "result": "success", "data": { "logs": [ { "logId": 3, "researchId": "luck", "action": "UPGRADE", "fromLevel": 0, "toLevel": 1, "goldChange": -100, "createdAt": "2026-11-09T15:00:00Z" } ], "page": 1, "total": 1 } }
```

### 실패 상황

- 토큰 없음·만료 → 401
- page·size 값 오류 → 400

## 4. 연구 상세 조회 API

**Request:** `GET /api/researches/:researchId` (로그인 필요)

| Parameter | 타입 | 필수여부 | 설명 |
| --- | --- | --- | --- |
| Authorization | String | 필수 | 헤더. `Bearer <JWT 토큰>` |
| researchId | String | 필수 | path. 연구 ID |

### Response

| Element | Depth | 값 구분 | 설명 |
| --- | --- | --- | --- |
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| researchId | 2 | 문자열 | 연구 ID |
| name | 2 | 문자열 | 이름 |
| description | 2 | 문자열 | 설명 |
| level | 2 | 숫자 | 내 레벨 |
| maxLevel | 2 | 숫자 | 최대 레벨 |
| levels | 2 | 배열 | 레벨별 표 (level, cost: 그 레벨로 올리는 비용, effect: 누적 효과) |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

### JSON 예시 (성공, 200)

```json
{ "result": "success", "data": { "researchId": "alchemy", "name": "연금술 연구", "description": "합성 수수료를 레벨당 5% 줄인다", "level": 0, "maxLevel": 5, "levels": [ { "level": 1, "cost": 100, "effect": 5 }, { "level": 2, "cost": 150, "effect": 10 } ] } }
```

### 실패 상황

- 토큰 없음·만료 → 401
- 없는 연구 → 404

## 5. 연구 레벨업 API (핵심 API)

**Request:** `POST /api/researches/:researchId/upgrades` (로그인 필요)

| Parameter | 타입 | 필수여부 | 설명 |
| --- | --- | --- | --- |
| Authorization | String | 필수 | 헤더. `Bearer <JWT 토큰>` |
| researchId | String | 필수 | path. 연구 ID |

### Response

| Element | Depth | 값 구분 | 설명 |
| --- | --- | --- | --- |
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| researchId | 2 | 문자열 | 연구 ID |
| fromLevel | 2 | 숫자 | 이전 레벨 |
| toLevel | 2 | 숫자 | 새 레벨 |
| spentGold | 2 | 숫자 | 사용한 골드 |
| gold | 2 | 숫자 | 차감 후 보유 골드 |
| currentEffect | 2 | 숫자 | 새 레벨의 효과 |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

### JSON 예시 (성공, 201)

```json
{ "result": "success", "data": { "researchId": "luck", "fromLevel": 0, "toLevel": 1, "spentGold": 100, "gold": 400, "currentEffect": 2 } }
```

### 실패 상황

- 토큰 없음·만료 → 401
- 없는 연구 → 404
- 최대 레벨 → 409
- 골드 부족 → 400

## 6. [관리자] 연구 수치 수정 API

**Request:** `PATCH /api/researches/:researchId` (로그인 필요)

| Parameter | 타입 | 필수여부 | 설명 |
| --- | --- | --- | --- |
| Authorization | String | 필수 | 헤더. `Bearer <JWT 토큰>` |
| researchId | String | 필수 | path. 연구 ID |
| baseCost | Number | 선택 | body. 기본 비용 (1 이상 정수) |
| costMultiplier | Number | 선택 | body. 비용 배수 (1 이상) |
| effectPerLevel | Number | 선택 | body. 레벨당 효과 (0 초과) |

### Response

| Element | Depth | 값 구분 | 설명 |
| --- | --- | --- | --- |
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| researchId | 2 | 문자열 | 수정한 연구 ID |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

### JSON 예시 (성공, 200)

```json
{ "result": "success", "data": { "researchId": "trade" } }
```

### 실패 상황

- 토큰 없음·만료 → 401
- 관리자 아님 → 403
- 없는 연구 → 404
- 수정할 값 없음·범위 오류 → 400

## 7. 연구 초기화 API

**Request:** `DELETE /api/researches/:researchId` (로그인 필요)

| Parameter | 타입 | 필수여부 | 설명 |
| --- | --- | --- | --- |
| Authorization | String | 필수 | 헤더. `Bearer <JWT 토큰>` |
| researchId | String | 필수 | path. 연구 ID |

### Response

| Element | Depth | 값 구분 | 설명 |
| --- | --- | --- | --- |
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| researchId | 2 | 문자열 | 연구 ID |
| fromLevel | 2 | 숫자 | 초기화 전 레벨 |
| refundedGold | 2 | 숫자 | 환급 골드 (사용한 골드의 50%, 내림) |
| gold | 2 | 숫자 | 환급 후 보유 골드 |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

### JSON 예시 (성공, 200)

```json
{ "result": "success", "data": { "researchId": "luck", "fromLevel": 2, "refundedGold": 125, "gold": 625 } }
```

### 실패 상황

- 토큰 없음·만료 → 401
- 없는 연구 → 404
- 이미 Lv0 → 409
