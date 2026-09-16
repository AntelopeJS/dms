import base from "../../oxfmt.config.mts";

export default {
  ...base,
  ignorePatterns: [
    ...(base.ignorePatterns ?? []),
    // Formatted by Prettier until the front end migrates, and Biome excluded
    // every .vue, so bringing them in is part of that migration.
    "frontend-vue/**",
    "**/*.vue",
  ],
};
