# Character 라우터

기본 경로: `/api/characters/me` · 응답 형식: `result` / `data` / `error`

| # | 메서드 | URL | 기능 |
|---|---|---|---|
| 1 | GET | `/api/characters/me` | 캐릭터 상태 조회 API |
| 2 | GET | `/api/characters/me/stats` | 능력치 조회 API |
| 3 | GET | `/api/characters/me/inventory` | 인벤토리 조회 API |
| 4 | POST | `/api/characters/me/inventory/expansions` | 인벤토리 확장 API |
| 5 | DELETE | `/api/characters/me/inventory/:userItemId` | 아이템 판매 API |
| 6 | PUT | `/api/characters/me/equipment` | 장비 장착 API **(핵심)** |
| 7 | DELETE | `/api/characters/me/equipment` | 장비 해제 API |

## 1. 캐릭터 상태 조회 API

Request: GET, `/api/characters/me` (로그인 필요)

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| Authorization | String | 필수 | 헤더. `Bearer <JWT 토큰>` |

Response

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| nickname | 2 | 문자열 | 닉네임 |
| gold | 2 | 숫자 | 골드 잔액 |
| equippedItem | 2 | 객체/null | 착용 중인 장비 |
| timeReductionRate | 2 | 숫자 | 적용 중인 영구 단축 버프(%) |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

Json (성공, 200)

```json
{ "result": "success", "data": { "nickname": "용사", "gold": 120, "equippedItem": { "userItemId": 3, "name": "Stage 1 Common" }, "timeReductionRate": 10 } }
```

실패 상황

- 토큰 없음·만료 → 401

## 2. 능력치 조회 API

Request: GET, `/api/characters/me/stats` (로그인 필요)

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| Authorization | String | 필수 | 헤더. `Bearer <JWT 토큰>` |

Response

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| power | 2 | 숫자 | 현재 전투력 (장착 장비 기준) |
| timeReductionRate | 2 | 숫자 | 도감 영구 단축 버프 합계(%) |
| completedCodexStages | 2 | 배열 | 도감 보상을 받은 스테이지 번호 |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

Json (성공, 200)

```json
{ "result": "success", "data": { "power": 10, "timeReductionRate": 10, "completedCodexStages": [1, 2] } }
```

실패 상황

- 토큰 없음·만료 → 401

## 3. 인벤토리 조회 API

Request: GET, `/api/characters/me/inventory` (로그인 필요)

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| Authorization | String | 필수 | 헤더. `Bearer <JWT 토큰>` |
| stageId | Number | 선택 | query. 스테이지 필터 |
| grade | String | 선택 | query. 등급 필터 |

Response

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| slots | 2 | 숫자 | 최대 칸 수 |
| usedSlots | 2 | 숫자 | 사용 중인 칸 수 |
| items | 2 | 배열 | 보유 아이템 (userItemId, name, grade, equipped) |
| countsByGrade | 2 | 객체 | 등급별 보유 수량 |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

Json (성공, 200)

```json
{ "result": "success", "data": { "slots": 20, "usedSlots": 7, "items": [ { "userItemId": 3, "name": "Stage 1 Common", "grade": "COMMON", "equipped": true } ], "countsByGrade": { "COMMON": 5, "UNCOMMON": 2 } } }
```

실패 상황

- 토큰 없음·만료 → 401
- 잘못된 grade 값 → 400

## 4. 인벤토리 확장 API

Request: POST, `/api/characters/me/inventory/expansions` (로그인 필요)

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| Authorization | String | 필수 | 헤더. `Bearer <JWT 토큰>` |

Response

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| slots | 2 | 숫자 | 확장 후 최대 칸 수 |
| spentGold | 2 | 숫자 | 사용한 골드 |
| gold | 2 | 숫자 | 차감 후 골드 |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

Json (성공, 201)

```json
{ "result": "success", "data": { "slots": 25, "spentGold": 100, "gold": 20 } }
```

실패 상황

- 토큰 없음·만료 → 401
- 골드 부족 → 400
- 최대 칸 수 도달 → 409

## 5. 아이템 판매 API

Request: DELETE, `/api/characters/me/inventory/:userItemId` (로그인 필요)

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| Authorization | String | 필수 | 헤더. `Bearer <JWT 토큰>` |
| userItemId | Number | 필수 | path. 판매할 보유 아이템 번호 |

Response

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| userItemId | 2 | 숫자 | 판매한 아이템 번호 |
| earnedGold | 2 | 숫자 | 획득 골드 |
| gold | 2 | 숫자 | 판매 후 골드 |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

Json (성공, 200)

```json
{ "result": "success", "data": { "userItemId": 4, "earnedGold": 5, "gold": 125 } }
```

실패 상황

- 토큰 없음·만료 → 401
- 내 아이템이 아님·없는 아이템 → 404
- 장착 중인 아이템 → 409

## 6. 장비 장착 API (핵심 API)

Request: PUT, `/api/characters/me/equipment` (로그인 필요)

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| Authorization | String | 필수 | 헤더. `Bearer <JWT 토큰>` |
| userItemId | Number | 필수 | body. 장착할 보유 아이템 번호 |

Response

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| equippedItem | 2 | 객체 | 장착한 아이템 (userItemId, name, grade) |
| replacedItemId | 2 | 숫자/null | 교체되어 해제된 아이템 번호 |
| power | 2 | 숫자 | 장착 후 전투력 |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

Json (성공, 200)

```json
{ "result": "success", "data": { "equippedItem": { "userItemId": 9, "name": "Stage 1 Supreme", "grade": "SUPREME" }, "replacedItemId": 3, "power": 160 } }
```

실패 상황

- 토큰 없음·만료 → 401
- userItemId 누락 → 400
- 내 아이템이 아님·없는 아이템 → 404
- 이미 장착 중 → 409

## 7. 장비 해제 API

Request: DELETE, `/api/characters/me/equipment` (로그인 필요)

| Parameter | 타입 | 필수여부 | 설명 |
|---|---|---|---|
| Authorization | String | 필수 | 헤더. `Bearer <JWT 토큰>` |

Response

| Element | Depth | 값 구분 | 설명 |
|---|---|---|---|
| result | 1 | success/fail | 요청 성공·실패 여부 |
| data | 1 | 객체 | 성공 시 결과 |
| unequippedItemId | 2 | 숫자 | 해제한 아이템 번호 |
| power | 2 | 숫자 | 해제 후 전투력 (0) |
| error | 1 | 에러 문자열 | 실패 시 실패 이유 |

Json (성공, 200)

```json
{ "result": "success", "data": { "unequippedItemId": 9, "power": 0 } }
```

실패 상황

- 토큰 없음·만료 → 401
- 장착 중인 장비 없음 → 404
