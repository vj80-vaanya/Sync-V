import crypto from 'crypto';

/**
 * Decrypt AES-256-CBC encrypted data.
 * Expects base64-encoded string containing: 16-byte IV + ciphertext (PKCS7 padded).
 */
export function decryptAes256Cbc(base64Data: string, hexKey: string): string {
  const buf = Buffer.from(base64Data, 'base64');
  if (buf.length < 32) {
    throw new Error('Encrypted payload too short (need at least IV + one block)');
  }

  const iv = buf.subarray(0, 16);
  const ciphertext = buf.subarray(16);
  const key = Buffer.from(hexKey, 'hex');

  if (key.length !== 32) {
    throw new Error('PSK must be 32 bytes (64 hex characters)');
  }

  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

/**
 * Check if a string looks like a base64-encoded encrypted payload.
 * Valid payloads decode to at least 32 bytes (16-byte IV + 16-byte min ciphertext block).
 */
export function isEncryptedPayload(data: string): boolean {
  if (!data || data.length < 44) return false; // base64 of 32 bytes = 44 chars
  try {
    const buf = Buffer.from(data, 'base64');
    // Re-encode to verify it's valid base64
    if (buf.toString('base64') !== data) return false;
    return buf.length >= 32 && buf.length % 16 === 0;
  } catch {
    return false;
  }
}
