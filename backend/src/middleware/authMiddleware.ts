import { Request, Response, NextFunction } from 'express';
import { AuthService, TokenPayload } from './auth';

export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
}

export function createAuthMiddleware(authService: AuthService) {
  return (requiredRole: string) => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid authorization header' });
      }

      const token = authHeader.slice(7);
      const payload = authService.validateToken(token);
      if (!payload) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }

      if (!authService.hasRole(token, requiredRole)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      req.user = payload;
      next();
    };
  };
}
