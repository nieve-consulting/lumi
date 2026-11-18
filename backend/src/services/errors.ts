// Errors the entity services raise. Their messages are written for the caller (staff in ChatGPT, Lumi's model): they say what
// to change, and never include SQL, stack traces or secrets
export type ServiceErrorCode = "invalid_input" | "not_found" | "conflict" | "forbidden" | "unauthenticated" | "rate_limited" | "unavailable"

export class ServiceError extends Error {
  constructor(
    readonly code: ServiceErrorCode,
    message: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message)
    this.name = "ServiceError"
  }
}

export const notFound = (entity: string, id: string) => new ServiceError("not_found", `No ${entity} was found with id ${id}.`, { entity, id })

export const invalidInput = (message: string, details?: Record<string, unknown>) => new ServiceError("invalid_input", message, details)

export const conflict = (message: string, details?: Record<string, unknown>) => new ServiceError("conflict", message, details)

interface PgError {
  code?: string
  constraint?: string
  cause?: unknown
}

// Postgres error behind a Drizzle query error, if any
export function pgError(error: unknown): PgError | undefined {
  let current = error as PgError | undefined
  for (let depth = 0; current && depth < 3; depth++) {
    if (typeof current.code === "string") return current
    current = current.cause as PgError | undefined
  }
}

// Maps database constraint violations to actionable errors. Anything else is rethrown as is and reported as an internal error
export function mapDbError(error: unknown, entity: string): never {
  if (error instanceof ServiceError) throw error

  const pg = pgError(error)
  switch (pg?.code) {
    case "23505":
      throw conflict(
        `Another ${entity} already uses this value${pg.constraint?.includes("slug") ? " as its url_slug" : ""}. Choose a different one.`,
        {
          constraint: pg.constraint,
        }
      )
    case "23503":
      throw invalidInput(`A referenced record does not exist. Look it up with the team read tools and use its id.`)
    case "22P02":
    case "22007":
    case "22008":
      throw invalidInput(`A value has an invalid format.`)
    case "22001":
      throw invalidInput(`A value is too long.`)
  }

  throw error
}
