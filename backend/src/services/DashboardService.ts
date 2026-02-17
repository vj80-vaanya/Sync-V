import { DeviceModel, DeviceRecord } from '../models/Device';
import { LogModel, LogRecord } from '../models/Log';
import { FirmwareModel } from '../models/Firmware';

export interface FleetOverview {
  totalDevices: number;
  onlineDevices: number;
  offlineDevices: number;
  totalLogs: number;
  deviceTypes: string[];
}

export interface DeviceDetail {
  device: DeviceRecord;
  logCount: number;
  recentLogs: LogRecord[];
}

export interface FirmwareStatusSummary {
  totalFirmwarePackages: number;
  byDeviceType: Record<string, number>;
}

export class DashboardService {
  private deviceModel: DeviceModel;
  private logModel: LogModel;
  private firmwareModel: FirmwareModel;

  constructor(
    deviceModel: DeviceModel,
    logModel: LogModel,
    firmwareModel: FirmwareModel,
  ) {
    this.deviceModel = deviceModel;
    this.logModel = logModel;
    this.firmwareModel = firmwareModel;
  }

  getFleetOverview(): FleetOverview {
    const devices = this.deviceModel.getAll();
    const logs = this.logModel.getAll();

    const typeSet = new Set(devices.map((d) => d.type));

    return {
      totalDevices: devices.length,
      onlineDevices: devices.filter((d) => d.status === 'online').length,
      offlineDevices: devices.filter((d) => d.status === 'offline').length,
      totalLogs: logs.length,
      deviceTypes: Array.from(typeSet),
    };
  }

  getDeviceDetail(deviceId: string): DeviceDetail | undefined {
    const device = this.deviceModel.getById(deviceId);
    if (!device) return undefined;

    const logs = this.logModel.getByDeviceId(deviceId);

    return {
      device,
      logCount: logs.length,
      recentLogs: logs.slice(0, 10),
    };
  }

  getFirmwareStatusSummary(): FirmwareStatusSummary {
    const allFirmware = this.firmwareModel.getAll();

    const byDeviceType: Record<string, number> = {};
    for (const fw of allFirmware) {
      byDeviceType[fw.device_type] = (byDeviceType[fw.device_type] || 0) + 1;
    }

    return {
      totalFirmwarePackages: allFirmware.length,
      byDeviceType,
    };
  }

  getLogUploadHistory(): LogRecord[] {
    return this.logModel.getAll();
  }
}
