import { DeviceModel, DeviceRecord } from '../models/Device';
import { LogModel, LogRecord, LogSummary } from '../models/Log';
import { FirmwareModel } from '../models/Firmware';
import { ClusterModel, ClusterRecord } from '../models/Cluster';

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
  recentLogs: LogSummary[];
}

export interface FirmwareStatusSummary {
  totalFirmwarePackages: number;
  byDeviceType: Record<string, number>;
}

export interface ClusterDashboard {
  cluster: ClusterRecord;
  devices: DeviceRecord[];
  deviceCount: number;
  onlineCount: number;
  recentLogs: LogSummary[];
}

export class DashboardService {
  private deviceModel: DeviceModel;
  private logModel: LogModel;
  private firmwareModel: FirmwareModel;
  private clusterModel?: ClusterModel;

  constructor(
    deviceModel: DeviceModel,
    logModel: LogModel,
    firmwareModel: FirmwareModel,
    clusterModel?: ClusterModel,
  ) {
    this.deviceModel = deviceModel;
    this.logModel = logModel;
    this.firmwareModel = firmwareModel;
    this.clusterModel = clusterModel;
  }

  getFleetOverview(orgId?: string): FleetOverview {
    const devices = orgId ? this.deviceModel.getAllByOrg(orgId) : this.deviceModel.getAll();
    const logs = orgId ? this.logModel.getAllSummaryByOrg(orgId) : this.logModel.getAllSummary();

    const typeSet = new Set(devices.map((d) => d.type));

    return {
      totalDevices: devices.length,
      onlineDevices: devices.filter((d) => d.status === 'online').length,
      offlineDevices: devices.filter((d) => d.status === 'offline').length,
      totalLogs: logs.length,
      deviceTypes: Array.from(typeSet),
    };
  }

  getDeviceDetail(deviceId: string, orgId?: string): DeviceDetail | undefined {
    const device = this.deviceModel.getById(deviceId);
    if (!device) return undefined;
    if (orgId && device.org_id !== orgId) return undefined;

    const logs = orgId
      ? this.logModel.getByDeviceIdSummaryAndOrg(deviceId, orgId)
      : this.logModel.getByDeviceIdSummary(deviceId);

    return {
      device,
      logCount: logs.length,
      recentLogs: logs.slice(0, 10),
    };
  }

  getFirmwareStatusSummary(orgId?: string): FirmwareStatusSummary {
    const allFirmware = orgId ? this.firmwareModel.getAllByOrg(orgId) : this.firmwareModel.getAll();

    const byDeviceType: Record<string, number> = {};
    for (const fw of allFirmware) {
      byDeviceType[fw.device_type] = (byDeviceType[fw.device_type] || 0) + 1;
    }

    return {
      totalFirmwarePackages: allFirmware.length,
      byDeviceType,
    };
  }

  getLogUploadHistory(orgId?: string): LogSummary[] {
    return orgId ? this.logModel.getAllSummaryByOrg(orgId) : this.logModel.getAllSummary();
  }

  getClusterDashboard(clusterId: string, orgId?: string): ClusterDashboard | undefined {
    if (!this.clusterModel) return undefined;

    const cluster = this.clusterModel.getById(clusterId);
    if (!cluster) return undefined;
    if (orgId && cluster.org_id !== orgId) return undefined;

    const devices = this.clusterModel.getDevices(clusterId);
    const recentLogs: LogSummary[] = [];
    for (const device of devices.slice(0, 10)) {
      const logs = orgId
        ? this.logModel.getByDeviceIdSummaryAndOrg(device.id, orgId)
        : this.logModel.getByDeviceIdSummary(device.id);
      recentLogs.push(...logs.slice(0, 5));
    }
    recentLogs.sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));

    return {
      cluster,
      devices,
      deviceCount: devices.length,
      onlineCount: devices.filter(d => d.status === 'online').length,
      recentLogs: recentLogs.slice(0, 20),
    };
  }
}
