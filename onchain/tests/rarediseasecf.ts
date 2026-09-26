/**
 * RareDiseaseCF localnet tests — registry, escrow donate, fulfillment, settlement.
 * Devnet-demo rules: opaque campaign IDs only; no PHI; settle pays registered provider only.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { expect } from "chai";
import type { Rarediseasecf } from "../target/types/rarediseasecf";

const CAMPAIGN_ID = "RD-8F29KQ";
const FUNDING_GAP = new BN("2500000000"); // 2,500 USDC base units
const EXPECTED_PROGRAM_ID = "3ChG4eL5EvhrELWbAZs3cdVt8P9X1CfrRwfF6gqfKG9d";

function platformConfigPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("platform-config")],
    programId
  )[0];
}

function verifierPda(programId: PublicKey, wallet: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("verifier"), wallet.toBuffer()],
    programId
  )[0];
}

function providerPda(programId: PublicKey, wallet: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("provider"), wallet.toBuffer()],
    programId
  )[0];
}

function campaignPda(programId: PublicKey, campaignId: string): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("campaign"), Buffer.from(campaignId)],
    programId
  )[0];
}

function vaultPda(programId: PublicKey, campaign: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), campaign.toBuffer()],
    programId
  )[0];
}

async function airdrop(
  provider: anchor.AnchorProvider,
  pubkey: PublicKey,
  sols = 2
) {
  const sig = await provider.connection.requestAirdrop(
    pubkey,
    sols * LAMPORTS_PER_SOL
  );
  await provider.connection.confirmTransaction(sig, "confirmed");
}

/** Localnet block time can lag wall-clock time; poll the chain's own clock. */
async function waitForChainTime(
  provider: anchor.AnchorProvider,
  unixSeconds: number,
  timeoutMs = 60_000
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const slot = await provider.connection.getSlot("confirmed");
    const blockTime = await provider.connection.getBlockTime(slot);
    if (blockTime !== null && blockTime >= unixSeconds) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`chain clock did not reach ${unixSeconds} within ${timeoutMs}ms`);
}

function resolveProgram(): Program<Rarediseasecf> {
  const ws = anchor.workspace as Record<string, Program>;
  const program =
    ws.rarediseasecf ||
    ws.Rarediseasecf ||
    ws.RareDiseaseCf ||
    ws.RareDiseaseCF;
  if (!program) {
    throw new Error(
      "Anchor workspace program not found. Run `anchor build` first."
    );
  }
  return program as unknown as Program<Rarediseasecf>;
}

