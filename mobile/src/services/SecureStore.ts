/**
 * Persistent secure storage for encryption keys and encrypted data.
 *
 * Production: Uses expo-secure-store (Android Keystore) for the encryption key
 * and expo-file-system for encrypted log blobs.
 *
 * Tests: Uses in-memory maps (setMockMode).
 */

import { EncryptedLogEntry, UploadQueueItem } from '../types/Log';

// Lazy imports — only loaded in production (mocked in tests).
// Using `any` for module types because expo modules have complex
// re-export structures that differ between test mocks and production.
let SecureStoreModule: any = null;
let FileSystemModule: any = null;

async function getSecureStore(): Promise<any> {
  if (!SecureStoreModule) {
    try {
      SecureStoreModule = await import('expo-secure-store');
    } catch {
      return null;
    }
  }
  return SecureStoreModule;
}

async function getFileSystem(): Promise<any> {
  if (!FileSystemModule) {
    try {
      FileSystemModule = await import('expo-file-system');
    } catch {
      return null;
    }
  }
  return FileSystemModule;
}

const ENCRYPTION_KEY_ID = 'syncv_encryption_key';
const ENCRYPTED_LOGS_DIR = 'encrypted_logs';
const UPLOAD_QUEUE_FILE = 'upload_queue.json';

export class SecureStore {
  private mockMode: boolean = false;
  private mockKeyStore: Map<string, string> = new Map();
  private mockFileStore: Map<string, string> = new Map();

  /** Enable mock mode for testing (no filesystem/keystore access) */
  setMockMode(enabled: boolean = true): void {
    this.mockMode = enabled;
  }

  // --- Encryption Key (Android Keystore backed) ---

  async saveEncryptionKey(key: string): Promise<void> {
    if (this.mockMode) {
      this.mockKeyStore.set(ENCRYPTION_KEY_ID, key);
      return;
    }

    const store = await getSecureStore();
    if (store) {
      await store.setItemAsync(ENCRYPTION_KEY_ID, key);
    }
  }

  async loadEncryptionKey(): Promise<string | null> {
    if (this.mockMode) {
      return this.mockKeyStore.get(ENCRYPTION_KEY_ID) || null;
    }

    const store = await getSecureStore();
    if (store) {
      return await store.getItemAsync(ENCRYPTION_KEY_ID);
    }
    return null;
  }

  async deleteEncryptionKey(): Promise<void> {
    if (this.mockMode) {
      this.mockKeyStore.delete(ENCRYPTION_KEY_ID);
      return;
    }

    const store = await getSecureStore();
    if (store) {
      await store.deleteItemAsync(ENCRYPTION_KEY_ID);
    }
  }

  // --- Encrypted Log Blobs (filesystem) ---

  private logsDir(): string {
    return `${ENCRYPTED_LOGS_DIR}/`;
  }

  private logPath(filename: string): string {
    // Sanitize filename for filesystem
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${this.logsDir()}${safe}.enc`;
  }

  async saveEncryptedLog(filename: string, entry: EncryptedLogEntry): Promise<void> {
    const json = JSON.stringify(entry);

    if (this.mockMode) {
      this.mockFileStore.set(this.logPath(filename), json);
      return;
    }

    const fs = await getFileSystem();
    if (!fs || !fs.documentDirectory) return;

    const dir = fs.documentDirectory + this.logsDir();
    const dirInfo = await fs.getInfoAsync(dir);
    if (!dirInfo.exists) {
      await fs.makeDirectoryAsync(dir, { intermediates: true });
    }

    const path = fs.documentDirectory + this.logPath(filename);
    await fs.writeAsStringAsync(path, json);
  }

  async loadAllEncryptedLogs(): Promise<Map<string, EncryptedLogEntry>> {
    const result = new Map<string, EncryptedLogEntry>();

    if (this.mockMode) {
      for (const [path, json] of this.mockFileStore.entries()) {
        if (path.startsWith(this.logsDir()) && path.endsWith('.enc')) {
          try {
            const entry: EncryptedLogEntry = JSON.parse(json);
            result.set(entry.metadata.filename, entry);
          } catch {
            // Skip corrupt entries
          }
        }
      }
      return result;
    }

    const fs = await getFileSystem();
    if (!fs || !fs.documentDirectory) return result;

    const dir = fs.documentDirectory + this.logsDir();
    const dirInfo = await fs.getInfoAsync(dir);
    if (!dirInfo.exists) return result;

    const files = await fs.readDirectoryAsync(dir);
    for (const file of files) {
      if (!file.endsWith('.enc')) continue;
      try {
        const json = await fs.readAsStringAsync(dir + file);
        const entry: EncryptedLogEntry = JSON.parse(json);
        result.set(entry.metadata.filename, entry);
      } catch {
        // Skip corrupt entries
      }
    }

    return result;
  }

  async deleteEncryptedLog(filename: string): Promise<void> {
    if (this.mockMode) {
      this.mockFileStore.delete(this.logPath(filename));
      return;
    }

    const fs = await getFileSystem();
    if (!fs || !fs.documentDirectory) return;

    const path = fs.documentDirectory + this.logPath(filename);
    const info = await fs.getInfoAsync(path);
    if (info.exists) {
      await fs.deleteAsync(path);
    }
  }

  // --- Upload Queue (filesystem) ---

  async saveUploadQueue(queue: UploadQueueItem[]): Promise<void> {
    const json = JSON.stringify(queue);

    if (this.mockMode) {
      this.mockFileStore.set(UPLOAD_QUEUE_FILE, json);
      return;
    }

    const fs = await getFileSystem();
    if (!fs || !fs.documentDirectory) return;

    await fs.writeAsStringAsync(fs.documentDirectory + UPLOAD_QUEUE_FILE, json);
  }

  async loadUploadQueue(): Promise<UploadQueueItem[]> {
    if (this.mockMode) {
      const json = this.mockFileStore.get(UPLOAD_QUEUE_FILE);
      if (json) {
        try { return JSON.parse(json); } catch { return []; }
      }
      return [];
    }

    const fs = await getFileSystem();
    if (!fs || !fs.documentDirectory) return [];

    const path = fs.documentDirectory + UPLOAD_QUEUE_FILE;
    const info = await fs.getInfoAsync(path);
    if (!info.exists) return [];

    try {
      const json = await fs.readAsStringAsync(path);
      return JSON.parse(json);
    } catch {
      return [];
    }
  }
}
