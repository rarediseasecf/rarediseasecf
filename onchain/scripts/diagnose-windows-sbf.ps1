# Day 9 — diagnose Windows SBF / Anchor build blocker (read-only diagnostics).
# Does not deploy, does not write secrets, does not mutate keypairs.

$ErrorActionPreference = "Continue"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (-not (Test-Path (Join-Path $PSScriptRoot "..\Anchor.toml"))) {
  $Onchain = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} else {
  $Onchain = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

Write-Host "=== RareDiseaseCF Day 9 Windows SBF diagnosis ==="
Write-Host "onchain: $Onchain"
Write-Host ""

Write-Host "--- Versions ---"
rustc --version 2>&1
cargo --version 2>&1
solana --version 2>&1
anchor --version 2>&1
node --version 2>&1
npm --version 2>&1
Write-Host ""

Write-Host "--- WSL distros ---"
wsl -l -v 2>&1
Write-Host ""

Write-Host "--- Program ID ---"
$Kp = Join-Path $Onchain "target\deploy\rarediseasecf-keypair.json"
if (Test-Path $Kp) {
  solana-keygen pubkey $Kp 2>&1
} else {
  Write-Host "MISSING keypair: $Kp"
}
Write-Host "Expected: 3ChG4eL5EvhrELWbAZs3cdVt8P9X1CfrRwfF6gqfKG9d"
Write-Host ""

Write-Host "--- Host cargo check ---"
Push-Location $Onchain
cargo check -p rarediseasecf --message-format=short 2>&1 | Select-Object -Last 15
Write-Host ""

Write-Host "--- anchor build (expect fail on broken Windows SBF) ---"
$out = & anchor build 2>&1 | Out-String
Write-Host ($out.Substring([Math]::Max(0, $out.Length - 2000)))
Write-Host ""

Write-Host "=== Diagnosis complete ==="
Write-Host "If anchor build failed with toolchain corruption / edition2024:"
Write-Host "  1) Install Ubuntu WSL2 and follow docs/linux-wsl2-setup.md"
Write-Host "  2) OR run: .\\scripts\\validate-linux-docker.ps1"
Pop-Location
