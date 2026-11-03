/**
 * NEAR AI Cloud client: OpenAI-compatible chat completions with TEE attestation and a signed
 * response, verified the way https://docs.near.ai/cloud/verification describes.
 *
 * PRIVACY: this class holds no state between calls. Request and response bytes live only in the
 * local variables of `privateCompletion` and are returned to the caller; nothing is cached, logged
 * or written anywhere.
 */
import {
  type AttestationReport,
  type Check,
  type CpuReport,
  freshNonce,
  imageDigests,
  recoverEip191Address,
  sameAddress,
  sha256Hex,
  verifyCpuReport,
  verifyGpu,
} from "./attestation.js";

export const NEAR_AI_BASE_URL = "https://cloud-api.near.ai/v1";
const ATTEST_TIMEOUT_MS = 30_000;
const SIGNATURE_RETRIES = 4;

export type NearModel = { id: string; owned_by: string; supported_features?: string[]; is_ready?: boolean; name?: string };

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type ChatRequest = {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  response_format?: unknown;
};

export type Verification = {
  verified: boolean;
  model: string;
  nonce: string;
  /** Unix ms when the attestation was fetched. */
  attestedAt: number;
  signingAddress: string | null;
  checks: Check[];
  /** Container images the attested compose file pins by digest. */
  images: string[];
  chatId?: string;
  requestHash?: string;
  responseHash?: string;
  signature?: string;
};

export type PrivateCompletion = { content: string; raw: Record<string, unknown>; verification: Verification };

