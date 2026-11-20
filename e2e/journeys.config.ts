import type { JourneysConfig } from "@antelopejs/dms/e2e";

export default {
  playground: "packages/dms/playground",
  prepare: [
    [
      "pnpm",
      "install",
      "--frozen-lockfile",
      "--prefer-offline",
      "--ignore-scripts",
    ],
    ["pnpm", "--dir", "packages/dms", "build"],
    ["pnpm", "--dir", "packages/dms/playground", "build"],
  ],
  smoke: "smoke",
} satisfies JourneysConfig;
