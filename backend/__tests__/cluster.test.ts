import { createDatabase } from '../src/models/Database';
import { ClusterModel } from '../src/models/Cluster';
import { DeviceModel } from '../src/models/Device';
import { OrganizationModel } from '../src/models/Organization';
import Database from 'better-sqlite3';

describe('ClusterModel', () => {
  let db: Database.Database;
  let clusterModel: ClusterModel;
  let deviceModel: DeviceModel;
  let orgModel: OrganizationModel;

  beforeEach(() => {
    db = createDatabase();
    clusterModel = new ClusterModel(db);
    deviceModel = new DeviceModel(db);
    orgModel = new OrganizationModel(db);

    // Create a parent org for FK constraint
    orgModel.create({ id: 'org-1', name: 'Acme Corp', slug: 'acme' });
  });

  afterEach(() => {
    db.close();
  });

  // --- create ---

  test('creates cluster with all fields', () => {
    const cluster = clusterModel.create({
      id: 'cl-1',
      org_id: 'org-1',
      name: 'Production Line A',
      description: 'Main production floor',
    });

    expect(cluster.id).toBe('cl-1');
    expect(cluster.org_id).toBe('org-1');
    expect(cluster.name).toBe('Production Line A');
    expect(cluster.description).toBe('Main production floor');
    expect(cluster.created_at).toBeTruthy();
    expect(cluster.updated_at).toBeTruthy();
  });

  test('creates cluster with default empty description', () => {
    const cluster = clusterModel.create({ id: 'cl-1', org_id: 'org-1', name: 'Cluster' });
    expect(cluster.description).toBe('');
  });

  // --- getById ---

  test('getById returns cluster when it exists', () => {
    clusterModel.create({ id: 'cl-1', org_id: 'org-1', name: 'Cluster A' });

    const cluster = clusterModel.getById('cl-1');
    expect(cluster).toBeDefined();
    expect(cluster!.name).toBe('Cluster A');
  });

  test('getById returns undefined for nonexistent cluster', () => {
    const cluster = clusterModel.getById('nonexistent');
    expect(cluster).toBeUndefined();
  });

  // --- getByOrgId ---

  test('getByOrgId returns clusters for the org', () => {
    clusterModel.create({ id: 'cl-1', org_id: 'org-1', name: 'Cluster A' });
    clusterModel.create({ id: 'cl-2', org_id: 'org-1', name: 'Cluster B' });

    const clusters = clusterModel.getByOrgId('org-1');
    expect(clusters).toHaveLength(2);
  });

  test('getByOrgId returns empty array for org with no clusters', () => {
    const clusters = clusterModel.getByOrgId('org-1');
    expect(clusters).toHaveLength(0);
  });

  test('getByOrgId does not return clusters from other orgs', () => {
    orgModel.create({ id: 'org-2', name: 'Other', slug: 'other' });
    clusterModel.create({ id: 'cl-1', org_id: 'org-1', name: 'Cluster A' });
    clusterModel.create({ id: 'cl-2', org_id: 'org-2', name: 'Cluster B' });

    const clusters = clusterModel.getByOrgId('org-1');
    expect(clusters).toHaveLength(1);
    expect(clusters[0].id).toBe('cl-1');
  });

  // --- update ---

  test('update changes name', () => {
    clusterModel.create({ id: 'cl-1', org_id: 'org-1', name: 'Old Name' });

    const updated = clusterModel.update('cl-1', { name: 'New Name' });
    expect(updated).toBeDefined();
    expect(updated!.name).toBe('New Name');
  });

  test('update changes description', () => {
    clusterModel.create({ id: 'cl-1', org_id: 'org-1', name: 'Cluster', description: 'Old desc' });

    const updated = clusterModel.update('cl-1', { description: 'New desc' });
    expect(updated).toBeDefined();
    expect(updated!.description).toBe('New desc');
  });

  test('update returns undefined for nonexistent cluster', () => {
    const result = clusterModel.update('nonexistent', { name: 'Nope' });
    expect(result).toBeUndefined();
  });

  // --- delete ---

  test('delete removes cluster and returns true', () => {
    clusterModel.create({ id: 'cl-1', org_id: 'org-1', name: 'Cluster' });

    const result = clusterModel.delete('cl-1');
    expect(result).toBe(true);

    const cluster = clusterModel.getById('cl-1');
    expect(cluster).toBeUndefined();
  });

  test('delete returns false for nonexistent cluster', () => {
    const result = clusterModel.delete('nonexistent');
    expect(result).toBe(false);
  });

  test('delete unsets cluster_id on devices in the cluster', () => {
    clusterModel.create({ id: 'cl-1', org_id: 'org-1', name: 'Cluster' });
    deviceModel.register({ id: 'DEV-1', name: 'Device 1', type: 'typeA', org_id: 'org-1' });
    clusterModel.assignDevice('cl-1', 'DEV-1');

    clusterModel.delete('cl-1');

    const device = deviceModel.getById('DEV-1');
    expect(device!.cluster_id).toBeNull();
  });

  // --- assignDevice / removeDevice ---

  test('assignDevice sets cluster_id on device', () => {
    clusterModel.create({ id: 'cl-1', org_id: 'org-1', name: 'Cluster' });
    deviceModel.register({ id: 'DEV-1', name: 'Device 1', type: 'typeA', org_id: 'org-1' });

    const result = clusterModel.assignDevice('cl-1', 'DEV-1');
    expect(result).toBe(true);

    const device = deviceModel.getById('DEV-1');
    expect(device!.cluster_id).toBe('cl-1');
  });

  test('removeDevice unsets cluster_id on device', () => {
    clusterModel.create({ id: 'cl-1', org_id: 'org-1', name: 'Cluster' });
    deviceModel.register({ id: 'DEV-1', name: 'Device 1', type: 'typeA', org_id: 'org-1' });
    clusterModel.assignDevice('cl-1', 'DEV-1');

    const result = clusterModel.removeDevice('DEV-1');
    expect(result).toBe(true);

    const device = deviceModel.getById('DEV-1');
    expect(device!.cluster_id).toBeNull();
  });

  // --- getDevices ---

  test('getDevices returns devices assigned to the cluster', () => {
    clusterModel.create({ id: 'cl-1', org_id: 'org-1', name: 'Cluster' });
    deviceModel.register({ id: 'DEV-1', name: 'Device 1', type: 'typeA', org_id: 'org-1' });
    deviceModel.register({ id: 'DEV-2', name: 'Device 2', type: 'typeB', org_id: 'org-1' });
    deviceModel.register({ id: 'DEV-3', name: 'Device 3', type: 'typeA', org_id: 'org-1' });

    clusterModel.assignDevice('cl-1', 'DEV-1');
    clusterModel.assignDevice('cl-1', 'DEV-2');

    const devices = clusterModel.getDevices('cl-1');
    expect(devices).toHaveLength(2);
    const ids = devices.map(d => d.id);
    expect(ids).toContain('DEV-1');
    expect(ids).toContain('DEV-2');
    expect(ids).not.toContain('DEV-3');
  });

  test('getDevices returns empty array for cluster with no devices', () => {
    clusterModel.create({ id: 'cl-1', org_id: 'org-1', name: 'Cluster' });

    const devices = clusterModel.getDevices('cl-1');
    expect(devices).toHaveLength(0);
  });
});
