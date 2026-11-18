# Trace → code map

Verify against the code before citing — this is a starting point, not the source of truth. Paths
are relative to the repo root.

## Request path

The pre-sales agent runs in the backend agents API, not in Next.js:

```
frontend chat (useChat)  →  POST <agents endpoint>/pre-sales
  → API Gateway REST /agents/{proxy+} (STREAM)  →  agents Lambda
  → router  →  runTurn  →  LangGraph pre-sales graph  →  SSE stream back to the chat
```

| Concern                                                                                 | File                                                    |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Chat transport (`api: ${config.agents.uri}/pre-sales`)                                  | `frontend/src/components/Chat/hooks/lumiChat.ts`        |
| Agents endpoint (`NEXT_PUBLIC_AGENTS_ENDPOINT`, default `http://localhost:4200/agents`) | `frontend/src/config.ts`                                |
| Thread create / state / booking calls from the client                                   | `frontend/src/lib/threads.ts`                           |
| Chat cards rendered from `cards` metadata                                               | `frontend/src/components/Chat/customCards/`             |
| Lambda entry: response streaming, client-disconnect abort, `flushTraces()` in `finally` | `backend/src/ai/agents/lambda/agents.ts`                |
| Event ↔ `Request`, streaming writer with keep-alives, CORS, `readJson`                  | `backend/src/ai/agents/http.ts`                         |
| `/agents/<agent>/…` and `/admin/<agent>/…` dispatch, admin API key check                | `backend/src/ai/agents/router.ts`                       |
| Route handlers (`runTurn`, `createThread`, `addBooking`, `summarizeThread`, …)          | `backend/src/ai/agents/pre-sales/routes.ts`             |
| Request bodies and chat message types (zod, shared with the frontend)                   | `packages/shared-contracts/src/pre-sales.ts`, `chat.ts` |
| Local stand-in for API Gateway + Lambda (`pnpm -C backend dev:agents`, port 4200)       | `backend/src/ai/agents/local/server.ts`                 |
| Container `agents` service: the same handler on a Node HTTP server                      | `backend/src/container/agents.ts`                       |

## Instrumentation

Lumi uses the Langfuse SDK (`@langfuse/*`), which exports through OpenTelemetry:

| Concern                                                                                                                                                                                                     | File                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `LangfuseSpanProcessor` + tracer provider (registered on first import; `environment` from `LANGFUSE_TRACING_ENVIRONMENT`), `CallbackHandler` from `@langfuse/langchain` (sets `sessionId`), `flushTraces()` | `backend/src/ai/tracing.ts`                              |
| Opens the trace (`propagateAttributes` + `startActiveObservation` from `@langfuse/tracing`) and attaches the handler                                                                                        | `runTurn` in `backend/src/ai/agents/pre-sales/routes.ts` |

`runTurn` (`POST /agents/pre-sales`) traces each visitor turn. The admin `summarizeThread`
route also records a separate `pre-sales-summary` trace in the conversation's session.
The **trace name is `pre-sales`** and the root observation is `pre-sales-turn`, with the
`LangGraph` run beneath it. The root stays open until the reply has finished streaming:

| Turn outcome          | `pre-sales-turn`                                                 |
| --------------------- | ---------------------------------------------------------------- |
| Completed             | output `Turn completed. …`                                       |
| Visitor disconnected  | `level=WARNING`, `statusMessage: Client disconnected`, no output |
| Graph or stream error | `level=ERROR`, the error in `statusMessage`, no output           |

Its input is the visitor's message. `userId` is never set. Tracing is off when `LANGFUSE_PUBLIC_KEY` or `LANGFUSE_SECRET_KEY` is missing.

Spans are only sent by `flushTraces()` at the end of each Lambda invocation. A turn missing from
Langfuse, or one cut short at the very end, can be a flush problem rather than an agent problem.

Route details worth knowing when reading a trace:

- A turn runs until the deployment's timeout (at most 15 minutes on Lambda), and a client
  disconnect aborts the graph run through `context.signal` (`abortOnClientDisconnect` in `http.ts`).
- `configurable` carries `thread_id`, `assistantName`, `companyName`, `companyServices` and
  `pageTitle` (the title of the page hosting the widget).
