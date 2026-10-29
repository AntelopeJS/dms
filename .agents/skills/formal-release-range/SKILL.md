---
name: formal-release-range
description: Checks the release rule that the interface in the tree satisfies the range the DMS module publishes (satisfiesImplementedRange) against semver, prereleases included. Use when checks/release-range.mjs, the validate job of .github/workflows/release.yml, the interface-dms version, or the @antelopejs/interface-dms range in packages/dms/package.json changes.
---

# Verify the release range rule

The `validate` job of the module release refuses to publish `@antelopejs/dms` unless the interface version in the tree satisfies the range the module publishes for it, and that range is `>=0.M.p <0.(M+1).0`. Without the cap, a breaking interface minor would reach a DMS that does not implement it. If the rule lets a bad pair through, a module is published against an interface release that does not exist, and it installs broken.

The rule is `satisfiesImplementedRange` in `checks/release-range.mjs`. It runs with no dependency, before any install, and the workflow imports it. The properties drive that function and compare it with `semver`.

## Run the properties

Use Node 24 from `.nvmrc` and the pinned lockfile install. From the repository root, run this command.

```sh
FC_SEED=20261029 node --test --test-reporter=spec checks/release-range.test.mjs
```

Expect exit code 0, `pass 9`, `fail 0` and `todo 2`. The same file runs in `pnpm test`, so `pnpm run checks` and the required CI `checks` job run it.
Change `FC_SEED` to explore another sample. Keep the failing seed and the printed counterexample when reporting a failure. The same seed reproduces the same generation and shrinking with the pinned fast-check version.

Exit 1 means a property failed. The `todo` lines are the strict properties that fail on the recorded findings. Their failure output is the shrunk counterexample for the finding, and it does not fail the run.

## Judge the result

The oracle is `semver.satisfies(version, range)` with default options. It is the check `@antelopejs/core` applies to an interface copy at startup, and a consumer's install resolves with it too. `includePrerelease` is not the promise. It admits `0.10.0-next.0` under `<0.10.0`, which is a prerelease of the breaking minor that the cap exists to keep out. The last test pins the three readings side by side.

1. **Range.** For every mutated range, the rule accepts the semver floor exactly when `semver` parses the range as one `>=0.M.p` and one `<0.(M+1).0` comparator and the text is `>=0.M.p <0.(M+1).0`. It catches a cap that is not the next minor, a loose operator, a union, a prerelease bound and a missing end anchor.
2. **Membership.** For every stable version, the rule and `semver.satisfies` agree. It catches string comparison, an inclusive cap, an exclusive floor, a dropped patch compare, and a dropped major.
3. **Cap.** No version in the next minor or any later release is accepted, prereleases and build metadata included.
4. **Prerelease and build metadata.** Outside the recorded classes the rule and `semver.satisfies` agree.
5. **Findings.** Each recorded class still disagrees exactly as recorded.

On failure, rebuild the counterexample as a pair of `iface.version` and `pkg.dependencies['@antelopejs/interface-dms']`. Check these facts before calling it a product bug.

- The version is valid semver and the range is the text printed in the counterexample.
- The oracle call uses default options, with no normalised range.
- The class a failing input falls in (`findingOf`, or the leading-zero mutations) is the one the recorded table names.

A malformed generator is a modelling error. A mismatch after those checks is a finding. Keep the property, record it in `FINDINGS` with its class in `findingOf`, add it below, and leave `checks/release-range.mjs` unchanged unless the user asks for a fix.

## Findings on main

The rule accepts a floor-tuple prerelease and an inside prerelease that `semver.satisfies` rejects, rejects a stable build-metadata version that `semver` accepts, and accepts a range with a leading zero that `semver` cannot parse. The real `validate` step, extracted from the workflow and run on Node 22 and 24 against the range `>=0.9.1 <0.10.0` that `packages/dms/package.json` declares today, exits 0 for `iface.version` `0.9.1-next.0` and `0.9.5-rc.1` and exits 1 for `0.9.5+b`.

