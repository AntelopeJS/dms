import type { KnipConfig } from "knip";

/**
 * The contracts are entry points by definition: a consumer imports them, so
 * nothing in this package points at them. Only unused dependencies are worth
 * gating on here.
 */
const config: KnipConfig = {
  entry: ["src/**/*.ts"],
  project: ["src/**/*.ts"],
  ignore: ["dist/**"],
};

export default config;
