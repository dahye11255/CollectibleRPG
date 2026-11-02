-- CollectibleRPG 스키마
-- 실행: server 폴더에서 npm run db:init  (schema.sql → seed.sql 순서로 실행, 기존 테이블은 삭제됨)

CREATE DATABASE IF NOT EXISTS project DEFAULT CHARACTER SET utf8mb4;
USE project;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS codex_rewards, user_codex, first_clear_rewards, battles,
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

-- 탐사 (Battle 라우터). end_time은 시작 시 고정
CREATE TABLE battles (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  user_id             INT NOT NULL,
  stage_id            INT NOT NULL,
  status              ENUM('IN_PROGRESS', 'COMPLETED', 'CANCELED') NOT NULL DEFAULT 'IN_PROGRESS',
  duration_sec        INT NOT NULL,
  started_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  end_time            DATETIME NOT NULL,
  completed_at        DATETIME NULL,
  reward_user_item_id INT NULL,
  reward_gold         INT NULL,
  spent_gold          INT NOT NULL DEFAULT 0,  -- 즉시 완료에 쓴 골드
  -- 진행 중 탐사는 사용자당 1개: IN_PROGRESS일 때만 1, 나머지는 NULL(중복 허용)
  in_progress_flag    TINYINT AS (IF(status = 'IN_PROGRESS', 1, NULL)) STORED,
  UNIQUE KEY uq_battles_one_in_progress (user_id, in_progress_flag),
  KEY idx_battles_user (user_id, id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (stage_id) REFERENCES stages(id),
  FOREIGN KEY (reward_user_item_id) REFERENCES user_items(id) ON DELETE SET NULL
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
