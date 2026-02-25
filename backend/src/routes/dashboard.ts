import { Router, Response } from 'express';
import { DashboardService } from '../services/DashboardService';
import { DeviceHealthService } from '../services/DeviceHealthService';
import { AnomalyDetectionService } from '../services/AnomalyDetectionService';
import { isValidDeviceId } from '../utils/validation';
import { AuthenticatedRequest } from '../middleware/authMiddleware';

export function createDashboardRoutes(
  dashboardService: DashboardService,
  healthService?: DeviceHealthService,
  anomalyService?: AnomalyDetectionService,
): Router {
  const router = Router();

  // GET /api/dashboard/overview — fleet overview (org-scoped)
  router.get('/overview', (req: AuthenticatedRequest, res: Response) => {
    const overview = dashboardService.getFleetOverview(req.orgId);
    const result: any = { ...overview };

    if (healthService && req.orgId) {
      const healthScores = healthService.getFleetHealth(req.orgId);
      result.healthScores = healthScores.map(h => {
        let factors: any = {};
        try { factors = JSON.parse(h.factors); } catch {}
        return { deviceId: h.device_id, score: h.score, trend: h.trend, factors };
      });
    }

    if (anomalyService && req.orgId) {
      const unresolved = anomalyService.getUnresolved(req.orgId);
      result.unresolvedAnomalies = unresolved.length;
    }

    res.json(result);
  });

  // GET /api/dashboard/device/:id — device detail with logs
  router.get('/device/:id', (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    if (!isValidDeviceId(id)) {
      return res.status(400).json({ error: 'Invalid device ID format' });
    }

    const detail = dashboardService.getDeviceDetail(id, req.orgId);
    if (!detail) {
      return res.status(404).json({ error: 'Device not found' });
    }
    res.json(detail);
  });

  // GET /api/dashboard/firmware — firmware status summary
  router.get('/firmware', (req: AuthenticatedRequest, res: Response) => {
    const summary = dashboardService.getFirmwareStatusSummary(req.orgId);
    res.json(summary);
  });

  // GET /api/dashboard/logs — log upload history
  router.get('/logs', (req: AuthenticatedRequest, res: Response) => {
    const history = dashboardService.getLogUploadHistory(req.orgId);
    res.json(history);
  });

  // GET /api/dashboard/clusters/:id — cluster dashboard
  router.get('/clusters/:id', (req: AuthenticatedRequest, res: Response) => {
    const dashboard = dashboardService.getClusterDashboard(req.params.id, req.orgId);
    if (!dashboard) {
      return res.status(404).json({ error: 'Cluster not found' });
    }
    res.json(dashboard);
  });

  // GET /api/dashboard/ai-overview — combined AI metrics
  router.get('/ai-overview', (req: AuthenticatedRequest, res: Response) => {
    if (!req.orgId) {
      return res.status(403).json({ error: 'Organization context required' });
    }

    const result: any = {};

    if (healthService) {
      const healthScores = healthService.getFleetHealth(req.orgId);
      const scores = healthScores.map(h => h.score);
      result.averageHealth = scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : 100;
      result.devicesNeedingAttention = scores.filter(s => s < 50).length;
      result.healthScores = healthScores.map(h => {
        let factors: any = {};
        try { factors = JSON.parse(h.factors); } catch {}
        return { deviceId: h.device_id, score: h.score, trend: h.trend, factors };
      });
    }

    if (anomalyService) {
      const allAnomalies = anomalyService.getAnomalies(req.orgId);
      const unresolved = anomalyService.getUnresolved(req.orgId);
      // Count anomalies from the last 7 days
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const thisWeek = allAnomalies.filter(a => a.created_at >= weekAgo);
      result.totalAnomaliesThisWeek = thisWeek.length;
      result.unresolvedAnomalies = unresolved.length;
      result.recentAnomalies = unresolved.slice(0, 10);
    }

    res.json(result);
  });

  return router;
}
