import { DeviceModel, DeviceRecord, DeviceInput } from '../models/Device';

export class DeviceRegistry {
  private model: DeviceModel;

  constructor(model: DeviceModel) {
    this.model = model;
  }

  register(device: DeviceInput): DeviceRecord {
    return this.model.register(device);
  }

  getDevice(id: string): DeviceRecord | undefined {
    return this.model.getById(id);
  }

  getAllDevices(): DeviceRecord[] {
    return this.model.getAll();
  }

  getDevicesByType(type: string): DeviceRecord[] {
    return this.model.getByType(type);
  }

  getDevicesByStatus(status: string): DeviceRecord[] {
    return this.model.getByStatus(status);
  }

  updateMetadata(id: string, metadata: Record<string, string>): boolean {
    return this.model.updateMetadata(id, metadata);
  }

  updateStatus(id: string, status: string): boolean {
    return this.model.updateStatus(id, status);
  }
}
