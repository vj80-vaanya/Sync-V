import { createApp } from '../src/index';
import { AuthService } from '../src/middleware/auth';
import { UserModel } from '../src/models/User';
import { OrganizationModel } from '../src/models/Organization';
import http from 'http';
import Database from 'better-sqlite3';

function makeRequest(app: any, method: string, path: string, body?: any, token?: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const addr = server.address() as any;
      const options: any = { hostname: '127.0.0.1', port: addr.port, path, method, headers: { 'Content-Type': 'application/json' } };
      if (token) options.headers['Authorization'] = `Bearer ${token}`;
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (c: string) => (data += c));
        res.on('end', () => { server.close(); try { resolve({ status: res.statusCode!, body: JSON.parse(data) }); } catch { resolve({ status: res.statusCode!, body: data }); } });
      });
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  });
}

describe('Organization Isolation', () => {
  let app: ReturnType<typeof createApp>['app'];
  let db: Database.Database;
  let authService: AuthService;

  let orgAId: string;
  let orgBId: string;
  let adminAToken: string;
  let adminBToken: string;
  let platformToken: string;

  // Track IDs created for each org
  let deviceAId: string;
  let deviceBId: string;
  let logAId: string;
  let logBId: string;
  let firmwareAId: string;
  let firmwareBId: string;

  beforeAll(async () => {
    const result = createApp(':memory:');
    app = result.app;
    db = result.db;

    authService = new AuthService('syncv-dev-secret-change-in-production');

    const orgModel = new OrganizationModel(db);
    const userModel = new UserModel(db);

    // Create Org A
    orgAId = 'org-a';
    orgModel.create({ id: orgAId, name: 'Org A', slug: 'org-a', max_devices: 10 });

    userModel.create({
      id: 'admin-a',
      username: 'admin-a',
      password_hash: authService.hashPassword('pass-a'),
      role: 'org_admin',
      org_id: orgAId,
    });

    adminAToken = authService.generateToken({
      userId: 'admin-a',
      username: 'admin-a',
      role: 'org_admin',
      orgId: orgAId,
    });

    // Create Org B
    orgBId = 'org-b';
    orgModel.create({ id: orgBId, name: 'Org B', slug: 'org-b', max_devices: 10 });

    userModel.create({
      id: 'admin-b',
      username: 'admin-b',
      password_hash: authService.hashPassword('pass-b'),
      role: 'org_admin',
      org_id: orgBId,
    });

    adminBToken = authService.generateToken({
      userId: 'admin-b',
      username: 'admin-b',
      role: 'org_admin',
      orgId: orgBId,
    });

    // Create platform admin (no org)
    userModel.create({
      id: 'platform-root',
      username: 'platform-root',
      password_hash: authService.hashPassword('root123'),
      role: 'platform_admin',
    });

    platformToken = authService.generateToken({
      userId: 'platform-root',
      username: 'platform-root',
      role: 'platform_admin',
    });

    // --- Seed data for each org ---

    // Devices
    deviceAId = 'DEV-A1';
    const devA = await makeRequest(app, 'POST', '/api/devices', {
      id: deviceAId,
      name: 'Org A Device',
      type: 'pump',
      status: 'online',
    }, adminAToken);
    expect(devA.status).toBe(201);

    deviceBId = 'DEV-B1';
    const devB = await makeRequest(app, 'POST', '/api/devices', {
      id: deviceBId,
      name: 'Org B Device',
      type: 'pump',
      status: 'online',
    }, adminBToken);
    expect(devB.status).toBe(201);

    // Logs
    const logA = await makeRequest(app, 'POST', '/api/logs', {
      deviceId: deviceAId,
      filename: 'log-a.csv',
      size: 100,
      checksum: 'a'.repeat(64),
      rawData: 'org a data',
      vendor: 'Siemens',
      format: 'csv',
    }, adminAToken);
    expect(logA.status).toBe(201);
    logAId = logA.body.logId;

    const logB = await makeRequest(app, 'POST', '/api/logs', {
      deviceId: deviceBId,
      filename: 'log-b.csv',
      size: 200,
      checksum: 'b'.repeat(64),
      rawData: 'org b data',
      vendor: 'ABB',
      format: 'csv',
    }, adminBToken);
    expect(logB.status).toBe(201);
    logBId = logB.body.logId;

    // Firmware
    const fwA = await makeRequest(app, 'POST', '/api/firmware', {
      version: '1.0.0',
      deviceType: 'pump',
      filename: 'fw-a.bin',
      size: 1024,
      sha256: 'c'.repeat(64),
      description: 'Org A firmware',
    }, adminAToken);
    expect(fwA.status).toBe(201);
    firmwareAId = fwA.body.firmwareId;

    const fwB = await makeRequest(app, 'POST', '/api/firmware', {
      version: '1.0.0',
      deviceType: 'pump',
      filename: 'fw-b.bin',
      size: 2048,
      sha256: 'd'.repeat(64),
      description: 'Org B firmware',
    }, adminBToken);
    expect(fwB.status).toBe(201);
    firmwareBId = fwB.body.firmwareId;
  });

  afterAll(() => {
    db.close();
  });

  // --- Cross-org device isolation ---

  it('Org A admin sees only Org A devices', async () => {
    const res = await makeRequest(app, 'GET', '/api/devices', undefined, adminAToken);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].id).toBe(deviceAId);
  });

  it('Org B admin sees only Org B devices', async () => {
    const res = await makeRequest(app, 'GET', '/api/devices', undefined, adminBToken);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].id).toBe(deviceBId);
  });

  it('Org A admin cannot access Org B device by ID (404)', async () => {
    const res = await makeRequest(app, 'GET', `/api/devices/${deviceBId}`, undefined, adminAToken);
    expect(res.status).toBe(404);
  });

  // --- Cross-org log isolation ---

  it('Org A admin sees only Org A logs', async () => {
    const res = await makeRequest(app, 'GET', '/api/logs', undefined, adminAToken);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].id).toBe(logAId);
  });

  it('Org A admin cannot access Org B log by ID (404)', async () => {
    const res = await makeRequest(app, 'GET', `/api/logs/${logBId}`, undefined, adminAToken);
    expect(res.status).toBe(404);
  });

  // --- Cross-org firmware isolation ---

  it('Org A admin sees only Org A firmware', async () => {
    const res = await makeRequest(app, 'GET', '/api/firmware', undefined, adminAToken);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].id).toBe(firmwareAId);
  });

  it('Org A admin cannot access Org B firmware by ID (404)', async () => {
    const res = await makeRequest(app, 'GET', `/api/firmware/${firmwareBId}`, undefined, adminAToken);
    expect(res.status).toBe(404);
  });

  // --- Platform admin restrictions ---

  it('platform admin cannot access /api/logs (403)', async () => {
    const res = await makeRequest(app, 'GET', '/api/logs', undefined, platformToken);
    expect(res.status).toBe(403);
  });

  it('platform admin cannot access /api/firmware (403)', async () => {
    const res = await makeRequest(app, 'GET', '/api/firmware', undefined, platformToken);
    expect(res.status).toBe(403);
  });

  it('platform admin CAN access /api/platform/overview (200)', async () => {
    const res = await makeRequest(app, 'GET', '/api/platform/overview', undefined, platformToken);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalOrgs');
    expect(res.body.totalOrgs).toBeGreaterThanOrEqual(2);
  });

  it('platform admin CAN access /api/platform/organizations (200)', async () => {
    const res = await makeRequest(app, 'GET', '/api/platform/organizations', undefined, platformToken);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
  });

  // --- Quota enforcement ---

  it('6th device on free org (max 5) returns 403 quota exceeded', async () => {
    // Create a free org with max_devices=5
    const orgModel = new OrganizationModel(db);
    const freeOrgId = 'free-quota-org';
    orgModel.create({ id: freeOrgId, name: 'Free Org', slug: 'free-quota-org', plan: 'free', max_devices: 5 });

    const userModel = new UserModel(db);
    userModel.create({
      id: 'free-admin',
      username: 'free-admin',
      password_hash: authService.hashPassword('pass'),
      role: 'org_admin',
      org_id: freeOrgId,
    });

    const freeToken = authService.generateToken({
      userId: 'free-admin',
      username: 'free-admin',
      role: 'org_admin',
      orgId: freeOrgId,
    });

    // Create 5 devices (max for free plan)
    for (let i = 1; i <= 5; i++) {
      const res = await makeRequest(app, 'POST', '/api/devices', {
        id: `FREE-DEV-${i}`,
        name: `Free Device ${i}`,
        type: 'sensor',
      }, freeToken);
      expect(res.status).toBe(201);
    }

    // 6th device should be rejected
    const res = await makeRequest(app, 'POST', '/api/devices', {
      id: 'FREE-DEV-6',
      name: 'Free Device 6',
      type: 'sensor',
    }, freeToken);
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('quota');
  });
});
