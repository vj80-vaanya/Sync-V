import { encrypt, decrypt, getSessionKey, resetSessionKey, setSessionKey } from '../src/utils/crypto';

describe('Crypto utility', () => {
  beforeEach(() => {
    resetSessionKey();
  });

  test('generates a session key', () => {
    const key = getSessionKey();
    expect(key).toBeTruthy();
    expect(key.length).toBe(64); // SHA256 hex output
  });

  test('session key is stable within a session', () => {
    const key1 = getSessionKey();
    const key2 = getSessionKey();
    expect(key1).toBe(key2);
  });

  test('encrypt returns an EncryptedBlob', () => {
    const blob = encrypt('hello world');
    expect(blob.ciphertext).toBeTruthy();
    expect(blob.nonce).toBeTruthy();
    expect(blob.integrity).toBeTruthy();
    expect(blob.ciphertext.length).toBeGreaterThan(0);
    expect(blob.nonce.length).toBe(32); // 16 bytes hex
    expect(blob.integrity.length).toBe(64); // SHA256 hex
  });

  test('ciphertext differs from plaintext', () => {
    const plaintext = 'sensitive log data from device DEV001';
    const blob = encrypt(plaintext);
    // Ciphertext should not contain the plaintext as hex
    expect(blob.ciphertext).not.toBe(plaintext);
  });

  test('decrypt recovers original plaintext', () => {
    const plaintext = 'sensor data: temp=25.3, pressure=1013.2, timestamp=2026-01-15T10:30:00Z';
    const blob = encrypt(plaintext);
    const recovered = decrypt(blob);
    expect(recovered).toBe(plaintext);
  });

  test('decrypt returns null with wrong session key', () => {
    setSessionKey('key-for-encryption');
    const blob = encrypt('secret data');

    // Change session key to simulate different session
    setSessionKey('different-key');
    const recovered = decrypt(blob);
    expect(recovered).toBeNull();
  });

  test('decrypt returns null if ciphertext is tampered', () => {
    const blob = encrypt('original data');
    // Tamper with ciphertext
    const tampered = { ...blob, ciphertext: 'ff' + blob.ciphertext.slice(2) };
    const recovered = decrypt(tampered);
    expect(recovered).toBeNull();
  });

  test('decrypt returns null if integrity hash is wrong', () => {
    const blob = encrypt('original data');
    const tampered = { ...blob, integrity: '0'.repeat(64) };
    const recovered = decrypt(tampered);
    expect(recovered).toBeNull();
  });

  test('encrypts empty string', () => {
    const blob = encrypt('');
    expect(blob.ciphertext).toBe('');
    const recovered = decrypt(blob);
    expect(recovered).toBe('');
  });

  test('encrypts long data', () => {
    const longData = 'A'.repeat(10000);
    const blob = encrypt(longData);
    const recovered = decrypt(blob);
    expect(recovered).toBe(longData);
  });

  test('different encryptions produce different nonces', () => {
    const blob1 = encrypt('same data');
    const blob2 = encrypt('same data');
    expect(blob1.nonce).not.toBe(blob2.nonce);
  });

  test('resetSessionKey generates new key', () => {
    const key1 = getSessionKey();
    resetSessionKey();
    const key2 = getSessionKey();
    expect(key1).not.toBe(key2);
  });
});
