import { createDatabase } from '../src/models/Database';
import { WebhookModel } from '../src/models/Webhook';
import { OrganizationModel } from '../src/models/Organization';
import Database from 'better-sqlite3';

describe('WebhookModel', () => {
  let db: Database.Database;
  let webhookModel: WebhookModel;

  beforeEach(() => {
    db = createDatabase();
    webhookModel = new WebhookModel(db);

    // Create a parent org for FK constraint
    const orgModel = new OrganizationModel(db);
    orgModel.create({ id: 'org-1', name: 'Acme', slug: 'acme' });
  });

  afterEach(() => {
    db.close();
  });

  // --- create ---

  test('creates webhook with all fields', () => {
    const wh = webhookModel.create({
      org_id: 'org-1',
      url: 'https://example.com/webhook',
      secret: 'wh-secret-123',
      events: ['device.online', 'log.uploaded'],
    });

    expect(wh.id).toBeTruthy();
    expect(wh.org_id).toBe('org-1');
    expect(wh.url).toBe('https://example.com/webhook');
    expect(wh.secret).toBe('wh-secret-123');
    expect(JSON.parse(wh.events)).toEqual(['device.online', 'log.uploaded']);
    expect(wh.is_active).toBe(1);
    expect(wh.failure_count).toBe(0);
    expect(wh.created_at).toBeTruthy();
  });

  // --- getByOrgId ---

  test('getByOrgId returns webhooks for the org', () => {
    webhookModel.create({ org_id: 'org-1', url: 'https://a.com/hook', secret: 's1', events: ['device.online'] });
    webhookModel.create({ org_id: 'org-1', url: 'https://b.com/hook', secret: 's2', events: ['log.uploaded'] });

    const hooks = webhookModel.getByOrgId('org-1');
    expect(hooks).toHaveLength(2);
  });

  test('getByOrgId returns empty array for org with no webhooks', () => {
    const hooks = webhookModel.getByOrgId('org-1');
    expect(hooks).toHaveLength(0);
  });

  // --- getByEvent ---

  test('getByEvent returns only webhooks subscribed to that event', () => {
    webhookModel.create({ org_id: 'org-1', url: 'https://a.com/hook', secret: 's1', events: ['device.online', 'log.uploaded'] });
    webhookModel.create({ org_id: 'org-1', url: 'https://b.com/hook', secret: 's2', events: ['log.uploaded'] });
    webhookModel.create({ org_id: 'org-1', url: 'https://c.com/hook', secret: 's3', events: ['firmware.deployed'] });

    const hooks = webhookModel.getByEvent('org-1', 'log.uploaded');
    expect(hooks).toHaveLength(2);
    hooks.forEach(h => {
      const events: string[] = JSON.parse(h.events);
      expect(events).toContain('log.uploaded');
    });
  });

  test('getByEvent excludes inactive webhooks', () => {
    const wh = webhookModel.create({ org_id: 'org-1', url: 'https://a.com/hook', secret: 's1', events: ['device.online'] });
    webhookModel.create({ org_id: 'org-1', url: 'https://b.com/hook', secret: 's2', events: ['device.online'] });

    // Deactivate the first webhook
    webhookModel.update(wh.id, { is_active: 0 });

    const hooks = webhookModel.getByEvent('org-1', 'device.online');
    expect(hooks).toHaveLength(1);
    expect(hooks[0].url).toBe('https://b.com/hook');
  });

  test('getByEvent returns empty array when no webhooks match', () => {
    webhookModel.create({ org_id: 'org-1', url: 'https://a.com/hook', secret: 's1', events: ['device.online'] });

    const hooks = webhookModel.getByEvent('org-1', 'nonexistent.event');
    expect(hooks).toHaveLength(0);
  });

  // --- update ---

  test('update changes url', () => {
    const wh = webhookModel.create({ org_id: 'org-1', url: 'https://old.com/hook', secret: 's1', events: ['device.online'] });

    const updated = webhookModel.update(wh.id, { url: 'https://new.com/hook' });
    expect(updated).toBeDefined();
    expect(updated!.url).toBe('https://new.com/hook');
  });

  test('update changes events', () => {
    const wh = webhookModel.create({ org_id: 'org-1', url: 'https://a.com/hook', secret: 's1', events: ['device.online'] });

    const updated = webhookModel.update(wh.id, { events: ['log.uploaded', 'firmware.deployed'] });
    expect(updated).toBeDefined();
    expect(JSON.parse(updated!.events)).toEqual(['log.uploaded', 'firmware.deployed']);
  });

  test('update changes is_active', () => {
    const wh = webhookModel.create({ org_id: 'org-1', url: 'https://a.com/hook', secret: 's1', events: ['device.online'] });

    const updated = webhookModel.update(wh.id, { is_active: 0 });
    expect(updated).toBeDefined();
    expect(updated!.is_active).toBe(0);
  });

  test('update returns undefined for nonexistent webhook', () => {
    const result = webhookModel.update('nonexistent', { url: 'https://nope.com' });
    expect(result).toBeUndefined();
  });

  // --- delete ---

  test('delete removes webhook and returns true', () => {
    const wh = webhookModel.create({ org_id: 'org-1', url: 'https://a.com/hook', secret: 's1', events: ['device.online'] });

    const result = webhookModel.delete(wh.id);
    expect(result).toBe(true);

    const found = webhookModel.getById(wh.id);
    expect(found).toBeUndefined();
  });

  test('delete returns false for nonexistent webhook', () => {
    const result = webhookModel.delete('nonexistent');
    expect(result).toBe(false);
  });

  // --- recordSuccess ---

  test('recordSuccess resets failure_count and updates last_triggered_at', () => {
    const wh = webhookModel.create({ org_id: 'org-1', url: 'https://a.com/hook', secret: 's1', events: ['device.online'] });

    // Simulate some failures first
    webhookModel.recordFailure(wh.id);
    webhookModel.recordFailure(wh.id);
    webhookModel.recordFailure(wh.id);

    const beforeSuccess = webhookModel.getById(wh.id);
    expect(beforeSuccess!.failure_count).toBe(3);

    webhookModel.recordSuccess(wh.id);

    const after = webhookModel.getById(wh.id);
    expect(after!.failure_count).toBe(0);
    expect(after!.last_triggered_at).toBeTruthy();
    expect(after!.last_triggered_at).not.toBe('');
  });

  // --- recordFailure ---

  test('recordFailure increments failure_count', () => {
    const wh = webhookModel.create({ org_id: 'org-1', url: 'https://a.com/hook', secret: 's1', events: ['device.online'] });

    webhookModel.recordFailure(wh.id);
    let updated = webhookModel.getById(wh.id);
    expect(updated!.failure_count).toBe(1);

    webhookModel.recordFailure(wh.id);
    updated = webhookModel.getById(wh.id);
    expect(updated!.failure_count).toBe(2);
  });

  test('recordFailure disables webhook at 10 consecutive failures', () => {
    const wh = webhookModel.create({ org_id: 'org-1', url: 'https://a.com/hook', secret: 's1', events: ['device.online'] });

    // Record 9 failures - should still be active
    for (let i = 0; i < 9; i++) {
      webhookModel.recordFailure(wh.id);
    }
    let updated = webhookModel.getById(wh.id);
    expect(updated!.failure_count).toBe(9);
    expect(updated!.is_active).toBe(1);

    // 10th failure disables
    webhookModel.recordFailure(wh.id);
    updated = webhookModel.getById(wh.id);
    expect(updated!.failure_count).toBe(10);
    expect(updated!.is_active).toBe(0);
  });
});
