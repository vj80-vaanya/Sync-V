import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthService, FailedLoginTracker } from '../middleware/auth';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { UserModel } from '../models/User';
import { OrganizationModel } from '../models/Organization';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 24 * 60 * 60 * 1000,
  path: '/',
};

export function createAuthRoutes(authService: AuthService, userModel: UserModel, orgModel?: OrganizationModel, loginTracker?: FailedLoginTracker): Router {
  const router = Router();

  // POST /api/auth/bootstrap — one-time platform admin creation
  router.post('/bootstrap', async (_req: Request, res: Response) => {
    const clientIp = _req.ip || _req.socket.remoteAddress || 'unknown';
    const rateLimitKey = `${clientIp}:bootstrap`;

    if (loginTracker?.isLocked(rateLimitKey)) {
      return res.status(429).json({ error: 'Too many login attempts. Try again in 15 minutes.' });
    }

    // Check if any platform_admin already exists
    const allUsers = userModel.getAll();
    const hasPlatformAdmin = allUsers.some(u => u.role === 'platform_admin');
    if (hasPlatformAdmin) {
      return res.status(409).json({ error: 'Platform admin already exists' });
    }

    const { username, password } = _req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Missing username or password' });
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
      role: 'platform_admin',
    });

    const token = authService.generateToken({
      userId: user.id,
      username: user.username,
      role: 'platform_admin',
    });

    loginTracker?.recordSuccess(rateLimitKey);
    res.cookie('syncv_token', token, COOKIE_OPTIONS);
    res.status(201).json({ token, user: { id: user.id, username: user.username, role: user.role } });
  });

  // POST /api/auth/login — authenticate and get token
  router.post('/login', async (req: Request, res: Response) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Missing username or password' });
    }

    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const rateLimitKey = `${clientIp}:${username}`;

    if (loginTracker?.isLocked(rateLimitKey)) {
      return res.status(429).json({ error: 'Too many login attempts. Try again in 15 minutes.' });
    }

    const user = userModel.getByUsername(username);
    if (!user) {
      loginTracker?.recordFailure(rateLimitKey);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!(await authService.verifyPassword(password, user.password_hash))) {
      loginTracker?.recordFailure(rateLimitKey);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const tokenPayload: any = {
      userId: user.id,
      username: user.username,
      role: user.role as any,
    };

    // Include orgId for non-platform_admin users
    if (user.role !== 'platform_admin' && user.org_id) {
      tokenPayload.orgId = user.org_id;
    }

    const token = authService.generateToken(tokenPayload);

    loginTracker?.recordSuccess(rateLimitKey);
    res.cookie('syncv_token', token, COOKIE_OPTIONS);
    res.json({
      token,
      user: { id: user.id, username: user.username, role: user.role, org_id: user.org_id },
    });
  });

  // POST /api/auth/register — create a new user (org-scoped)
  router.post('/register', async (req: AuthenticatedRequest, res: Response) => {
    const { username, password, role, org_id } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Missing username or password' });
    }

    const validRoles = ['org_admin', 'technician', 'viewer'];
    const userRole = validRoles.includes(role) ? role : 'viewer';

    // Cannot create platform_admin via register
    if (role === 'platform_admin') {
      return res.status(403).json({ error: 'Cannot create platform_admin via registration' });
    }

    // Check auth header
    const authHeader = req.headers.authorization;
    let callerPayload: any = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      callerPayload = authService.validateToken(token);
    }

    // Determine target org_id
    let targetOrgId: string | undefined;

    if (callerPayload?.role === 'platform_admin') {
      // Platform admin must specify org_id
      if (!org_id) {
        return res.status(400).json({ error: 'Platform admin must specify org_id' });
      }
      if (orgModel) {
        const org = orgModel.getById(org_id);
        if (!org) {
          return res.status(404).json({ error: 'Organization not found' });
        }
      }
      targetOrgId = org_id;
    } else if (callerPayload?.role === 'org_admin') {
      // Org admin creates users in their own org
      targetOrgId = callerPayload.orgId;
      if (!targetOrgId) {
        return res.status(403).json({ error: 'Organization context required' });
      }
      // Org admin can only create technician/viewer
      if (userRole === 'org_admin') {
        return res.status(403).json({ error: 'Only platform admins can create org_admin users' });
      }
    } else if (callerPayload) {
      return res.status(403).json({ error: 'Insufficient permissions to register users' });
    } else {
      // No auth — first-user bootstrap (legacy compatibility)
      // Only allow if no users exist
      const allUsers = userModel.getAll();
      if (allUsers.length > 0) {
        return res.status(403).json({ error: 'Authentication required to register users' });
      }
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
      org_id: targetOrgId,
    });

    const tokenPayload: any = {
      userId: user.id,
      username: user.username,
      role: user.role as any,
    };
    if (targetOrgId) {
      tokenPayload.orgId = targetOrgId;
    }

    const token = authService.generateToken(tokenPayload);

    res.cookie('syncv_token', token, COOKIE_OPTIONS);
    res.status(201).json({
      token,
      user: { id: user.id, username: user.username, role: user.role, org_id: user.org_id },
    });
  });

  // POST /api/auth/logout — clear httpOnly cookie
  router.post('/logout', (_req: Request, res: Response) => {
    res.clearCookie('syncv_token', { path: '/' });
    res.json({ success: true });
  });

  return router;
}
