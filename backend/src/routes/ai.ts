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

  // Prune expired cooldowns every 5 minutes to prevent unbounded growth
  const pruneInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, ts] of refreshCooldowns) {
      if (now - ts >= REFRESH_COOLDOWN_MS) {
        refreshCooldowns.delete(key);
      }
    }
  }, 5 * 60_000);
  pruneInterval.unref();

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

  // GET /api/ai/anomalies/device/:id — anomalies for a device (org-scoped)
  router.get('/anomalies/device/:id', (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    if (!isValidDeviceId(id)) {
      return res.status(400).json({ error: 'Invalid device ID format' });
    }
    const anomalies = anomalyService.getDeviceAnomalies(id)
      .filter(a => !req.orgId || a.org_id === req.orgId);
    res.json(anomalies);
  });

  // POST /api/ai/anomalies/:id/resolve — mark anomaly resolved (org-scoped)
  router.post('/anomalies/:id/resolve', (req: AuthenticatedRequest, res: Response) => {
    // Verify anomaly belongs to requesting org before resolving
    const anomalies = req.orgId ? anomalyService.getAnomalies(req.orgId) : [];
    const anomaly = anomalies.find(a => a.id === req.params.id);
    if (req.orgId && !anomaly) {
      return res.status(404).json({ error: 'Anomaly not found' });
    }

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

  // GET /api/ai/health/:deviceId — single device health + history (org-scoped)
  router.get('/health/:deviceId', (req: AuthenticatedRequest, res: Response) => {
    const { deviceId } = req.params;
    if (!isValidDeviceId(deviceId)) {
      return res.status(400).json({ error: 'Invalid device ID format' });
    }

    const health = healthService.getHealth(deviceId);
    // Verify the device belongs to the requesting org
    if (health && req.orgId) {
      const fleetHealth = healthService.getFleetHealth(req.orgId);
      if (!fleetHealth.some(h => h.device_id === deviceId)) {
        return res.status(404).json({ error: 'Device not found' });
      }
    }
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
