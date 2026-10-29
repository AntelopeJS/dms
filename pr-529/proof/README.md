# Proof for AntelopeJS/dms#529

Every file here is the raw output of a `dms-control` command or a check, run from /home/antony/code/antelope/t6/dms. The run evidence of the end-to-end proof is next to this folder, under `pr-529/ff0240d302495b16ad43806b3f0e6016fea1706e/` (and `pr-529/98fecf3abe3c198b99e1e20807add68eebf73f39/` for the first pass).

| File | What it shows |
| --- | --- |
| `e2e-ff0240d3/commands.log` | `up`, `doctor`, `journey` for all 11 features, `plan`, `doors`, `formal --all`, `verdict`, `publish`, `down` at ff0240d3, with exit codes and times |
| `e2e-ff0240d3/*.log` | each command's output (journeys print failures only) |
| `e2e-ff0240d3/evidence-count.txt`, `e2e/evidence-count.txt` | evidence files that survived `down` |
| `e2e-98fecf3/` | the same end-to-end pass at 98fecf3, before the mail port fix |
| `seeded-with-control.log` | `dms-control seeded` for all 11 features at b94db4bb, each against an unpatched control |
| `seeded-settings-members-rerun.log` | settings-members again at ff0240d3, after its control lost every email to a mail port another program took |
| `seeded/*.json` | the outcome each seeded run wrote |
| `seeded-doors.log` | `dms-control doors <patch>` for each seeded door |
| `gates/*.log` | `dms-control verdict` on altered copies of the e2e run: a journey not run, an unknown door kind, no verifier, no doors section, an unadjudicated door, a Data door with a wrong containment, and a scratch commit to onboarding.ts gating on the bootstrap model |
| `formal/onboarding-bootstrap-scratch-breaks-ci.txt`, `formal/realtime-tabs-scratch-breaks-ci.txt`, `formal/formal-release-range-scratch-break.log` | each formal check failing on scratch breaks |
| `checks.log` | `pnpm run checks` at 98fecf3a |
| `api-diff.log` | `antelopejs-api-diff origin/main` at ec1e0784, with the suppression table |
| `suppressions-after.log` | `antelopejs-suppressions` (quiet on success) |
| `decision-trail.tsv` | the design decisions and what each one rejected |
| `fix-round/journeys.log` | after the verifier's fix round: `up --prepare`, `doctor`, smoke, the two Data containment journeys, the Format containment journey and tenancy, then `down` |
| `fix-round/plan-per-seeded-break.log` | `plan` on a scratch commit of each seeded break: each plan runs the break's own feature |
| `fix-round/map-rule-negative.log` | `map` failing when block-preview's covers miss the file its seeded break edits |
| `fix-round/checks.log` | `pnpm run checks` at ec1e0784 |
| `gates/containment-outside-plan-passes.log`, `gates/containment-not-run.log` | a Data door in tenancy contained by `settings-members/remove-member-shows-impact` passes the containment rule; naming a containment journey absent from the run fails it |
| `e2e/` | the end-to-end journeys again at ec1e0784, the fix-round head (no `publish`); its evidence is under `pr-529/ec1e0784ccfa495596f7a03eb4a23d694a703e3a/` |
| `e2e-ff0240d3/` | the end-to-end pass at ff0240d3, with `verdict` and `publish` |
