import { createDatabase } from '../src/models/Database';
import { DeviceModel } from '../src/models/Device';
import { DeviceKeyModel } from '../src/models/DeviceKey';
import Database from 'better-sqlite3';

describe('DeviceKeyModel', () => {
  let db: Database.Database;
  let deviceKeyModel: DeviceKeyModel;

  beforeEach(() => {
    db = createDatabase();
    const deviceModel = new DeviceModel(db);
    deviceModel.register({ id: 'DEV001', name: 'Test Device 1', type: 'typeA' });
    deviceModel.register({ id: 'DEV002', name: 'Test Device 2', type: 'typeB' });
    deviceKeyModel = new DeviceKeyModel(db);
  });

  afterEach(() => {
    db.close();
  });

  test('sets and gets a PSK', () => {
    const psk = 'a'.repeat(64);
    deviceKeyModel.setPsk('DEV001', psk);
    expect(deviceKeyModel.getPsk('DEV001')).toBe(psk);
  });

  test('returns null for device without PSK', () => {
    expect(deviceKeyModel.getPsk('DEV001')).toBeNull();
  });

  test('returns null for non-existent device', () => {
    expect(deviceKeyModel.getPsk('NONEXIST')).toBeNull();
  });

  test('hasPsk returns true when PSK exists', () => {
    deviceKeyModel.setPsk('DEV001', 'b'.repeat(64));
    expect(deviceKeyModel.hasPsk('DEV001')).toBe(true);
  });

  test('hasPsk returns false when no PSK', () => {
    expect(deviceKeyModel.hasPsk('DEV001')).toBe(false);
  });

  test('updates PSK on conflict (upsert)', () => {
    deviceKeyModel.setPsk('DEV001', 'a'.repeat(64));
    deviceKeyModel.setPsk('DEV001', 'b'.repeat(64));
    expect(deviceKeyModel.getPsk('DEV001')).toBe('b'.repeat(64));
  });

  test('deletes PSK', () => {
    deviceKeyModel.setPsk('DEV001', 'a'.repeat(64));
    const deleted = deviceKeyModel.deletePsk('DEV001');
    expect(deleted).toBe(true);
    expect(deviceKeyModel.getPsk('DEV001')).toBeNull();
  });

  test('delete returns false for non-existent PSK', () => {
    const deleted = deviceKeyModel.deletePsk('DEV001');
    expect(deleted).toBe(false);
  });

  test('stores PSKs independently per device', () => {
    deviceKeyModel.setPsk('DEV001', 'a'.repeat(64));
    deviceKeyModel.setPsk('DEV002', 'b'.repeat(64));
    expect(deviceKeyModel.getPsk('DEV001')).toBe('a'.repeat(64));
    expect(deviceKeyModel.getPsk('DEV002')).toBe('b'.repeat(64));
  });
});
