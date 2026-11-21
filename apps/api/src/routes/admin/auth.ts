import { emailSchema } from '@od/shared';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { AuthError, type Claims } from '../../lib/authClient.js';
import { HttpError } from '../../lib/errors.js';
import { parseInput } from '../../lib/validate.js';
import {
  ACCESS_COOKIE,
  LoginThrottle,
  REFRESH_COOKIE,
  clearSessionCookies,
  loadAdmin,
  readCookie,
  requireAdmin,
  setSessionCookies,
} from '../../middleware/adminAuth.js';
import { createRateLimit } from '../../middleware/rateLimit.js';
import type { Services } from '../../services/container.js';

const loginSchema = z.strictObject({ email: emailSchema, password: z.string().min(1).max(200) });
const codeSchema = z.strictObject({ code: z.string().regex(/^\d{6}$/, 'Enter the 6 digit code') });

export function adminAuthRoutes(services: Services): Router {
  const { config, db, auth, logger } = services;
  const router = Router();
  const throttle = new LoginThrottle();
  const loginLimit = createRateLimit({
    windowMinutes: 15,
    limit: 10,
    scale: config.RATE_LIMIT_SCALE,
  });

  /** The current session at any assurance level (password only, or password plus code). */
  async function session(req: Request, res: Response): Promise<{ token: string; claims: Claims }> {
    const token = readCookie(req, ACCESS_COOKIE);
    if (token) {
      const claims = await auth.verify(token).catch(() => null);
      if (claims) return { token, claims };
    }
    const refreshToken = readCookie(req, REFRESH_COOKIE);
    if (refreshToken) {
      const refreshed = await auth.refresh(refreshToken).catch(() => null);
      if (refreshed) {
        setSessionCookies(res, config, refreshed);
        return { token: refreshed.accessToken, claims: await auth.verify(refreshed.accessToken) };
      }
    }
    throw new HttpError(401, 'signed_out', 'Please sign in.');
  }

  router.post('/login', loginLimit, async (req, res) => {
    const { email, password } = parseInput(loginSchema, req.body);
    const wait = throttle.check(email);
    if (wait > 0) {
      throw new HttpError(
        429,
        'locked',
        `Too many failed attempts. Try again in ${Math.ceil(wait / 60)} minute(s).`,
      );
    }
    let signedIn;
    try {
      signedIn = await auth.signIn(email, password);
    } catch (error) {
      if (error instanceof AuthError && error.status < 500) {
        throttle.fail(email);
        logger.warn('admin sign in failed', { requestId: res.locals.requestId });
        throw new HttpError(401, 'bad_credentials', 'Email or password is incorrect.');
      }
      throw error;
    }
    const admin = await loadAdmin(db, signedIn.userId, signedIn.email);
    if (!admin) {
      await auth.signOut(signedIn.accessToken);
      throw new HttpError(403, 'not_admin', 'This account cannot use the admin.');
    }
    const factors = await auth.factors(signedIn.accessToken);
    setSessionCookies(res, config, signedIn);
    const verified = factors.some(
      (factor) => factor.type === 'totp' && factor.status === 'verified',
    );
    res.json({ next: verified ? 'mfa_verify' : 'mfa_enroll' });
  });

  router.post('/mfa/enroll', loginLimit, async (req, res) => {
    const { token, claims } = await session(req, res);
    if (!(await loadAdmin(db, claims.userId, claims.email)))
      throw new HttpError(403, 'not_admin', 'This account cannot use the admin.');
    const factors = await auth.factors(token);
    // A password alone must never be enough to add a new authenticator to an account that has one.
    if (factors.some((factor) => factor.type === 'totp' && factor.status === 'verified')) {
      throw new HttpError(
        409,
        'already_enrolled',
        'This account already has an authenticator. Enter its code instead.',
      );
    }
    const enrolment = await auth.enrollTotp(token);
    res
      .set('Cache-Control', 'no-store')
      .json({ qrCode: enrolment.qrCode, secret: enrolment.secret });
  });

  router.post('/mfa/verify', loginLimit, async (req, res) => {
    const { code } = parseInput(codeSchema, req.body);
    const { token, claims } = await session(req, res);
    const account = claims.email ?? claims.userId;
    const wait = throttle.check(account);
    if (wait > 0)
      throw new HttpError(
        429,
        'locked',
        `Too many failed attempts. Try again in ${Math.ceil(wait / 60)} minute(s).`,
      );

    const factors = (await auth.factors(token)).filter((factor) => factor.type === 'totp');
    const factor = factors.find((item) => item.status === 'verified') ?? factors.at(-1);
    if (!factor) throw new HttpError(400, 'no_factor', 'Set up an authenticator app first.');
    let upgraded;
    try {
      upgraded = await auth.verifyTotp(token, factor.id, code);
    } catch (error) {
      if (error instanceof AuthError && error.status < 500) {
        throttle.fail(account);
        throw new HttpError(
          401,
          'bad_code',
          'That code is not right. Check the time on your phone and try again.',
        );
      }
      throw error;
    }
    throttle.succeed(account);
    setSessionCookies(res, config, upgraded);
    res.json({ ok: true });
  });

  router.get('/me', requireAdmin(services), (_req, res) => {
    res.set('Cache-Control', 'no-store').json(res.locals.admin);
  });

  router.post('/logout', async (req, res) => {
    const token = readCookie(req, ACCESS_COOKIE);
    if (token) await auth.signOut(token);
    clearSessionCookies(res, config);
    res.json({ ok: true });
  });

  return router;
}
