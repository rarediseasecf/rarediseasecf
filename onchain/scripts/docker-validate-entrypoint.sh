#!/usr/bin/env bash
# Entrypoint for Linux Docker validation of the metadata-only Anchor program.
# Copies the bind-mounted workspace onto a Linux-native filesystem so
# solana-test-validator / RocksDB are reliable under Docker Desktop.
set -euo pipefail

MOUNT="${MOUNT_DIR:-/work}"
WORKDIR="${WORKDIR_LINUX:-/tmp/rarediseasecf-onchain}"

echo "=== Day 9 Linux validation environment ==="
uname -a
rustc --version 2>/dev/null || true
cargo --version 2>/dev/null || true
solana --version
anchor --version
node --version
npm --version

if [[ ! -f "${MOUNT}/Anchor.toml" ]]; then
  echo "ERROR: Anchor.toml not found in ${MOUNT}. Mount the onchain/ directory."
  exit 2
fi

echo "=== Sync workspace to Linux-native path ${WORKDIR} ==="
rm -rf "${WORKDIR}"
mkdir -p "${WORKDIR}"
# Exclude heavy/cache dirs so Docker Desktop bind-mount sync does not hang for hours.
if command -v rsync >/dev/null 2>&1; then
  rsync -a \
    --exclude node_modules \
    --exclude .anchor \
    --exclude 'target/debug' \
    --exclude 'target/release' \
    --exclude 'target/sbpf-solana-solana' \
    --exclude 'target/.rustc_info.json' \
    --exclude '.git' \
    "${MOUNT}/" "${WORKDIR}/"
else
  # Fallback: tar stream with excludes (rsync may be missing on thin images).
  tar -C "${MOUNT}" \
    --exclude=node_modules \
    --exclude=.anchor \
    --exclude=target/debug \
    --exclude=target/release \
    --exclude=target/sbpf-solana-solana \
    --exclude=.git \
    -cf - . | tar -C "${WORKDIR}" -xf -
fi
rm -rf "${WORKDIR}/node_modules" "${WORKDIR}/.anchor" \
  "${WORKDIR}/target/debug" "${WORKDIR}/target/release" \
  "${WORKDIR}/target/sbpf-solana-solana" 2>/dev/null || true

cd "${WORKDIR}"
echo "=== Sync complete ==="

# Normalize CRLF on helper scripts copied from Windows mounts.
sed -i 's/\r$//' scripts/run-anchor-tests.sh 2>/dev/null || true
chmod +x scripts/run-anchor-tests.sh 2>/dev/null || true

echo "=== Ensuring program keypair (gitignored) ==="
mkdir -p target/deploy
DECLARED="3ChG4eL5EvhrELWbAZs3cdVt8P9X1CfrRwfF6gqfKG9d"
if [[ ! -f target/deploy/rarediseasecf-keypair.json ]]; then
  echo "ERROR: Missing target/deploy/rarediseasecf-keypair.json"
  echo "Restore the keypair whose pubkey is ${DECLARED} (gitignored; never commit)."
  exit 3
fi

ACTUAL="$(solana-keygen pubkey target/deploy/rarediseasecf-keypair.json)"
echo "Declared program ID: ${DECLARED}"
echo "Keypair pubkey:      ${ACTUAL}"
if [[ "${ACTUAL}" != "${DECLARED}" ]]; then
  echo "ERROR: Program ID mismatch. Restore matching keypair or deliberately sync declare_id! + Anchor.toml."
  exit 3
fi

# Disposable localnet wallet — never print seed phrase to logs.
mkdir -p "${HOME}/.config/solana"
if [[ ! -f "${HOME}/.config/solana/id.json" ]]; then
  solana-keygen new --no-bip39-passphrase -o "${HOME}/.config/solana/id.json" --force >/dev/null 2>&1
fi
solana config set --url localhost >/dev/null

echo "=== npm install ==="
npm install --no-fund --no-audit

# Node 20 + rpc-websockets: nested uuid@9+ is ESM-only and breaks CJS mocha require().
echo "=== Force CJS uuid@8 for rpc-websockets ==="
rm -rf node_modules/rpc-websockets/node_modules/uuid
npm install uuid@8.3.2 --no-save --no-fund --no-audit >/dev/null
mkdir -p node_modules/rpc-websockets/node_modules
rm -rf node_modules/rpc-websockets/node_modules/uuid
cp -a node_modules/uuid node_modules/rpc-websockets/node_modules/uuid
node -e "const u=require('uuid'); const p=require('./node_modules/rpc-websockets/node_modules/uuid/package.json'); console.log('uuid ok', typeof u.v4, 'nested type=', p.type || 'cjs');"

echo "=== Host cargo check ==="
cargo check -p rarediseasecf

echo "=== Privacy surface (source) ==="
npm run check:privacy

# Rebuild with image toolchain (Solana 2.1.x). Skip only if explicitly requested
# AND both .so + IDL already exist from a prior Linux build with matching tools.
if [[ "${SKIP_ANCHOR_BUILD:-0}" == "1" && -f target/deploy/rarediseasecf.so && -f target/idl/rarediseasecf.json ]]; then
  echo "=== SKIP_ANCHOR_BUILD=1 — reusing existing .so + IDL ==="
else
  echo "=== anchor build (SBF) ==="
  anchor --version
  solana --version
  anchor build
fi

echo "=== Privacy surface (source + IDL) ==="
npm run check:privacy

echo "=== Clean prior ledger; anchor test (localnet) ==="
rm -rf .anchor/test-ledger
# Prefer skip-build when .so already present to avoid a second full SBF compile.
set +e
if [[ -f target/deploy/rarediseasecf.so ]]; then
  anchor test --skip-build
  TEST_RC=$?
else
  anchor test
  TEST_RC=$?
fi
set -e

echo "=== Sync artifacts back to mount (IDL, .so, types) ==="
mkdir -p "${MOUNT}/target/deploy" "${MOUNT}/target/idl" "${MOUNT}/target/types"
cp -f target/deploy/rarediseasecf.so "${MOUNT}/target/deploy/" 2>/dev/null || true
cp -f target/idl/rarediseasecf.json "${MOUNT}/target/idl/" 2>/dev/null || true
cp -f target/types/rarediseasecf.ts "${MOUNT}/target/types/" 2>/dev/null || true

if [[ "${TEST_RC}" -ne 0 ]]; then
  echo "=== Day 9 Linux validation FAILED (tests exit ${TEST_RC}) ==="
  exit "${TEST_RC}"
fi

echo "=== Day 9 Linux validation PASSED ==="
