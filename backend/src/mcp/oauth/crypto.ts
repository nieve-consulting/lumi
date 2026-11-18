import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { jwtVerify, SignJWT, type JWTPayload } from "jose"

import { mcpConfig } from "../config"

// Every signed value uses its own key derived from MCP_TOKEN_SECRET and its own JWT type, so one kind can never be accepted
// as another (an authorization request as an access token, say)
export type SignedKind = "access_token" | "authorization_request" | "login_state" | "login_cookie"

const keys = new Map<SignedKind, Uint8Array>()

function keyFor(kind: SignedKind) {
  let key = keys.get(kind)
  if (!key) {
    key = createHmac("sha256", mcpConfig.tokenSecret).update(`lumi-mcp:${kind}`).digest()
    keys.set(kind, key)
  }
  return key
}

const typeOf = (kind: SignedKind) => (kind === "access_token" ? "at+jwt" : `lumi-${kind.replace("_", "-")}+jwt`)

export async function sign(kind: SignedKind, claims: JWTPayload, ttlSeconds: number, audience = mcpConfig.issuer) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256", typ: typeOf(kind) })
    .setIssuer(mcpConfig.issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(keyFor(kind))
}

// Verifies the signature, type, issuer, audience and expiry. Throws when any check fails
export async function verify<T extends JWTPayload>(kind: SignedKind, token: string, audience = mcpConfig.issuer) {
  const { payload } = await jwtVerify<T>(token, keyFor(kind), {
    algorithms: ["HS256"],
    typ: typeOf(kind),
    issuer: mcpConfig.issuer,
    audience,
    requiredClaims: ["exp", "iat"],
  })
  return payload
}

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url")

// Codes and refresh tokens are stored as hashes, so a database read does not reveal usable credentials
export const hashToken = (token: string) => createHash("sha256").update(token).digest("base64url")

export function safeEqual(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

// PKCE S256: the challenge is BASE64URL(SHA256(code_verifier)), the same digest as hashToken
export const pkceChallenge = hashToken

// The code_verifier must match the code_challenge of the authorization request
export function pkceMatches(verifier: string, challenge: string) {
  return /^[A-Za-z0-9._~-]{43,128}$/.test(verifier) && safeEqual(pkceChallenge(verifier), challenge)
}
