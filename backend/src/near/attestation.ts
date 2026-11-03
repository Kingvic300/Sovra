/**
 * Verifies NEAR AI Cloud TEE attestation, following https://docs.near.ai/cloud/verification:
 *
 *  1. Ask for a report with a fresh 32-byte random nonce (before any private data is sent).
 *  2. Verify each Intel TDX quote with dcap-qvl and read report_data and measurements from the
 *     VERIFIED quote, never from the HTTP echo.
 *  3. report_data[0:32] must bind the signing address, report_data[32:64] must be our nonce.
 *  4. MRCONFIGID must equal 0x01 || SHA-256(app_compose) || 15 zero bytes.
 *  5. Replaying the event log must reproduce RTMR3.
 *  6. The GPU evidence must carry our nonce and NVIDIA NRAS must return a passing verdict.
 *  7. After the completion, the response signature must recover to the attested signing address
 *     and sign SHA-256(request bytes) and SHA-256(response bytes).
 *
 * Every function here is pure or talks only to Intel/Phala collateral servers and NVIDIA NRAS.
 * Nothing is stored.
 */
import { createHash, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import type * as Dcap from "@phala/dcap-qvl";

// dcap-qvl ships CommonJS only.
const dcap = createRequire(import.meta.url)("@phala/dcap-qvl") as typeof Dcap;

export const NRAS_GPU_URL = "https://nras.attestation.nvidia.com/v3/attest/gpu";
const FETCH_TIMEOUT_MS = 20_000;

/** TCB statuses accepted as passing. Anything else fails the quote check. */
const TCB_PASS = new Set(["UpToDate"]);
/** Platform patch level is behind Intel's latest: the quote is genuine, but flagged. */
const TCB_WARN = new Set(["SWHardeningNeeded", "ConfigurationAndSWHardeningNeeded", "OutOfDate", "OutOfDateConfigurationNeeded", "ConfigurationNeeded"]);

export type CheckStatus = "pass" | "warn" | "fail" | "skipped";
export type Check = {
  id: string;
  /** Which piece of hardware or data this check is about. */
  scope: "gateway" | "model" | "gpu" | "response";
  label: string;
  status: CheckStatus;
  detail: string;
};

/** One attestation entry as NEAR AI Cloud returns it (gateway_attestation or a model_attestations[] item). */
export type CpuReport = {
  signing_address: string;
  signing_algo?: string;
  intel_quote: string;
  event_log: string | EventLogEntry[];
  request_nonce?: string;
  report_data?: string;
  info?: { tcb_info?: string | { app_compose?: string } } & Record<string, unknown>;
  nvidia_payload?: string;
};

export type AttestationReport = {
  gateway_attestation: CpuReport;
  model_attestations?: CpuReport[];
};

type EventLogEntry = { imr: number; event_type: number; digest?: string; event?: string; event_payload?: string };

export function freshNonce() {
  return randomBytes(32).toString("hex");
}

const strip0x = (hex: string) => (hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex);
const hexBytes = (hex: string) => Buffer.from(strip0x(hex), "hex");
const toHex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
const sha256 = (data: Uint8Array | string) => createHash("sha256").update(data).digest();
const sha384 = (data: Uint8Array) => createHash("sha384").update(data).digest();
const short = (hex: string) => (hex.length > 20 ? `${hex.slice(0, 10)}…${hex.slice(-8)}` : hex);

export function sha256Hex(data: Uint8Array | string) {
  return sha256(data).toString("hex");
}

export function appCompose(report: CpuReport): string | null {
  const tcb = report.info?.tcb_info;
  const parsed = typeof tcb === "string" ? (JSON.parse(tcb) as { app_compose?: string }) : tcb;
  return typeof parsed?.app_compose === "string" ? parsed.app_compose : null;
}

/** Docs: MRCONFIGID = 0x01 || SHA-256(app_compose) || 15 zero bytes, over the raw string (no re-serialising). */
export function expectedMrConfigId(compose: string) {
  return Buffer.concat([Buffer.from([1]), sha256(Buffer.from(compose, "utf8")), Buffer.alloc(15)]);
}

/** Docs: replay imr==3 events. digest = SHA-384(LE32(event_type) || ":" || event || ":" || payload); RTMR3 = SHA-384(RTMR3 || digest). */
export function replayRtmr3(eventLog: string | EventLogEntry[]) {
  const events = (typeof eventLog === "string" ? JSON.parse(eventLog) : eventLog) as EventLogEntry[];
  let rtmr = Buffer.alloc(48);
  let mismatched = 0;
  for (const e of events) {
    if (e.imr !== 3) continue;
    const type = Buffer.alloc(4);
    type.writeUInt32LE(e.event_type >>> 0);
    const digest = sha384(
      Buffer.concat([type, Buffer.from(":"), Buffer.from(e.event ?? "", "utf8"), Buffer.from(":"), hexBytes(e.event_payload ?? "")]),
    );
    if (e.digest && strip0x(e.digest).toLowerCase() !== digest.toString("hex")) mismatched++;
    rtmr = sha384(Buffer.concat([rtmr, digest]));
  }
  return { rtmr3: rtmr, mismatched };
}

/** Docs (no TLS binding): report_data = signing identity right-padded to 32 bytes || 32-byte nonce. */
export function expectedReportData(signingAddress: string, nonceHex: string) {
  const id = hexBytes(signingAddress);
  const head = Buffer.alloc(32);
  id.copy(head, 0, 0, Math.min(32, id.length));
  return Buffer.concat([head, hexBytes(nonceHex)]);
}

/** EIP-191 personal_sign recovery: the Ethereum address that signed `text`. */
export function recoverEip191Address(text: string, signatureHex: string) {
  const msg = Buffer.from(text, "utf8");
  const prefixed = Buffer.concat([Buffer.from(`\x19Ethereum Signed Message:\n${msg.length}`, "utf8"), msg]);
  const hash = keccak_256(prefixed);
  const sig = hexBytes(signatureHex);
  if (sig.length !== 65) throw new Error(`signature is ${sig.length} bytes, expected 65`);
  const v = sig[64] >= 27 ? sig[64] - 27 : sig[64];
  const point = secp256k1.Signature.fromBytes(sig.subarray(0, 64), "compact").addRecoveryBit(v).recoverPublicKey(hash);
  const uncompressed = point.toBytes(false).subarray(1);
  return `0x${toHex(keccak_256(uncompressed).subarray(12))}`;
}

export function sameAddress(a: string, b: string) {
  return strip0x(a).toLowerCase() === strip0x(b).toLowerCase();
}

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
}

