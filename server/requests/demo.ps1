# CollectibleRPG API 실행 스크립트 (확장 없이 PowerShell로 전체 흐름 확인)
# 실행: server 폴더에서  powershell -ExecutionPolicy Bypass -File .\requests\demo.ps1
# 준비: 다른 터미널에서 npm run dev 로 서버를 켜 둘 것
# 매번 새 계정(demo + 시각)을 만들어 실행하므로 여러 번 돌려도 결과가 같다.

#   -Full 옵션: 탐사가 끝날 때까지 61초 기다려 "탐사 → 보상 → 최초 탐사 보상 → 즉시 완료" 성공 흐름까지 확인
#   예) powershell -ExecutionPolicy Bypass -File .\requests\demo.ps1 -Full

param(
  [switch]$Full,
  [string]$BaseUrl = "http://localhost:3000/api",
  [string]$AdminId = "admin",
  [string]$AdminPassword = "admin1234"
)

$script:passCount = 0
$script:failCount = 0

# API 1개 호출 → 기대 상태 코드와 비교해 PASS/FAIL 출력 → 응답 본문 반환
function Invoke-Api {
  param(
    [string]$Method,
    [string]$Path,
    [int]$Expect,
    [string]$Title,
    $Body = $null,
    [string]$Token = $null
  )

  $headers = @{}
  if ($Token) { $headers["Authorization"] = "Bearer $Token" }

  $params = @{ Method = $Method; Uri = "$BaseUrl$Path"; Headers = $headers; UseBasicParsing = $true }
  if ($null -ne $Body) {
    # 한글이 깨지지 않도록 UTF-8 바이트로 전송 (Windows PowerShell 5.1 대응)
    $json = $Body | ConvertTo-Json -Depth 5
    $params["Body"] = [System.Text.Encoding]::UTF8.GetBytes($json)
    $params["ContentType"] = "application/json; charset=utf-8"
  }

  $status = 0
  $result = $null
  try {
    $response = Invoke-WebRequest @params
    $status = [int]$response.StatusCode
    if ($response.Content) { $result = $response.Content | ConvertFrom-Json }
  } catch {
    $response = $_.Exception.Response
    if ($null -eq $response) {
      Write-Host "서버에 연결할 수 없습니다. 다른 터미널에서 npm run dev 를 실행했는지 확인하세요." -ForegroundColor Red
      exit 1
    }
    $status = [int]$response.StatusCode
    if ($_.ErrorDetails.Message) { $result = $_.ErrorDetails.Message | ConvertFrom-Json }
  }

  $ok = ($status -eq $Expect)
  if ($ok) { $script:passCount++ } else { $script:failCount++ }
  $mark = if ($ok) { "PASS" } else { "FAIL" }
  $color = if ($ok) { "Green" } else { "Red" }

  Write-Host ("[{0}] {1} {2,-6} {3}  (기대 {4}, 실제 {5})  {6}" -f $mark, $status, $Method.ToUpper(), $Path, $Expect, $status, $Title) -ForegroundColor $color
  if ($null -ne $result) {
    $text = $result | ConvertTo-Json -Depth 6 -Compress
    if ($text.Length -gt 300) { $text = $text.Substring(0, 300) + " ..." }
    Write-Host "       $text" -ForegroundColor DarkGray
  }
  return $result
}

function Write-Section([string]$Name) {
  Write-Host ""
  Write-Host "===== $Name =====" -ForegroundColor Cyan
}

$loginId = "demo" + (Get-Date -Format "MMddHHmmss")
$password = "password123"

# ───────────── 공통 ─────────────
Write-Section "서버 확인"
Invoke-Api Get "/health" 200 "서버 동작 확인" | Out-Null

# ───────────── Auth ─────────────
Write-Section "Auth ($loginId)"
Invoke-Api Post "/auth/register" 201 "회원가입" @{ loginId = $loginId; password = $password; nickname = "데모" } | Out-Null
Invoke-Api Post "/auth/register" 409 "같은 아이디로 다시 가입" @{ loginId = $loginId; password = $password; nickname = "데모" } | Out-Null
Invoke-Api Post "/auth/login" 401 "틀린 비밀번호" @{ loginId = $loginId; password = "wrongpass" } | Out-Null
$login = Invoke-Api Post "/auth/login" 200 "로그인" @{ loginId = $loginId; password = $password }
$token = $login.data.token
if (-not $token) {
  Write-Host ""
  Write-Host "로그인에 실패해 이후 요청을 진행할 수 없습니다." -ForegroundColor Red
  Write-Host "500 오류라면 MySQL이 켜져 있는지, server 폴더에서 npm run db:init 을 실행했는지 확인하세요." -ForegroundColor Red
  exit 1
}
Invoke-Api Get "/auth/me" 200 "내 정보" -Token $token | Out-Null
Invoke-Api Get "/auth/me" 401 "토큰 없이 내 정보" | Out-Null

