#!/usr/bin/env python3
"""Fetch a Langfuse session (or single trace) and render an analysis-ready digest.

Standard library only — no pnpm, Node toolchain or venv needed.

  fetch <session-id|url>   download every trace in the session, write digest + signals
  trace <trace-id|url>     same, for one trace
  show  <observation-id>   print one observation payload from an already-fetched dir

Credentials come from LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY / LANGFUSE_BASE_URL,
falling back to an env file (default: backend/.env, frontend/.env.local, .env.local, then .env).

Data comes from the v2 observations API (GET /api/public/v2/observations), which needs a time window:
observations starting in the last --days days are searched.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

DEFAULT_BASE_URL = "https://cloud.langfuse.com"
ENV_FILE_CANDIDATES = ("backend/.env", "frontend/.env.local", ".env.local", ".env")
OBSERVATION_FIELDS = "core,basic,time,io,metadata,model,usage,metrics,trace_context"

# Content patterns that mean something went wrong at runtime.
TOOL_ERROR_RE = re.compile(r"Error invoking tool '([^']+)'")
# LangGraph's ToolNode (handleToolErrors) turns a thrown tool error into a ToolMessage with this shape.
TOOL_NODE_ERROR_RE = re.compile(r"^Error: .*Please fix your mistakes\.\s*$", re.DOTALL)
CONVERSATION_ROLES = ("system", "developer", "user", "human", "assistant", "ai")
RUNTIME_ERROR_RE = re.compile(
    r"(GraphRecursionError|Recursion limit|rate.?limit|context[_ ]length|maximum context"
    r"|ECONNRESET|ETIMEDOUT|AbortError|timed? out|insufficient_quota|invalid_api_key"
    r"|did not match expected schema|ZodError|Unauthorized|Forbidden)",
    re.IGNORECASE,
)


# --------------------------------------------------------------------------- creds


def load_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, raw = line.partition("=")
        raw = raw.strip().strip('"').strip("'")
        values[key.strip()] = raw
    return values


def resolve_credentials(env_file: str | None, repo_root: Path) -> tuple[str, str, str]:
    file_values: dict[str, str] = {}
    candidates = [Path(env_file)] if env_file else [repo_root / c for c in ENV_FILE_CANDIDATES]
    for candidate in candidates:
        file_values = load_env_file(candidate)
        if file_values.get("LANGFUSE_SECRET_KEY"):
            break

    def pick(name: str, default: str = "") -> str:
        return os.environ.get(name) or file_values.get(name) or default

    public_key = pick("LANGFUSE_PUBLIC_KEY")
    secret_key = pick("LANGFUSE_SECRET_KEY")
    base_url = pick("LANGFUSE_BASE_URL", DEFAULT_BASE_URL).rstrip("/")
    if not public_key or not secret_key:
        sys.exit(
            "Missing Langfuse credentials. Set LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY, "
            "or pass --env-file pointing at a file that defines them."
        )
    return public_key, secret_key, base_url


# --------------------------------------------------------------------------- api


def api_get(base_url: str, path: str, auth: str, params: dict | None = None) -> dict:
    url = f"{base_url}{path}"
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(url, headers={"Authorization": f"Basic {auth}", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")[:400]
        sys.exit(f"Langfuse API {error.code} for {path}\n{body}")
    except urllib.error.URLError as error:
        sys.exit(f"Could not reach Langfuse at {base_url}: {error.reason}")


def fetch_observations(base_url: str, auth: str, filters: dict, days: float) -> list[dict]:
    """Every observation matching `filters` that started in the last `days` days, following the cursor."""
    now = datetime.now(timezone.utc)
    params = {
        **filters,
        "fromStartTime": (now - timedelta(days=days)).isoformat().replace("+00:00", "Z"),
        "toStartTime": (now + timedelta(minutes=5)).isoformat().replace("+00:00", "Z"),
        "fields": OBSERVATION_FIELDS,
        "limit": 1000,
    }
    observations: list[dict] = []
    cursor = None
    while True:
        page = api_get(base_url, "/api/public/v2/observations", auth, {**params, "cursor": cursor} if cursor else params)
        observations += page.get("data") or []
        cursor = (page.get("meta") or {}).get("cursor")
        if not cursor:
            return observations


def elapsed_seconds(start: str | None, end: str | None) -> float:
    try:
        return (datetime.fromisoformat(str(end).replace("Z", "+00:00")) - datetime.fromisoformat(str(start).replace("Z", "+00:00"))).total_seconds()
    except ValueError:
        return 0.0


def root_observations(observations: list[dict]) -> list[dict]:
    """Logical roots. A root's physical parent can be a span that was never exported, such as a framework request span."""
    roots = [o for o in observations if o.get("isRootObservation")]
    if roots:
        return roots
    ids = {o["id"] for o in observations}
    return [o for o in observations if o.get("parentObservationId") not in ids]


