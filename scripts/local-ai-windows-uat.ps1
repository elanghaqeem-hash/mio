# LAR-34: Run against REAL local Ollama and MIO gateway on Windows.
# Prerequisites: Ollama and the qwen2.5:3b weights installed; gateway running on 127.0.0.1:4318.
# This script does not download weights, start services, or use external API keys.
param([string]$Model = "qwen2.5:3b", [string]$Gateway = "http://127.0.0.1:4318")
$ErrorActionPreference = "Stop"
$env:MIO_LOCAL_MODEL = $Model
$env:MIO_LOCAL_GATEWAY_URL = $Gateway
$results = @()
$tests = @(
  @{ Name = "real-model"; Script = "scripts/local-ai-real-model-smoke.mjs" },
  @{ Name = "client-cancellation"; Script = "scripts/local-ai-real-cancellation-smoke.mjs" }
)
foreach ($test in $tests) {
  Write-Host ("Running real hardware acceptance: " + $test.Name)
  & node $test.Script
  $code = $LASTEXITCODE
  $state = if ($code -eq 0) { "PASS" } elseif ($code -eq 2) { "INCONCLUSIVE" } else { "FAIL" }
  $results += [PSCustomObject]@{ Test = $test.Name; Result = $state; ExitCode = $code }
}
$results | Format-Table -AutoSize
if (@($results | Where-Object { $_.Result -ne "PASS" }).Count -gt 0) {
  Write-Error "Real-device acceptance incomplete. Do not approve production release."
  exit 1
}
Write-Host "CLI real-model acceptance passed. Desktop UI STOP and Windows UAT remain separate mandatory checks."
