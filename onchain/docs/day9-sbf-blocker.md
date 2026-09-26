# Day 9 — Anchor SBF blocker isolation

## What is blocked

| Command | Windows host | Ubuntu WSL2 | Linux Docker (this repo) |
|---|---|---|---|
| `cargo check -p rarediseasecf` | PASS | expected PASS | expected PASS |
| `anchor build` | **FAIL** | required path | `scripts/validate-linux-docker.ps1` |
| `anchor test` | **not run** (blocked by build) | required path | same script |
| Devnet deploy | not attempted | manual only | not in script |

## Precise Windows failure

Observed from `anchor build` / `cargo-build-sbf` on this machine:

1. `cargo-build-sbf` prints `uninstalling toolchain solana`
2. Then: `The Solana toolchain is corrupted. Please, run cargo-build-sbf with the --force-tools-install argument`
3. `--force-tools-install` may loop the same failure or hit `Access is denied`
4. With `--skip-tools-install --no-rustup-override`, platform-tools Cargo (~1.84) fails parsing crates that require **`edition2024`**

**Conclusion:** Windows host SBF is an **environment/toolchain** blocker, not a proven Day 7 source bug. Host `cargo check` and unit tests pass; there is no transfer/escrow code in `programs/`.

## Linux Docker results (Day 9)

| Step | Result | Notes |
|---|---|---|
| Thin image `solanafoundation/anchor:v0.31.1` | **PASS** | `solana-cli 2.1.0`, `anchor-cli 0.31.1` |
| `cargo check` in Linux | **PASS** | |
| Privacy check | **PASS** | |
| `anchor build` (Solana 2.1.0 platform-tools) | **FAIL** | `crypto-common 0.2.2` needs `edition2024`; SBF Cargo ~1.79 |
| `anchor test` with Agave **4.2.2** (older custom image) | **FAIL** | `io_uring_supported()` panic; SBF build had succeeded on that image |

### Precise SBF failure (official 2.1.0 image)

```text
error: failed to parse manifest at .../crypto-common-0.2.2/Cargo.toml
feature `edition2024` is required
Cargo (1.79.0 ...) 
```

Pulled via `digest 0.11.3`. Platform-tools Cargo cannot parse that crate. Fix path: pin transitive deps away from `digest 0.11` / `crypto-common 0.2` (or use a newer platform-tools stack that still works without Docker `io_uring`).

### Precise localnet failure (Agave 4.2.2 in Docker Desktop)

```text
io_uring NOT supported: Operation not permitted
thread 'main' panicked at fs/src/dirs.rs:27:9:
assertion failed: io_uring_supported()
```

## What is NOT the blocker

- Missing `declare_id!` / `Anchor.toml` ID mismatch (pubkey matches `3ChG4eL5EvhrELWbAZs3cdVt8P9X1CfrRwfF6gqfKG9d`)
- Missing instruction modules / account context exports (host check compiles; Linux SBF build produced `.so`)
- Payment features (intentionally absent)

## Environment note (this machine)

`wsl -l -v` shows only `docker-desktop` — **no Ubuntu WSL distro** with bash. Therefore Ubuntu WSL commands cannot be executed here until Ubuntu is installed.

## Docker image lesson (Day 9)

1. Ubuntu 22.04 + `avm install 0.31.1` → **GLIBC_2.38 / 2.39** missing.
2. Custom Ubuntu 24.04 + `anchor-cli` from source + Solana **stable (4.2.2)** → `anchor build` **PASS**, `anchor test` **FAIL** (`io_uring_supported`).
3. Preferred: thin image `FROM solanafoundation/anchor:v0.31.1` (+ Node for TS tests).

## Supported validation paths

### A) Ubuntu WSL2 (recommended for ongoing work)

See [`linux-wsl2-setup.md`](linux-wsl2-setup.md). Prefer Ubuntu **24.04** and Solana **2.1.x** (not Agave 4.x) for Anchor 0.31.1.

```bash
# Install Ubuntu once (from elevated PowerShell / Windows):
# wsl --install -d Ubuntu-24.04

cd ~/projects/rarediseasecf/onchain
npm install
# Prefer Solana 2.1.0 to match Anchor 0.31.1:
#   sh -c "$(curl -sSfL https://release.anza.xyz/v2.1.0/install)"
anchor --version   # expect 0.31.1
solana --version   # expect 2.1.x
anchor build
anchor test
npm run check:privacy
```

### B) Linux Docker from Windows (no Ubuntu distro required)

From PowerShell in `onchain/`:

```powershell
.\scripts\validate-linux-docker.ps1
```

Requires:

- Docker Desktop running
- Existing `target/deploy/rarediseasecf-keypair.json` whose pubkey is `3ChG4eL5EvhrELWbAZs3cdVt8P9X1CfrRwfF6gqfKG9d`

Builds a thin image from `solanafoundation/anchor:v0.31.1`, syncs the workspace to `/tmp` inside the container, then runs `anchor build` + `anchor test`.

### C) Windows diagnosis only

```powershell
.\scripts\diagnose-windows-sbf.ps1
```

## Day 9 gate (honest)

```text
[x] anchor build PASS on Linux Docker (observed with Agave 4.2.2 custom image)
[ ] anchor test PASS on Linux (blocked by Agave 4.x io_uring; re-run via official 2.1.0 image)
[x] IDL reviewed (npm run check:privacy with IDL present — PASS)
[x] no transfer/escrow/donation instructions
[x] no Devnet deployment claimed
```

Do **not** start USDC donation / escrow work until the Linux localnet gate is green.
