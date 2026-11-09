// 필수 환경변수가 없으면 원인을 알려 주고 종료한다.
// (.env는 GitHub에 올라가지 않으므로 처음 받은 팀원은 직접 만들어야 함)
const REQUIRED = ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME", "JWT_SECRET"];

function checkEnv() {
  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`[환경변수 오류] 없는 값: ${missing.join(", ")}`);
    console.error("프로젝트 폴더(package.json이 있는 곳)에 .env 파일이 있는지 확인하세요. 없으면 .env.example을 복사해 .env로 만드세요.");
    process.exit(1);
  }
}

module.exports = checkEnv;
