import express from 'express';
import Database from 'better-sqlite3';
import { createDatabase } from './models/Database';
import { DeviceModel } from './models/Device';
import { LogModel } from './models/Log';
import { FirmwareModel } from './models/Firmware';
import { UserModel } from './models/User';
import { DeviceRegistry } from './services/DeviceRegistry';
import { LogIngestionService } from './services/LogIngestion';
import { FirmwareDistributionService } from './services/FirmwareDistribution';
import { DashboardService } from './services/DashboardService';
import { AuthService, RateLimiter } from './middleware/auth';
import { createAuthMiddleware } from './middleware/authMiddleware';
import { createDeviceRoutes } from './routes/devices';
import { createLogRoutes } from './routes/logs';
import { createFirmwareRoutes } from './routes/firmware';
import { createAuthRoutes } from './routes/auth';
import { createDashboardRoutes } from './routes/dashboard';

const PORT = parseInt(process.env.PORT || '3000', 10);
const JWT_SECRET = process.env.JWT_SECRET || 'syncv-dev-secret-change-in-production';
const DB_PATH = process.env.DB_PATH || ':memory:';

export function createApp(dbPath?: string): { app: express.Express; db: Database.Database } {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // Initialize database and models
  const db = createDatabase(dbPath ?? DB_PATH);
  const deviceModel = new DeviceModel(db);
  const logModel = new LogModel(db);
  const firmwareModel = new FirmwareModel(db);
  const userModel = new UserModel(db);

  // Initialize services
  const deviceRegistry = new DeviceRegistry(deviceModel);
  const logIngestion = new LogIngestionService(logModel);
  const firmwareDistribution = new FirmwareDistributionService(firmwareModel);
  const dashboardService = new DashboardService(deviceModel, logModel, firmwareModel);
  const authService = new AuthService(JWT_SECRET);
  const rateLimiter = new RateLimiter(100, 60000);

  // Rate limiting middleware
  app.use((req, res, next) => {
    const clientId = req.ip || req.socket.remoteAddress || 'unknown';
    if (!rateLimiter.isAllowed(clientId)) {
      return res.status(429).json({ error: 'Too many requests' });
    }
    next();
  });

  // Auth middleware factory
  const requireAuth = createAuthMiddleware(authService);

  // Public routes
  app.use('/api/auth', createAuthRoutes(authService, userModel));

  // Protected routes
  app.use('/api/devices', requireAuth('viewer'), createDeviceRoutes(deviceRegistry));
  app.use('/api/logs', requireAuth('viewer'), createLogRoutes(logIngestion));
  app.use('/api/firmware', requireAuth('viewer'), createFirmwareRoutes(firmwareDistribution));
  app.use('/api/dashboard', requireAuth('viewer'), createDashboardRoutes(dashboardService));

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  return { app, db };
}

if (require.main === module) {
  const { app } = createApp();
  app.listen(PORT, () => {
    console.log(`Sync-V backend running on port ${PORT}`);
  });
}
