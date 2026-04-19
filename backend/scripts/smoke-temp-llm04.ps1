$ErrorActionPreference = 'Stop'

$base = 'http://127.0.0.1:3001'
$now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$results = New-Object System.Collections.Generic.List[object]

function Clip([string]$s) {
  if ($null -eq $s) { return '' }
  if ($s.Length -gt 140) { return $s.Substring(0, 140) + '...' }
  return $s
}

function Add-Result([string]$name, [bool]$pass, [string]$detail, [int]$status = 200) {
  $results.Add([pscustomobject]@{
      name = $name
      pass = $pass
      status = $status
      detail = $detail
    })
}

function Get-StatusCode($err) {
  try { return [int]$err.Exception.Response.StatusCode } catch { return -1 }
}

function Get-ErrorBody($err) {
  try {
    $reader = New-Object System.IO.StreamReader($err.Exception.Response.GetResponseStream())
    return $reader.ReadToEnd()
  }
  catch {
    return $err.Exception.Message
  }
}

function New-ChatBody([string]$prompt, [string]$session, [string]$user) {
  return @{
    prompt = $prompt
    sessionId = $session
    userId = $user
    conversationHistory = @()
    timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  }
}

function Post-Chat([string]$prompt, [string]$session, [string]$user, [array]$conversationHistory = @()) {
  $payload = New-ChatBody $prompt $session $user
  $payload.conversationHistory = $conversationHistory
  $body = $payload | ConvertTo-Json -Depth 8
  return Invoke-RestMethod -Method Post -Uri "$base/api/agent/chat" -Headers @{ 'x-user-id' = $user } -ContentType 'application/json' -Body $body -TimeoutSec 90
}

# 1) Health and status
try {
  $h = Invoke-RestMethod -Method Get -Uri "$base/api/health" -TimeoutSec 30
  Add-Result 'health' ($h.status -eq 'ok') ("status=$($h.status)")
}
catch {
  Add-Result 'health' $false (Get-ErrorBody $_) (Get-StatusCode $_)
}

try {
  $s = Invoke-RestMethod -Method Get -Uri "$base/api/agent/status" -Headers @{ 'x-user-id' = 'smoke-meta' } -TimeoutSec 30
  $ok = $null -ne $s.llm -and $null -ne $s.mode -and $null -ne $s.circuitState
  Add-Result 'agent-status' $ok ("llm=$($s.llm), mode=$($s.mode), circuit=$($s.circuitState)")
}
catch {
  Add-Result 'agent-status' $false (Get-ErrorBody $_) (Get-StatusCode $_)
}

try {
  $qa = Invoke-RestMethod -Method Get -Uri "$base/api/agent/quick-actions" -Headers @{ 'x-user-id' = 'smoke-meta' } -TimeoutSec 30
  $count = @($qa.actions).Count
  Add-Result 'quick-actions' ($count -ge 5) ("actions=$count")
}
catch {
  Add-Result 'quick-actions' $false (Get-ErrorBody $_) (Get-StatusCode $_)
}

try {
  $lh = Invoke-RestMethod -Method Get -Uri "$base/api/health/llm" -TimeoutSec 30
  Add-Result 'llm-health' ($null -ne $lh) ((($lh | ConvertTo-Json -Compress) | Clip))
}
catch {
  Add-Result 'llm-health' $false (Get-ErrorBody $_) (Get-StatusCode $_)
}

# 2) Core user journeys (seeded user)
$u = 'user-1'

try {
  $r = Post-Chat 'Check my current balance' "smoke-bal-$now" $u
  Add-Result 'journey-balance' ($r.screenType -eq 'balance') ("screen=$($r.screenType), reply=$(Clip $r.replyText)")
}
catch {
  Add-Result 'journey-balance' $false (Get-ErrorBody $_) (Get-StatusCode $_)
}

try {
  $r = Post-Chat 'Show available data bundles' "smoke-bundles-$now" $u
  Add-Result 'journey-bundles' ($r.screenType -eq 'bundles') ("screen=$($r.screenType), reply=$(Clip $r.replyText)")
}
catch {
  Add-Result 'journey-bundles' $false (Get-ErrorBody $_) (Get-StatusCode $_)
}

try {
  $r = Post-Chat 'How much data and voice have I used?' "smoke-usage-$now" $u
  Add-Result 'journey-usage' ($r.screenType -eq 'usage') ("screen=$($r.screenType), reply=$(Clip $r.replyText)")
}
catch {
  Add-Result 'journey-usage' $false (Get-ErrorBody $_) (Get-StatusCode $_)
}

try {
  $r = Post-Chat 'Show my support tickets and help FAQ' "smoke-support-$now" $u
  Add-Result 'journey-support' ($r.screenType -eq 'support') ("screen=$($r.screenType), reply=$(Clip $r.replyText)")
}
catch {
  Add-Result 'journey-support' $false (Get-ErrorBody $_) (Get-StatusCode $_)
}

try {
  $r = Post-Chat 'Show my full account summary' "smoke-account-$now" $u
  Add-Result 'journey-account' ($r.screenType -eq 'account') ("screen=$($r.screenType), reply=$(Clip $r.replyText)")
}
catch {
  Add-Result 'journey-account' $false (Get-ErrorBody $_) (Get-StatusCode $_)
}

try {
  $r = Post-Chat 'Show bundle details for Unlimited Pro bundle' "smoke-detail-$now" $u
  Add-Result 'journey-bundle-detail' ($r.screenType -eq 'bundleDetail') ("screen=$($r.screenType), reply=$(Clip $r.replyText)")
}
catch {
  Add-Result 'journey-bundle-detail' $false (Get-ErrorBody $_) (Get-StatusCode $_)
}

