import { Hono } from 'hono';
import { z } from 'zod';
import { webhookInputSchema } from '@authend/shared';
import type { SessionContext } from '../../middleware/auth';
import { HttpError } from '../../lib/http';
import {
  createWebhook,
  deleteWebhook,
  getDelivery,
  getWebhook,
  listDeliveries,
  listWebhooks,
  retryDelivery,
  updateWebhook,
} from '../../services/webhook-service';

export const adminWebhooksRouter = new Hono<{ Variables: { auth: SessionContext } }>()
  // List all webhooks
  .get('/webhooks', async (c) => {
    const items = await listWebhooks();
    return c.json({ webhooks: items });
  })

  // Create a webhook
  .post('/webhooks', async (c) => {
    const auth = c.get('auth');
    const body = webhookInputSchema.parse(await c.req.json());
    const webhook = await createWebhook(body, auth.user.id);
    return c.json({ webhook }, 201);
  })

  // Get a single webhook
  .get('/webhooks/:id', async (c) => {
    const webhook = await getWebhook(c.req.param('id'));
    return c.json({ webhook });
  })

  // Update a webhook (partial)
  .patch('/webhooks/:id', async (c) => {
    const auth = c.get('auth');
    const body = webhookInputSchema.partial().parse(await c.req.json());
    const webhook = await updateWebhook(c.req.param('id'), body, auth.user.id);
    return c.json({ webhook });
  })

  // Delete a webhook
  .delete('/webhooks/:id', async (c) => {
    const auth = c.get('auth');
    await deleteWebhook(c.req.param('id'), auth.user.id);
    return c.body(null, 204);
  })

  // List deliveries for a webhook
  .get('/webhooks/:id/deliveries', async (c) => {
    const limit = z.coerce.number().int().positive().max(200).optional().default(50).parse(c.req.query('limit'));
    const deliveries = await listDeliveries(c.req.param('id'), limit);
    return c.json({ deliveries });
  })

  // Get a single delivery
  .get('/webhooks/:id/deliveries/:deliveryId', async (c) => {
    const delivery = await getDelivery(c.req.param('deliveryId'));
    if (delivery.webhookId !== c.req.param('id')) {
      throw new HttpError(404, 'Delivery not found');
    }
    return c.json({ delivery });
  })

  // Manual retry
  .post('/webhooks/:id/deliveries/:deliveryId/retry', async (c) => {
    const delivery = await getDelivery(c.req.param('deliveryId'));
    if (delivery.webhookId !== c.req.param('id')) {
      throw new HttpError(404, 'Delivery not found');
    }
    const updated = await retryDelivery(c.req.param('deliveryId'));
    return c.json({ delivery: updated });
  });
