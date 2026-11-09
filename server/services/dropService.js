// 드롭 등급 뽑기. 난수는 0 이상 1 미만을 돌려주는 함수
const { GRADES } = require("./gameConfig");

let randomSource = Math.random;

// 테스트에서 드롭 결과를 고정할 때 사용 (예: setRandomSource(() => 0.995) → SUPREME)
function setRandomSource(fn) {
  randomSource = fn || Math.random;
}

function rollGrade(dropRates, rng = randomSource) {
  const roll = rng() * 100;
  let cumulative = 0;
  for (const grade of GRADES) {
    cumulative += dropRates[grade];
    if (roll < cumulative) return grade;
  }
  return GRADES[0]; // 소수 오차로 끝까지 온 경우 (합계 100이면 사실상 없음)
}

module.exports = { rollGrade, setRandomSource };
