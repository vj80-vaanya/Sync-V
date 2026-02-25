import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { AnomalyDetectionService } from '../services/AnomalyDetectionService';
import { DeviceHealthService } from '../services/DeviceHealthService';
import { LogSummaryService } from '../services/LogSummaryService';
import { isValidDeviceId } from '../utils/validation';

export function createAIRoutes(
  anomalyService: AnomalyDetectionService,
  healthService: DeviceHealthService,
  summaryService: LogSummaryService,
): Router {
  const router = Router();

  // Rate-limit map for health refresh: orgId -> last refresh timestamp
  const refreshCooldowns = new Map<string, number>();
  const REFRESH_COOLDOWN_MS = 60_000;

  // GET /api/ai/anomalies — list anomalies (org-scoped, paginated)
  router.get('/anomalies', (req: AuthenticatedRequest, res: Response) => {
    if (!req.orgId) {
      return res.status(403).json({ error: 'Organization context required' });
    }
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = (page - 1) * limit;

    const total = anomalyService.countByOrg(req.orgId);
    const data = anomalyService.getAnomaliesPaginated(req.orgId, offset, limit);
    res.json({ data, total, page, limit });
  });

  // GET /api/ai/anomalies/device/:id — anomalies for a device
  router.get('/anomalies/device/:id', (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    if (!isValidDeviceId(id)) {
      return res.status(400).json({ error: 'Invalid device ID format' });
    }
    const anomalies = anomalyService.getDeviceAnomalies(id);
    res.json(anomalies);
  });

  // POST /api/ai/anomalies/:id/resolve — mark anomaly resolved
  router.post('/anomalies/:id/resolve', (req: AuthenticatedRequest, res: Response) => {
    const resolved = anomalyService.resolveAnomaly(req.params.id);
    if (!resolved) {
      return res.status(404).json({ error: 'Anomaly not found' });
    }
    res.json({ success: true });
  });

  // GET /api/ai/health — fleet health scores (org-scoped, paginated)
  router.get('/health', (req: AuthenticatedRequest, res: Response) => {
    if (!req.orgId) {
      return res.status(403).json({ error: 'Organization context required' });
    }

    if (req.query.page || req.query.limit) {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
      const offset = (page - 1) * limit;

      const total = healthService.countByOrg(req.orgId);
      const data = healthService.getFleetHealthPaginated(req.orgId, offset, limit);
      return res.json({ data, total, page, limit });
    }

    const health = healthService.getFleetHealth(req.orgId);
    res.json(health);
  });

  // GET /api/ai/health/:deviceId — single device health + history
  router.get('/health/:deviceId', (req: AuthenticatedRequest, res: Response) => {
    const { deviceId } = req.params;
    if (!isValidDeviceId(deviceId)) {
      return res.status(400).json({ error: 'Invalid device ID format' });
    }

    const health = healthService.getHealth(deviceId);
    const history = healthService.getHistory(deviceId, 30);
    res.json({ current: health || null, history });
  });

  // POST /api/ai/health/refresh — trigger batch health recomputation (rate-limited)
  router.post('/health/refresh', (req: AuthenticatedRequest, res: Response) => {
    if (!req.orgId) {
      return res.status(403).json({ error: 'Organization context required' });
    }

    const now = Date.now();
    const lastRefresh = refreshCooldowns.get(req.orgId);
    if (lastRefresh && now - lastRefresh < REFRESH_COOLDOWN_MS) {
      const retryAfter = Math.ceil((REFRESH_COOLDOWN_MS - (now - lastRefresh)) / 1000);
      res.setHeader('Retry-After', retryAfter.toString());
      return res.status(429).json({ error: 'Rate limit exceeded. Try again later.', retryAfter });
    }

    refreshCooldowns.set(req.orgId, now);
    const results = healthService.computeAllHealth(req.orgId);
    res.json({ updated: results.length, results });
  });

  // GET /api/ai/summary/:logId — get log summary
  router.get('/summary/:logId', (req: AuthenticatedRequest, res: Response) => {
    const { logId } = req.params;
    let summary = summaryService.getSummary(logId);
    if (!summary) {
      summary = summaryService.summarizeAndStore(logId);
    }
    if (!summary) {
      return res.status(404).json({ error: 'Log not found' });
    }
    res.json(summary);
  });

  return router;
}
