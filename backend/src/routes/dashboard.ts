import { Router, Response } from 'express';
import { DashboardService } from '../services/DashboardService';
import { isValidDeviceId } from '../utils/validation';
import { AuthenticatedRequest } from '../middleware/authMiddleware';

export function createDashboardRoutes(dashboardService: DashboardService): Router {
  const router = Router();

  // GET /api/dashboard/overview — fleet overview (org-scoped)
  router.get('/overview', (req: AuthenticatedRequest, res: Response) => {
    const overview = dashboardService.getFleetOverview(req.orgId);
    res.json(overview);
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

  return router;
}
