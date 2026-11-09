-- CollectibleRPG 스키마
-- 실행: 프로젝트 폴더에서 npm run db:init  (schema.sql → seed.sql 순서로 실행, 기존 테이블은 삭제됨)

CREATE DATABASE IF NOT EXISTS project DEFAULT CHARACTER SET utf8mb4;
USE project;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS research_logs, user_researches, research_types,
  bingo_rewards, bingo_reward_tiers, user_bingo_cells,
  codex_rewards, user_codex, first_clear_rewards, battle_rewards, battles,
  stage_unlocks, user_items, synthesis_recipes, items, stages, users;
SET FOREIGN_KEY_CHECKS = 1;

-- 회원 + 캐릭터 정보 (1:1이라 한 테이블로 관리)
CREATE TABLE users (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  login_id              VARCHAR(20)  NOT NULL UNIQUE,
  password_hash         VARCHAR(100) NOT NULL,
  nickname              VARCHAR(30)  NOT NULL,
  role                  ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  gold                  INT NOT NULL DEFAULT 0,
  inventory_slots       INT NOT NULL DEFAULT 20,
  equipped_user_item_id INT NULL,             -- 장비 슬롯 1개 (FK는 아래 ALTER로 추가)
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (gold >= 0)
);

-- 스테이지 5개 (관리자 PATCH로 수치 조정)
CREATE TABLE stages (
  id                INT PRIMARY KEY,
  name              VARCHAR(30)  NOT NULL,
  description       VARCHAR(255) NOT NULL DEFAULT '',
  base_duration_sec INT NOT NULL,             -- 기본 탐사 시간(초)
  required_power    INT NOT NULL,             -- 탐사 시작에 필요한 전투력
  reward_gold       INT NOT NULL,             -- 탐사 1회 완료 시 골드
  first_clear_gold  INT NOT NULL              -- 최초 탐사 보상 골드
);

-- 아이템 25종 (스테이지 × 등급). ENUM 순서가 곧 등급 순서
CREATE TABLE items (
  id         INT PRIMARY KEY,
  stage_id   INT NOT NULL,
  grade      ENUM('COMMON', 'UNCOMMON', 'EPIC', 'ANCIENT', 'SUPREME') NOT NULL,
  name       VARCHAR(50) NOT NULL,
  power      INT NOT NULL,                    -- 장착 시 전투력
  drop_rate  DECIMAL(5, 2) NOT NULL,          -- 드롭 확률(%)
  sell_price INT NOT NULL,
  UNIQUE KEY uq_items_stage_grade (stage_id, grade),
  FOREIGN KEY (stage_id) REFERENCES stages(id)
);

-- 합성 규칙 (4개 → 상위 1개)
CREATE TABLE synthesis_recipes (
  from_grade     ENUM('COMMON', 'UNCOMMON', 'EPIC', 'ANCIENT') PRIMARY KEY,
  to_grade       ENUM('UNCOMMON', 'EPIC', 'ANCIENT', 'SUPREME') NOT NULL,
  required_count INT NOT NULL DEFAULT 4,
  fee            INT NOT NULL
);

-- 사용자가 보유한 아이템 (1행 = 1개)
CREATE TABLE user_items (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL,
  item_id       INT NOT NULL,
  acquired_from ENUM('STARTER', 'DROP', 'SYNTHESIS') NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_user_items_user (user_id, item_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id)
);

ALTER TABLE users
  ADD CONSTRAINT fk_users_equipped
  FOREIGN KEY (equipped_user_item_id) REFERENCES user_items(id) ON DELETE SET NULL;

-- 영구 해금 기록 (Stage 1은 가입 시 자동 기록)
CREATE TABLE stage_unlocks (
  user_id     INT NOT NULL,
  stage_id    INT NOT NULL,
  unlocked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, stage_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (stage_id) REFERENCES stages(id)
);

-- 탐사 (Battle 라우터). 연속 탐사(자동 탐사 연구)는 repeat_total회를 예약하고, 회차별 종료 시각은
-- started_at + 회차 × duration_sec 으로 계산한다. end_time(마지막 회차 종료 시각)은 시작 시 고정
CREATE TABLE battles (
  id                     INT AUTO_INCREMENT PRIMARY KEY,
  user_id                INT NOT NULL,
  stage_id               INT NOT NULL,
  status                 ENUM('IN_PROGRESS', 'COMPLETED', 'CANCELED') NOT NULL DEFAULT 'IN_PROGRESS',
  duration_sec           INT NOT NULL,              -- 1회차 탐사 시간 (단축률 반영, 올림)
  applied_reduction_rate DECIMAL(5, 2) NOT NULL DEFAULT 0, -- 시작 시 적용한 단축률(%)
  repeat_total           TINYINT NOT NULL DEFAULT 1, -- 예약한 회차 수 (기본 1)
  repeat_done            TINYINT NOT NULL DEFAULT 0, -- 정산 완료한 회차 수
  started_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  end_time               DATETIME NOT NULL,          -- 마지막 회차 종료 시각
  completed_at           DATETIME NULL,
  spent_gold             INT NOT NULL DEFAULT 0,     -- 즉시 완료에 쓴 골드
  -- 진행 중 탐사는 사용자당 1개: IN_PROGRESS일 때만 1, 나머지는 NULL(중복 허용)
  in_progress_flag       TINYINT AS (IF(status = 'IN_PROGRESS', 1, NULL)) STORED,
  UNIQUE KEY uq_battles_one_in_progress (user_id, in_progress_flag),
  KEY idx_battles_user (user_id, id),
  CHECK (repeat_total BETWEEN 1 AND 5),
  CHECK (repeat_done BETWEEN 0 AND repeat_total),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (stage_id) REFERENCES stages(id)
);

