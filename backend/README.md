# Lumi backend

The Node.js and TypeScript services behind Lumi's web app. They hold the business's knowledge and conversations in PostgreSQL with pgvector, run the AI agent that talks to visitors, and connect Lumi to email, Google Calendar and media storage. The [frontend](../frontend/README.md) calls them; the [widget](../widget/README.md) only reaches them through the frontend.

- **GraphQL API** (`src/apollo`): Apollo Server for business data, settings and admin operations, used by the web app's server and, with API keys, by other systems. See the [GraphQL API](https://docs.lumi.nieve.ai/developers/graphql-api).
- **Agents API** (`src/ai`): the streaming LangChain and LangGraph agent behind the chat, with enquiries and booking. See the [streaming agents API](https://docs.lumi.nieve.ai/developers/streaming-agents-api).
- **MCP server** (`src/mcp`): Lumi's records as tools for ChatGPT and other MCP clients; its internals are in [src/mcp/README.md](src/mcp/README.md), its setup in [MCP server](https://docs.lumi.nieve.ai/developers/mcp-server).
- **Tasks**: website crawls (`src/tasks/websiteCrawler`), PDF resumes (`src/pdfGenerator`) and the weekly checkpoint cleanup ([MAINTENANCE.md](MAINTENANCE.md)).
- **Shared services** (`src/services`): validation, permissions, the public-data policy and the entity operations that the GraphQL API, the agent and the MCP server share.
- **Database** (`db`): the Drizzle schema, migrations and scripts ([db/README.md](db/README.md)). Conversation checkpoints live in the `langgraph` schema.

How the services fit together is in [Architecture](https://docs.lumi.nieve.ai/concepts/architecture). Conventions for people and coding agents, including database changes and GraphQL codegen, are in [AGENTS.md](AGENTS.md).

## Local development

Set up the checkout and the local services first, as [Getting started](https://docs.lumi.nieve.ai/getting-started) describes. Copy [`.env.example`](.env.example) to `.env`: it points the servers at the local services of `pnpm start:local-dev` (database, media storage and the Caddy proxy on http://localhost:8080 that routes to these servers as a container installation's proxy does). The backend runs local servers side by side:

```bash
pnpm dev:apollo # GraphQL API on http://localhost:4000/graphql
pnpm dev:agents # Agents API on http://localhost:4200/agents
pnpm dev:mcp    # MCP server for ChatGPT on http://localhost:4300/mcp (http://localhost:8080/mcp through the local proxy)
pnpm dev:tasks  # PDF rendering (/pdf) and website crawls (/crawls) on http://localhost:4500
```

The agents server stands in for API Gateway and the streaming agents Lambda (`src/ai/agents/lambda/agents.ts`): it builds the same REST `{proxy+}` events and runs the same handler. Point the frontend at it with `NEXT_PUBLIC_AGENTS_ENDPOINT=http://localhost:4200/agents` (the default).

The tasks server (`src/tasks/local/server.ts`) stands in for the PDF Lambda and the crawler Lambda, which the container installation replaces with the `api`'s `/pdf` and the `worker`'s `/crawls`: it serves the same handlers as the container (`src/pdfGenerator/http.ts`, `src/tasks/websiteCrawler/http.ts`) and restarts on code changes like the other servers. It listens on 127.0.0.1 only (`TASKS_HOST` changes it). Unlike the local GraphQL server, `/pdf` and `/crawls` need the installation's own key (`API_KEY`) in the `Authorization` header, as the web app and the backend send it: the proxy and the port are reachable from any page a browser opens, and PDF documents run their scripts in a Chromium without its sandbox. In development, the local proxy routes `/pdf` on its address to it, so the frontend keeps one `API_ENDPOINT`. On Linux the proxy reaches the host on the Docker bridge rather than its loopback, so set `TASKS_HOST` to the bridge's address (`172.17.0.1` by default) and `WEBSITE_CRAWLER_URL=http://172.17.0.1:4500`: the server then listens on that address only.

- **Website crawls:** set `WEBSITE_CRAWLER_URL=http://localhost:4500` (on Linux, the `TASKS_HOST` address) in the backend's `.env`, so adding or updating a website in **Knowledge → Websites** sends its crawl to the tasks server rather than invoking the crawler Lambda. A restart of the tasks server ends a crawl as a container worker restart does: it stops before its next page and shows as stopped, or shows as interrupted if the process is killed mid-page (`tsx watch` kills it 5 s after asking it to stop); update the website's pages again to continue.
- **PDF resumes:** the tasks server renders with a Chromium on your machine. Install the headless shell and point `PUPPETEER_EXECUTABLE_PATH` at the executable the command prints (or at an installed Chrome or Chromium), then restart the tasks server:

  ```bash
  npx @puppeteer/browsers install chrome-headless-shell@stable --path ~/.cache/puppeteer
  ```

  Without it the server still starts and serves crawls; it logs a warning, and `/pdf` answers 503 with a message saying to set `PUPPETEER_EXECUTABLE_PATH`.

`langgraph.json` points LangGraph Studio at `src/ai/agents/pre-sales/graph.ts`.

### Development variables

`.env.example` sets what local development needs; a container installation's settings are in the [Self-hosting settings](https://docs.lumi.nieve.ai/self-hosting#settings). Besides the database, OpenAI and Google ones, the local servers read the variables below. The container installation takes `EMAIL_FROM`, `SMTP_URL` and the `LANGFUSE_*` variables from `deploy/.env` under the same names, sets `API_KEY`, `APP_BASE_URL` and `AGENTS_ALLOWED_ORIGINS` from `LUMI_API_KEY` and `LUMI_PUBLIC_URL`, and sets or doesn't use the rest:

| Variable                                                                                          | Description                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS_PORT`                                                                                     | Local agents server port (default `4200`, local only)                                                                                                                                                                         |
| `AGENTS_ALLOWED_ORIGINS`                                                                          | Comma-separated origins allowed by CORS (local default `http://localhost:3000`)                                                                                                                                               |
| `API_KEY`                                                                                         | API key the frontend sends to the `/admin` routes, used whenever set (local and containers); else the SSM parameter `SECRET_NAME` names (AWS Lambda)                                                                          |
| `APP_BASE_URL`                                                                                    | Lumi web app URL used in links such as the calendar event (default `http://localhost:3000`)                                                                                                                                   |
| `EMAIL_FROM`                                                                                      | Sender of the emails Lumi sends: enquiries delivered by email and the meeting emails to the hosts (Apollo too). In SES it must be a verified identity. Unset, no email is sent and admins can't add an email delivery channel |
| `SMTP_URL`                                                                                        | Optional SMTP server for every email Lumi sends (enquiries and meeting emails), e.g. `smtp://user:pass@smtp.example.com:587` or a local mail catcher. Unset, they go through Amazon SES                                       |
| `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL`, `LANGFUSE_TRACING_ENVIRONMENT` | Optional Langfuse tracing, enabled when both keys are set                                                                                                                                                                     |
| `TASKS_PORT`                                                                                      | Local tasks server port (default `4500`, local only)                                                                                                                                                                          |
| `TASKS_HOST`                                                                                      | Address the local tasks server listens on (default `127.0.0.1`); on Linux, the Docker bridge's, e.g. `172.17.0.1`                                                                                                             |
| `PUPPETEER_EXECUTABLE_PATH`                                                                       | Chromium or Chrome (headless shell or full) the tasks server renders PDFs with. Required locally for PDFs; no default                                                                                                         |
| `WEBSITE_CRAWLER_URL`                                                                             | Where the backend sends crawls: `http://localhost:4500` for the local tasks server, or its `TASKS_HOST` address                                                                                                               |

The MCP server's variables are in [src/mcp/README.md](src/mcp/README.md#local-development).

### Database

Generate migrations after changing `db/schema.ts`, and create or upgrade the checkpoint tables in the `langgraph` schema, as [db/README.md](db/README.md) describes. A weekly job prunes old checkpoints; [MAINTENANCE.md](MAINTENANCE.md) covers dry runs, running it by hand and failures.

## Admin accounts

With email and password sign-in (`ADMIN_AUTH_PROVIDER=local`), admin accounts live in the `admin_accounts` table (`src/services/adminAccounts.ts`). Passwords are 12 to 256 characters, stored only as scrypt hashes. Failed sign-ins and current-password checks are limited to 10 per 15 minutes per email and per client IP (`admin_sign_in_failures`, `src/services/adminSignInThrottle.ts`). With Google Workspace sign-in these tables stay unused. The MCP server signs admins in with the same accounts. How admins are created, managed and recovered in an installation is in [Admin access](https://docs.lumi.nieve.ai/configuration/admin-access).

`pnpm admin:reset` (`src/scripts/adminReset.ts`) is the recovery script: it creates the account, or resets its password if it exists, prints a temporary password once and clears the email's failed sign-ins. Locally:

```bash
pnpm admin:reset admin@example.com --name "Ada Lovelace"
```

It connects like `db:migrate`, with the `db/` env file `--env` names (`.env` by default; see [db/README.md](db/README.md) for a deployed database). It never applies migrations; the `admin_accounts` table must exist. The container installation's `admin-reset` command shares its implementation (`src/scripts/adminResetCommand.ts`).

## Container image

`Dockerfile` builds the image a container installation runs ([Self-hosting](https://docs.lumi.nieve.ai/self-hosting)), from the repository root: `docker build -f backend/Dockerfile .`. Its entry point (`src/container/main.ts`) takes a command: `api` (GraphQL and PDF, port 4000), `agents` (port 4200), `mcp` (the MCP server, port 4300), `worker` (website crawls and the weekly checkpoint cleanup, port 4500), and the one-off `migrate`, `admin-reset` and `checkpoint-cleanup`. Each checks its environment variables at startup (`src/container/config.ts`), and the services answer `GET /health` (`src/container/health.ts`). `pnpm build:container` builds the bundle the image runs into `dist/container`.

## AWS Lambda adapters

The `*/lambda/` entry points run the same code on AWS Lambda: `ai/agents` (response streaming behind a REST API), `apollo`, `mcp`, `pdfGenerator`, and the tasks `websiteCrawler`, `checkpointCleanup` and `dbMigrations`. This repository doesn't deploy them, and they aren't part of the container installation, but keep them working when you change the code they share. A deployment that uses them must provide:

- **Bundling**: CommonJS with esbuild, `mainFields: ["module", "main"]` for tree-shaking, and `@aws-sdk/*` left out, since the Lambda runtime provides it. The PDF function also leaves out `@sparticuz/chromium` and gets it from a layer.
- **Migrations**: the `dbMigrations` bundle carries `db/migrations/*.sql` in `migrations/` and `meta/_journal.json` in `migrations/meta/`, beside the handler. It must run, and succeed, before the other functions are updated.
- **Database**: `DB_SECRET_ARN` and `DB_NAME` on every function that connects, which reads the credentials from that Secrets Manager secret.
- **API key**: `SECRET_NAME`, the SSM SecureString parameter holding the API key, unless `API_KEY` is set.
- **MCP**: `MCP_BASE_URL` set to the public origin, and secrets through `MCP_SECRET_PARAMETERS` ([src/mcp/README.md](src/mcp/README.md#hosting)).
- **Crawls**: `WEBSITE_CRAWLER_FUNCTION_NAME` on the GraphQL function, naming the crawler function it invokes asynchronously.
- **Checkpoint cleanup**: a weekly schedule that sends `{ "dryRun": false }` ([MAINTENANCE.md](MAINTENANCE.md)).

## Checks and builds

```bash
pnpm lint
pnpm typecheck
```

After a change to a `types.gql.ts` file, run `pnpm codegen` here and in the frontend ([AGENTS.md](AGENTS.md#graphql-codegen)).

To see the bundle's size and composition:

```bash
pnpm build
npx esbuild-visualizer --metadata ./dist/meta.json
```

It writes `stats.html` in the `backend` folder; open it in a browser.
