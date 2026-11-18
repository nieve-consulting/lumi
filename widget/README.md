# Lumi widget

The embeddable launcher that puts Lumi's chat on a business's website. The launcher runs on the host page, reads the installation's public business settings (`GET <origin>/api/business`) and opens the chat from the installation's `/widget` page, which the [frontend](../frontend/README.md) serves, in an iframe. Every installation serves the full bundle at `/scripts/lumi-widget.bundle.umd.js`.

How to embed it, its options, how it finds the installation and chooses the language are in [Embedding the widget](https://docs.lumi.nieve.ai/using-lumi/embedding-the-widget). This README is for working on the widget.

The widget is a standalone React and Webpack package, outside the pnpm workspace: use npm (`npm --prefix widget run <script>` from the repository root). Conventions for people and coding agents are in [AGENTS.md](AGENTS.md).

## Layout

- `src/index.tsx`: the `LumiWidget.init` entry point of the full (UMD) bundle; the ES module bundle exports the `Widget` React component (`src/widget.tsx`).
- `src/config.ts` and `src/origin.ts`: which installation the widget connects to (the `origin` option, then `LUMI_WIDGET_ORIGIN`, then the script's own origin in the UMD bundle, then the local proxy in development). `origin.ts` is also imported by the webpack config to check `LUMI_WIDGET_ORIGIN`, so it must stay free of browser globals and imports.
- `src/business.ts`: fetching the installation's business settings. It follows the response format that `WidgetBusinessResponse` in `@lumi/shared-contracts/business` describes, which the widget can't import: keep them in step (see [License](#license)).
- `src/i18n.ts`: the launcher's own strings and language matching. The chat's languages are the frontend's (`@lumi/shared-contracts/language`).
- `src/components`: the launcher buttons (`Launcher/`) and the container that opens the chat's iframe.
- `webpack/`: the development server and the production builds. `test/`: the pages for trying the development bundle (`index.html`) and the bundle the web app serves (`index.prod.html`).

Changes to the interface between the launcher and the `/widget` page usually need the frontend too.

## License

The widget is licensed under the [Apache License 2.0](LICENSE), unlike the rest of Lumi (AGPL v3), so websites can embed it freely. The full bundle copied into `frontend/public/scripts/` is built from this package and is covered by the same license; both bundles start with a comment naming it. Keep code from the AGPL parts of the repository out of the widget. Where the widget follows an installation's API, as `src/business.ts` follows `GET /api/business`, write its own types and checks from the response format rather than copying them from `@lumi/shared-contracts`.

## Building

To build the ES module bundle (React not included) and its type declarations into `dist/`:

```bash
npm run build
```

To build the full bundle (React included) and copy it into `frontend/public/scripts/`, which the web app serves:

```bash
npm run build:full
```

Build the full bundle without `LUMI_WIDGET_ORIGIN`: pages that load it from an installation connect to the installation that serves it.

The ES module bundle is bundled into the host's own scripts, so it can't tell which installation it came from. Give it a default installation when building it:

```bash
LUMI_WIDGET_ORIGIN=https://lumi.example.com npm run build
```

The build stops with the reason when `LUMI_WIDGET_ORIGIN` isn't a valid origin. An empty value counts as unset. Building the ES module bundle without it prints a warning, as pages must then pass `origin`. Changing an installation's business settings needs no rebuild; changing `LUMI_WIDGET_ORIGIN` does.

## Running in development mode

Start the web app and the local services as in [Getting started](https://docs.lumi.nieve.ai/getting-started), whose proxy serves the web app on [http://localhost:8080](http://localhost:8080), then:

```bash
npm run start
```

Open [http://localhost:2000](http://localhost:2000) to see the widget. The page is `test/index.html`, which loads the development bundle; it connects to `http://localhost:8080` unless you pass `origin` or start it with `LUMI_WIDGET_ORIGIN`, and shows the local installation's settings. The web app's own port, 3000, won't do: its chat calls `/agents` on its own address, which only the proxy serves. To try the bundle the web app serves, run `npm run build:full` and open `test/index.prod.html`, which loads it from `http://localhost:8080/scripts/`.

## Checks

```bash
npm run lint
npm run typecheck
```

Check the launcher on a page in each state it handles (set up, not set up yet, not a Lumi installation, unreachable) and in each language when you change how it starts or what it shows.
