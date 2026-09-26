#!/usr/bin/env bash
# Compile tests to CommonJS JS (no typecheck), then run mocha.
# Avoids Node 20 ESM/.ts and Anchor 0.31 ResolvedAccounts type noise.
set -euo pipefail
OUTDIR=".anchor-test-dist"
rm -rf "${OUTDIR}"
echo "=== Compiling tests to ${OUTDIR} (commonjs, --noCheck) ==="
npx tsc -p ./tsconfig.json --outDir "${OUTDIR}" --rootDir . --module commonjs --moduleResolution node --esModuleInterop --skipLibCheck --resolveJsonModule --noCheck
echo "=== Running mocha on compiled JS ==="
exec node ./node_modules/mocha/bin/_mocha --timeout 1000000 "${OUTDIR}/tests/**/*.js"
