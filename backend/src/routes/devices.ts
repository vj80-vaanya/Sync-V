import { Router, Response } from 'express';
import { DeviceRegistry } from '../services/DeviceRegistry';
import { DeviceKeyModel } from '../models/DeviceKey';
import { isValidDeviceId } from '../utils/validation';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { QuotaService } from '../services/QuotaService';
import { AuditService } from '../services/AuditService';
import { WebhookDispatcher } from '../services/WebhookDispatcher';

export function createDeviceRoutes(
  registry: DeviceRegistry,
  deviceKeyModel?: DeviceKeyModel,
  quotaService?: QuotaService,
  auditService?: AuditService,
  webhookDispatcher?: WebhookDispatcher,
): Router {
  const router = Router();

  // GET /api/devices — list devices (org-scoped)
  router.get('/', (req: AuthenticatedRequest, res: Response) => {
    const devices = req.orgId
      ? registry.getAllDevicesByOrg(req.orgId)
      : registry.getAllDevices();
    res.json(devices);
  });

  // Static paths MUST come before parameterized /:id routes
  // GET /api/devices/type/:type — get devices by type (org-scoped)
  router.get('/type/:type', (req: AuthenticatedRequest, res: Response) => {
    const devices = req.orgId
      ? registry.getDevicesByTypeAndOrg(req.params.type, req.orgId)
      : registry.getDevicesByType(req.params.type);
    res.json(devices);
  });

  // GET /api/devices/status/:status — get devices by status (org-scoped)
  router.get('/status/:status', (req: AuthenticatedRequest, res: Response) => {
    const devices = req.orgId
      ? registry.getDevicesByStatusAndOrg(req.params.status, req.orgId)
      : registry.getDevicesByStatus(req.params.status);
    res.json(devices);
  });

  // POST /api/devices — register a new device
  router.post('/', (req: AuthenticatedRequest, res: Response) => {
    const { id, name, type, status, firmware_version, metadata, psk } = req.body;

    if (!id || !name || !type) {
      return res.status(400).json({ error: 'Missing required fields: id, name, type' });
    }
    if (!isValidDeviceId(id)) {
      return res.status(400).json({ error: 'Invalid device ID format' });
    }

    // Enforce device quota
    if (quotaService && req.orgId) {
      try {
        quotaService.enforceDeviceQuota(req.orgId);
      } catch (err: any) {
        return res.status(403).json({ error: err.message });
      }
    }

    try {
      const device = registry.register({ id, name, type, status, firmware_version, metadata, org_id: req.orgId });

      // Store PSK if provided
      if (psk && deviceKeyModel) {
        deviceKeyModel.setPsk(id, psk);
      }

      if (auditService && req.user) {
        auditService.log({
          orgId: req.orgId,
          actorId: req.user.userId,
          action: 'device.register',
          targetType: 'device',
          targetId: id,
          details: { name, type },
          ipAddress: req.ip || '',
        });
      }

      res.status(201).json(device);
    } catch (err: any) {
      if (err.message?.includes('UNIQUE constraint')) {
        return res.status(409).json({ error: 'Device already registered' });
      }
      return res.status(500).json({ error: 'Failed to register device' });
    }
  });

  // GET /api/devices/:id — get device by ID
  router.get('/:id', (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    if (!isValidDeviceId(id)) {
      return res.status(400).json({ error: 'Invalid device ID format' });
    }

    const device = registry.getDevice(id);
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }
    if (req.orgId && device.org_id !== req.orgId) {
      return res.status(404).json({ error: 'Device not found' });
    }
    res.json(device);
  });

  // PATCH /api/devices/:id/metadata — update device metadata
  router.patch('/:id/metadata', (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    if (!isValidDeviceId(id)) {
      return res.status(400).json({ error: 'Invalid device ID format' });
    }

    const { metadata } = req.body;
    if (!metadata || typeof metadata !== 'object') {
      return res.status(400).json({ error: 'Missing or invalid metadata object' });
    }

    // Verify org ownership
    const device = registry.getDevice(id);
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }
    if (req.orgId && device.org_id !== req.orgId) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const updated = registry.updateMetadata(id, metadata);
    if (!updated) {
      return res.status(404).json({ error: 'Device not found' });
    }

    if (auditService && req.user) {
      auditService.log({
        orgId: req.orgId,
        actorId: req.user.userId,
        action: 'device.update',
        targetType: 'device',
        targetId: id,
        ipAddress: req.ip || '',
      });
    }

    res.json({ success: true });
  });

  // PATCH /api/devices/:id/status — update device status
  router.patch('/:id/status', (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    if (!isValidDeviceId(id)) {
      return res.status(400).json({ error: 'Invalid device ID format' });
    }

    const { status } = req.body;
    if (!status || typeof status !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid status' });
    }

    const device = registry.getDevice(id);
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }
    if (req.orgId && device.org_id !== req.orgId) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const updated = registry.updateStatus(id, status);
    if (!updated) {
      return res.status(404).json({ error: 'Device not found' });
    }
    res.json({ success: true });
  });

  // PATCH /api/devices/:id/psk — rotate/update PSK
  router.patch('/:id/psk', (req: AuthenticatedRequest, res: Response) => {
    // Block platform admin from PSK operations
    if (req.user?.role === 'platform_admin') {
      return res.status(403).json({ error: 'Platform admins cannot access PSK data' });
    }

    const { id } = req.params;
    if (!isValidDeviceId(id)) {
      return res.status(400).json({ error: 'Invalid device ID format' });
    }

    const { psk } = req.body;
    if (!psk || typeof psk !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid PSK' });
    }

    const device = registry.getDevice(id);
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }
    if (req.orgId && device.org_id !== req.orgId) {
      return res.status(404).json({ error: 'Device not found' });
    }

    if (deviceKeyModel) {
      const hadPsk = deviceKeyModel.hasPsk(id);
      deviceKeyModel.setPsk(id, psk);

      if (auditService && req.user) {
        auditService.log({
          orgId: req.orgId,
          actorId: req.user.userId,
          action: hadPsk ? 'psk.rotate' : 'psk.set',
          targetType: 'device',
          targetId: id,
          ipAddress: req.ip || '',
        });
      }

      if (webhookDispatcher && req.orgId) {
        webhookDispatcher.dispatch(req.orgId, 'psk.rotated', { deviceId: id });
      }
    }
    res.json({ success: true });
  });

  // DELETE /api/devices/:id/psk — revoke PSK
  router.delete('/:id/psk', (req: AuthenticatedRequest, res: Response) => {
    if (req.user?.role === 'platform_admin') {
      return res.status(403).json({ error: 'Platform admins cannot access PSK data' });
    }

    const { id } = req.params;
    if (!isValidDeviceId(id)) {
      return res.status(400).json({ error: 'Invalid device ID format' });
    }

    if (deviceKeyModel) {
      const deleted = deviceKeyModel.deletePsk(id);
      if (!deleted) {
        return res.status(404).json({ error: 'No PSK found for device' });
      }

      if (auditService && req.user) {
        auditService.log({
          orgId: req.orgId,
          actorId: req.user.userId,
          action: 'psk.revoke',
          targetType: 'device',
          targetId: id,
          ipAddress: req.ip || '',
        });
      }
    }
    res.json({ success: true });
  });

  return router;
}
