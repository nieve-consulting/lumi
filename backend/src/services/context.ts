import { parseAuthProvider, signInWith } from "@/mcp/settings"
import type { DbType } from "@db/db"

import { ServiceError } from "./errors"

// Team member acting through an authorized client (a Google Workspace account in the Lumi team group)
export interface Actor {
  sub: string
  email: string
  name?: string | null
  // OAuth client the request came from (e.g. ChatGPT), recorded in the audit trail
  clientId?: string
}

export type TeamPermission = "read" | "write"

// Who the services act for. Public access only ever sees records approved for external disclosure; team access is created by
// the MCP server after it has verified the token's scopes and the account's current team membership
export type ServiceAccess = { kind: "public" } | { kind: "team"; actor: Actor; permissions: ReadonlySet<TeamPermission> }

export interface ServiceContext {
  db: DbType
  access: ServiceAccess
}

// Context of the public website chatbot and anonymous MCP calls: no credentials, public records and fields only
export function publicContext(db: DbType): ServiceContext {
  return { db, access: { kind: "public" } }
}

export function teamContext(db: DbType, actor: Actor, permissions: TeamPermission[]): ServiceContext {
  return { db, access: { kind: "team", actor, permissions: new Set(permissions) } }
}

// Every team operation checks its permission here, whatever the caller already checked at its own boundary
export function requireTeam(ctx: ServiceContext, permission: TeamPermission): Actor {
  if (ctx.access.kind !== "team") {
    throw new ServiceError("unauthenticated", `Sign in with ${signInWith(parseAuthProvider(process.env.ADMIN_AUTH_PROVIDER))} to use this operation.`)
  }
  if (!ctx.access.permissions.has(permission)) {
    throw new ServiceError("forbidden", `Your account does not have ${permission} access to Lumi records.`)
  }

  return ctx.access.actor
}
