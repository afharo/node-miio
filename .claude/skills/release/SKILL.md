---
name: release
description: Prepare and publish a new version of node-miio (version bump, release PR, auto-merge, version branch restore, GitHub release with generated notes, which publishes to npm with a fresh MIoT spec snapshot). Use when asked to release, cut, or prepare a new version (patch, minor, major or a beta).
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

## 1. Version bump (on a version branch)

Never push to `main` directly: the release goes through a PR, like every other change.

```sh
git checkout -b $NEXT            # the branch is named after the bare version, e.g. 0.19.1
git push -u origin $NEXT         # needed: npm's postversion runs a bare `git push && git push --tags`
npm version <level>
```

- `preversion` runs lint, build and tests. If they fail, fix that first (in a PR): don't skip them.
- It creates the `$NEXT` commit and the `v$NEXT` tag on the branch, and `postversion` **pushes both**. So the tag is
  published before the PR merges. If the PR needs more changes, the tag has to be moved.

## 2. Release PR

Title `$NEXT`, base `main`, head `$NEXT`, label `release` (excluded from the generated notes). Body: the PRs it
releases (`git log v$PREV..$NEXT --oneline`). Then enable auto-merge (the repo only allows squash merges):

```sh
gh pr merge <number> --auto --squash
```

Wait for the PR to be `MERGED` (`gh pr view <number> --json state`), with a background `until` loop rather than
repeated polling.

**Restore the version branch.** The squash merge puts a new commit on `main`, so the tag stays on the branch's commit,
and GitHub deletes the branch after the merge. The maintainer keeps every version branch, so the tag's commit stays
reachable:

```sh
git ls-remote --heads origin $NEXT || true    # empty = deleted
git push origin $NEXT:refs/heads/$NEXT
```

## 3. GitHub release (publishes to npm)

Creating the release triggers `.github/workflows/publish-release-to-npm.yml` (on `release: created`, so **never create
a draft**: it would publish too). The workflow checks the tag matches `package.json`, lints, tests, builds, refreshes
the bundled MIoT spec snapshot (`npm run snapshot`) and publishes with npm Trusted Publishing. Betas go to the `beta`
dist-tag, stable releases to `latest`.

```sh
gh release create v$NEXT --title "v$NEXT - $DATE" --generate-notes --notes-start-tag $START --verify-tag
# betas: add --prerelease
```

Check the notes: `gh release view v$NEXT` should list only the PRs merged since `$START`.

## 4. Check the publish

```sh
gh run list --repo afharo/node-miio --workflow publish-release-to-npm.yml --limit 1
gh run watch <id> --repo afharo/node-miio --exit-status
curl -s https://registry.npmjs.org/-/package/node-miio/dist-tags   # not `npm view`: min-release-age hides new versions
```

If it fails, report it: don't publish by hand without asking. Once a version is on npm, the plugins'
Renovate (no cooldown for node-miio) opens their update PRs.

Sync the local checkout: `git checkout main && git pull --ff-only`.

## Ask the testers / tell the reporters

Once the version is on npm:

- **Beta**: comment on the beta testers issue (#18) mentioning the testers whose model or dock matches the
  changes. Give them a short test list (2–3 items: "turn on X, check that Y happens") and ask for ✅ / ❌ per item, with
  debug logs for ❌. Also comment on the issues the beta addresses, asking the reporters to try it. node-miio betas usually come from a plugin issue: also mention the matching testers in the plugins' issues (homebridge #1232, matterbridge #387).
- **Release**: comment on every issue it addresses: the version, how to enable/use it, and "if it doesn't work, comment
  here and we'll reopen it" (reporters can't reopen issues closed by a maintainer or a PR). Keep them closed: don't
  leave issues open waiting for feedback that may never come.

Report the release and npm links to the user.
