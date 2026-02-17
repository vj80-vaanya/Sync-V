import { Router, Request, Response } from 'express';
import { DashboardService } from '../services/DashboardService';
import { isValidDeviceId } from '../utils/validation';

export function createDashboardRoutes(dashboardService: DashboardService): Router {
  const router = Router();

  // GET /api/dashboard/overview — fleet overview
  router.get('/overview', (_req: Request, res: Response) => {
    const overview = dashboardService.getFleetOverview();
    res.json(overview);
  });

  // GET /api/dashboard/device/:id — device detail with logs
  router.get('/device/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    if (!isValidDeviceId(id)) {
      return res.status(400).json({ error: 'Invalid device ID format' });
    }

    const detail = dashboardService.getDeviceDetail(id);
    if (!detail) {
      return res.status(404).json({ error: 'Device not found' });
    }
    res.json(detail);
  });

  // GET /api/dashboard/firmware — firmware status summary
  router.get('/firmware', (_req: Request, res: Response) => {
    const summary = dashboardService.getFirmwareStatusSummary();
    res.json(summary);
  });

  // GET /api/dashboard/logs — log upload history
  router.get('/logs', (_req: Request, res: Response) => {
    const history = dashboardService.getLogUploadHistory();
    res.json(history);
  });

  return router;
}
