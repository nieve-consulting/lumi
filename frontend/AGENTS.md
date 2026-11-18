# Frontend

Next.js/React app with public chat, the `/widget` iframe page and the admin interface. Routes live in `src/app`, reusable UI in `src/components`, and client helpers in `src/lib`. Chat streams from the backend agents API.

- Follow the root guide and nearby route/component patterns. Distinguish visitor and candidate flows from team administration when changing UI or copy.
- Coordinate API changes with the backend owner and shared chat/request schemas in `packages/shared-contracts`.
- For GraphQL type refreshes, follow [backend/AGENTS.md](../backend/AGENTS.md#graphql-codegen); never edit `src/generated/` by hand.
- The launcher belongs to `widget/`; changes to the iframe interface may require both workspaces. `public/scripts/` receives the widget bundle through its build process.
- Run `pnpm -C frontend lint` and `pnpm -C frontend typecheck`, and manually verify affected flows. Route user-visible changes through the root guide's UX review step.
