import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
export function encryptSecret(value: string, secret: string) {
  const key = createHash("sha256").update(secret).digest(); const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key, iv); const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}
export function decryptSecret(value: string, secret: string) {
  const [version, iv, tag, data] = value.split("."); if (version !== "v1" || !iv || !tag || !data) throw new Error("Invalid secret");
  const decipher = createDecipheriv("aes-256-gcm", createHash("sha256").update(secret).digest(), Buffer.from(iv, "base64url")); decipher.setAuthTag(Buffer.from(tag, "base64url")); return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
