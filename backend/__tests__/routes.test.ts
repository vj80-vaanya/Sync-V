import { createApp } from '../src/index';
import { UserModel } from '../src/models/User';
import { OrganizationModel } from '../src/models/Organization';
import { AuthService } from '../src/middleware/auth';
import Database from 'better-sqlite3';

describe('Backend API Routes', () => {
  let app: ReturnType<typeof createApp>['app'];
  let db: Database.Database;
  let authService: AuthService;
  let adminToken: string;
  let viewerToken: string;
  let orgId: string;

  beforeAll(() => {
    const result = createApp(':memory:');
    app = result.app;
    db = result.db;

    authService = new AuthService('syncv-dev-secret-change-in-production');

    // Create an organization for the test users
    const orgModel = new OrganizationModel(db);
    orgId = 'test-org-1';
    orgModel.create({ id: orgId, name: 'Test Org', slug: 'test-org' });

    // Create test users with org context
    const userModel = new UserModel(db);
    userModel.create({
      id: 'user-admin',
      username: 'admin',
      password_hash: authService.hashPassword('admin123'),
      role: 'org_admin',
      org_id: orgId,
    });
    userModel.create({
      id: 'user-viewer',
      username: 'viewer',
      password_hash: authService.hashPassword('viewer123'),
      role: 'viewer',
      org_id: orgId,
    });

    adminToken = authService.generateToken({
      userId: 'user-admin',
      username: 'admin',
      role: 'org_admin',
      orgId,
    });
    viewerToken = authService.generateToken({
      userId: 'user-viewer',
      username: 'viewer',
      role: 'viewer',
      orgId,
    });
  });

  afterAll(() => {
    db.close();
  });

  function makeRequest(
    method: string,
    path: string,
    body?: any,
    token?: string,
  ): Promise<{ status: number; body: any; headers: any }> {
    return new Promise((resolve) => {
      const http = require('http');
      const server = app.listen(0, () => {
        const addr = server.address() as any;
        const options: any = {
          hostname: '127.0.0.1',
          port: addr.port,
          path,
          method: method.toUpperCase(),
          headers: {
            'Content-Type': 'application/json',
          },
        };
        if (token) {
          options.headers['Authorization'] = `Bearer ${token}`;
        }

        const req = http.request(options, (res: any) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            server.close();
            const data = Buffer.concat(chunks);
            const contentType = res.headers['content-type'] || '';
            try {
              if (contentType.includes('json')) {
                resolve({ status: res.statusCode, body: JSON.parse(data.toString()), headers: res.headers });
              } else {
                resolve({ status: res.statusCode, body: data.toString(), headers: res.headers });
              }
            } catch {
              resolve({ status: res.statusCode, body: data.toString(), headers: res.headers });
            }
          });
        });

        if (body) {
          req.write(JSON.stringify(body));
        }
        req.end();
      });
    });
  }

  describe('Health Check', () => {
    it('should return ok status', async () => {
      const res = await makeRequest('GET', '/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe('Auth Routes', () => {
    it('should login with valid credentials', async () => {
      const res = await makeRequest('POST', '/api/auth/login', {
        username: 'admin',
        password: 'admin123',
      });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.username).toBe('admin');
      expect(res.body.user.role).toBe('org_admin');
    });

    it('should reject invalid credentials', async () => {
      const res = await makeRequest('POST', '/api/auth/login', {
        username: 'admin',
        password: 'wrong',
      });
      expect(res.status).toBe(401);
    });

    it('should reject missing fields', async () => {
      const res = await makeRequest('POST', '/api/auth/login', {
        username: 'admin',
      });
      expect(res.status).toBe(400);
    });

    it('should register a new user via org_admin', async () => {
      const res = await makeRequest('POST', '/api/auth/register', {
        username: 'newuser',
        password: 'pass123',
        role: 'technician',
      }, adminToken);
      expect(res.status).toBe(201);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.username).toBe('newuser');
    });

    it('should reject duplicate username', async () => {
      const res = await makeRequest('POST', '/api/auth/register', {
        username: 'admin',
        password: 'pass123',
      }, adminToken);
      expect(res.status).toBe(409);
    });
  });

  describe('Device Routes', () => {
    it('should require authentication', async () => {
      const res = await makeRequest('GET', '/api/devices');
      expect(res.status).toBe(401);
    });

    it('should list devices (empty initially)', async () => {
      const res = await makeRequest('GET', '/api/devices', undefined, viewerToken);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('should register a device', async () => {
      const res = await makeRequest(
        'POST',
        '/api/devices',
        {
          id: 'PUMP-001',
          name: 'Main Cooling Pump',
          type: 'typeA',
          status: 'online',
          firmware_version: '1.2.0',
          metadata: { location: 'Building A' },
        },
        adminToken,
      );
      expect(res.status).toBe(201);
      expect(res.body.id).toBe('PUMP-001');
    });

    it('should get device by ID', async () => {
      const res = await makeRequest('GET', '/api/devices/PUMP-001', undefined, viewerToken);
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Main Cooling Pump');
    });

    it('should return 404 for nonexistent device', async () => {
      const res = await makeRequest('GET', '/api/devices/NONEXIST', undefined, viewerToken);
      expect(res.status).toBe(404);
    });

    it('should reject invalid device ID', async () => {
      const res = await makeRequest('GET', '/api/devices/invalid..id', undefined, viewerToken);
      expect(res.status).toBe(400);
    });

    it('should reject registration with missing fields', async () => {
      const res = await makeRequest(
        'POST',
        '/api/devices',
        { id: 'DEV-002' },
        adminToken,
      );
      expect(res.status).toBe(400);
    });

    it('should update device metadata', async () => {
      const res = await makeRequest(
        'PATCH',
        '/api/devices/PUMP-001/metadata',
        { metadata: { floor: '3' } },
        adminToken,
      );
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should update device status', async () => {
      const res = await makeRequest(
        'PATCH',
        '/api/devices/PUMP-001/status',
        { status: 'offline' },
        adminToken,
      );
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Log Routes', () => {
    const validChecksum = 'a'.repeat(64);

    it('should list logs (empty initially)', async () => {
      const res = await makeRequest('GET', '/api/logs', undefined, viewerToken);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('should ingest a log', async () => {
      const res = await makeRequest(
        'POST',
        '/api/logs',
        {
          deviceId: 'PUMP-001',
          filename: 'sensor_jan.csv',
          size: 4096,
          checksum: validChecksum,
          rawData: 'timestamp,temp,pressure\n1000,65.2,42.5',
          vendor: 'Siemens',
          format: 'csv',
          metadata: { sensor_type: 'temperature' },
        },
        adminToken,
      );
      expect(res.status).toBe(201);
      expect(res.body.logId).toBeDefined();
    });

    it('should reject invalid checksum', async () => {
      const res = await makeRequest(
        'POST',
        '/api/logs',
        {
          deviceId: 'PUMP-001',
          filename: 'data.csv',
          size: 100,
          checksum: 'invalid',
          rawData: 'data',
        },
        adminToken,
      );
      expect(res.status).toBe(400);
    });

    it('should reject duplicate checksum', async () => {
      const res = await makeRequest(
        'POST',
        '/api/logs',
        {
          deviceId: 'PUMP-001',
          filename: 'sensor_feb.csv',
          size: 4096,
          checksum: validChecksum,
          rawData: 'data',
        },
        adminToken,
      );
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Duplicate');
    });

    it('should get logs by device', async () => {
      const res = await makeRequest('GET', '/api/logs/device/PUMP-001', undefined, viewerToken);
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
    });

    it('should verify log integrity', async () => {
      const logsRes = await makeRequest('GET', '/api/logs', undefined, viewerToken);
      const logId = logsRes.body[0].id;

      const res = await makeRequest(
        'GET',
        `/api/logs/verify/${logId}?checksum=${validChecksum}`,
        undefined,
        viewerToken,
      );
      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
    });

    it('should get full log by ID with raw_data', async () => {
      const logsRes = await makeRequest('GET', '/api/logs', undefined, viewerToken);
      const logId = logsRes.body[0].id;

      const res = await makeRequest('GET', `/api/logs/${logId}`, undefined, viewerToken);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(logId);
      expect(res.body.raw_data).toBe('timestamp,temp,pressure\n1000,65.2,42.5');
      expect(res.body.vendor).toBe('Siemens');
      expect(res.body.format).toBe('csv');
    });

    it('should return 404 for nonexistent log', async () => {
      const res = await makeRequest('GET', '/api/logs/nonexistent-id', undefined, viewerToken);
      expect(res.status).toBe(404);
    });

    it('should download raw content', async () => {
      const logsRes = await makeRequest('GET', '/api/logs', undefined, viewerToken);
      const logId = logsRes.body[0].id;

      const res = await makeRequest('GET', `/api/logs/${logId}/raw`, undefined, viewerToken);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('sensor_jan.csv');
      expect(res.body).toContain('timestamp,temp,pressure');
    });

    it('should return 404 for raw download of nonexistent log', async () => {
      const res = await makeRequest('GET', '/api/logs/nonexistent-id/raw', undefined, viewerToken);
      expect(res.status).toBe(404);
    });

    it('should get filters', async () => {
      const res = await makeRequest('GET', '/api/logs/filters', undefined, viewerToken);
      expect(res.status).toBe(200);
      expect(res.body.vendors).toContain('Siemens');
      expect(res.body.formats).toContain('csv');
    });

    it('list endpoint should not include raw_data', async () => {
      const res = await makeRequest('GET', '/api/logs', undefined, viewerToken);
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0].raw_data).toBeUndefined();
      expect(res.body[0].vendor).toBeDefined();
      expect(res.body[0].format).toBeDefined();
    });

    it('should accept log without vendor/format (backward compatible)', async () => {
      const res = await makeRequest(
        'POST',
        '/api/logs',
        {
          deviceId: 'PUMP-001',
          filename: 'legacy.log',
          size: 50,
          checksum: 'b'.repeat(64),
          rawData: 'legacy data',
        },
        adminToken,
      );
      expect(res.status).toBe(201);

      const logRes = await makeRequest('GET', `/api/logs/${res.body.logId}`, undefined, viewerToken);
      expect(logRes.body.vendor).toBe('unknown');
      expect(logRes.body.format).toBe('text');
    });
  });

  describe('Firmware Routes', () => {
    const validSha = 'c'.repeat(64);

    it('should list firmware (empty initially)', async () => {
      const res = await makeRequest('GET', '/api/firmware', undefined, viewerToken);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('should upload firmware as org_admin', async () => {
      const res = await makeRequest(
        'POST',
        '/api/firmware',
        {
          version: '2.0.0',
          deviceType: 'typeA',
          filename: 'fw_v2.bin',
          size: 10240,
          sha256: validSha,
          description: 'Security patch',
        },
        adminToken,
      );
      expect(res.status).toBe(201);
      expect(res.body.firmwareId).toBeDefined();
    });

    it('should reject firmware upload as viewer', async () => {
      const res = await makeRequest(
        'POST',
        '/api/firmware',
        {
          version: '2.1.0',
          deviceType: 'typeA',
          filename: 'fw_v2.1.bin',
          size: 10240,
          sha256: 'd'.repeat(64),
          description: 'test',
        },
        viewerToken,
      );
      expect(res.status).toBe(403);
    });

    it('should get firmware by device type', async () => {
      const res = await makeRequest('GET', '/api/firmware/device/typeA', undefined, viewerToken);
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
    });

    it('should get latest firmware for device type', async () => {
      const res = await makeRequest(
        'GET',
        '/api/firmware/device/typeA/latest',
        undefined,
        viewerToken,
      );
      expect(res.status).toBe(200);
      expect(res.body.version).toBe('2.0.0');
    });

    it('should verify firmware download', async () => {
      const fwRes = await makeRequest('GET', '/api/firmware', undefined, viewerToken);
      const fwId = fwRes.body[0].id;

      const res = await makeRequest(
        'GET',
        `/api/firmware/verify/${fwId}?sha256=${validSha}`,
        undefined,
        viewerToken,
      );
      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
    });
  });

  describe('Dashboard Routes', () => {
    it('should get fleet overview', async () => {
      const res = await makeRequest('GET', '/api/dashboard/overview', undefined, viewerToken);
      expect(res.status).toBe(200);
      expect(res.body.totalDevices).toBe(1);
      expect(res.body.totalLogs).toBe(2);
    });

    it('should get device detail', async () => {
      const res = await makeRequest(
        'GET',
        '/api/dashboard/device/PUMP-001',
        undefined,
        viewerToken,
      );
      expect(res.status).toBe(200);
      expect(res.body.device.id).toBe('PUMP-001');
      expect(res.body.logCount).toBe(2);
    });

    it('should return 404 for unknown device detail', async () => {
      const res = await makeRequest(
        'GET',
        '/api/dashboard/device/UNKNOWN',
        undefined,
        viewerToken,
      );
      expect(res.status).toBe(404);
    });

    it('should get firmware summary', async () => {
      const res = await makeRequest('GET', '/api/dashboard/firmware', undefined, viewerToken);
      expect(res.status).toBe(200);
      expect(res.body.totalFirmwarePackages).toBe(1);
    });

    it('should get log history', async () => {
      const res = await makeRequest('GET', '/api/dashboard/logs', undefined, viewerToken);
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2);
    });
  });
});
