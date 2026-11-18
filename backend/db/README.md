# Database

Lumi's PostgreSQL schema and the scripts that manage it. `schema.ts` defines every application table with [Drizzle](https://orm.drizzle.team), `migrations/` holds the SQL migrations generated from it, and `migrator.ts` applies them together with the LangGraph checkpoint tables. The GraphQL API, the agents, the MCP server and the tasks all read and write through this schema (`db.ts`); the vector search over website pages uses pgvector. What an installation stores is described in [Data and privacy](https://docs.lumi.nieve.ai/security/data-and-privacy).

Never write or edit a migration by hand, and coding agents never apply them: [backend/AGENTS.md](../AGENTS.md#database-changes) has the rules.

## Generate migrations

After changing `schema.ts`, generate a new migration:

```bash
pnpm db:migration:generate --name <migration name>
```

## Run migrations

To apply the pending migrations to your local database:

```bash
pnpm db:migrate
```

The scripts read the `db/` env file named by their first argument (`.env` by default). With `ENVIRONMENT=development`, the
default, they connect with the `DB_*` variables.

## Seed a development database

`pnpm db:seed` adds sample clients, projects, capabilities and team members to a migrated development database. It refuses to
run unless `ENVIRONMENT` is `development`, and running it again updates the same records.

## Run migrations on a deployed database

Installations apply both the Drizzle and the checkpointer migrations of the code they run through the container's `migrate`
command ([Operations](https://docs.lumi.nieve.ai/self-hosting/operations)), which logs the migrations each run applied.
Running it again applies only what is still pending.

Run them by hand only to repair a deployed database, from the release tag it runs (`git checkout <tag>`): `main` may hold
migrations that haven't been released yet. A run by hand and a deploy's never overlap: whichever starts second fails at once.

For a database whose credentials are in AWS Secrets Manager, `.env.production.local` needs `ENVIRONMENT=production`,
`DB_NAME` and `DB_SECRET_ARN`, the ARN of the secret. The scripts then read the user and password from that secret and connect
to `localhost:5433`, so open a tunnel to the database on that port first. Reading the secret needs AWS credentials for its
account, allowed `secretsmanager:GetSecretValue` on it, and the secret's region: the SDK takes them from the usual places, such
as `AWS_PROFILE` and `AWS_REGION`. Then run the migrations:

```bash
AWS_PROFILE=<profile> AWS_REGION=<region> pnpm db:migrate .env.production.local
```

## LangGraph checkpointer tables

The agents store their checkpoints in the `langgraph` schema, which Drizzle does not manage. Only `db/migrator.ts` creates or upgrades those tables, through `db:checkpointer:migrate` or the container's `migrate` command, which runs it right after the Drizzle migrations.

```bash
pnpm db:checkpointer:migrate
```

On a deployed database, with the tunnel open:

```bash
AWS_PROFILE=<profile> AWS_REGION=<region> pnpm db:checkpointer:migrate .env.production.local
```
