# Widget

Standalone React/Webpack package, outside the pnpm workspace. It builds the embeddable launcher that loads the frontend's `/widget` page in an iframe.

- Use npm: `npm --prefix widget run <script>`; follow the root guide's other shared rules.
- Coordinate launcher/iframe interface changes with the frontend owner. The iframe page itself lives in `frontend/`.
- `build:full` builds the UMD bundle with React included and copies it into `frontend/public/scripts/`. Coordinate ownership of that generated output before running it; do not hand-edit the copied bundle.
- Run `npm --prefix widget run lint`, `npm --prefix widget run typecheck` and `npm --prefix widget run format:check`. Manually verify affected embedding/launcher behavior and route user-visible changes through the root guide's UX review step.
