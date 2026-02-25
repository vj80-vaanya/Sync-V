import { LogModel, LogRecord, LogInput, LogSummary } from '../models/Log';
import { DeviceKeyModel } from '../models/DeviceKey';
import { decryptAes256Cbc, isEncryptedPayload } from '../utils/encryption';
import { sha256 } from '../utils/hash';
import { v4 as uuidv4 } from 'uuid';
import { isValidSha256, isValidFilename, isValidVendor, isValidLogFormat } from '../utils/validation';

export interface IngestionResult {
  success: boolean;
  logId?: string;
  error?: string;
}

export class LogIngestionService {
  private model: LogModel;
  private deviceKeyModel: DeviceKeyModel | null;

  constructor(model: LogModel, deviceKeyModel?: DeviceKeyModel) {
    this.model = model;
    this.deviceKeyModel = deviceKeyModel || null;
  }

  ingest(input: {
    deviceId: string;
    filename: string;
    size: number;
    checksum: string;
    rawData: string;
    vendor?: string;
    format?: string;
    metadata?: Record<string, string>;
    orgId?: string;
  }): IngestionResult {
    // Validate checksum format (must be valid hex SHA256)
    if (!isValidSha256(input.checksum)) {
      return { success: false, error: 'Invalid checksum format (expected SHA256 hex)' };
    }

    // Validate filename
    if (!isValidFilename(input.filename)) {
      return { success: false, error: 'Invalid filename' };
    }

    // Validate size
    if (input.size <= 0) {
      return { success: false, error: 'Invalid file size' };
    }

    // Validate vendor if provided
    if (input.vendor && !isValidVendor(input.vendor)) {
      return { success: false, error: 'Invalid vendor name' };
    }

    // Validate format if provided
    if (input.format && !isValidLogFormat(input.format)) {
      return { success: false, error: 'Invalid log format' };
    }

    // Check for duplicate
    const existing = this.model.getByChecksum(input.checksum);
    if (existing) {
      return { success: false, error: 'Duplicate log (checksum already exists)' };
    }

    // Attempt E2E decryption if device has a PSK and payload looks encrypted
    let storedData = input.rawData || '';
    let storedChecksum = input.checksum;

    if (this.deviceKeyModel && input.rawData) {
      const psk = this.deviceKeyModel.getPsk(input.deviceId);
      if (psk && isEncryptedPayload(input.rawData)) {
        try {
          const plaintext = decryptAes256Cbc(input.rawData, psk);
          storedData = plaintext;
          storedChecksum = sha256(plaintext);

          // Re-check duplicate with plaintext checksum
          const existingPlain = this.model.getByChecksum(storedChecksum);
          if (existingPlain) {
            return { success: false, error: 'Duplicate log (checksum already exists)' };
          }
        } catch {
          // Decryption failed — store as-is (backwards-compatible)
          storedData = input.rawData;
          storedChecksum = input.checksum;
        }
      }
    }

    const logId = uuidv4();
    const rawPath = `logs/${input.deviceId}/${logId}_${input.filename}`;

    const logRecord: LogInput = {
      id: logId,
      device_id: input.deviceId,
      filename: input.filename,
      size: input.size,
      checksum: storedChecksum,
      raw_path: rawPath,
      raw_data: storedData,
      vendor: input.vendor || 'unknown',
      format: input.format || 'text',
      metadata: input.metadata,
      org_id: input.orgId,
    };

    this.model.create(logRecord);
    return { success: true, logId };
  }

  getLogsByDevice(deviceId: string): LogSummary[] {
    return this.model.getByDeviceIdSummary(deviceId);
  }

  getLogsByDeviceAndOrg(deviceId: string, orgId: string): LogSummary[] {
    return this.model.getByDeviceIdSummaryAndOrg(deviceId, orgId);
  }

  getAllLogs(): LogSummary[] {
    return this.model.getAllSummary();
  }

  getAllLogsByOrg(orgId: string): LogSummary[] {
    return this.model.getAllSummaryByOrg(orgId);
  }

  getLogById(logId: string): LogRecord | undefined {
    return this.model.getById(logId);
  }

  getDistinctVendors(): string[] {
    return this.model.getDistinctVendors();
  }

  getDistinctFormats(): string[] {
    return this.model.getDistinctFormats();
  }

  deleteLog(logId: string): boolean {
    return this.model.delete(logId);
  }

  verifyLogIntegrity(logId: string, checksum: string): boolean {
    const log = this.model.getById(logId);
    return log !== undefined && log.checksum === checksum;
  }
}
