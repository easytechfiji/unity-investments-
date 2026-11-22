// A small stand-in for Supabase Auth (GoTrue), for local development and tests
// only. It speaks the same REST endpoints the API uses, signs ES256 tokens like
// a current Supabase project, and checks real TOTP codes. Never for production.
import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { exportJWK, generateKeyPair, importJWK, SignJWT, type JWK } from 'jose';

// TOTP (RFC 6238) ------------------------------------------------------------

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buffer: Buffer): string {
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) out += BASE32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function base32Decode(text: string): Buffer {
  let bits = '';
  for (const char of text.replace(/=+$/, '').toUpperCase())
    bits += BASE32.indexOf(char).toString(2).padStart(5, '0');
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** The 6 digit code an authenticator app would show for this secret at this time. */
export function totpCode(secret: string, time = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 30_000)));
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0xf;
  const value = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(value).padStart(6, '0');
}

// Users ------------------------------------------------------------------------

interface Factor {
  id: string;
  secret: string;
  status: 'verified' | 'unverified';
  name?: string;
}

interface User {
  id: string;
  email: string;
  passwordHash: string;
  factors: Factor[];
}

function hashPassword(password: string, salt = randomBytes(16).toString('hex')): string {
  return `${salt}:${scryptSync(password, salt, 32).toString('hex')}`;
}

function checkPassword(password: string, stored: string): boolean {
  const [salt = '', hash = ''] = stored.split(':');
  const candidate = scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === candidate.length && timingSafeEqual(candidate, expected);
}

export interface FakeAuth {
  url: string;
  createUser(email: string, password: string): User;
  /** Adds and verifies a TOTP factor directly. Returns the secret, for tests. */
  addVerifiedFactor(email: string): string;
  close(): Promise<void>;
}

