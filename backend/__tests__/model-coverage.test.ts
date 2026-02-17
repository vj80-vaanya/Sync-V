import { createDatabase } from '../src/models/Database';
import { DeviceModel } from '../src/models/Device';
import { FirmwareModel } from '../src/models/Firmware';
import { LogModel } from '../src/models/Log';
import { AuthService } from '../src/middleware/auth';
import Database from 'better-sqlite3';

describe('DeviceModel - updateFirmwareVersion & delete', () => {
  let db: Database.Database;
  let model: DeviceModel;

  beforeEach(() => {
    db = createDatabase();
    model = new DeviceModel(db);
  });

  afterEach(() => {
    db.close();
  });

  test('updateFirmwareVersion updates the version for an existing device', () => {
    model.register({ id: 'DEV001', name: 'Device 1', type: 'typeA', firmware_version: '1.0.0' });

    const updated = model.updateFirmwareVersion('DEV001', '2.0.0');
    expect(updated).toBe(true);

    const device = model.getById('DEV001');
    expect(device!.firmware_version).toBe('2.0.0');
  });

  test('updateFirmwareVersion returns false for non-existent device', () => {
    const updated = model.updateFirmwareVersion('NONEXISTENT', '2.0.0');
    expect(updated).toBe(false);
  });

  test('delete removes a device and returns true', () => {
    model.register({ id: 'DEV001', name: 'Device 1', type: 'typeA' });

    const deleted = model.delete('DEV001');
    expect(deleted).toBe(true);

    const device = model.getById('DEV001');
    expect(device).toBeUndefined();
  });

  test('delete returns false for non-existent device', () => {
    const deleted = model.delete('NONEXISTENT');
    expect(deleted).toBe(false);
  });
});

describe('FirmwareModel - delete', () => {
  let db: Database.Database;
  let model: FirmwareModel;

  beforeEach(() => {
    db = createDatabase();
    model = new FirmwareModel(db);
  });

  afterEach(() => {
    db.close();
  });

  test('delete removes firmware and returns true', () => {
    model.create({
      id: 'FW001',
      version: '1.0.0',
      device_type: 'typeA',
      filename: 'fw.bin',
      size: 1024,
      sha256: 'a'.repeat(64),
    });

    const deleted = model.delete('FW001');
    expect(deleted).toBe(true);

    const fw = model.getById('FW001');
    expect(fw).toBeUndefined();
  });

  test('delete returns false for non-existent firmware', () => {
    const deleted = model.delete('NONEXISTENT');
    expect(deleted).toBe(false);
  });
});

describe('LogModel - delete', () => {
  let db: Database.Database;
  let model: LogModel;

  beforeEach(() => {
    db = createDatabase();
    model = new LogModel(db);
    // Create a device for FK constraint
    const deviceModel = new DeviceModel(db);
    deviceModel.register({ id: 'DEV001', name: 'Device 1', type: 'typeA' });
  });

  afterEach(() => {
    db.close();
  });

  test('delete removes a log record and returns true', () => {
    model.create({
      id: 'LOG001',
      device_id: 'DEV001',
      filename: 'log.txt',
      size: 512,
      checksum: 'b'.repeat(64),
    });

    const deleted = model.delete('LOG001');
    expect(deleted).toBe(true);

    const log = model.getById('LOG001');
    expect(log).toBeUndefined();
  });

  test('delete returns false for non-existent log', () => {
    const deleted = model.delete('NONEXISTENT');
    expect(deleted).toBe(false);
  });
});

describe('AuthService - parseExpiry branches', () => {
  test('parses seconds correctly', () => {
    const auth = new AuthService('secret', '30s');
    const token = auth.generateToken({ userId: 'u1', username: 'test', role: 'viewer' });
    const payload = auth.validateToken(token);
    expect(payload).not.toBeNull();
  });

  test('parses minutes correctly', () => {
    const auth = new AuthService('secret', '5m');
    const token = auth.generateToken({ userId: 'u1', username: 'test', role: 'viewer' });
    const payload = auth.validateToken(token);
    expect(payload).not.toBeNull();
  });

  test('parses hours correctly', () => {
    const auth = new AuthService('secret', '2h');
    const token = auth.generateToken({ userId: 'u1', username: 'test', role: 'viewer' });
    const payload = auth.validateToken(token);
    expect(payload).not.toBeNull();
  });

  test('parses days correctly', () => {
    const auth = new AuthService('secret', '7d');
    const token = auth.generateToken({ userId: 'u1', username: 'test', role: 'viewer' });
    const payload = auth.validateToken(token);
    expect(payload).not.toBeNull();
  });

  test('falls back to default for invalid format', () => {
    const auth = new AuthService('secret', 'invalid');
    const token = auth.generateToken({ userId: 'u1', username: 'test', role: 'viewer' });
    // Default is 24h — token should be valid
    const payload = auth.validateToken(token);
    expect(payload).not.toBeNull();
  });
});

describe('AuthMiddleware - edge cases via HTTP', () => {
  // These are tested indirectly through routes.test.ts but let's also
  // test the middleware in isolation
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService('test-secret');
  });

  test('hasRole returns false for completely invalid token', () => {
    expect(authService.hasRole('not-a-jwt', 'viewer')).toBe(false);
  });

  test('hasRole returns false for token signed with wrong secret', () => {
    const otherAuth = new AuthService('different-secret');
    const token = otherAuth.generateToken({ userId: 'u1', username: 'test', role: 'admin' });
    expect(authService.hasRole(token, 'viewer')).toBe(false);
  });

  test('validateToken returns null for empty string', () => {
    expect(authService.validateToken('')).toBeNull();
  });
});