# ───────────── Stage ─────────────
Write-Section "Stage"
Invoke-Api Get "/stages" 200 "스테이지 목록 (Stage 1만 해금)" -Token $token | Out-Null
Invoke-Api Get "/stages/2" 200 "스테이지 상세" -Token $token | Out-Null
Invoke-Api Get "/stages/2/requirements" 200 "진입 조건 (canUnlock: false)" -Token $token | Out-Null
Invoke-Api Get "/stages/1/drops" 200 "드롭 테이블" -Token $token | Out-Null
Invoke-Api Get "/stages/99" 404 "없는 스테이지" -Token $token | Out-Null
Invoke-Api Post "/stages/2/unlock" 403 "해금 (핵심): Stage 1 Supreme 미장착" -Token $token | Out-Null
Invoke-Api Post "/stages/1/first-clear-reward" 400 "최초 탐사 보상: 탐사 기록 없음" -Token $token | Out-Null
Invoke-Api Patch "/stages/5" 403 "관리자 수정: 일반 사용자" @{ requiredPower = 80 } -Token $token | Out-Null
$admin = Invoke-Api Post "/auth/login" 200 "관리자 로그인" @{ loginId = $AdminId; password = $AdminPassword }
if ($admin) {
  Invoke-Api Patch "/stages/5" 200 "관리자 수정: 관리자" @{ requiredPower = 80 } -Token $admin.data.token | Out-Null
}

# ───────────── Character ─────────────
Write-Section "Character"
$me = Invoke-Api Get "/characters/me" 200 "캐릭터 상태" -Token $token
Invoke-Api Get "/characters/me/stats" 200 "능력치 (전투력 10)" -Token $token | Out-Null
$inventory = Invoke-Api Get "/characters/me/inventory" 200 "인벤토리" -Token $token
Invoke-Api Get "/characters/me/inventory?grade=LEGEND" 400 "잘못된 등급 필터" -Token $token | Out-Null
Invoke-Api Post "/characters/me/inventory/expansions" 400 "인벤토리 확장: 골드 부족" -Token $token | Out-Null

$starterId = $me.data.equippedItem.userItemId
Invoke-Api Delete "/characters/me/inventory/$starterId" 409 "판매: 장착 중인 아이템" -Token $token | Out-Null
Invoke-Api Delete "/characters/me/inventory/999999" 404 "판매: 없는 아이템" -Token $token | Out-Null
Invoke-Api Put "/characters/me/equipment" 409 "장착 (핵심): 이미 장착 중" @{ userItemId = $starterId } -Token $token | Out-Null
Invoke-Api Put "/characters/me/equipment" 400 "장착 (핵심): userItemId 누락" @{} -Token $token | Out-Null
Invoke-Api Delete "/characters/me/equipment" 200 "장비 해제" -Token $token | Out-Null
Invoke-Api Delete "/characters/me/equipment" 404 "장비 해제: 장착 장비 없음" -Token $token | Out-Null
Invoke-Api Put "/characters/me/equipment" 200 "장착 (핵심): 해제했던 시작 장비 다시 장착" @{ userItemId = $starterId } -Token $token | Out-Null

# ───────────── Item ─────────────
Write-Section "Item (도감·합성·빙고)"
Invoke-Api Get "/items?grade=SUPREME" 200 "Supreme 아이템 목록" -Token $token | Out-Null
Invoke-Api Get "/items/5" 200 "아이템 상세 (Stage 1 Supreme)" -Token $token | Out-Null
Invoke-Api Get "/items/99" 404 "없는 아이템" -Token $token | Out-Null
Invoke-Api Get "/items/codex" 200 "도감 수집률 (1/25)" -Token $token | Out-Null
Invoke-Api Get "/items/codex/1" 200 "Stage 1 도감 상세" -Token $token | Out-Null
Invoke-Api Post "/items/codex/1/reward" 400 "도감 보상: 미완성" -Token $token | Out-Null
Invoke-Api Get "/items/recipes" 200 "합성 규칙" -Token $token | Out-Null
Invoke-Api Post "/items/syntheses" 400 "합성 (핵심): 재료 부족" @{ stageId = 1; grade = "COMMON" } -Token $token | Out-Null
Invoke-Api Post "/items/syntheses" 400 "합성 (핵심): SUPREME 재료" @{ stageId = 1; grade = "SUPREME" } -Token $token | Out-Null
Invoke-Api Post "/items/syntheses" 400 "합성 (핵심): grade 누락" @{ stageId = 1 } -Token $token | Out-Null
Invoke-Api Get "/items/bingo" 200 "빙고판 (시작 아이템 1칸)" -Token $token | Out-Null
Invoke-Api Get "/items/bingo/rewards" 200 "빙고 보상 현황" -Token $token | Out-Null
Invoke-Api Post "/items/bingo/rewards/1" 400 "빙고 보상: 빙고 부족" -Token $token | Out-Null
Invoke-Api Post "/items/bingo/rewards/2" 404 "빙고 보상: 없는 단계" -Token $token | Out-Null

