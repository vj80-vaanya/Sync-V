import { FileInfo, FileResult } from '../types/Device';
import { DRIVE_CONFIG } from '../config';

export class DriveConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DriveConnectionError';
  }
}

interface DiscoveryResult {
  found: boolean;
  address: string | null;
  port: number;
}

export class DriveCommService {
  private mockAddress: string | null = null;
  private mockPort: number = 0;
  private mockFileList: FileInfo[] = [];
  private mockFileContents: Map<string, string> = new Map();
  private connected: boolean = false;
  private connectionLost: boolean = false;
  private timedOut: boolean = false;
  private timeoutMs: number = 5000;

  // Real HTTP endpoint state
  private realAddress: string | null = null;
  private realPort: number = 0;
  private authToken: string = '';

  // Mock configuration methods (for testing without real hardware)
  setMockDriveAddress(address: string | null, port: number): void {
    this.mockAddress = address;
    this.mockPort = port;
  }

  setMockFileList(files: FileInfo[]): void {
    this.mockFileList = files;
  }

  setMockFileContent(filename: string, content: string): void {
    this.mockFileContents.set(filename, content);
  }

  setTimeoutMs(ms: number): void {
    this.timeoutMs = ms;
  }

  simulateConnectionLoss(): void {
    this.connectionLost = true;
    this.connected = false;
  }

  simulateTimeout(): void {
    this.timedOut = true;
  }

  isConnected(): boolean {
    return this.connected;
  }

  // --- Real endpoint management ---

  setDriveEndpoint(address: string, port: number, token: string): void {
    this.realAddress = address;
    this.realPort = port;
    this.authToken = token;
    this.connected = true;
    this.connectionLost = false;
    this.timedOut = false;
  }

  clearDriveEndpoint(): void {
    this.realAddress = null;
    this.realPort = 0;
    this.authToken = '';
    this.connected = false;
  }

  getDriveEndpoint(): { address: string | null; port: number; token: string } {
    return { address: this.realAddress, port: this.realPort, token: this.authToken };
  }

  private isRealMode(): boolean {
    return this.realAddress !== null;
  }

  private baseUrl(): string {
    return `http://${this.realAddress}:${this.realPort}`;
  }

  // --- Real HTTP helpers ---

  async pingDrive(): Promise<boolean> {
    if (!this.realAddress) return false;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DRIVE_CONFIG.pingTimeoutMs);
      const res = await fetch(`${this.baseUrl()}${DRIVE_CONFIG.healthPath}`, {
        method: 'GET',
        signal: controller.signal,
        headers: this.authHeaders(),
      });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }

  async driveRequest(method: string, path: string, body?: string): Promise<Response> {
    if (!this.realAddress) {
      throw new DriveConnectionError('No drive endpoint configured');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl()}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          ...this.authHeaders(),
          ...(body ? { 'Content-Type': 'application/octet-stream' } : {}),
        },
        ...(body ? { body } : {}),
      });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      throw new DriveConnectionError(
        err instanceof Error ? err.message : 'Drive request failed',
      );
    }
  }

  private authHeaders(): Record<string, string> {
    if (this.authToken) {
      return { Authorization: `Bearer ${this.authToken}` };
    }
    return {};
  }

  // --- Public API (real HTTP when endpoint set, mock otherwise) ---

  async discoverDrive(): Promise<DiscoveryResult> {
    // Real mode: ping the drive
    if (this.isRealMode()) {
      const alive = await this.pingDrive();
      if (alive) {
        this.connected = true;
        this.connectionLost = false;
        this.timedOut = false;
        return { found: true, address: this.realAddress, port: this.realPort };
      }
      return { found: false, address: null, port: 0 };
    }

    // Mock mode
    if (this.mockAddress) {
      this.connected = true;
      this.connectionLost = false;
      this.timedOut = false;
      return {
        found: true,
        address: this.mockAddress,
        port: this.mockPort,
      };
    }

    return { found: false, address: null, port: 0 };
  }

  async getFileList(): Promise<FileInfo[]> {
    this.checkConnection();

    if (this.isRealMode()) {
      const res = await this.driveRequest('GET', DRIVE_CONFIG.filesPath);
      if (!res.ok) {
        throw new DriveConnectionError(`File list request failed: ${res.status}`);
      }
      return await res.json();
    }

    return [...this.mockFileList];
  }

  async getFileContent(filename: string): Promise<FileResult> {
    this.checkConnection();

    if (this.isRealMode()) {
      const res = await this.driveRequest('GET', `${DRIVE_CONFIG.filesPath}/${encodeURIComponent(filename)}`);
      if (!res.ok) {
        return { success: false, data: '', errorMessage: `HTTP ${res.status}` };
      }
      const data = await res.text();
      return { success: true, data };
    }

    const content = this.mockFileContents.get(filename);
    if (content !== undefined) {
      return { success: true, data: content };
    }

    return { success: false, data: '', errorMessage: 'File not found' };
  }

  async sendFirmware(filename: string, data: string): Promise<boolean> {
    this.checkConnection();

    if (this.isRealMode()) {
      const res = await this.driveRequest('POST', `${DRIVE_CONFIG.firmwarePath}/${encodeURIComponent(filename)}`, data);
      return res.ok;
    }

    return true;
  }

  private checkConnection(): void {
    if (this.connectionLost) {
      throw new DriveConnectionError('Connection to drive lost');
    }
    if (this.timedOut) {
      throw new DriveConnectionError('Connection timed out');
    }
    if (!this.connected) {
      throw new DriveConnectionError('Not connected to drive');
    }
  }
}