export async function startFakeAuth(
  options: { port?: number; dataFile?: string; serviceKey?: string } = {},
): Promise<FakeAuth> {
  if (process.env.NODE_ENV === 'production')
    throw new Error('The fake auth server must never run in production.');

  const stored =
    options.dataFile && existsSync(options.dataFile)
      ? (JSON.parse(readFileSync(options.dataFile, 'utf8')) as { users: User[]; jwk?: JWK })
      : null;
  const users: User[] = stored?.users ?? [];
  let privateJwk = stored?.jwk;
  if (!privateJwk) {
    const pair = await generateKeyPair('ES256', { extractable: true });
    privateJwk = { ...(await exportJWK(pair.privateKey)), kid: randomUUID(), alg: 'ES256' };
  }
  const privateKey = await importJWK(privateJwk, 'ES256');
  const { d: _d, ...publicJwk } = privateJwk;
  const publicKey = await importJWK(publicJwk, 'ES256');
  const refreshTokens = new Map<string, { userId: string; aal: 'aal1' | 'aal2' }>();
  const challenges = new Map<string, string>();

  const save = () => {
    if (options.dataFile)
      writeFileSync(options.dataFile, JSON.stringify({ users, jwk: privateJwk }, null, 2));
  };

  const app = express();
  app.use(express.json());
  let baseUrl = '';

  async function session(user: User, aal: 'aal1' | 'aal2') {
    const accessToken = await new SignJWT({
      email: user.email,
      role: 'authenticated',
      aal,
      session_id: randomUUID(),
    })
      .setProtectedHeader({ alg: 'ES256', kid: privateJwk?.kid })
      .setSubject(user.id)
      .setAudience('authenticated')
      .setIssuer(`${baseUrl}/auth/v1`)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);
    const refreshToken = randomBytes(24).toString('hex');
    refreshTokens.set(refreshToken, { userId: user.id, aal });
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 3600,
      token_type: 'bearer',
      user: { id: user.id, email: user.email },
    };
  }

  async function bearerUser(
    header: string | undefined,
  ): Promise<{ user: User; aal: string } | null> {
    const token = header?.replace(/^Bearer /, '');
    if (!token) return null;
    try {
      const { jwtVerify } = await import('jose');
      const { payload } = await jwtVerify(token, publicKey, { audience: 'authenticated' });
      const user = users.find((item) => item.id === payload.sub);
      return user ? { user, aal: String(payload.aal) } : null;
    } catch {
      return null;
    }
  }

  const factorView = (user: User) =>
    user.factors.map((factor) => ({ id: factor.id, factor_type: 'totp', status: factor.status }));

  app.get('/auth/v1/.well-known/jwks.json', (_req, res) => {
    res.json({ keys: [{ ...publicJwk, use: 'sig' }] });
  });

  app.post('/auth/v1/token', async (req, res) => {
    const body = req.body as { email?: string; password?: string; refresh_token?: string };
    if (req.query.grant_type === 'password') {
      const user = users.find((item) => item.email === body.email?.toLowerCase());
      if (!user || !checkPassword(body.password ?? '', user.passwordHash)) {
        res.status(400).json({ error: 'invalid_grant' });
        return;
      }
      res.json(await session(user, 'aal1'));
      return;
    }
    if (req.query.grant_type === 'refresh_token') {
      const entry = refreshTokens.get(body.refresh_token ?? '');
      const user = entry && users.find((item) => item.id === entry.userId);
      if (!entry || !user) {
        res.status(400).json({ error: 'invalid_grant' });
        return;
      }
      refreshTokens.delete(body.refresh_token ?? '');
      res.json(await session(user, entry.aal));
      return;
    }
    res.status(400).json({ error: 'unsupported_grant_type' });
  });

  app.get('/auth/v1/user', async (req, res) => {
    const found = await bearerUser(req.headers.authorization);
    if (!found) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    res.json({ id: found.user.id, email: found.user.email, factors: factorView(found.user) });
  });

  app.post('/auth/v1/factors', async (req, res) => {
    const found = await bearerUser(req.headers.authorization);
    if (!found) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    // Like Supabase: a second factor can only be added from a session that already passed two-factor.
    if (found.user.factors.some((factor) => factor.status === 'verified') && found.aal !== 'aal2') {
      res.status(422).json({ error: 'aal2_required' });
      return;
    }
    // Like Supabase: unfinished setups are kept, and two factors may not share a name.
    const name = (req.body as { friendly_name?: string }).friendly_name ?? '';
    if (found.user.factors.some((factor) => factor.name === name)) {
      res.status(422).json({ error_code: 'mfa_factor_name_conflict' });
      return;
    }
    const factor: Factor = {
      id: randomUUID(),
      secret: base32Encode(randomBytes(20)),
      status: 'unverified',
      name,
    };
    found.user.factors.push(factor);
    save();
    const uri = `otpauth://totp/Online%20Distributors:${encodeURIComponent(found.user.email)}?secret=${factor.secret}&issuer=Online%20Distributors`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60"><text x="4" y="34" font-size="12">Local test: type the secret instead</text></svg>`;
    res.json({
      id: factor.id,
      type: 'totp',
      totp: {
        // Raw SVG markup, exactly as Supabase sends it.
        qr_code: `<?xml version="1.0"?>
${svg}`,
        secret: factor.secret,
        uri,
      },
    });
  });

  app.post('/auth/v1/factors/:id/challenge', async (req, res) => {
    const found = await bearerUser(req.headers.authorization);
    if (!found || !found.user.factors.some((factor) => factor.id === req.params.id)) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const id = randomUUID();
    challenges.set(id, req.params.id);
    res.json({ id, expires_at: Math.floor(Date.now() / 1000) + 300 });
  });

  app.post('/auth/v1/factors/:id/verify', async (req, res) => {
    const found = await bearerUser(req.headers.authorization);
    const body = req.body as { challenge_id?: string; code?: string };
    const factor = found?.user.factors.find((item) => item.id === req.params.id);
    if (!found || !factor || challenges.get(body.challenge_id ?? '') !== factor.id) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    challenges.delete(body.challenge_id ?? '');
    const now = Date.now();
    const ok = [-30_000, 0, 30_000].some(
      (drift) => totpCode(factor.secret, now + drift) === body.code,
    );
    if (!ok) {
      res.status(422).json({ error: 'invalid_code' });
      return;
    }
    factor.status = 'verified';
    save();
    res.json(await session(found.user, 'aal2'));
  });

  app.post('/auth/v1/logout', async (req, res) => {
    const found = await bearerUser(req.headers.authorization);
    if (found)
      for (const [token, entry] of refreshTokens)
        if (entry.userId === found.user.id) refreshTokens.delete(token);
    res.status(204).end();
  });

  // Supabase's admin API, used by the create-admin script. Needs the service key.
  app.post('/auth/v1/admin/users', (req, res) => {
    if (!options.serviceKey || req.headers.authorization !== `Bearer ${options.serviceKey}`) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const body = req.body as { email?: string; password?: string };
    if (!body.email || !body.password) {
      res.status(400).json({ error: 'email and password required' });
      return;
    }
    const user = createUser(body.email, body.password);
    res.json({ id: user.id, email: user.email });
  });

  function createUser(email: string, password: string): User {
    const existing = users.find((item) => item.email === email.toLowerCase());
    if (existing) {
      existing.passwordHash = hashPassword(password);
      save();
      return existing;
    }
    const user: User = {
      id: randomUUID(),
      email: email.toLowerCase(),
      passwordHash: hashPassword(password),
      factors: [],
    };
    users.push(user);
    save();
    return user;
  }

  const server = app.listen(options.port ?? 0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;

  return {
    url: `${baseUrl}/auth/v1`,
    createUser,
    addVerifiedFactor(email) {
      const user = users.find((item) => item.email === email.toLowerCase());
      if (!user) throw new Error('No such user');
      const secret = base32Encode(randomBytes(20));
      user.factors = [{ id: randomUUID(), secret, status: 'verified' }];
      save();
      return secret;
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
