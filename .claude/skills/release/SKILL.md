---
name: release
description: Draft, write notes for, and publish a Lumi GitHub release. Use only when the developer explicitly asks to make a release.
---

# Release

Publishing a release runs `.github/workflows/release.yml`, which checks that the tag matches the frontend version, then builds and publishes backend and frontend images for Linux amd64 and arm64 to `ghcr.io/<owner>/<repository>-backend:<version>` and `ghcr.io/<owner>/<repository>-frontend:<version>`. Image tags omit a leading `v`; no floating `latest` tag is published. It deploys and migrates nothing: each installation upgrades to the release on its own.

1. Take the version from `frontend/package.json`; the workflow fails if the tag doesn't match it. If a release for that version already exists, ask before bumping it (commit the bump as `chore(frontend): Bump version to <version>`).
2. Create it as a draft on `main` with a bare tag and title (`0.43.1`, no `v` prefix): `gh release create <version> --target main --title <version> --generate-notes --draft`.
3. The generated notes only list merged PRs, so add a `## Highlights` section above `## What's Changed` that covers every commit since the previous tag (`git log <prev>..origin/main`; the draft has no tag yet). Group items under Features, Fixes, CI, and Chores and docs (refactors, performance, and style go under Chores and docs; omit empty groups), give each its short commit hash, and keep the generated section and Full Changelog link as they are.
4. Publish it with the notes and mark it Latest: `gh release edit <version> --notes-file <file> --draft=false --latest`.

5. Wait for both image-publishing jobs to succeed. If one fails, report the release as missing images and rerun the failed job after addressing the cause; do not tell operators the download path is ready until both exist. On the first publication, check package visibility and access in GitHub Packages: packages are initially private, and anonymous self-hosters need both packages made public. Do not change visibility without the maintainer's authorization. Verify anonymous pulls on both supported architectures before advertising public availability. The workflow uses its repository's `GITHUB_TOKEN` with `packages: write`; publishing does not need a separate registry secret.
