// 코드에서 쓰는 게임 수치 (DB에 두지 않은 고정값). 밸런스 조정은 이 파일에서만 한다.
module.exports = {
  GRADES: ["COMMON", "UNCOMMON", "EPIC", "ANCIENT", "SUPREME"],

  // 탐사 시간 단축률(%)
  CODEX_REDUCTION_PER_STAGE: 5, // 도감 1개 완성 보상
  MAX_CODEX_REDUCTION: 25,
  MAX_BINGO_REDUCTION: 20,
  MAX_TOTAL_REDUCTION: 45, // 도감 + 빙고 합산 상한

  CODEX_REWARD_GOLD: 200, // 도감 보상 골드

  // 인벤토리 확장: 1회 +5칸, 100골드, 최대 50칸
  INVENTORY_EXPANSION_SLOTS: 5,
  INVENTORY_EXPANSION_COST: 100,
  MAX_INVENTORY_SLOTS: 50,

  // 즉시 완료: 남은 10초당 1골드 (올림)
  INSTANT_COMPLETION_SECONDS_PER_GOLD: 10,

  // 연구 초기화 환급률
  RESEARCH_RESET_REFUND_RATE: 0.5,

  // 행운 연구: 레벨당 Common에서 빼는 확률(%p)을 상위 등급에 나누는 비율 (합계 1)
  LUCK_DISTRIBUTION: { UNCOMMON: 0.5, EPIC: 0.3, ANCIENT: 0.15, SUPREME: 0.05 },
};
