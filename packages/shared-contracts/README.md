# @lumi/shared-contracts

Types, zod schemas and rules shared by Lumi's [frontend](../../frontend/README.md) and [backend](../../backend/README.md), so the web app and the API check the same settings and exchange the same chat messages. The package ships TypeScript source; each consumer compiles it (Next.js through `transpilePackages`, the backend through esbuild and tsx). The [widget](../../widget/README.md) is built outside the pnpm workspace and can't import it, so it mirrors the few types it needs.

## Modules

- `@lumi/shared-contracts/adminAccounts`: the password and email rules of email and password admin accounts, which the web app's forms and the backend both apply ([Admin access](https://docs.lumi.nieve.ai/configuration/admin-access)).
- `@lumi/shared-contracts/business`: the business settings the onboarding wizard and admins set, their checks, and their split into public settings and server-only agent guidance ([Configuration](https://docs.lumi.nieve.ai/configuration)).
- `@lumi/shared-contracts/chat`: chat UI message types (`LumiMessage`, `MessageAnnotation`).
- `@lumi/shared-contracts/handoff`: qualification questions, booking destination, enquiry fields and delivery channels, their checks and their split into the public handoff the chat shows and the server-only channels; the enquiry request the chat sends and the handoff card it renders ([Qualification, booking and enquiries](https://docs.lumi.nieve.ai/configuration/handoff)).
- `@lumi/shared-contracts/knowledge`: the structured sources admins turn on or off and their labels, the sources the chat answers from, and the website crawl limits ([Knowledge sources](https://docs.lumi.nieve.ai/configuration/knowledge)).
- `@lumi/shared-contracts/language`: the languages the chat can be shown in, and matching a requested or preferred language to one.
- `@lumi/shared-contracts/media`: the image types admins can upload and the web app serves.
- `@lumi/shared-contracts/pre-sales`: request and response bodies of the pre-sales agent routes.
- `@lumi/shared-contracts/resume`: the web app's path to a team member's PDF resume in a language.
- `@lumi/shared-contracts/secrets`: recognising a secret still set to a `deploy/.env.example` placeholder.
- `@lumi/shared-contracts/usage`: the purposes the admin dashboard reports the team's own model calls under.

## Contributing

Add a module to `src/` and to `exports` in `package.json`. A change here affects both consumers, so agree it with whoever owns the frontend and backend sides of the change. Then run this package's typecheck and both consumers' lint and typecheck; the package has no lint script:

```bash
pnpm -C packages/shared-contracts typecheck
pnpm -C frontend lint && pnpm -C frontend typecheck
pnpm -C backend lint && pnpm -C backend typecheck
```

The widget mirrors `WidgetBusinessResponse` from `business` in its `src/business.ts`: when it changes, update the widget too.
