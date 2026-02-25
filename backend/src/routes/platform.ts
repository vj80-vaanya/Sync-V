import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { OrganizationModel } from '../models/Organization';
import { ClusterModel } from '../models/Cluster';
import { PlatformDashboardService } from '../services/PlatformDashboardService';
import { AuditService } from '../services/AuditService';
import { UserModel } from '../models/User';
import { AuthService } from '../middleware/auth';

export function createPlatformRoutes(
  orgModel: OrganizationModel,
  platformDashboard: PlatformDashboardService,
  auditService: AuditService,
  userModel: UserModel,
  authService: AuthService,
  clusterModel?: ClusterModel,
): Router {
  const router = Router();

  // GET /api/platform/overview
  router.get('/overview', (_req: AuthenticatedRequest, res: Response) => {
    const overview = platformDashboard.getOverview();
    res.json(overview);
  });

  // GET /api/platform/organizations
  router.get('/organizations', (_req: AuthenticatedRequest, res: Response) => {
    const summaries = platformDashboard.getOrgSummaries();
    res.json(summaries);
  });

  // POST /api/platform/organizations
  router.post('/organizations', (req: AuthenticatedRequest, res: Response) => {
    const { name, slug, plan, max_devices, max_storage_bytes, max_users } = req.body;

    if (!name || !slug) {
      return res.status(400).json({ error: 'Missing required fields: name, slug' });
    }

    // Validate slug format
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug) && slug.length > 1 || (slug.length === 1 && !/^[a-z0-9]$/.test(slug))) {
      return res.status(400).json({ error: 'Invalid slug format (lowercase alphanumeric and hyphens)' });
    }

    const existing = orgModel.getBySlug(slug);
    if (existing) {
      return res.status(409).json({ error: 'Organization slug already taken' });
    }

    try {
      const org = orgModel.create({
        id: uuidv4(),
        name,
        slug,
        plan: plan || 'free',
        max_devices,
        max_storage_bytes,
        max_users,
      });

      auditService.log({
        orgId: org.id,
        actorId: req.user!.userId,
        action: 'org.create',
        targetType: 'organization',
        targetId: org.id,
        details: { name, slug, plan: org.plan },
        ipAddress: req.ip || '',
      });

      res.status(201).json(org);
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to create organization' });
    }
  });

  // GET /api/platform/organizations/:id
  router.get('/organizations/:id', (req: AuthenticatedRequest, res: Response) => {
    const detail = platformDashboard.getOrgDetail(req.params.id);
    if (!detail) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    // Enrich with cluster count
    if (clusterModel) {
      detail.clusterCount = clusterModel.getByOrgId(req.params.id).length;
    }
    res.json(detail);
  });

  // PATCH /api/platform/organizations/:id
  router.patch('/organizations/:id', (req: AuthenticatedRequest, res: Response) => {
    const { name, plan, max_devices, max_storage_bytes, max_users } = req.body;

    const oldOrg = orgModel.getById(req.params.id);
    if (!oldOrg) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const updated = orgModel.update(req.params.id, { name, plan, max_devices, max_storage_bytes, max_users });
    if (!updated) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    if (plan && plan !== oldOrg.plan) {
      auditService.log({
        orgId: updated.id,
        actorId: req.user!.userId,
        action: 'org.plan_change',
        targetType: 'organization',
        targetId: updated.id,
        details: { from: oldOrg.plan, to: plan },
        ipAddress: req.ip || '',
      });
    }

    auditService.log({
      orgId: updated.id,
      actorId: req.user!.userId,
      action: 'org.update',
      targetType: 'organization',
      targetId: updated.id,
      ipAddress: req.ip || '',
    });

    res.json(updated);
  });

  // PATCH /api/platform/organizations/:id/suspend
  router.patch('/organizations/:id/suspend', (req: AuthenticatedRequest, res: Response) => {
    const success = orgModel.suspend(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    auditService.log({
      orgId: req.params.id,
      actorId: req.user!.userId,
      action: 'org.suspend',
      targetType: 'organization',
      targetId: req.params.id,
      ipAddress: req.ip || '',
    });

    res.json({ success: true });
  });

  // PATCH /api/platform/organizations/:id/activate
  router.patch('/organizations/:id/activate', (req: AuthenticatedRequest, res: Response) => {
    const success = orgModel.activate(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    auditService.log({
      orgId: req.params.id,
      actorId: req.user!.userId,
      action: 'org.activate',
      targetType: 'organization',
      targetId: req.params.id,
      ipAddress: req.ip || '',
    });

    res.json({ success: true });
  });

  // DELETE /api/platform/organizations/:id
  router.delete('/organizations/:id', (req: AuthenticatedRequest, res: Response) => {
    const success = orgModel.delete(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    res.json({ success: true });
  });

  // GET /api/platform/audit
  router.get('/audit', (req: AuthenticatedRequest, res: Response) => {
    const { from, to, limit } = req.query;
    const events = auditService.getPlatformAuditLog({
      from: from as string,
      to: to as string,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });
    res.json(events);
  });

  // POST /api/platform/organizations/:id/users — create user in specific org
  router.post('/organizations/:id/users', async (req: AuthenticatedRequest, res: Response) => {
    const orgId = req.params.id;
    const org = orgModel.getById(orgId);
    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const { username, password, role } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Missing username or password' });
    }

    const validRoles = ['org_admin', 'technician', 'viewer'];
    const userRole = validRoles.includes(role) ? role : 'viewer';

    const existing = userModel.getByUsername(username);
    if (existing) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const passwordHash = await authService.hashPassword(password);
    const user = userModel.create({
      id: uuidv4(),
      username,
      password_hash: passwordHash,
      role: userRole,
      org_id: orgId,
    });

    auditService.log({
      orgId,
      actorId: req.user!.userId,
      action: 'user.create',
      targetType: 'user',
      targetId: user.id,
      details: { username, role: userRole },
      ipAddress: req.ip || '',
    });

    res.status(201).json({ id: user.id, username: user.username, role: user.role, org_id: user.org_id });
  });

  return router;
}
