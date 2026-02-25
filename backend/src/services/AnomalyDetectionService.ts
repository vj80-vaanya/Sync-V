import { AnomalyModel, AnomalyRecord, AnomalyInput } from '../models/Anomaly';
import { LogModel, LogRecord } from '../models/Log';
import { DeviceModel } from '../models/Device';

const ERROR_KEYWORDS = /\b(ERROR|FATAL|CRITICAL|FAIL|exception|timeout)\b/i;
const WARN_KEYWORDS = /\b(WARN|WARNING)\b/i;

export class AnomalyDetectionService {
  private anomalyModel: AnomalyModel;
  private logModel: LogModel;
  private deviceModel: DeviceModel;

  constructor(anomalyModel: AnomalyModel, logModel: LogModel, deviceModel: DeviceModel) {
    this.anomalyModel = anomalyModel;
    this.logModel = logModel;
    this.deviceModel = deviceModel;
  }

  analyzeLog(logRecord: LogRecord): AnomalyRecord[] {
    const anomalies: AnomalyRecord[] = [];
    const lines = (logRecord.raw_data || '').split('\n').filter(l => l.trim());
    if (lines.length === 0) return anomalies;

    const errorLines = lines.filter(l => ERROR_KEYWORDS.test(l));
    const errorRate = errorLines.length / lines.length;

    // Check error spike against device's historical average
    const historicalLogs = this.logModel.getByDeviceId(logRecord.device_id).slice(0, 20);
    const historicalRates: number[] = [];
    for (const log of historicalLogs) {
      if (log.id === logRecord.id) continue;
      const hLines = (log.raw_data || '').split('\n').filter(l => l.trim());
      if (hLines.length === 0) continue;
      const hErrors = hLines.filter(l => ERROR_KEYWORDS.test(l));
      historicalRates.push(hErrors.length / hLines.length);
    }

    const avgErrorRate = historicalRates.length > 0
      ? historicalRates.reduce((a, b) => a + b, 0) / historicalRates.length
      : 0;

    // Error spike detection: error rate > 2x historical average (and at least some errors)
    if (errorLines.length > 0 && historicalRates.length > 0 && avgErrorRate > 0 && errorRate > avgErrorRate * 2) {
      const magnitude = errorRate / avgErrorRate;
      let severity: string;
      if (magnitude > 10) severity = 'critical';
      else if (magnitude > 5) severity = 'high';
      else if (magnitude > 3) severity = 'medium';
      else severity = 'low';

      const anomaly = this.anomalyModel.create({
        device_id: logRecord.device_id,
        org_id: logRecord.org_id,
        type: 'error_spike',
        severity,
        message: `Error rate ${(errorRate * 100).toFixed(1)}% is ${magnitude.toFixed(1)}x the historical average of ${(avgErrorRate * 100).toFixed(1)}%`,
        log_id: logRecord.id,
        details: { errorRate, avgErrorRate, magnitude, errorCount: errorLines.length, totalLines: lines.length },
      });
      anomalies.push(anomaly);
    }

    // New pattern detection: error strings never seen before for this device
    if (errorLines.length > 0) {
      const knownErrors = new Set<string>();
      for (const log of historicalLogs) {
        if (log.id === logRecord.id) continue;
        const hLines = (log.raw_data || '').split('\n').filter(l => l.trim());
        for (const line of hLines) {
          if (ERROR_KEYWORDS.test(line)) {
            knownErrors.add(this.normalizeErrorMessage(line));
          }
        }
      }

      const newErrors: string[] = [];
      for (const line of errorLines) {
        const normalized = this.normalizeErrorMessage(line);
        if (!knownErrors.has(normalized)) {
          newErrors.push(line.substring(0, 200));
        }
      }

      if (newErrors.length > 0 && historicalLogs.length > 1) {
        const anomaly = this.anomalyModel.create({
          device_id: logRecord.device_id,
          org_id: logRecord.org_id,
          type: 'new_pattern',
          severity: 'medium',
          message: `${newErrors.length} new error pattern(s) detected: ${newErrors[0].substring(0, 100)}`,
          log_id: logRecord.id,
          details: { newErrors: newErrors.slice(0, 5), count: newErrors.length },
        });
        anomalies.push(anomaly);
      }
    }

    return anomalies;
  }

