import { createDatabase } from '../src/models/Database';
import { ApiKeyModel } from '../src/models/ApiKey';
import { OrganizationModel } from '../src/models/Organization';
import Database from 'better-sqlite3';
import crypto from 'crypto';

describe('ApiKeyModel', () => {
  let db: Database.Database;
  let apiKeyModel: ApiKeyModel;

  beforeEach(() => {
    db = createDatabase();
    apiKeyModel = new ApiKeyModel(db);

    // Create a parent org for FK constraint
    const orgModel = new OrganizationModel(db);
    orgModel.create({ id: 'org-1', name: 'Acme', slug: 'acme' });
  });

  afterEach(() => {
    db.close();
  });

  // --- create ---

  test('create returns record and rawKey starting with svk_', () => {
    const { record, rawKey } = apiKeyModel.create({
      org_id: 'org-1',
      name: 'Production Key',
      permissions: ['read', 'write'],
      created_by: 'user-1',
    });

    expect(rawKey).toMatch(/^svk_/);
    expect(rawKey.length).toBeGreaterThan(12);
    expect(record.id).toBeTruthy();
    expect(record.org_id).toBe('org-1');
    expect(record.name).toBe('Production Key');
    expect(record.key_prefix).toBe(rawKey.substring(0, 12));
    expect(record.created_by).toBe('user-1');
    expect(record.created_at).toBeTruthy();
  });

  test('key_hash is SHA256 of rawKey', () => {
    const { record, rawKey } = apiKeyModel.create({
      org_id: 'org-1',
      name: 'Test Key',
      permissions: ['read'],
      created_by: 'user-1',
    });

    const expectedHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    expect(record.key_hash).toBe(expectedHash);
  });

  test('permissions are stored as JSON string', () => {
    const { record } = apiKeyModel.create({
      org_id: 'org-1',
      name: 'Test Key',
      permissions: ['read', 'write', 'admin'],
      created_by: 'user-1',
    });

    const perms = JSON.parse(record.permissions);
    expect(perms).toEqual(['read', 'write', 'admin']);
  });

  // --- getByKeyHash ---

  test('getByKeyHash finds the key by its hash', () => {
    const { record, rawKey } = apiKeyModel.create({
      org_id: 'org-1',
      name: 'Lookup Key',
      permissions: ['read'],
      created_by: 'user-1',
    });

    const hash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const found = apiKeyModel.getByKeyHash(hash);

    expect(found).toBeDefined();
    expect(found!.id).toBe(record.id);
    expect(found!.name).toBe('Lookup Key');
  });

  test('getByKeyHash returns undefined for unknown hash', () => {
    const found = apiKeyModel.getByKeyHash('nonexistent-hash');
    expect(found).toBeUndefined();
  });

  // --- getByOrgId ---

  test('getByOrgId returns keys without key_hash', () => {
    apiKeyModel.create({ org_id: 'org-1', name: 'Key A', permissions: ['read'], created_by: 'user-1' });
    apiKeyModel.create({ org_id: 'org-1', name: 'Key B', permissions: ['write'], created_by: 'user-1' });

    const keys = apiKeyModel.getByOrgId('org-1');
    expect(keys).toHaveLength(2);

    keys.forEach(k => {
      expect(k).not.toHaveProperty('key_hash');
      expect(k.key_prefix).toBeTruthy();
      expect(k.name).toBeTruthy();
    });
  });

  // --- updateLastUsed ---

  test('updateLastUsed changes the timestamp', () => {
    const { record } = apiKeyModel.create({
      org_id: 'org-1',
      name: 'Used Key',
      permissions: ['read'],
      created_by: 'user-1',
    });

    const before = apiKeyModel.getById(record.id);
    apiKeyModel.updateLastUsed(record.id);
    const after = apiKeyModel.getById(record.id);

    expect(after).toBeDefined();
    expect(after!.last_used_at).toBeTruthy();
    // The last_used_at should be set to a datetime value, not the default empty string
    expect(after!.last_used_at).not.toBe('');
  });

  // --- delete ---

  test('delete removes key and returns true', () => {
    const { record } = apiKeyModel.create({
      org_id: 'org-1',
      name: 'Delete Me',
      permissions: ['read'],
      created_by: 'user-1',
    });

    const result = apiKeyModel.delete(record.id);
    expect(result).toBe(true);

    const found = apiKeyModel.getById(record.id);
    expect(found).toBeUndefined();
  });

  test('delete returns false for nonexistent key', () => {
    const result = apiKeyModel.delete('nonexistent');
    expect(result).toBe(false);
  });

  // --- getById ---

  test('getById returns the key record', () => {
    const { record } = apiKeyModel.create({
      org_id: 'org-1',
      name: 'Findable Key',
      permissions: ['read'],
      created_by: 'user-1',
    });

    const found = apiKeyModel.getById(record.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(record.id);
    expect(found!.name).toBe('Findable Key');
    expect(found!.key_hash).toBeTruthy();
  });
});
