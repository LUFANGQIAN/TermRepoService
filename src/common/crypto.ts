import { createHash, createHmac, pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

export function randomToken(prefix: string, byteLength = 24): string {
  return `${prefix}_${randomBytes(byteLength).toString('base64url')}`;
}

export function hashValue(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('base64url');
  const hash = pbkdf2Sync(password, salt, 120000, 32, 'sha256').toString('base64url');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const actual = pbkdf2Sync(password, salt, 120000, 32, 'sha256').toString('base64url');
  const expectedBuffer = Buffer.from(hash);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

interface JwtPayload {
  sub: string;
  email: string;
  exp: number;
  type: 'access';
}

function base64Json(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function sign(input: string, secret: string): string {
  return createHmac('sha256', secret).update(input).digest('base64url');
}

export function createAccessJwt(payload: Omit<JwtPayload, 'exp' | 'type'>, secret: string, ttlSeconds: number): string {
  const header = base64Json({ alg: 'HS256', typ: 'JWT' });
  const body = base64Json({ ...payload, type: 'access', exp: Math.floor(Date.now() / 1000) + ttlSeconds });
  const input = `${header}.${body}`;
  return `${input}.${sign(input, secret)}`;
}

export function verifyAccessJwt(token: string, secret: string): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  const expected = sign(`${header}.${body}`, secret);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length || !timingSafeEqual(expectedBuffer, signatureBuffer)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as JwtPayload;
    if (payload.type !== 'access' || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function id(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

