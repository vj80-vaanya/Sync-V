import { Router, Request, Response } from 'express';
import { LogIngestionService } from '../services/LogIngestion';
import { isValidDeviceId } from '../utils/validation';

export function createLogRoutes(logIngestion: LogIngestionService): Router {
  const router = Router();

  // GET /api/logs — list all logs
  router.get('/', (_req: Request, res: Response) => {
    const logs = logIngestion.getAllLogs();
    res.json(logs);
  });

  // GET /api/logs/device/:deviceId — get logs for a device
  router.get('/device/:deviceId', (req: Request, res: Response) => {
    const { deviceId } = req.params;
    if (!isValidDeviceId(deviceId)) {
      return res.status(400).json({ error: 'Invalid device ID format' });
    }

    const logs = logIngestion.getLogsByDevice(deviceId);
    res.json(logs);
  });

  // POST /api/logs — ingest a new log
  router.post('/', (req: Request, res: Response) => {
    const { deviceId, filename, size, checksum, rawData, metadata } = req.body;

    if (!deviceId || !filename || !checksum) {
      return res.status(400).json({ error: 'Missing required fields: deviceId, filename, checksum' });
    }

    const result = logIngestion.ingest({
      deviceId,
      filename,
      size: size || 0,
      checksum,
      rawData: rawData || '',
      metadata,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.status(201).json({ logId: result.logId });
  });

  // GET /api/logs/verify/:logId — verify log integrity
  router.get('/verify/:logId', (req: Request, res: Response) => {
    const { logId } = req.params;
    const { checksum } = req.query;

    if (!checksum || typeof checksum !== 'string') {
      return res.status(400).json({ error: 'Missing checksum query parameter' });
    }

    const valid = logIngestion.verifyLogIntegrity(logId, checksum);
    res.json({ valid });
  });

  return router;
}