  checkDeviceSilence(orgId?: string): AnomalyRecord[] {
    const anomalies: AnomalyRecord[] = [];
    const devices = orgId ? this.deviceModel.getAllByOrg(orgId) : this.deviceModel.getAll();

    for (const device of devices) {
      const logs = this.logModel.getByDeviceId(device.id);
      if (logs.length < 2) continue;

      // Calculate average interval between log uploads
      const timestamps = logs.map(l => new Date(l.uploaded_at).getTime()).sort((a, b) => a - b);
      const intervals: number[] = [];
      for (let i = 1; i < timestamps.length; i++) {
        intervals.push(timestamps[i] - timestamps[i - 1]);
      }

      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const timeSinceLastLog = Date.now() - timestamps[timestamps.length - 1];

      if (avgInterval > 0 && timeSinceLastLog > avgInterval * 3) {
        const hoursOverdue = Math.round((timeSinceLastLog - avgInterval) / (1000 * 60 * 60));
        const anomaly = this.anomalyModel.create({
          device_id: device.id,
          org_id: device.org_id,
          type: 'device_silent',
          severity: 'high',
          message: `Device has not reported in ${hoursOverdue}h (expected every ${Math.round(avgInterval / (1000 * 60 * 60))}h)`,
          details: { avgInterval, timeSinceLastLog, hoursOverdue },
        });
        anomalies.push(anomaly);
      }
    }

    return anomalies;
  }

  checkVolumeAnomaly(orgId?: string): AnomalyRecord[] {
    const anomalies: AnomalyRecord[] = [];
    const devices = orgId ? this.deviceModel.getAllByOrg(orgId) : this.deviceModel.getAll();

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    for (const device of devices) {
      const allLogs = this.logModel.getByDeviceId(device.id);
      if (allLogs.length < 7) continue;

      // Bucket logs by day for last 7 days
      const dailyCounts: number[] = [];
      for (let i = 1; i <= 7; i++) {
        const dayStart = new Date(now.getTime() - i * 86400000);
        const dayEnd = new Date(now.getTime() - (i - 1) * 86400000);
        const count = allLogs.filter(l => {
          const t = new Date(l.uploaded_at).getTime();
          return t >= dayStart.getTime() && t < dayEnd.getTime();
        }).length;
        dailyCounts.push(count);
      }

      const todayCount = allLogs.filter(l => l.uploaded_at >= todayStart).length;
      const mean = dailyCounts.reduce((a, b) => a + b, 0) / dailyCounts.length;
      const variance = dailyCounts.reduce((a, b) => a + (b - mean) ** 2, 0) / dailyCounts.length;
      const stddev = Math.sqrt(variance);

      if (stddev > 0 && Math.abs(todayCount - mean) > 3 * stddev) {
        const direction = todayCount > mean ? 'above' : 'below';
        const deviations = ((todayCount - mean) / stddev).toFixed(1);
        const anomaly = this.anomalyModel.create({
          device_id: device.id,
          org_id: device.org_id,
          type: 'volume_anomaly',
          severity: 'medium',
          message: `Log volume ${direction} normal: ${todayCount} today vs ${mean.toFixed(1)} avg (${deviations} std devs)`,
          details: { todayCount, mean, stddev, deviations: parseFloat(deviations), dailyCounts },
        });
        anomalies.push(anomaly);
      }
    }

    return anomalies;
  }

  getAnomalies(orgId: string): AnomalyRecord[] {
    return this.anomalyModel.getByOrgId(orgId);
  }

  getDeviceAnomalies(deviceId: string): AnomalyRecord[] {
    return this.anomalyModel.getByDeviceId(deviceId);
  }

  getUnresolved(orgId: string): AnomalyRecord[] {
    return this.anomalyModel.getUnresolved(orgId);
  }

  resolveAnomaly(id: string): boolean {
    return this.anomalyModel.resolve(id);
  }

  countByOrg(orgId: string): number {
    return this.anomalyModel.countByOrg(orgId);
  }

  getAnomaliesPaginated(orgId: string, offset: number, limit: number): AnomalyRecord[] {
    return this.anomalyModel.getByOrgIdPaginated(orgId, offset, limit);
  }

  private normalizeErrorMessage(line: string): string {
    return line
      .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[.\d]*Z?/g, '')
      .replace(/\d+\.\d+\.\d+\.\d+/g, '<IP>')
      .replace(/\b[0-9a-f]{8,}\b/gi, '<HEX>')
      .replace(/\d+/g, '<N>')
      .trim();
  }
}
