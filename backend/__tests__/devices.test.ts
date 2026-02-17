import { createDatabase } from '../src/models/Database';
import { DeviceModel } from '../src/models/Device';
import { DeviceRegistry } from '../src/services/DeviceRegistry';
import Database from 'better-sqlite3';

describe('Device Registry', () => {
  let db: Database.Database;
  let registry: DeviceRegistry;

  beforeEach(() => {
    db = createDatabase();
    const model = new DeviceModel(db);
    registry = new DeviceRegistry(model);
  });

  afterEach(() => {
    db.close();
  });

  test('registers a new device', () => {
    const device = registry.register({
      id: 'DEV001',
      name: 'Pump Controller A',
      type: 'typeA',
      status: 'online',
      firmware_version: '1.0.0',
      metadata: { location: 'Building A', floor: '3' },
    });

    expect(device.id).toBe('DEV001');
    expect(device.name).toBe('Pump Controller A');
    expect(device.type).toBe('typeA');
    expect(device.status).toBe('online');
    expect(device.firmware_version).toBe('1.0.0');
  });

  test('retrieves a device by ID', () => {
    registry.register({ id: 'DEV001', name: 'Device 1', type: 'typeA' });

    const device = registry.getDevice('DEV001');
    expect(device).toBeDefined();
    expect(device!.id).toBe('DEV001');
  });

  test('updates device metadata', () => {
    registry.register({ id: 'DEV001', name: 'Device 1', type: 'typeA', metadata: { a: '1' } });

    const updated = registry.updateMetadata('DEV001', { b: '2', c: '3' });
    expect(updated).toBe(true);

    const device = registry.getDevice('DEV001');
    const meta = JSON.parse(device!.metadata);
    expect(meta.a).toBe('1');
    expect(meta.b).toBe('2');
    expect(meta.c).toBe('3');
  });

  test('queries devices by type', () => {
    registry.register({ id: 'DEV001', name: 'A1', type: 'typeA' });
    registry.register({ id: 'DEV002', name: 'A2', type: 'typeA' });
    registry.register({ id: 'DEV003', name: 'B1', type: 'typeB' });

    const typeA = registry.getDevicesByType('typeA');
    expect(typeA).toHaveLength(2);

    const typeB = registry.getDevicesByType('typeB');
    expect(typeB).toHaveLength(1);
  });

  test('queries devices by status', () => {
    registry.register({ id: 'DEV001', name: 'D1', type: 'typeA', status: 'online' });
    registry.register({ id: 'DEV002', name: 'D2', type: 'typeA', status: 'offline' });
    registry.register({ id: 'DEV003', name: 'D3', type: 'typeB', status: 'online' });

    const online = registry.getDevicesByStatus('online');
    expect(online).toHaveLength(2);

    const offline = registry.getDevicesByStatus('offline');
    expect(offline).toHaveLength(1);
  });

  test('stores heterogeneous metadata', () => {
    registry.register({
      id: 'DEV001',
      name: 'Complex Device',
      type: 'typeA',
      metadata: { temp: '45.5', rpm: '3000', serial: 'SN-12345', custom_field: 'value' },
    });

    const device = registry.getDevice('DEV001');
    const meta = JSON.parse(device!.metadata);
    expect(meta.temp).toBe('45.5');
    expect(meta.rpm).toBe('3000');
    expect(meta.serial).toBe('SN-12345');
    expect(meta.custom_field).toBe('value');
  });

  test('updates device status', () => {
    registry.register({ id: 'DEV001', name: 'D1', type: 'typeA', status: 'unknown' });

    registry.updateStatus('DEV001', 'online');
    const device = registry.getDevice('DEV001');
    expect(device!.status).toBe('online');
  });

  test('returns undefined for non-existent device', () => {
    const device = registry.getDevice('NONEXISTENT');
    expect(device).toBeUndefined();
  });
});
