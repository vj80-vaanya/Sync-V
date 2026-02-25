import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import Database from 'better-sqlite3';
import { createDatabase } from './models/Database';
import { DeviceModel } from './models/Device';
import { LogModel } from './models/Log';
import { FirmwareModel } from './models/Firmware';
import { UserModel } from './models/User';
import { DeviceKeyModel } from './models/DeviceKey';
import { OrganizationModel } from './models/Organization';
import { ClusterModel } from './models/Cluster';
import { AuditLogModel } from './models/AuditLog';
import { ApiKeyModel } from './models/ApiKey';
import { WebhookModel } from './models/Webhook';
import { DeviceRegistry } from './services/DeviceRegistry';
import { LogIngestionService } from './services/LogIngestion';
import { FirmwareDistributionService } from './services/FirmwareDistribution';
import { DashboardService } from './services/DashboardService';
import { AuditService } from './services/AuditService';
import { WebhookDispatcher } from './services/WebhookDispatcher';
import { QuotaService } from './services/QuotaService';
import { PlatformDashboardService } from './services/PlatformDashboardService';
import { AuthService, RateLimiter, FailedLoginTracker } from './middleware/auth';
import { createAuthMiddleware, requireOrgAccess, requirePlatformAdmin } from './middleware/authMiddleware';
import { createDeviceRoutes } from './routes/devices';
import { createLogRoutes } from './routes/logs';
import { createFirmwareRoutes } from './routes/firmware';
import { createAuthRoutes } from './routes/auth';
import { createDashboardRoutes } from './routes/dashboard';
import { createPlatformRoutes } from './routes/platform';
import { createOrgRoutes } from './routes/org';
import { createClusterRoutes } from './routes/clusters';

const PORT = parseInt(process.env.PORT || '3000', 10);
const DB_PATH = process.env.DB_PATH || ':memory:';

// JWT secret enforcement: require in production, warn in dev
const envJwtSecret = process.env.JWT_SECRET;
if (!envJwtSecret && process.env.NODE_ENV === 'production') {
  console.error('FATAL: JWT_SECRET environment variable is required in production');
  process.exit(1);
}
if (!envJwtSecret) {
  console.warn('WARNING: Using default JWT secret — NOT safe for production');
}
const JWT_SECRET = envJwtSecret || 'syncv-dev-secret-change-in-production';

export function createApp(dbPath?: string): { app: express.Express; db: Database.Database } {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());

  // Initialize database and models
  const db = createDatabase(dbPath ?? DB_PATH);
  const deviceModel = new DeviceModel(db);
  const logModel = new LogModel(db);
  const firmwareModel = new FirmwareModel(db);
  const userModel = new UserModel(db);
  const deviceKeyModel = new DeviceKeyModel(db);
  const orgModel = new OrganizationModel(db);
  const clusterModel = new ClusterModel(db);
  const auditLogModel = new AuditLogModel(db);
  const apiKeyModel = new ApiKeyModel(db);
  const webhookModel = new WebhookModel(db);

  // Initialize services
  const deviceRegistry = new DeviceRegistry(deviceModel);
  const logIngestion = new LogIngestionService(logModel, deviceKeyModel);
  const firmwareDistribution = new FirmwareDistributionService(firmwareModel);
  const dashboardService = new DashboardService(deviceModel, logModel, firmwareModel, clusterModel);
  const authService = new AuthService(JWT_SECRET, '1h');
  const rateLimiter = new RateLimiter(100, 60000);
  const loginTracker = new FailedLoginTracker(5, 15 * 60 * 1000, 15 * 60 * 1000);
  const auditService = new AuditService(auditLogModel);
  const webhookDispatcher = new WebhookDispatcher(webhookModel);
  const quotaService = new QuotaService(orgModel, deviceModel, logModel, userModel, webhookDispatcher);
  const platformDashboard = new PlatformDashboardService(orgModel, deviceModel, logModel, firmwareModel, userModel);

  // Rate limiting middleware
  app.use((req, res, next) => {
    const clientId = req.ip || req.socket.remoteAddress || 'unknown';
    if (!rateLimiter.isAllowed(clientId)) {
      return res.status(429).json({ error: 'Too many requests' });
    }
    next();
  });

  // Auth middleware factory (supports JWT + API key)
  const requireAuth = createAuthMiddleware(authService, apiKeyModel);

  // Public routes
  app.use('/api/auth', createAuthRoutes(authService, userModel, orgModel, loginTracker));

  // Platform admin routes
  app.use('/api/platform', requireAuth('platform_admin'), requirePlatformAdmin, createPlatformRoutes(orgModel, platformDashboard, auditService, userModel, authService, clusterModel));

  // Org admin routes
  app.use('/api/org', requireAuth('org_admin'), createOrgRoutes(userModel, apiKeyModel, webhookModel, auditService, quotaService, authService));

  // Cluster routes (viewer+ but org-scoped)
  app.use('/api/clusters', requireAuth('viewer'), createClusterRoutes(clusterModel, deviceModel, dashboardService, auditService));

  // Protected routes (org-scoped)
  app.use('/api/devices', requireAuth('viewer'), createDeviceRoutes(deviceRegistry, deviceKeyModel, quotaService, auditService, webhookDispatcher));
  app.use('/api/logs', requireAuth('viewer'), requireOrgAccess, createLogRoutes(logIngestion, auditService, webhookDispatcher, quotaService));
  app.use('/api/firmware', requireAuth('viewer'), requireOrgAccess, createFirmwareRoutes(firmwareDistribution, auditService, webhookDispatcher));
  app.use('/api/dashboard', requireAuth('viewer'), requireOrgAccess, createDashboardRoutes(dashboardService));

  // Dashboard web UI (static files)
  app.use('/dashboard/platform', express.static(path.join(__dirname, '..', 'src', 'public', 'platform')));
  app.use('/dashboard', express.static(path.join(__dirname, '..', 'src', 'public')));
  app.get('/', (_req, res) => { res.redirect('/dashboard/'); });

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
