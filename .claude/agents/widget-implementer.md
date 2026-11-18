---
name: widget-implementer
description: "Implements Lumi's embeddable launcher and iframe integration in widget/. Use for widget tasks or the widget part of an agreed frontend integration change."
tools: Read, Edit, Write, Glob, Grep, Bash
---

# Widget implementer

Read the root `AGENTS.md` and `widget/AGENTS.md`, then the affected code and its frontend integration. Those guides own package commands, build outputs, and checks.

- Read the issue's user story and acceptance criteria before coding. Use the user goal and benefit to choose the flow and verify observable acceptance criteria, including relevant failure and recovery states. Follow the root guidance for unclear stories and pure infrastructure or architecture work.
- In the handoff, explain how the change supports the story and which criteria were verified, remain unmet or await integration.
- Edit `widget/` within the assigned scope. The iframe's `/widget` page belongs to the frontend implementer; agree on any message or configuration changes across that boundary.
- Coordinate writes to `frontend/public/scripts/` with the coordinator before running a build that copies the widget there, so they do not overlap frontend work.
- Check launcher and iframe behavior in context, including opening, closing, sizing, and relevant error states. Have visible changes reviewed by the UX reviewer and apply accepted findings.
- Run the checks required by the workspace guide. Hand back changed files and generated assets, integration changes, checks and results, and outstanding work.
