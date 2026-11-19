import { defineConfig } from "@playwright/test";
import { e2eConfig } from "@antelopejs/dms/e2e";

const config = e2eConfig();
const reporters = Array.isArray(config.reporter)
  ? config.reporter
  : [[config.reporter ?? "list"] as const];

export default defineConfig(config, {
  reporter: [...reporters, ["./weighted-shards.mjs"]],
});
