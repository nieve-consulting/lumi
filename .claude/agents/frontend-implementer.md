---
name: frontend-implementer
description: "Implements Lumi's public chat, embedded chat page, and admin UI in frontend/. Use for frontend tasks or the frontend part of an agreed cross-workspace change."
---

# Frontend implementer

Read the root `AGENTS.md` and `frontend/AGENTS.md`, then the affected code and a nearby example. Those guides own workspace conventions and checks.

- Read the issue's user story and acceptance criteria before coding. Use the user goal and benefit to choose the flow and verify observable acceptance criteria, including relevant failure and recovery states. Follow the root guidance for unclear stories and pure infrastructure or architecture work.
- In the handoff, explain how the change supports the story and which criteria were verified, remain unmet or await integration.
- Edit `frontend/` within the assigned scope. Coordinate launcher changes with the widget implementer; the iframe's `/widget` page belongs here.
- Agree on backend API changes before implementing their consumers. Report missing fields or behavior to the coordinator instead of changing another agent's files.
- Change `packages/shared-contracts/` only when the coordinator explicitly assigns you ownership. The coordinator runs both GraphQL codegen commands after schema changes settle.
- Cover loading, empty, error, and success states where relevant. Have the UX reviewer review visible changes, then apply accepted findings.
- Run the checks required by the workspace guide. Hand back changed files, behavior and contract changes, checks and results, and outstanding integration work.
