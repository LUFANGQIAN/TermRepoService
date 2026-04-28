export function extractBearerToken(authHeader?: string | string[]): string {
  const auth = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  return auth?.replace(/^Bearer\s+/i, '').trim() ?? '';
}
