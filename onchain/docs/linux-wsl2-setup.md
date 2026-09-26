# Linux / WSL2 setup for RareDiseaseCF Anchor (Day 8)

Day 8 validates the **metadata-only** Solana program with real SBF compilation and localnet tests. Host `cargo check` alone is **not** enough.

## 1. Why Linux / WSL2 is required

The program must compile to **Solana SBF** via `cargo-build-sbf` / `anchor build`, not only to the host Rust target.

On the current Windows environment:

- `cargo-build-sbf` can corrupt or uninstall the rustup `solana` toolchain override.
- Platform-tools Cargo (~1.84) may fail to parse crates that require `edition2024`.
- Host `cargo check -p rarediseasecf` can pass while **SBF compilation still fails**.

**Recommended path:** Ubuntu under WSL2 (or native Linux/macOS).

Do not begin donation/escrow/token-transfer work until both `anchor build` and `anchor test` pass on Linux (WSL2 or Docker).

**Also see:** [`day9-sbf-blocker.md`](day9-sbf-blocker.md) for the precise Windows failure mode and Docker validation path.

## 2. Recommended environment

| Item | Recommendation |
|---|---|
| Distro | Ubuntu **24.04** under WSL2 (22.04 may fail AVM prebuilts — needs GLIBC 2.38+) |
| Project path | `~/projects/rarediseasecf` (Linux filesystem) |
| Avoid | Building from `/mnt/c/...` when possible (slower, more fragile) |

Copy or clone the repo into the Linux home directory rather than only binding a Windows drive mount.

## 3. System packages (Ubuntu)

These install **build dependencies only**. They do **not** install Anchor or Solana by themselves.

```bash
sudo apt update

sudo apt install -y \
  build-essential \
  pkg-config \
  libssl-dev \
  libudev-dev \
  libclang-dev \
  clang \
  cmake \
  curl \
  git \
  unzip \
  jq
```

Also install Node.js (LTS) via your preferred method (NodeSource, nvm, or distro packages) so `npm` works for `onchain/` test deps.

## 4. Development tools (validate with `anchor build`)

Expected toolchain family for this workspace:

| Tool | Expected |
|---|---|
| Anchor CLI | **0.31.1** via AVM (`avm use 0.31.1`) |
| Solana CLI | Compatible with Anchor 0.31.1 (install via official Agave/Solana install script) |
| Rust / Cargo | Host toolchain for `cargo check` / `fmt` / `clippy`; SBF uses platform-tools |
| Node / npm | Compatible with existing `onchain/package.json` |

Exact Solana/Rust patch versions are **validated by a successful `anchor build`**, not by this document inventing a guarantee.

Check versions:

```bash
anchor --version    # expect anchor-cli 0.31.1
solana --version
rustc --version
cargo --version
node --version
npm --version
```

Install Anchor 0.31.1 — prefer **source** if AVM prebuilts fail on glibc (seen on Ubuntu 22.04):

```bash
# Option A (recommended / matches Docker validate image): build from source
cargo install --git https://github.com/coral-xyz/anchor --tag v0.31.1 anchor-cli --locked --force
anchor --version   # expect anchor-cli 0.31.1

# Option B (Ubuntu 24.04+): AVM prebuilt
cargo install --git https://github.com/coral-xyz/anchor --tag v0.31.1 avm --locked --force
avm install 0.31.1
avm use 0.31.1
```

If `avm install` errors with `GLIBC_2.38` / `GLIBC_2.39` not found, use Option A or upgrade the distro to Ubuntu 24.04.

Install Solana CLI using the current official Linux install instructions for Agave/Solana, then ensure `solana` is on `PATH`.

## 5. Workspace setup

There is no assumed public remote URL in this tree. Use your clone source:

```bash
# Example only — replace with your actual clone URL or copy path
mkdir -p ~/projects
cd ~/projects
# git clone <your-repository-url> rarediseasecf
# or: cp -a /mnt/c/Users/<you>/Downloads/raredisease ~/projects/rarediseasecf

cd ~/projects/rarediseasecf/onchain
npm install
```

Program keypair (gitignored under `target/deploy/`):

```bash
mkdir -p target/deploy
# If missing, create a local deploy keypair (never commit it):
# solana-keygen new --no-bip39-passphrase -o target/deploy/rarediseasecf-keypair.json
```

**Program ID consistency**

Declared public ID:

`3ChG4eL5EvhrELWbAZs3cdVt8P9X1CfrRwfF6gqfKG9d`

This must match:

1. `declare_id!(...)` in `programs/rarediseasecf/src/lib.rs`
2. `[programs.localnet]` / `[programs.devnet]` in `Anchor.toml`
3. `solana-keygen pubkey target/deploy/rarediseasecf-keypair.json`

If the keypair pubkey **differs**:

1. Do **not** silently invent a new ID in docs.
2. Either restore the matching keypair, **or** deliberately run `anchor keys sync` and update `declare_id!` + `Anchor.toml` together in a controlled commit.
3. Never commit the keypair JSON or any seed phrase.

## 6. Build and test

```bash
cd ~/projects/rarediseasecf/onchain
# If using AVM: avm use 0.31.1
anchor --version   # expect 0.31.1
anchor build
anchor test
```

Also recommended host checks:

```bash
cargo fmt --check
cargo check -p rarediseasecf
cargo clippy --workspace --all-targets -- -D warnings   # may need Anchor-aware allowances; see README
npm run check:privacy   # static privacy / no-transfer surface (IDL if present)
```

Meaning:

- `anchor build` — compiles the **SBF** program and writes IDL under `target/idl/`.
- `anchor test` — runs localnet validator + TypeScript tests in `tests/`.
- Both must pass before any payment / USDC / escrow milestone begins.

## 7. Troubleshooting

| Symptom | What to try |
|---|---|
| `anchor: command not found` | Ensure `~/.cargo/bin` (source install) or `~/.avm/bin` on `PATH`; `avm use 0.31.1` if using AVM |
| `GLIBC_2.38` / `GLIBC_2.39` not found | AVM prebuilt needs newer glibc — use Ubuntu 24.04 or `cargo install … anchor-cli` from source |
| `solana: command not found` | Re-run Solana/Agave install; restart shell; check `PATH` |
| Program ID mismatch | Compare `declare_id!`, `Anchor.toml`, and `solana-keygen pubkey …-keypair.json`; sync deliberately |
| Local validator port in use | Stop other `solana-test-validator` / Anchor test processes; free 8899/8900 |
| Missing Node deps | `cd onchain && npm install` |
| Wrong wallet path | `Anchor.toml` `[provider] wallet = "~/.config/solana/id.json"`; create with `solana-keygen new` |
| Incompatible versions | Align Anchor 0.31.1 + matching Solana; re-run `anchor build` |
| IDL missing | Run `anchor build` successfully first |
| Test timeout | Increase mocha timeout (already high in `Anchor.toml`); ensure validator starts |
| WSL permission errors | Avoid `sudo` for project files; fix ownership under `~/projects` |
| Slow / flaky builds on `/mnt/c` | Copy project to `~/projects/...` on the Linux filesystem |

## 8. Security note

Use only development keypairs and Devnet/localnet funds. Never commit a keypair JSON file, private key, seed phrase, or `.env` secret.

## 9. Day 8 gate

Do not add token-transfer, escrow, donation, payout, or settlement instructions until `anchor build` and `anchor test` both pass.
