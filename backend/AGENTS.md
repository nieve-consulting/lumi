# Backend

Node.js/TypeScript services: Apollo GraphQL in `src/apollo`, streaming LangChain/LangGraph agents in `src/ai`, and Lambda services for crawling and PDF generation. Data access uses PostgreSQL/pgvector with Drizzle in `db/schema.ts`; LangGraph checkpoints use the `langgraph` schema.

- Follow the root guide and nearby implementation patterns. Read [src/ai/AGENTS.md](src/ai/AGENTS.md) before editing AI prompts or caching behavior.
- Shared agent request and chat contracts live in `packages/shared-contracts`; coordinate changes with the frontend owner.
- Local servers: `pnpm -C backend dev:apollo` for GraphQL, `pnpm -C backend dev:agents` for streaming agents, `pnpm -C backend dev:mcp` for MCP and `pnpm -C backend dev:tasks` for PDFs and website crawls, behind the local proxy of `pnpm start:local-dev`. Inspect scripts and configuration before starting either.

## Database changes

After changing `backend/db/schema.ts`, generate the migration with `pnpm -C backend db:migration:generate --name <migration name>`. Never write or edit migrations by hand.

Never run `db:migrate` or `db:checkpointer:migrate`, including through another script or workflow. Tell the developer the migration is ready for the local database. Continue independent work, but stop before work requiring it to be applied until the developer confirms it ran.

## GraphQL codegen

After any `types.gql.ts` change, run both `pnpm -C backend codegen` and `pnpm -C frontend codegen`. Both load the SDL from `src/apollo/schema/type-defs.ts` through tsx, so they need no running server, `.env` or database. Register a new module's SDL in `type-defs.ts` and its resolvers in `src/apollo/schema/index.ts`; keep `type-defs.ts` free of resolver, data-source or settings imports so codegen can load it on its own.

Never edit `backend/src/generated/` or `frontend/src/generated/` by hand. In delegated work, coordinate both commands through the parent so generated files have one writer.

## Verification

Run `pnpm -C backend lint` and `pnpm -C backend typecheck`, plus relevant manual verification. Report codegen performed and any generated migration awaiting the developer. Root review exceptions and the no-tests rule apply.
