# Proof for AntelopeJS/dms#529

Every file here is the raw output of a `dms-control` command or a check, run from /home/antony/code/antelope/t6/dms. The run evidence of the end-to-end proof is next to this folder, under `pr-529/ff0240d302495b16ad43806b3f0e6016fea1706e/` (and `pr-529/98fecf3abe3c198b99e1e20807add68eebf73f39/` for the first pass).

| File | What it shows |
| --- | --- |
| `e2e/commands.log` | `up`, `doctor`, `journey` for all 11 features, `plan`, `doors`, `formal --all`, `verdict`, `publish`, `down` at ff0240d3, with exit codes and times |
| `e2e/doctor.log`, `e2e/journey-*.log`, `e2e/formal.log`, `e2e/plan.log`, `e2e/doors.log`, `e2e/verdict.log`, `e2e/publish.log`, `e2e/down.log` | each command's output (journeys print failures only) |
| `e2e/evidence-count.txt` | evidence files before and after `down` |
| `e2e-98fecf3/` | the same end-to-end pass at 98fecf3, before the mail port fix |
| `seeded-with-control.log` | `dms-control seeded` for all 11 features at b94db4bb, each against an unpatched control |
| `seeded-settings-members-rerun.log` | settings-members again at ff0240d3, after its control lost every email to a mail port another program took |
| `seeded/*.json` | the outcome each seeded run wrote |
| `seeded-doors.log` | `dms-control doors <patch>` for each seeded door |
| `gates/*.log` | `dms-control verdict` on altered copies of the e2e run: a journey not run, an unknown door kind, no verifier, no doors section, an unadjudicated door, a Data door with a wrong containment, and a scratch commit to onboarding.ts gating on the bootstrap model |
| `formal/onboarding-bootstrap-scratch-breaks-ci.txt`, `formal/realtime-tabs-scratch-breaks-ci.txt`, `formal/formal-release-range-scratch-break.log` | each formal check failing on scratch breaks |
| `checks.log` | `pnpm run checks` at 98fecf3a |
| `api-diff.log` | `antelopejs-api-diff origin/main` at 98fecf3a, with the suppression table |
| `suppressions-after.log` | `antelopejs-suppressions` (quiet on success) |
| `decision-trail.tsv` | the design decisions and what each one rejected |
