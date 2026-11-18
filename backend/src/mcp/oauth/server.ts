import { randomUUID } from "node:crypto"
import { verifyAdminCredentials, type AdminAccountRecord } from "@/services/adminAccounts"
import { AdminSignInThrottledError } from "@/services/adminSignInThrottle"
import type { Tx } from "@/services/db"
import { pgError } from "@/services/errors"
import type { DbType } from "@db/db"
import { oauthAuthorizationCodes, oauthRefreshTokens } from "@db/schema"
import { and, eq, isNull } from "drizzle-orm"

import { isAuthConfigured, mcpConfig, SCOPES, SUPPORTED_SCOPES, type Scope } from "../config"
import { BodyTooLargeError, cookie, json, oauthError, readCookie, readForm, readText, redirect, SOURCE_IP_HEADER } from "../http"
import { InvalidClientError, isAllowedRedirectUri, registerClient, registrationSchema, resolveClient } from "./clients"
import { hashToken, pkceChallenge, pkceMatches, randomToken, safeEqual, sign, verify } from "./crypto"
import { teamPermissions as googleTeamPermissions, MembershipCheckError } from "./directory"
import { exchangeGoogleCode, googleAuthorizationUrl, isAllowedDomain } from "./google"
import { consentPage, errorPage, localConsentPage, type ConsentDetails, type SignInState } from "./pages"
import { isLocalSub, localSub, teamPermissions } from "./team"

// OAuth 2.1 authorization server for the MCP server: authorization code with PKCE (S256), Client ID Metadata Documents and
// Dynamic Client Registration, resource indicators (RFC 8707) and issuer identification (RFC 9207). Team members sign in by
// the method of ADMIN_AUTH_PROVIDER: with Google Workspace (the consent page continues to Google, whose answer comes back to
// /oauth/callback), or with their Lumi admin account (local: the consent page asks for its email and password). This server
// then issues its own short-lived access tokens, bound to the MCP resource, and rotating refresh tokens. Signing in grants no
// access by itself: the account must be in the team's Google Group, or for local sign-in still exist with the password it
// signed in with, which is checked at sign-in, at every refresh and on every protected tool call (team.ts).

const CONSENT_COOKIE = "lumi_mcp_consent"
const LOGIN_COOKIE = "lumi_mcp_login"
const secureCookies = () => mcpConfig.baseUrl.startsWith("https://")

type AuthorizationRequest = {
  cid: string
  cname: string | null
  chost: string | null
  ruri: string
  cc: string
  scp: Scope[]
  res: string
  st: string | null
  // Hash of the consent cookie: ties the consent form to the browser that opened it
  csrf: string
}