try {
  $purchaseSession = "smoke-purchase-$now"
  $step1Prompt = 'Buy Weekend Pass now'
  $step1 = Post-Chat $step1Prompt $purchaseSession $u
  $purchaseHistory = @(
    @{
      role = 'user'
      text = $step1Prompt
      timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    },
    @{
      role = 'agent'
      text = $step1.replyText
      timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    }
  )
  $step2 = Post-Chat 'Yes, confirm purchase' $purchaseSession $u $purchaseHistory
  $ok = $step1.screenType -eq 'bundleDetail' -and $step2.screenType -eq 'confirmation'
  Add-Result 'journey-purchase' $ok ("step1=$($step1.screenType), step2=$($step2.screenType), reply=$(Clip $step2.replyText)")
}
catch {
  Add-Result 'journey-purchase' $false (Get-ErrorBody $_) (Get-StatusCode $_)
}

try {
  $r = Post-Chat 'Top up my account by 5 dollars' "smoke-topup-$now" $u
  Add-Result 'journey-topup' ($r.screenType -eq 'confirmation') ("screen=$($r.screenType), reply=$(Clip $r.replyText)")
}
catch {
  Add-Result 'journey-topup' $false (Get-ErrorBody $_) (Get-StatusCode $_)
}

try {
  $r = Post-Chat 'Create a support ticket: mobile data unstable in city center' "smoke-ticket-$now" $u
  $ok = $r.screenType -eq 'confirmation' -or $r.screenType -eq 'support'
  Add-Result 'journey-create-ticket' $ok ("screen=$($r.screenType), reply=$(Clip $r.replyText)")
}
catch {
  Add-Result 'journey-create-ticket' $false (Get-ErrorBody $_) (Get-StatusCode $_)
}

# 3) Streaming flow
try {
  $streamUser = "smoke-stream-$now"
  $streamBody = (New-ChatBody 'Show support options and stream steps' "smoke-stream-session-$now" $streamUser) | ConvertTo-Json -Depth 8
  $stream = Invoke-WebRequest -Method Post -Uri "$base/api/agent/chat/stream" -Headers @{ 'x-user-id' = $streamUser; 'Accept' = 'text/event-stream' } -ContentType 'application/json' -Body $streamBody -TimeoutSec 90
  $hasStep = $stream.Content -match 'event:\s*step'
  $hasResult = $stream.Content -match 'event:\s*result'
  Add-Result 'streaming-chat' ($hasStep -and $hasResult) ("step=$hasStep, result=$hasResult, bytes=$($stream.Content.Length)")
}
catch {
  Add-Result 'streaming-chat' $false (Get-ErrorBody $_) (Get-StatusCode $_)
}

# 4) History flow on separate user key
$hu = "smoke-history-$now"
$hs = "smoke-history-session-$now"

try {
  $null = Post-Chat 'Show support information' $hs $hu
  Add-Result 'history-seed-chat' $true 'created conversation for history checks'
}
catch {
  Add-Result 'history-seed-chat' $false (Get-ErrorBody $_) (Get-StatusCode $_)
}

try {
  $sessions = Invoke-RestMethod -Method Get -Uri "$base/api/history/sessions?userId=$hu&limit=10" -Headers @{ 'x-user-id' = $hu } -TimeoutSec 30
  $found = ($sessions | Where-Object { $_.sessionId -eq $hs } | Measure-Object).Count -gt 0
  $sessionCount = ($sessions | Measure-Object).Count
  Add-Result 'history-list' $found ("sessions=$sessionCount, containsSeedSession=$found")
}
catch {
  Add-Result 'history-list' $false (Get-ErrorBody $_) (Get-StatusCode $_)
}

try {
  $session = Invoke-RestMethod -Method Get -Uri "$base/api/history/session/$hs" -Headers @{ 'x-user-id' = $hu } -TimeoutSec 30
  $ok = $session.sessionId -eq $hs -and @($session.messages).Count -ge 1
  Add-Result 'history-get-session' $ok ("sessionId=$($session.sessionId), messages=$(@($session.messages).Count)")
}
catch {
  Add-Result 'history-get-session' $false (Get-ErrorBody $_) (Get-StatusCode $_)
}

try {
  $del = Invoke-RestMethod -Method Delete -Uri "$base/api/history/session/$hs" -Headers @{ 'x-user-id' = $hu } -TimeoutSec 30
  Add-Result 'history-delete-session' ($del.deleted -eq $true) ((($del | ConvertTo-Json -Compress) | Clip))
}
catch {
  Add-Result 'history-delete-session' $false (Get-ErrorBody $_) (Get-StatusCode $_)
}

$passed = ($results | Where-Object { $_.pass }).Count
$total = $results.Count
$failed = $total - $passed

$artifactDir = Join-Path $PSScriptRoot '..\test-results'
if (-not (Test-Path $artifactDir)) {
  New-Item -ItemType Directory -Path $artifactDir | Out-Null
}

$summaryPath = Join-Path $artifactDir ("smoke-temp-0.4-{0}.txt" -f $now)
$jsonPath = Join-Path $artifactDir ("smoke-temp-0.4-{0}.json" -f $now)

"SMOKE_SUMMARY passed=$passed failed=$failed total=$total temperature=0.4" | Tee-Object -FilePath $summaryPath
$results | Format-Table -AutoSize | Tee-Object -FilePath $summaryPath -Append
$results | ConvertTo-Json -Depth 8 | Set-Content -Path $jsonPath

"SMOKE_ARTIFACT_SUMMARY=$summaryPath"
"SMOKE_ARTIFACT_JSON=$jsonPath"
