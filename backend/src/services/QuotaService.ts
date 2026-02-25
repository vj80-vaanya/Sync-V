import { OrganizationModel } from '../models/Organization';
import { DeviceModel } from '../models/Device';
import { LogModel } from '../models/Log';
import { UserModel } from '../models/User';
import { WebhookDispatcher } from './WebhookDispatcher';

export class QuotaService {
  private orgModel: OrganizationModel;
  private deviceModel: DeviceModel;
  private logModel: LogModel;
  private userModel: UserModel;
  private webhookDispatcher?: WebhookDispatcher;

  constructor(
    orgModel: OrganizationModel,
    deviceModel: DeviceModel,
    logModel: LogModel,
    userModel: UserModel,
    webhookDispatcher?: WebhookDispatcher,
  ) {
    this.orgModel = orgModel;
    this.deviceModel = deviceModel;
    this.logModel = logModel;
    this.userModel = userModel;
    this.webhookDispatcher = webhookDispatcher;
  }

  checkDeviceQuota(orgId: string): { allowed: boolean; used: number; max: number } {
    const org = this.orgModel.getById(orgId);
    if (!org) return { allowed: false, used: 0, max: 0 };
    const used = this.deviceModel.countByOrg(orgId);
    return { allowed: used < org.max_devices, used, max: org.max_devices };
  }

  checkStorageQuota(orgId: string): { allowed: boolean; usedBytes: number; maxBytes: number } {
    const org = this.orgModel.getById(orgId);
    if (!org) return { allowed: false, usedBytes: 0, maxBytes: 0 };
    const usedBytes = this.logModel.storageSizeByOrg(orgId);
    return { allowed: usedBytes < org.max_storage_bytes, usedBytes, maxBytes: org.max_storage_bytes };
  }

  checkUserQuota(orgId: string): { allowed: boolean; used: number; max: number } {
    const org = this.orgModel.getById(orgId);
    if (!org) return { allowed: false, used: 0, max: 0 };
    // enterprise plan has unlimited users
    if (org.plan === 'enterprise') return { allowed: true, used: this.userModel.countByOrgId(orgId), max: org.max_users };
    const used = this.userModel.countByOrgId(orgId);
    return { allowed: used < org.max_users, used, max: org.max_users };
  }

  enforceDeviceQuota(orgId: string): void {
    const quota = this.checkDeviceQuota(orgId);
    if (!quota.allowed) {
      // Fire warning webhook
      if (this.webhookDispatcher) {
        this.webhookDispatcher.dispatch(orgId, 'quota.exceeded', { resource: 'devices', ...quota });
      }
      const err: any = new Error(`Device quota exceeded (${quota.used}/${quota.max})`);
      err.statusCode = 403;
      throw err;
    }
    // Fire warning at 80%
    if (quota.max > 0 && quota.used / quota.max >= 0.8 && this.webhookDispatcher) {
      this.webhookDispatcher.dispatch(orgId, 'quota.warning', { resource: 'devices', ...quota });
    }
  }

  enforceStorageQuota(orgId: string): void {
    const quota = this.checkStorageQuota(orgId);
    if (!quota.allowed) {
      if (this.webhookDispatcher) {
        this.webhookDispatcher.dispatch(orgId, 'quota.exceeded', { resource: 'storage', ...quota });
      }
      const err: any = new Error(`Storage quota exceeded (${quota.usedBytes}/${quota.maxBytes} bytes)`);
      err.statusCode = 403;
      throw err;
    }
    if (quota.maxBytes > 0 && quota.usedBytes / quota.maxBytes >= 0.8 && this.webhookDispatcher) {
      this.webhookDispatcher.dispatch(orgId, 'quota.warning', { resource: 'storage', ...quota });
    }
  }

  enforceUserQuota(orgId: string): void {
    const quota = this.checkUserQuota(orgId);
    if (!quota.allowed) {
      if (this.webhookDispatcher) {
        this.webhookDispatcher.dispatch(orgId, 'quota.exceeded', { resource: 'users', ...quota });
      }
      const err: any = new Error(`User quota exceeded (${quota.used}/${quota.max})`);
      err.statusCode = 403;
      throw err;
    }
  }

  getUsageSummary(orgId: string): {
    devices: { used: number; max: number };
    storage: { usedBytes: number; maxBytes: number };
    users: { used: number; max: number };
  } {
    const devices = this.checkDeviceQuota(orgId);
    const storage = this.checkStorageQuota(orgId);
    const users = this.checkUserQuota(orgId);
    return {
      devices: { used: devices.used, max: devices.max },
      storage: { usedBytes: storage.usedBytes, maxBytes: storage.maxBytes },
      users: { used: users.used, max: users.max },
    };
  }
}
