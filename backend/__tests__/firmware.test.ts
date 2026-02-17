import { createDatabase } from '../src/models/Database';
import { FirmwareModel } from '../src/models/Firmware';
import { FirmwareDistributionService } from '../src/services/FirmwareDistribution';
import Database from 'better-sqlite3';

describe('Firmware Distribution', () => {
  let db: Database.Database;
  let fwService: FirmwareDistributionService;

  beforeEach(() => {
    db = createDatabase();
    const model = new FirmwareModel(db);
    fwService = new FirmwareDistributionService(model);
  });

  afterEach(() => {
    db.close();
  });

  test('uploads signed firmware package', () => {
    const result = fwService.upload({
      version: '2.0.0',
      deviceType: 'typeA',
      filename: 'fw_typeA_v2.0.0.bin',
      size: 10240,
      sha256: 'a'.repeat(64),
      description: 'Bug fixes',
    });

    expect(result.success).toBe(true);
    expect(result.firmwareId).toBeTruthy();
  });

  test('serves firmware list for device type', () => {
    fwService.upload({
      version: '1.0.0',
      deviceType: 'typeA',
      filename: 'fw_v1.bin',
      size: 5000,
      sha256: 'a'.repeat(64),
    });
    fwService.upload({
      version: '2.0.0',
      deviceType: 'typeA',
      filename: 'fw_v2.bin',
      size: 6000,
      sha256: 'b'.repeat(64),
    });
    fwService.upload({
      version: '1.0.0',
      deviceType: 'typeB',
      filename: 'fw_b_v1.bin',
      size: 4000,
      sha256: 'c'.repeat(64),
    });

    const typeAFirmware = fwService.getAvailableForDevice('typeA');
    expect(typeAFirmware).toHaveLength(2);

    const typeBFirmware = fwService.getAvailableForDevice('typeB');
    expect(typeBFirmware).toHaveLength(1);
  });

  test('tracks version per device type', () => {
    fwService.upload({
      version: '1.0.0',
      deviceType: 'typeA',
      filename: 'fw_v1.bin',
      size: 5000,
      sha256: 'a'.repeat(64),
    });
    fwService.upload({
      version: '2.0.0',
      deviceType: 'typeA',
      filename: 'fw_v2.bin',
      size: 6000,
      sha256: 'b'.repeat(64),
    });

    const latest = fwService.getLatestForDevice('typeA');
    expect(latest).toBeDefined();
    expect(latest!.version).toBe('2.0.0');
  });

  test('verifies hash on download', () => {
    const sha = 'd'.repeat(64);
    const result = fwService.upload({
      version: '1.0.0',
      deviceType: 'typeA',
      filename: 'fw.bin',
      size: 1000,
      sha256: sha,
    });

    expect(fwService.verifyDownload(result.firmwareId!, sha)).toBe(true);
    expect(fwService.verifyDownload(result.firmwareId!, 'wrong')).toBe(false);
  });

  test('rejects firmware with invalid hash', () => {
    const result = fwService.upload({
      version: '1.0.0',
      deviceType: 'typeA',
      filename: 'fw.bin',
      size: 1000,
      sha256: 'too_short',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('SHA256');
  });

  test('rejects firmware with invalid size', () => {
    const result = fwService.upload({
      version: '1.0.0',
      deviceType: 'typeA',
      filename: 'fw.bin',
      size: 0,
      sha256: 'e'.repeat(64),
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('size');
  });

  test('retrieves firmware by ID', () => {
    const result = fwService.upload({
      version: '3.0.0',
      deviceType: 'typeC',
      filename: 'fw_c.bin',
      size: 8000,
      sha256: 'f'.repeat(64),
      description: 'New features',
    });

    const fw = fwService.getFirmware(result.firmwareId!);
    expect(fw).toBeDefined();
    expect(fw!.version).toBe('3.0.0');
    expect(fw!.description).toBe('New features');
  });
});
