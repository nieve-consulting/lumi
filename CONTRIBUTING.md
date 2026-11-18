# Contributing to Lumi

Documentation, installation feedback, accessibility improvements, and focused bug fixes are valuable contributions. Start with the [README](README.md), the [roadmap](ROADMAP.md), and [Getting started](https://docs.lumi.nieve.ai/getting-started), which sets up a development environment.

## Proposing a change

Search existing issues first. Discuss substantial changes before implementing them so maintainers can assess scope and compatibility. Explain who needs the change, what they want to achieve, and why it matters. Describe acceptance criteria as observable outcomes.

Use fictional examples. Never include credentials, customer conversations, or private business material. Report vulnerabilities through [SECURITY.md](SECURITY.md).

## Development workflow

1. Fork the repository and create a focused branch.
2. Follow [AGENTS.md](AGENTS.md) and the guide for each area you change. These record conventions for people and coding agents.
3. Make a focused change and update the relevant README or guide. When the change is user-facing, update the documentation too (see [Documentation](#documentation)).
4. Run the applicable checks and manually verify the affected behavior.
5. Open a pull request describing the problem, resulting behavior, verification, and limitations. Include screenshots for visible interface changes.

Use Conventional Commits, for example `fix(frontend): preserve the selected chat language` or `docs: clarify local setup`.

## Documentation

Lumi's documentation for people evaluating, installing and running it is published at [docs.lumi.nieve.ai](https://docs.lumi.nieve.ai), from its own repository, [nieve-consulting/lumi-docs](https://github.com/nieve-consulting/lumi-docs). A change that alters what operators, admins or visitors see or configure needs a matching pull request there; link the two pull requests to each other. To fix or improve a page on its own, contribute to that repository directly.

The READMEs in this repository are for contributors: what each part of Lumi does, its local development commands, builds and generation procedures. Installation, configuration and setup guides belong on the documentation site, not in a README.

## Checks

Inspect scripts before executing them. Use pnpm for frontend, backend, and packages/*; the widget uses npm. Run lint and typecheck in every changed application workspace:

```sh
pnpm -C frontend lint
pnpm -C frontend typecheck
```

Substitute backend as appropriate. For the widget:

```sh
npm --prefix widget run lint
npm --prefix widget run typecheck
```

For shared-contract changes, run its typecheck and both frontend and backend lint/typecheck. Follow existing formatting conventions. For documentation-only changes outside workspaces, check links, examples, and formatting; application checks are unnecessary.

The project currently does not add or run tests or test frameworks. Describe manual verification clearly.

## Database, generated files, and releases

Do not hand-edit migrations or generated GraphQL files. Follow [backend/AGENTS.md](backend/AGENTS.md) for generation procedures. Changes to GraphQL type definitions require both backend and frontend code generation.

Coding agents must not apply database or checkpointer migrations. Hand generated migrations to the developer and identify them in the pull request.

Releases are maintainer-operated. Publishing a release checks that its tag matches the frontend version; it deploys and migrates nothing. Each installation upgrades to a release on its own, as [Upgrades](https://docs.lumi.nieve.ai/self-hosting/operations#upgrades) describes for the container installation.

## Contribution licensing

Contributions are provided under the license of the part being changed: AGPL v3, or the Apache License 2.0 for the widget in `widget/` and the bundle built from it in `frontend/public/scripts/`. Submit only material you have the right to contribute, and identify third-party code and its license. Contribution does not transfer your copyright to Nieve.

Maintainers may request changes or decline work based on direction and maintenance capacity. See [Governance](GOVERNANCE.md).