/** Collateral server that last worked. Holds a public URL only, never user data. */
let lastGoodPccs: string | null = null;
/**
 * Intel collateral (TCB info, QE identity, CRLs) per platform FMSPC. It is public, signed by Intel,
 * and dcap-qvl checks its signatures and expiry on every verification, so reusing it for a few
 * hours is safe and keeps audits working when the collateral servers are slow. Holds no user data.
 */
const collateralCache = new Map<string, { collateral: Dcap.Collateral; at: number }>();
const COLLATERAL_TTL_MS = 6 * 60 * 60 * 1000;

const isNetworkError = (err: unknown) =>
  /fetch|network|timed? ?out|ECONN|ENOTFOUND|abort|socket/i.test(err instanceof Error ? `${err.message} ${String(err.cause ?? "")}` : String(err));

async function fetchCollateral(quote: Buffer): Promise<Dcap.Collateral> {
  const all = process.env.NEAR_PCCS_URL ? [process.env.NEAR_PCCS_URL] : [dcap.PHALA_PCCS_URL, dcap.INTEL_PCS_URL];
  // Start with whichever server answered last time, so an unreachable one costs one timeout, not one per quote.
  const sources = lastGoodPccs ? [lastGoodPccs, ...all.filter((u) => u !== lastGoodPccs)] : all;
  let lastError: unknown;
  // Collateral servers drop the odd request; each source gets a second try before the next one.
  for (const url of sources.flatMap((u) => [u, u])) {
    try {
      const collateral = await dcap.getCollateral(url, quote);
      lastGoodPccs = url;
      // getCollateral attaches this quote's PCK chain, which would override the next quote's own
      // embedded chain. Drop it so every quote is checked against the chain it carries.
      return { ...collateral, pck_certificate_chain: null } as unknown as Dcap.Collateral;
    } catch (err) {
      lastError = err;
      if (!isNetworkError(err)) throw err;
    }
  }
  throw lastError;
}

