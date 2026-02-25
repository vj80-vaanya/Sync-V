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

describe('Org Admin Routes', () => {
  let app: ReturnType<typeof createApp>['app'];
  let db: Database.Database;
  let authService: AuthService;
  let orgAdminToken: string;
  let orgId: string;
  let orgAdminUserId: string;

  beforeAll(async () => {
    const result = createApp(':memory:');
    app = result.app;
    db = result.db;

    authService = new AuthService('syncv-dev-secret-change-in-production');

    // Create org
    const orgModel = new OrganizationModel(db);
    orgId = 'org-test-1';
    orgModel.create({ id: orgId, name: 'Test Org', slug: 'test-org', max_users: 10 });

    // Create org_admin user
    const userModel = new UserModel(db);
    orgAdminUserId = 'org-admin-1';
    userModel.create({
      id: orgAdminUserId,
      username: 'orgadmin',
      password_hash: await authService.hashPassword('admin123'),
      role: 'org_admin',
      org_id: orgId,
    });

    orgAdminToken = authService.generateToken({
      userId: orgAdminUserId,
      username: 'orgadmin',
      role: 'org_admin',
      orgId,
    });
  });

  afterAll(() => {
    db.close();
  });

  // --- User Management ---

  it('GET /api/org/users lists users', async () => {
    const res = await makeRequest(app, 'GET', '/api/org/users', undefined, orgAdminToken);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0]).toHaveProperty('username');
    expect(res.body[0]).toHaveProperty('role');
  });

  it('POST /api/org/users creates user', async () => {
    const res = await makeRequest(app, 'POST', '/api/org/users', {
      username: 'techuser',
      password: 'pass123',
      role: 'technician',
    }, orgAdminToken);
    expect(res.status).toBe(201);
    expect(res.body.username).toBe('techuser');
    expect(res.body.role).toBe('technician');
    expect(res.body.org_id).toBe(orgId);
  });

  it('POST /api/org/users rejects duplicate username', async () => {
    const res = await makeRequest(app, 'POST', '/api/org/users', {
      username: 'techuser',
      password: 'pass123',
    }, orgAdminToken);
    expect(res.status).toBe(409);
  });

  it('POST /api/org/users rejects missing fields', async () => {
    const res = await makeRequest(app, 'POST', '/api/org/users', {
      username: 'nopass',
    }, orgAdminToken);
    expect(res.status).toBe(400);
  });

  let createdUserId: string;
  it('PATCH /api/org/users/:id updates role', async () => {
    // First create a user to update
    const createRes = await makeRequest(app, 'POST', '/api/org/users', {
      username: 'updateme',
      password: 'pass123',
      role: 'viewer',
    }, orgAdminToken);
    createdUserId = createRes.body.id;

    const res = await makeRequest(app, 'PATCH', `/api/org/users/${createdUserId}`, {
      role: 'technician',
    }, orgAdminToken);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('PATCH /api/org/users/:id rejects invalid role', async () => {
    const res = await makeRequest(app, 'PATCH', `/api/org/users/${createdUserId}`, {
      role: 'platform_admin',
    }, orgAdminToken);
    expect(res.status).toBe(400);
  });

  it('DELETE /api/org/users/:id removes user', async () => {
    const res = await makeRequest(app, 'DELETE', `/api/org/users/${createdUserId}`, undefined, orgAdminToken);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('DELETE /api/org/users/:id cannot delete yourself', async () => {
    const res = await makeRequest(app, 'DELETE', `/api/org/users/${orgAdminUserId}`, undefined, orgAdminToken);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Cannot delete yourself');
  });

  // --- API Keys ---

  it('GET /api/org/api-keys lists keys (empty initially)', async () => {
    const res = await makeRequest(app, 'GET', '/api/org/api-keys', undefined, orgAdminToken);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(0);
  });

  let apiKeyId: string;
  it('POST /api/org/api-keys creates key and returns rawKey', async () => {
    const res = await makeRequest(app, 'POST', '/api/org/api-keys', {
      name: 'CI Pipeline Key',
      permissions: ['devices.read', 'logs.write'],
    }, orgAdminToken);
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('CI Pipeline Key');
    expect(res.body.key).toBeDefined();
    expect(res.body.key).toMatch(/^svk_/);
    expect(res.body.key_prefix).toBeDefined();
    apiKeyId = res.body.id;
  });

  it('DELETE /api/org/api-keys/:id revokes key', async () => {
    const res = await makeRequest(app, 'DELETE', `/api/org/api-keys/${apiKeyId}`, undefined, orgAdminToken);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify key list is empty again
    const listRes = await makeRequest(app, 'GET', '/api/org/api-keys', undefined, orgAdminToken);
    expect(listRes.body.length).toBe(0);
  });

  // --- Webhooks ---

  let webhookId: string;
  it('POST /api/org/webhooks creates webhook', async () => {
    const res = await makeRequest(app, 'POST', '/api/org/webhooks', {
      url: 'https://example.com/hook',
      events: ['device.register', 'log.uploaded'],
    }, orgAdminToken);
    expect(res.status).toBe(201);
    expect(res.body.url).toBe('https://example.com/hook');
    expect(res.body.id).toBeDefined();
    webhookId = res.body.id;
  });

  it('POST /api/org/webhooks rejects missing fields', async () => {
    const res = await makeRequest(app, 'POST', '/api/org/webhooks', {
      url: 'https://example.com/hook',
    }, orgAdminToken);
    expect(res.status).toBe(400);
  });

  it('GET /api/org/webhooks lists webhooks', async () => {
    const res = await makeRequest(app, 'GET', '/api/org/webhooks', undefined, orgAdminToken);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    // Secret should not be exposed
    expect(res.body[0].secret).toBeUndefined();
  });

  it('DELETE /api/org/webhooks/:id deletes webhook', async () => {
    const res = await makeRequest(app, 'DELETE', `/api/org/webhooks/${webhookId}`, undefined, orgAdminToken);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // --- Audit & Usage ---

  it('GET /api/org/audit returns audit log', async () => {
    const res = await makeRequest(app, 'GET', '/api/org/audit', undefined, orgAdminToken);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // We performed user create, api key create, webhook create etc.
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/org/usage returns quota usage', async () => {
    const res = await makeRequest(app, 'GET', '/api/org/usage', undefined, orgAdminToken);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('devices');
    expect(res.body).toHaveProperty('storage');
    expect(res.body).toHaveProperty('users');
    expect(res.body.devices).toHaveProperty('used');
    expect(res.body.devices).toHaveProperty('max');
  });
});
