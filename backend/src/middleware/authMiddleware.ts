import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { AuthService, TokenPayload } from './auth';
import { ApiKeyModel } from '../models/ApiKey';

export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
  orgId?: string;
}

export function createAuthMiddleware(authService: AuthService, apiKeyModel?: ApiKeyModel) {
  return (requiredRole: string) => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      // Try Authorization header first (API clients)
      let token: string | undefined;
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7);
      }
      // Fall back to httpOnly cookie (web dashboard)
      if (!token && req.cookies?.syncv_token) {
        token = req.cookies.syncv_token;
      }
      if (!token) {
        return res.status(401).json({ error: 'Missing or invalid authorization' });
      }

      // Try API key auth if token starts with 'svk_'
      if (token.startsWith('svk_') && apiKeyModel) {
        const keyHash = crypto.createHash('sha256').update(token).digest('hex');
        const apiKey = apiKeyModel.getByKeyHash(keyHash);
        if (!apiKey) {
          return res.status(401).json({ error: 'Invalid API key' });
        }

        let permissions: string[] = [];
        try { permissions = JSON.parse(apiKey.permissions); } catch {}

        req.user = {
          userId: apiKey.created_by,
          username: `apikey:${apiKey.name}`,
          role: 'technician', // API keys act as technician level
          orgId: apiKey.org_id,
          authType: 'api_key',
          permissions,
        };
        req.orgId = apiKey.org_id;

        apiKeyModel.updateLastUsed(apiKey.id);

        // Check role level for API keys
        const roleHierarchy: Record<string, number> = {
          platform_admin: 4, org_admin: 3, technician: 2, viewer: 1,
        };
        const userLevel = roleHierarchy[req.user.role] || 0;
        const requiredLevel = roleHierarchy[requiredRole] || 0;
        if (userLevel < requiredLevel) {
          return res.status(403).json({ error: 'Insufficient permissions' });
        }

        return next();
      }

      // JWT auth
      const payload = authService.validateToken(token);
      if (!payload) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }

      if (!authService.hasRole(token, requiredRole)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      req.user = payload;
      req.orgId = payload.orgId;
      next();
    };
  };
}

export function requireOrgAccess(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (req.user?.role === 'platform_admin') {
    return res.status(403).json({ error: 'Platform admins cannot access organization data' });
  }
  if (!req.orgId) {
    return res.status(403).json({ error: 'Organization context required' });
  }
  next();
}

export function requirePlatformAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== 'platform_admin') {
    return res.status(403).json({ error: 'Platform admin access required' });
  }
  next();
}