/**
 * Verifies a TDX quote with dcap-qvl against Intel's root CA. Collateral comes from Phala's PCCS
 * mirror or Intel's own PCS (the same Intel-signed data either way) and is cached per FMSPC.
 */
export async function verifyQuoteWithCollateral(quote: Buffer): Promise<Dcap.VerifiedReport> {
  const parsed = dcap.Quote.parse(quote);
  let fmspc: string;
  let ca: string;
  try {
    fmspc = dcap.intel.getFmspc(parsed).toString("hex");
    ca = dcap.intel.getCa(parsed);
  } catch {
    // Quotes without an embedded PCK chain need it fetched from the PCCS: no caching for those.
    return dcap.getCollateralAndVerify(quote, process.env.NEAR_PCCS_URL || dcap.PHALA_PCCS_URL);
  }
  const key = `${fmspc}:${ca}`;
  const now = Date.now();
  const cached = collateralCache.get(key);
  if (cached && now - cached.at < COLLATERAL_TTL_MS) {
    try {
      return dcap.verify(quote, cached.collateral, Math.floor(now / 1000));
    } catch {
      // Expired or replaced upstream: fetch fresh collateral below and verify again.
      collateralCache.delete(key);
    }
  }
  const collateral = await fetchCollateral(quote);
  collateralCache.set(key, { collateral, at: now });
  return dcap.verify(quote, collateral, Math.floor(now / 1000));
}

/**
 * Runs every CPU-side check on one report (gateway or model). `quoteVerifier` is injectable so tests
 * can run offline; production uses dcap-qvl against Phala's PCCS mirror of Intel collateral.
 */
export async function verifyCpuReport(
  report: CpuReport,
  nonceHex: string,
  scope: "gateway" | "model",
  quoteVerifier: (quote: Buffer) => Promise<Dcap.VerifiedReport> = verifyQuoteWithCollateral,
): Promise<Check[]> {
  const checks: Check[] = [];
  const add = (id: string, label: string, status: CheckStatus, detail: string) => checks.push({ id: `${scope}.${id}`, scope, label, status, detail });

  add(
    "nonce_echo",
    "Report answers our fresh nonce",
    report.request_nonce?.toLowerCase() === nonceHex.toLowerCase() ? "pass" : "fail",
    `sent ${short(nonceHex)}, got ${short(report.request_nonce ?? "none")}`,
  );

  let td: Dcap.TDReport10 | null = null;
  try {
    const verified = await quoteVerifier(hexBytes(report.intel_quote));
    td = verified.report.asTd10() ?? (verified.report.asTd15()?.base as Dcap.TDReport10 | undefined) ?? null;
    const status = TCB_PASS.has(verified.status) ? "pass" : TCB_WARN.has(verified.status) ? "warn" : "fail";
    const advisories = verified.advisory_ids.length ? `, advisories ${verified.advisory_ids.join(", ")}` : "";
    add("tdx_quote", "Intel TDX quote is genuine (DCAP)", td ? status : "fail", `TCB status ${verified.status}${advisories}, report type ${verified.report.type}`);
  } catch (err) {
    add("tdx_quote", "Intel TDX quote is genuine (DCAP)", "fail", err instanceof Error ? err.message : String(err));
  }

  if (!td) {
    for (const [id, label] of [
      ["debug_off", "TD is not in debug mode"],
      ["binds_signer", "Quote binds the signing key"],
      ["binds_nonce", "Quote binds our nonce"],
      ["mrconfig", "Docker compose matches MRCONFIGID"],
      ["rtmr3", "Event log replays to RTMR3"],
    ] as const)
      add(id, label, "skipped", "quote did not verify");
    return checks;
  }

  add("debug_off", "TD is not in debug mode", (td.tdAttributes[0] & 1) === 0 ? "pass" : "fail", `td_attributes ${toHex(td.tdAttributes)}`);

  const want = expectedReportData(report.signing_address, nonceHex);
  const got = Buffer.from(td.reportData);
  add(
    "binds_signer",
    "Quote binds the signing key",
    got.subarray(0, 32).equals(want.subarray(0, 32)) ? "pass" : "fail",
    `signing address ${report.signing_address}`,
  );
  add(
    "binds_nonce",
    "Quote binds our nonce",
    got.subarray(32, 64).equals(want.subarray(32, 64)) ? "pass" : "fail",
    `report_data[32:64] ${short(toHex(got.subarray(32, 64)))}`,
  );

  const compose = appCompose(report);
  if (compose === null) {
    add("mrconfig", "Docker compose matches MRCONFIGID", "fail", "report has no app_compose");
  } else {
    const ok = Buffer.from(td.mrConfigId).equals(expectedMrConfigId(compose));
    add("mrconfig", "Docker compose matches MRCONFIGID", ok ? "pass" : "fail", `sha256(app_compose) ${short(sha256Hex(compose))}`);
  }

  try {
    const { rtmr3, mismatched } = replayRtmr3(report.event_log);
    const ok = rtmr3.equals(Buffer.from(td.rtMr3)) && mismatched === 0;
    add("rtmr3", "Event log replays to RTMR3", ok ? "pass" : "fail", mismatched ? `${mismatched} event digests differ` : `RTMR3 ${short(toHex(td.rtMr3))}`);
  } catch (err) {
    add("rtmr3", "Event log replays to RTMR3", "fail", err instanceof Error ? err.message : String(err));
  }

  return checks;
}