export class NearCloudError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export class NearCloud {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = NEAR_AI_BASE_URL,
  ) {}

  /** Models that run on NEAR's own confidential GPU fleet ("Confidential TEE" tier). Public endpoint. */
  async teeModels(): Promise<NearModel[]> {
    const res = await fetch(`${this.baseUrl}/models`, { signal: AbortSignal.timeout(ATTEST_TIMEOUT_MS) });
    if (!res.ok) throw new NearCloudError(`models endpoint answered ${res.status}`, res.status);
    const body = (await res.json()) as { data: NearModel[] };
    return body.data.filter((m) => m.owned_by === "nearai");
  }

  /** Fetches an attestation report bound to a brand-new random nonce. */
  async attestationReport(model: string, nonce: string): Promise<AttestationReport> {
    const params = new URLSearchParams({ model, nonce, signing_algo: "ecdsa", provider: "near", include_tls_fingerprint: "false" });
    const res = await fetch(`${this.baseUrl}/attestation/report?${params}`, {
      headers: { Authorization: `Bearer ${this.apiKey}`, Accept: "application/json", "x-no-aliasing": "true" },
      signal: AbortSignal.timeout(ATTEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new NearCloudError(`attestation report answered ${res.status}: ${(await res.text()).slice(0, 200)}`, res.status);
    return (await res.json()) as AttestationReport;
  }

  /**
   * Preflight: verify the gateway and the model's TEE before any private data leaves this process.
   * Returns every check run plus the verified model signing addresses the response must match.
   */
  async attest(model: string) {
    const nonce = freshNonce();
    const attestedAt = Date.now();
    const report = await this.attestationReport(model, nonce);
    const checks: Check[] = [];

    checks.push(...(await verifyCpuReport(report.gateway_attestation, nonce, "gateway")));

    const candidates = report.model_attestations ?? [];
    const verifiedSigners: CpuReport[] = [];
    if (!candidates.length) {
      checks.push({ id: "model.present", scope: "model", label: "Model TEE evidence present", status: "fail", detail: "no model_attestations returned" });
    }
    // Candidates for one model share a signing key, so one fully verified candidate is enough to
    // trust that key. Verify the first; fall back to the next only when it fails.
    for (const candidate of candidates) {
      const cpu = await verifyCpuReport(candidate, nonce, "model");
      const gpu = await verifyGpu(candidate, nonce);
      const ok = [...cpu, ...gpu].every((c) => c.status !== "fail");
      if (ok || candidate === candidates[candidates.length - 1]) {
        checks.push(...cpu, ...gpu);
        if (ok) verifiedSigners.push(candidate);
        break;
      }
    }

    const signer = verifiedSigners[0] ?? candidates[0] ?? null;
    return {
      nonce,
      attestedAt,
      checks,
      signers: verifiedSigners,
      signingAddress: signer?.signing_address ?? null,
      images: signer ? imageDigests(signer) : [],
    };
  }

  /**
   * Attest first, then send one chat completion, then verify the response signature against the
   * attested key. Throws before sending anything if the model's TEE does not verify.
   */
  async privateCompletion(request: ChatRequest): Promise<PrivateCompletion> {
    const preflight = await this.attest(request.model);
    const preflightOk = preflight.checks.every((c) => c.status !== "fail") && preflight.signers.length > 0;
    const verification: Verification = {
      verified: false,
      model: request.model,
      nonce: preflight.nonce,
      attestedAt: preflight.attestedAt,
      signingAddress: preflight.signingAddress,
      checks: preflight.checks,
      images: preflight.images,
    };
    if (!preflightOk) {
      // Refuse to send private data to an environment we could not verify.
      throw Object.assign(new NearCloudError("TEE attestation did not verify, so nothing was sent to the model."), { verification });
    }

    // Keep the exact bytes: the signature covers SHA-256 of the raw request and response bodies.
    const requestBytes = Buffer.from(JSON.stringify(request), "utf8");
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "identity",
        "x-no-aliasing": "true",
      },
      body: requestBytes,
      signal: AbortSignal.timeout(180_000),
    });
    const responseBytes = Buffer.from(await res.arrayBuffer());
    if (!res.ok) {
      throw Object.assign(new NearCloudError(`chat completion answered ${res.status}: ${responseBytes.toString("utf8").slice(0, 200)}`, res.status), {
        verification,
      });
    }
    const raw = JSON.parse(responseBytes.toString("utf8")) as {
      id: string;
      model?: string;
      choices: { message: { content: string | null } }[];
    };

    const requestHash = sha256Hex(requestBytes);
    const responseHash = sha256Hex(responseBytes);
    verification.chatId = raw.id;
    verification.requestHash = requestHash;
    verification.responseHash = responseHash;
    verification.checks = [...preflight.checks, ...(await this.verifySignature(raw.id, request.model, raw.model, requestHash, responseHash, preflight.signers, verification))];
    verification.verified = verification.checks.every((c) => c.status !== "fail");

    return { content: raw.choices[0]?.message?.content ?? "", raw: raw as unknown as Record<string, unknown>, verification };
  }

  private async verifySignature(
    chatId: string,
    model: string,
    responseModel: string | undefined,
    requestHash: string,
    responseHash: string,
    signers: CpuReport[],
    verification: Verification,
  ): Promise<Check[]> {
    const checks: Check[] = [];
    const add = (id: string, label: string, status: Check["status"], detail: string) =>
      checks.push({ id: `response.${id}`, scope: "response", label, status, detail });

    type SignatureBody = { text?: string; signature?: string; signing_address?: string; signing_algo?: string; signature_kind?: string; error_code?: string };
    let sig: SignatureBody | null = null;
    for (let attempt = 0; attempt < SIGNATURE_RETRIES && !sig; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, 750 * attempt));
      const params = new URLSearchParams({ model, signing_algo: "ecdsa" });
      const res = await fetch(`${this.baseUrl}/signature/${encodeURIComponent(chatId)}?${params}`, {
        headers: { Authorization: `Bearer ${this.apiKey}`, Accept: "application/json" },
        signal: AbortSignal.timeout(ATTEST_TIMEOUT_MS),
      });
      if (res.status === 404) continue;
      const body = (await res.json().catch(() => ({}))) as SignatureBody;
      if (res.ok && body.signature && !body.error_code) sig = body;
      else if (!res.ok || body.error_code) break;
    }
    if (!sig?.signature || !sig.text || !sig.signing_address) {
      add("signature", "Response is signed inside the TEE", "fail", "no signature available for this completion");
      return checks;
    }
    verification.signature = sig.signature;

    // provider_tee signs "<MODEL_ID>:<request_hash>:<response_hash>"; the gateway signs "<request_hash>:<response_hash>".
    const tail = `${requestHash}:${responseHash}`;
    const expected = sig.signature_kind === "gateway" ? [tail] : [`${model}:${tail}`, ...(responseModel ? [`${responseModel}:${tail}`] : [])];
    add(
      "hashes",
      "Signature covers our exact request and response",
      expected.includes(sig.text) ? "pass" : "fail",
      `request ${requestHash.slice(0, 12)}…, response ${responseHash.slice(0, 12)}…`,
    );

    let recovered = "";
    try {
      recovered = recoverEip191Address(sig.text, sig.signature);
    } catch (err) {
      add("ecdsa", "ECDSA signature recovers to the signing address", "fail", err instanceof Error ? err.message : String(err));
      return checks;
    }
    add(
      "ecdsa",
      "ECDSA signature recovers to the signing address",
      sameAddress(recovered, sig.signing_address) ? "pass" : "fail",
      `recovered ${recovered}`,
    );
    const attested = signers.some((s) => sameAddress(s.signing_address, recovered));
    add(
      "attested_key",
      "Signing key is the one the TEE attested",
      attested ? "pass" : "fail",
      attested ? `matches the model TEE key (${sig.signature_kind ?? "provider_tee"})` : "key is not in the verified model attestation",
    );
    return checks;
  }
}
