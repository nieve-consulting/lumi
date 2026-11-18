# Lumi

[![License: AGPL v3](https://img.shields.io/badge/license-AGPL%20v3-blue)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/nieve-consulting/lumi?label=release)](https://github.com/nieve-consulting/lumi/releases/latest)
[![Docs](https://img.shields.io/badge/docs-docs.lumi.nieve.ai-0a7cff)](https://docs.lumi.nieve.ai)

**An AI website concierge for service businesses.**

Lumi answers your website visitors' questions from your business knowledge, asks the questions that tell you whether they're a fit, and helps them book a conversation with your team or send an enquiry. Your team manages the knowledge and reviews conversations in an admin interface.

**[Read the documentation at docs.lumi.nieve.ai](https://docs.lumi.nieve.ai)** · [Try Lumi](https://chat.lumi.nieve.ai) · [Getting started](https://docs.lumi.nieve.ai/getting-started) · [Self-hosting](https://docs.lumi.nieve.ai/self-hosting) · [Releases](https://github.com/nieve-consulting/lumi/releases) · [Contributing](CONTRIBUTING.md)

## Who it's for

Lumi is for consultancies, agencies, studios, practices and anyone selling expertise. A prospective client arrives with a question, such as "Have you delivered a project like ours?". Lumi looks up the relevant company information, clients and projects, answers, and helps the visitor take the next step.

[Nieve Consulting](https://nieve.ai) builds and maintains Lumi, and runs it on its own website: [try it at chat.lumi.nieve.ai](https://chat.lumi.nieve.ai). Agencies are welcome to adapt it for their clients and to offer implementation or hosting services under the [license](#license).

## What Lumi does

- **Business knowledge:** answers from your website, with optional team, project, client and job-opening sources; see [Knowledge sources](https://docs.lumi.nieve.ai/configuration/knowledge).
- **Visitor conversations:** streaming responses and persisted conversation state.
- **Qualification and handoff:** configurable qualification questions, a booking page or in-chat Google Calendar booking, and enquiries delivered by email or webhook; see [Qualification, booking and enquiries](https://docs.lumi.nieve.ai/configuration/handoff).
- **Embeddable chat:** a launcher for your website that opens the chat in an iframe; see [Embedding the widget](https://docs.lumi.nieve.ai/using-lumi/embedding-the-widget).
- **English and Spanish:** localized interface text and widget language selection.
- **Team administration:** knowledge management, conversation review and model-usage visibility; see [The admin interface](https://docs.lumi.nieve.ai/using-lumi/admin-interface).
- **Developer integrations:** a [GraphQL API](https://docs.lumi.nieve.ai/developers/graphql-api), a [streaming agents API](https://docs.lumi.nieve.ai/developers/streaming-agents-api) and an [MCP server](https://docs.lumi.nieve.ai/developers/mcp-server) for ChatGPT and other MCP clients.

## Two ways to run Lumi

- **Self-host it.** A Docker Compose installation runs the complete product on a host you control, one business per installation, with only an OpenAI API key and a host with Docker. Follow the [Self-hosting guide](https://docs.lumi.nieve.ai/self-hosting).
- **Let Nieve run it.** With Nieve's managed option, Nieve hosts and operates Lumi for you; see [lumi.nieve.ai](https://lumi.nieve.ai).

Both run the same open-source product described in the [documentation](https://docs.lumi.nieve.ai).

## Getting started

To install Lumi for a business, the [Self-hosting guide](https://docs.lumi.nieve.ai/self-hosting) takes you from a [release](https://github.com/nieve-consulting/lumi/releases) to a running installation with Docker Compose: the settings to fill in, initializing the database, setting up the business, embedding the widget and checking the result.

To work on Lumi itself, [Getting started](https://docs.lumi.nieve.ai/getting-started) sets up the development servers and local services.

## Releases

Lumi is actively maintained and released regularly. Each [release](https://github.com/nieve-consulting/lumi/releases) has notes on what changed, and every installation upgrades to a release on its own schedule; see [Upgrades](https://docs.lumi.nieve.ai/self-hosting/operations#upgrades). Releases published with the image workflow also provide versioned backend and frontend images for Linux x86-64 and arm64 in GitHub Container Registry; the self-hosting guide explains downloading them or building from source. The [roadmap](ROADMAP.md) describes where Lumi is heading.

## Explore the repository

| Directory                                                         | Purpose                                                           |
| ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| [frontend/](frontend/README.md)                                   | Public chat, widget iframe, onboarding wizard and admin interface |
| [backend/](backend/README.md)                                     | GraphQL, streaming agents, business services, and integrations    |
| [widget/](widget/README.md)                                       | Embeddable website launcher                                       |
| [packages/shared-contracts/](packages/shared-contracts/README.md) | Shared chat schemas and types                                     |
| [deploy/](deploy/compose.yaml)                                    | Container installation: Compose stack, proxy and settings         |
| [local-dev/](local-dev/docker-local-env.yaml)                     | Local services for development: database, storage and proxy       |

[Architecture](https://docs.lumi.nieve.ai/concepts/architecture) gives the system overview, [Data and privacy](https://docs.lumi.nieve.ai/security/data-and-privacy) what an installation stores and sends, [Operations](https://docs.lumi.nieve.ai/self-hosting/operations) upgrades, export and deletion, and [Security](https://docs.lumi.nieve.ai/security) trust boundaries, limits and the operator checklist.

## Help, contributing and security

- **Questions and installation help:** see [Support](SUPPORT.md).
- **Contributing:** documentation improvements, reproducible bug reports and contributions that make Lumi easier to adopt are welcome. Read [Contributing](CONTRIBUTING.md) for the workflow and required checks. The documentation has its own repository, [nieve-consulting/lumi-docs](https://github.com/nieve-consulting/lumi-docs).
- **Vulnerabilities:** report them privately, as [Security](SECURITY.md) describes.

## License

Copyright © 2024–2026 Nieve Consulting Services S.L.

Lumi is licensed under the [GNU Affero General Public License v3 (AGPL v3)](LICENSE), version 3 only. If you modify Lumi and let users interact with that version over a network, you must prominently offer those users access to the corresponding source under the license.

The embeddable widget in [`widget/`](widget), which runs on the websites that embed Lumi's chat, is licensed under the [Apache License 2.0](widget/LICENSE), and so is the script built from it that every installation serves at `/scripts/lumi-widget.bundle.umd.js` (committed as `frontend/public/scripts/lumi-widget.bundle.umd.js`; release images build it from `widget/`). Websites can embed it without taking on the AGPL's obligations.

Dependencies retain their own licenses.

Maintained by Nieve Consulting. See [Governance](GOVERNANCE.md) for how contributions and product decisions are handled.
