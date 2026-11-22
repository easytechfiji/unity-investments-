import { randomUUID } from 'node:crypto';
import { createRemoteJWKSet, decodeJwt, jwtVerify, type JWTPayload } from 'jose';
import type { AppConfig } from '../config/env.js';
import { authUrl } from '../config/env.js';

/**
 * Supabase returns the authenticator QR code as raw SVG markup, not as an
 * image address. The admin page shows it in an <img>, so turn it into a data
 * URL. Anything else is passed through unchanged.
 */
export function qrImage(qrCode: string): string {
  const text = qrCode.trim();
  if (text.startsWith('data:')) return text;
  if (text.startsWith('<'))
    return `data:image/svg+xml;base64,${Buffer.from(text).toString('base64')}`;
  return text;
}

// Talks to Supabase Auth (GoTrue) over its REST API. The admin app never holds
// tokens itself: the API keeps them in HttpOnly cookies the browser's
// JavaScript cannot read.

export interface Session {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  userId: string;
  email: string | null;
}

export interface Factor {
  id: string;
  type: string;
  status: 'verified' | 'unverified';
}

export interface Claims {
  userId: string;
  email: string | null;
  aal: 'aal1' | 'aal2';
  expiresAt: number;
}

export class AuthError extends Error {
  override name = 'AuthError';
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

interface SessionBody {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user?: { id: string; email?: string };
}

export function createAuthClient(config: AppConfig) {
  const base = authUrl(config);
  const apiKey = config.SUPABASE_PUBLISHABLE_KEY ?? 'local-development-key';
  const jwks = base
    ? createRemoteJWKSet(new URL(`${base}/.well-known/jwks.json`), { cooldownDuration: 30_000 })
    : null;

  function requireBase(): string {
    if (!base) throw new AuthError('Admin sign in is not configured', 503);
    return base;
  }

  async function request<T>(
    path: string,
    init: { method?: string; token?: string; body?: unknown },
  ): Promise<T> {
    const response = await fetch(`${requireBase()}${path}`, {
      method: init.method ?? 'POST',
      headers: {
        apikey: apiKey,
        'Content-Type': 'application/json',
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new AuthError('Auth request failed', response.status);
    return (await response.json()) as T;
  }

  function toSession(body: SessionBody): Session {
    const claims = decodeJwt(body.access_token);
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresIn: body.expires_in,
      userId: body.user?.id ?? String(claims.sub),
      email: body.user?.email ?? (typeof claims.email === 'string' ? claims.email : null),
    };
  }

  function toClaims(payload: JWTPayload): Claims {
    if (!payload.sub || typeof payload.exp !== 'number') throw new AuthError('Invalid token', 401);
    return {
      userId: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : null,
      aal: payload.aal === 'aal2' ? 'aal2' : 'aal1',
      expiresAt: payload.exp,
    };
  }

  return {
    async signIn(email: string, password: string): Promise<Session> {
      return toSession(
        await request<SessionBody>('/token?grant_type=password', { body: { email, password } }),
      );
    },

    async refresh(refreshToken: string): Promise<Session> {
      return toSession(
        await request<SessionBody>('/token?grant_type=refresh_token', {
          body: { refresh_token: refreshToken },
        }),
      );
    },

    async factors(accessToken: string): Promise<Factor[]> {
      const user = await request<{
        factors?: { id: string; factor_type: string; status: Factor['status'] }[];
      }>('/user', {
        method: 'GET',
        token: accessToken,
      });
      return (user.factors ?? []).map((factor) => ({
        id: factor.id,
        type: factor.factor_type,
        status: factor.status,
      }));
    },

    async enrollTotp(
      accessToken: string,
    ): Promise<{ factorId: string; qrCode: string; secret: string }> {
      const body = await request<{ id: string; totp: { qr_code: string; secret: string } }>(
        '/factors',
        {
          token: accessToken,
          body: {
            factor_type: 'totp',
            // Supabase refuses two factors with the same name, and an unfinished
            // setup keeps its name, so every attempt gets a unique one.
            friendly_name: `Admin ${new Date().toISOString().slice(0, 16)} ${randomUUID().slice(0, 6)}`,
          },
        },
      );
      return { factorId: body.id, qrCode: qrImage(body.totp.qr_code), secret: body.totp.secret };
    },

    async verifyTotp(accessToken: string, factorId: string, code: string): Promise<Session> {
      const challenge = await request<{ id: string }>(
        `/factors/${encodeURIComponent(factorId)}/challenge`,
        { token: accessToken, body: {} },
      );
      return toSession(
        await request<SessionBody>(`/factors/${encodeURIComponent(factorId)}/verify`, {
          token: accessToken,
          body: { challenge_id: challenge.id, code },
        }),
      );
    },

    async signOut(accessToken: string): Promise<void> {
      await request('/logout', { token: accessToken, body: {} }).catch(() => undefined);
    },

    /**
     * Checks a token's signature against Supabase's published keys. Projects that
     * still sign with a shared secret have no public keys; for those, Supabase is
     * asked directly whether the token is valid before its claims are trusted.
     */
    async verify(accessToken: string): Promise<Claims> {
      if (!jwks || !base) throw new AuthError('Admin sign in is not configured', 503);
      try {
        const { payload } = await jwtVerify(accessToken, jwks, { audience: 'authenticated' });
        return toClaims(payload);
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code !== 'ERR_JWKS_NO_MATCHING_KEY' && code !== 'ERR_JOSE_NOT_SUPPORTED') {
          throw new AuthError('Invalid token', 401);
        }
      }
      await request('/user', { method: 'GET', token: accessToken }).catch(() => {
        throw new AuthError('Invalid token', 401);
      });
      const payload = decodeJwt(accessToken);
      if (payload.aud !== 'authenticated') throw new AuthError('Invalid token', 401);
      return toClaims(payload);
    },
  };
}

export type AuthClient = ReturnType<typeof createAuthClient>;
