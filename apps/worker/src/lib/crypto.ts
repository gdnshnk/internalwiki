import { createDecipheriv, createHash } from "node:crypto";

const DEFAULT_SECRET = "replace-me-in-production";

function keyFromSecret(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

function getEncryptionSecret(): string {
  const configured = process.env.INTERNALWIKI_ENCRYPTION_KEY;
  if (configured && configured.trim().length >= 16) {
    return configured;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "INTERNALWIKI_ENCRYPTION_KEY must be configured in production (minimum 16 characters recommended)."
    );
  }

  return DEFAULT_SECRET;
}

export function decryptSecret(cipherText: string): string {
  const secret = getEncryptionSecret();
  const key = keyFromSecret(secret);
  const payload = Buffer.from(cipherText, "base64url");

  const iv = payload.subarray(0, 12);
  const authTag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
