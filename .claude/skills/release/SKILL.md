---
name: release
description: Draft, write notes for, and publish a Lumi GitHub release. Use only when the developer explicitly asks to make a release.
---

# Release

Publishing a release runs `.github/workflows/release.yml`, which checks that the tag matches the frontend version, then builds and publishes backend and frontend images for Linux amd64 and arm64 to `ghcr.io/<owner>/<repository>-backend:<version>` and `ghcr.io/<owner>/<repository>-frontend:<version>`. Image tags omit a leading `v`; no floating `latest` tag is published. It deploys and migrates nothing: each installation upgrades to the release on its own.

1. Take the version from `frontend/package.json`; the workflow fails if the tag doesn't match it. If a release for that version already exists, ask before bumping it (commit the bump as `chore(frontend): Bump version to <version>`).
2. Create it as a draft on `main` with a bare tag and title (`0.43.1`, no `v` prefix): `gh release create <version> --target main --title <version> --generate-notes --draft`.
3. The generated notes only list merged PRs, so add a `## Highlights` section above `## What's Changed` that covers every commit since the previous tag (`git log <prev>..origin/main`; the draft has no tag yet). Group items under Features, Fixes, CI, and Chores and docs (refactors, performance, and style go under Chores and docs; omit empty groups), give each its short commit hash, and keep the generated section and Full Changelog link as they are.
4. Above `## Highlights`, add a `## Upgrading` section for operators of existing installations. Operators read it for every release since theirs, as [Upgrades](https://docs.lumi.nieve.ai/self-hosting/operations#upgrades) tells them, so write every bullet, with "None" where nothing changed, and link that page. Work it out from `git diff <prev>..origin/main`, not from commit messages:
   - **Database:** each new migration in `backend/db/migrations` and what it changes, in a phrase, and whether the lockfile moves `@langchain/langgraph-checkpoint-postgres` to a new version, which can bring checkpoint migrations.
   - **Going back:** whether the previous release's images work on the migrated database. Say so only when every migration only adds what that release never reads or writes, such as nullable columns or new tables; a dropped or renamed column, a new `NOT NULL` column without a default, or rewritten data means restoring the backup. When unsure, say to restore the backup. Without migrations, the previous release's images work.
   - **Configuration:** settings to add, change or remove in `deploy/.env`, from `deploy/` (`.env.example`, the Compose files, `bundled.env`, `Caddyfile`) and from environment variables the code reads that were added, renamed, removed or became required. Name each and what the operator does.
   - **After upgrading:** anything beyond the documented procedure, such as re-crawling websites so existing pages get new data.
5. Publish it with the notes and mark it Latest: `gh release edit <version> --notes-file <file> --draft=false --latest`.

6. Wait for both image-publishing jobs to succeed. If one fails, report the release as missing images and rerun the failed job after addressing the cause; do not tell operators the download path is ready until both exist. On the first publication, check package visibility and access in GitHub Packages: packages are initially private, and anonymous self-hosters need both packages made public. Do not change visibility without the maintainer's authorization. Verify anonymous pulls on both supported architectures before advertising public availability. The workflow uses its repository's `GITHUB_TOKEN` with `packages: write`; publishing does not need a separate registry secret.
