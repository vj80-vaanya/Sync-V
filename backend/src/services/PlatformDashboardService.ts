import { OrganizationModel, OrgRecord } from '../models/Organization';
import { DeviceModel } from '../models/Device';
import { LogModel } from '../models/Log';
import { FirmwareModel } from '../models/Firmware';
import { UserModel } from '../models/User';

export interface PlatformOverview {
  totalOrgs: number;
  activeOrgs: number;
  suspendedOrgs: number;
  totalDevices: number;
  totalUsers: number;
  totalLogs: number;
  planDistribution: { free: number; pro: number; enterprise: number };
}

export interface OrgSummary {
  org: OrgRecord;
  deviceCount: number;
  userCount: number;
  logCount: number;
  storageUsed: number;
  quotaUsage: { devices: number; storage: number; users: number };
}

export class PlatformDashboardService {
  private orgModel: OrganizationModel;
  private deviceModel: DeviceModel;
  private logModel: LogModel;
  private firmwareModel: FirmwareModel;
  private userModel: UserModel;

  constructor(
    orgModel: OrganizationModel,
    deviceModel: DeviceModel,
    logModel: LogModel,
    firmwareModel: FirmwareModel,
    userModel: UserModel,
  ) {
    this.orgModel = orgModel;
    this.deviceModel = deviceModel;
    this.logModel = logModel;
    this.firmwareModel = firmwareModel;
    this.userModel = userModel;
  }

  getOverview(): PlatformOverview {
    const orgs = this.orgModel.getAll();
    const allDevices = this.deviceModel.getAll();
    const allUsers = this.userModel.getAll();

    let totalLogs = 0;
    const planDist = { free: 0, pro: 0, enterprise: 0 };
    let activeOrgs = 0;
    let suspendedOrgs = 0;

    for (const org of orgs) {
      totalLogs += this.logModel.countByOrg(org.id);
      if (org.plan === 'free') planDist.free++;
      else if (org.plan === 'pro') planDist.pro++;
      else if (org.plan === 'enterprise') planDist.enterprise++;

      if (org.status === 'active') activeOrgs++;
      else if (org.status === 'suspended') suspendedOrgs++;
    }

    return {
      totalOrgs: orgs.length,
      activeOrgs,
      suspendedOrgs,
      totalDevices: allDevices.length,
      totalUsers: allUsers.length,
      totalLogs,
      planDistribution: planDist,
    };
  }

  getOrgSummaries(): OrgSummary[] {
    const orgs = this.orgModel.getAll();
    return orgs.map(org => {
      const stats = this.orgModel.getUsageStats(org.id);
      return {
        org,
        deviceCount: stats.deviceCount,
        userCount: stats.userCount,
        logCount: stats.logCount,
        storageUsed: stats.storageBytes,
        quotaUsage: {
          devices: org.max_devices > 0 ? Math.round((stats.deviceCount / org.max_devices) * 100) : 0,
          storage: org.max_storage_bytes > 0 ? Math.round((stats.storageBytes / org.max_storage_bytes) * 100) : 0,
          users: org.max_users > 0 ? Math.round((stats.userCount / org.max_users) * 100) : 0,
        },
      };
    });
  }

  getOrgDetail(orgId: string): { org: OrgRecord; deviceCount: number; userCount: number; logCount: number; storageUsed: number; clusterCount: number } | undefined {
    const org = this.orgModel.getById(orgId);
    if (!org) return undefined;

    const stats = this.orgModel.getUsageStats(orgId);
    // Count clusters via direct query (avoid circular dependency)
    return {
      org,
      deviceCount: stats.deviceCount,
      userCount: stats.userCount,
      logCount: stats.logCount,
      storageUsed: stats.storageBytes,
      clusterCount: 0, // Will be enriched at route level
    };
  }
}
