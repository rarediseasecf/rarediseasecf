/**
 * Privacy surface check — forbids PHI on-chain; allows intentional USDC escrow/settlement APIs.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ONCHAIN_ROOT = path.resolve(__dirname, "..");
const SRC_ROOT = path.join(ONCHAIN_ROOT, "programs", "rarediseasecf", "src");
const IDL_PATH = path.join(ONCHAIN_ROOT, "target", "idl", "rarediseasecf.json");

const ALLOWED_ACCOUNT_FIELDS = new Set([
  "admin",
  "usdc_mint",
  "paused",
  "version",
  "bump",
  "verifier_wallet",
  "provider_wallet",
  "active",
  "campaign_id",
  "status",
  "verified_funding_gap",
  "amount_raised",
  "expires_at",
  "approved_at",
  "fulfilled_at",
  "settled_at",
  "settled_amount",
  "milestone_settled_mask",
  "vault_bump",
]);

const FORBIDDEN_FIELD_IDENTIFIERS = [
  "patient_name",
  "patientName",
  "caregiver",
  "diagnosis",
  "prescription",
  "treatment_summary",
  "treatmentSummary",
  "document",
  "invoice",
  "insurance",
  "email",
  "phone",
  "date_of_birth",
  "dob",
  "medical_record",
  "private_reference_hash",
  "session",
  "cookie",
  "encryption",
  "ciphertext",
  "database",
  "postgres",
  "provider_display_name",
  "providerDisplayName",
  "reviewer_note",
  "reviewerNote",
];

const ALLOWED_INSTRUCTIONS = new Set([
  "initialize_platform",
  "upsert_verifier",
  "upsert_provider",
  "create_campaign",
  "approve_campaign",
  "donate_usdc",
  "confirm_fulfillment",
  "release_provider_payment",
  "settle_milestone",
  "release_expired_funds",
  "initializePlatform",
  "upsertVerifier",
  "upsertProvider",
  "createCampaign",
  "approveCampaign",
  "donateUsdc",
  "confirmFulfillment",
  "releaseProviderPayment",
  "settleMilestone",
  "releaseExpiredFunds",
]);

function walkRsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkRsFiles(full));
    else if (entry.name.endsWith(".rs")) out.push(full);
  }
  return out;
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

function checkRustSources() {
  const failures = [];
  for (const file of walkRsFiles(SRC_ROOT)) {
    const code = stripComments(fs.readFileSync(file, "utf8"));
    const rel = path.relative(ONCHAIN_ROOT, file);

    const fieldRe = /\bpub\s+([A-Za-z_][A-Za-z0-9_]*)\s*:/g;
    let m;
    while ((m = fieldRe.exec(code)) !== null) {
      const name = m[1];
      if (FORBIDDEN_FIELD_IDENTIFIERS.includes(name)) {
        failures.push(`${rel}: forbidden field identifier \`${name}\``);
      }
    }
  }
  return failures;
}

function checkIdl() {
  const failures = [];
  if (!fs.existsSync(IDL_PATH)) {
    return {
      failures,
      note: "IDL not found (run `anchor build` on Linux/WSL). Source-only checks applied.",
    };
  }

  const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf8"));
  for (const ix of idl.instructions ?? []) {
    if (!ALLOWED_INSTRUCTIONS.has(ix.name)) {
      failures.push(`IDL instruction not allowlisted: ${ix.name}`);
    }
  }

  const typeMap = new Map((idl.types ?? []).map((t) => [t.name, t]));
  for (const account of idl.accounts ?? []) {
    const typeDef = typeMap.get(account.name) ?? account;
    const fields = typeDef?.type?.fields ?? [];
    for (const field of fields) {
      const name = field.name;
      if (FORBIDDEN_FIELD_IDENTIFIERS.includes(name)) {
        failures.push(`IDL account ${account.name} forbidden field: ${name}`);
      }
      if (name && !ALLOWED_ACCOUNT_FIELDS.has(name)) {
        failures.push(
          `IDL account ${account.name} unexpected field: ${name}`
        );
      }
    }
  }

  return {
    failures,
    note: `IDL checked at ${path.relative(ONCHAIN_ROOT, IDL_PATH)}`,
  };
}

const sourceFailures = checkRustSources();
const { failures: idlFailures, note } = checkIdl();
const all = [...sourceFailures, ...idlFailures];

if (note) console.log(note);

if (all.length > 0) {
  console.error("Privacy surface check FAILED:");
  for (const f of all) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  "Privacy surface check PASSED (" +
    (fs.existsSync(IDL_PATH) ? "source + IDL" : "source only") +
    ")."
);
