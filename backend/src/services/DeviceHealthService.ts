import { DeviceHealthModel, DeviceHealthRecord, DeviceHealthHistoryRecord } from '../models/DeviceHealth';
import { DeviceModel } from '../models/Device';
import { LogModel } from '../models/Log';
import { AnomalyModel } from '../models/Anomaly';
import { FirmwareModel } from '../models/Firmware';

const ERROR_KEYWORDS = /\b(ERROR|FATAL|CRITICAL|FAIL|exception|timeout)\b/i;

export interface HealthFactors {
  recency: number;
  errorRate: number;
  logFrequency: number;
  firmwareCurrency: number;
  anomalyCount: number;
}

export interface HealthResult {
  deviceId: string;
  score: number;
  factors: HealthFactors;
  trend: string;
}

export class DeviceHealthService {
  private healthModel: DeviceHealthModel;
  private deviceModel: DeviceModel;
  private logModel: LogModel;
  private anomalyModel: AnomalyModel;
  private firmwareModel: FirmwareModel;

  constructor(
    healthModel: DeviceHealthModel,
    deviceModel: DeviceModel,
    logModel: LogModel,
    anomalyModel: AnomalyModel,
    firmwareModel: FirmwareModel,
  ) {
    this.healthModel = healthModel;
    this.deviceModel = deviceModel;
    this.logModel = logModel;
    this.anomalyModel = anomalyModel;
    this.firmwareModel = firmwareModel;
  }

  computeHealth(deviceId: string): HealthResult | undefined {
    const device = this.deviceModel.getById(deviceId);
    if (!device) return undefined;

    const factors = this.computeFactors(device);
    const score = Math.max(0, Math.min(100, Math.round(
      factors.recency + factors.errorRate + factors.logFrequency +
      factors.firmwareCurrency + factors.anomalyCount
    )));

    const trend = this.computeTrend(deviceId, score);

    this.healthModel.upsert(deviceId, score, factors, trend);
    this.healthModel.addHistory(deviceId, score);

    return { deviceId, score, factors, trend };
  }

  computeAllHealth(orgId?: string): HealthResult[] {
    const devices = orgId ? this.deviceModel.getAllByOrg(orgId) : this.deviceModel.getAll();
    const results: HealthResult[] = [];

    for (const device of devices) {
      const result = this.computeHealth(device.id);
      if (result) results.push(result);
    }

    return results.sort((a, b) => a.score - b.score);
  }

  getHealth(deviceId: string): DeviceHealthRecord | undefined {
    return this.healthModel.getByDeviceId(deviceId);
  }

  getFleetHealth(orgId: string): DeviceHealthRecord[] {
    return this.healthModel.getAllByOrg(orgId);
  }

  getHistory(deviceId: string, limit?: number): DeviceHealthHistoryRecord[] {
    return this.healthModel.getHistory(deviceId, limit);
  }

  getFleetHealthPaginated(orgId: string, offset: number, limit: number): DeviceHealthRecord[] {
    return this.healthModel.getAllByOrgPaginated(orgId, offset, limit);
  }

  countByOrg(orgId: string): number {
    return this.healthModel.countByOrg(orgId);
  }

  private computeFactors(device: { id: string; status: string; last_seen: string; firmware_version: string; type: string; org_id: string }): HealthFactors {
    // Factor 1: Recency (25 points)
    let recency = 0;
    if (device.status === 'online') {
      recency = 25;
    } else if (device.last_seen) {
      const hoursSinceLastSeen = (Date.now() - new Date(device.last_seen).getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastSeen <= 1) recency = 25;
      else if (hoursSinceLastSeen <= 24) recency = Math.round(25 * (1 - hoursSinceLastSeen / 48));
      else recency = Math.max(0, Math.round(25 * (1 - hoursSinceLastSeen / 168)));
    }

    // Factor 2: Error rate (25 points)
    const recentLogs = this.logModel.getByDeviceId(device.id).slice(0, 10);
    let errorRateScore = 25;
    if (recentLogs.length > 0) {
      let totalLines = 0;
      let totalErrors = 0;
      for (const log of recentLogs) {
        const lines = (log.raw_data || '').split('\n').filter(l => l.trim());
        totalLines += lines.length;
        totalErrors += lines.filter(l => ERROR_KEYWORDS.test(l)).length;
      }
      if (totalLines > 0) {
        const rate = totalErrors / totalLines;
        if (rate >= 0.5) errorRateScore = 0;
        else errorRateScore = Math.round(25 * (1 - rate * 2));
      }
    }

    // Factor 3: Log frequency (20 points)
    let logFrequency = 20;
    const allLogs = this.logModel.getByDeviceId(device.id);
    if (allLogs.length >= 2) {
      const timestamps = allLogs.map(l => new Date(l.uploaded_at).getTime()).sort((a, b) => a - b);
      const intervals: number[] = [];
      for (let i = 1; i < timestamps.length; i++) {
        intervals.push(timestamps[i] - timestamps[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const timeSinceLastLog = Date.now() - timestamps[timestamps.length - 1];

      if (avgInterval > 0) {
        const ratio = timeSinceLastLog / avgInterval;
        if (ratio <= 1.5) logFrequency = 20;
        else if (ratio >= 3) logFrequency = 0;
        else logFrequency = Math.round(20 * (1 - (ratio - 1.5) / 1.5));
      }
    } else if (allLogs.length === 0) {
      logFrequency = 10;
    }

    // Factor 4: Firmware currency (15 points)
    let firmwareCurrency = 15;
    if (device.firmware_version && device.org_id) {
      const allFirmware = this.firmwareModel.getByDeviceTypeAndOrg(device.type, device.org_id);
      if (allFirmware.length > 0) {
        const latestVersion = allFirmware[0].version;
        if (device.firmware_version === latestVersion) {
          firmwareCurrency = 15;
        } else {
          const index = allFirmware.findIndex(f => f.version === device.firmware_version);
          if (index === -1) firmwareCurrency = 0;
          else if (index >= 2) firmwareCurrency = 0;
          else firmwareCurrency = Math.round(15 * (1 - index / 2));
        }
      }
    }

    // Factor 5: Anomaly count (15 points)
    const unresolvedCount = this.anomalyModel.countUnresolvedByDevice(device.id);
    const anomalyCount = Math.max(0, 15 - unresolvedCount * 5);

    return {
      recency,
      errorRate: errorRateScore,
      logFrequency,
      firmwareCurrency,
      anomalyCount,
    };
  }

  private computeTrend(deviceId: string, currentScore: number): string {
    const previousScore = this.healthModel.getScoreFromAgo(deviceId, 24);
    if (previousScore === undefined) return 'stable';

    const diff = currentScore - previousScore;
    if (diff > 5) return 'improving';
    if (diff < -5) return 'degrading';
    return 'stable';
  }
}
