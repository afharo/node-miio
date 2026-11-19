import vectors from "../__fixtures__/cloud/crypto-vectors.json";

import {
  decryptRc4,
  encryptParams,
  encryptRc4,
  generateNonce,
  rc4,
  signedNonce,
} from "./crypto";

describe("cloud crypto (vectors from the reference implementation)", () => {
  test("rc4 without drop matches OpenSSL", () => {
    const key = Buffer.from(vectors.rc4PlainKeyHex, "hex");
    expect(rc4(key, Buffer.from("test"), 0).toString("hex")).toBe(
      vectors.rc4PlainOut,
    );
  });

  test("generateNonce: 8 random bytes + the current minute", () => {
    expect(generateNonce(vectors.millis, Buffer.from(vectors.random))).toBe(
      vectors.nonce,
    );
    expect(Buffer.from(generateNonce(), "base64")).toHaveLength(12);
  });

  test("signedNonce", () => {
    expect(signedNonce(vectors.ssecurity, vectors.nonce)).toBe(
      vectors.signedNonce,
    );
  });

  test("encryptParams signs and encrypts the params", () => {
    expect(
      encryptParams(
        vectors.url,
        "POST",
        vectors.signedNonce,
        vectors.nonce,
        { data: vectors.data },
        vectors.ssecurity,
      ),
    ).toStrictEqual(vectors.params);
  });

  test("encryptRc4 / decryptRc4 round-trip the responses", () => {
    expect(encryptRc4(vectors.signedNonce, vectors.responsePlain)).toBe(
      vectors.responseEncrypted,
    );
    expect(decryptRc4(vectors.signedNonce, vectors.responseEncrypted)).toBe(
      vectors.responsePlain,
    );
  });
});
