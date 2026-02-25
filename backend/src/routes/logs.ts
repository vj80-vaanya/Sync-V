import { Router, Response } from 'express';
import { LogIngestionService } from '../services/LogIngestion';
import { isValidDeviceId } from '../utils/validation';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { AuditService } from '../services/AuditService';
import { WebhookDispatcher } from '../services/WebhookDispatcher';
import { QuotaService } from '../services/QuotaService';
import { AnomalyDetectionService } from '../services/AnomalyDetectionService';
import { LogSummaryService } from '../services/LogSummaryService';

export function createLogRoutes(
  logIngestion: LogIngestionService,
  auditService?: AuditService,
  webhookDispatcher?: WebhookDispatcher,
  quotaService?: QuotaService,
  anomalyService?: AnomalyDetectionService,
  logSummaryService?: LogSummaryService,
  wsService?: { broadcastAnomaly(orgId: string, anomaly: any): void },
): Router {
  const router = Router();

  // GET /api/logs — list all logs (summary, no raw_data)
  router.get('/', (req: AuthenticatedRequest, res: Response) => {
    const logs = req.orgId
      ? logIngestion.getAllLogsByOrg(req.orgId)
      : logIngestion.getAllLogs();
    res.json(logs);
  });

  // GET /api/logs/filters — available vendors and formats for UI dropdowns
  router.get('/filters', (_req: AuthenticatedRequest, res: Response) => {
    const vendors = logIngestion.getDistinctVendors();
    const formats = logIngestion.getDistinctFormats();
    res.json({ vendors, formats });
  });

  // GET /api/logs/device/:deviceId — get logs for a device (summary)
  router.get('/device/:deviceId', (req: AuthenticatedRequest, res: Response) => {
    const { deviceId } = req.params;
    if (!isValidDeviceId(deviceId)) {
      return res.status(400).json({ error: 'Invalid device ID format' });
    }

    const logs = req.orgId
      ? logIngestion.getLogsByDeviceAndOrg(deviceId, req.orgId)
      : logIngestion.getLogsByDevice(deviceId);
    res.json(logs);
  });

  // POST /api/logs — ingest a new log
  router.post('/', (req: AuthenticatedRequest, res: Response) => {
    const { deviceId, filename, size, checksum, rawData, vendor, format, metadata } = req.body;

    if (!deviceId || !filename || !checksum) {
      return res.status(400).json({ error: 'Missing required fields: deviceId, filename, checksum' });
    }

    // Enforce storage quota
    if (quotaService && req.orgId) {
      try {
        quotaService.enforceStorageQuota(req.orgId);
      } catch (err: any) {
        return res.status(403).json({ error: err.message });
      }
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
      orgId: req.orgId,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    if (auditService && req.user) {
      auditService.log({
        orgId: req.orgId,
        actorId: req.user.userId,
        action: 'log.upload',
        targetType: 'log',
        targetId: result.logId!,
        details: { filename, deviceId },
        ipAddress: req.ip || '',
      });
    }

    if (webhookDispatcher && req.orgId) {
      webhookDispatcher.dispatch(req.orgId, 'log.uploaded', { logId: result.logId, deviceId, filename });
    }

    // AI post-ingest hooks
    if (anomalyService && result.logId) {
      try {
        const logRecord = logIngestion.getLogById(result.logId);
        if (logRecord) {
          const anomalies = anomalyService.analyzeLog(logRecord);
          if (anomalies.length > 0 && webhookDispatcher && req.orgId) {
            webhookDispatcher.dispatch(req.orgId, 'anomaly.detected', {
              logId: result.logId,
              deviceId,
              anomalies: anomalies.map(a => ({ id: a.id, type: a.type, severity: a.severity })),
            });
          }
          if (anomalies.length > 0 && wsService && req.orgId) {
            for (const anomaly of anomalies) {
              wsService.broadcastAnomaly(req.orgId, anomaly);
            }
          }
        }
      } catch (err) {
        console.error('Anomaly detection failed for log', result.logId, err);
      }
    }

    if (logSummaryService && result.logId) {
      try {
        logSummaryService.summarizeAndStore(result.logId);
      } catch (err) {
        console.error('Log summarization failed for log', result.logId, err);
      }
    }

    res.status(201).json({ logId: result.logId });
  });

  // GET /api/logs/verify/:logId — verify log integrity
  router.get('/verify/:logId', (req: AuthenticatedRequest, res: Response) => {
    const { logId } = req.params;
    const { checksum } = req.query;

    if (!checksum || typeof checksum !== 'string') {
      return res.status(400).json({ error: 'Missing checksum query parameter' });
    }

    const valid = logIngestion.verifyLogIntegrity(logId, checksum);
    res.json({ valid });
  });

  // DELETE /api/logs/:id — delete a log record
  router.delete('/:id', (req: AuthenticatedRequest, res: Response) => {
    const log = logIngestion.getLogById(req.params.id);
    if (!log) {
      return res.status(404).json({ error: 'Log not found' });
    }
    if (req.orgId && log.org_id !== req.orgId) {
      return res.status(404).json({ error: 'Log not found' });
    }

    const deleted = logIngestion.deleteLog(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Log not found' });
    }

    if (auditService && req.user) {
      auditService.log({
        orgId: req.orgId,
        actorId: req.user.userId,
        action: 'log.delete',
        targetType: 'log',
        targetId: req.params.id,
        ipAddress: req.ip || '',
      });
    }

    res.json({ success: true });
  });

  // GET /api/logs/:id — full log record including raw_data
  router.get('/:id', (req: AuthenticatedRequest, res: Response) => {
    const log = logIngestion.getLogById(req.params.id);
    if (!log) {
      return res.status(404).json({ error: 'Log not found' });
    }
    if (req.orgId && log.org_id !== req.orgId) {
      return res.status(404).json({ error: 'Log not found' });
    }

    if (auditService && req.user) {
      auditService.log({
        orgId: req.orgId,
        actorId: req.user.userId,
        action: 'log.view_raw',
        targetType: 'log',
        targetId: req.params.id,
        ipAddress: req.ip || '',
      });
    }

    res.json(log);
  });

  // GET /api/logs/:id/raw — download raw content
  router.get('/:id/raw', (req: AuthenticatedRequest, res: Response) => {
    const log = logIngestion.getLogById(req.params.id);
    if (!log) {
      return res.status(404).json({ error: 'Log not found' });
    }
    if (req.orgId && log.org_id !== req.orgId) {
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
      const buf = Buffer.from(log.raw_data, 'base64');
      res.send(buf);
    } else {
      res.send(log.raw_data);
    }
  });

  return router;
}
