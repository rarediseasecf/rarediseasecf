# Day 9 — run Anchor SBF build + localnet tests inside Linux Docker.
# Uses official solanafoundation/anchor:v0.31.1 (Solana 2.1.0) to avoid
# Agave 4.x io_uring panic under Docker Desktop.
# Does not deploy to Devnet. Does not use secrets.

$ErrorActionPreference = "Stop"
$Onchain = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Image = "rarediseasecf-anchor-validate:day9"

Write-Host "=== Building thin validate image FROM solanafoundation/anchor:v0.31.1 ==="
docker build -f (Join-Path $Onchain "Dockerfile.validate") -t $Image $Onchain

Write-Host "=== Running anchor build + anchor test in Linux container ==="
# Bind-mount for keypair/artifacts; entrypoint copies to /tmp for validator FS safety.
$extraEnv = @()
$soPath = Join-Path $Onchain "target\deploy\rarediseasecf.so"
$idlPath = Join-Path $Onchain "target\idl\rarediseasecf.json"
$idlHasDonate = $false
if (Test-Path $idlPath) {
    $idlHasDonate = (Select-String -Path $idlPath -Pattern '"donate_usdc"' -Quiet)
}
if (
    (Test-Path $soPath) -and
    $idlHasDonate -and
    $env:FORCE_ANCHOR_BUILD -ne "1"
) {
    Write-Host "=== Existing .so + donate IDL found — SKIP_ANCHOR_BUILD=1 (set FORCE_ANCHOR_BUILD=1 to rebuild) ==="
    $extraEnv += "-e"
    $extraEnv += "SKIP_ANCHOR_BUILD=1"
} else {
    Write-Host "=== Will run full anchor build (missing/stale artifacts or FORCE_ANCHOR_BUILD=1) ==="
}
docker run --rm `
  -v "${Onchain}:/work" `
  -w /work `
  @extraEnv `
  $Image
if ($LASTEXITCODE -ne 0) {
    Write-Host "=== Docker Linux validation FAILED (exit $LASTEXITCODE) ==="
    exit $LASTEXITCODE
}

Write-Host "=== Docker Linux validation finished PASSED ==="
