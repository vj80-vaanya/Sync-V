import { LogModel, LogRecord, LogInput, LogSummary } from '../models/Log';
import { v4 as uuidv4 } from 'uuid';
import { isValidSha256, isValidFilename, isValidVendor, isValidLogFormat } from '../utils/validation';

export interface IngestionResult {
  success: boolean;
  logId?: string;
  error?: string;
}

export class LogIngestionService {
  private model: LogModel;

  constructor(model: LogModel) {
    this.model = model;
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

    const logId = uuidv4();
    const rawPath = `logs/${input.deviceId}/${logId}_${input.filename}`;

    const logRecord: LogInput = {
      id: logId,
      device_id: input.deviceId,
      filename: input.filename,
      size: input.size,
      checksum: input.checksum,
      raw_path: rawPath,
      raw_data: input.rawData || '',
      vendor: input.vendor || 'unknown',
      format: input.format || 'text',
      metadata: input.metadata,
    };

    this.model.create(logRecord);
    return { success: true, logId };
  }

  getLogsByDevice(deviceId: string): LogSummary[] {
    return this.model.getByDeviceIdSummary(deviceId);
  }

  getAllLogs(): LogSummary[] {
    return this.model.getAllSummary();
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

  verifyLogIntegrity(logId: string, checksum: string): boolean {
    const log = this.model.getById(logId);
    return log !== undefined && log.checksum === checksum;
  }
}
