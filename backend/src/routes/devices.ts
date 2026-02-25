import { Router, Request, Response } from 'express';
import { DeviceRegistry } from '../services/DeviceRegistry';
import { DeviceKeyModel } from '../models/DeviceKey';
import { isValidDeviceId } from '../utils/validation';

export function createDeviceRoutes(registry: DeviceRegistry, deviceKeyModel?: DeviceKeyModel): Router {
  const router = Router();

  // GET /api/devices — list all devices
  router.get('/', (_req: Request, res: Response) => {
    const devices = registry.getAllDevices();
    res.json(devices);
  });

  // Static paths MUST come before parameterized /:id routes
  // GET /api/devices/type/:type — get devices by type
  router.get('/type/:type', (req: Request, res: Response) => {
    const devices = registry.getDevicesByType(req.params.type);
    res.json(devices);
  });

  // GET /api/devices/status/:status — get devices by status
  router.get('/status/:status', (req: Request, res: Response) => {
    const devices = registry.getDevicesByStatus(req.params.status);
    res.json(devices);
  });

  // POST /api/devices — register a new device
  router.post('/', (req: Request, res: Response) => {
    const { id, name, type, status, firmware_version, metadata, psk } = req.body;

    if (!id || !name || !type) {
      return res.status(400).json({ error: 'Missing required fields: id, name, type' });
    }
    if (!isValidDeviceId(id)) {
      return res.status(400).json({ error: 'Invalid device ID format' });
    }

    try {
      const device = registry.register({ id, name, type, status, firmware_version, metadata });

      // Store PSK if provided
      if (psk && deviceKeyModel) {
        deviceKeyModel.setPsk(id, psk);
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
  router.get('/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    if (!isValidDeviceId(id)) {
      return res.status(400).json({ error: 'Invalid device ID format' });
    }

    const device = registry.getDevice(id);
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }
    res.json(device);
  });

  // PATCH /api/devices/:id/metadata — update device metadata
  router.patch('/:id/metadata', (req: Request, res: Response) => {
    const { id } = req.params;
    if (!isValidDeviceId(id)) {
      return res.status(400).json({ error: 'Invalid device ID format' });
    }

    const { metadata } = req.body;
    if (!metadata || typeof metadata !== 'object') {
      return res.status(400).json({ error: 'Missing or invalid metadata object' });
    }

    const updated = registry.updateMetadata(id, metadata);
    if (!updated) {
      return res.status(404).json({ error: 'Device not found' });
    }
    res.json({ success: true });
  });

  // PATCH /api/devices/:id/status — update device status
  router.patch('/:id/status', (req: Request, res: Response) => {
    const { id } = req.params;
    if (!isValidDeviceId(id)) {
      return res.status(400).json({ error: 'Invalid device ID format' });
    }

    const { status } = req.body;
    if (!status || typeof status !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid status' });
    }

    const updated = registry.updateStatus(id, status);
    if (!updated) {
      return res.status(404).json({ error: 'Device not found' });
    }
    res.json({ success: true });
  });

  // PATCH /api/devices/:id/psk — rotate/update PSK
  router.patch('/:id/psk', (req: Request, res: Response) => {
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

    if (deviceKeyModel) {
      deviceKeyModel.setPsk(id, psk);
    }
    res.json({ success: true });
  });

  // DELETE /api/devices/:id/psk — revoke PSK
  router.delete('/:id/psk', (req: Request, res: Response) => {
    const { id } = req.params;
    if (!isValidDeviceId(id)) {
      return res.status(400).json({ error: 'Invalid device ID format' });
    }

    if (deviceKeyModel) {
      const deleted = deviceKeyModel.deletePsk(id);
      if (!deleted) {
        return res.status(404).json({ error: 'No PSK found for device' });
      }
    }
    res.json({ success: true });
  });

  return router;
}