def group_traces(observations: list[dict]) -> list[dict]:
    """Rebuild trace records, oldest first, from a flat list of observations."""
    by_trace: dict[str, list[dict]] = {}
    for observation in observations:
        # The v2 API returns structured input/output as JSON-encoded strings
        for field in ("input", "output"):
            value = observation.get(field)
            if isinstance(value, str) and value.lstrip()[:1] in ("{", "["):
                try:
                    observation[field] = json.loads(value)
                except ValueError:
                    pass
        by_trace.setdefault(observation["traceId"], []).append(observation)

    traces = []
    for trace_id, members in by_trace.items():
        members.sort(key=lambda o: (o.get("startTime") or "", o.get("id")))
        root = (root_observations(members) or members)[0]
        start = members[0].get("startTime")
        end = max((o.get("endTime") or o.get("startTime") or "" for o in members), default=start)
        traces.append(
            {
                "id": trace_id,
                "name": root.get("traceName") or root.get("name"),
                "timestamp": start,
                "latency": elapsed_seconds(start, end),
                "totalCost": sum(float(o.get("totalCost") or 0) for o in members),
                "userId": root.get("userId"),
                "sessionId": root.get("sessionId"),
                "environment": root.get("environment"),
                "tags": root.get("tags") or [],
                "input": root.get("input"),
                "output": root.get("output"),
                "observations": members,
            }
        )
    return sorted(traces, key=lambda t: t["timestamp"] or "")


def extract_id(value: str, kind: str) -> str:
    """Accept a bare id or a Langfuse UI URL."""
    if "://" not in value:
        return value.strip()
    parts = [p for p in urllib.parse.urlparse(value).path.split("/") if p]
    marker = f"{kind}s"
    if marker in parts:
        index = parts.index(marker)
        if index + 1 < len(parts):
            return urllib.parse.unquote(parts[index + 1])
    return urllib.parse.unquote(parts[-1]) if parts else value


# --------------------------------------------------------------------------- helpers


def clip(value, limit: int) -> str:
    if value is None:
        return "null"
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    text = text.replace("\r", "")
    if limit and len(text) > limit:
        return f"{text[:limit]}… [+{len(text) - limit} chars]"
    return text


def indent_block(text: str, prefix: str) -> str:
    return "\n".join(f"{prefix}{line}" for line in text.split("\n"))


