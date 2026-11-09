# CollectibleRPG REST API 명세

버전 1.2 · 2026-11-09 (빙고는 Item 라우터에 포함, Research 라우터, 연속 탐사) · 게임 규칙은 [../game-design.md](../game-design.md) 참고

## REST 설계 규칙

- URL에는 명사 복수형만 쓰고 동사는 넣지 않는다. (`/users/add` ❌ → `POST /users` ✅)
- 메서드는 의미대로 쓴다. GET 조회(데이터 변경 없음) · POST 생성·처리 · PUT 교체 · PATCH 일부 수정 · DELETE 삭제
- 상태 코드: 200 성공 · 201 생성 · 400 잘못된 요청 · 401 미인증 · 403 권한 없음 · 404 없음 · 409 중복·상태 충돌
- 인증: `Authorization: Bearer <JWT>` 헤더 (Auth의 signup·login 제외 전부 필요)
- 응답 형식 통일
  - 성공: `{ "result": "success", "data": { ... } }`
  - 실패: `{ "result": "fail", "error": "실패 이유" }`

## 라우터 요약 (과제 기준: 회원 관리 제외 4개 이상, 라우터당 6개 이상)

모든 경로는 `/api`로 시작한다.

| 라우터 | 파일 | API 수 | 과제 인정 | 핵심 API |
| --- | --- | ---: | --- | --- |
| Auth | [auth.md](auth.md) | 3 | 개수 미포함 | - |
| Stage | [stages.md](stages.md) | 7 | 인정 | `POST /api/stages/:stageId/unlock` |
| Battle (탐사) | [battles.md](battles.md) | 7 | 인정 | `POST /api/battles/:battleId/completion` |
| Item (도감·합성·빙고) | [items.md](items.md) | 10 | 인정 | `POST /api/items/syntheses` |
| Character | [characters.md](characters.md) | 7 | 인정 | `PUT /api/characters/me/equipment` |
| Research (연구소) | [researches.md](researches.md) | 7 | 인정 | `POST /api/researches/:researchId/upgrades` |
| **합계** | | **41** | **5개 인정** | |

- 모든 라우터가 7개 이상이라서, 구현 중 하나를 합치거나 빼도 6개 기준을 유지한다.
- 인정 라우터가 5개라서, 하나가 미완성이어도 4개 기준을 유지한다.
- 우선순위: 필수(Stage·Battle·Item·Character) → Research

## 라우터 간 공유 로직

| 공유 서비스 | 역할 | 사용하는 곳 |
| --- | --- | --- |
| `inventoryService.grantItem` | 인벤토리 빈칸 검사 → 아이템 지급 → 도감 기록 → 처음 얻은 종류면 빙고 칸 배치 (한 트랜잭션) | 회원가입, 탐사 완료·즉시 완료·취소 정산, 합성 |
| `buffService` | 탐사 시간 단축률 = min(도감 + 빙고, 45%), 탐사 시간 계산(올림) | 탐사 시작, Character 조회, 빙고·도감 보상 응답 |
| `researchService.getEffects` | 연구 레벨 → 드롭 확률, 수수료 할인, 골드 보너스, 즉시 완료 할인, 연속 탐사 횟수 | 탐사, 합성, 연구 효과 조회 |
| `dropService` | 확률표에 따라 등급 뽑기 (난수 주입 가능) | 탐사 회차 정산 |

## 초기 계획안 대비 변경

