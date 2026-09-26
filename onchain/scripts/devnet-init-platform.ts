/**
 * One-shot Devnet bootstrap: initialize_platform with Circle Devnet USDC mint.
 * Usage (from onchain/): npx ts-node --transpile-only scripts/devnet-init-platform.ts
 * Never prints or commits private keys.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program, Idl } from "@coral-xyz/anchor";
import {
  PublicKey,
  SystemProgram,
  Connection,
  Keypair,
} from "@solana/web3.js";
import fs from "fs";
import path from "path";
import os from "os";

const PROGRAM_ID = new PublicKey(
  process.env.PROGRAM_ID || "3ChG4eL5EvhrELWbAZs3cdVt8P9X1CfrRwfF6gqfKG9d"
);
/** Defaults to Circle Devnet USDC. Mainnet: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v */
const USDC_MINT = new PublicKey(
  process.env.USDC_MINT || "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
);
const CLUSTER = process.env.SOLANA_CLUSTER || "devnet";

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
  const wallet = new anchor.Wallet(admin);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idlPath = path.join(__dirname, "..", "target", "idl", "rarediseasecf.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8")) as Idl;
  const program = new Program(idl, provider);

  const [platformConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("platform-config")],
    PROGRAM_ID
  );

  const existing = await connection.getAccountInfo(platformConfig);
  if (existing) {
    console.log("PlatformConfig already exists:", platformConfig.toBase58());
    console.log("USDC mint (intended):", USDC_MINT.toBase58());
    return;
  }

  console.log("Initializing platform…");
  console.log("  admin:", admin.publicKey.toBase58());
  console.log("  platform:", platformConfig.toBase58());
  console.log("  usdc mint:", USDC_MINT.toBase58());

  const sig = await program.methods
    .initializePlatform(USDC_MINT)
    .accounts({
      admin: admin.publicKey,
      platformConfig,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("initialize_platform ok");
  console.log("  signature:", sig);
  console.log(
    "  explorer:",
    CLUSTER === "mainnet-beta"
      ? `https://explorer.solana.com/tx/${sig}`
      : `https://explorer.solana.com/tx/${sig}?cluster=${CLUSTER}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
