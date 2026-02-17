import { createDatabase } from '../src/models/Database';
import { DeviceModel } from '../src/models/Device';
import { LogModel } from '../src/models/Log';
import { DeviceRegistry } from '../src/services/DeviceRegistry';
import { LogIngestionService } from '../src/services/LogIngestion';

describe('Concurrent Operations', () => {
  it('50 sequential device registrations maintain data integrity', () => {
    const db = createDatabase();
    const registry = new DeviceRegistry(new DeviceModel(db));

    for (let i = 0; i < 50; i++) {
      registry.register({
        id: `DEV-${String(i).padStart(3, '0')}`,
        name: `Device ${i}`,
        type: i % 2 === 0 ? 'typeA' : 'typeB',
      });
    }

    const all = registry.getAllDevices();
    expect(all).toHaveLength(50);
    expect(registry.getDevicesByType('typeA')).toHaveLength(25);
    expect(registry.getDevicesByType('typeB')).toHaveLength(25);
    db.close();
  });

  it('20 log ingestions with unique checksums all succeed', () => {
    const db = createDatabase();
    const deviceModel = new DeviceModel(db);
    deviceModel.register({ id: 'DEV001', name: 'Test', type: 'typeA' });
    const service = new LogIngestionService(new LogModel(db));

    const results = [];
    for (let i = 0; i < 20; i++) {
      results.push(
        service.ingest({
          deviceId: 'DEV001',
          filename: `log_${i}.txt`,
          size: 100 + i,
          checksum: i.toString(16).padStart(64, '0'),
          rawData: `data-${i}`,
        }),
      );
    }

    const successes = results.filter((r) => r.success);
    expect(successes).toHaveLength(20);
    db.close();
  });

  it('sequential metadata updates do not lose data', () => {
    const db = createDatabase();
    const registry = new DeviceRegistry(new DeviceModel(db));
    registry.register({ id: 'DEV001', name: 'Test', type: 'typeA', metadata: {} });

    for (let i = 0; i < 10; i++) {
      registry.updateMetadata('DEV001', { [`key_${i}`]: `value_${i}` });
    }

    const device = registry.getDevice('DEV001');
    const meta = JSON.parse(device!.metadata);
    for (let i = 0; i < 10; i++) {
      expect(meta[`key_${i}`]).toBe(`value_${i}`);
    }
    db.close();
  });
});
