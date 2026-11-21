import type { AppConfig } from '../config/env.js';

/**
 * Checks a Cloudflare Turnstile token (the free CAPTCHA alternative) with
 * Cloudflare. Without a secret key, which is only allowed outside production,
 * the check is skipped so forms work in local development.
 */
export async function verifyTurnstile(
  config: AppConfig,
  token: string | undefined,
  ip: string | undefined,
): Promise<boolean> {
  if (!config.TURNSTILE_SECRET_KEY) return config.NODE_ENV !== 'production';
  if (!token) return false;
  const form = new URLSearchParams({ secret: config.TURNSTILE_SECRET_KEY, response: token });
  if (ip) form.set('remoteip', ip);
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(8000),
    });
    const body = (await response.json()) as { success?: boolean };
    return body.success === true;
  } catch {
    return false;
  }
}