# ───────────── Battle ─────────────
Write-Section "Battle (탐사)"
Invoke-Api Post "/battles" 400 "탐사 시작: stageId 누락" @{} -Token $token | Out-Null
Invoke-Api Post "/battles" 403 "탐사 시작: 미해금 스테이지" @{ stageId = 2 } -Token $token | Out-Null
Invoke-Api Post "/battles" 400 "탐사 시작: 연구 없이 연속 2회" @{ stageId = 1; repeatCount = 2 } -Token $token | Out-Null
$battle = Invoke-Api Post "/battles" 201 "탐사 시작 (Stage 1, 60초)" @{ stageId = 1 } -Token $token
$battleId = $battle.data.battleId
Invoke-Api Post "/battles" 409 "탐사 시작: 이미 진행 중" @{ stageId = 1 } -Token $token | Out-Null
Invoke-Api Get "/battles/current" 200 "진행 중 탐사" -Token $token | Out-Null
Invoke-Api Get "/battles/$battleId" 200 "탐사 상세" -Token $token | Out-Null
Invoke-Api Post "/battles/$battleId/completion" 400 "완료 (핵심): 종료 시각 전" -Token $token | Out-Null
Invoke-Api Post "/battles/$battleId/instant-completion" 400 "즉시 완료: 골드 부족" -Token $token | Out-Null
Invoke-Api Patch "/battles/$battleId" 400 "취소: 잘못된 status" @{ status = "DONE" } -Token $token | Out-Null

if ($Full) {
  Write-Host "  탐사 종료까지 61초 기다립니다..." -ForegroundColor Yellow
  Start-Sleep -Seconds 61
  Invoke-Api Post "/battles/$battleId/completion" 201 "완료 (핵심): 아이템 1개 + 10골드" -Token $token | Out-Null
  Invoke-Api Post "/battles/$battleId/completion" 409 "완료 (핵심): 같은 탐사 두 번" -Token $token | Out-Null
  Invoke-Api Post "/stages/1/first-clear-reward" 201 "최초 탐사 보상 (100골드)" -Token $token | Out-Null
  Invoke-Api Post "/stages/1/first-clear-reward" 409 "최초 탐사 보상: 두 번" -Token $token | Out-Null
  $second = Invoke-Api Post "/battles" 201 "두 번째 탐사 시작" @{ stageId = 1 } -Token $token
  Invoke-Api Post "/battles/$($second.data.battleId)/instant-completion" 201 "즉시 완료 (골드 사용)" -Token $token | Out-Null
  Invoke-Api Get "/items/bingo" 200 "빙고판 (획득한 아이템 반영)" -Token $token | Out-Null
  Invoke-Api Get "/characters/me/inventory" 200 "인벤토리 (보상 아이템 반영)" -Token $token | Out-Null
} else {
  Invoke-Api Patch "/battles/$battleId" 200 "취소: 보상 없이 취소" @{ status = "CANCELED" } -Token $token | Out-Null
  Invoke-Api Patch "/battles/$battleId" 409 "취소: 이미 취소됨" @{ status = "CANCELED" } -Token $token | Out-Null
  Write-Host "  (보상 성공 흐름은 -Full 옵션으로 실행: 61초 대기)" -ForegroundColor DarkGray
}
Invoke-Api Get "/battles" 200 "탐사 기록" -Token $token | Out-Null

# ───────────── 결과 ─────────────
Write-Host ""
$summaryColor = if ($script:failCount -eq 0) { "Green" } else { "Red" }
Write-Host ("결과: PASS {0} / FAIL {1}" -f $script:passCount, $script:failCount) -ForegroundColor $summaryColor
if ($script:failCount -gt 0) { exit 1 }
