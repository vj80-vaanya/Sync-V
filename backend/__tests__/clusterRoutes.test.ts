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

describe('Cluster Routes', () => {
  let app: ReturnType<typeof createApp>['app'];
  let db: Database.Database;
  let authService: AuthService;
  let orgAdminToken: string;
  let viewerToken: string;
  let orgId: string;
  let clusterId: string;

  beforeAll(async () => {
    const result = createApp(':memory:');
    app = result.app;
    db = result.db;

    authService = new AuthService('syncv-dev-secret-change-in-production');

    // Create org
    const orgModel = new OrganizationModel(db);
    orgId = 'cluster-org-1';
    orgModel.create({ id: orgId, name: 'Cluster Org', slug: 'cluster-org', max_devices: 20 });

    // Create org_admin
    const userModel = new UserModel(db);
    userModel.create({
      id: 'cluster-admin-1',
      username: 'clusteradmin',
      password_hash: authService.hashPassword('admin123'),
      role: 'org_admin',
      org_id: orgId,
    });

    orgAdminToken = authService.generateToken({
      userId: 'cluster-admin-1',
      username: 'clusteradmin',
      role: 'org_admin',
      orgId,
    });

    // Create viewer
    userModel.create({
      id: 'cluster-viewer-1',
      username: 'clusterviewer',
      password_hash: authService.hashPassword('viewer123'),
      role: 'viewer',
      org_id: orgId,
    });

    viewerToken = authService.generateToken({
      userId: 'cluster-viewer-1',
      username: 'clusterviewer',
      role: 'viewer',
      orgId,
    });

    // Register some devices via the API
    for (let i = 1; i <= 3; i++) {
      await makeRequest(app, 'POST', '/api/devices', {
        id: `DEV-C${i}`,
        name: `Device C${i}`,
        type: 'sensor',
        status: 'online',
      }, orgAdminToken);
    }
  });

  afterAll(() => {
    db.close();
  });

  it('POST /api/clusters creates cluster', async () => {
    const res = await makeRequest(app, 'POST', '/api/clusters', {
      name: 'Factory Floor A',
      description: 'All sensors on floor A',
    }, orgAdminToken);
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Factory Floor A');
    expect(res.body.org_id).toBe(orgId);
    clusterId = res.body.id;
  });

  it('POST /api/clusters rejects missing name', async () => {
    const res = await makeRequest(app, 'POST', '/api/clusters', {
      description: 'No name provided',
    }, orgAdminToken);
    expect(res.status).toBe(400);
  });

  it('GET /api/clusters lists clusters', async () => {
    const res = await makeRequest(app, 'GET', '/api/clusters', undefined, orgAdminToken);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
    expect(res.body[0].name).toBe('Factory Floor A');
  });

  it('GET /api/clusters/:id returns cluster', async () => {
    const res = await makeRequest(app, 'GET', `/api/clusters/${clusterId}`, undefined, orgAdminToken);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(clusterId);
    expect(res.body.name).toBe('Factory Floor A');
  });

  it('GET /api/clusters/:id returns 404 for unknown cluster', async () => {
    const res = await makeRequest(app, 'GET', '/api/clusters/nonexistent', undefined, orgAdminToken);
    expect(res.status).toBe(404);
  });

  it('PATCH /api/clusters/:id updates cluster', async () => {
    const res = await makeRequest(app, 'PATCH', `/api/clusters/${clusterId}`, {
      name: 'Factory Floor B',
      description: 'Renamed to B',
    }, orgAdminToken);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Factory Floor B');
  });

  it('POST /api/clusters/:id/devices assigns devices', async () => {
    const res = await makeRequest(app, 'POST', `/api/clusters/${clusterId}/devices`, {
      deviceIds: ['DEV-C1', 'DEV-C2'],
    }, orgAdminToken);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /api/clusters/:id/dashboard returns dashboard', async () => {
    const res = await makeRequest(app, 'GET', `/api/clusters/${clusterId}/dashboard`, undefined, orgAdminToken);
    expect(res.status).toBe(200);
    expect(res.body.cluster.id).toBe(clusterId);
    expect(res.body.deviceCount).toBe(2);
    expect(res.body).toHaveProperty('onlineCount');
    expect(res.body).toHaveProperty('recentLogs');
  });

  it('DELETE /api/clusters/:id/devices/:deviceId removes device from cluster', async () => {
    const res = await makeRequest(app, 'DELETE', `/api/clusters/${clusterId}/devices/DEV-C1`, undefined, orgAdminToken);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify device removed from cluster dashboard
    const dashboard = await makeRequest(app, 'GET', `/api/clusters/${clusterId}/dashboard`, undefined, orgAdminToken);
    expect(dashboard.body.deviceCount).toBe(1);
  });

  it('viewer cannot create clusters (403)', async () => {
    const res = await makeRequest(app, 'POST', '/api/clusters', {
      name: 'Unauthorized Cluster',
    }, viewerToken);
    expect(res.status).toBe(403);
  });

  it('viewer cannot update clusters (403)', async () => {
    const res = await makeRequest(app, 'PATCH', `/api/clusters/${clusterId}`, {
      name: 'Hack',
    }, viewerToken);
    expect(res.status).toBe(403);
  });

  it('viewer cannot delete clusters (403)', async () => {
    const res = await makeRequest(app, 'DELETE', `/api/clusters/${clusterId}`, undefined, viewerToken);
    expect(res.status).toBe(403);
  });

  it('DELETE /api/clusters/:id deletes cluster', async () => {
    const res = await makeRequest(app, 'DELETE', `/api/clusters/${clusterId}`, undefined, orgAdminToken);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify it is gone
    const listRes = await makeRequest(app, 'GET', '/api/clusters', undefined, orgAdminToken);
    expect(listRes.body.length).toBe(0);
  });
});
