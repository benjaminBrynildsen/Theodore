import crypto from 'crypto';

const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
const APPLE_ISSUER = 'https://appleid.apple.com';

interface AppleJwk {
  kty: 'RSA';
  kid: string;
  use: string;
  alg: string;
  n: string;
  e: string;
}

interface JwksCache {
  fetchedAt: number;
  keys: AppleJwk[];
}

let _jwksCache: JwksCache | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000; // 1 hour

async function getAppleJwks(): Promise<AppleJwk[]> {
  if (_jwksCache && Date.now() - _jwksCache.fetchedAt < JWKS_TTL_MS) {
    return _jwksCache.keys;
  }
  const res = await fetch(APPLE_JWKS_URL);
  if (!res.ok) throw new Error(`Apple JWKS fetch failed: ${res.status}`);
  const data = (await res.json()) as { keys: AppleJwk[] };
  _jwksCache = { fetchedAt: Date.now(), keys: data.keys };
  return data.keys;
}

function base64UrlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

export interface AppleIdentityClaims {
  sub: string;
  email?: string;
  email_verified?: boolean | string;
  is_private_email?: boolean | string;
  aud: string;
  iss: string;
  exp: number;
  iat: number;
}

/**
 * Verify an Apple identity token (JWT) against Apple's published JWKS.
 * Throws if signature, issuer, audience, or expiry don't validate.
 */
export async function verifyAppleIdentityToken(
  token: string,
  expectedAudience: string,
): Promise<AppleIdentityClaims> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed identity token.');
  const [headerB64, payloadB64, signatureB64] = parts;

  const header = JSON.parse(base64UrlDecode(headerB64).toString('utf8')) as {
    kid: string;
    alg: string;
  };
  if (header.alg !== 'RS256') throw new Error(`Unexpected JWT alg: ${header.alg}`);

  const keys = await getAppleJwks();
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error(`No matching Apple JWK for kid=${header.kid}`);

  const publicKey = crypto.createPublicKey({ key: jwk as any, format: 'jwk' });
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = base64UrlDecode(signatureB64);

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(signingInput);
  verifier.end();
  const ok = verifier.verify(publicKey, signature);
  if (!ok) throw new Error('Apple identity token signature invalid.');

  const claims = JSON.parse(base64UrlDecode(payloadB64).toString('utf8')) as AppleIdentityClaims;
  if (claims.iss !== APPLE_ISSUER) throw new Error(`Bad iss: ${claims.iss}`);
  if (claims.aud !== expectedAudience) throw new Error(`Bad aud: ${claims.aud}`);
  const now = Math.floor(Date.now() / 1000);
  if (claims.exp < now) throw new Error('Apple identity token expired.');

  return claims;
}
