# Lumi MCP server

A remote [MCP](https://modelcontextprotocol.io) server that lets ChatGPT (and other MCP clients) find, create, update, link and publish Lumi's projects, team members, clients (the business's customers), capabilities, team member work experience and job openings, and read the business's public company information. Each installation names these records in its own words and can turn any of them off (see [Labels and switches](#labels-and-switches)). Anonymous callers get the public information; the business's team signs in to see unpublished records and to write, with Google Workspace or with their Lumi admin account (email and password), as the admin interface does (see [Sign-in methods](#sign-in-methods)).

The server is one of the backend's services, beside the GraphQL API and the agents API, and shares the entity services in `src/services` with Lumi's chat. Setting it up for an installation (the identity provider, its settings and connecting ChatGPT) is in [MCP server](https://docs.lumi.nieve.ai/developers/mcp-server). This README covers how it works, for contributors changing it.

## Architecture

```
ChatGPT ──HTTPS──▶ HTTP API ($default stage) ──▶ MCP server ───────▶ src/services ──▶ PostgreSQL
                    /mcp, /oauth/*, /.well-known/*        │                ▲
                                                          │                │ direct calls, public context
                                                          ▼                │
                                        Google (sign-in, Directory)   Lumi website chatbot (src/ai/agents/pre-sales/tools)
```

- **Shared services** (`src/services`) own validation, relationship resolution, permissions, the public-data policy, versions, idempotency, the audit trail and the typed response schemas. The MCP tools (`src/mcp/tools`) and Lumi's chatbot tools are thin adapters over them. The chatbot calls the services in-process with a public context: no MCP hop, and the same results as anonymous ChatGPT users.
- **MCP endpoint** (`src/mcp/server.ts`): Streamable HTTP, stateless (a fresh server per request). Tool calls return `structuredContent` plus the same JSON as text. Tool definitions are versioned (`CONTRACT_VERSION` in `config.ts`, also the server version) and built from the business name, the knowledge sources and whether resumes are offered (see [Labels and switches](#labels-and-switches)).
- **Authorization server** (`src/mcp/oauth`): OAuth 2.1 authorization code with PKCE (S256 only), Client ID Metadata Documents (what ChatGPT uses) and Dynamic Client Registration, resource indicators (RFC 8707), issuer identification (RFC 9207), and rotating refresh tokens. It federates sign-in to Google Workspace, or checks a Lumi admin account's email and password itself, and issues its own access tokens (HS256 JWTs, 1 hour, audience `<base>/mcp`).
- **Hosting**: on AWS, one Lambda (`src/mcp/lambda/mcp.ts`) runs behind an HTTP API whose `$default` stage has no path prefix, so the discovery documents sit at the origin root. Responses are buffered; every call fits the gateway's 30 s limit. The container installation runs the same router with the backend image's `mcp` command (`src/container/mcp.ts`), behind the reverse proxy on the installation's own origin.

### Endpoints

| Path                                              | Purpose                                                           |
| ------------------------------------------------- | ----------------------------------------------------------------- |
| `POST /mcp`                                       | MCP Streamable HTTP endpoint (GET/DELETE answer 405: no sessions) |
| `GET /.well-known/oauth-protected-resource[/mcp]` | Protected resource metadata (RFC 9728)                            |
| `GET /.well-known/oauth-authorization-server`     | Authorization server metadata (RFC 8414)                          |
| `GET/POST /oauth/authorize`                       | Consent page, then Google sign-in, or the Lumi admin sign-in      |
| `GET /oauth/callback`                             | Google's redirect back; issues the authorization code (Google)    |
| `POST /oauth/token`                               | `authorization_code` and `refresh_token` grants                   |
| `POST /oauth/register`                            | Dynamic Client Registration (public clients only)                 |

The discovery documents are only served when team sign-in is configured. Without it the server is anonymous only: the public tools work and the team tools answer `unavailable`.

## Authentication and authorization

### Sign-in methods

`ADMIN_AUTH_PROVIDER` picks how team members sign in, as for the admin interface:

- **`workspace`**: Google Workspace. The consent page continues to Google; the account must belong to `ADMIN_ALLOWED_DOMAINS` and the team's Google Groups. Every Google setting in [Local development](#local-development) is needed.
- **`local`**: the installation's email and password admin accounts (`src/services/adminAccounts.ts`). The consent page asks for the admin's Lumi email and password and approves the connection in one step; no Google setting is needed, only `MCP_TOKEN_SECRET`. Wrong credentials keep the admin on the page with the admin sign-in's generic message, and count toward its limit of 10 failures per 15 minutes per email and per client address (the address the Lambda or the container server sets from the connection). An account with a temporary password is refused, with a link to the web app's `/auth/change-password` (`APP_BASE_URL`, else `MCP_BASE_URL`). Every admin account reads and writes, as in the admin interface. Users are `local:<account id>` with the account's email and name, which the audit trail records.
- Unset or anything else turns team sign-in off, as in the admin interface: the server serves only the public tools, anonymously, and logs why.

| Tools                                                                 | Scheme                 | Requirement                                                               |
| --------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------- |
| `get_*` public reads                                                  | `noauth`               | None. Public records and fields only, also when the caller is signed in   |
| `admin_get_*`, `prepare_project_from_url`                             | `oauth2`, `lumi:read`  | Token with `lumi:read` (or `lumi:write`) and membership of the team group |
| `create_*`, `update_*`, `add_*`, `publish_record`, `unpublish_record` | `oauth2`, `lumi:write` | Token with `lumi:write` and membership of the write group                 |

- `initialize` and `tools/list` need no token (ChatGPT mixed authentication). Each tool declares `securitySchemes` (top level and in `_meta`). A protected tool called without a suitable token returns an error result with `_meta["mcp/www_authenticate"]` (`error="insufficient_scope"`, the needed `scope` and the resource metadata URL), which makes ChatGPT start linking or re-authorization.
- A request carrying an invalid, expired or wrong-audience token gets an HTTP 401 with a `WWW-Authenticate` challenge, whichever tool it calls.
- Signing in grants nothing by itself. The team permissions (`src/mcp/oauth/team.ts`) are checked at sign-in, at every refresh and on every protected call. The services check the permission again (`requireTeam`), so calling a protected service directly without a team context fails too.
- Google Workspace: team membership is checked with the Google Directory API (cached 5 minutes for members, 30 seconds for non-members, like the admin interface).
  - **Team (read)**: members of `ADMIN_GOOGLE_GROUP`, the group that grants access to Lumi's admin interface.
  - **Write**: members of `MCP_WRITE_GOOGLE_GROUP` when set, otherwise the same team group. `lumi:write` includes `lumi:read`.
  - A token only gets the requested scopes the account's groups allow; a non-member's sign-in is refused.
  - Accounts must belong to one of `ADMIN_ALLOWED_DOMAINS` (validated `hd` claim) with a verified email.
- Lumi admin accounts: the account is looked up on every protected call and refresh, without a cache. Access ends once the account is removed, or its password is changed or reset after the sign-in: the time of sign-in, set when the password is verified and kept as `signed_in_at` on the authorization code and every refresh token of its family, and carried by the access tokens as `auth_time_ms`, is compared with the account's `password_changed_at`. A tool call then answers with a challenge (`error="invalid_token"`) that asks the client to connect again, and a refresh revokes the token family.
- The shared admin API key is never used for MCP: it stays server-side for the frontend.

### Security measures

- Consent page before signing in, naming the client (CIMD clients by the host serving their metadata, DCR names marked unverified) and the redirect host. The consent form is bound to the browser by a `SameSite=Lax` cookie, so another site cannot approve on the user's behalf; pages cannot be framed. With local sign-in the form posts the email and password over the same binding; a failed attempt shows the form again with the same request and cookie, never with the password, and passwords are only checked against the accounts' scrypt hashes, never logged or stored.
- Redirect URIs must match a registered one exactly and belong to `MCP_ALLOWED_REDIRECT_ORIGINS` (e.g. ChatGPT's origins).
- Authorization codes (5 minutes) and refresh tokens (30 days) are stored hashed and work once. Replaying a code or a rotated refresh token revokes the whole token family; a rotated refresh token still works for 60 seconds, so a client's concurrent refreshes or a retry after a lost response do not sign the user out. Leaving the team, or for local sign-in an account's removal or password change, ends the connection at the next refresh.
- Rate limits per caller, counted in Postgres: 120 MCP requests/minute per user; per IP address, 600 anonymous MCP requests/minute and 300 token requests/minute (ChatGPT sends every user's anonymous calls and token requests from a few shared addresses), 30 requests/minute to the browser OAuth endpoints and 5 client registrations/minute. Lumi applies no other throttling: a deployment can add its own in front, such as API Gateway route throttling on AWS.
- Writes are audited in `mcp_audit_events` (actor, client, tool, record type and id, outcome, and a source URL for projects drafted from articles). Tokens and record content are never logged.
- Errors are typed (`invalid_input`, `not_found`, `conflict`, `forbidden`, `unavailable`, `internal_error`) with actionable messages and no SQL or stack traces.
- `prepare_project_from_url` and client metadata fetches only reach public addresses: http(s) on default ports, every resolved address checked (including after redirects and for IP literals), no credentials or cookies sent, and bounded time and size (`src/utils/safeFetch.ts`). Article text is treated as data, never as instructions.

## Public-data policy

Public means approved for external disclosure, not just readable. The rules live in `src/services/visibility.ts` and apply to the website chatbot and to anonymous MCP calls alike.

- **Projects**, **clients** and **team members** are public once staff publish them, with **Published** in Lumi's admin interface or the `publish_record` tool. Creating or updating records never publishes them. When a team member leaves the business, unpublish them (`unpublish_record` or the admin interface) to hide them everywhere public.
- **Job openings** are public once staff publish them, the same way; unpublish one once it is filled to hide it everywhere public. Their public reads list the most recently posted first.
- **Capabilities** have no flag: a capability is public while a public project or public team member uses it, since those disclose it anyway.
- **Company information** (`get_company_info`) is public as a whole, as Lumi's chat tells visitors about it: the founding story, values, mission and vision, with the location, contact phone and email, and website.
- Lists, searches, direct lookups and nested relationships all apply the rules. A hidden or missing record answers the same `not_found`. Hidden records are never named, counted or linked from public ones: a public project with an unpublished client shows `client: null`, filtering by a hidden client or project returns nothing, and contribution lists only include public team members and projects.
- Public fields exclude the clients' internal page, publication flags, versions, timestamps and storage keys. Images are returned as display URLs on the Lumi web app (`/media/...`) for records that are public.
- **Sources that are off** (see [Labels and switches](#labels-and-switches)) are never disclosed, whatever their records' flags: their tools aren't offered, and the reads and writes of other records leave their data out, as Lumi's chat does.

The `published` columns default to `false`, so a new record stays hidden until staff publish it. The migration that added them to projects, clients and team members left every existing record unpublished (`published` also replaced the team members' former `active` flag), so the chat showed none of them until staff published them. To publish existing records in bulk once their content has been reviewed, for example:

```sql
update projects set published = true;     -- only if every existing project is approved
update clients set published = true;      -- idem
update team_members set published = true; -- idem
```

## Labels and switches

Each installation sets, in Settings → Knowledge sources, which structured sources it uses (team members, projects, clients, capabilities and job openings) and a singular and plural English label for each (`knowledge_settings`, read through `src/knowledge.ts`). Until an admin saves them, a source is on when it has a published record, and the labels are the generic names. Capabilities count as off while team members and projects both are. `definitionsFor` in `server.ts` builds the instructions and every tool from the business name and these sources, and builds them again only when the name or the sources object changes (`src/knowledge.ts` returns the same object while nothing changes, refreshed within 30 seconds of an edit).

- **Tool names, field names and `record_type`/`entity_type` values stay generic** (`get_team_members`, `capability_ids`, `team_member`), so a client integration works whatever the labels. The titles, descriptions and server instructions name the records by their labels, lowercased mid-sentence unless a label looks like a name or acronym: with Nieve's labels (Consultant, Skill), `get_team_members` is "Find public consultants" and `get_capabilities` "Find public skills". The instructions say which generic name means which label (e.g. "team_member means a consultant") whenever they differ.
- **A source that is off has no tools**: its public reads, team reads and writes aren't registered, nor the writes that link it (`add_team_member_to_project` and `update_project_contribution` need team members and projects, `add_capabilities_to_project` projects and capabilities, `add_capabilities_to_team_member` and `update_team_member_capability` team members and capabilities). Work experience belongs to team members, and `prepare_project_from_url` to projects. `get_company_info` is always offered.
- **Filters and fields that reference a source that is off are left out of the input schemas and descriptions**: `client_id` and `capability_ids` on the project lists, `capability_ids` and `project_id` on the team member lists, `client_id`, `capability_ids` and `team_members` on `create_project`, `patch.client_id` on `update_project` and `capabilities` on `create_team_member`. `publish_record` and `unpublish_record` only take the `record_type` values of the sources that are on (another one fails as `invalid_input`), and aren't offered while projects, clients, team members and job openings are all off.
- **No tool returns data from a source that is off**, and the output schemas leave it out: a project without its `client` while clients are off, its `team_members` while team members are off and its `capabilities` while capabilities are off; a team member without `capabilities` while capabilities are off and `project_contributions` while projects are off (a contribution's `project.client` is `null` while clients are off); a client without `projects` while projects are off. The team reads (`admin_get_*`) and the writes return their records the same way, a project list's `client` included, and a capability's `usage` only counts the sources that are on. A capability is public (`is_public`, and in the public reads) only while a public record of a source that is on uses it. `prepare_project_from_url` returns no candidates from a source that is off.
- Turning a source off keeps its records: turning it back on offers them again as they were.
- **Resumes follow their own switch**, in Settings → Resumes (`resume_settings`, read through `src/resume.ts`, on until an admin saves it, refreshed within 30 seconds of an edit). While resumes are off, no tool returns a team member's `pdf_url` (`get_team_member`, `admin_get_team_member` and the writes that return a team member), the output schemas leave it out and `get_team_member`'s description doesn't mention a resume; `definitionsFor` builds the definitions again when the switch changes. When the settings can't be read, the last value read is kept, or resumes count as off before any.

## Tools

Lists take an optional `query`, `limit` (default 20, at most 100) and an opaque `cursor`, and return `{ items, next_cursor }` in a stable order. Relationship collections nested in a record hold at most 25 items with `{ items, total, truncated }`; the list tools with a filter return the rest.

The public reads take an optional `language` (`en` or `es`, English by default), so the business's website can build its pages in each language. Records nested in a record follow it too. A record with no translation in the language, or with an outdated one (English changed after it was saved), is returned in English, and a field its translation leaves empty reads in English; each record, nested ones included, says in `language` which language it was returned in, and in `fallback_fields` which of the content fields it returns came back in English because its translation leaves them untranslated (always empty when `language` is English). While the installation offers resumes, a team member's `pdf_url` downloads the resume in the requested language: its headings and dates in that language, its content falling back to English the same way. It opens inline; add a `download` query parameter to download it instead, with `URL.searchParams` rather than by appending `?download`, as the URL may already have a query.

The team reads (`admin_get_*`) take the same optional `language`, as the admin interface edits each language. Unlike the public reads they return a translation as saved even when English changed after it; a field it leaves empty, or a record with no translation in the language or only an AI draft awaiting review, reads in English, and `language` says which one each record was returned in, with `fallback_fields` as in the public reads. Each record also returns its translation status, as the admin forms show it: `translations` lists the languages it has, English first, with `updated_at`, `outdated` (English changed after the translation was saved), `draft` and `fields`, the fields it sets: a record read in a language says it was returned in it even when some of its fields fell back to English, which `fallback_fields` lists among the fields returned. Project contributions nested in a project or team member carry their own, as `update_project_contribution` writes them per language. The list tools (`admin_get_projects`, `admin_get_team_members`, `admin_get_clients`, `admin_get_capabilities`, `admin_get_job_openings`, `admin_get_work_experiences`) also take `missing_language` (a language other than English) to keep only the records with content left to translate into it, as the admin interface's lists count them: the record has no translation in it yet, an AI draft counting as one, or, for `admin_get_projects` and `admin_get_team_members`, one of the project's team member contributions or of the team member's work experience entries with English text has none. The tool descriptions ask ChatGPT to check which language the user means when it is unclear, e.g. a user writing in Spanish about a record.

| Tool                                                                         | Access | Needs                             | Purpose                                                                                                        |
| ---------------------------------------------------------------------------- | ------ | --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `get_projects`, `get_project`                                                | public | projects                          | Public projects; filter by `client_id` or `capability_ids`                                                     |
| `get_team_members`, `get_team_member`                                        | public | team members                      | Public team members; filter by `capability_ids` or `project_id`                                                |
| `get_clients`, `get_client`                                                  | public | clients                           | Public clients (customers) and their public projects                                                           |
| `get_capabilities`, `get_capability`                                         | public | capabilities                      | Capabilities of public projects and team members                                                               |
| `get_job_openings`, `get_job_opening`                                        | public | job openings                      | Public job openings, most recently posted first; the details add the full description                          |
| `get_company_info`                                                           | public |                                   | The business's founding story, values, mission, vision, location, contact details and website                  |
| `admin_get_projects`, `admin_get_project`                                    | read   | projects                          | All projects, with the project version and contribution versions                                               |
| `admin_get_team_members`, `admin_get_team_member`                            | read   | team members                      | All team members, with capability rating and contribution versions                                             |
| `admin_get_clients`, `admin_get_client`                                      | read   | clients                           | All clients, with internal pages                                                                               |
| `admin_get_capabilities`, `admin_get_capability`                             | read   | capabilities                      | All capabilities, with usage and public status                                                                 |
| `admin_get_job_openings`, `admin_get_job_opening`                            | read   | job openings                      | All job openings, published or not, most recently posted first                                                 |
| `admin_get_work_experiences`                                                 | read   | team members                      | A team member's experience entries (`team_member_id`), most recent first, with `most_recent` and its ambiguity |
| `prepare_project_from_url`                                                   | read   | projects                          | Draft a project from a public article in a `language`; writes nothing                                          |
| `create_project`                                                             | write  | projects                          | With optional existing client, capabilities and team member contributions                                      |
| `create_team_member`                                                         | write  | team members                      | With optional existing capabilities and 1–5 ratings                                                            |
| `create_client`, `create_capability`                                         | write  | clients, capabilities             |                                                                                                                |
| `create_job_opening`                                                         | write  | job openings                      | Title, summary, description, location, work mode, posting date and an optional application link                |
| `update_project`, `update_team_member`, `update_client`, `update_capability` | write  | each its source                   | Typed partial patches with `expected_version`, in a `language`                                                 |
| `update_job_opening`                                                         | write  | job openings                      | Typed partial patches with `expected_version`, in a `language`                                                 |
| `add_team_member_to_project`, `update_project_contribution`                  | write  | projects and team members         | Contributions; never assumed from project dates                                                                |
| `add_capabilities_to_project`                                                | write  | projects and capabilities         | Additive links                                                                                                 |
| `add_capabilities_to_team_member`, `update_team_member_capability`           | write  | team members and capabilities     | Additive links; changing a rating is explicit                                                                  |
| `add_work_experience`, `update_work_experience`                              | write  | team members                      | Experience entries, checked against their team member                                                          |
| `publish_record`, `unpublish_record`                                         | write  | any of the above but capabilities | Show or hide a project, client, team member or job opening publicly; publishing needs `expected_version`       |

The input and output JSON schemas are served by `tools/list`; their source is the zod schemas in `src/services`.

### Writes

- **Idempotency**: every write takes an `idempotency_key`, scoped to the actor and the tool. The key is claimed, the write runs and its result is stored in one transaction: retrying with the same key and payload returns the original result (`replayed: true`) without writing again, even after a timeout; the same key with another payload is a `conflict`; a failed write stores nothing, so it can be retried.
- **Atomicity**: a record and its requested links are created in one transaction. An unknown client, capability or team member id, a taken `url_slug`, an invalid value or an end date before the start date fails the whole call.
- **Duplicates**: a record with the same name, or for projects and capabilities the same name in a creation's `translation` language, returns a `conflict` with the existing candidates; after the user confirms it is different, retry with `allow_duplicate_name: true`. Job openings have no name check, as the same title can be open twice: their slug tells them apart. Slugs must be unique.
- **Versions**: reads return opaque versions (hashes of the editable content, in every language). Updates need `expected_version` and fail with a `conflict` (and the current version) when the record changed since, also through the admin interface. A project's version covers its capabilities and contributions, a team member's covers its capability ratings, and contributions, capability ratings and experience entries have their own.
- **Patches** only contain supported fields (others are rejected), must change at least one field, keep omitted fields and clear nullable fields given as `null`.
- **Languages**: the updates (`update_project`, `update_team_member`, `update_client`, `update_capability`, `update_job_opening`, `update_project_contribution`, `update_work_experience`) take an optional `language`, English by default, and save only that language's translatable fields, so writing Spanish never changes English. In another language, `null` or empty text leaves a field untranslated so it reads in English, including the fields English requires (a project's or capability's name, a team member's job title, a client's summary, a job opening's title and summary, an experience's position), and the record must have its English content. Fields shared by every language (the names of clients and team members, slugs, URLs, dates, location, a job opening's work mode, company and the client) are rejected in a patch in another language, as they would change every language, like the admin forms, which only change them in English: they are changed in a separate update without `language`. Writing a language whose translation is an AI draft replaces the draft with the patch rather than publishing it: no tool returns a draft's text, so its fields the patch leaves out are left untranslated instead of published unreviewed. The descriptions suggest reviewing drafts in the admin interface instead, where the whole draft is published. The response returns the record in the language written.
- **Creating** keeps English as the source: the `create_*` tools, `add_team_member_to_project`, `add_work_experience` and the contributions of `create_project` take English content, and an optional `translation` (`{ language, ...translatable fields }`, at least one of them) saves the record's text in another language in the same transaction. A translation can also be added later with an update and its `language`. The record is returned in English.
- `prepare_project_from_url` takes a `language` (English by default) to draft the name, summary, description, industry and type in, translating the article when it is written in another one; the evidence stays a quote from the source, the `url_slug` is suggested from the project's English name, as every language shares it, and candidate searches match the records' content in that language, existing projects also by their English name. Its `language` output says which language the draft is in: for a draft in another language, `create_project` takes the English as the project's fields and the draft's text as `translation`.
- **Publishing**: `publish_record` and `unpublish_record` take a `record_type` (`project`, `client`, `team_member` or `job_opening`, among the sources that are on) and set its `published` flag; a record already in that state is returned unchanged. Publishing needs the `expected_version` of the read the user reviewed, so content changed since is never disclosed unreviewed; unpublishing hides the record right away without a version. Related records keep their own flag: publishing a project does not publish its client or team members.
- The admin GraphQL mutations apply the same field rules (`src/services/rules.ts`): slugs, lengths, URLs, dates and their order, experience start in the past, ratings from 1 to 5.

## Example workflows

The examples use Nieve's labels: its team members are consultants and its capabilities skills.

**Anonymous case-study lookup.** "Has Nieve done IoT projects for energy companies?" → `get_capabilities { query: "IoT" }` → `get_projects { capability_ids: [...] }` → `get_project { id }`. Only published projects, public clients and public team members appear.

**Staff lookup, then linked project creation.** "Add the Orbit project for Acme, built with Rust by Rafa." → `admin_get_projects { query: "Orbit" }` (no existing project) → `admin_get_clients { query: "Acme" }`, `admin_get_capabilities { query: "Rust" }`, `admin_get_team_members { query: "Rafa" }`; ask which match is meant if several → ask for the missing start date, location and Rafa's contribution dates → show the payload → `create_project { ..., client_id, capability_ids, team_members: [{ team_member_id, start_date, description }], idempotency_key }`. The project stays unpublished until the user asks to publish it.

**"Publish the Orbit project."** → `admin_get_project { id }`; show the user what will become public, and that the client Acme and Rafa are still unpublished → on confirmation, `publish_record { record_type: "project", id, expected_version }`, then the same for the client and Rafa if the user wants them public too. **"Rafa left Nieve."** → `unpublish_record { record_type: "team_member", id }`.

**Retry after a timeout.** The `create_project` call times out in ChatGPT. Calling it again with the same `idempotency_key` and payload returns the project created by the first call with `replayed: true`; no duplicate is created. A new change uses a new key.

**"Add Rafa to the Supernova project. He did…"** → resolve both with `admin_get_team_members` and `admin_get_projects` → `admin_get_project` for the version and current contributions → propose the contribution description from the user's words and ask for Rafa's dates → `add_team_member_to_project`. If Rafa is already on it, the conflict returns his current contribution: propose `update_project_contribution` with its version. No work experience is created.

**"Update Rafa's summary with his new AI Masterclass."** → `admin_get_team_member`; a general summary is the `bio` (ask if they meant education or capability highlights) → ask for missing details → integrate them into the current bio and show it → `update_team_member { patch: { bio }, expected_version }`.

**"Introduce a new project from this blog post: <url>."** → `prepare_project_from_url { url }` returns field values with their origin and evidence, candidate projects/clients/capabilities/team members and the missing or ambiguous fields; if the article cannot be fetched, ask the user to paste it and call again with `article_text` → clarify name, slug, dates, location and client → `create_project { ..., source_url }`. The source URL is kept in the audit trail.

**"Translate the Orbit project into Spanish."** → `admin_get_projects { query: "Orbit", missing_language: "es" }` (or without `query` to list every project left to translate) → `admin_get_project { id, language: "es" }`: `language: "en"` and `translations` show it has no Spanish yet → translate the English text and show it → `update_project { id, language: "es", expected_version, patch: { name, summary, description } }`. Shared fields stay out of the patch, as they are not translated and a patch in Spanish rejects them. When the user writes in Spanish about a record without saying which language to change, ask whether they mean the Spanish translation or the English content.

**"Change Rafa's most recent work experience to include…"** → `admin_get_work_experiences { team_member_id }`: when `most_recent.ambiguous` (several ongoing entries or a tie), ask which entry; when there is none, propose `add_work_experience` → integrate the text into the entry's description → `update_work_experience { experience_id, expected_version, patch: { description } }`.

**"We're hiring a data engineer in Madrid."** → `admin_get_job_openings { query: "data engineer" }` (no existing opening) → ask for the missing summary, description, work mode and posting date, and whether candidates apply on a page of their own (`application_url`) or the careers page → show the payload → `create_job_opening { ..., idempotency_key }`, optionally with a Spanish `translation` → on request, `publish_record { record_type: "job_opening", id, expected_version }`. **"The position is filled."** → `unpublish_record { record_type: "job_opening", id }`.

**An installation without clients or capabilities.** With both off, `tools/list` has no client or capability tools, the project lists have no `client_id` or `capability_ids` filter, `create_project` takes no `client_id` or `capability_ids`, `get_project` returns no `client` or `capabilities`, and `publish_record` only takes `project` and `team_member`.

## Hosting

The router is the same wherever it runs:

- **Container installation**: the backend image's `mcp` command (`src/container/mcp.ts`), behind the reverse proxy on the installation's own origin, which forwards `/mcp`, `/oauth/…` and `/.well-known/oauth-…` to it. Its settings are in `deploy/.env`.
- **Local development**: `pnpm dev:mcp` (`src/mcp/local/server.ts`); see [Local development](#local-development).
- **AWS Lambda**: `src/mcp/lambda/mcp.ts` behind an HTTP API (see [AWS Lambda adapters](../../README.md#aws-lambda-adapters)). Keep the secrets out of the function's environment, where the deployment template would show them: `MCP_SECRET_PARAMETERS` is a JSON object mapping each secret variable (`MCP_TOKEN_SECRET`, `MCP_GOOGLE_CLIENT_SECRET`, `GOOGLE_DIRECTORY_CREDENTIALS`) to the SSM SecureString parameter holding it, which the Lambda reads at start. Only name parameters that exist: a missing one fails every request, public tools included, until it is created.

When team sign-in's settings are incomplete or `MCP_TOKEN_SECRET` is shorter than 32 characters, the server serves only its public tools, anonymously.

`MCP_BASE_URL` must be the server's public origin, as clients reach it: the issuer is that origin and the resource is `<origin>/mcp`. Unset, it is `http://localhost:4300`, which only works locally. The container installation sets it to `LUMI_PUBLIC_URL`; on AWS Lambda, it is the HTTP API's endpoint or its custom domain. Changing it later, for example to a new custom domain, stops tokens issued for the old origin from being accepted, and users reconnect.

### Database

The server uses `published` on `projects`, `clients`, `team_members` and `job_openings`, and the tables `oauth_clients`, `oauth_authorization_codes`, `oauth_refresh_tokens`, `mcp_idempotency_keys`, `mcp_audit_events` and `mcp_rate_limits`. Schema changes follow [db/README.md](../../db/README.md). Rate-limit windows are pruned automatically; idempotency keys and audit events are kept and can be pruned periodically if they grow.

## Local development

```bash
pnpm dev:mcp   # http://localhost:4300/mcp, or http://localhost:8080/mcp through the local proxy
```

The local server runs the same router with the `.env` database. Clients connect at `MCP_BASE_URL`: with the example settings ([`.env.example`](../../.env.example)) that is the local proxy, http://localhost:8080/mcp, as tokens and discovery name that origin; without `MCP_BASE_URL`, http://localhost:4300/mcp. Public tools work without further setup. For team sign-in with Lumi admin accounts, set `ADMIN_AUTH_PROVIDER=local` and `MCP_TOKEN_SECRET`. For Google Workspace, set the variables below and add `<MCP_BASE_URL>/oauth/callback` to the Google OAuth client (`http://localhost:8080/oauth/callback` with the example settings). Loopback redirect URIs are allowed locally, so the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) can connect.

| Variable                                                                | Description                                                                                                         |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `MCP_PORT`                                                              | Local port (default `4300`)                                                                                         |
| `MCP_BASE_URL`                                                          | Public origin; the issuer and the base of the resource `<origin>/mcp` (local default `http://localhost:<MCP_PORT>`) |
| `ADMIN_AUTH_PROVIDER`                                                   | `local` for Lumi admin accounts; `workspace` for Google Workspace. Unset turns team sign-in off                     |
| `APP_BASE_URL`                                                          | Web app, linked for choosing a new password (local sign-in; default `MCP_BASE_URL`)                                 |
| `MCP_TOKEN_SECRET`                                                      | Signing secret, at least 32 characters                                                                              |
| `MCP_GOOGLE_CLIENT_ID`, `MCP_GOOGLE_CLIENT_SECRET`                      | Google OAuth client                                                                                                 |
| `GOOGLE_DIRECTORY_CREDENTIALS`, `GOOGLE_DIRECTORY_IMPERSONATED_USER`    | Directory API access, as in the frontend                                                                            |
| `ADMIN_GOOGLE_GROUP`, `ADMIN_ALLOWED_DOMAINS`, `MCP_WRITE_GOOGLE_GROUP` | Team groups and Workspace domains                                                                                   |
| `MCP_ALLOWED_REDIRECT_ORIGINS`                                          | Comma-separated origins OAuth clients may redirect to; empty allows any https origin                                |
| `MCP_ALLOW_LOOPBACK_REDIRECTS`                                          | `true` to allow `http://localhost` redirect URIs (local default `true`)                                             |

## Out of scope

Deleting records, removing relationships, media uploads, bulk imports and meeting booking are not available through MCP, nor is editing the company information, which the admin interface's settings change. Website search stays in Lumi's chatbot; it can be added later, with the conversation-based query rewriting kept in Lumi's adapter.
