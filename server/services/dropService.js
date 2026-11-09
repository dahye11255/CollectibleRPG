// 드롭 등급 뽑기. rng는 0 이상 1 미만을 돌려주는 함수 (테스트에서 고정값을 넣는다)
const { GRADES } = require("./gameConfig");

function rollGrade(dropRates, rng = Math.random) {
  const roll = rng() * 100;
  let cumulative = 0;
  for (const grade of GRADES) {
    cumulative += dropRates[grade];
    if (roll < cumulative) return grade;
  }
  return GRADES[0]; // 소수 오차로 끝까지 온 경우 (합계 100이면 사실상 없음)
}

module.exports = { rollGrade };
