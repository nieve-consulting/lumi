import { OAuth2Client } from "google-auth-library"

import { mcpConfig } from "../config"

// Google Workspace is the identity provider: the authorization server signs team members in with Google (OpenID Connect,
// authorization code with PKCE) and then issues its own tokens for the MCP server. Google's tokens are never kept

export const googleRedirectUri = () => `${mcpConfig.baseUrl}/oauth/callback`

let client: OAuth2Client | undefined

function getClient() {
  client ??= new OAuth2Client({ clientId: mcpConfig.google.clientId, clientSecret: mcpConfig.google.clientSecret, redirectUri: googleRedirectUri() })
  return client
}

export function googleAuthorizationUrl({ state, nonce, codeChallenge }: { state: string; nonce: string; codeChallenge: string }) {
  const { allowedDomains } = mcpConfig
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth")
  url.search = new URLSearchParams({
    client_id: mcpConfig.google.clientId,
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    // The user always picks the account, so signing in to Lumi is a deliberate step
    prompt: "select_account",
    // Only a hint for the account chooser; the validated hd claim is checked after sign-in
    ...(allowedDomains.length === 1 && { hd: allowedDomains[0] }),
  }).toString()

  return url.toString()
}

export interface GoogleIdentity {
  sub: string
  email: string
  name: string | null
  hd: string | null
}

// Exchanges the code and validates the ID token (signature, issuer, audience, expiry) and its nonce
export async function exchangeGoogleCode(code: string, codeVerifier: string, nonce: string): Promise<GoogleIdentity> {
  const { tokens } = await getClient().getToken({ code, codeVerifier, redirect_uri: googleRedirectUri() })
  if (!tokens.id_token) throw new Error("Google returned no ID token")

  const ticket = await getClient().verifyIdToken({ idToken: tokens.id_token, audience: mcpConfig.google.clientId })
  const payload = ticket.getPayload()
  if (!payload?.sub || !payload.email || payload.nonce !== nonce) throw new Error("The Google ID token is invalid")
  if (payload.email_verified !== true) throw new Error("The Google account email is not verified")

  return { sub: payload.sub, email: payload.email, name: payload.name ?? null, hd: payload.hd ?? null }
}

export function isAllowedDomain(hd: string | null) {
  return Boolean(hd) && mcpConfig.allowedDomains.includes(hd!.toLowerCase())
}
