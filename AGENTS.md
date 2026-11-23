# Agent guide

Lumi is Nieve Consulting's AI sales assistant. Visitors, prospective clients and job candidates use it to learn about Nieve and book meetings; the team manages company knowledge and conversations in the admin interface.

## Where to look

Read the guide for the area you change; keep detailed rules there rather than repeating them here or in subagent prompts.

| Area | Guide |
| --- | --- |
| Public chat, `/widget` page and admin UI | [frontend/AGENTS.md](frontend/AGENTS.md) |
| GraphQL, streaming agents API, data access and services | [backend/AGENTS.md](backend/AGENTS.md) |
| AI prompts and caching | [backend/src/ai/AGENTS.md](backend/src/ai/AGENTS.md) |
| Embeddable launcher and iframe | [widget/AGENTS.md](widget/AGENTS.md) |
| Shared chat types and schemas | [packages/shared-contracts/README.md](packages/shared-contracts/README.md) |
| User and operator documentation | [nieve-consulting/lumi-docs](https://github.com/nieve-consulting/lumi-docs) (checked out beside the main checkout as `lumi-docs`, also from worktrees, or at `LUMI_DOCS_DIR`), published at [docs.lumi.nieve.ai](https://docs.lumi.nieve.ai); follow its AGENTS.md |

## Shared rules

- Use pnpm for `frontend`, `backend` and `packages/*`. The separate `widget` package uses `npm --prefix widget run <script>`.
- No tests for now: do not add tests or test frameworks, or run tests.
- Inspect scripts before executing them; restrictions also apply to indirect execution. Never apply database or checkpointer migrations. Never hand-edit migrations or generated GraphQL files; follow the generation procedures in [backend/AGENTS.md](backend/AGENTS.md).
- Run `lint`, `typecheck` and `format:check` in every changed workspace, plus relevant manual verification; CI fails on unformatted code, and `format` fixes it. For `packages/shared-contracts`, run its `typecheck` and `format:check` and both consumers' lint/typecheck; it has no lint script. Use the workspace's package manager above.
- Migration and codegen restrictions govern edits, not reviews: generated files in a PR are expected, not violations.
- User-facing changes come with a matching docs update in lumi-docs: open a companion pull request there and link the two. READMEs keep contributor material only; installation, configuration and setup guides live in the docs, and READMEs link to them.
- Use Conventional Commits: `type(scope): summary`, with the affected workspace as scope where applicable.
- Only make a release when explicitly asked. Publishing a release checks its version and publishes versioned backend and frontend images to GitHub Container Registry; it deploys and migrates nothing.
- In the handoff, report changes, checks and results, codegen performed, generated migrations still awaiting the developer, and any companion docs pull request.

## User stories

For user-facing GitHub issues, lead with who the user is, what they need to achieve, and why it matters. Make the user benefit explicit and write acceptance criteria as observable outcomes. Technical implementation details support that story.

Frontend, backend and widget implementers use the issue's story and acceptance criteria to guide implementation and verification. Backend-only work supporting a user feature still follows its user story. The UX reviewer checks that the resulting flow delivers those outcomes and identifies unmet or unverified criteria.

Pure infrastructure or architecture issues may instead describe the technical problem, intended benefit and verifiable technical acceptance criteria without inventing a user story. If a story is missing or unclear, infer and state the outcome from the request and available context; ask only when ambiguity materially affects behaviour or scope.

## Delegation

Delegate workspace implementation to the matching brief in [.claude/agents/](.claude/agents/): `frontend-implementer`, `backend-implementer` or `widget-implementer`. For agents without native support for those role files, pass the matching file as instructions when spawning a subagent. Keep trivial edits local when delegation would add overhead.

- Give each subagent a concrete task and non-overlapping file ownership. Assign shared-contract changes to one owner explicitly.
- Agree API and shared contracts before dependent UI work. Parallelize independent work; the coordinator integrates results and ensures both GraphQL codegen commands run when required.
- After user-visible frontend or widget changes work, use `ux-reviewer` for a read-only review and apply accepted findings through the owning implementer.

## Task-specific skills

Read only when relevant: [release](.claude/skills/release/SKILL.md), [GitHub issues](.claude/skills/github-issue/SKILL.md), or [Langfuse session analysis](.claude/skills/langfuse-session-analysis/SKILL.md). Keep their procedures in the skills, not in workspace guides.
