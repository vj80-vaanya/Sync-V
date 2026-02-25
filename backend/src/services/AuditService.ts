import { AuditLogModel, AuditEntry } from '../models/AuditLog';

export class AuditService {
  private model: AuditLogModel;

  constructor(model: AuditLogModel) {
    this.model = model;
  }

  log(entry: {
    orgId?: string;
    actorId: string;
    actorType?: string;
    action: string;
    targetType?: string;
    targetId?: string;
    details?: Record<string, any>;
    ipAddress?: string;
  }): AuditEntry {
    return this.model.create({
      org_id: entry.orgId || '',
      actor_id: entry.actorId,
      actor_type: entry.actorType || 'user',
      action: entry.action,
      target_type: entry.targetType || '',
      target_id: entry.targetId || '',
      details: JSON.stringify(entry.details || {}),
      ip_address: entry.ipAddress || '',
    });
  }

  getOrgAuditLog(orgId: string, filters?: { from?: string; to?: string; action?: string; limit?: number }): AuditEntry[] {
    return this.model.getByOrgId(orgId, filters);
  }

  getPlatformAuditLog(filters?: { from?: string; to?: string; limit?: number }): AuditEntry[] {
    return this.model.getStructuralEvents(filters);
  }
}
