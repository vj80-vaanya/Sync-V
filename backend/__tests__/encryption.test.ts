import crypto from 'crypto';
import { decryptAes256Cbc, isEncryptedPayload } from '../src/utils/encryption';

// Helper: encrypt with AES-256-CBC (mimics what the C++ drive does)
function encryptAes256Cbc(plaintext: string, hexKey: string): string {
  const key = Buffer.from(hexKey, 'hex');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, encrypted]).toString('base64');
}

const TEST_KEY = 'a'.repeat(64); // 32 bytes of 0xaa

describe('encryption utils', () => {
  describe('decryptAes256Cbc', () => {
    test('decrypts data encrypted with known key', () => {
      const plaintext = 'Hello from Sync-V drive!';
      const encrypted = encryptAes256Cbc(plaintext, TEST_KEY);
      const result = decryptAes256Cbc(encrypted, TEST_KEY);
      expect(result).toBe(plaintext);
    });

    test('decrypts empty string', () => {
      const encrypted = encryptAes256Cbc('', TEST_KEY);
      const result = decryptAes256Cbc(encrypted, TEST_KEY);
      expect(result).toBe('');
    });

    test('decrypts long data', () => {
      const plaintext = 'A'.repeat(10000);
      const encrypted = encryptAes256Cbc(plaintext, TEST_KEY);
      const result = decryptAes256Cbc(encrypted, TEST_KEY);
      expect(result).toBe(plaintext);
    });

    test('decrypts multi-block data', () => {
      const plaintext = 'sensor_data: temp=45.3, rpm=3000, timestamp=2026-01-15T10:30:00Z';
      const encrypted = encryptAes256Cbc(plaintext, TEST_KEY);
      const result = decryptAes256Cbc(encrypted, TEST_KEY);
      expect(result).toBe(plaintext);
    });

    test('throws on wrong key', () => {
      const plaintext = 'secret data';
      const encrypted = encryptAes256Cbc(plaintext, TEST_KEY);
      const wrongKey = 'b'.repeat(64);
      expect(() => decryptAes256Cbc(encrypted, wrongKey)).toThrow();
    });

    test('throws on too-short payload', () => {
      const shortData = Buffer.from('tooshort').toString('base64');
      expect(() => decryptAes256Cbc(shortData, TEST_KEY)).toThrow('too short');
    });

    test('throws on invalid key length', () => {
      const encrypted = encryptAes256Cbc('test', TEST_KEY);
      expect(() => decryptAes256Cbc(encrypted, 'aabb')).toThrow('32 bytes');
    });
  });

  describe('isEncryptedPayload', () => {
    test('returns true for valid encrypted payload', () => {
      const encrypted = encryptAes256Cbc('test data', TEST_KEY);
      expect(isEncryptedPayload(encrypted)).toBe(true);
    });

    test('returns false for plain text', () => {
      expect(isEncryptedPayload('just plain text here')).toBe(false);
    });

    test('returns false for empty string', () => {
      expect(isEncryptedPayload('')).toBe(false);
    });

    test('returns false for short string', () => {
      expect(isEncryptedPayload('abc')).toBe(false);
    });

    test('returns false for non-base64 data', () => {
      expect(isEncryptedPayload('!!!not-base64!!!')).toBe(false);
    });
  });
});
