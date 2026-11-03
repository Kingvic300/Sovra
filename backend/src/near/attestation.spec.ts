import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import type * as Dcap from "@phala/dcap-qvl";
import {
  expectedMrConfigId,
  expectedReportData,
  freshNonce,
  imageDigests,
  recoverEip191Address,
  replayRtmr3,
  verifyCpuReport,
  type CpuReport,
} from "./attestation.js";

const sha384 = (b: Buffer) => createHash("sha384").update(b).digest();

/** Signs like Ethereum personal_sign: r || s || v with v = 27 + recovery bit. */
function personalSign(secret: Uint8Array, text: string) {
  const msg = Buffer.from(text, "utf8");
  const hash = keccak_256(Buffer.concat([Buffer.from(`\x19Ethereum Signed Message:\n${msg.length}`), msg]));
  const rec = secp256k1.sign(hash, secret, { prehash: false, format: "recovered" });
  return `0x${Buffer.concat([Buffer.from(rec.subarray(1)), Buffer.from([27 + rec[0]])]).toString("hex")}`;
}

function addressOf(secret: Uint8Array) {
  return `0x${Buffer.from(keccak_256(secp256k1.getPublicKey(secret, false).subarray(1)).subarray(12)).toString("hex")}`;
}

describe("freshNonce", () => {
  it("is 32 random bytes as 64 hex characters, different every time", () => {
    const a = freshNonce();
    assert.match(a, /^[0-9a-f]{64}$/);
    assert.notEqual(a, freshNonce());
  });
});

describe("expectedReportData", () => {
  it("right-pads the 20-byte address to 32 bytes, then the nonce", () => {
    const nonce = "ab".repeat(32);
    const data = expectedReportData("0x" + "11".repeat(20), nonce);
    assert.equal(data.length, 64);
    assert.equal(data.subarray(0, 20).toString("hex"), "11".repeat(20));
    assert.equal(data.subarray(20, 32).toString("hex"), "00".repeat(12));
    assert.equal(data.subarray(32).toString("hex"), nonce);
  });
});

describe("expectedMrConfigId", () => {
  it("is 0x01, SHA-256 of the raw compose string, then 15 zero bytes", () => {
    const id = expectedMrConfigId('{"a":1}');
    assert.equal(id.length, 48);
    assert.equal(id[0], 1);
    assert.equal(id.subarray(1, 33).toString("hex"), createHash("sha256").update('{"a":1}').digest("hex"));
    assert.ok(id.subarray(33).equals(Buffer.alloc(15)));
  });
});

describe("replayRtmr3", () => {
  it("extends only imr 3 events, in order", () => {
    const events = [
      { imr: 3, event_type: 134217729, event: "app-id", event_payload: "beef" },
      { imr: 1, event_type: 1, event: "ignored", event_payload: "00" },
      { imr: 3, event_type: 134217729, event: "compose-hash", event_payload: "cafe" },
    ];
    const digest = (e: (typeof events)[number]) => {
      const t = Buffer.alloc(4);
      t.writeUInt32LE(e.event_type);
      return sha384(Buffer.concat([t, Buffer.from(":"), Buffer.from(e.event), Buffer.from(":"), Buffer.from(e.event_payload, "hex")]));
    };
    let want = Buffer.alloc(48);
    for (const e of [events[0], events[2]]) want = sha384(Buffer.concat([want, digest(e)]));
    const { rtmr3, mismatched } = replayRtmr3(JSON.stringify(events));
    assert.ok(rtmr3.equals(want));
    assert.equal(mismatched, 0);
  });

  it("counts events whose stated digest is wrong", () => {
    const { mismatched } = replayRtmr3([{ imr: 3, event_type: 1, event: "x", event_payload: "", digest: "00".repeat(48) }]);
    assert.equal(mismatched, 1);
  });
});

