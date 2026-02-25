/**
 * Encryption utility for securing logs and firmware data on mobile.
 *
 * Uses SHA256-based keystream in counter mode (CTR) for symmetric encryption.
 * The session key is persisted in Android Keystore via SecureStore so encrypted
 * data survives app restarts.
 *
 * Production note: Replace with react-native-aes-crypto or
 * expo-crypto for hardware-backed AES-256.
 */

import { createHash } from './hash';
import { SecureStore } from '../services/SecureStore';

export interface EncryptedBlob {
  /** Hex-encoded ciphertext */
  ciphertext: string;
  /** Random nonce used for this encryption (hex) */
  nonce: string;
  /** SHA256 of plaintext for integrity verification */
  integrity: string;
}

// Session encryption key — persisted in Android Keystore.
let sessionKey: string | null = null;

// Reference to SecureStore for key persistence
let secureStore: SecureStore | null = null;

/** Generate a random hex string of given byte length */
function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < bytes; i++) {
    arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Set the SecureStore reference for key persistence */
export function setSecureStore(store: SecureStore): void {
  secureStore = store;
}

/**
 * Initialize the session key — loads from Android Keystore if available,
 * otherwise generates a new one and persists it.
 * Call this on app startup before any encrypt/decrypt operations.
 */
export async function initializeSessionKey(store?: SecureStore): Promise<string> {
  if (store) secureStore = store;

  if (secureStore) {
    const persisted = await secureStore.loadEncryptionKey();
    if (persisted) {
      sessionKey = persisted;
      return sessionKey;
    }
  }

  // Generate new key
  sessionKey = createHash(randomHex(32) + Date.now().toString());

  // Persist to Keystore
  if (secureStore) {
    await secureStore.saveEncryptionKey(sessionKey);
  }

  return sessionKey;
}

/** Get or create the session encryption key (synchronous — uses cached key) */
export function getSessionKey(): string {
  if (!sessionKey) {
    sessionKey = createHash(randomHex(32) + Date.now().toString());
    // Async persist in background (best-effort)
    if (secureStore) {
      secureStore.saveEncryptionKey(sessionKey).catch(() => {});
    }
  }
  return sessionKey;
}

/** Reset session key (for testing) */
export function resetSessionKey(): void {
  sessionKey = null;
}

/** Override session key (for testing) */
export function setSessionKey(key: string): void {
  sessionKey = key;
}

/**
 * Generate a keystream block using SHA256 in counter mode.
 * keystream = SHA256(key || nonce || counter)
 */
function keystreamBlock(key: string, nonce: string, counter: number): number[] {
  const hash = createHash(key + nonce + counter.toString());
  const bytes: number[] = [];
  for (let i = 0; i < hash.length; i += 2) {
    bytes.push(parseInt(hash.substring(i, i + 2), 16));
  }
  return bytes;
}

/** Convert a string to UTF-8 byte array */
function stringToBytes(str: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return bytes;
}

/** Convert a UTF-8 byte array to string */
function bytesToString(bytes: number[]): string {
  let str = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    if (b < 0x80) {
      str += String.fromCharCode(b);
      i++;
    } else if ((b & 0xe0) === 0xc0) {
      str += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f));
      i += 2;
    } else {
      str += String.fromCharCode(
        ((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f),
      );
      i += 3;
    }
  }
  return str;
}

/** Convert byte array to hex string */
function bytesToHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Convert hex string to byte array */
function hexToBytes(hex: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substring(i, i + 2), 16));
  }
  return bytes;
}

/**
 * Encrypt plaintext data using the session key.
 * Returns an EncryptedBlob that cannot be decrypted without the session key.
 */
export function encrypt(plaintext: string): EncryptedBlob {
  const key = getSessionKey();
  const nonce = randomHex(16);
  const integrity = createHash(plaintext);
  const plaintextBytes = stringToBytes(plaintext);
  const ciphertextBytes: number[] = new Array(plaintextBytes.length);

  // XOR plaintext with keystream in 32-byte (SHA256 output) blocks
  let blockIndex = 0;
  let keystream: number[] = [];
  for (let i = 0; i < plaintextBytes.length; i++) {
    const ksOffset = i % 32;
    if (ksOffset === 0) {
      keystream = keystreamBlock(key, nonce, blockIndex++);
    }
    ciphertextBytes[i] = plaintextBytes[i] ^ keystream[ksOffset];
  }

  return {
    ciphertext: bytesToHex(ciphertextBytes),
    nonce,
    integrity,
  };
}

/**
 * Decrypt an EncryptedBlob using the session key.
 * Returns null if integrity check fails or decryption errors.
 */
export function decrypt(blob: EncryptedBlob): string | null {
  try {
    const key = getSessionKey();
    const ciphertextBytes = hexToBytes(blob.ciphertext);
    const plaintextBytes: number[] = new Array(ciphertextBytes.length);

    let blockIndex = 0;
    let keystream: number[] = [];
    for (let i = 0; i < ciphertextBytes.length; i++) {
      const ksOffset = i % 32;
      if (ksOffset === 0) {
        keystream = keystreamBlock(key, blob.nonce, blockIndex++);
      }
      plaintextBytes[i] = ciphertextBytes[i] ^ keystream[ksOffset];
    }

    const plaintext = bytesToString(plaintextBytes);

    // Verify integrity
    if (createHash(plaintext) !== blob.integrity) {
      return null;
    }

    return plaintext;
  } catch {
    return null;
  }
}
