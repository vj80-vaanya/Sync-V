import { createApp } from '../src/index';
import { AuthService } from '../src/middleware/auth';
import { UserModel } from '../src/models/User';
import { OrganizationModel } from '../src/models/Organization';
import http from 'http';
import Database from 'better-sqlite3';

describe('Extended Route Coverage', () => {
  let app: ReturnType<typeof createApp>['app'];
  let db: Database.Database;
  let adminToken: string;
  let viewerToken: string;
  let orgId: string;

  beforeAll(async () => {
    const result = createApp(':memory:');
    app = result.app;
    db = result.db;

    const authService = new AuthService('syncv-dev-secret-change-in-production');
    const userModel = new UserModel(db);
    const orgModel = new OrganizationModel(db);

    orgId = 'ext-test-org';
    orgModel.create({ id: orgId, name: 'Ext Test Org', slug: 'ext-test' });

    userModel.create({ id: 'u1', username: 'admin', password_hash: await authService.hashPassword('pass'), role: 'org_admin', org_id: orgId });
    userModel.create({ id: 'u2', username: 'viewer', password_hash: await authService.hashPassword('pass'), role: 'viewer', org_id: orgId });

    adminToken = authService.generateToken({ userId: 'u1', username: 'admin', role: 'org_admin', orgId });
    viewerToken = authService.generateToken({ userId: 'u2', username: 'viewer', role: 'viewer', orgId });
  });

  afterAll(() => { db.close(); });

  function makeRequest(method: string, path: string, body?: any, token?: string): Promise<{ status: number; body: any }> {
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

  // Seed devices
  beforeAll(async () => {
    await makeRequest('POST', '/api/devices', { id: 'DEV-A1', name: 'Device A1', type: 'typeA', status: 'online' }, adminToken);
    await makeRequest('POST', '/api/devices', { id: 'DEV-A2', name: 'Device A2', type: 'typeA', status: 'offline' }, adminToken);
    await makeRequest('POST', '/api/devices', { id: 'DEV-B1', name: 'Device B1', type: 'typeB', status: 'online' }, adminToken);
  });

  describe('Device filter routes', () => {
    it('GET /api/devices/type/:type returns filtered devices', async () => {
      const res = await makeRequest('GET', '/api/devices/type/typeA', undefined, viewerToken);
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2);
      expect(res.body.every((d: any) => d.type === 'typeA')).toBe(true);
    });

    it('GET /api/devices/status/:status returns filtered devices', async () => {
      const res = await makeRequest('GET', '/api/devices/status/online', undefined, viewerToken);
      expect(res.status).toBe(200);
      expect(res.body.every((d: any) => d.status === 'online')).toBe(true);
    });

    it('GET /api/devices/type/:type returns empty for unknown type', async () => {
      const res = await makeRequest('GET', '/api/devices/type/nonexistent', undefined, viewerToken);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('GET /api/devices/status/:status returns empty for unknown status', async () => {
      const res = await makeRequest('GET', '/api/devices/status/nonexistent', undefined, viewerToken);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('Device registration conflicts', () => {
    it('POST duplicate device ID returns 409', async () => {
      const res = await makeRequest('POST', '/api/devices', { id: 'DEV-A1', name: 'Dup', type: 'typeC' }, adminToken);
      expect(res.status).toBe(409);
      expect(res.body.error).toContain('already registered');
    });

    it('POST with invalid device ID returns 400', async () => {
      const res = await makeRequest('POST', '/api/devices', { id: 'bad..id', name: 'Bad', type: 'typeA' }, adminToken);
      expect(res.status).toBe(400);
    });
  });

  describe('Update operations on missing devices', () => {
    it('PATCH metadata on nonexistent device returns 404', async () => {
      const res = await makeRequest('PATCH', '/api/devices/GHOST/metadata', { metadata: { a: '1' } }, adminToken);
      expect(res.status).toBe(404);
    });

    it('PATCH status on nonexistent device returns 404', async () => {
      const res = await makeRequest('PATCH', '/api/devices/GHOST/status', { status: 'online' }, adminToken);
      expect(res.status).toBe(404);
    });

    it('PATCH metadata with non-object rejects', async () => {
      const res = await makeRequest('PATCH', '/api/devices/DEV-A1/metadata', { metadata: 'string' }, adminToken);
      expect(res.status).toBe(400);
    });

    it('PATCH status with missing status rejects', async () => {
      const res = await makeRequest('PATCH', '/api/devices/DEV-A1/status', {}, adminToken);
      expect(res.status).toBe(400);
    });
  });

  describe('Firmware route edge cases', () => {
    it('GET /api/firmware/:id returns 404 for nonexistent', async () => {
      const res = await makeRequest('GET', '/api/firmware/nonexistent-id', undefined, viewerToken);
      expect(res.status).toBe(404);
    });

    it('GET /api/firmware/device/:type/latest returns 404 for unknown type', async () => {
      const res = await makeRequest('GET', '/api/firmware/device/unknownType/latest', undefined, viewerToken);
      expect(res.status).toBe(404);
    });

    it('POST firmware rejects missing required fields', async () => {
      const res = await makeRequest('POST', '/api/firmware', { version: '1.0' }, adminToken);
      expect(res.status).toBe(400);
    });

    it('POST firmware rejects invalid SHA256', async () => {
      const res = await makeRequest('POST', '/api/firmware', {
        version: '1.0', deviceType: 'typeA', filename: 'fw.bin', sha256: 'bad'
      }, adminToken);
      expect(res.status).toBe(400);
    });

    it('GET /api/firmware/verify/:id rejects missing sha256 param', async () => {
      const res = await makeRequest('GET', '/api/firmware/verify/some-id', undefined, viewerToken);
      expect(res.status).toBe(400);
    });
  });

  describe('Log route edge cases', () => {
    it('POST log rejects missing required fields', async () => {
      const res = await makeRequest('POST', '/api/logs', { deviceId: 'DEV-A1' }, adminToken);
      expect(res.status).toBe(400);
    });

    it('GET /api/logs/verify/:logId rejects missing checksum param', async () => {
      const res = await makeRequest('GET', '/api/logs/verify/some-log-id', undefined, viewerToken);
      expect(res.status).toBe(400);
    });
  });

  describe('Auth edge cases', () => {
    it('Login with nonexistent user returns 401', async () => {
      const res = await makeRequest('POST', '/api/auth/login', { username: 'ghost', password: 'pass' });
      expect(res.status).toBe(401);
    });

    it('Protected route with no auth header returns 401', async () => {
      const res = await makeRequest('GET', '/api/devices', undefined, undefined);
      expect(res.status).toBe(401);
    });

    it('Non-admin register attempt with viewer token returns 403', async () => {
      const res = await makeRequest('POST', '/api/auth/register', { username: 'new', password: 'pass', role: 'org_admin' }, viewerToken);
      expect(res.status).toBe(403);
    });
  });
});
