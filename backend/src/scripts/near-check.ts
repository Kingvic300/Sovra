/**
 * Smoke test for NEAR AI Cloud: lists TEE models, sends one completion and verifies attestation
 * and the response signature. Run: npm run build && npm run near:check
 *
 * Needs NEAR_AI_API_KEY in backend/.env. NEAR_AI_MODEL picks the model (default below).
 */
import { NearCloud, NearCloudError, type Verification } from "../near/near-cloud.js";

const DEFAULT_MODEL = "Qwen/Qwen3.6-35B-A3B-FP8";

function printChecks(v: Verification) {
  const mark = { pass: "PASS", warn: "WARN", fail: "FAIL", skipped: "SKIP" } as const;
  for (const c of v.checks) console.log(`  [${mark[c.status]}] ${c.scope.padEnd(8)} ${c.label} (${c.detail})`);
  if (v.images.length) console.log(`  images pinned in attested compose:\n${v.images.map((i) => `    - ${i}`).join("\n")}`);
}

async function main() {
  const key = process.env.NEAR_AI_API_KEY;
  if (!key) {
    console.error("NEAR_AI_API_KEY is not set. Add it to backend/.env (cloud.near.ai -> API keys).");
    process.exit(1);
  }
  const model = process.env.NEAR_AI_MODEL || DEFAULT_MODEL;
  const near = new NearCloud(key);

  const tee = await near.teeModels();
  console.log(`TEE models on NEAR's fleet (${tee.length}): ${tee.map((m) => m.id).join(", ")}`);
  if (!tee.some((m) => m.id === model)) console.warn(`warning: ${model} is not in the TEE list`);

  console.log(`\nAttesting ${model}, then sending one completion...`);
  try {
    const out = await near.privateCompletion({
      model,
      messages: [{ role: "user", content: "Reply with one short sentence: what is a trusted execution environment?" }],
      max_tokens: 400,
      temperature: 0,
    });
    console.log(`\ncompletion id: ${out.verification.chatId}`);
    console.log(`answer: ${out.content.trim()}`);
    console.log(`\nnonce: ${out.verification.nonce}`);
    console.log(`signing address: ${out.verification.signingAddress}`);
    printChecks(out.verification);
    console.log(`\nVERIFIED: ${out.verification.verified ? "yes" : "NO"}`);
    process.exit(out.verification.verified ? 0 : 2);
  } catch (err) {
    const v = (err as { verification?: Verification }).verification;
    console.error(`\n${err instanceof NearCloudError ? "NEAR AI Cloud" : "error"}: ${err instanceof Error ? err.message : String(err)}`);
    if (v) printChecks(v);
    process.exit(2);
  }
}

void main();
