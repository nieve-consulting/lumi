---
name: github-issue
description: Create or edit Lumi GitHub issues with clear user outcomes and the team's project, status, type, and labels. Use when asked to create or edit a GitHub issue.
---

# GitHub issue

## Write around the user story

For user-facing work, make clear what the issue will do for the user before describing implementation:

- Use a title naming the user capability or outcome.
- Lead with the user, their need or current problem, and the benefit of solving it. “As a …, I want …, so that …” is useful when natural; the substance matters more than the format.
- Describe the intended experience and scope. For bugs, explain what the user experiences now and what they should experience instead.
- Write acceptance criteria as observable outcomes that implementers and the UX reviewer can check, including relevant failure or recovery behaviour.
- Put technical notes and dependencies after the story. A list of components, endpoints or schema changes alone is not sufficient.

When splitting frontend, backend or widget work into separate issues, preserve the shared user story and explain each issue's contribution, with verifiable criteria for its part. Backend-only implementation is not itself an exception.

Pure infrastructure or architecture issues may lead with the technical problem, intended benefit and verifiable technical acceptance criteria instead; do not invent a user story for them.

Apply this guidance when creating or editing issue content. A metadata-only edit does not require rewriting the issue.

## File the issue

Create it in `nieve-consulting/lumi` with `gh issue create` and always:

- Add it to the organization's **Lumi** project (`--project Lumi`, project number 1, owner `nieve-consulting`).
- Set the project **Status** to **Backlog** after creation: `gh project item-edit 1 --owner nieve-consulting --url <issue-url> --field Status --value Backlog`.
- Set the issue **type** (`--type`): `Bug` for unexpected problems, `Feature` for new functionality or requests, `Task` for other work (chores, upgrades, refactors).
- Set **labels** (`--label`) matching the type: `bug` for bugs, `enhancement` for features and tasks; add `documentation` when the work is docs-only.
- For purely technical work, a commit-style title is appropriate, e.g. `chore(backend): Replace deprecated @react-email/components with react-email@6`. For user-facing work, keep the title focused on the user outcome.
