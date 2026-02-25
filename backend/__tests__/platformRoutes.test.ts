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

describe('Platform Admin Routes', () => {
  let app: ReturnType<typeof createApp>['app'];
  let db: Database.Database;
  let authService: AuthService;
  let platformToken: string;
  let viewerToken: string;
  let createdOrgId: string;

  beforeAll(async () => {
    const result = createApp(':memory:');
    app = result.app;
    db = result.db;

    authService = new AuthService('syncv-dev-secret-change-in-production');

    // Create a platform_admin user (no org_id)
    const userModel = new UserModel(db);
    userModel.create({
      id: 'platform-admin-1',
      username: 'platformadmin',
      password_hash: await authService.hashPassword('admin123'),
      role: 'platform_admin',
    });

    platformToken = authService.generateToken({
      userId: 'platform-admin-1',
      username: 'platformadmin',
      role: 'platform_admin',
    });

    // Create an org and viewer user for non-admin tests
    const orgModel = new OrganizationModel(db);
    orgModel.create({ id: 'viewer-org', name: 'Viewer Org', slug: 'viewer-org' });

    userModel.create({
      id: 'viewer-user-1',
      username: 'vieweruser',
      password_hash: await authService.hashPassword('viewer123'),
      role: 'viewer',
      org_id: 'viewer-org',
    });

    viewerToken = authService.generateToken({
      userId: 'viewer-user-1',
      username: 'vieweruser',
      role: 'viewer',
      orgId: 'viewer-org',
    });
  });

  afterAll(() => {
    db.close();
  });

  it('GET /api/platform/overview returns stats', async () => {
    const res = await makeRequest(app, 'GET', '/api/platform/overview', undefined, platformToken);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalOrgs');
    expect(res.body).toHaveProperty('activeOrgs');
    expect(res.body).toHaveProperty('totalDevices');
    expect(res.body).toHaveProperty('totalUsers');
    expect(res.body).toHaveProperty('totalLogs');
    expect(res.body).toHaveProperty('planDistribution');
  });

  it('POST /api/platform/organizations creates an org', async () => {
    const res = await makeRequest(app, 'POST', '/api/platform/organizations', {
      name: 'Acme Corp',
      slug: 'acme-corp',
      plan: 'pro',
    }, platformToken);
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Acme Corp');
    expect(res.body.slug).toBe('acme-corp');
    expect(res.body.plan).toBe('pro');
    createdOrgId = res.body.id;
  });

  it('POST /api/platform/organizations rejects duplicate slug', async () => {
    const res = await makeRequest(app, 'POST', '/api/platform/organizations', {
      name: 'Another Corp',
      slug: 'acme-corp',
    }, platformToken);
    expect(res.status).toBe(409);
  });

  it('POST /api/platform/organizations rejects missing fields', async () => {
    const res = await makeRequest(app, 'POST', '/api/platform/organizations', {
      name: 'No Slug',
    }, platformToken);
    expect(res.status).toBe(400);
  });

  it('GET /api/platform/organizations lists orgs', async () => {
    const res = await makeRequest(app, 'GET', '/api/platform/organizations', undefined, platformToken);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/platform/organizations/:id returns org detail', async () => {
    const res = await makeRequest(app, 'GET', `/api/platform/organizations/${createdOrgId}`, undefined, platformToken);
    expect(res.status).toBe(200);
    expect(res.body.org.name).toBe('Acme Corp');
    expect(res.body).toHaveProperty('deviceCount');
    expect(res.body).toHaveProperty('userCount');
  });

  it('GET /api/platform/organizations/:id returns 404 for unknown org', async () => {
    const res = await makeRequest(app, 'GET', '/api/platform/organizations/nonexistent', undefined, platformToken);
    expect(res.status).toBe(404);
  });

  it('PATCH /api/platform/organizations/:id updates org', async () => {
    const res = await makeRequest(app, 'PATCH', `/api/platform/organizations/${createdOrgId}`, {
      name: 'Acme Corp Updated',
      plan: 'enterprise',
    }, platformToken);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Acme Corp Updated');
    expect(res.body.plan).toBe('enterprise');
  });

  it('PATCH /api/platform/organizations/:id/suspend suspends org', async () => {
    const res = await makeRequest(app, 'PATCH', `/api/platform/organizations/${createdOrgId}/suspend`, {}, platformToken);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify it is suspended
    const detail = await makeRequest(app, 'GET', `/api/platform/organizations/${createdOrgId}`, undefined, platformToken);
    expect(detail.body.org.status).toBe('suspended');
  });

  it('PATCH /api/platform/organizations/:id/activate activates org', async () => {
    const res = await makeRequest(app, 'PATCH', `/api/platform/organizations/${createdOrgId}/activate`, {}, platformToken);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const detail = await makeRequest(app, 'GET', `/api/platform/organizations/${createdOrgId}`, undefined, platformToken);
    expect(detail.body.org.status).toBe('active');
  });

  it('GET /api/platform/audit returns structural events', async () => {
    const res = await makeRequest(app, 'GET', '/api/platform/audit', undefined, platformToken);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // We created an org and updated it, so there should be audit entries
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /api/platform/organizations/:id/users creates user in org', async () => {
    const res = await makeRequest(app, 'POST', `/api/platform/organizations/${createdOrgId}/users`, {
      username: 'orguser1',
      password: 'pass123',
      role: 'technician',
    }, platformToken);
    expect(res.status).toBe(201);
    expect(res.body.username).toBe('orguser1');
    expect(res.body.role).toBe('technician');
    expect(res.body.org_id).toBe(createdOrgId);
  });

  it('POST /api/platform/organizations/:id/users rejects duplicate username', async () => {
    const res = await makeRequest(app, 'POST', `/api/platform/organizations/${createdOrgId}/users`, {
      username: 'orguser1',
      password: 'pass123',
    }, platformToken);
    expect(res.status).toBe(409);
  });

  it('non-platform_admin gets 403 on platform routes', async () => {
    const res = await makeRequest(app, 'GET', '/api/platform/overview', undefined, viewerToken);
    expect(res.status).toBe(403);
  });

  it('platform admin cannot access /api/logs (gets 403 from requireOrgAccess)', async () => {
    const res = await makeRequest(app, 'GET', '/api/logs', undefined, platformToken);
    expect(res.status).toBe(403);
  });

  it('platform admin cannot access /api/firmware (gets 403)', async () => {
    const res = await makeRequest(app, 'GET', '/api/firmware', undefined, platformToken);
    expect(res.status).toBe(403);
  });

  it('DELETE /api/platform/organizations/:id deletes org', async () => {
    // Create org directly via model to avoid audit log FK references
    const orgModel = new OrganizationModel(db);
    const deleteId = 'deletable-org-id';
    orgModel.create({ id: deleteId, name: 'Deletable Org', slug: 'deletable-org' });

    const res = await makeRequest(app, 'DELETE', `/api/platform/organizations/${deleteId}`, undefined, platformToken);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify it is gone
    const detail = await makeRequest(app, 'GET', `/api/platform/organizations/${deleteId}`, undefined, platformToken);
    expect(detail.status).toBe(404);
  });
});