- **F1, prerelease of the floor (`0.9.1-next.0` against `>=0.9.1 <0.10.0`).** The rule drops the prerelease and sees `0.9.1`, but `0.9.1-next.0` sorts below `0.9.1`, so the floor release is not the one in the tree. `validate` passes and `npm view @antelopejs/interface-dms@0.9.1-next.0` finds the prerelease, so the module is published with a floor that may not exist yet. Rule true, `semver.satisfies` false, and `includePrerelease` false.
- **F2, prerelease inside the range (`0.9.5-rc.1`).** The rule accepts it. `semver.satisfies` with default options rejects it, which is what core applies to a copy at startup. Rule true, default false, `includePrerelease` true.
- **F3, build metadata (`0.9.5+build.0`).** The patch field reads `5+build.0`, `Number` returns `NaN`, and the comparison is false, so the rule rejects a version inside the range. It also rejects it at the floor. Rule false, `semver.satisfies` true. A version below the floor or in another minor is decided before the patch and is unaffected.
- **F4, leading zero (`>=0.09.1 <0.10.0`, also `>=0.9.01 <0.10.0` and `<0.010.0`).** `\d+` accepts the zero and `Number` ignores it, so the rule accepts a range that `semver` throws on ("Invalid comparator"). The published manifest would carry a range no installer parses.

## Bounds and exclusions

Each property runs 1000 cases with default seed `20261029`, overridable with `FC_SEED`.
Floors are `0.minor.patch` with minor 0 to 4 or 8 to 11 (the second band crosses the `0.9`/`0.10` width change) and patch 0 to 4.
Versions put the major at 0 (weight 8) or 1 to 4, the minor around the floor minor or 0 to 12, and the patch around the floor patch or 0 to 4. Prerelease is absent or `next`, `alpha` or `rc` followed by `.0` to `.4`. Build metadata is absent, `build.0` or `sha.abc123`.
Ranges are the canonical range for the floor and 28 mutations of it (cap and floor changes, other operators, spacing, `v` prefix, prerelease or build bounds, a union, a wildcard, empty, missing, and leading zeros).
An explicit table pins the three oracle readings for seven versions on `>=0.9.1 <0.10.0`.

The check does not cover numbers beyond 2^53, versions or ranges with a leading `v` or `=` on the version, version strings that are not valid semver, or any other check in the `validate` step. The workflow wiring (the step imports `./checks/release-range.mjs` as an ES module) was confirmed by extracting the step and running it, not by a test: a test that read `release.yml` would break the repo's rule that no test reads the file it covers.
`satisfiesImplementedRange` only accepts the exact spelling `>=0.M.p <0.(M+1).0`. A semver-equivalent spelling (two spaces, a trailing space) is rejected on purpose.

## Coverage record

Last synchronized product commit is `4c96f61dfea37ed62104af8a13b0869ba6f927e9`.

| File | What it covers |
| --- | --- |
| `checks/release-range.mjs` | `satisfiesImplementedRange` and its `compare` helper |
| `checks/release-range.test.mjs` | The properties, the generators, the recorded findings and the oracle table |
| `.github/workflows/release.yml` | The `validate` job step that imports the module, with `actions/setup-node` before it |
| `package.json` | The root `test` script that runs the check, and the `fast-check` and `semver` dev dependencies |

Compare changes since the sync commit against this table before trusting an old pass.
After an intended change to the rule or the range shape, update the oracle, generators, `FINDINGS` and this record together.
Move the sync commit forward only after confirming the properties still describe the changed code and rerunning them, including a scratch break.

## Confirm the check can fail

In a scratch copy of `checks/release-range.mjs` and `checks/release-range.test.mjs` outside the repo, apply one break at a time to the module, run the command above, and restore it. These breaks were caught at the sync commit with seed `20261029`. Every run exited 1, and the restored copy exited 0.

| Scratch break | Failing observation |
| --- | --- |
| `compare` orders versions as strings | Membership fails for floor `0.9.3`. Range, cap and the findings fail too. |
| `< 0` to `<= 0` on the cap | Membership fails for floor `0.10.1`, version `0.11.0`. Cap fails. |
| `>= 0` to `> 0` on the floor | Membership fails for floor `0.11.1` at the floor itself. |
| Drop the patch comparison | Membership fails for floor `0.9.3`, version `0.9.0`. |
| Drop `Number(match[4]) !== Number(match[2]) + 1` | Range fails for `>=0.2.2 <0.4.0` ("cap skips a minor"). |
| Accept a prerelease of the cap release | Cap fails for floor `0.2.1`, version `0.3.0-next.0`. |
| Drop the `$` of the range pattern | Range fails for `>=0.0.1 <0.1.0 \|\| >=0.20.0 <0.21.0`. |
| Ignore the major | Membership and cap fail for floor `0.2.2`, version `1.2.2`. |
| Strip build metadata (F3 fixed) | Finding F3 fails: it no longer disagrees. Move it out of `FINDINGS`. |
| Floor-tuple prerelease sorts below the floor (F1 fixed) | Finding F1 fails: it no longer disagrees. |
| Numeric fields without leading zeros (F4 fixed) | The F4 example test fails: the rule rejects the range. |
| Reject every prerelease | Findings F1 and F2 fail, because they no longer accept. |
