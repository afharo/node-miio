/*
 * Request signing and encryption of the Xiaomi Cloud API (api.io.mi.com).
 *
 * Ported from Xiaomi-cloud-tokens-extractor (https://github.com/PiotrMachowski/Xiaomi-cloud-tokens-extractor)
 * Copyright (c) 2020 Piotr Machowski. Licensed under the MIT License.
 */
import crypto from "node:crypto";

/**
 * RC4 stream cipher, dropping the first `drop` bytes of the keystream (the API uses RC4-drop1024).
 * Implemented in JS because Node.js (OpenSSL 3) no longer ships RC4 by default.
 *
 * @param key The key
 * @param data The data to encrypt or decrypt (RC4 is symmetric)
 * @param drop The number of keystream bytes to discard first
 * @returns The encrypted (or decrypted) data
 */
export function rc4(key: Buffer, data: Buffer, drop = 1024): Buffer {
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i++) s[i] = i;
  for (let i = 0, j = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) & 0xff;
    [s[i], s[j]] = [s[j], s[i]];
  }
  const out = Buffer.alloc(data.length);
  for (let n = 0, i = 0, j = 0; n < drop + data.length; n++) {
    i = (i + 1) & 0xff;
    j = (j + s[i]) & 0xff;
    [s[i], s[j]] = [s[j], s[i]];
    if (n >= drop) out[n - drop] = data[n - drop] ^ s[(s[i] + s[j]) & 0xff];
  }
  return out;
}

/**
 * Generates a request nonce: 8 random bytes followed by the current minute (uint32, big-endian).
 *
 * @param now The current time in milliseconds
 * @param random 8 random bytes
 * @returns The nonce (base64)
 */
export function generateNonce(
  now = Date.now(),
  random = crypto.randomBytes(8),
): string {
  const minutes = Buffer.alloc(4);
  minutes.writeUInt32BE(Math.floor(now / 60000));
  return Buffer.concat([random, minutes]).toString("base64");
}

/**
 * @param ssecurity The `ssecurity` of the session (base64)
 * @param nonce The request nonce (base64)
 * @returns The key of the request: `sha256(ssecurity + nonce)` (base64)
 */
export function signedNonce(ssecurity: string, nonce: string): string {
  return crypto
    .createHash("sha256")
    .update(Buffer.from(ssecurity, "base64"))
    .update(Buffer.from(nonce, "base64"))
    .digest("base64");
}

/**
 * @param url The full URL of the API call
 * @param method The HTTP method
 * @param key The signed nonce (base64)
 * @param params The request params, in order
 * @returns The `sha1` signature of the request (base64)
 */
export function encSignature(
  url: string,
  method: string,
  key: string,
  params: Record<string, string>,
): string {
  const path = new URL(url).pathname.replace("/app/", "/");
  const parts = [method.toUpperCase(), path];
  for (const [k, v] of Object.entries(params)) parts.push(`${k}=${v}`);
  parts.push(key);
  return crypto.createHash("sha1").update(parts.join("&")).digest("base64");
}

/**
 * @param key The signed nonce (base64)
 * @param payload The text to encrypt
 * @returns The encrypted text (base64)
 */
export function encryptRc4(key: string, payload: string): string {
  return rc4(Buffer.from(key, "base64"), Buffer.from(payload)).toString(
    "base64",
  );
}

/**
 * @param key The signed nonce (base64)
 * @param payload The encrypted text (base64)
 * @returns The decrypted text
 */
export function decryptRc4(key: string, payload: string): string {
  return rc4(
    Buffer.from(key, "base64"),
    Buffer.from(payload, "base64"),
  ).toString("utf8");
}

/**
 * Signs and encrypts the params of an API call.
 *
 * @param url The full URL of the API call
 * @param method The HTTP method
 * @param key The signed nonce (base64)
 * @param nonce The nonce (base64)
 * @param params The params to send (e.g. `{ data: "{...}" }`)
 * @param ssecurity The `ssecurity` of the session
 * @returns The params to send
 */
export function encryptParams(
  url: string,
  method: string,
  key: string,
  nonce: string,
  params: Record<string, string>,
  ssecurity: string,
): Record<string, string> {
  const signed: Record<string, string> = {
    ...params,
    rc4_hash__: encSignature(url, method, key, params),
  };
  const encrypted: Record<string, string> = {};
  for (const [k, v] of Object.entries(signed))
    encrypted[k] = encryptRc4(key, v);
  return {
    ...encrypted,
    signature: encSignature(url, method, key, encrypted),
    ssecurity,
    _nonce: nonce,
  };
}