-- 탐사 회차별 보상. PK(battle_id, round_no)가 같은 회차의 중복 지급을 막는다
CREATE TABLE battle_rewards (
  battle_id    INT NOT NULL,
  round_no     TINYINT NOT NULL,
  item_id      INT NOT NULL,                -- 지급한 아이템 종류 (판매해도 기록 유지)
  user_item_id INT NULL,                    -- 지급한 보유 아이템 (판매·합성 시 NULL)
  gold         INT NOT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (battle_id, round_no),
  FOREIGN KEY (battle_id) REFERENCES battles(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id),
  FOREIGN KEY (user_item_id) REFERENCES user_items(id) ON DELETE SET NULL
);

-- 스테이지 최초 탐사 보상 수령 (중복 수령은 PK로 차단)
CREATE TABLE first_clear_rewards (
  user_id    INT NOT NULL,
  stage_id   INT NOT NULL,
  claimed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, stage_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (stage_id) REFERENCES stages(id)
);

-- 도감: 한 번이라도 획득한 아이템 (소모·판매해도 남음)
CREATE TABLE user_codex (
  user_id           INT NOT NULL,
  item_id           INT NOT NULL,
  first_acquired_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, item_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id)
);

-- 도감 보상 수령 = 탐사 시간 5% 단축 버프 (중복 수령은 PK로 차단)
CREATE TABLE codex_rewards (
  user_id    INT NOT NULL,
  stage_id   INT NOT NULL,
  claimed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, stage_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (stage_id) REFERENCES stages(id)
);

-- ───────────── 빙고 (Bingo 라우터) ─────────────

-- 빙고판: 아이템 종류를 처음 얻으면 빈칸 하나에 무작위 배치, 위치는 영구 유지
CREATE TABLE user_bingo_cells (
  user_id    INT NOT NULL,
  item_id    INT NOT NULL,
  cell_index TINYINT NOT NULL,              -- 0~24 (행 = index DIV 5, 열 = index MOD 5)
  placed_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, item_id),           -- 같은 아이템 중복 등록 방지
  UNIQUE KEY uq_bingo_cell (user_id, cell_index), -- 한 칸에 아이템 여러 개 방지
  CHECK (cell_index BETWEEN 0 AND 24),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id)
);

-- 빙고 보상 단계 (1·3·5빙고, 단축률은 관리자가 조정 가능)
CREATE TABLE bingo_reward_tiers (
  threshold      TINYINT PRIMARY KEY,
  reduction_rate DECIMAL(5, 2) NOT NULL     -- 탐사 시간 단축률(%)
);

-- 빙고 보상 수령 기록 (단계별 1회)
CREATE TABLE bingo_rewards (
  user_id    INT NOT NULL,
  threshold  TINYINT NOT NULL,
  claimed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, threshold),         -- 중복 수령 방지
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (threshold) REFERENCES bingo_reward_tiers(threshold)
);

-- ───────────── 연구소 (Research 라우터) ─────────────

-- 연구 5종: 행운, 연금술, 교역, 시간술, 자동 탐사
CREATE TABLE research_types (
  id               VARCHAR(20) PRIMARY KEY,  -- luck, alchemy, trade, chrono, auto-explore
  name             VARCHAR(30) NOT NULL,
  description      VARCHAR(255) NOT NULL,
  max_level        TINYINT NOT NULL,
  base_cost        INT NOT NULL,             -- Lv0 → Lv1 비용
  cost_multiplier  DECIMAL(4, 2) NOT NULL,   -- 레벨마다 비용 배수
  effect_per_level DECIMAL(5, 2) NOT NULL    -- 레벨당 효과 (단위는 연구마다 다름)
);

-- 사용자별 연구 레벨 (행이 없으면 Lv0)
CREATE TABLE user_researches (
  user_id     INT NOT NULL,
  research_id VARCHAR(20) NOT NULL,
  level       TINYINT NOT NULL DEFAULT 0,
  spent_gold  INT NOT NULL DEFAULT 0,        -- 이 연구에 쓴 골드 합계 (초기화 환급 계산용)
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, research_id),
  CHECK (level >= 0),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (research_id) REFERENCES research_types(id)
);

-- 연구 기록 (레벨업·초기화)
CREATE TABLE research_logs (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  research_id VARCHAR(20) NOT NULL,
  action      ENUM('UPGRADE', 'RESET') NOT NULL,
  from_level  TINYINT NOT NULL,
  to_level    TINYINT NOT NULL,
  gold_change INT NOT NULL,                  -- 레벨업은 음수(사용), 초기화는 양수(환급)
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_research_logs_user (user_id, id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (research_id) REFERENCES research_types(id)
);