describe("rarediseasecf localnet", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = resolveProgram();
  const programId = program.programId;

  const admin = (provider.wallet as anchor.Wallet).payer;
  const verifier = Keypair.generate();
  const otherVerifier = Keypair.generate();
  const providerWallet = Keypair.generate();
  const outsider = Keypair.generate();
  const donor = Keypair.generate();
  const wrongProvider = Keypair.generate();

  let usdcMint: PublicKey;
  let donorToken: PublicKey;
  let providerToken: PublicKey;
  let wrongProviderToken: PublicKey;
  let otherMint: PublicKey;
  let otherMintProviderToken: PublicKey;

  const platformPda = platformConfigPda(programId);
  const verifierRegistry = verifierPda(programId, verifier.publicKey);
  const providerRegistry = providerPda(programId, providerWallet.publicKey);
  const campaignAddress = campaignPda(programId, CAMPAIGN_ID);
  const campaignVault = vaultPda(programId, campaignAddress);

  const futureExpiry = () =>
    new BN(Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30);
  const nearExpiry = () => new BN(Math.floor(Date.now() / 1000) + 3);

  function approveAccounts(campaign: PublicKey, vault: PublicKey) {
    return {
      verifier: verifier.publicKey,
      platformConfig: platformPda,
      verifierRegistry,
      providerRegistry,
      campaign,
      usdcMint,
      vault,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    };
  }

  before(async () => {
    expect(programId.toBase58()).to.equal(EXPECTED_PROGRAM_ID);
    await airdrop(provider, verifier.publicKey);
    await airdrop(provider, otherVerifier.publicKey);
    await airdrop(provider, outsider.publicKey);
    await airdrop(provider, donor.publicKey);
    await airdrop(provider, providerWallet.publicKey);
    await airdrop(provider, wrongProvider.publicKey);

    usdcMint = await createMint(
      provider.connection,
      admin,
      admin.publicKey,
      null,
      6
    );
    otherMint = await createMint(
      provider.connection,
      admin,
      admin.publicKey,
      null,
      6
    );

    donorToken = await createAccount(
      provider.connection,
      admin,
      usdcMint,
      donor.publicKey
    );
    providerToken = await createAccount(
      provider.connection,
      admin,
      usdcMint,
      providerWallet.publicKey
    );
    wrongProviderToken = await createAccount(
      provider.connection,
      admin,
      usdcMint,
      wrongProvider.publicKey
    );
    otherMintProviderToken = await createAccount(
      provider.connection,
      admin,
      otherMint,
      providerWallet.publicKey
    );

    await mintTo(
      provider.connection,
      admin,
      usdcMint,
      donorToken,
      admin,
      BigInt(FUNDING_GAP.toString()) * 2n
    );
  });

  it("platform initializes with real USDC mint", async () => {
    await program.methods
      .initializePlatform(usdcMint)
      .accounts({
        admin: admin.publicKey,
        platformConfig: platformPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const config = await program.account.platformConfig.fetch(platformPda);
    expect(config.admin.toBase58()).to.equal(admin.publicKey.toBase58());
    expect(config.usdcMint.toBase58()).to.equal(usdcMint.toBase58());
    expect(config.paused).to.equal(false);
  });

  it("admin activates verifier and provider", async () => {
    await program.methods
      .upsertVerifier(verifier.publicKey, true)
      .accounts({
        admin: admin.publicKey,
        platformConfig: platformPda,
        verifierRegistry,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .upsertProvider(providerWallet.publicKey, true)
      .accounts({
        admin: admin.publicKey,
        platformConfig: platformPda,
        providerRegistry,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .upsertProvider(wrongProvider.publicKey, true)
      .accounts({
        admin: admin.publicKey,
        platformConfig: platformPda,
        providerRegistry: providerPda(programId, wrongProvider.publicKey),
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  });

  it("verifier creates draft campaign", async () => {
    await program.methods
      .createCampaign(
        CAMPAIGN_ID,
        providerWallet.publicKey,
        FUNDING_GAP,
        futureExpiry()
      )
      .accounts({
        verifier: verifier.publicKey,
        platformConfig: platformPda,
        verifierRegistry,
        providerRegistry,
        campaign: campaignAddress,
        systemProgram: SystemProgram.programId,
      })
      .signers([verifier])
      .rpc();

    const c = await program.account.campaign.fetch(campaignAddress);
    expect(c.status).to.deep.equal({ draft: {} });
    expect(c.amountRaised.toString()).to.equal("0");
  });

  it("approve creates vault and sets Approved", async () => {
    await program.methods
      .approveCampaign()
      .accounts(approveAccounts(campaignAddress, campaignVault))
      .signers([verifier])
      .rpc();

    const c = await program.account.campaign.fetch(campaignAddress);
    expect(c.status).to.deep.equal({ approved: {} });
    expect(Number(c.approvedAt.toString())).to.be.greaterThan(0);
    const vault = await getAccount(provider.connection, campaignVault);
    expect(vault.mint.toBase58()).to.equal(usdcMint.toBase58());
    expect(vault.owner.toBase58()).to.equal(campaignAddress.toBase58());
    expect(vault.amount).to.equal(0n);
  });

  it("cannot approve twice", async () => {
    try {
      await program.methods
        .approveCampaign()
        .accounts(approveAccounts(campaignAddress, campaignVault))
        .signers([verifier])
        .rpc();
      expect.fail("expected second approval failure");
    } catch (err: unknown) {
      expect(String(err)).to.match(/CampaignAlreadyApproved|already in use/i);
    }
  });

  it("overfunding donate fails; exact donate succeeds", async () => {
    try {
      await program.methods
        .donateUsdc(FUNDING_GAP.add(new BN(1)))
        .accounts({
          donor: donor.publicKey,
          platformConfig: platformPda,
          campaign: campaignAddress,
          usdcMint,
          donorToken,
          vault: campaignVault,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([donor])
        .rpc();
      expect.fail("expected overfunding failure");
    } catch (err: unknown) {
      expect(String(err)).to.match(/OverfundingNotAllowed/i);
    }

    await program.methods
      .donateUsdc(FUNDING_GAP)
      .accounts({
        donor: donor.publicKey,
        platformConfig: platformPda,
        campaign: campaignAddress,
        usdcMint,
        donorToken,
        vault: campaignVault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([donor])
      .rpc();

    const c = await program.account.campaign.fetch(campaignAddress);
    expect(c.amountRaised.toString()).to.equal(FUNDING_GAP.toString());
    const vault = await getAccount(provider.connection, campaignVault);
    expect(vault.amount.toString()).to.equal(FUNDING_GAP.toString());
  });

  it("settlement fails before fulfillment", async () => {
    try {
      await program.methods
        .releaseProviderPayment()
        .accounts({
          admin: admin.publicKey,
          platformConfig: platformPda,
          campaign: campaignAddress,
          usdcMint,
          vault: campaignVault,
          providerToken,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      expect.fail("expected fulfillment gate");
    } catch (err: unknown) {
      expect(String(err)).to.match(/FulfillmentNotConfirmed|InvalidCampaignState/i);
    }
  });

  it("wrong provider cannot confirm fulfillment", async () => {
    try {
      await program.methods
        .confirmFulfillment()
        .accounts({
          provider: wrongProvider.publicKey,
          platformConfig: platformPda,
          providerRegistry: providerPda(programId, wrongProvider.publicKey),
          campaign: campaignAddress,
        })
        .signers([wrongProvider])
        .rpc();
      expect.fail("expected unauthorized provider");
    } catch (err: unknown) {
      expect(String(err)).to.match(/UnauthorizedProvider|Constraint/i);
    }
  });

  it("registered provider confirms fulfillment", async () => {
    await program.methods
      .confirmFulfillment()
      .accounts({
        provider: providerWallet.publicKey,
        platformConfig: platformPda,
        providerRegistry,
        campaign: campaignAddress,
      })
      .signers([providerWallet])
      .rpc();

    const c = await program.account.campaign.fetch(campaignAddress);
    expect(c.status).to.deep.equal({ fulfilled: {} });
    expect(Number(c.fulfilledAt.toString())).to.be.greaterThan(0);
  });

  it("unauthorized admin cannot settle", async () => {
    try {
      await program.methods
        .releaseProviderPayment()
        .accounts({
          admin: outsider.publicKey,
          platformConfig: platformPda,
          campaign: campaignAddress,
          usdcMint,
          vault: campaignVault,
          providerToken,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([outsider])
        .rpc();
      expect.fail("expected unauthorized admin");
    } catch (err: unknown) {
      expect(String(err)).to.match(/UnauthorizedAdmin|Constraint/i);
    }
  });

  it("wrong provider destination fails", async () => {
    try {
      await program.methods
        .releaseProviderPayment()
        .accounts({
          admin: admin.publicKey,
          platformConfig: platformPda,
          campaign: campaignAddress,
          usdcMint,
          vault: campaignVault,
          providerToken: wrongProviderToken,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      expect.fail("expected invalid destination");
    } catch (err: unknown) {
      expect(String(err)).to.match(/InvalidProviderDestination|Constraint/i);
    }
  });

  it("wrong mint destination fails", async () => {
    try {
      await program.methods
        .releaseProviderPayment()
        .accounts({
          admin: admin.publicKey,
          platformConfig: platformPda,
          campaign: campaignAddress,
          usdcMint,
          vault: campaignVault,
          providerToken: otherMintProviderToken,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      expect.fail("expected invalid mint destination");
    } catch (err: unknown) {
      expect(String(err)).to.match(/InvalidUsdcMint|Constraint/i);
    }
  });

  it("happy path settlement pays exact target once", async () => {
    const beforeProvider = await getAccount(provider.connection, providerToken);
    const beforeVault = await getAccount(provider.connection, campaignVault);

    const sig = await program.methods
      .releaseProviderPayment()
      .accounts({
        admin: admin.publicKey,
        platformConfig: platformPda,
        campaign: campaignAddress,
        usdcMint,
        vault: campaignVault,
        providerToken,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    expect(sig).to.be.a("string").and.have.length.greaterThan(40);

    const c = await program.account.campaign.fetch(campaignAddress);
    expect(c.status).to.deep.equal({ settled: {} });
    expect(c.settledAmount.toString()).to.equal(FUNDING_GAP.toString());
    expect(Number(c.settledAt.toString())).to.be.greaterThan(0);

    const afterProvider = await getAccount(provider.connection, providerToken);
    const afterVault = await getAccount(provider.connection, campaignVault);
    expect(afterProvider.amount - beforeProvider.amount).to.equal(
      BigInt(FUNDING_GAP.toString())
    );
    expect(beforeVault.amount - afterVault.amount).to.equal(
      BigInt(FUNDING_GAP.toString())
    );
    expect(afterVault.amount).to.equal(0n);
  });

  it("double settlement fails", async () => {
    try {
      await program.methods
        .releaseProviderPayment()
        .accounts({
          admin: admin.publicKey,
          platformConfig: platformPda,
          campaign: campaignAddress,
          usdcMint,
          vault: campaignVault,
          providerToken,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      expect.fail("expected already settled");
    } catch (err: unknown) {
      expect(String(err)).to.match(/CampaignAlreadySettled|FulfillmentNotConfirmed/i);
    }
  });

  it("funding gate: settle fails when not fully funded", async () => {
    const id = "RD-PARTIAL1";
    const camp = campaignPda(programId, id);
    const vault = vaultPda(programId, camp);

    await program.methods
      .createCampaign(id, providerWallet.publicKey, FUNDING_GAP, futureExpiry())
      .accounts({
        verifier: verifier.publicKey,
        platformConfig: platformPda,
        verifierRegistry,
        providerRegistry,
        campaign: camp,
        systemProgram: SystemProgram.programId,
      })
      .signers([verifier])
      .rpc();

    await program.methods
      .approveCampaign()
      .accounts(approveAccounts(camp, vault))
      .signers([verifier])
      .rpc();

    await program.methods
      .donateUsdc(new BN("1"))
      .accounts({
        donor: donor.publicKey,
        platformConfig: platformPda,
        campaign: camp,
        usdcMint,
        donorToken,
        vault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([donor])
      .rpc();

    try {
      await program.methods
        .confirmFulfillment()
        .accounts({
          provider: providerWallet.publicKey,
          platformConfig: platformPda,
          providerRegistry,
          campaign: camp,
        })
        .signers([providerWallet])
        .rpc();
      expect.fail("expected not fully funded");
    } catch (err: unknown) {
      expect(String(err)).to.match(/CampaignNotFullyFunded/i);
    }
  });

  it("approval fails after expiry", async () => {
    const shortId = "RD-EXPIRE1";
    const shortPda = campaignPda(programId, shortId);
    const shortVault = vaultPda(programId, shortPda);
    const shortExpiry = nearExpiry();
    await program.methods
      .createCampaign(
        shortId,
        providerWallet.publicKey,
        FUNDING_GAP,
        shortExpiry
      )
      .accounts({
        verifier: verifier.publicKey,
        platformConfig: platformPda,
        verifierRegistry,
        providerRegistry,
        campaign: shortPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([verifier])
      .rpc();

    await waitForChainTime(provider, shortExpiry.toNumber() + 1);

    try {
      await program.methods
        .approveCampaign()
        .accounts(approveAccounts(shortPda, shortVault))
        .signers([verifier])
        .rpc();
      expect.fail("expected expired campaign approve failure");
    } catch (err: unknown) {
      expect(String(err)).to.match(/CampaignExpired/i);
    }
  });

  it("settle_milestone releases 25% tranche then blocks double settle", async () => {
    const id = "RD-MSTONE1";
    const camp = campaignPda(programId, id);
    const vault = vaultPda(programId, camp);
    const quarter = FUNDING_GAP.div(new BN(4));

    await program.methods
      .createCampaign(id, providerWallet.publicKey, FUNDING_GAP, futureExpiry())
      .accounts({
        verifier: verifier.publicKey,
        platformConfig: platformPda,
        verifierRegistry,
        providerRegistry,
        campaign: camp,
        systemProgram: SystemProgram.programId,
      })
      .signers([verifier])
      .rpc();

    await program.methods
      .approveCampaign()
      .accounts(approveAccounts(camp, vault))
      .signers([verifier])
      .rpc();

    // Fund exactly 50% so 25+50 eligible; settle only 25 first
    await program.methods
      .donateUsdc(FUNDING_GAP.div(new BN(2)))
      .accounts({
        donor: donor.publicKey,
        platformConfig: platformPda,
        campaign: camp,
        usdcMint,
        donorToken,
        vault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([donor])
      .rpc();

    const beforeProvider = await getAccount(provider.connection, providerToken);

    await program.methods
      .settleMilestone(25)
      .accounts({
        caller: admin.publicKey,
        platformConfig: platformPda,
        campaign: camp,
        usdcMint,
        vault,
        providerToken,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    let c = await program.account.campaign.fetch(camp);
    expect(c.milestoneSettledMask).to.equal(1); // bit0
    expect(c.settledAmount.toString()).to.equal(quarter.toString());
    expect(c.status).to.deep.equal({ approved: {} });

    const afterProvider = await getAccount(provider.connection, providerToken);
    expect(afterProvider.amount - beforeProvider.amount).to.equal(
      BigInt(quarter.toString())
    );

    try {
      await program.methods
        .settleMilestone(25)
        .accounts({
          caller: admin.publicKey,
          platformConfig: platformPda,
          campaign: camp,
          usdcMint,
          vault,
          providerToken,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      expect.fail("expected double milestone settle failure");
    } catch (err: unknown) {
      expect(String(err)).to.match(/MilestoneAlreadySettled/i);
    }

    // 75% not eligible yet (only 50% raised)
    try {
      await program.methods
        .settleMilestone(75)
        .accounts({
          caller: admin.publicKey,
          platformConfig: platformPda,
          campaign: camp,
          usdcMint,
          vault,
          providerToken,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      expect.fail("expected not eligible");
    } catch (err: unknown) {
      expect(String(err)).to.match(/MilestoneNotEligible/i);
    }

    // Permissionless: a non-admin (the donor) can trigger a reached milestone.
    await program.methods
      .settleMilestone(50)
      .accounts({
        caller: donor.publicKey,
        platformConfig: platformPda,
        campaign: camp,
        usdcMint,
        vault,
        providerToken,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([donor])
      .rpc();

    c = await program.account.campaign.fetch(camp);
    expect(c.milestoneSettledMask).to.equal(0b11);
    expect(c.settledAmount.toString()).to.equal(
      FUNDING_GAP.div(new BN(2)).toString()
    );
  });

  it("rejects campaigns longer than 180 days", async () => {
    const id = "LONGX";
    try {
      await program.methods
        .createCampaign(
          id,
          providerWallet.publicKey,
          FUNDING_GAP,
          new BN(Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 200)
        )
        .accounts({
          verifier: verifier.publicKey,
          platformConfig: platformPda,
          verifierRegistry,
          providerRegistry,
          campaign: campaignPda(programId, id),
          systemProgram: SystemProgram.programId,
        })
        .signers([verifier])
        .rpc();
      expect.fail("expected InvalidExpiry for >180 day campaign");
    } catch (err: unknown) {
      expect(String(err)).to.match(/InvalidExpiry/i);
    }
  });

  it("after expiry, a 23%-funded campaign releases everything to the provider", async () => {
    const id = "EXPRA"; // 5-letter opaque ID (current app format)
    const camp = campaignPda(programId, id);
    const vault = vaultPda(programId, camp);
    const raised = FUNDING_GAP.mul(new BN(23)).div(new BN(100));
    const expiresAt = Math.floor(Date.now() / 1000) + 12;

    await program.methods
      .createCampaign(id, providerWallet.publicKey, FUNDING_GAP, new BN(expiresAt))
      .accounts({
        verifier: verifier.publicKey,
        platformConfig: platformPda,
        verifierRegistry,
        providerRegistry,
        campaign: camp,
        systemProgram: SystemProgram.programId,
      })
      .signers([verifier])
      .rpc();

    await program.methods
      .approveCampaign()
      .accounts(approveAccounts(camp, vault))
      .signers([verifier])
      .rpc();

    await program.methods
      .donateUsdc(raised)
      .accounts({
        donor: donor.publicKey,
        platformConfig: platformPda,
        campaign: camp,
        usdcMint,
        donorToken,
        vault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([donor])
      .rpc();

    const releaseAccounts = (destination: PublicKey) => ({
      caller: outsider.publicKey,
      platformConfig: platformPda,
      campaign: camp,
      usdcMint,
      vault,
      providerToken: destination,
      tokenProgram: TOKEN_PROGRAM_ID,
    });

    try {
      await program.methods
        .releaseExpiredFunds()
        .accounts(releaseAccounts(providerToken))
        .signers([outsider])
        .rpc();
      expect.fail("expected CampaignNotExpired before expiry");
    } catch (err: unknown) {
      expect(String(err)).to.match(/CampaignNotExpired/i);
    }

    await waitForChainTime(provider, expiresAt + 1);

    try {
      await program.methods
        .releaseExpiredFunds()
        .accounts(releaseAccounts(wrongProviderToken))
        .signers([outsider])
        .rpc();
      expect.fail("expected invalid destination");
    } catch (err: unknown) {
      expect(String(err)).to.match(/InvalidProviderDestination|Constraint/i);
    }

    const beforeProvider = await getAccount(provider.connection, providerToken);

    // Permissionless: an unrelated caller can trigger the release.
    await program.methods
      .releaseExpiredFunds()
      .accounts(releaseAccounts(providerToken))
      .signers([outsider])
      .rpc();

    const afterProvider = await getAccount(provider.connection, providerToken);
    expect(afterProvider.amount - beforeProvider.amount).to.equal(
      BigInt(raised.toString())
    );
    const afterVault = await getAccount(provider.connection, vault);
    expect(afterVault.amount).to.equal(0n);

    const c = await program.account.campaign.fetch(camp);
    expect(c.status).to.deep.equal({ settled: {} });
    expect(c.settledAmount.toString()).to.equal(raised.toString());

    try {
      await program.methods
        .releaseExpiredFunds()
        .accounts(releaseAccounts(providerToken))
        .signers([outsider])
        .rpc();
      expect.fail("expected already settled");
    } catch (err: unknown) {
      expect(String(err)).to.match(/CampaignAlreadySettled/i);
    }
  });

  it("IDL includes settlement instructions without PHI fields", async () => {
    const idl = program.idl;
    const ixNames = idl.instructions.map((i) => i.name);
    expect(ixNames).to.include.members([
      "initializePlatform",
      "donateUsdc",
      "confirmFulfillment",
      "releaseProviderPayment",
      "settleMilestone",
      "releaseExpiredFunds",
    ]);
    const json = JSON.stringify(idl);
    expect(json).to.not.match(/patientName|treatmentSummary|diagnosis/i);
  });
});
