import { Router, Request, Response } from 'express';
import { LogIngestionService } from '../services/LogIngestion';
import { isValidDeviceId } from '../utils/validation';

export function createLogRoutes(logIngestion: LogIngestionService): Router {
  const router = Router();

  // GET /api/logs — list all logs (summary, no raw_data)
  router.get('/', (_req: Request, res: Response) => {
    const logs = logIngestion.getAllLogs();
    res.json(logs);
  });

  // GET /api/logs/filters — available vendors and formats for UI dropdowns
  router.get('/filters', (_req: Request, res: Response) => {
    const vendors = logIngestion.getDistinctVendors();
    const formats = logIngestion.getDistinctFormats();
    res.json({ vendors, formats });
  });

  // GET /api/logs/device/:deviceId — get logs for a device (summary)
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
    const { deviceId, filename, size, checksum, rawData, vendor, format, metadata } = req.body;

    if (!deviceId || !filename || !checksum) {
      return res.status(400).json({ error: 'Missing required fields: deviceId, filename, checksum' });
    }

    const result = logIngestion.ingest({
      deviceId,
      filename,
      size: size || 0,
      checksum,
      rawData: rawData || '',
      vendor,
      format,
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

  // DELETE /api/logs/:id — delete a log record
  router.delete('/:id', (req: Request, res: Response) => {
    const deleted = logIngestion.deleteLog(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Log not found' });
    }
    res.json({ success: true });
  });

  // GET /api/logs/:id — full log record including raw_data
  router.get('/:id', (req: Request, res: Response) => {
    const log = logIngestion.getLogById(req.params.id);
    if (!log) {
      return res.status(404).json({ error: 'Log not found' });
    }
    res.json(log);
  });

  // GET /api/logs/:id/raw — download raw content
  router.get('/:id/raw', (req: Request, res: Response) => {
    const log = logIngestion.getLogById(req.params.id);
    if (!log) {
      return res.status(404).json({ error: 'Log not found' });
    }

    const mimeMap: Record<string, string> = {
      text: 'text/plain',
      json: 'application/json',
      csv: 'text/csv',
      syslog: 'text/plain',
      xml: 'application/xml',
      binary: 'application/octet-stream',
    };

    const contentType = mimeMap[log.format] || 'text/plain';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${log.filename}"`);

    if (log.format === 'binary') {
      // Decode base64 for binary format
      const buf = Buffer.from(log.raw_data, 'base64');
      res.send(buf);
    } else {
      res.send(log.raw_data);
    }
  });

  return router;
}
