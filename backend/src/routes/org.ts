import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { UserModel } from '../models/User';
import { ApiKeyModel } from '../models/ApiKey';
import { WebhookModel } from '../models/Webhook';
import { AuditService } from '../services/AuditService';
import { QuotaService } from '../services/QuotaService';
import { AuthService } from '../middleware/auth';

export function createOrgRoutes(
  userModel: UserModel,
  apiKeyModel: ApiKeyModel,
  webhookModel: WebhookModel,
  auditService: AuditService,
  quotaService: QuotaService,
  authService: AuthService,
): Router {
  const router = Router();

  // --- User Management ---

  // GET /api/org/users
  router.get('/users', (req: AuthenticatedRequest, res: Response) => {
    const users = userModel.getByOrgId(req.orgId!);
    res.json(users.map(u => ({ id: u.id, username: u.username, role: u.role, org_id: u.org_id, created_at: u.created_at })));
  });

  // POST /api/org/users
  router.post('/users', async (req: AuthenticatedRequest, res: Response) => {
    const { username, password, role } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Missing username or password' });
    }

    const validRoles = ['technician', 'viewer'];
    const userRole = validRoles.includes(role) ? role : 'viewer';

    try {
      quotaService.enforceUserQuota(req.orgId!);
    } catch (err: any) {
      return res.status(403).json({ error: err.message });
    }

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
      org_id: req.orgId!,
    });

    auditService.log({
      orgId: req.orgId!,
      actorId: req.user!.userId,
      action: 'user.create',
      targetType: 'user',
      targetId: user.id,
      details: { username, role: userRole },
      ipAddress: req.ip || '',
    });

    res.status(201).json({ id: user.id, username: user.username, role: user.role, org_id: user.org_id });
  });

  // PATCH /api/org/users/:userId
  router.patch('/users/:userId', (req: AuthenticatedRequest, res: Response) => {
    const { role } = req.body;
    const validRoles = ['technician', 'viewer'];
    if (!role || !validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role (must be technician or viewer)' });
    }

    const user = userModel.getById(req.params.userId);
    if (!user || user.org_id !== req.orgId) {
      return res.status(404).json({ error: 'User not found in your organization' });
    }

    userModel.updateRole(req.params.userId, role);

    auditService.log({
      orgId: req.orgId!,
      actorId: req.user!.userId,
      action: 'user.role_change',
      targetType: 'user',
      targetId: req.params.userId,
      details: { from: user.role, to: role },
      ipAddress: req.ip || '',
    });

    res.json({ success: true });
  });

  // DELETE /api/org/users/:userId
  router.delete('/users/:userId', (req: AuthenticatedRequest, res: Response) => {
    const user = userModel.getById(req.params.userId);
    if (!user || user.org_id !== req.orgId) {
      return res.status(404).json({ error: 'User not found in your organization' });
    }

    // Cannot delete yourself
    if (user.id === req.user!.userId) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }

    userModel.delete(req.params.userId);

    auditService.log({
      orgId: req.orgId!,
      actorId: req.user!.userId,
      action: 'user.delete',
      targetType: 'user',
      targetId: req.params.userId,
      details: { username: user.username },
      ipAddress: req.ip || '',
    });

    res.json({ success: true });
  });

  // --- API Keys ---

  // GET /api/org/api-keys
  router.get('/api-keys', (req: AuthenticatedRequest, res: Response) => {
    const keys = apiKeyModel.getByOrgId(req.orgId!);
    res.json(keys);
  });

  // POST /api/org/api-keys
  router.post('/api-keys', (req: AuthenticatedRequest, res: Response) => {
    const { name, permissions } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Missing API key name' });
    }

    const { record, rawKey } = apiKeyModel.create({
      org_id: req.orgId!,
      name,
      permissions: permissions || [],
      created_by: req.user!.userId,
    });

    auditService.log({
      orgId: req.orgId!,
      actorId: req.user!.userId,
      action: 'apikey.create',
      targetType: 'api_key',
      targetId: record.id,
      details: { name },
      ipAddress: req.ip || '',
    });

    // Return the raw key ONCE
    res.status(201).json({
      id: record.id,
      name: record.name,
      key_prefix: record.key_prefix,
      key: rawKey,
      permissions: record.permissions,
      created_at: record.created_at,
    });
  });

  // DELETE /api/org/api-keys/:keyId
  router.delete('/api-keys/:keyId', (req: AuthenticatedRequest, res: Response) => {
    const key = apiKeyModel.getById(req.params.keyId);
    if (!key || key.org_id !== req.orgId) {
      return res.status(404).json({ error: 'API key not found' });
    }

    apiKeyModel.delete(req.params.keyId);

    auditService.log({
      orgId: req.orgId!,
      actorId: req.user!.userId,
      action: 'apikey.revoke',
      targetType: 'api_key',
      targetId: req.params.keyId,
      details: { name: key.name },
      ipAddress: req.ip || '',
    });

    res.json({ success: true });
  });

  // --- Webhooks ---

  // GET /api/org/webhooks
  router.get('/webhooks', (req: AuthenticatedRequest, res: Response) => {
    const webhooks = webhookModel.getByOrgId(req.orgId!);
    // Don't expose secrets
    res.json(webhooks.map(w => ({ ...w, secret: undefined })));
  });

  // POST /api/org/webhooks
  router.post('/webhooks', (req: AuthenticatedRequest, res: Response) => {
    const { url, events } = req.body;
    if (!url || !events || !Array.isArray(events)) {
      return res.status(400).json({ error: 'Missing url or events array' });
    }

    const secret = require('crypto').randomBytes(32).toString('hex');
    const webhook = webhookModel.create({
      org_id: req.orgId!,
      url,
      secret,
      events,
    });

    auditService.log({
      orgId: req.orgId!,
      actorId: req.user!.userId,
      action: 'webhook.create',
      targetType: 'webhook',
      targetId: webhook.id,
      details: { url, events },
      ipAddress: req.ip || '',
    });

    res.status(201).json(webhook);
  });

  // PATCH /api/org/webhooks/:id
  router.patch('/webhooks/:id', (req: AuthenticatedRequest, res: Response) => {
    const webhook = webhookModel.getById(req.params.id);
    if (!webhook || webhook.org_id !== req.orgId) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    const { url, events, is_active } = req.body;
    const updated = webhookModel.update(req.params.id, {
      url,
      events,
      is_active: is_active !== undefined ? (is_active ? 1 : 0) : undefined,
    });

    res.json(updated);
  });

  // DELETE /api/org/webhooks/:id
  router.delete('/webhooks/:id', (req: AuthenticatedRequest, res: Response) => {
    const webhook = webhookModel.getById(req.params.id);
    if (!webhook || webhook.org_id !== req.orgId) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    webhookModel.delete(req.params.id);

    auditService.log({
      orgId: req.orgId!,
      actorId: req.user!.userId,
      action: 'webhook.delete',
      targetType: 'webhook',
      targetId: req.params.id,
      ipAddress: req.ip || '',
    });

    res.json({ success: true });
  });

  // --- Audit & Usage ---

  // GET /api/org/audit
  router.get('/audit', (req: AuthenticatedRequest, res: Response) => {
    const { from, to, action, limit } = req.query;
    const events = auditService.getOrgAuditLog(req.orgId!, {
      from: from as string,
      to: to as string,
      action: action as string,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });
    res.json(events);
  });

  // GET /api/org/usage
  router.get('/usage', (req: AuthenticatedRequest, res: Response) => {
    const usage = quotaService.getUsageSummary(req.orgId!);
    res.json(usage);
  });

  return router;
}
