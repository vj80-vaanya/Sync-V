import { createApp } from '../src/index';
import http from 'http';
import Database from 'better-sqlite3';

describe('Dashboard UI Smoke Tests', () => {
  let app: ReturnType<typeof createApp>['app'];
  let db: Database.Database;

  beforeAll(() => {
    const result = createApp(':memory:');
    app = result.app;
    db = result.db;
  });

  afterAll(() => {
    db.close();
  });

  function fetchPage(path: string): Promise<{ status: number; body: string; headers: any }> {
    return new Promise((resolve) => {
      const server = app.listen(0, () => {
        const addr = server.address() as any;
        http.get(`http://127.0.0.1:${addr.port}${path}`, (res) => {
          let data = '';
          res.on('data', (chunk: string) => (data += chunk));
          res.on('end', () => {
            server.close();
            resolve({ status: res.statusCode!, body: data, headers: res.headers });
          });
        });
      });
    });
  }

  it('GET / redirects to /dashboard/', async () => {
    const res = await fetchPage('/');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/dashboard/');
  });

  it('GET /dashboard/ serves the login page', async () => {
    const res = await fetchPage('/dashboard/');
    expect(res.status).toBe(200);
    expect(res.body).toContain('Sync-V');
    expect(res.body).toContain('login');
  });

  it('GET /dashboard/overview.html serves the overview page', async () => {
    const res = await fetchPage('/dashboard/overview.html');
    expect(res.status).toBe(200);
    expect(res.body).toContain('Fleet Overview');
  });

  it('GET /dashboard/devices.html serves the devices page', async () => {
    const res = await fetchPage('/dashboard/devices.html');
    expect(res.status).toBe(200);
    expect(res.body).toContain('Devices');
  });

  it('GET /dashboard/css/style.css serves the stylesheet', async () => {
    const res = await fetchPage('/dashboard/css/style.css');
    expect(res.status).toBe(200);
    expect(res.body).toContain('--primary');
  });

  it('GET /dashboard/js/auth.js serves the auth script', async () => {
    const res = await fetchPage('/dashboard/js/auth.js');
    expect(res.status).toBe(200);
    expect(res.body).toContain('AUTH');
  });

  it('GET /dashboard/nonexistent.html returns 404', async () => {
    const res = await fetchPage('/dashboard/nonexistent.html');
    expect(res.status).toBe(404);
  });
});
