import { spawnSync } from "node:child_process";

const command = process.argv.slice(2).join(" ");

if (!process.env.DMS_PREBUILT && command) {
  const { status } = spawnSync(command, { shell: true, stdio: "inherit" });
  process.exitCode = status ?? 1;
}
