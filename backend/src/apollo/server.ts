import { ApolloServer, ApolloServerPlugin } from "@apollo/server"

import { accessPlugin } from "./access"
import { resolvers, typeDefs } from "./schema"
import type { Context } from "./types"

// Passwords (the admin accounts' password, currentPassword, newPassword and temporaryPassword) and secrets (a new API key's,
// a webhook's signing secret) are never logged: neither in the variables or the response, nor as string literals of an
// operation that mentions one
const SENSITIVE_KEY = /^(password|currentPassword|newPassword|temporaryPassword|secret)$/

const redactQuery = (query: string | undefined) =>
  query && /password|secret/i.test(query) ? query.replace(/"(?:[^"\\]|\\.)*"/g, '"[redacted]"') : query

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact)
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, SENSITIVE_KEY.test(key) ? "[redacted]" : redact(entry)]))
  }
  return value
}

// What each API key may do is enforced on every request (./access.ts): the context's role comes from the key, which the
// container api (src/container/api.ts) or the HTTP API's authorizer (src/authorizers/httpApi.ts) resolved
const plugins: ApolloServerPlugin<Context>[] = [accessPlugin]
if (process.env.NODE_ENV !== "production") {
  const loggingPlugin: ApolloServerPlugin<Context> = {
    async requestDidStart() {
      return {
        async didResolveOperation({ request }) {
          console.log("GraphQL Query:", redactQuery(request.query))
          console.log("Variables:", redact(request.variables))
        },
        async willSendResponse({ response }) {
          console.log("GraphQL Response:", JSON.stringify(redact(response.body), null, 2))
        },
      }
    },
  }

  plugins.push(loggingPlugin)
}

const server = new ApolloServer<Context>({
  typeDefs,
  resolvers,
  plugins,
  // The entry points that start it handle SIGTERM and SIGINT themselves (src/container/server.ts); Lambda never sends them
  stopOnTerminationSignals: false,
})

export default server
