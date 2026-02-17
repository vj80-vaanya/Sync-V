import { FileInfo, FileResult } from '../types/Device';

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

  async discoverDrive(): Promise<DiscoveryResult> {
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
    return [...this.mockFileList];
  }

  async getFileContent(filename: string): Promise<FileResult> {
    this.checkConnection();

    const content = this.mockFileContents.get(filename);
    if (content !== undefined) {
      return { success: true, data: content };
    }

    return { success: false, data: '', errorMessage: 'File not found' };
  }

  async sendFirmware(filename: string, data: string): Promise<boolean> {
    this.checkConnection();
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
