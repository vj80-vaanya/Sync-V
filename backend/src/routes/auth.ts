import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../middleware/auth';
import { UserModel } from '../models/User';

export function createAuthRoutes(authService: AuthService, userModel: UserModel): Router {
  const router = Router();

  // POST /api/auth/login — authenticate and get token
  router.post('/login', (req: Request, res: Response) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Missing username or password' });
    }

    const user = userModel.getByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!authService.verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = authService.generateToken({
      userId: user.id,
      username: user.username,
      role: user.role as 'admin' | 'technician' | 'viewer',
    });

    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  });

  // POST /api/auth/register — create a new user (first user is admin, rest require admin)
  router.post('/register', (req: Request, res: Response) => {
    const { username, password, role } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Missing username or password' });
    }

    const validRoles = ['admin', 'technician', 'viewer'];
    const userRole = validRoles.includes(role) ? role : 'viewer';

    // Check auth header for non-first-user registration
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      if (!authService.hasRole(token, 'admin')) {
        return res.status(403).json({ error: 'Only admins can register new users' });
      }
    }

    const existing = userModel.getByUsername(username);
    if (existing) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const passwordHash = authService.hashPassword(password);
    const user = userModel.create({
      id: uuidv4(),
      username,
      password_hash: passwordHash,
      role: userRole,
    });

    const token = authService.generateToken({
      userId: user.id,
      username: user.username,
      role: user.role as 'admin' | 'technician' | 'viewer',
    });

    res.status(201).json({ token, user: { id: user.id, username: user.username, role: user.role } });
  });

  return router;
}
