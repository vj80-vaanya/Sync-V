import crypto from 'crypto';
import { createDatabase } from '../src/models/Database';
import { OrganizationModel } from '../src/models/Organization';
import { WebhookModel } from '../src/models/Webhook';
import { WebhookDispatcher } from '../src/services/WebhookDispatcher';
import Database from 'better-sqlite3';

describe('WebhookDispatcher', () => {
  let db: Database.Database;
  let webhookModel: WebhookModel;
  let dispatcher: WebhookDispatcher;
  let mockFetch: jest.Mock;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    db = createDatabase();
    const orgModel = new OrganizationModel(db);
    webhookModel = new WebhookModel(db);
    dispatcher = new WebhookDispatcher(webhookModel);

    // Create org for foreign key
    orgModel.create({ id: 'org1', name: 'Test', slug: 'test' });

    // Mock global.fetch
    originalFetch = global.fetch;
    mockFetch = jest.fn().mockResolvedValue({ ok: true } as any);
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    db.close();
  });

  test('dispatch calls the webhook URL', async () => {
    webhookModel.create({
      org_id: 'org1',
      url: 'https://example.com/hook',
      secret: 'mysecret',
      events: ['device.online'],
    });

    await dispatcher.dispatch('org1', 'device.online', { deviceId: 'dev1' });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://example.com/hook');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(options.headers['X-SyncV-Event']).toBe('device.online');
  });

  test('dispatch signs payload with HMAC-SHA256', async () => {
    webhookModel.create({
      org_id: 'org1',
      url: 'https://example.com/hook',
      secret: 'test-secret-key',
      events: ['device.online'],
    });

    await dispatcher.dispatch('org1', 'device.online', { deviceId: 'dev1' });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, options] = mockFetch.mock.calls[0];
    const body = options.body;
    const signature = options.headers['X-SyncV-Signature'];

    // Verify the signature matches
    const expected = crypto.createHmac('sha256', 'test-secret-key').update(body).digest('hex');
    expect(signature).toBe(expected);
  });

  test('dispatch records success on 200', async () => {
    const webhook = webhookModel.create({
      org_id: 'org1',
      url: 'https://example.com/hook',
      secret: 'secret',
      events: ['device.online'],
    });

    mockFetch.mockResolvedValue({ ok: true } as any);
    await dispatcher.dispatch('org1', 'device.online', { deviceId: 'dev1' });

    const updated = webhookModel.getById(webhook.id);
    expect(updated!.failure_count).toBe(0);
  });

  test('dispatch records failure on non-200', async () => {
    const webhook = webhookModel.create({
      org_id: 'org1',
      url: 'https://example.com/hook',
      secret: 'secret',
      events: ['device.online'],
    });

    mockFetch.mockResolvedValue({ ok: false, status: 500 } as any);
    await dispatcher.dispatch('org1', 'device.online', { deviceId: 'dev1' });

    const updated = webhookModel.getById(webhook.id);
    expect(updated!.failure_count).toBe(1);
  });

  test('dispatch skips inactive webhooks', async () => {
    const webhook = webhookModel.create({
      org_id: 'org1',
      url: 'https://example.com/hook',
      secret: 'secret',
      events: ['device.online'],
    });

    // Deactivate the webhook
    webhookModel.update(webhook.id, { is_active: 0 });

    await dispatcher.dispatch('org1', 'device.online', { deviceId: 'dev1' });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('dispatch does nothing when no webhooks match', async () => {
    webhookModel.create({
      org_id: 'org1',
      url: 'https://example.com/hook',
      secret: 'secret',
      events: ['device.online'],
    });

    // Dispatch an event that no webhook is subscribed to
    await dispatcher.dispatch('org1', 'firmware.updated', { version: '2.0' });

    expect(mockFetch).not.toHaveBeenCalled();
  });
});
