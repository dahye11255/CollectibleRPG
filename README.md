# CollectibleRPG

탐사로 아이템을 모으고, 합성해서 다음 스테이지를 해금하는 방치형 수집 RPG의 **REST API 서버**입니다.

- 기술: Node.js, Express 5, MySQL 8 (`mysql2`), JWT 인증
- 테스트: Jest + Supertest (실제 MySQL `project` DB 사용)
- 프런트엔드는 과제 범위에 포함하지 않는다.

## 과제 기준 충족 현황

| 기준 | 현황 |
| --- | --- |
| 라우터 4개 이상 (회원 관리 제외) | **5개**: Stage, Battle, Item, Character, Research |
| 라우터별 API 6개 이상 | Stage 7, Battle 7, Item 10, Character 7, Research 7 (Auth 3은 개수 제외, 총 41개) |
| 라우터별 핵심 API 테스트 | 5개 라우터 모두 작성 (전체 테스트 111개) |
| REST 설계 | URL은 명사, 동작은 HTTP 메서드로 구분, 응답 형식 `result`/`data`/`error` 통일 |

## 폴더 구조

```text
CollectibleRPG/
├── app.js               # Express 앱 설정 (테스트에서도 사용)
├── server.js            # 서버 실행
├── db.js                # MySQL 연결 풀
├── routes/              # 라우터: 요청 검사와 응답
├── services/            # 서비스: DB 처리와 게임 규칙
├── middlewares/         # JWT 인증, 에러 처리
├── utils/               # 응답 형식, 트랜잭션, 요청 값 검사
├── config/              # 환경변수 확인
├── scripts/initDb.js    # DB 초기화 (npm run db:init)
├── tests/               # Jest 테스트 (라우터별 + 공유 서비스)
├── requests/            # REST Client 요청 파일 (수동 확인용)
├── database/            # schema.sql, seed.sql
└── docs/                # 게임 기획서, API 명세
```

## 실행 방법

모든 명령은 이 폴더(`package.json`이 있는 곳)에서 실행한다. MySQL 서버가 켜져 있어야 한다.

1. 패키지 설치: `npm install`
2. 환경변수 파일 만들기: `copy .env.example .env` (macOS·Linux는 `cp .env.example .env`)
   - 기본값: DB 이름 `project`, 사용자 `root`, 비밀번호 `1234`
3. DB 초기화 (테이블 16개 생성, 기존 데이터 삭제): `npm run db:init`
   - `확인: stages 5개, items 25개`가 나오면 성공
4. 서버 실행: `npm run dev` → `http://localhost:3000/api/health`

시드 관리자 계정: `admin` / `admin1234`

## 테스트

테스트는 서버를 켜지 않아도 된다(Supertest가 앱을 직접 실행). MySQL과 `npm run db:init`만 필요하다. 테스트용 사용자는 실행할 때 만들고 끝나면 삭제한다.

전체 테스트:

```text
npm test
```

라우터별 핵심 API 테스트:

```text
npx jest tests/stages.test.js -t "unlock" --verbose
npx jest tests/battles.test.js -t "completion \(핵심" --verbose
npx jest tests/items.test.js -t "syntheses \(핵심" --verbose
npx jest tests/characters.test.js -t "PUT /api/characters" --verbose
npx jest tests/researches.test.js -t "upgrades" --verbose
```

| 라우터 | 핵심 API | 테스트 파일 |
| --- | --- | --- |
| Stage | `POST /api/stages/:stageId/unlock` 스테이지 해금 | `tests/stages.test.js` |
| Battle | `POST /api/battles/:battleId/completion` 탐사 완료·보상 | `tests/battles.test.js` |
| Item | `POST /api/items/syntheses` 아이템 합성 | `tests/items.test.js` |
| Character | `PUT /api/characters/me/equipment` 장비 장착 | `tests/characters.test.js` |
| Research | `POST /api/researches/:researchId/upgrades` 연구 레벨업 | `tests/researches.test.js` |

그 밖에 `auth.test.js`(회원 관리), `setup.test.js`(응답·에러·JWT), `shared.test.js`(빙고 판정·아이템 지급·확률 등 공유 서비스)가 있다.

## 설계 요약

- **계층 분리**: 라우터는 요청 검사와 응답만, 서비스는 DB 처리와 규칙만 담당한다.
- **아이템 지급 단일 경로**: 가입, 탐사 보상, 합성 모두 `services/inventoryService.grantItem`만 사용한다. 인벤토리 검사 → 지급 → 도감 기록 → 빙고 칸 배치가 한 트랜잭션에서 처리되어 누락 경로가 없다.
- **중복 지급·동시 요청 방지**: 사용자 행 잠금(`SELECT ... FOR UPDATE`), 상태 검사, DB 제약(PK·UNIQUE)을 함께 쓴다. 동시 요청 테스트로 확인했다.
- **서버 타이머 없음**: 탐사 시간은 DB 시각(`NOW()`)으로 판단하고, 종료 시각은 시작할 때 DB에 고정한다.
- **게임 수치 관리**: 관리자가 바꿀 수 있는 값(스테이지, 연구, 빙고 보상)은 DB에, 고정 규칙(인벤토리 확장 비용, 단축률 상한 등)은 `services/gameConfig.js`에 둔다.

## 문서

- [게임 기획서](docs/game-design.md): 탐사, Supreme Door-lock, 합성, 도감, 빙고, 연구소 규칙
- [REST API 명세](docs/api/README.md): 라우터별 Request·Response 표, 초기안 대비 변경 내역, 테스트 계획
- [DB 테이블](database/README.md): 테이블 16개와 중복 방지 제약

## 제출 시 주의

- `node_modules` 폴더는 제외한다 (`.gitignore`에 포함되어 있음).
- `.env`는 제외하고 `.env.example`을 함께 제출한다.
