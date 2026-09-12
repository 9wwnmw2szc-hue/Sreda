import { test } from "node:test";
import assert from "node:assert/strict";
import { encryptSecret, decryptSecret } from "../src/server/connections/crypto.ts";

test("connection secrets are encrypted and round-trip with the server secret", () => {
  const token = "telegram-token-sensitive-123"; const secret = "server-secret-value";
  const encrypted = encryptSecret(token, secret);
  assert.notEqual(encrypted, token); assert.ok(encrypted.startsWith("v1."));
  assert.equal(decryptSecret(encrypted, secret), token);
  assert.throws(() => decryptSecret(encrypted, "another-secret"));
});
