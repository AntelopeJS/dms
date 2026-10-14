// Runs the command it is given, unless DMS_PREBUILT is set. CI builds the
// packages once per job and then sets it, so the test and typecheck scripts do
// not compile them again; locally the variable is unset and every script still
// builds what it reads. A node script rather than a shell conditional, so the
// scripts keep working under cmd.exe.

import { spawnSync } from "node:child_process";

const command = process.argv.slice(2).join(" ");

if (!process.env.DMS_PREBUILT && command) {
  const { status } = spawnSync(command, { shell: true, stdio: "inherit" });
  process.exitCode = status ?? 1;
}
