---
name: langfuse-session-analysis
description: Pull a Langfuse session or trace and analyse it against the codebase to find failures and misbehaviour in Lumi's pre-sales agent. Use when given a Langfuse session id, trace id, conversation/thread id, or cloud.langfuse.com URL, or when asked why a Lumi conversation went wrong.
---

# Langfuse session analysis

Turn a Langfuse session id into a grounded diagnosis: what the pre-sales agent actually did, what
went wrong, and which line of this repo caused it.

## Scope

Read-only. Fetch, analyse, report. Do **not** edit code, change prompts, or adjust schemas unless
the user asks for a fix after reading the findings.

## 1. Fetch

Write output to the session scratchpad, never into the repo.

```bash
python3 .claude/skills/langfuse-session-analysis/scripts/langfuse_session.py fetch <session-id> --out "$SCRATCHPAD/langfuse/<session-id>"
```

- Accepts a bare id or a `cloud.langfuse.com/project/.../sessions/<id>` URL. In Lumi the session
  id is the conversation's thread id — the same UUID as in `/admin/conversations/<id>`.
- Use `trace <trace-id>` instead of `fetch` for a single trace (one visitor turn).
- Python stdlib only — no install step and no Node toolchain.
- Reads Langfuse's v2 observations API, which needs a time window: only observations from the last
  30 days are searched. For an older conversation pass `--days N`; "no observations found" usually
  means the window is too short.
- Credentials load from `LANGFUSE_*` env vars, else the first of `backend/.env`,
  `frontend/.env.local`, `.env.local`, `.env` (at the repo root that contains this skill) that
  defines `LANGFUSE_SECRET_KEY`. In a git worktree those files are usually missing — pass
  `--env-file` pointing at the main checkout's file. Never print the keys.
- Useful flags: `--limit N` (last N traces of a long session), `--max-chars 800` (tighter digest),
  `--slow-seconds N` (flag model calls slower than N seconds, default 45).

It writes:

| File | Contents |
| --- | --- |
| `digest.md` | Per trace: header, indented observation timeline, and the **new** conversation turns (messages already shown in an earlier trace are skipped, so the large repeated system prompt and history appear once) — tool calls appear inline under the generation that made them |
| `signals.json` | Machine-readable detected problems with `traceId` / `observationId` pointers |
| `traces/<id>.json` | Raw trace payloads — can be several MB each, so never `Read` one whole |

## 2. Read the digest

Read `digest.md`. If it is very large, read `signals.json` first, then the specific trace sections
it points at.

To inspect one payload without loading a multi-MB file:

```bash
python3 .claude/skills/langfuse-session-analysis/scripts/langfuse_session.py show <obs-id-prefix> --out "$SCRATCHPAD/langfuse/<session-id>" --field input --path query
```

## 3. What the signals catch, and what you must catch yourself

`signals.json` is a **cheap first pass, not the analysis**. It detects: observation `level`
ERROR/WARNING, status messages, tool error results (`Error invoking tool '…'` and LangGraph's
`Error: … Please fix your mistakes.`), runtime errors (recursion limit, rate limit, context length,
timeouts, auth), empty generations, traces that end on an unexecuted tool call or without a root
output, spans whose parent was never exported (a run killed mid-turn), byte-identical repeated tool calls (within one turn vs. across turns), and slow
generations. A "Recurring" rollup marks the same failure firing across turns — that is systemic,
not bad luck.

Read the conversation yourself for the failures no regex finds:

- **Wrong conversation state.** Every turn starts with `determineState`; its generation output is
  the state the turn ran in, and that state decides the prompt and the tools. Check it before
  blaming `callModel` — a visitor asking for a meeting who never gets the picker, or a candidate
  answered with company tools, is usually a misclassification.
- **Prompt violations.** Diff the system prompt's rules against what the assistant actually did —
  answered without using a tool it was told to use, invented company facts, asked for details it
  already had, pushed for a meeting too early or never offered one.
- **Wrong tool / wrong time.** A detail tool called with a guessed id before its list tool, a
  `webpage_search` query that drifted from what the visitor asked, a list tool fetched when the
  answer was already in the history.
- **Silent recovery.** After a tool error the model often retries with slightly different arguments
  and the visitor sees nothing. The turn "succeeded" while doing half the work — check what the
  failed call would have returned and whether the answer covers for it.
- **Grounding.** Compare the reply to the tool output it was based on: facts not in the output,
  references or cards that don't match the answer, an empty search result papered over.
- **Routing.** Follow `node=` / `step=` in the timeline against `graph.ts` and check the path taken
  is the one the code intends.
- **Cost and latency shape.** Reasoning tokens dwarfing output, cache-read collapsing, the same
  large payload resent every turn, a turn that takes long enough for the visitor to give up.

## 4. Map each finding to code

Use `references/code-map.md` for the trace/node/tool → file mapping in this repo. Read the actual
files and cite `path:line`. A finding without a code location is a symptom, not a diagnosis.

Work backwards from evidence: a schema rejection points at the zod schema *and* at the tool
description or prompt that failed to tell the model about the constraint — decide which one is
wrong. A tool that throws on valid input points at the tool handler or the `DbDataSource` method
behind it. A model doing the wrong thing on a well-formed prompt points at the prompt, the tool
description, or the conversation state that chose them.

## 5. Report

Order findings by severity. Per finding:

- **What happened** — one sentence.
- **Evidence** — trace id + observation id, and a short verbatim quote from the digest.
- **Frequency** — once, or N times across the session.
- **Root cause** — `path/to/file.ts:line`, with the specific code quoted.
- **Fix** — the concrete change; note when prompt and schema disagree and which should move.

End with what you checked and found clean, so the user knows the coverage. If a finding is a
plausible hypothesis you could not confirm in code, label it as such rather than asserting it.

Do not paste raw trace JSON into the reply. Visitors share names, emails and phone numbers — quote
conversation content only as far as the evidence needs, and leave contact details out.
