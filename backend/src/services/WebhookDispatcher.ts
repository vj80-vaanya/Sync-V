import crypto from 'crypto';
import { WebhookModel, WebhookRecord } from '../models/Webhook';

export class WebhookDispatcher {
  private model: WebhookModel;

  constructor(model: WebhookModel) {
    this.model = model;
  }

  async dispatch(orgId: string, event: string, data: object): Promise<void> {
    const webhooks = this.model.getByEvent(orgId, event);
    if (webhooks.length === 0) return;

    for (const webhook of webhooks) {
      this.deliverWebhook(webhook, event, orgId, data);
    }
  }

  private async deliverWebhook(webhook: WebhookRecord, event: string, orgId: string, data: object): Promise<void> {
    const payload = JSON.stringify({
      event,
      orgId,
      data,
      timestamp: new Date().toISOString(),
    });

    const signature = crypto
      .createHmac('sha256', webhook.secret)
      .update(payload)
      .digest('hex');

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-SyncV-Signature': signature,
          'X-SyncV-Event': event,
        },
        body: payload,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        this.model.recordSuccess(webhook.id);
      } else {
        this.model.recordFailure(webhook.id);
      }
    } catch {
      this.model.recordFailure(webhook.id);
    }
  }
}
