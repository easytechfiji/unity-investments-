// A stand-in for the PayPal REST API, so payment paths can be tested without
// the network. Tests switch its behaviour to try declines and wrong amounts.
import type { AddressInfo } from 'node:net';
import express from 'express';

interface FakeOrder {
  id: string;
  amount: string;
  currency: string;
  customId: string;
  captured: boolean;
}

export interface FakePaypal {
  url: string;
  orders: Map<string, FakeOrder>;
  behaviour: {
    /** Capture reports this amount instead of the order amount. */
    captureAmount?: string;
    /** Capture is refused like a declined card. */
    decline?: boolean;
    /** Webhook signature check result. */
    signatureValid: boolean;
  };
  calls: string[];
  close(): Promise<void>;
}

export async function startFakePaypal(): Promise<FakePaypal> {
  const orders = new Map<string, FakeOrder>();
  const calls: string[] = [];
  const behaviour: FakePaypal['behaviour'] = { signatureValid: true };
  let next = 1000;

  const app = express();
  app.use(express.json());
  app.use((req, _res, nextHandler) => {
    calls.push(`${req.method} ${req.path}`);
    nextHandler();
  });

  app.post('/v1/oauth2/token', (_req, res) => {
    res.json({ access_token: 'fake-token', expires_in: 3600 });
  });

  app.post('/v2/checkout/orders', (req, res) => {
    const unit = (
      req.body as {
        purchase_units: { amount: { value: string; currency_code: string }; custom_id: string }[];
      }
    ).purchase_units[0];
    const id = `FAKE${(next += 1)}`;
    orders.set(id, {
      id,
      amount: unit?.amount.value ?? '',
      currency: unit?.amount.currency_code ?? '',
      customId: unit?.custom_id ?? '',
      captured: false,
    });
    res.status(201).json({ id, status: 'CREATED' });
  });

  app.post('/v2/checkout/orders/:id/capture', (req, res) => {
    const order = orders.get(req.params.id);
    if (!order) {
      res.status(404).json({ name: 'RESOURCE_NOT_FOUND' });
      return;
    }
    if (behaviour.decline) {
      res
        .status(422)
        .json({ name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'INSTRUMENT_DECLINED' }] });
      return;
    }
    order.captured = true;
    res.status(201).json({
      id: order.id,
      status: 'COMPLETED',
      purchase_units: [
        {
          payments: {
            captures: [
              {
                id: `CAP-${order.id}`,
                status: 'COMPLETED',
                custom_id: order.customId,
                amount: {
                  value: behaviour.captureAmount ?? order.amount,
                  currency_code: order.currency,
                },
              },
            ],
          },
        },
      ],
    });
  });

  app.post('/v1/notifications/verify-webhook-signature', (_req, res) => {
    res.json({ verification_status: behaviour.signatureValid ? 'SUCCESS' : 'FAILURE' });
  });

  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    orders,
    behaviour,
    calls,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
