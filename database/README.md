# Database

- `schema.sql`: 테이블 생성 (실행 시 기존 테이블 삭제)
- `seed.sql`: 스테이지 5개, 아이템 25종, 합성 규칙, 빙고 보상 단계, 연구 5종, 관리자 계정
- 초기화: `server` 폴더에서 `npm run db:init`

| 테이블 | 내용 | 사용 라우터 |
| --- | --- | --- |
| users | 회원, 골드, 인벤토리 칸 수, 장착 장비 1개 | Auth, Character, 전체 |
| stages | 스테이지 5개, 탐사 시간·필요 전투력·보상 골드 | Stage, Battle |
| items | 아이템 25종 (스테이지 × 등급), 전투력·확률·판매가 | Item, Battle |
| synthesis_recipes | 합성 규칙 4개 | Item |
| user_items | 보유 아이템 (1행 = 1개) | Character, Item, Battle |
| stage_unlocks | 영구 해금 기록 | Stage, Battle |
| battles | 탐사 (연속 탐사 회차 수, 고정된 종료 시각, 적용 단축률) | Battle |
| battle_rewards | 탐사 회차별 보상 | Battle, Stage |
| first_clear_rewards | 최초 탐사 보상 수령 기록 | Stage |
| user_codex | 도감 (한 번이라도 획득한 아이템) | Item |
| codex_rewards | 도감 보상 수령 = 탐사 시간 5% 단축 | Item |
| user_bingo_cells | 빙고판 칸 배치 | Item |
| bingo_reward_tiers | 빙고 보상 단계 (1·3·5빙고) | Item |
| bingo_rewards | 빙고 보상 수령 기록 | Item |
| research_types | 연구 5종 정의 | Research |
| user_researches | 사용자별 연구 레벨 | Research, Battle, Item |
| research_logs | 연구 레벨업·초기화 기록 | Research |

중복 방지 제약

- 진행 중 탐사 1개: `battles.uq_battles_one_in_progress`
- 탐사 회차 보상 1회: `battle_rewards` PK (battle_id, round_no)
- 최초 탐사·도감·빙고 보상 1회: 각 테이블 PK (user_id, stage_id / threshold)
- 빙고: 같은 아이템 중복 등록 방지 PK (user_id, item_id), 한 칸 중복 방지 UNIQUE (user_id, cell_index)
- 골드 음수 방지: `users` CHECK 제약