export function authorizationServerMetadata() {
  const { issuer, baseUrl } = mcpConfig
  return {
    issuer,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    registration_endpoint: `${baseUrl}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: SUPPORTED_SCOPES,
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
  }
}

export function protectedResourceMetadata() {
  return {
    resource: mcpConfig.resource,
    authorization_servers: [mcpConfig.issuer],
    scopes_supported: SUPPORTED_SCOPES,
    bearer_methods_supported: ["header"],
    resource_name: "Lumi",
  }
}

// The canonical resource; a client may also name the server by its origin
function canonicalResource(value: string | null) {
  if (value === null) return mcpConfig.resource
  const normalized = value.replace(/\/$/, "")
  return normalized === mcpConfig.resource || normalized === mcpConfig.baseUrl ? mcpConfig.resource : undefined
}

function parseScopes(value: string | null): Scope[] | undefined {
  if (value === null || !value.trim()) return [SCOPES.read]
  // Unknown scopes (offline_access, for one) are ignored rather than rejected
  const scopes = SUPPORTED_SCOPES.filter((scope) => value.split(/\s+/).includes(scope))
  return scopes.length ? scopes : undefined
}

// Authorization responses carry the issuer (RFC 9207), errors included
function clientRedirect(redirectUri: string, params: Record<string, string | null | undefined>, cookies: string[] = []) {
  const url = new URL(redirectUri)
  for (const [name, value] of Object.entries({ ...params, iss: mcpConfig.issuer })) {
    if (value) url.searchParams.set(name, value)
  }
  return redirect(url.toString(), cookies)
}

const clearCookies = () => [cookie(CONSENT_COOKIE, "", 0, secureCookies()), cookie(LOGIN_COOKIE, "", 0, secureCookies())]

// GET /oauth/authorize: validates the request and shows the consent page. Until the client and its redirect URI are known
// to be valid, errors are shown here rather than redirected
async function authorize(db: DbType, url: URL) {
  const params = url.searchParams
  const clientId = params.get("client_id") || ""
  const redirectUri = params.get("redirect_uri") || ""

  let client
  try {
    client = await resolveClient(db, clientId)
  } catch (error) {
    return errorPage(error instanceof InvalidClientError ? error.message : "The client could not be verified.")
  }
  if (!client.redirectUris.includes(redirectUri) || !isAllowedRedirectUri(redirectUri)) {
    return errorPage("The redirect URI is not registered for this client or is not allowed.")
  }

  const state = params.get("state")
  const fail = (error: string, description: string) => clientRedirect(redirectUri, { error, error_description: description, state })

  if (params.get("response_type") !== "code") return fail("unsupported_response_type", "Only the authorization code flow is supported.")
  const challenge = params.get("code_challenge") || ""
  if (params.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) {
    return fail("invalid_request", "PKCE with code_challenge_method S256 is required.")
  }
  const scopes = parseScopes(params.get("scope"))
  if (!scopes) return fail("invalid_scope", `Supported scopes: ${SUPPORTED_SCOPES.join(" ")}.`)
  const resource = canonicalResource(params.get("resource"))
  if (!resource) return fail("invalid_target", `Tokens can only be issued for ${mcpConfig.resource}.`)

  const csrf = randomToken()
  const request: AuthorizationRequest = {
    cid: client.clientId,
    cname: client.name,
    chost: client.verifiedHost,
    ruri: redirectUri,
    cc: challenge,
    scp: scopes,
    res: resource,
    st: state,
    csrf: hashToken(csrf),
  }
  const requestToken = await sign("authorization_request", { ...request }, mcpConfig.loginTtlSeconds)

  const details = { clientName: client.name, verifiedHost: client.verifiedHost, redirectHost: new URL(redirectUri).host, scopes, requestToken }
  const cookies = [cookie(CONSENT_COOKIE, csrf, mcpConfig.loginTtlSeconds, secureCookies())]
  return mcpConfig.authProvider === "local" ? localConsentPage(details, {}, 200, cookies) : consentPage(details, cookies)
}

// Issues the authorization code of a signed-in user and sends it to the client. A local sign-in's code records when the
// password was verified, which its tokens carry so later checks can compare it with the account's password changes (team.ts)
async function issueCode(
  db: DbType,
  authz: AuthorizationRequest,
  scopes: Scope[],
  user: { sub: string; email: string; name: string | null },
  signedInAt?: Date
) {
  const code = randomToken()
  await db.insert(oauthAuthorizationCodes).values({
    code_hash: hashToken(code),
    signed_in_at: signedInAt ?? null,
    expires_at: new Date(Date.now() + mcpConfig.authorizationCodeTtlSeconds * 1000),
    client_id: authz.cid,
    redirect_uri: authz.ruri,
    code_challenge: authz.cc,
    scopes,
    resource: authz.res,
    user_sub: user.sub,
    user_email: user.email,
    user_name: user.name,
    family_id: randomUUID(),
  })

  console.log(JSON.stringify({ event: "mcp_authorization_granted", sub: user.sub, client_id: authz.cid, scopes }))
  return clientRedirect(authz.ruri, { code, state: authz.st }, clearCookies())
}

// The admin sign-in's own messages (frontend/src/lib/auth/messages.ts): generic, so none tells whether the email has an account
const SIGN_IN_FAILED = "Email or password is incorrect."
const SIGN_IN_THROTTLED = "Too many failed sign-in attempts. Wait 15 minutes, then try again."
const SIGN_IN_UNAVAILABLE = "Your email and password couldn't be checked right now. Try again in a moment."
const CHANGE_PASSWORD_PATH = "/auth/change-password"

// Local sign-in: the consent form's email and password approve the connection. A failed attempt shows the form again with the
// same request and consent cookie, so the admin can try again; failures count toward the admin sign-in's limits per email and
// per client address (verifyAdminCredentials). The password is never logged nor shown again
async function localSignIn(db: DbType, request: Request, form: URLSearchParams, authz: AuthorizationRequest) {
  const email = (form.get("email") || "").trim()
  const password = form.get("password") || ""
  const details: ConsentDetails = {
    clientName: authz.cname,
    verifiedHost: authz.chost,
    redirectHost: new URL(authz.ruri).host,
    scopes: authz.scp,
    requestToken: form.get("request") || "",
  }
  const retry = (error: SignInState["error"], status: number) => localConsentPage(details, { email, error }, status)

  if (!email || !password) return retry({ message: SIGN_IN_FAILED, fields: true }, 401)

  let account: AdminAccountRecord | null
  try {
    account = await verifyAdminCredentials(db, { email, password, clientIp: request.headers.get(SOURCE_IP_HEADER) })
  } catch (error) {
    if (error instanceof AdminSignInThrottledError) return retry({ message: SIGN_IN_THROTTLED }, 429)
    // Not the error itself: a query error quotes its parameters
    console.error("[MCP]: The admin sign-in check failed:", pgError(error)?.code ?? (error as Error).name)
    return retry({ message: SIGN_IN_UNAVAILABLE }, 503)
  }
  if (!account) return retry({ message: SIGN_IN_FAILED, fields: true }, 401)

  if (account.must_change_password) {
    return retry(
      {
        message:
          "This account still has a temporary password. Sign in to the Lumi admin with it and choose your own password, then come back to this page and sign in with the new one.",
        link: { href: `${mcpConfig.appBaseUrl}${CHANGE_PASSWORD_PATH}`, text: "Open the Lumi admin (new tab)" },
      },
      403
    )
  }

  // Every admin reads and writes, as in the admin interface
  return issueCode(
    db,
    authz,
    authz.scp,
    { sub: localSub(account.id), email: account.email, name: account.name },
    account.last_sign_in_at ?? new Date()
  )
}

// POST /oauth/authorize: the consent decision. Approval starts the Google sign-in, or with local sign-in checks the email and
// password the form carries
async function decide(db: DbType, request: Request) {
  const form = await readForm(request)
  let authz: AuthorizationRequest
  try {
    authz = await verify<AuthorizationRequest>("authorization_request", form.get("request") || "")
  } catch {
    return errorPage("This sign-in request has expired. Start connecting again from your application.")
  }

  // Cross-site posts carry no consent cookie (SameSite=Lax), so a page elsewhere cannot approve on the user's behalf
  const consentCookie = readCookie(request, CONSENT_COOKIE)
  if (!consentCookie || !safeEqual(hashToken(consentCookie), authz.csrf)) {
    return errorPage("This sign-in request was not started in this browser. Start connecting again from your application.", 403)
  }

  if (form.get("decision") !== "approve") {
    return clientRedirect(
      authz.ruri,
      { error: "access_denied", error_description: "The user cancelled the request.", state: authz.st },
      clearCookies()
    )
  }

  if (mcpConfig.authProvider === "local") return localSignIn(db, request, form, authz)

  const nonce = randomToken()
  const verifier = randomToken(48)
  const state = await sign("login_state", { authz, nonce: hashToken(nonce) }, mcpConfig.loginTtlSeconds)
  const loginCookie = await sign("login_cookie", { nonce, verifier }, mcpConfig.loginTtlSeconds)

  return redirect(googleAuthorizationUrl({ state, nonce, codeChallenge: pkceChallenge(verifier) }), [
    cookie(CONSENT_COOKIE, "", 0, secureCookies()),
    cookie(LOGIN_COOKIE, loginCookie, mcpConfig.loginTtlSeconds, secureCookies()),
  ])
}

// GET /oauth/callback: Google's answer. Checks the account and its team membership, then issues the authorization code
async function callback(db: DbType, request: Request, url: URL) {
  let authz: AuthorizationRequest
  let login: { nonce: string; verifier: string }
  try {
    const state = await verify<{ authz: AuthorizationRequest; nonce: string }>("login_state", url.searchParams.get("state") || "")
    login = await verify<{ nonce: string; verifier: string }>("login_cookie", readCookie(request, LOGIN_COOKIE) || "")
    if (!safeEqual(hashToken(login.nonce), state.nonce)) throw new Error("Login state mismatch")
    authz = state.authz
  } catch {
    return errorPage("This sign-in could not be verified or has expired. Start connecting again from your application.", 403)
  }

  const fail = (error: string, description: string) =>
    clientRedirect(authz.ruri, { error, error_description: description, state: authz.st }, clearCookies())

  if (url.searchParams.get("error") || !url.searchParams.get("code")) return fail("access_denied", "Google sign-in was cancelled.")

  let identity
  try {
    identity = await exchangeGoogleCode(url.searchParams.get("code")!, login.verifier, login.nonce)
  } catch (error) {
    console.warn("[MCP]: Google sign-in failed:", (error as Error).message)
    return fail("access_denied", "Google sign-in failed.")
  }
  if (!isAllowedDomain(identity.hd)) return fail("access_denied", "Sign in with your team's Google Workspace account.")

  let permissions
  try {
    permissions = await googleTeamPermissions(identity.sub)
  } catch (error) {
    if (error instanceof MembershipCheckError) return fail("temporarily_unavailable", "Team membership could not be verified. Try again in a moment.")
    throw error
  }

  // Only the requested scopes the account's team permissions allow are granted
  const scopes = authz.scp.filter((scope) => (scope === SCOPES.write ? permissions.write : permissions.read))
  if (!scopes.length) return fail("access_denied", "Your account is not a member of the Lumi team with the requested access.")

  return issueCode(db, authz, scopes, { sub: identity.sub, email: identity.email, name: identity.name })
}

interface Grant {
  clientId: string
  scopes: string[]
  resource: string
  user: { sub: string; email: string; name: string | null }
  familyId: string
  // Local sign-in: when the user signed in, carried by the access token so each tool call can compare it with password changes
  signedInAt?: number
}

// Signs the access token and stores the refresh token with the writer it is given, so a rotation commits atomically
async function issueTokens(db: Pick<Tx, "insert">, grant: Grant) {
  const accessToken = await sign(
    "access_token",
    {
      sub: grant.user.sub,
      email: grant.user.email,
      name: grant.user.name,
      client_id: grant.clientId,
      scope: grant.scopes.join(" "),
      jti: randomUUID(),
      ...(grant.signedInAt !== undefined && { auth_time_ms: grant.signedInAt }),
    },
    mcpConfig.accessTokenTtlSeconds,
    grant.resource
  )
  const refreshToken = randomToken()
  await db.insert(oauthRefreshTokens).values({
    token_hash: hashToken(refreshToken),
    expires_at: new Date(Date.now() + mcpConfig.refreshTokenTtlSeconds * 1000),
    family_id: grant.familyId,
    client_id: grant.clientId,
    scopes: grant.scopes,
    resource: grant.resource,
    user_sub: grant.user.sub,
    user_email: grant.user.email,
    user_name: grant.user.name,
    signed_in_at: grant.signedInAt !== undefined ? new Date(grant.signedInAt) : null,
  })

  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: mcpConfig.accessTokenTtlSeconds,
    refresh_token: refreshToken,
    scope: grant.scopes.join(" "),
  }
}

// Whether a spent refresh token was rotated recently enough for its reuse to be a concurrent or retried refresh
const inReuseGrace = (usedAt: Date) => Date.now() - usedAt.getTime() < mcpConfig.refreshTokenReuseGraceSeconds * 1000

const revokeFamily = (db: Pick<Tx, "update">, familyId: string) =>
  db
    .update(oauthRefreshTokens)
    .set({ revoked_at: new Date() })
    .where(and(eq(oauthRefreshTokens.family_id, familyId), isNull(oauthRefreshTokens.revoked_at)))

async function exchangeCode(db: DbType, form: URLSearchParams) {
  const codeHash = hashToken(form.get("code") || "")
  const resource = canonicalResource(form.get("resource"))

  // Redeemed at most once, and the code is spent and its tokens stored in one transaction: a failure leaves neither behind
  const outcome = await db.transaction(async (tx) => {
    // Locked so concurrent redemptions of the same code run one after the other
    const [grant] = await tx.select().from(oauthAuthorizationCodes).where(eq(oauthAuthorizationCodes.code_hash, codeHash)).for("update")
    if (!grant || grant.expires_at <= new Date()) return "invalid"
    if (grant.used_at) {
      // A replayed code revokes whatever it already issued
      await revokeFamily(tx, grant.family_id)
      return "invalid"
    }

    // The first redemption attempt spends the code, even when the checks below fail
    await tx.update(oauthAuthorizationCodes).set({ used_at: new Date() }).where(eq(oauthAuthorizationCodes.code_hash, codeHash))
    if (
      grant.client_id !== form.get("client_id") ||
      grant.redirect_uri !== form.get("redirect_uri") ||
      !pkceMatches(form.get("code_verifier") || "", grant.code_challenge) ||
      resource !== grant.resource
    ) {
      return "mismatch"
    }

    return issueTokens(tx, {
      clientId: grant.client_id,
      scopes: grant.scopes,
      resource: grant.resource,
      user: { sub: grant.user_sub, email: grant.user_email, name: grant.user_name },
      familyId: grant.family_id,
      // Set by a local sign-in (issueCode)
      signedInAt: grant.signed_in_at?.getTime(),
    })
  })

  if (outcome === "invalid") return oauthError("invalid_grant", "The authorization code is invalid, expired or already used.")
  if (outcome === "mismatch") return oauthError("invalid_grant", "The code does not match this client, redirect URI, code_verifier or resource.")
  return json(outcome)
}

async function refresh(db: DbType, form: URLSearchParams) {
  const tokenHash = hashToken(form.get("refresh_token") || "")
  const [current] = await db.select().from(oauthRefreshTokens).where(eq(oauthRefreshTokens.token_hash, tokenHash))
  const invalid = () => oauthError("invalid_grant", "The refresh token is invalid, expired or revoked.")

  if (!current || current.revoked_at || current.expires_at < new Date() || current.client_id !== form.get("client_id")) return invalid()

  // Each refresh token works once. Reusing a rotated one (a stolen copy, or a replay) revokes the whole family, except within a
  // short grace period, where it is a client's concurrent refreshes or a retry after a lost response
  if (current.used_at && !inReuseGrace(current.used_at)) {
    await revokeFamily(db, current.family_id)
    return invalid()
  }

  // Every check runs before the token is spent, so a failed or unavailable check leaves it usable for a retry
  const resource = canonicalResource(form.get("resource"))
  if (resource !== current.resource) return oauthError("invalid_target", `Tokens can only be issued for ${current.resource}.`)

  const requested = form.get("scope")
  const scopes = requested ? current.scopes.filter((scope) => requested.split(/\s+/).includes(scope)) : current.scopes
  if (!scopes.length) return oauthError("invalid_scope", "The requested scope exceeds the granted scope.")

  // Leaving the team ends the connection at the next refresh, and so does a local account's removal or password change
  const local = isLocalSub(current.user_sub)
  // A local sign-in's time, which the token family carries from its authorization code
  const signedInAt = current.signed_in_at?.getTime()
  let permissions
  try {
    permissions = await teamPermissions(db, { sub: current.user_sub, signedInAt })
  } catch (error) {
    if (error instanceof MembershipCheckError) {
      return oauthError("temporarily_unavailable", local ? "The admin account could not be verified." : "Team membership could not be verified.", 503)
    }
    throw error
  }
  const allowed = scopes.filter((scope) => (scope === SCOPES.write ? permissions.write : permissions.read))
  if (!allowed.length) {
    await revokeFamily(db, current.family_id)
    return oauthError(
      "invalid_grant",
      local
        ? "The Lumi sign-in has ended because the admin password was changed or reset, or the account was removed. Connect Lumi again and sign in with the current password."
        : "The account is no longer a member of the Lumi team."
    )
  }

  // Rotation: the token is spent and its replacement stored in one transaction. The row is locked, so concurrent refreshes with
  // the same token run one after the other
  const tokens = await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(oauthRefreshTokens).where(eq(oauthRefreshTokens.token_hash, tokenHash)).for("update")
    if (!locked || locked.revoked_at) return undefined
    if (locked.used_at) {
      // Spent meanwhile: another refresh within the grace period gets its own tokens, anything later is reuse
      if (!inReuseGrace(locked.used_at)) {
        await revokeFamily(tx, locked.family_id)
        return undefined
      }
    } else {
      await tx.update(oauthRefreshTokens).set({ used_at: new Date() }).where(eq(oauthRefreshTokens.token_hash, tokenHash))
    }

    return issueTokens(tx, {
      clientId: current.client_id,
      scopes: allowed,
      resource: current.resource,
      user: { sub: current.user_sub, email: current.user_email, name: current.user_name },
      familyId: current.family_id,
      signedInAt,
    })
  })

  return tokens ? json(tokens) : invalid()
}

// POST /oauth/token
async function token(db: DbType, request: Request) {
  const form = await readForm(request)
  switch (form.get("grant_type")) {
    case "authorization_code":
      return exchangeCode(db, form)
    case "refresh_token":
      return refresh(db, form)
    default:
      return oauthError("unsupported_grant_type", "Supported grant types: authorization_code, refresh_token.")
  }
}

// POST /oauth/register: Dynamic Client Registration (RFC 7591) for public clients
async function register(db: DbType, request: Request) {
  const body = await readText(request)
  let metadata: unknown
  try {
    metadata = JSON.parse(body)
  } catch {
    metadata = undefined
  }
  const parsed = registrationSchema.safeParse(metadata)
  if (!parsed.success) return oauthError("invalid_client_metadata", "redirect_uris (1 to 5 URLs) is required; client_name is optional.")

  const invalid = parsed.data.redirect_uris.find((uri) => !isAllowedRedirectUri(uri))
  if (invalid) return oauthError("invalid_redirect_uri", `The redirect URI ${invalid} is not allowed by this server.`)

  const client = await registerClient(db, parsed.data)

  return json(
    {
      client_id: client.client_id,
      client_id_issued_at: Math.floor(client.created_at.getTime() / 1000),
      client_name: client.client_name ?? undefined,
      redirect_uris: client.redirect_uris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      // Only public clients are supported, whatever method was asked for
      token_endpoint_auth_method: "none",
    },
    201
  )
}

// Routes of the authorization server, or undefined for other paths
export async function handleOAuthRequest(db: DbType, request: Request, url: URL): Promise<Response | undefined> {
  const route = `${request.method} ${url.pathname}`
  const routes: Record<string, () => Promise<Response>> = {
    "GET /oauth/authorize": () => authorize(db, url),
    "POST /oauth/authorize": () => decide(db, request),
    // Google's answer, only with Google Workspace sign-in
    ...(mcpConfig.authProvider !== "local" && { "GET /oauth/callback": () => callback(db, request, url) }),
    "POST /oauth/token": () => token(db, request),
    "POST /oauth/register": () => register(db, request),
  }

  const handler = routes[route]
  if (!handler) return undefined
  if (!isAuthConfigured()) return oauthError("temporarily_unavailable", "Sign-in is not configured on this server.", 503)

  try {
    return await handler()
  } catch (error) {
    if (error instanceof BodyTooLargeError) return oauthError("invalid_request", "The request body is too large.", 413)
    throw error
  }
}
