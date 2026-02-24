import { FirmwareModel, FirmwareRecord, FirmwareInput } from '../models/Firmware';
import { v4 as uuidv4 } from 'uuid';
import { isValidSha256, isValidFilename } from '../utils/validation';

export interface FirmwareUploadResult {
  success: boolean;
  firmwareId?: string;
  error?: string;
}

export class FirmwareDistributionService {
  private model: FirmwareModel;

  constructor(model: FirmwareModel) {
    this.model = model;
  }

  upload(input: {
    version: string;
    deviceType: string;
    filename: string;
    size: number;
    sha256: string;
    description?: string;
  }): FirmwareUploadResult {
    if (!isValidSha256(input.sha256)) {
      return { success: false, error: 'Invalid SHA256 hash' };
    }

    if (!isValidFilename(input.filename)) {
      return { success: false, error: 'Invalid filename' };
    }

    if (input.size <= 0) {
      return { success: false, error: 'Invalid firmware size' };
    }

    const firmwareId = uuidv4();
    const firmware: FirmwareInput = {
      id: firmwareId,
      version: input.version,
      device_type: input.deviceType,
      filename: input.filename,
      size: input.size,
      sha256: input.sha256,
      description: input.description,
    };

    this.model.create(firmware);
    return { success: true, firmwareId };
  }

  getAvailableForDevice(deviceType: string): FirmwareRecord[] {
    return this.model.getByDeviceType(deviceType);
  }

  getLatestForDevice(deviceType: string): FirmwareRecord | undefined {
    return this.model.getLatestForDeviceType(deviceType);
  }

  getFirmware(id: string): FirmwareRecord | undefined {
    return this.model.getById(id);
  }

  verifyDownload(id: string, sha256: string): boolean {
    const fw = this.model.getById(id);
    return fw !== undefined && fw.sha256 === sha256;
  }

  deleteFirmware(id: string): boolean {
    return this.model.delete(id);
  }

  getAllFirmware(): FirmwareRecord[] {
    return this.model.getAll();
  }
}
