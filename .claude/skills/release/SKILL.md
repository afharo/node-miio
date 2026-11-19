---
name: release
description: Prepare and publish a new version of node-miio (version bump on main, GitHub release with generated notes, which publishes to npm with a fresh MIoT spec snapshot). Use when asked to release, cut, or prepare a new version (patch, minor, major or a beta).
argument-hint: "[patch|minor|major|prerelease|preminor --preid beta]"
---

# Release a new version

Argument: the `npm version` level: `patch`, `minor`, `major`, or a beta (`preminor --preid beta` for the first beta of
the next minor, `prerelease` for the next beta). If it's missing, propose one from the PRs merged since the last tag
(`git log v$PREV..main --oneline`: new features → `minor`, only fixes → `patch`; betas while a feature set is being
tested by users) and ask before going on.

There's no CHANGELOG: the release notes are generated from the PR labels (`.github/release.yml`). Before releasing,
check that every PR merged since the last tag has a label (`enhancement`, `bug`, `dependencies`, `documentation`…),
or it lands in "Other Changes".

## Before starting

- Start from an up-to-date, clean `main`: `git checkout main && git pull --ff-only`, `git status` clean.
- Work out:
  - `PREV`: the current version in `package.json`.
  - `NEXT`: the version after applying the level to `PREV`.
  - `DATE`: today, as `YYYY-MM-DD`.
  - `START`: the tag the release notes start from. For a beta: the previous tag (`v$PREV`). For a stable release: the
    previous **stable** tag (e.g. `v0.3.0` for `0.4.0`), so the notes cover all the betas.

## 1. Version bump (directly on `main`)

```sh
npm version <level>
```

- `preversion` runs lint, build and tests. If they fail, fix that first (in a PR): don't skip them.
- It creates the `$NEXT` commit and the `v$NEXT` tag on `main`, and `postversion` pushes both.

## 2. GitHub release (publishes to npm)

Creating the release triggers `.github/workflows/publish-release-to-npm.yml` (on `release: created`, so **never create
a draft**: it would publish too). The workflow checks the tag matches `package.json`, lints, tests, builds, refreshes
the bundled MIoT spec snapshot (`npm run snapshot`) and publishes with npm Trusted Publishing. Betas go to the `beta`
dist-tag, stable releases to `latest`.

```sh
gh release create v$NEXT --title "v$NEXT - $DATE" --generate-notes --notes-start-tag $START --verify-tag
# betas: add --prerelease
```

Check the notes: `gh release view v$NEXT` should list only the PRs merged since `$START`.

## 3. Check the publish

```sh
gh run list --repo afharo/node-miio --workflow publish-release-to-npm.yml --limit 1
gh run watch <id> --repo afharo/node-miio --exit-status
npm view node-miio dist-tags
```

If it fails, report it: don't publish by hand without asking. Once a version is on npm, the plugins'
Renovate (no cooldown for node-miio) opens their update PRs.

Report the release and npm links to the user.
