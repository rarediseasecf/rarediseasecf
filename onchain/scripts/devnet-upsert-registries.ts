/**
 * Register the platform verifier (and optionally a provider) — admin signer.
 * Usage (from onchain/): npx ts-node --transpile-only scripts/devnet-upsert-registries.ts
 *
 * VERIFIER_WALLET defaults to the admin key itself: the API relayer signs with one
 * platform key that must be both admin and an active verifier.
 * Hospital payout wallets are registered automatically by the API on approval,
 * so PROVIDER_WALLET is optional.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program, Idl } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Connection, Keypair } from "@solana/web3.js";
import fs from "fs";
import path from "path";
import os from "os";

const PROGRAM_ID = new PublicKey(
  process.env.PROGRAM_ID || "3ChG4eL5EvhrELWbAZs3cdVt8P9X1CfrRwfF6gqfKG9d"
);

function loadKeypair(p: string): Keypair {
  const raw = JSON.parse(fs.readFileSync(p, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

async function main() {
  const rpc = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const walletPath =
    process.env.ANCHOR_WALLET ||
    path.join(os.homedir(), ".config", "solana", "id.json");
  const admin = loadKeypair(walletPath);
  const connection = new Connection(rpc, "confirmed");
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(admin),
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);

  const idlPath = path.join(__dirname, "..", "target", "idl", "rarediseasecf.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8")) as Idl;
  const program = new Program(idl, provider);

  const verifier = process.env.VERIFIER_WALLET
    ? new PublicKey(process.env.VERIFIER_WALLET)
    : admin.publicKey;

  const [platformConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("platform-config")],
    PROGRAM_ID
  );
  const [verifierRegistry] = PublicKey.findProgramAddressSync(
    [Buffer.from("verifier"), verifier.toBuffer()],
    PROGRAM_ID
  );

  console.log("admin:", admin.publicKey.toBase58());

  const vSig = await program.methods
    .upsertVerifier(verifier, true)
    .accounts({
      admin: admin.publicKey,
      platformConfig,
      verifierRegistry,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log("upsert_verifier ok:", vSig);
  console.log("verifier:", verifier.toBase58());

  if (process.env.PROVIDER_WALLET) {
    const providerWallet = new PublicKey(process.env.PROVIDER_WALLET);
    const [providerRegistry] = PublicKey.findProgramAddressSync(
      [Buffer.from("provider"), providerWallet.toBuffer()],
      PROGRAM_ID
    );
    const pSig = await program.methods
      .upsertProvider(providerWallet, true)
      .accounts({
        admin: admin.publicKey,
        platformConfig,
        providerRegistry,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("upsert_provider ok:", pSig);
    console.log("provider:", providerWallet.toBase58());
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
