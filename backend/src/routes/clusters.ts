import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { ClusterModel } from '../models/Cluster';
import { DeviceModel } from '../models/Device';
import { DashboardService } from '../services/DashboardService';
import { AuditService } from '../services/AuditService';

export function createClusterRoutes(
  clusterModel: ClusterModel,
  deviceModel: DeviceModel,
  dashboardService: DashboardService,
  auditService: AuditService,
): Router {
  const router = Router();

  // GET /api/clusters
  router.get('/', (req: AuthenticatedRequest, res: Response) => {
    if (!req.orgId) {
      return res.status(403).json({ error: 'Organization context required' });
    }
    const clusters = clusterModel.getByOrgId(req.orgId);
    res.json(clusters);
  });

  // POST /api/clusters
  router.post('/', (req: AuthenticatedRequest, res: Response) => {
    if (req.user?.role !== 'org_admin' && req.user?.role !== 'platform_admin') {
      return res.status(403).json({ error: 'Only org admins can create clusters' });
    }

    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Missing cluster name' });
    }

    const cluster = clusterModel.create({
      id: uuidv4(),
      org_id: req.orgId!,
      name,
      description,
    });

    auditService.log({
      orgId: req.orgId!,
      actorId: req.user!.userId,
      action: 'cluster.create',
      targetType: 'cluster',
      targetId: cluster.id,
      details: { name },
      ipAddress: req.ip || '',
    });

    res.status(201).json(cluster);
  });

  // GET /api/clusters/:id
  router.get('/:id', (req: AuthenticatedRequest, res: Response) => {
    const cluster = clusterModel.getById(req.params.id);
    if (!cluster || cluster.org_id !== req.orgId) {
      return res.status(404).json({ error: 'Cluster not found' });
    }
    res.json(cluster);
  });

  // PATCH /api/clusters/:id
  router.patch('/:id', (req: AuthenticatedRequest, res: Response) => {
    if (req.user?.role !== 'org_admin' && req.user?.role !== 'platform_admin') {
      return res.status(403).json({ error: 'Only org admins can update clusters' });
    }

    const cluster = clusterModel.getById(req.params.id);
    if (!cluster || cluster.org_id !== req.orgId) {
      return res.status(404).json({ error: 'Cluster not found' });
    }

    const { name, description } = req.body;
    const updated = clusterModel.update(req.params.id, { name, description });

    auditService.log({
      orgId: req.orgId!,
      actorId: req.user!.userId,
      action: 'cluster.update',
      targetType: 'cluster',
      targetId: req.params.id,
      ipAddress: req.ip || '',
    });

    res.json(updated);
  });

  // DELETE /api/clusters/:id
  router.delete('/:id', (req: AuthenticatedRequest, res: Response) => {
    if (req.user?.role !== 'org_admin' && req.user?.role !== 'platform_admin') {
      return res.status(403).json({ error: 'Only org admins can delete clusters' });
    }

    const cluster = clusterModel.getById(req.params.id);
    if (!cluster || cluster.org_id !== req.orgId) {
      return res.status(404).json({ error: 'Cluster not found' });
    }

    clusterModel.delete(req.params.id);

    auditService.log({
      orgId: req.orgId!,
      actorId: req.user!.userId,
      action: 'cluster.delete',
      targetType: 'cluster',
      targetId: req.params.id,
      details: { name: cluster.name },
      ipAddress: req.ip || '',
    });

    res.json({ success: true });
  });

  // POST /api/clusters/:id/devices — assign devices
  router.post('/:id/devices', (req: AuthenticatedRequest, res: Response) => {
    if (req.user?.role !== 'org_admin' && req.user?.role !== 'platform_admin') {
      return res.status(403).json({ error: 'Only org admins can assign devices' });
    }

    const cluster = clusterModel.getById(req.params.id);
    if (!cluster || cluster.org_id !== req.orgId) {
      return res.status(404).json({ error: 'Cluster not found' });
    }

    const { deviceIds } = req.body;
    if (!deviceIds || !Array.isArray(deviceIds)) {
      return res.status(400).json({ error: 'Missing deviceIds array' });
    }

    for (const deviceId of deviceIds) {
      const device = deviceModel.getById(deviceId);
      if (device && device.org_id === req.orgId) {
        clusterModel.assignDevice(req.params.id, deviceId);
      }
    }

    res.json({ success: true });
  });

  // DELETE /api/clusters/:id/devices/:deviceId — remove device from cluster
  router.delete('/:id/devices/:deviceId', (req: AuthenticatedRequest, res: Response) => {
    if (req.user?.role !== 'org_admin' && req.user?.role !== 'platform_admin') {
      return res.status(403).json({ error: 'Only org admins can remove devices from clusters' });
    }

    clusterModel.removeDevice(req.params.deviceId);
    res.json({ success: true });
  });

  // GET /api/clusters/:id/dashboard
  router.get('/:id/dashboard', (req: AuthenticatedRequest, res: Response) => {
    const dashboard = dashboardService.getClusterDashboard(req.params.id, req.orgId);
    if (!dashboard) {
      return res.status(404).json({ error: 'Cluster not found' });
    }
    res.json(dashboard);
  });

  return router;
}
