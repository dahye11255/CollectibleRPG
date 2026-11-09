-- CollectibleRPG 기본 데이터 (수치는 docs/game-design.md 초안 기준)

USE project;

-- 스테이지 5개: 기본 탐사 시간 60~300초, 필요 전투력, 탐사 보상 골드, 최초 탐사 보상 골드
INSERT INTO stages (id, name, description, base_duration_sec, required_power, reward_gold, first_clear_gold) VALUES
  (1, '초원', '모험이 시작되는 평화로운 초원', 60, 10, 10, 100),
  (2, '숲', '깊고 어두운 숲', 120, 20, 20, 200),
  (3, '동굴', '광석이 잠든 지하 동굴', 180, 40, 30, 300),
  (4, '화산', '용암이 흐르는 화산 지대', 240, 60, 40, 400),
  (5, '천공', '구름 위의 고대 유적', 300, 80, 50, 500);

-- 아이템 25종: id = (스테이지-1)*5 + 등급순번
-- 전투력 = 등급 기본값(10/20/40/80/160) × 스테이지, 판매가 = 등급 기본값(5/20/80/320/1280) × 스테이지
INSERT INTO items (id, stage_id, grade, name, power, drop_rate, sell_price)
SELECT (s.id - 1) * 5 + g.ord, s.id, g.grade, CONCAT('Stage ', s.id, ' ', g.label),
       g.base_power * s.id, g.rate, g.base_price * s.id
FROM stages s
CROSS JOIN (
  SELECT 1 AS ord, 'COMMON' AS grade, 'Common' AS label, 10 AS base_power, 50.00 AS rate, 5 AS base_price
  UNION ALL SELECT 2, 'UNCOMMON', 'Uncommon', 20, 25.00, 20
  UNION ALL SELECT 3, 'EPIC', 'Epic', 40, 15.00, 80
  UNION ALL SELECT 4, 'ANCIENT', 'Ancient', 80, 9.00, 320
  UNION ALL SELECT 5, 'SUPREME', 'Supreme', 160, 1.00, 1280
) g;

-- 합성 규칙: 4개 → 상위 1개, 수수료 10/40/160/640
INSERT INTO synthesis_recipes (from_grade, to_grade, required_count, fee) VALUES
  ('COMMON', 'UNCOMMON', 4, 10),
  ('UNCOMMON', 'EPIC', 4, 40),
  ('EPIC', 'ANCIENT', 4, 160),
  ('ANCIENT', 'SUPREME', 4, 640);

-- 빙고 보상: 1빙고 10%, 3빙고 5%, 5빙고 5% (합계 최대 20%)
INSERT INTO bingo_reward_tiers (threshold, reduction_rate) VALUES
  (1, 10.00),
  (3, 5.00),
  (5, 5.00);

-- 연구 5종 (비용 = base_cost × cost_multiplier^현재레벨, 올림)
INSERT INTO research_types (id, name, description, max_level, base_cost, cost_multiplier, effect_per_level) VALUES
  ('luck', '행운 연구', 'Common 확률을 레벨당 2%p 줄이고 상위 등급(UC 1, EP 0.6, A 0.3, S 0.1%p)으로 옮긴다', 5, 100, 1.50, 2.00),
  ('alchemy', '연금술 연구', '합성 수수료를 레벨당 5% 줄인다', 5, 100, 1.50, 5.00),
  ('trade', '교역 연구', '탐사 완료 골드 보상을 레벨당 10% 늘린다', 5, 100, 1.50, 10.00),
  ('chrono', '시간술 연구', '즉시 완료 비용을 레벨당 10% 줄인다', 5, 100, 1.50, 10.00),
  ('auto-explore', '자동 탐사 연구', '한 번에 예약할 수 있는 연속 탐사 횟수를 레벨당 1회 늘린다 (기본 1회, 최대 5회)', 4, 300, 2.00, 1.00);

-- 관리자 계정 (ID: admin / 비밀번호: admin1234)
INSERT INTO users (login_id, password_hash, nickname, role) VALUES
  ('admin', '$2b$10$xtmUXpRNqED4gOP3U39N8e14oYDaOMcdUdNAhcxI136wzbbzHKQ0.', '관리자', 'admin');
