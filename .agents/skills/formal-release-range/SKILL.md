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

Expect exit code 0, `pass 7` and `fail 0`. The same file runs in `pnpm test`, so `pnpm run checks` and the required CI `checks` job run it.
Change `FC_SEED` to explore another sample. Keep the failing seed and the printed counterexample when reporting a failure. The same seed reproduces the same generation and shrinking with the pinned fast-check version.

Exit 1 means a property failed. Its output is the shrunk counterexample.

## Judge the result

The oracle is `semver.satisfies(version, range)` with default options. It is the check `@antelopejs/core` applies to an interface copy at startup, and a consumer's install resolves with it too. `includePrerelease` is not the promise. It admits `0.10.0-next.0` under `<0.10.0`, which is a prerelease of the breaking minor that the cap exists to keep out. The last test pins the three readings side by side.

1. **Range.** For every mutated range, the rule accepts the semver floor exactly when `semver` parses the range as one `>=0.M.p` and one `<0.(M+1).0` comparator and the text is `>=0.M.p <0.(M+1).0`. It catches a cap that is not the next minor, a loose operator, a union, a prerelease bound, a leading zero and a missing end anchor.
2. **Membership.** For every stable version, the rule and `semver.satisfies` agree. It catches string comparison, an inclusive cap, an exclusive floor, a dropped patch compare, and a dropped major.
3. **Cap.** No version in the next minor or any later release is accepted, prereleases and build metadata included.
4. **Prerelease and build metadata.** For every version, prereleases and build metadata included, the rule and `semver.satisfies` agree.

On failure, rebuild the counterexample as a pair of `iface.version` and `pkg.dependencies['@antelopejs/interface-dms']`. Check these facts before calling it a product bug.

- The version is valid semver and the range is the text printed in the counterexample.
- The oracle call uses default options, with no normalised range.

A malformed generator is a modelling error. A mismatch after those checks is a finding. Keep the property, report the counterexample, and leave `checks/release-range.mjs` unchanged unless the user asks for a fix.

## Behaviour probe

`probe.mjs` prints what the release workflow's `validate` step decides in a checkout, one line per case: 80 version and range pairs, prereleases and build metadata included, and 8 manifests that each break one of the step's other checks. It extracts the step's node script from `release.yml`, wherever the rule lives (inline, as before #529, or imported from `checks/release-range.mjs`), and runs it on fixture manifests built from the checkout's own.

```sh
node .agents/skills/formal-release-range/probe.mjs <checkout>
```

`dms-control formal` runs it on the base and on HEAD of a diff that touches the coverage record. The same output means the diff kept the covered behaviour (`verify-dms` verdict rule 5). A changed line fails it.

## Findings on main

None. The four disagreements recorded before #538 are fixed, and the strict properties now hold. F1 was a prerelease of the floor (`0.9.1-next.0`), F2 a prerelease inside the range (`0.9.5-rc.1`), F3 build metadata (`0.9.5+build.0`), and F4 a leading zero in a range field (`>=0.09.1 <0.10.0`). The rule now rejects every prerelease version, because neither bound carries one, ignores build metadata, and refuses a number with a leading zero.

## Bounds and exclusions

Each property runs 1000 cases with default seed `20261029`, overridable with `FC_SEED`.
Floors are `0.minor.patch` with minor 0 to 4 or 8 to 11 (the second band crosses the `0.9`/`0.10` width change) and patch 0 to 4.
Versions put the major at 0 (weight 8) or 1 to 4, the minor around the floor minor or 0 to 12, and the patch around the floor patch or 0 to 4. Prerelease is absent or `next`, `alpha` or `rc` followed by `.0` to `.4`. Build metadata is absent, `build.0` or `sha.abc123`.
Ranges are the canonical range for the floor and 28 mutations of it (cap and floor changes, other operators, spacing, `v` prefix, prerelease or build bounds, a union, a wildcard, empty, missing, and leading zeros).
An explicit table pins the three oracle readings for seven versions on `>=0.9.1 <0.10.0`, and another pins ten malformed or long versions against `semver.satisfies`.

The check does not cover numbers beyond 2^53, versions or ranges with a leading `v` or `=` on the version, version strings that are not valid semver, or any other check in the `validate` step. The workflow wiring (the step imports `./checks/release-range.mjs` as an ES module) was confirmed by extracting the step and running it, not by a test: a test that read `release.yml` would break the repo's rule that no test reads the file it covers.
`satisfiesImplementedRange` only accepts the exact spelling `>=0.M.p <0.(M+1).0`. A semver-equivalent spelling (two spaces, a trailing space) is rejected on purpose.

## Coverage record

Last synchronized product commit is the fix for #538, which rewrote the rule and reran every scratch break below.

| File | What it covers |
| --- | --- |
| `checks/release-range.mjs` | `satisfiesImplementedRange` and the version and range patterns it reads |
| `checks/release-range.test.mjs` | The properties, the generators and the oracle table |
| `.github/workflows/release.yml` | The `validate` job step that imports the module, with `actions/setup-node` before it |
| `package.json` | The root `test` script that runs the check, and the `fast-check` and `semver` dev dependencies |

Compare changes since the sync commit against this table before trusting an old pass.
After an intended change to the rule or the range shape, update the oracle, generators and this record together.
Move the sync commit forward only after confirming the properties still describe the changed code and rerunning them, including a scratch break.

## Confirm the check can fail

In a scratch copy of `checks/release-range.mjs` and `checks/release-range.test.mjs` outside the repo, apply one break at a time to the module, run the command above, and restore it. These breaks were caught at the sync commit with seed `20261029`. Every run exited 1, and the restored copy exited 0.

| Scratch break | Failing observation |
| --- | --- |
| Numbers compared as strings | Range fails for floor `0.11.1`. Membership, prerelease and the oracle table fail too. |
| `minor === floorMinor` to `>=` | Cap fails for floor `0.0.1`, version `0.1.1`. Membership fails too. |
| `>=` to `>` on the floor patch | Range fails for floor `0.11.1` at the floor itself. Membership fails too. |
| Drop the patch comparison | Membership fails for floor `0.9.3`, version `0.9.0`. |
| Drop `capMinor === floorMinor + 1` | Range fails for `>=0.2.2 <0.4.0` ("cap skips a minor"). |
| Ignore the major | Membership and cap fail for floor `0.2.2`, version `1.2.2`. |
| Drop the `$` of the range pattern | Range fails for `>=0.0.1 <0.1.0 \|\| >=0.20.0 <0.21.0`. |
| Accept a prerelease | Prerelease fails for floor `0.0.0`, version `0.0.0-next.0`. The oracle table fails too. |
| Refuse build metadata | Prerelease fails for floor `0.8.2`, version `0.8.2+build.0`. The oracle table fails too. |
| Accept a leading zero (`\d+`) | Range fails for `>=0.0.00 <0.1.0`. The leading-zero test fails too. |
| Accept a leading zero in the version (`\d+`) | Malformed versions fails for `0.09.5`. |
| Accept an empty build suffix | Malformed versions fails for `0.9.5+`. |
| Accept `_` in build metadata | Malformed versions fails for `0.9.5+a_b`. |
| Drop the 256-character cap | Malformed versions fails for a 257-character version. |
