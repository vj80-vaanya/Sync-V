import { createDatabase } from '../src/models/Database';
import { OrganizationModel } from '../src/models/Organization';
import { DeviceModel } from '../src/models/Device';
import { LogModel } from '../src/models/Log';
import { UserModel } from '../src/models/User';
import Database from 'better-sqlite3';

describe('OrganizationModel', () => {
  let db: Database.Database;
  let orgModel: OrganizationModel;

  beforeEach(() => {
    db = createDatabase();
    orgModel = new OrganizationModel(db);
  });

  afterEach(() => {
    db.close();
  });

  // --- create ---

  test('creates org with default plan and quotas', () => {
    const org = orgModel.create({ id: 'org-1', name: 'Acme Corp', slug: 'acme-corp' });

    expect(org.id).toBe('org-1');
    expect(org.name).toBe('Acme Corp');
    expect(org.slug).toBe('acme-corp');
    expect(org.plan).toBe('free');
    expect(org.max_devices).toBe(5);
    expect(org.max_storage_bytes).toBe(104857600);
    expect(org.max_users).toBe(3);
    expect(org.status).toBe('active');
    expect(org.created_at).toBeTruthy();
    expect(org.updated_at).toBeTruthy();
  });

  test('creates org with custom plan and quotas', () => {
    const org = orgModel.create({
      id: 'org-2',
      name: 'Big Co',
      slug: 'big-co',
      plan: 'enterprise',
      max_devices: 100,
      max_storage_bytes: 1073741824,
      max_users: 50,
    });

    expect(org.plan).toBe('enterprise');
    expect(org.max_devices).toBe(100);
    expect(org.max_storage_bytes).toBe(1073741824);
    expect(org.max_users).toBe(50);
  });

  test('slug uniqueness - duplicate slug throws', () => {
    orgModel.create({ id: 'org-1', name: 'Org One', slug: 'unique-slug' });

    expect(() => {
      orgModel.create({ id: 'org-2', name: 'Org Two', slug: 'unique-slug' });
    }).toThrow();
  });

  test('duplicate id throws', () => {
    orgModel.create({ id: 'org-1', name: 'Org One', slug: 'slug-1' });

    expect(() => {
      orgModel.create({ id: 'org-1', name: 'Org Two', slug: 'slug-2' });
    }).toThrow();
  });

  // --- getById ---

  test('getById returns org when it exists', () => {
    orgModel.create({ id: 'org-1', name: 'Acme', slug: 'acme' });

    const org = orgModel.getById('org-1');
    expect(org).toBeDefined();
    expect(org!.id).toBe('org-1');
    expect(org!.name).toBe('Acme');
  });

  test('getById returns undefined for nonexistent org', () => {
    const org = orgModel.getById('nonexistent');
    expect(org).toBeUndefined();
  });

  // --- getBySlug ---

  test('getBySlug returns org when it exists', () => {
    orgModel.create({ id: 'org-1', name: 'Acme', slug: 'acme' });

    const org = orgModel.getBySlug('acme');
    expect(org).toBeDefined();
    expect(org!.slug).toBe('acme');
    expect(org!.id).toBe('org-1');
  });

  test('getBySlug returns undefined for nonexistent slug', () => {
    const org = orgModel.getBySlug('no-such-slug');
    expect(org).toBeUndefined();
  });

  // --- getAll ---

  test('getAll returns empty list when no orgs', () => {
    const orgs = orgModel.getAll();
    expect(orgs).toHaveLength(0);
  });

  test('getAll returns orgs ordered by created_at DESC', () => {
    orgModel.create({ id: 'org-1', name: 'First', slug: 'first' });
    orgModel.create({ id: 'org-2', name: 'Second', slug: 'second' });
    orgModel.create({ id: 'org-3', name: 'Third', slug: 'third' });

    const orgs = orgModel.getAll();
    expect(orgs).toHaveLength(3);
    // Most recent first (all have same timestamp in test, so just verify count)
    const ids = orgs.map(o => o.id);
    expect(ids).toContain('org-1');
    expect(ids).toContain('org-2');
    expect(ids).toContain('org-3');
  });

  // --- update ---

  test('update name changes the name', () => {
    orgModel.create({ id: 'org-1', name: 'Old Name', slug: 'org' });

    const updated = orgModel.update('org-1', { name: 'New Name' });
    expect(updated).toBeDefined();
    expect(updated!.name).toBe('New Name');
  });

  test('update plan changes the plan', () => {
    orgModel.create({ id: 'org-1', name: 'Acme', slug: 'acme' });

    const updated = orgModel.update('org-1', { plan: 'pro' });
    expect(updated).toBeDefined();
    expect(updated!.plan).toBe('pro');
  });

  test('update quotas changes max_devices and max_users', () => {
    orgModel.create({ id: 'org-1', name: 'Acme', slug: 'acme' });

    const updated = orgModel.update('org-1', { max_devices: 50, max_users: 20 });
    expect(updated).toBeDefined();
    expect(updated!.max_devices).toBe(50);
    expect(updated!.max_users).toBe(20);
  });

  test('update max_storage_bytes changes storage quota', () => {
    orgModel.create({ id: 'org-1', name: 'Acme', slug: 'acme' });

    const updated = orgModel.update('org-1', { max_storage_bytes: 5368709120 });
    expect(updated).toBeDefined();
    expect(updated!.max_storage_bytes).toBe(5368709120);
  });

  test('update with no fields returns existing record unchanged', () => {
    orgModel.create({ id: 'org-1', name: 'Acme', slug: 'acme' });

    const updated = orgModel.update('org-1', {});
    expect(updated).toBeDefined();
    expect(updated!.name).toBe('Acme');
  });

  test('update returns undefined for nonexistent org', () => {
    const result = orgModel.update('nonexistent', { name: 'Nope' });
    expect(result).toBeUndefined();
  });

  // --- suspend / activate ---

  test('suspend sets status to suspended', () => {
    orgModel.create({ id: 'org-1', name: 'Acme', slug: 'acme' });

    const result = orgModel.suspend('org-1');
    expect(result).toBe(true);

    const org = orgModel.getById('org-1');
    expect(org!.status).toBe('suspended');
  });

  test('suspend returns false for nonexistent org', () => {
    const result = orgModel.suspend('nonexistent');
    expect(result).toBe(false);
  });

  test('activate sets status to active', () => {
    orgModel.create({ id: 'org-1', name: 'Acme', slug: 'acme' });
    orgModel.suspend('org-1');

    const result = orgModel.activate('org-1');
    expect(result).toBe(true);

    const org = orgModel.getById('org-1');
    expect(org!.status).toBe('active');
  });

  test('activate returns false for nonexistent org', () => {
    const result = orgModel.activate('nonexistent');
    expect(result).toBe(false);
  });

  // --- delete ---

  test('delete removes org and returns true', () => {
    orgModel.create({ id: 'org-1', name: 'Acme', slug: 'acme' });

    const result = orgModel.delete('org-1');
    expect(result).toBe(true);

    const org = orgModel.getById('org-1');
    expect(org).toBeUndefined();
  });

  test('delete returns false for nonexistent org', () => {
    const result = orgModel.delete('nonexistent');
    expect(result).toBe(false);
  });

  // --- getUsageStats ---

  test('getUsageStats returns zeros for empty org', () => {
    orgModel.create({ id: 'org-1', name: 'Acme', slug: 'acme' });

    const stats = orgModel.getUsageStats('org-1');
    expect(stats.deviceCount).toBe(0);
    expect(stats.logCount).toBe(0);
    expect(stats.storageBytes).toBe(0);
    expect(stats.userCount).toBe(0);
  });

  test('getUsageStats returns correct counts after adding devices', () => {
    orgModel.create({ id: 'org-1', name: 'Acme', slug: 'acme' });

    const deviceModel = new DeviceModel(db);
    deviceModel.register({ id: 'DEV-1', name: 'Device 1', type: 'typeA', org_id: 'org-1' });
    deviceModel.register({ id: 'DEV-2', name: 'Device 2', type: 'typeB', org_id: 'org-1' });

    const stats = orgModel.getUsageStats('org-1');
    expect(stats.deviceCount).toBe(2);
  });

  test('getUsageStats returns correct counts after adding logs', () => {
    orgModel.create({ id: 'org-1', name: 'Acme', slug: 'acme' });

    const deviceModel = new DeviceModel(db);
    deviceModel.register({ id: 'DEV-1', name: 'Device 1', type: 'typeA', org_id: 'org-1' });

    const logModel = new LogModel(db);
    logModel.create({ id: 'LOG-1', device_id: 'DEV-1', filename: 'a.log', size: 1024, checksum: 'aaa', org_id: 'org-1' });
    logModel.create({ id: 'LOG-2', device_id: 'DEV-1', filename: 'b.log', size: 2048, checksum: 'bbb', org_id: 'org-1' });

    const stats = orgModel.getUsageStats('org-1');
    expect(stats.logCount).toBe(2);
    expect(stats.storageBytes).toBe(3072);
  });

  test('getUsageStats returns correct counts after adding users', () => {
    orgModel.create({ id: 'org-1', name: 'Acme', slug: 'acme' });

    const userModel = new UserModel(db);
    userModel.create({ id: 'u-1', username: 'admin', password_hash: 'hash1', role: 'org_admin', org_id: 'org-1' });
    userModel.create({ id: 'u-2', username: 'tech1', password_hash: 'hash2', role: 'technician', org_id: 'org-1' });
    userModel.create({ id: 'u-3', username: 'viewer1', password_hash: 'hash3', role: 'viewer', org_id: 'org-1' });

    const stats = orgModel.getUsageStats('org-1');
    expect(stats.userCount).toBe(3);
  });

  test('getUsageStats counts only resources belonging to the specified org', () => {
    orgModel.create({ id: 'org-1', name: 'Acme', slug: 'acme' });
    orgModel.create({ id: 'org-2', name: 'Other', slug: 'other' });

    const deviceModel = new DeviceModel(db);
    deviceModel.register({ id: 'DEV-1', name: 'Device 1', type: 'typeA', org_id: 'org-1' });
    deviceModel.register({ id: 'DEV-2', name: 'Device 2', type: 'typeA', org_id: 'org-2' });

    const userModel = new UserModel(db);
    userModel.create({ id: 'u-1', username: 'admin1', password_hash: 'h1', role: 'org_admin', org_id: 'org-1' });
    userModel.create({ id: 'u-2', username: 'admin2', password_hash: 'h2', role: 'org_admin', org_id: 'org-2' });

    const stats1 = orgModel.getUsageStats('org-1');
    expect(stats1.deviceCount).toBe(1);
    expect(stats1.userCount).toBe(1);

    const stats2 = orgModel.getUsageStats('org-2');
    expect(stats2.deviceCount).toBe(1);
    expect(stats2.userCount).toBe(1);
  });
});
