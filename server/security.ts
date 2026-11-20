import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function generateOpaqueToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const ALLOWED_EXTERNAL_HOSTS = new Set([
  'air-quality-api.open-meteo.com',
  'api.open-meteo.com',
  'geocoding-api.open-meteo.com',
]);

export function assertSafeExternalUrl(rawUrl: string): URL {
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:') {
    throw new Error(`Blocked non-HTTPS external request: ${url.protocol}`);
  }
  if (!ALLOWED_EXTERNAL_HOSTS.has(url.hostname)) {
    throw new Error(`Blocked non-allowlisted external host: ${url.hostname}`);
  }
  return url;
}

interface RateBucket {
  count: number;
  resetAt: number;
}

export function createRateLimiter(options: { windowMs: number; maxRequests: number; name: string }) {
  const buckets = new Map<string, RateBucket>();

  return (req: Request, res: Response, next: NextFunction): void => {
    // Allow bypassing rate limiter only in explicit automated test harness via env flag if needed
    if (process.env.CLEARAIR_DISABLE_RATE_LIMIT === 'true') {
      next();
      return;
    }

    const now = Date.now();
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${options.name}:${clientIp}`;
    const existing = buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      // Periodic cleanup if map grows
      if (buckets.size > 2000) {
        for (const [k, v] of buckets.entries()) {
          if (v.resetAt <= now) buckets.delete(k);
        }
      }
      next();
      return;
    }

    if (existing.count >= options.maxRequests) {
      const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({
        error: `Too many requests on ${options.name}. Please retry in ${retryAfterSec} seconds.`,
      });
      return;
    }

    existing.count += 1;
    next();
  };
}

export function setSessionCookies(res: Response, sessionToken: string, csrfToken: string, maxAgeMs: number): void {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('clearair_session', sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    path: '/',
    maxAge: maxAgeMs,
  });
  res.cookie('clearair_csrf', csrfToken, {
    httpOnly: false, // readable by JS so frontend attaches X-CSRF-Token header
    sameSite: 'lax',
    secure: isProd,
    path: '/',
    maxAge: maxAgeMs,
  });
}

export function clearSessionCookies(res: Response): void {
  res.clearCookie('clearair_session', { path: '/' });
  res.clearCookie('clearair_csrf', { path: '/' });
}
