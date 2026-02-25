import * as cron from 'node-cron';
import { AnomalyDetectionService } from './AnomalyDetectionService';
import { DeviceHealthService } from './DeviceHealthService';
import { OrganizationModel } from '../models/Organization';
import { WebhookDispatcher } from './WebhookDispatcher';

export class Scheduler {
  private anomalyService: AnomalyDetectionService;
  private healthService: DeviceHealthService;
  private orgModel: OrganizationModel;
  private webhookDispatcher?: WebhookDispatcher;
  private wsService?: { broadcastAnomaly(orgId: string, anomaly: any): void; broadcastHealthUpdate(orgId: string, results: any[]): void };
  private tasks: cron.ScheduledTask[] = [];

  constructor(
    anomalyService: AnomalyDetectionService,
    healthService: DeviceHealthService,
    orgModel: OrganizationModel,
    webhookDispatcher?: WebhookDispatcher,
    wsService?: { broadcastAnomaly(orgId: string, anomaly: any): void; broadcastHealthUpdate(orgId: string, results: any[]): void },
  ) {
    this.anomalyService = anomalyService;
    this.healthService = healthService;
    this.orgModel = orgModel;
    this.webhookDispatcher = webhookDispatcher;
    this.wsService = wsService;
  }

  start(): void {
    // Every 15 minutes: check device silence
    const silenceJob = cron.schedule('*/15 * * * *', () => {
      this.runSilenceCheck();
    });
    this.tasks.push(silenceJob);
    console.log('Scheduler: device silence check registered (every 15 min)');

    // Every hour: check volume anomalies
    const volumeJob = cron.schedule('0 * * * *', () => {
      this.runVolumeCheck();
    });
    this.tasks.push(volumeJob);
    console.log('Scheduler: volume anomaly check registered (every 1 hour)');

    // Every 6 hours: recompute fleet health
    const healthJob = cron.schedule('0 */6 * * *', () => {
      this.runHealthCompute();
    });
    this.tasks.push(healthJob);
    console.log('Scheduler: fleet health recompute registered (every 6 hours)');
  }

  stop(): void {
    for (const task of this.tasks) {
      task.stop();
    }
    this.tasks = [];
  }

  runSilenceCheck(): void {
    const orgs = this.orgModel.getAll().filter(o => o.status === 'active');
    for (const org of orgs) {
      try {
        const anomalies = this.anomalyService.checkDeviceSilence(org.id);
        for (const anomaly of anomalies) {
          if (this.webhookDispatcher) {
            this.webhookDispatcher.dispatch(org.id, 'anomaly.detected', {
              deviceId: anomaly.device_id,
              anomalies: [{ id: anomaly.id, type: anomaly.type, severity: anomaly.severity }],
            });
          }
          if (this.wsService) {
            this.wsService.broadcastAnomaly(org.id, anomaly);
          }
        }
      } catch (err) {
        console.error(`Scheduler: silence check failed for org ${org.id}:`, err);
      }
    }
  }

  runVolumeCheck(): void {
    const orgs = this.orgModel.getAll().filter(o => o.status === 'active');
    for (const org of orgs) {
      try {
        const anomalies = this.anomalyService.checkVolumeAnomaly(org.id);
        for (const anomaly of anomalies) {
          if (this.webhookDispatcher) {
            this.webhookDispatcher.dispatch(org.id, 'anomaly.detected', {
              deviceId: anomaly.device_id,
              anomalies: [{ id: anomaly.id, type: anomaly.type, severity: anomaly.severity }],
            });
          }
          if (this.wsService) {
            this.wsService.broadcastAnomaly(org.id, anomaly);
          }
        }
      } catch (err) {
        console.error(`Scheduler: volume check failed for org ${org.id}:`, err);
      }
    }
  }

  runHealthCompute(): void {
    const orgs = this.orgModel.getAll().filter(o => o.status === 'active');
    for (const org of orgs) {
      try {
        const results = this.healthService.computeAllHealth(org.id);
        if (this.wsService && results.length > 0) {
          this.wsService.broadcastHealthUpdate(org.id, results);
        }
      } catch (err) {
        console.error(`Scheduler: health compute failed for org ${org.id}:`, err);
      }
    }
  }
}
