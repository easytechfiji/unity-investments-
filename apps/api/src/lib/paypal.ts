import type { AppConfig } from '../config/env.js';

// PayPal Orders API v2 over plain fetch. Card details are entered on PayPal's
// own pages; they never reach this server.

export class PaypalDeclinedError extends Error {
  override name = 'PaypalDeclinedError';
}

export interface CaptureResult {
  status: string;
  captureId: string | null;
  amount: string | null;
  currency: string | null;
  customId: string | null;
}

export interface WebhookHeaders {
  authAlgo: string;
  certUrl: string;
  transmissionId: string;
  transmissionSig: string;
  transmissionTime: string;
}

export interface Paypal {
  createOrder(input: {
    reference: string;
    orderNumber: string;
    currency: string;
    amount: string;
    brandName: string;
  }): Promise<string>;
  captureOrder(paypalOrderId: string): Promise<CaptureResult>;
  verifyWebhook(headers: WebhookHeaders, event: unknown): Promise<boolean>;
}

interface CaptureResponse {
  status?: string;
  purchase_units?: {
    payments?: {
      captures?: {
        id?: string;
        status?: string;
        custom_id?: string;
        amount?: { value?: string; currency_code?: string };
      }[];
    };
  }[];
}

export function createPaypal(config: AppConfig): Paypal {
  const base =
    config.PAYPAL_API_BASE?.replace(/\/$/, '') ??
    (config.PAYPAL_ENV === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com');
  let token: { value: string; expires: number } | null = null;

  async function accessToken(): Promise<string> {
    if (token && token.expires > Date.now() + 60_000) return token.value;
    const credentials = Buffer.from(
      `${config.PAYPAL_CLIENT_ID}:${config.PAYPAL_CLIENT_SECRET}`,
    ).toString('base64');
    const response = await fetch(`${base}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!response.ok) throw new Error(`PayPal token request failed with status ${response.status}`);
    const body = (await response.json()) as { access_token: string; expires_in: number };
    token = { value: body.access_token, expires: Date.now() + body.expires_in * 1000 };
    return token.value;
  }

  async function call(path: string, body: unknown, requestId?: string): Promise<Response> {
    return fetch(`${base}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        'Content-Type': 'application/json',
        // PayPal treats a repeated request id as the same request, so retries are safe.
        ...(requestId ? { 'PayPal-Request-Id': requestId } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  return {
    async createOrder({ reference, orderNumber, currency, amount, brandName }) {
      const response = await call(
        '/v2/checkout/orders',
        {
          intent: 'CAPTURE',
          purchase_units: [
            {
              reference_id: orderNumber,
              custom_id: reference,
              invoice_id: orderNumber,
              description: `Order ${orderNumber}`,
              amount: { currency_code: currency, value: amount },
            },
          ],
          payment_source: {
            paypal: {
              experience_context: {
                brand_name: brandName.slice(0, 127),
                shipping_preference: 'NO_SHIPPING',
                user_action: 'PAY_NOW',
              },
            },
          },
        },
        `create-${reference}`,
      );
      if (!response.ok)
        throw new Error(`PayPal create order failed with status ${response.status}`);
      const body = (await response.json()) as { id?: string };
      if (!body.id) throw new Error('PayPal create order returned no id');
      return body.id;
    },

    async captureOrder(paypalOrderId) {
      const response = await call(
        `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`,
        {},
        `capture-${paypalOrderId}`,
      );
      if (response.status === 422) throw new PaypalDeclinedError('PayPal declined the payment');
      if (!response.ok) throw new Error(`PayPal capture failed with status ${response.status}`);
      const body = (await response.json()) as CaptureResponse;
      const capture = body.purchase_units?.[0]?.payments?.captures?.[0];
      return {
        status: capture?.status ?? body.status ?? 'UNKNOWN',
        captureId: capture?.id ?? null,
        amount: capture?.amount?.value ?? null,
        currency: capture?.amount?.currency_code ?? null,
        customId: capture?.custom_id ?? null,
      };
    },

    async verifyWebhook(headers, event) {
      if (!config.PAYPAL_WEBHOOK_ID) return false;
      const response = await call('/v1/notifications/verify-webhook-signature', {
        auth_algo: headers.authAlgo,
        cert_url: headers.certUrl,
        transmission_id: headers.transmissionId,
        transmission_sig: headers.transmissionSig,
        transmission_time: headers.transmissionTime,
        webhook_id: config.PAYPAL_WEBHOOK_ID,
        webhook_event: event,
      });
      if (!response.ok) return false;
      const body = (await response.json()) as { verification_status?: string };
      return body.verification_status === 'SUCCESS';
    },
  };
}