def fingerprint(message) -> str:
    return hashlib.sha1(json.dumps(message, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def message_role(message: dict) -> str:
    return str(message.get("role") or message.get("type") or "unknown")


def message_text(message: dict) -> str:
    content = message.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        chunks = []
        for part in content:
            if isinstance(part, dict):
                chunks.append(part.get("text") or part.get("thinking") or json.dumps(part, ensure_ascii=False))
            else:
                chunks.append(str(part))
        return "\n".join(c for c in chunks if c)
    return "" if content is None else json.dumps(content, ensure_ascii=False)


def tool_error_name(message: dict, text: str) -> str | None:
    """Name of the tool whose failure this message reports, or None."""
    match = TOOL_ERROR_RE.search(text)
    if match:
        return match.group(1)
    role = message_role(message)
    # The LangChain callback handler stores a ToolMessage's tool name as its role.
    if role not in CONVERSATION_ROLES and TOOL_NODE_ERROR_RE.match(text.strip()):
        return role if role != "tool" else str(message.get("name") or "tool")
    return None


def seconds(observation: dict) -> float:
    return float(observation.get("latency") or 0.0)


def usage_summary(observation: dict) -> str:
    usage = observation.get("usageDetails") or {}
    if not usage:
        return ""
    keys = ("input", "output", "total", "input_cache_read", "output_reasoning")
    parts = [f"{k}={usage[k]}" for k in keys if usage.get(k)]
    for key, value in usage.items():
        if key not in keys and value:
            parts.append(f"{key}={value}")
    cost = observation.get("totalCost") or observation.get("calculatedTotalCost")
    if cost:
        parts.append(f"${float(cost):.5f}")
    return " ".join(parts)


def strip_stack(text: str, keep: int = 2) -> str:
    """Drop minified bundler stack frames — they point at .next chunks, not source."""
    lines, kept_frames, output = text.split("\n"), 0, []
    for line in lines:
        if line.lstrip().startswith("at "):
            kept_frames += 1
            if kept_frames > keep:
                continue
        output.append(line)
    dropped = sum(1 for line in lines if line.lstrip().startswith("at ")) - min(keep, kept_frames)
    if dropped > 0:
        output.append(f"    … {dropped} more bundled stack frames omitted")
    return "\n".join(output)


def node_label(observation: dict) -> str:
    metadata = observation.get("metadata") or {}
    if not isinstance(metadata, dict):
        return ""
    bits = []
    for key, label in (("langgraph_node", "node"), ("langgraph_step", "step"), ("lc_agent_name", "agent")):
        if metadata.get(key) not in (None, ""):
            bits.append(f"{label}={metadata[key]}")
    if metadata.get("ls_model_name"):
        bits.append(f"model={metadata['ls_model_name']}")
    return " ".join(bits)


# --------------------------------------------------------------------------- signals


class Signals:
    def __init__(self) -> None:
        self.items: list[dict] = []

    def add(self, severity: str, kind: str, summary: str, *, trace: str = "", observation: str = "", detail: str = "") -> None:
        self.items.append(
            {
                "severity": severity,
                "kind": kind,
                "summary": summary,
                "traceId": trace,
                "observationId": observation,
                "detail": detail,
            }
        )

    def sorted(self) -> list[dict]:
        rank = {"error": 0, "warning": 1, "info": 2}
        return sorted(self.items, key=lambda s: rank.get(s["severity"], 3))


def scan_observation(observation: dict, trace_id: str, signals: Signals, slow_seconds: float) -> None:
    obs_id = observation.get("id", "")
    name = observation.get("name", "?")

    level = (observation.get("level") or "").upper()
    if level in ("ERROR", "WARNING"):
        signals.add(
            "error" if level == "ERROR" else "warning",
            "observation_level",
            f"{name} reported level {level}",
            trace=trace_id,
            observation=obs_id,
            detail=clip(observation.get("statusMessage") or observation.get("output"), 2000),
        )
    elif observation.get("statusMessage"):
        signals.add(
            "warning",
            "status_message",
            f"{name} carries a status message",
            trace=trace_id,
            observation=obs_id,
            detail=clip(observation["statusMessage"], 2000),
        )

    if observation.get("type") == "GENERATION":
        output = observation.get("output")
        if isinstance(output, dict):
            has_text = bool(message_text(output).strip())
            has_tools = bool(output.get("tool_calls"))
            if not has_text and not has_tools:
                signals.add(
                    "warning",
                    "empty_generation",
                    f"{name} produced neither text nor tool calls",
                    trace=trace_id,
                    observation=obs_id,
                    detail=clip(output, 600),
                )

    # Only leaf work is worth flagging — parent spans just inherit their child's latency.
    if observation.get("type") == "GENERATION" and seconds(observation) > slow_seconds:
        signals.add(
            "info",
            "slow_generation",
            f"{name} ({(observation.get('model') or '?')}) took {seconds(observation):.1f}s (> {slow_seconds:.0f}s)",
            trace=trace_id,
            observation=obs_id,
            detail=usage_summary(observation),
        )


def scan_message(message: dict, trace_id: str, obs_id: str, signals: Signals) -> None:
    text = message_text(message)
    if not text:
        return

    tool_name = tool_error_name(message, text)
    if tool_name:
        tail = text.split("with error:", 1)[-1].strip() if "with error:" in text else text
        signals.add(
            "error",
            "tool_error",
            f"Tool '{tool_name}' failed",
            trace=trace_id,
            observation=obs_id,
            detail=clip(strip_stack(tail), 3000),
        )
        return

    runtime_error = RUNTIME_ERROR_RE.search(text)
    if runtime_error and text.lower().lstrip().startswith(("error", "failed", "exception")):
        signals.add(
            "error",
            "runtime_error",
            f"Runtime error mentioning '{runtime_error.group(1)}'",
            trace=trace_id,
            observation=obs_id,
            detail=clip(strip_stack(text), 3000),
        )


def scan_repeated_tool_calls(calls: list[dict], signals: Signals) -> None:
    grouped: dict[tuple[str, str], list[dict]] = {}
    for call in calls:
        key = (call["name"], hashlib.sha1(json.dumps(call["args"], sort_keys=True, ensure_ascii=False).encode()).hexdigest())
        grouped.setdefault(key, []).append(call)
    for (name, _), occurrences in grouped.items():
        if len(occurrences) < 2:
            continue
        per_trace: dict[str, int] = {}
        for call in occurrences:
            per_trace[call["traceId"]] = per_trace.get(call["traceId"], 0) + 1
        most_in_one_turn = max(per_trace.values())
        # A retry inside one turn is a loop; the same lookup in later turns is often just a fresh question.
        if most_in_one_turn > 2:
            severity, where = "error", "within one turn"
        elif most_in_one_turn == 2:
            severity, where = "warning", "within one turn"
        else:
            severity, where = "info", "across turns"
        signals.add(
            severity,
            "repeated_tool_call",
            f"'{name}' called {len(occurrences)}x with byte-identical arguments ({where})",
            trace=occurrences[0]["traceId"],
            observation=occurrences[0]["observationId"],
            detail="Occurrences: " + ", ".join(f"{c['traceId'][:8]}/{c['observationId'][:8]}" for c in occurrences),
        )


# --------------------------------------------------------------------------- digest


def render_timeline(observations: list[dict]) -> list[str]:
    by_id = {o["id"]: o for o in observations}
    ordered = sorted(observations, key=lambda o: (o.get("startTime") or "", o.get("id")))
    base = min((o.get("startTime") or "" for o in ordered), default="")

    def depth(observation: dict) -> int:
        level, cursor, guard = 0, observation.get("parentObservationId"), 0
        while cursor in by_id and guard < 30:
            level += 1
            cursor = by_id[cursor].get("parentObservationId")
            guard += 1
        return level

    lines = ["", "### Timeline", "", "```"]
    for observation in ordered:
        offset = ""
        if base and observation.get("startTime"):
            try:
                from datetime import datetime

                delta = datetime.fromisoformat(observation["startTime"].replace("Z", "+00:00")) - datetime.fromisoformat(
                    base.replace("Z", "+00:00")
                )
                offset = f"+{delta.total_seconds():6.1f}s"
            except ValueError:
                offset = ""
        pad = "  " * depth(observation)
        head = (
            f"{offset} {pad}{observation.get('type', '?'):<10} {observation.get('name', '?')} "
            f"[{observation['id'][:8]}] {seconds(observation):.2f}s"
        )
        extras = " ".join(x for x in (node_label(observation), usage_summary(observation)) if x)
        if extras:
            head += f" | {extras}"
        level = (observation.get("level") or "").upper()
        if level not in ("", "DEFAULT"):
            head += f" | level={level}"
        lines.append(head)
    lines.append("```")
    return lines


def render_conversation(observations: list[dict], seen: set[str], max_chars: int, trace_id: str, signals: Signals, tool_calls: list[dict]) -> list[str]:
    """Render only messages not already shown earlier in the session."""
    lines: list[str] = ["", "### New conversation turns", ""]
    generations = sorted(
        (o for o in observations if o.get("type") == "GENERATION"),
        key=lambda o: (o.get("startTime") or "", o.get("id")),
    )
    if not generations:
        lines.append("_No GENERATION observations in this trace._")
        return lines

    emitted = 0
    for generation in generations:
        messages = generation.get("input")
        # A model call with bound tools records its input as {"messages": [...], "tools": [...]}
        if isinstance(messages, dict) and isinstance(messages.get("messages"), list):
            messages = messages["messages"]
        stream = list(messages) if isinstance(messages, list) else []
        output = generation.get("output")
        if isinstance(output, dict):
            stream.append(output)

        for message in stream:
            if not isinstance(message, dict):
                continue
            key = fingerprint(message)
            if key in seen:
                continue
            seen.add(key)
            emitted += 1

            role = message_role(message)
            text = message_text(message)
            calls = message.get("tool_calls") or []

            scan_message(message, trace_id, generation["id"], signals)
            is_error = tool_error_name(message, text) is not None
            limit = 0 if is_error else max_chars

            if role in ("system", "developer"):
                lines.append(f"**system prompt** ({len(text)} chars, shown once)")
                lines.append("```")
                lines.append(clip(text, min(max_chars, 2500)))
                lines.append("```")
            elif calls:
                if text.strip():
                    lines.append(f"**assistant** [{generation['id'][:8]}]")
                    lines.append(indent_block(clip(text, max_chars), "> "))
                for call in calls:
                    lines.append(f"**tool call → `{call.get('name')}`** [{generation['id'][:8]}]")
                    lines.append("```json")
                    lines.append(clip(call.get("args"), max_chars))
                    lines.append("```")
                    tool_calls.append(
                        {
                            "name": call.get("name"),
                            "args": call.get("args"),
                            "traceId": trace_id,
                            "observationId": generation["id"],
                        }
                    )
            elif is_error or role not in CONVERSATION_ROLES:
                label = "tool result" if role not in CONVERSATION_ROLES else role
                marker = " ❌ ERROR" if is_error else ""
                lines.append(f"**{label} ← `{role}`**{marker} [{generation['id'][:8]}]")
                lines.append("```")
                lines.append(clip(text, limit))
                lines.append("```")
            else:
                lines.append(f"**{role}** [{generation['id'][:8]}]")
                lines.append(indent_block(clip(text, max_chars), "> "))
            lines.append("")

    if emitted == 0:
        lines.append("_Every message in this trace already appeared in an earlier trace._")
    return lines


def render_trace(trace: dict, index: int, total: int, seen: set[str], signals: Signals, tool_calls: list[dict], max_chars: int, slow_seconds: float) -> list[str]:
    observations = trace.get("observations") or []
    trace_id = trace.get("id", "")

    for observation in observations:
        scan_observation(observation, trace_id, signals, slow_seconds)

    roots = root_observations(observations)
    if roots and all(r.get("output") in (None, "", {}, []) for r in roots):
        signals.add(
            "warning",
            "incomplete_trace",
            "Root observation finished without an output — the turn may have aborted mid-flight",
            trace=trace_id,
            observation=roots[0]["id"],
        )

    ordered = sorted(observations, key=lambda o: (o.get("startTime") or "", o.get("id")))

    # A span that never ended is never exported, so a run killed mid-turn leaves spans whose parent is missing.
    # The one expected case is a root whose parent is an unexported framework span: a lone orphan that starts first.
    ids = {o["id"] for o in observations}
    orphans = [o for o in ordered if o.get("parentObservationId") and o["parentObservationId"] not in ids]
    lone_root = len(orphans) == 1 and (
        orphans[0].get("isRootObservation") or (orphans[0].get("startTime") or "") <= (ordered[0].get("startTime") or "")
    )
    if orphans and not lone_root:
        signals.add(
            "error",
            "orphaned_spans",
            f"{len(orphans)} observation(s) whose parent span was never exported — the run was cut off before its enclosing spans ended",
            trace=trace_id,
            observation=orphans[0]["id"],
            detail=", ".join(f"{o.get('name')} [{o['id'][:8]}]" for o in orphans[:10]),
        )
    generations = [o for o in ordered if o.get("type") == "GENERATION"]
    if generations:
        last = generations[-1]
        output = last.get("output")
        if isinstance(output, dict) and output.get("tool_calls"):
            later = [o for o in ordered if (o.get("startTime") or "") > (last.get("endTime") or last.get("startTime") or "")]
            if not any(o.get("name") in {c.get("name") for c in output["tool_calls"]} or o.get("name") == "tools" for o in later):
                signals.add(
                    "error",
                    "aborted_tool_loop",
                    "Trace ends on a tool call that was never executed",
                    trace=trace_id,
                    observation=last["id"],
                    detail=", ".join(str(c.get("name")) for c in output["tool_calls"]),
                )

    cost = trace.get("totalCost")
    lines = [
        "",
        "---",
        "",
        f"## Trace {index}/{total} — {trace.get('name', '?')} `{trace_id}`",
        "",
        f"- started: {trace.get('timestamp')} · latency: {trace.get('latency') or 0:.1f}s"
        + (f" · cost: ${float(cost):.5f}" if cost else "")
        + f" · observations: {len(observations)}",
        f"- user: `{trace.get('userId')}` · env: {trace.get('environment')} · tags: {trace.get('tags') or []}",
        f"- root input: {clip(trace.get('input'), 300)}",
        f"- root output: {clip(trace.get('output'), 300)}",
    ]
    lines += render_timeline(observations)
    lines += render_conversation(observations, seen, max_chars, trace_id, signals, tool_calls)
    return lines


def render_signals(signals: Signals) -> list[str]:
    items = signals.sorted()
    lines = ["", "---", "", "# Signals", ""]
    if not items:
        lines.append("No automatic signals fired. Analyse the conversation for behavioural problems instead.")
        return lines
    counts: dict[str, int] = {}
    for item in items:
        counts[item["severity"]] = counts.get(item["severity"], 0) + 1
    lines.append(" · ".join(f"{severity}: {count}" for severity, count in counts.items()))

    rollup: dict[tuple[str, str, str], int] = {}
    for item in items:
        key = (item["severity"], item["kind"], item["summary"])
        rollup[key] = rollup.get(key, 0) + 1
    recurring = {k: v for k, v in rollup.items() if v > 1}
    if recurring:
        lines += ["", "**Recurring — same failure across turns, so likely systemic rather than a one-off:**", ""]
        for (severity, kind, summary), count in sorted(recurring.items(), key=lambda kv: -kv[1]):
            lines.append(f"- {count}× [{severity}/{kind}] {summary}")
    lines.append("")

    for item in items:
        icon = {"error": "❌", "warning": "⚠️", "info": "ℹ️"}.get(item["severity"], "•")
        lines.append(f"### {icon} [{item['kind']}] {item['summary']}")
        location = " ".join(x for x in (f"trace `{item['traceId']}`" if item["traceId"] else "", f"obs `{item['observationId']}`" if item["observationId"] else "") if x)
        if location:
            lines.append(f"_{location}_")
        if item["detail"]:
            lines.append("```")
            lines.append(item["detail"])
            lines.append("```")
        lines.append("")
    return lines


# --------------------------------------------------------------------------- commands


def command_fetch(args, repo_root: Path) -> None:
    public_key, secret_key, base_url = resolve_credentials(args.env_file, repo_root)
    auth = base64.b64encode(f"{public_key}:{secret_key}".encode()).decode()

    out_dir = Path(args.out).expanduser().resolve()
    (out_dir / "traces").mkdir(parents=True, exist_ok=True)

    if args.command == "fetch":
        header_id, header_kind = extract_id(args.identifier, "session"), "Session"
        filters = {"sessionId": header_id}
    else:
        header_id, header_kind = extract_id(args.identifier, "trace"), "Trace"
        filters = {"traceId": header_id}

    traces = group_traces(fetch_observations(base_url, auth, filters, args.days))
    if not traces:
        sys.exit(
            f"No observations found for {header_kind.lower()} {header_id} in the last {args.days:g} days. "
            "Check the id and the project the keys point at, or widen --days."
        )

    if args.limit:
        traces = traces[-args.limit :]

    for trace in traces:
        (out_dir / "traces" / f"{trace['id']}.json").write_text(json.dumps(trace, indent=1), encoding="utf-8")
        print(f"fetched trace {trace['id']} ({len(trace['observations'])} observations)", file=sys.stderr)

    environments = sorted({str(t.get("environment")) for t in traces})
    header_extra = f"- started: {traces[0]['timestamp']} · environment: {', '.join(environments)} · traces: {len(traces)}"

    signals = Signals()
    seen: set[str] = set()
    tool_calls: list[dict] = []

    total_cost = sum(float(t.get("totalCost") or 0) for t in traces)
    lines = [
        f"# Langfuse {header_kind.lower()} digest — `{header_id}`",
        "",
        f"- base url: {base_url}",
        f"- raw traces: `{out_dir / 'traces'}`",
        f"- total cost: ${total_cost:.5f}",
        header_extra,
    ]

    for index, trace in enumerate(traces, start=1):
        lines += render_trace(trace, index, len(traces), seen, signals, tool_calls, args.max_chars, args.slow_seconds)

    scan_repeated_tool_calls(tool_calls, signals)
    lines += render_signals(signals)

    digest_path = out_dir / "digest.md"
    digest_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    (out_dir / "signals.json").write_text(json.dumps(signals.sorted(), indent=1), encoding="utf-8")

    counts: dict[str, int] = {}
    for item in signals.items:
        counts[item["severity"]] = counts.get(item["severity"], 0) + 1
    print(f"\ndigest:  {digest_path} ({digest_path.stat().st_size // 1024} KB)")
    print(f"signals: {out_dir / 'signals.json'} — {counts or 'none'}")


def command_show(args, repo_root: Path) -> None:
    out_dir = Path(args.out).expanduser().resolve()
    trace_files = sorted((out_dir / "traces").glob("*.json"))
    if not trace_files:
        sys.exit(f"No fetched traces under {out_dir / 'traces'}. Run `fetch` first.")

    for path in trace_files:
        trace = json.loads(path.read_text(encoding="utf-8"))
        for observation in trace.get("observations") or []:
            if not observation["id"].startswith(args.observation_id):
                continue
            print(f"# {observation['type']} {observation['name']} [{observation['id']}] in trace {trace['id']}")
            fields = ["input", "output", "metadata"] if args.field == "all" else [args.field]
            for field in fields:
                value = observation.get(field)
                if args.path:
                    for token in args.path.split("."):
                        if value is None:
                            break
                        value = value[int(token)] if token.isdigit() and isinstance(value, list) else (value or {}).get(token)
                print(f"\n## {field}{'.' + args.path if args.path else ''}")
                print(clip(value, args.max_chars))
            return
    sys.exit(f"No observation id starting with '{args.observation_id}' in {out_dir / 'traces'}")


def main() -> None:
    repo_root = Path(__file__).resolve().parents[4]

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    subparsers = parser.add_subparsers(dest="command", required=True)

    for name, help_text in (("fetch", "fetch a whole session"), ("trace", "fetch a single trace")):
        sub = subparsers.add_parser(name, help=help_text)
        sub.add_argument("identifier", help="Langfuse id or UI URL")
        sub.add_argument("--out", required=True, help="output directory (use the scratchpad)")
        sub.add_argument("--env-file", help="file to read LANGFUSE_* from")
        sub.add_argument("--limit", type=int, default=0, help="only the last N traces of the session")
        sub.add_argument("--days", type=float, default=30.0, help="search observations that started in the last N days")
        sub.add_argument("--max-chars", type=int, default=1500, help="truncation per rendered payload (0 = unlimited)")
        sub.add_argument("--slow-seconds", type=float, default=45.0, help="latency above which an observation is flagged")
        sub.set_defaults(func=command_fetch)

    show = subparsers.add_parser("show", help="print one observation payload from a fetched directory")
    show.add_argument("observation_id", help="full id or unique prefix")
    show.add_argument("--out", required=True, help="directory a previous fetch wrote to")
    show.add_argument("--field", default="all", choices=["input", "output", "metadata", "all"])
    show.add_argument("--path", help="dotted path inside the field, e.g. 0.content or query")
    show.add_argument("--max-chars", type=int, default=8000, help="0 = unlimited")
    show.set_defaults(func=command_show)

    args = parser.parse_args()
    args.func(args, repo_root)


if __name__ == "__main__":
    main()
