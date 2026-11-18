# GraphQL data sources

The data sources the GraphQL API's resolvers reach the outside world through. Each request's context (`Context` in `../types.ts`) carries one instance of each in `dataSources`, created by the server that handles it: `src/container/api.ts` in the container installation, `../local/apollo.ts` in local development and `../lambda/apollo.ts` on AWS Lambda. The agents API creates the same data sources for the agent's tools (`src/container/agents.ts` and `src/ai/agents/lambda/agents.ts`, which the local agents server runs too). LangGraph Studio's entry point (`src/ai/agents/pre-sales/graph.ts`) builds only the subset its graph needs (`PreSalesSources`: `db`, `drizzle` and `embeddings`).

| Data source  | File              | What it does                                                                                                                        |
| ------------ | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `db`         | `dbDataSource.ts` | Reads and writes the application tables with Drizzle, for the resolvers that don't go through the shared services in `src/services` |
| `s3`         | `s3Source.ts`     | Media storage for uploaded images: Amazon S3 or S3-compatible storage, optional                                                     |
| `embeddings` | `vectorStore.ts`  | The pgvector search over crawled website pages                                                                                      |
| `gCalendar`  | `gCalendar.ts`    | Google Calendar for in-chat booking, through a service account that acts for the booking user                                       |
| `aws`        | `aws.ts`          | Email through the backend's email transport, and invoking Lambda functions on AWS                                                   |

`adminUsage.ts` records and reports the team's own model calls for the admin dashboard.

## Contributing

- Prefer the shared services in `src/services` for entity operations, so the GraphQL API, the chat and the MCP server apply the same validation, permissions and public-data rules. Add to a data source for what only the GraphQL API needs.
- Keep clients that are expensive to create (the Lambda client, Google Calendar clients) cached per process, as the existing sources do.
- A new data source goes in `Context` and in every server above that creates them; add it to `PreSalesSources` and `graph.ts` only when the agent's graph uses it.

Setting up Google Calendar booking for an installation, with its service account and `GOOGLE_SERVICE_ACCOUNT_CREDENTIALS`, is in [Setting up Google Calendar](https://docs.lumi.nieve.ai/configuration/handoff#setting-up-google-calendar).
