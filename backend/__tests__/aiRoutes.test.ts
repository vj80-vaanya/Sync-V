import { createApp } from '../src/index';
import { UserModel } from '../src/models/User';
import { OrganizationModel } from '../src/models/Organization';
import { DeviceModel } from '../src/models/Device';
import { LogModel } from '../src/models/Log';
import { AnomalyModel } from '../src/models/Anomaly';
import { AuthService } from '../src/middleware/auth';
import Database from 'better-sqlite3';

describe('AI Routes', () => {
  let app: ReturnType<typeof createApp>['app'];
  let db: Database.Database;
  let authService: AuthService;
  let token: string;
  let orgId: string;

  beforeAll(async () => {
    const result = createApp(':memory:');
    app = result.app;
    db = result.db;

    authService = new AuthService('syncv-dev-secret-change-in-production');
    orgId = 'test-org-1';

    const orgModel = new OrganizationModel(db);
    orgModel.create({ id: orgId, name: 'Test Org', slug: 'test-org' });

    const userModel = new UserModel(db);
    userModel.create({
      id: 'user-admin',
      username: 'admin',
      password_hash: await authService.hashPassword('admin123'),
      role: 'org_admin',
      org_id: orgId,
    });

    token = authService.generateToken({
      userId: 'user-admin',
      username: 'admin',
      role: 'org_admin',
      orgId,
    });

    // Set up test data
    const deviceModel = new DeviceModel(db);
    deviceModel.register({ id: 'dev-001', name: 'Pump A', type: 'pump', status: 'online', org_id: orgId });
    deviceModel.register({ id: 'dev-002', name: 'Motor B', type: 'motor', status: 'offline', org_id: orgId });

    const logModel = new LogModel(db);
    logModel.create({
      id: 'log-001',
      device_id: 'dev-001',
      filename: 'test.log',
      size: 100,
      checksum: 'a'.repeat(64),
      raw_data: 'ERROR: connection timeout\nINFO: running\nWARN: disk low\nINFO: ok\n2024-01-15T10:00:00Z INFO: start',
      org_id: orgId,
    });

    // Create some anomalies
    const anomalyModel = new AnomalyModel(db);
    anomalyModel.create({
      device_id: 'dev-001',
      org_id: orgId,
      type: 'error_spike',
      severity: 'high',
      message: 'Error rate 50% is 5x the historical average',
    });
    anomalyModel.create({
      device_id: 'dev-002',
      org_id: orgId,
      type: 'device_silent',
      severity: 'high',
      message: 'Device has not reported in 48h',
    });
  });

  afterAll(() => {
    db.close();
  });

  function makeRequest(
    method: string,
    path: string,
    body?: any,
    authToken?: string,
  ): Promise<{ status: number; body: any }> {
    return new Promise((resolve) => {
      const http = require('http');
      const server = app.listen(0, () => {
        const addr = server.address() as any;
        const options: any = {
          hostname: '127.0.0.1',
          port: addr.port,
          path,
          method: method.toUpperCase(),
          headers: { 'Content-Type': 'application/json' },
        };
        if (authToken) {
          options.headers['Authorization'] = `Bearer ${authToken}`;
        }

        const req = http.request(options, (res: any) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            server.close();
            const data = Buffer.concat(chunks).toString();
            try {
              resolve({ status: res.statusCode, body: JSON.parse(data) });
            } catch {
              resolve({ status: res.statusCode, body: data });
            }
          });
        });

        if (body) req.write(JSON.stringify(body));
        req.end();
      });
    });
  }

  // --- Anomaly routes ---
  test('GET /api/ai/anomalies returns paginated anomalies for org', async () => {
    const res = await makeRequest('GET', '/api/ai/anomalies', null, token);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page');
    expect(res.body).toHaveProperty('limit');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.total).toBeGreaterThanOrEqual(2);
  });

  test('GET /api/ai/anomalies requires auth', async () => {
    const res = await makeRequest('GET', '/api/ai/anomalies');
    expect(res.status).toBe(401);
  });

  test('GET /api/ai/anomalies/device/:id returns device anomalies', async () => {
    const res = await makeRequest('GET', '/api/ai/anomalies/device/dev-001', null, token);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.every((a: any) => a.device_id === 'dev-001')).toBe(true);
  });

  test('POST /api/ai/anomalies/:id/resolve marks anomaly resolved', async () => {
    // First get the anomalies to find an ID
    const listRes = await makeRequest('GET', '/api/ai/anomalies', null, token);
    const anomalyId = listRes.body.data[0].id;

    const res = await makeRequest('POST', `/api/ai/anomalies/${anomalyId}/resolve`, {}, token);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('POST /api/ai/anomalies/:id/resolve returns 404 for bad id', async () => {
    const res = await makeRequest('POST', '/api/ai/anomalies/nonexistent/resolve', {}, token);
    expect(res.status).toBe(404);
  });

  // --- Health routes ---
  test('GET /api/ai/health returns fleet health', async () => {
    const res = await makeRequest('GET', '/api/ai/health', null, token);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('POST /api/ai/health/refresh computes health for all devices', async () => {
    const res = await makeRequest('POST', '/api/ai/health/refresh', {}, token);
    expect(res.status).toBe(200);
    expect(res.body.updated).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(res.body.results)).toBe(true);
    expect(res.body.results[0]).toHaveProperty('score');
    expect(res.body.results[0]).toHaveProperty('factors');
    expect(res.body.results[0]).toHaveProperty('trend');
  });

  test('GET /api/ai/health/:deviceId returns device health with history', async () => {
    // First refresh to generate health data
    await makeRequest('POST', '/api/ai/health/refresh', {}, token);

    const res = await makeRequest('GET', '/api/ai/health/dev-001', null, token);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('current');
    expect(res.body).toHaveProperty('history');
    expect(Array.isArray(res.body.history)).toBe(true);
  });

  // --- Summary routes ---
  test('GET /api/ai/summary/:logId returns log summary', async () => {
    const res = await makeRequest('GET', '/api/ai/summary/log-001', null, token);
    expect(res.status).toBe(200);
    expect(res.body.lineCount).toBeGreaterThan(0);
    expect(res.body.errorCount).toBeGreaterThanOrEqual(1);
    expect(res.body.warnCount).toBeGreaterThanOrEqual(1);
    expect(res.body).toHaveProperty('errorRate');
    expect(res.body).toHaveProperty('topErrors');
    expect(res.body).toHaveProperty('oneLiner');
  });

  test('GET /api/ai/summary/:logId returns 404 for non-existent log', async () => {
    const res = await makeRequest('GET', '/api/ai/summary/nonexistent', null, token);
    expect(res.status).toBe(404);
  });

  // --- Dashboard AI overview ---
  test('GET /api/dashboard/ai-overview returns combined AI metrics', async () => {
    // First compute health
    await makeRequest('POST', '/api/ai/health/refresh', {}, token);

    const res = await makeRequest('GET', '/api/dashboard/ai-overview', null, token);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('averageHealth');
    expect(res.body).toHaveProperty('unresolvedAnomalies');
    expect(res.body).toHaveProperty('totalAnomaliesThisWeek');
    expect(res.body).toHaveProperty('devicesNeedingAttention');
    expect(res.body).toHaveProperty('healthScores');
    expect(res.body).toHaveProperty('recentAnomalies');
  });

  // --- Log ingest triggers AI hooks ---
  test('POST /api/logs triggers anomaly detection and summarization', async () => {
    const res = await makeRequest('POST', '/api/logs', {
      deviceId: 'dev-001',
      filename: 'ai-test.log',
      size: 50,
      checksum: 'b'.repeat(64),
      rawData: 'ERROR: total failure\nERROR: crash\nINFO: restarting',
    }, token);

    expect(res.status).toBe(201);
    expect(res.body.logId).toBeDefined();

    // Verify summary was generated
    const summaryRes = await makeRequest('GET', `/api/ai/summary/${res.body.logId}`, null, token);
    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.errorCount).toBeGreaterThanOrEqual(2);
  });

  // --- Pagination ---
  test('GET /api/ai/anomalies supports pagination params', async () => {
    const res = await makeRequest('GET', '/api/ai/anomalies?page=1&limit=1', null, token);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(1);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(1);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
  });

  test('GET /api/ai/health supports pagination params', async () => {
    await makeRequest('POST', '/api/ai/health/refresh', {}, token);
    const res = await makeRequest('GET', '/api/ai/health?page=1&limit=1', null, token);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page');
    expect(res.body.page).toBe(1);
  });

  // --- Rate limiting ---
  test('POST /api/ai/health/refresh returns 429 on rapid successive calls', async () => {
    // Prior tests already called /api/ai/health/refresh so cooldown may be active
    // Just call again and expect 429 (within 60s cooldown)
    const res = await makeRequest('POST', '/api/ai/health/refresh', {}, token);
    expect(res.status).toBe(429);
    expect(res.body).toHaveProperty('retryAfter');
  });
});