- The custom events `directMessage`, `statusUpdate` and `messageAnnotation` are handled in
  `runTurn` and are not separate observations.
- Runs tagged `not_visible` (the helper chains below) are excluded from the client stream but are
  still traced — they show `tags: ["not_visible"]` in metadata.

Not traced, so their effects appear in the checkpoint but never in Langfuse (all in `routes.ts`):

- `createThread` — creates the `threads` row and seeds the greeting `AIMessage` with
  `graph.updateState`.
- `addBooking` — creates the calendar event, removes the meeting picker message and appends a
  confirmation with `graph.updateState`.
- `getThreadState`, `getAdminThreadMessages` — read-only.

## Session ids and checkpoints

- The Langfuse `sessionId` **is the conversation's thread id** (`threadId` in the request body).
  It is the `threads.id` UUID in `backend/db/schema.ts`, the LangGraph `thread_id`, and the id in
  the admin URL `/admin/conversations/<threadId>`. One session is the whole multi-turn conversation.
- The same id is the checkpoint key. `createCheckpointer` in `backend/src/ai/checkpointer.ts` is a
  LangGraph `PostgresSaver` on the **`langgraph` schema** (`checkpoints`, `checkpoint_writes`,
  `checkpoint_blobs`), created only by `backend/db/migrate-checkpointer.ts`. Use it to compare
  what Langfuse saw with what was stored — e.g. a booking confirmation that is in the checkpoint
  but in no trace (expected, see above).
- The environment is the `LANGFUSE_TRACING_ENVIRONMENT` the deployment sets, and `development`
  when unset, as locally. The container installation defaults to `production`. Nieve's AWS
  installation sets its resource suffix, `dev`, so its production traces are in `dev`, not
  `production`. The digest header shows which one you fetched.

## Agent internals (`backend/src/ai/agents/pre-sales/`)

### Graph

`graph.ts` wires four nodes; LangGraph node names appear as `node=` in the digest timeline. The
graph is compiled per request by `createGraph(sources, checkpointer)`, because the tools read from
that request's data sources.

```
START → determineState ─┬─ SCHEDULE_MEETING → meetingPicker → END
                        └─ otherwise        → callModel ─┬─ tool calls → tools → callModel
                                                         └─ none       → END
```