describe("recoverEip191Address", () => {
  it("recovers the signer of a personal_sign signature", () => {
    const secret = secp256k1.utils.randomSecretKey();
    const text = "Qwen/Qwen3.6-35B-A3B-FP8:aa:bb";
    assert.equal(recoverEip191Address(text, personalSign(secret, text)), addressOf(secret));
  });

  it("recovers a different address when the text was changed", () => {
    const secret = secp256k1.utils.randomSecretKey();
    assert.notEqual(recoverEip191Address("model:aa:bc", personalSign(secret, "model:aa:bb")), addressOf(secret));
  });
});

describe("verifyCpuReport", () => {
  const nonce = "cd".repeat(32);
  const signer = "0x" + "22".repeat(20);
  const compose = '{"services":{"vllm":{"image":"vllm/vllm-openai@sha256:' + "e".repeat(64) + '"}}}';
  const events = [{ imr: 3, event_type: 134217729, event: "compose-hash", event_payload: "01" }];

  const report: CpuReport = {
    signing_address: signer,
    intel_quote: "00",
    event_log: JSON.stringify(events),
    request_nonce: nonce,
    info: { tcb_info: JSON.stringify({ app_compose: compose }) },
  };

  const fakeQuote = (overrides: Partial<Record<"reportData" | "mrConfigId" | "rtMr3" | "tdAttributes", Uint8Array>> = {}, status = "UpToDate") =>
    (async () => {
      const td = {
        tdAttributes: new Uint8Array(8),
        reportData: expectedReportData(signer, nonce),
        mrConfigId: expectedMrConfigId(compose),
        rtMr3: replayRtmr3(events).rtmr3,
        ...overrides,
      };
      return { status, advisory_ids: [], report: { type: "td10", asTd10: () => td, asTd15: () => null } } as unknown as Dcap.VerifiedReport;
    }) as (q: Buffer) => Promise<Dcap.VerifiedReport>;

  it("passes every check for a consistent report", async () => {
    const checks = await verifyCpuReport(report, nonce, "model", fakeQuote());
    assert.deepEqual(
      checks.map((c) => [c.id, c.status]),
      [
        ["model.nonce_echo", "pass"],
        ["model.tdx_quote", "pass"],
        ["model.debug_off", "pass"],
        ["model.binds_signer", "pass"],
        ["model.binds_nonce", "pass"],
        ["model.mrconfig", "pass"],
        ["model.rtmr3", "pass"],
      ],
    );
  });

  it("fails when the quote was made for another nonce (a replayed report)", async () => {
    const checks = await verifyCpuReport(report, nonce, "model", fakeQuote({ reportData: expectedReportData(signer, "ef".repeat(32)) }));
    assert.equal(checks.find((c) => c.id === "model.binds_nonce")?.status, "fail");
  });

  it("fails when the compose file was swapped", async () => {
    const checks = await verifyCpuReport(report, nonce, "model", fakeQuote({ mrConfigId: expectedMrConfigId("{}") }));
    assert.equal(checks.find((c) => c.id === "model.mrconfig")?.status, "fail");
  });

  it("fails a debug TD and warns on an out-of-date TCB", async () => {
    const checks = await verifyCpuReport(report, nonce, "model", fakeQuote({ tdAttributes: new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0]) }, "OutOfDate"));
    assert.equal(checks.find((c) => c.id === "model.debug_off")?.status, "fail");
    assert.equal(checks.find((c) => c.id === "model.tdx_quote")?.status, "warn");
  });

  it("skips the rest when the quote does not verify", async () => {
    const checks = await verifyCpuReport(report, nonce, "gateway", async () => {
      throw new Error("bad signature");
    });
    assert.equal(checks.find((c) => c.id === "gateway.tdx_quote")?.status, "fail");
    assert.ok(checks.filter((c) => c.status === "skipped").length >= 5);
  });

  it("lists image digests pinned in the compose file", () => {
    assert.deepEqual(imageDigests(report), [`vllm/vllm-openai@sha256:${"e".repeat(64)}`]);
  });
});
