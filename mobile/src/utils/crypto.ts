/**
 * Crypto utility — DEPRECATED.
 *
 * E2E encryption is now handled by the Drive (AES-256-CBC) and Cloud (decryption).
 * Mobile is a dumb router and never encrypts or decrypts log data.
 *
 * This module retains only session key management for backwards-compatibility
 * with SecureStore persistence, and resetSessionKey/setSessionKey for tests.
 */

import { createHash } from './hash';
import { SecureStore } from '../services/SecureStore';

// Session key — retained for SecureStore persistence compatibility only.
let sessionKey: string | null = null;
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
 * Retained for backwards-compatibility with SecureStore.
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

  sessionKey = createHash(randomHex(32) + Date.now().toString());

  if (secureStore) {
    await secureStore.saveEncryptionKey(sessionKey);
  }

  return sessionKey;
}

/** Get or create the session encryption key (synchronous — uses cached key) */
export function getSessionKey(): string {
  if (!sessionKey) {
    sessionKey = createHash(randomHex(32) + Date.now().toString());
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