/** Docs: nvidia_payload must carry our nonce; POST it unchanged to NRAS; JWT claim x-nvidia-overall-att-result must be true. */
export async function verifyGpu(report: CpuReport, nonceHex: string): Promise<Check[]> {
  const checks: Check[] = [];
  const add = (id: string, label: string, status: CheckStatus, detail: string) => checks.push({ id: `gpu.${id}`, scope: "gpu", label, status, detail });

  if (!report.nvidia_payload) {
    add("evidence", "NVIDIA GPU evidence present", "fail", "model report has no nvidia_payload");
    return checks;
  }
  let payload: { nonce?: string } & Record<string, unknown>;
  try {
    payload = JSON.parse(report.nvidia_payload);
  } catch {
    add("evidence", "NVIDIA GPU evidence present", "fail", "nvidia_payload is not JSON");
    return checks;
  }
  add(
    "nonce",
    "GPU evidence carries our nonce",
    payload.nonce?.toLowerCase() === nonceHex.toLowerCase() ? "pass" : "fail",
    `got ${short(payload.nonce ?? "none")}`,
  );

  try {
    const res = await fetchWithTimeout(NRAS_GPU_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: report.nvidia_payload,
    });
    if (!res.ok) throw new Error(`NRAS answered ${res.status}`);
    const body = (await res.json()) as unknown[];
    const jwtEntry = body.find((e) => Array.isArray(e) && e[0] === "JWT") as [string, string] | undefined;
    if (!jwtEntry) throw new Error("NRAS response has no JWT");
    const claims = JSON.parse(Buffer.from(jwtEntry[1].split(".")[1], "base64url").toString("utf8")) as Record<string, unknown>;
    const ok = claims["x-nvidia-overall-att-result"] === true;
    add("nras", "NVIDIA NRAS verdict: GPU is genuine, CC mode on", ok ? "pass" : "fail", `x-nvidia-overall-att-result = ${String(claims["x-nvidia-overall-att-result"])}`);
  } catch (err) {
    add("nras", "NVIDIA NRAS verdict: GPU is genuine, CC mode on", "fail", err instanceof Error ? err.message : String(err));
  }
  return checks;
}

/** Container images pinned by digest in the attested compose file. Listed for the user; provenance isn't checked here. */
export function imageDigests(report: CpuReport) {
  const compose = appCompose(report) ?? "";
  return [...new Set(compose.match(/[a-z0-9][\w./-]*(?::[\w.-]+)?@sha256:[0-9a-f]{64}/g) ?? [])];
}