| 초기 계획안 | 최종 | 변경 이유 |
| --- | --- | --- |
| `GET /stages/:id/check-entry` + `GET /stages/:id/requirements` | `GET /api/stages/:id/requirements` (충족 여부 포함) | 같은 정보를 조회하는 중복 API를 하나로 합침 |
| (없음) | `POST /api/stages/:id/unlock` | 해금은 상태를 바꾸므로 GET이 아니라 POST. 영구 해금 기록 |
| `GET /stages/:id/drop-table` | `GET /api/stages/:id/drops` | URL을 명사로 |
| `GET /stages/:id/reward` | `POST /api/stages/:id/first-clear-reward` | 보상 지급은 데이터를 바꾸므로 GET 금지 |
| (없음) | `PATCH /api/stages/:id` (관리자) | 코드 수정 없이 탐사 시간·전투력 조정 |
| `/api/battle` + `POST /start` | `POST /api/battles` | URL에 동사 금지, 복수형 |
| `GET /status` | `GET /api/battles/current` | 진행 중 탐사라는 리소스를 명확히 |
| `POST /complete`, `POST /speed-up` | `POST /api/battles/:id/completion`, `/:id/instant-completion` | 어느 탐사인지 경로에 표시, 명사화 |
| `GET /history` | `GET /api/battles` | 목록 조회는 컬렉션 GET |
| (없음) | `GET /api/battles/:id`, `PATCH /api/battles/:id` (취소) | 상세 조회, 취소 추가로 6개 이상 확보 |
| `POST /codex/reward` | `POST /api/items/codex/:stageId/reward` | 어느 스테이지 보상인지 경로에 표시 |
| `POST /craft`, `GET /craft/recipes` | `POST /api/items/syntheses`, `GET /api/items/recipes` | 동사 craft를 명사로 |
| (없음) | `GET /api/items/:id`, `GET /api/items/codex/:stageId` | 아이템 상세, 스테이지별 도감 상세 추가로 6개 이상 확보 |
| `/api/character/status` | `GET /api/characters/me` | 내 캐릭터 리소스 자체 |
| `POST /inventory/expand` | `POST /api/characters/me/inventory/expansions` | 동사 expand를 명사로 |
| `POST /equip`, `POST /unequip` | `PUT`·`DELETE /api/characters/me/equipment` | 같은 리소스를 메서드로 구분 |
| (없음) | `DELETE /api/characters/me/inventory/:userItemId` | 아이템 판매 (골드 획득처) |
| (없음) | `/api/items/bingo` 3개 (빙고판, 보상 현황, 보상 수령) | 아이템 도감 빙고 시스템을 Item 라우터에 추가 (v1.2) |
| (없음) | `/api/researches` 7개 | 골드 사용처: 연구소 (v1.1) |
| `POST /api/battles` 1회 탐사 | `repeatCount` 추가, 회차별 정산 | 자동 탐사 연구 (타이머 없이 회차별 종료 시각 계산, v1.1) |

## 라우터별 핵심 API 테스트 계획 (Jest + Supertest)

테스트 파일 위치: `server/tests/<라우터>.test.js` · 실제 `project` DB 사용 (테스트용 사용자만 만들고 끝나면 삭제) · 난수와 현재 시각은 주입해서 고정

| 라우터 | 핵심 API | 테스트 케이스 |
| --- | --- | --- |
| Stage | 스테이지 해금 | ① 직전 Supreme 장착 → 201, 목록에서 unlocked=true ② 미장착 → 403 ③ 이미 해금 → 409 ④ 토큰 없음 → 401 |
| Battle | 탐사 완료 및 보상 수령 | ① 종료 시각 이후 → 201, 아이템·골드 지급 ② 종료 시각 전 → 400 ③ 같은 탐사 두 번 → 409 ④ 인벤토리 가득 참 → 409 ⑤ 3회 연속 중 2회차만 끝남 → 2회 정산, IN_PROGRESS 유지 |
| Item | 아이템 합성 | ① 4개 → 201, 재료 4개 삭제·상위 1개 생성·수수료 차감 ② 장착 장비 제외 후 3개 → 400 ③ SUPREME 재료 → 400 ④ 골드 부족 → 400 |
| Character | 장비 장착 | ① 정상 장착 → 200, 전투력 반영 ② 남의 아이템 → 404 ③ 교체 시 replacedItemId 반환 ④ 토큰 없음 → 401 |
| (추가) Item | 빙고 보상 수령 | ① 1빙고 달성 → 201, 10% ② 빙고 부족 → 400 ③ 재수령 → 409 ④ 2단계 → 404 ⑤ 도감 25% + 빙고 20% → 합계 45% |
| Research | 연구 레벨업 | ① 골드 충분 → 201, 레벨 +1·골드 차감 ② 골드 부족 → 400 ③ 최대 레벨 → 409 ④ 동시 요청 2개 → 1번만 성공 |
| (추가) 빙고 배치 | 공유 서비스 | 첫 획득만 배치, 재획득 시 그대로, 25종 → 25칸 모두 다른 위치, 판매·합성 후 유지, 인벤토리 가득 참이면 미배치, 동시 지급 시 칸 중복 없음 |
| (추가) 빙고 판정 | 단위 테스트 | 빈 판 0줄, 가로·세로·대각선 각 1줄, 꽉 찬 판 12줄 |
| (추가) Battle | 탐사 시작 | 단축률 15%일 때 durationSec = ceil(60 × 0.85) = 51, 장비 없음 → 400, 연구 레벨 초과 repeatCount → 400 |
| (추가) 드롭 로직 | 단위 테스트 | 난수 경계값으로 등급 검증, 행운 Lv5 확률표 합계 100%, 10만 회 시뮬레이션 비율 ±0.5%p |

테스트 실행 결과 캡처는 보고서 "라우터 별 핵심 API 테스트 코드 및 그 결과"에 넣는다.

## 보고서 양식 대응

- 각 라우터 파일의 API 항목(Request, Parameter 표, Response 표, Json)을 보고서 "API 설계"에 그대로 옮긴다.
- 핵심 API 5개(라우터별 1개)는 코드 캡처와 간단한 설명, 테스트 코드와 결과 캡처를 추가한다.