| Node             | File                                     | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `determineState` | `nodes/determineState.ts`                | Structured-output call (`EXTRACTION_MODEL`) that classifies the conversation into a `ConversationState`. Sees only a transcript of the last `USE_MESSAGE_COUNT` (4) user/assistant messages (`formatTranscript`; tool calls and results are left out).                                                                                                                                                                                                                                                                                                                                                                            |
| `callModel`      | `nodes/callModel.ts` (`createCallModel`) | Sends the static system prompt (every state's instructions), the history, then a trailing system message with the current state and page title. Binds every tool the installation's knowledge sources make available (`toolsFactory`, sources from `src/knowledge.ts`) and restricts it per state with an `allowed_tools` tool choice (`allowedToolNames`). Calls `CHAT_MODEL`. Collects the cards and references of every tool result since the last assistant message. **Skips the model** when every one of those tool results has a `directMessage` — the reply is then those canned texts, one per line, with no GENERATION. |
| `tools`          | `nodes/stateAwareToolNode.ts`            | `ToolNode` subclass that re-resolves the same tool list from `toolsFactory` on every run (`webpage_search` reads the current messages).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `meetingPicker`  | `nodes/meetingPickerNode.ts`             | Runs `extractData`, then emits a fixed "Please pick a time to meet with us" message with a `meeting_picker` card. No chat-model reply.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

Routing functions `routeState` and `routeModelOutput` are in `graph.ts`.

| Area                                                                                                                                                                                                                                                                                                 | File                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| State shape (`messages`, `conversationState`) and the `ConversationState` enum                                                                                                                                                                                                                       | `state.ts`                                                              |
| Runtime configuration and defaults (`ensureConfiguration`)                                                                                                                                                                                                                                           | `configuration.ts`                                                      |
| All prompt templates                                                                                                                                                                                                                                                                                 | `prompts.ts`                                                            |
| Data sources the graph uses (`PreSalesSources`: `db`, `embeddings`)                                                                                                                                                                                                                                  | `types.ts`                                                              |
| Knowledge sources: which structured tools are bound, the labels the prompts, tool descriptions and English status texts name them by, and what the system prompt's scope, state and tool rules and the routing prompt mention (`knowledgeSources`, cached like the business settings; `sourceTerms`) | `backend/src/knowledge.ts`, `backend/src/services/knowledgeSettings.ts` |
| Checkpoint messages → chat UI messages; `formatTranscript` for the helper prompts                                                                                                                                                                                                                    | `messages.ts`                                                           |
| Model ids and reasoning effort per role (`CHAT_MODEL`, `EXTRACTION_MODEL`, `QUERY_MODEL`, `WRITING_MODEL`)                                                                                                                                                                                           | `backend/src/ai/models.ts`                                              |
| `emitStatusUpdate`, `appUrl` (links back to the web app via `APP_BASE_URL`)                                                                                                                                                                                                                          | `backend/src/ai/utils.ts`                                               |

Prompts in `prompts.ts`, by consumer:

| Prompt                                                                       | Used by                                         |
| ---------------------------------------------------------------------------- | ----------------------------------------------- |
| `SYSTEM_PROMPT_TEMPLATE` (includes every state's instructions from `STATES`) | `callModel`, first message                      |
| `TURN_CONTEXT_PROMPT`, `PAGE_CONTEXT_PROMPT`                                 | `callModel`, trailing message after the history |
| `conversationStatePrompt(sources)` (routing criteria from `STATES`)          | `determineState`                                |
| `EXTRACT_MEETING_DATA_PROMPT`                                                | `chains/extractData.ts`                         |
| `CONTEXTUALIZE_RETRIEVAL_PROMPT`                                             | `chains/retrievalContextualize.ts`              |
| `SUMMARIZE_PROMPT`                                                           | `chains/summarize.ts` (admin only)              |

### Chains

| Chain                                | File                               | Called from                   | Traced as                                                                      |
| ------------------------------------ | ---------------------------------- | ----------------------------- | ------------------------------------------------------------------------------ |
| `invokeExtractDataChain`             | `chains/extractData.ts`            | `meetingPicker` node          | GENERATION under `node=meetingPicker`, tag `not_visible`                       |
| `invokeRetrievalContextualizedQuery` | `chains/retrievalContextualize.ts` | `webpage_search` tool         | GENERATION nested inside the `webpage_search` `TOOL` observation               |
| `streamSummary`                      | `chains/summarize.ts`              | admin `summarizeThread` route | GENERATION in its own `pre-sales-summary` trace, in the conversation's session |

### Tools

Every tool the installation's knowledge sources make available is bound on every call, in a fixed order:
the team member, project, client and job opening tools only while that structured source is on (Settings →
Knowledge sources, `knowledge_settings`; until saved, while it has a published record), and `get_company_info`
and `webpage_search` always. Capabilities have no
tool: the team member and project tools return them while capabilities are on. The tool descriptions, the
system prompt, the routing prompt and the English status texts name the records by the installation's labels
(e.g. "consultants" for `get_team_members` under Nieve's labels), and the tool results and cards leave out
data from sources that are off: a project's client, team members or capabilities, a team member's
capabilities or project contributions (and their clients), a client's projects. A record missing such data
in a trace is usually a source that is off, not a bug. Read the bound tools
from the generation's tool list rather than assuming them. Which of them the model can call depends on
`conversationState` — see `allowedToolNames` in `tools/index.ts`:

| State                      | Tools allowed                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| `COMPANY_OVERVIEW`         | the bound team member, project and client tools, `get_company_info`, `webpage_search`      |
| `CUSTOMER_NEEDS_GATHERING` | `webpage_search` only                                                                      |
| `HIRING_CANDIDATE`         | `get_company_info`, `webpage_search`, and `get_job_opening`, `get_job_openings` when bound |
| `SCHEDULE_MEETING`         | none (routed to `meetingPicker`)                                                           |

So "the model didn't use the right tool" is often a `determineState` misclassification, not a
`callModel` problem — check the state the turn ran in first.

`TOOL` observations carry the registered snake_case name; the file is under `tools/`. Most tools are
factories that take `PreSalesSources` and query the database directly:

| Tool               | File                         | Data source                                                                                                                                   | Returns                              |
| ------------------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `get_company_info` | `tools/getCompanyInfo.ts`    | `getPublicCompany` in `services/company.ts`                                                                                                   | JSON string                          |
| `get_team_members` | `tools/getTeamMembers.ts`    | `listPublicTeamMembers`, and `publicProjectIdsByTeamMember` while projects are on, in `services/teamMembers.ts`                               | JSON string                          |
| `get_team_member`  | `tools/getTeamMember.ts`     | `getPublicTeamMember` in `services/teamMembers.ts`: experience, contributions, capabilities                                                   | `team_member` card + `directMessage` |
| `get_clients`      | `tools/getClients.ts`        | `listPublicClients` in `services/clients.ts`                                                                                                  | JSON string                          |
| `get_client`       | `tools/getClient.ts`         | `getPublicClient` in `services/clients.ts`, with its projects                                                                                 | `client` card + `directMessage`      |
| `get_projects`     | `tools/getProjects.ts`       | `listPublicProjects` in `services/projects.ts`                                                                                                | JSON string                          |
| `get_project`      | `tools/getProject.ts`        | `getPublicProject` in `services/projects.ts`: client, capabilities, team members                                                              | `project` card + `directMessage`     |
| `get_job_openings` | `tools/getJobOpenings.ts`    | `listPublicJobOpenings` in `services/jobOpenings.ts`                                                                                          | JSON string                          |
| `get_job_opening`  | `tools/getJobOpening.ts`     | `getPublicJobOpening` in `services/jobOpenings.ts`                                                                                            | `job_opening` card + `directMessage` |
| `webpage_search`   | `tools/webpageSearchTool.ts` | `retrievalContextualize` chain, then `embeddings.searchWebsite`: the closest website page chunks under `MAX_COSINE_DISTANCE`, grouped by page | text + `references`                  |

The structured tools read through the shared services in `backend/src/services` with a public context,
the same ones as the anonymous MCP reads. `embeddings` is
`EmbeddingSource` in `backend/src/apollo/sources/vectorStore.ts`. The detail tools throw `No <record> was found with id <id>.` when the id does not exist or the record isn't public.

"card + `directMessage`" tools use `responseFormat: "content_and_artifact"`: the content is the
details as JSON for the model to reuse in later turns (without image keys and links), and the
artifact carries the card. When the model calls only these tools in a step, the next `callModel`
replies with the canned `Here's some info about …` text, one line per tool, without a model call.
A bad answer right after one of these is the tool payload or the card, not the model.

### Where schemas live

| Schema                                                                                             | File                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tool input schemas (zod)                                                                           | inline in each `tools/*.ts` file, in the `schema:` option — `get_client`, `get_team_member`, `get_project`, `get_job_opening` take `{ id }`, `webpage_search` takes `{ query }`; the list tools take no input |
| `determineState` output                                                                            | `ouputSchema` in `nodes/determineState.ts` (strict JSON schema)                                                                                                                                               |
| Meeting data extraction output                                                                     | `extractedMeetingDataSchema` in `chains/extractData.ts` (strict, nullable fields)                                                                                                                             |
| Retrieval query output                                                                             | inline in `chains/retrievalContextualize.ts` (default structured-output method, not strict)                                                                                                                   |
| Turn, thread and booking request bodies; meeting data (`meetingDataSchema`, `email` must be valid) | `packages/shared-contracts/src/pre-sales.ts`                                                                                                                                                                  |
| Database rows the tools read                                                                       | `backend/db/schema.ts`                                                                                                                                                                                        |

## What Langfuse records for this stack

Lumi uses `@langchain/openai` with the Responses API (`useResponsesApi: true` in
`backend/src/ai/models.ts`) and the `@langfuse/langchain` callback handler:

- **Assistant messages carry their `tool_calls`**, so the digest shows each tool call inline under
  the `callModel` generation that made it.
- **Tool runs are `TOOL` observations** named after the tool, with the arguments as input and the
  result as output. A failed run has `level=ERROR` and the message in `statusMessage`.
- **A tool-result message's role is the tool name** (e.g. `tool result ← get_team_members`).
- **Schema rejections have no tool observation** — validation fails before the tool run starts —
  so the only evidence is the error `ToolMessage` in the next `callModel` generation's input.
- LangGraph's internal runnables appear at level `DEBUG`; ignore them unless routing is in
  question.

## Reading failures

**`Error: Received tool input did not match expected schema … Please fix your mistakes.`** — a zod
rejection at the `ToolNode` boundary (LangGraph's `handleToolErrors` wraps any thrown tool error
as `Error: <message>\n Please fix your mistakes.`). The tool never ran. The prettified zod error
names the failing path (e.g. `→ at id`). Two candidates:

1. the schema constrains something the prompt or tool description never told the model about (fix
   the description in the tool file or the prompt), or
2. the model passed a value it should have fetched first — e.g. a name instead of the `id` from
   `get_team_members` / `get_projects` / `get_clients` / `get_job_openings`. Check whether the list
   tool was called earlier in the session and whether its output actually contains ids.

**`Error: Tool "<name>" not found.`** — the model called a tool name that `toolsFactory` does not
define. Tools outside the current state's `allowedToolNames` are blocked by OpenAI, not by this error.

**`Error: No team member was found with id …`** (or `client` / `project` / `job opening`) — a detail tool got an id
that is not in the database or not published: usually a hallucinated or truncated id. Compare it with the list tool output
earlier in the session. `Company not found` from `get_company_info` means the company row is
missing.

Any other `Error: … Please fix your mistakes.` is a thrown tool error — a database or vector-store
failure. The `TOOL` observation carries `level=ERROR` with the message.

The deployed Lambda is minified without source maps, so stack frames in these errors do not point
at source lines — locate the source by tool or field name instead. Locally (`dev:agents`, run with
`tsx`) frames point at the real files.

**Byte-identical repeated tool call** — within one turn, the model retried without changing
anything, which usually means the tool result did not tell it what to change. Across turns it is
often just the list tools being re-fetched for a new question (info only).

**Root without output / trace ends on an unexecuted tool call** — the turn did not complete. The
`pre-sales-turn` level says why: `WARNING` is a client disconnect (`context.signal`, usually the
visitor closing or reloading the page — the nodes then show `Client disconnected` /
`ModelAbortError` errors, which are a consequence, not the cause), `ERROR` is a failure in a node
or the stream. Check the last node in the timeline and `runTurn`'s streaming loop.

**Orphaned spans** — observations whose parent was never exported. A span that never ended is never
sent, so a Lambda killed mid-turn (timeout or crash) loses `pre-sales-turn` and `LangGraph` and
leaves their finished children behind. Check the Lambda's logs for that invocation.

**Empty generation** — no text and no tool calls. Often a content filter, or all output
tokens consumed by reasoning; compare `output_reasoning` to `output` in the timeline.

**Expensive turns** — each GENERATION's usage has `input` (uncached) and `input_cache_read` (cached)
tokens, plus `input_cache_creation` (tokens written to the cache, billed at 1.25x). From the second
`callModel` call of a conversation most of the input should be cached; a `callModel` with no
`input_cache_read` after that means the prompt prefix changed (see "Prompt caching" in `AGENTS.md`).
The first `callModel` of a new conversation should already read about 1,150 tokens (the tools and the
system prompt, shared through an explicit breakpoint); a read of 0 there means the breakpoint was not
written — usually the tools plus the system prompt dropped below 1024 tokens — or none was cached in
the last 30 minutes.
The helper calls run with `promptCache: false` and should show neither reads nor writes.

**Wrong conversation state** — the `determineState` generation output is the classified state. A
turn that should have booked a meeting but went to `callModel`, or a candidate answered with
company tools, starts here: check the 4-message window it saw and the routing prompt (`conversationStatePrompt`), whose criteria only name the structured sources that are on.

## Guardrails when following up

For any fix after the analysis, follow the repository-wide rules in
[`AGENTS.md`](../../../../AGENTS.md) and the migration/codegen procedures in
[`backend/AGENTS.md`](../../../../backend/AGENTS.md). For AI code and prompt changes, also read
[`backend/src/ai/AGENTS.md`](../../../../backend/src/ai/AGENTS.md).

The analysis itself is read-only and needs none of those generation or validation commands.
