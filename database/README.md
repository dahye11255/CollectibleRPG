# Database

- `schema.sql`: 테이블 생성 (실행 시 기존 테이블 삭제)
- `seed.sql`: 스테이지 5개, 아이템 25종, 합성 규칙, 관리자 계정
- 초기화: `server` 폴더에서 `npm run db:init`

| 테이블 | 내용 | 사용 라우터 |
| --- | --- | --- |
| users | 회원, 골드, 인벤토리 칸 수, 장착 장비 1개 | Auth, Character |
| stages | 스테이지 5개, 탐사 시간·필요 전투력·보상 골드 | Stage, Battle |
| items | 아이템 25종 (스테이지 × 등급), 전투력·확률·판매가 | Item, Battle |
| synthesis_recipes | 합성 규칙 4개 | Item |
| user_items | 보유 아이템 (1행 = 1개) | Character, Item, Battle |
| stage_unlocks | 영구 해금 기록 | Stage, Battle |
| battles | 탐사 기록, 고정된 end_time, 보상 | Battle |
| first_clear_rewards | 최초 탐사 보상 수령 기록 | Stage |
| user_codex | 도감 (한 번이라도 획득한 아이템) | Item, Battle |
| codex_rewards | 도감 보상 수령 = 탐사 시간 5% 단축 | Item, Character, Battle |

중복 지급 방지

- 진행 중 탐사 1개: `battles.uq_battles_one_in_progress`
- 최초 탐사 보상·도감 보상 1회: 각 테이블의 PK (user_id, stage_id)
- 골드 음수 방지: `users` CHECK 제약
