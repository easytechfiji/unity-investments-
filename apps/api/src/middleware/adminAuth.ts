import type { Request, RequestHandler, Response } from 'express';
import type { AppConfig } from '../config/env.js';
import type { Db } from '../db.js';
import type { AuthClient, Session } from '../lib/authClient.js';
import { AuthError } from '../lib/authClient.js';
import { HttpError } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';

export const ACCESS_COOKIE = 'od_admin';
export const REFRESH_COOKIE = 'od_admin_refresh';
const COOKIE_PATH = '/v1/admin';
const REFRESH_MAX_AGE_SECONDS = 8 * 60 * 60; // an admin signs in again after a working day

export interface AdminUser {
  id: string;
  email: string | null;
  name: string;
  role: 'owner' | 'staff';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Express types are extended through this global namespace
  namespace Express {
    interface Locals {
      admin?: AdminUser;
    }
  }
}

/** Reads one cookie from the Cookie header. Five lines instead of another package. */
export function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

function cookie(config: AppConfig, name: string, value: string, maxAgeSeconds: number): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${COOKIE_PATH}`,
    `Max-Age=${maxAgeSeconds}`,
    'HttpOnly',
    'SameSite=Strict',
    config.COOKIE_SECURE ? 'Secure' : null,
  ]
    .filter(Boolean)
    .join('; ');
}

export function setSessionCookies(res: Response, config: AppConfig, session: Session): void {
  res.setHeader('Set-Cookie', [
    cookie(config, ACCESS_COOKIE, session.accessToken, session.expiresIn),
    cookie(config, REFRESH_COOKIE, session.refreshToken, REFRESH_MAX_AGE_SECONDS),
  ]);
}

export function clearSessionCookies(res: Response, config: AppConfig): void {
  res.setHeader('Set-Cookie', [
    cookie(config, ACCESS_COOKIE, '', 0),
    cookie(config, REFRESH_COOKIE, '', 0),
  ]);
}

/**
 * Cross site request forgery guard: a request that changes data must say it
 * came from the admin app. Browsers always send Origin on such requests and
 * a page on another site cannot fake it.
 */
export function requireAdminOrigin(config: AppConfig): RequestHandler {
  const allowed = new Set(
    [config.ADMIN_ORIGIN, ...(config.NODE_ENV === 'production' ? [] : config.CORS_ORIGINS)].filter(
      Boolean,
    ),
  );
  return (req, _res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    const origin = req.headers.origin;
    if (!origin || !allowed.has(origin)) {
      throw new HttpError(403, 'bad_origin', 'This request must come from the admin site.');
    }
    next();
  };
}

export async function loadAdmin(
  db: Db,
  userId: string,
  email: string | null,
): Promise<AdminUser | null> {
  const [profile] = await db.query<{ name: string; role: AdminUser['role'] }>(
    'select name, role from public.admin_profiles where user_id = $1',
    [userId],
  );
  return profile ? { id: userId, email, name: profile.name, role: profile.role } : null;
}

/**
 * Lets a request through only with a valid session that has passed two-factor
 * (aal2, unless ADMIN_MFA_REQUIRED is false) and belongs to a row in admin_profiles. Being signed in to Supabase
 * is not enough on its own.
 */
export function requireAdmin(deps: {
  config: AppConfig;
  db: Db;
  auth: AuthClient;
  logger: Logger;
}): RequestHandler {
  const { config, db, auth } = deps;
  return async (req, res, next) => {
    let token = readCookie(req, ACCESS_COOKIE);
    let claims = token ? await auth.verify(token).catch(() => null) : null;

    if (!claims) {
      const refreshToken = readCookie(req, REFRESH_COOKIE);
      if (refreshToken) {
        try {
          const session = await auth.refresh(refreshToken);
          token = session.accessToken;
          claims = await auth.verify(token);
          setSessionCookies(res, config, session);
        } catch (error) {
          if (!(error instanceof AuthError)) throw error;
          claims = null;
        }
      }
    }
    if (!claims) {
      clearSessionCookies(res, config);
      throw new HttpError(401, 'signed_out', 'Please sign in.');
    }
    if (config.ADMIN_MFA_REQUIRED && claims.aal !== 'aal2')
      throw new HttpError(401, 'mfa_required', 'Enter the code from your authenticator app.');

    const admin = await loadAdmin(db, claims.userId, claims.email);
    if (!admin) throw new HttpError(403, 'not_admin', 'This account cannot use the admin.');
    res.locals.admin = admin;
    next();
  };
}

export function requireOwner(): RequestHandler {
  return (_req, res, next) => {
    if (res.locals.admin?.role !== 'owner')
      throw new HttpError(403, 'owner_only', 'Only the shop owner can do this.');
    next();
  };
}

/** Writes one line to the insert-only audit log: who did what, to what, from where. */
export async function audit(
  db: Db,
  req: Request,
  res: Response,
  action: string,
  entity: string,
  entityId: string | number | null,
): Promise<void> {
  const admin = res.locals.admin;
  if (!admin) return;
  await db.query(
    'insert into public.admin_audit_log (admin_id, action, entity, entity_id, ip, user_agent) values ($1, $2, $3, $4, $5, $6)',
    [
      admin.id,
      action,
      entity,
      entityId === null ? null : String(entityId),
      req.ip ?? null,
      (req.headers['user-agent'] ?? '').slice(0, 300),
    ],
  );
}

/**
 * Per account sign in back off: after 5 failures, each further failure doubles
 * the wait (1, 2, 4 ... up to 60 minutes). Kept in memory, so it resets on
 * restart; the per IP limit and Supabase's own limits still apply.
 */
export class LoginThrottle {
  private failures = new Map<string, { count: number; until: number }>();

  check(account: string, now = Date.now()): number {
    const entry = this.failures.get(account.toLowerCase());
    return entry && entry.until > now ? Math.ceil((entry.until - now) / 1000) : 0;
  }

  fail(account: string, now = Date.now()): void {
    const key = account.toLowerCase();
    const count = (this.failures.get(key)?.count ?? 0) + 1;
    const minutes = count < 5 ? 0 : Math.min(60, 2 ** (count - 5));
    this.failures.set(key, { count, until: now + minutes * 60_000 });
    if (this.failures.size > 10_000) this.failures.clear();
  }

  succeed(account: string): void {
    this.failures.delete(account.toLowerCase());
  }
}
