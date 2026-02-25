import { Router, Response } from 'express';
import { FirmwareDistributionService } from '../services/FirmwareDistribution';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { AuditService } from '../services/AuditService';
import { WebhookDispatcher } from '../services/WebhookDispatcher';

export function createFirmwareRoutes(
  firmwareDistribution: FirmwareDistributionService,
  auditService?: AuditService,
  webhookDispatcher?: WebhookDispatcher,
): Router {
  const router = Router();

  // GET /api/firmware — list all firmware packages (org-scoped)
  router.get('/', (req: AuthenticatedRequest, res: Response) => {
    const firmware = req.orgId
      ? firmwareDistribution.getAllFirmwareByOrg(req.orgId)
      : firmwareDistribution.getAllFirmware();
    res.json(firmware);
  });

  // Static paths MUST come before parameterized /:id routes
  // GET /api/firmware/device/:deviceType — get firmware for a device type
  router.get('/device/:deviceType', (req: AuthenticatedRequest, res: Response) => {
    const firmware = req.orgId
      ? firmwareDistribution.getAvailableForDeviceAndOrg(req.params.deviceType, req.orgId)
      : firmwareDistribution.getAvailableForDevice(req.params.deviceType);
    res.json(firmware);
  });

  // GET /api/firmware/device/:deviceType/latest — get latest firmware for device type
  router.get('/device/:deviceType/latest', (req: AuthenticatedRequest, res: Response) => {
    const firmware = req.orgId
      ? firmwareDistribution.getLatestForDeviceAndOrg(req.params.deviceType, req.orgId)
      : firmwareDistribution.getLatestForDevice(req.params.deviceType);
    if (!firmware) {
      return res.status(404).json({ error: 'No firmware available for this device type' });
    }
    res.json(firmware);
  });

  // GET /api/firmware/verify/:id — verify firmware download
  router.get('/verify/:id', (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { sha256 } = req.query;

    if (!sha256 || typeof sha256 !== 'string') {
      return res.status(400).json({ error: 'Missing sha256 query parameter' });
    }

    const valid = firmwareDistribution.verifyDownload(id, sha256);
    res.json({ valid });
  });

  // POST /api/firmware — upload new firmware (admin/technician only)
  router.post('/', (req: AuthenticatedRequest, res: Response) => {
    const role = req.user?.role;
    if (role !== 'org_admin' && role !== 'technician') {
      return res.status(403).json({ error: 'Only admin or technician can upload firmware' });
    }

    const { version, deviceType, filename, size, sha256, description } = req.body;

    if (!version || !deviceType || !filename || !sha256) {
      return res.status(400).json({
        error: 'Missing required fields: version, deviceType, filename, sha256',
      });
    }

    const result = firmwareDistribution.upload({
      version,
      deviceType,
      filename,
      size: size || 0,
      sha256,
      description,
      orgId: req.orgId,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    if (auditService && req.user) {
      auditService.log({
        orgId: req.orgId,
        actorId: req.user.userId,
        action: 'firmware.upload',
        targetType: 'firmware',
        targetId: result.firmwareId!,
        details: { version, deviceType, filename },
        ipAddress: req.ip || '',
      });
    }

    if (webhookDispatcher && req.orgId) {
      webhookDispatcher.dispatch(req.orgId, 'firmware.uploaded', { firmwareId: result.firmwareId, version, deviceType });
    }

    res.status(201).json({ firmwareId: result.firmwareId });
  });

  // DELETE /api/firmware/:id — delete firmware (admin/technician only)
  router.delete('/:id', (req: AuthenticatedRequest, res: Response) => {
    const role = req.user?.role;
    if (role !== 'org_admin' && role !== 'technician') {
      return res.status(403).json({ error: 'Only admin or technician can delete firmware' });
    }

    const firmware = firmwareDistribution.getFirmware(req.params.id);
    if (!firmware) {
      return res.status(404).json({ error: 'Firmware package not found' });
    }
    if (req.orgId && firmware.org_id !== req.orgId) {
      return res.status(404).json({ error: 'Firmware package not found' });
    }

    const deleted = firmwareDistribution.deleteFirmware(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Firmware package not found' });
    }

    if (auditService && req.user) {
      auditService.log({
        orgId: req.orgId,
        actorId: req.user.userId,
        action: 'firmware.delete',
        targetType: 'firmware',
        targetId: req.params.id,
        ipAddress: req.ip || '',
      });
    }

    res.json({ success: true });
  });

  // GET /api/firmware/:id/download — download firmware content
  router.get('/:id/download', (req: AuthenticatedRequest, res: Response) => {
    const firmware = firmwareDistribution.getFirmware(req.params.id);
    if (!firmware) {
      return res.status(404).json({ error: 'Firmware package not found' });
    }
    if (req.orgId && firmware.org_id !== req.orgId) {
      return res.status(404).json({ error: 'Firmware package not found' });
    }
    const mockData = Buffer.from(`FIRMWARE_${firmware.filename}_v${firmware.version}`).toString('base64');
    res.json({ data: mockData });
  });

  // GET /api/firmware/:id — get firmware by ID (must be after all static paths)
  router.get('/:id', (req: AuthenticatedRequest, res: Response) => {
    const firmware = firmwareDistribution.getFirmware(req.params.id);
    if (!firmware) {
      return res.status(404).json({ error: 'Firmware package not found' });
    }
    if (req.orgId && firmware.org_id !== req.orgId) {
      return res.status(404).json({ error: 'Firmware package not found' });
    }
    res.json(firmware);
  });

  return router;
}
