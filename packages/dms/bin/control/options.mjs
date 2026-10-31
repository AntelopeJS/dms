/**
 * The command line of dms-control: every option any command reads.
 */
export const OPTIONS = /** @type {const} */ ({
  prepare: { type: "boolean" },
  playground: { type: "string" },
  runs: { type: "string" },
  "mongo-url": { type: "string" },
  env: { type: "string", multiple: true },
  base: { type: "string", default: "origin/main" },
  skill: { type: "string" },
  verbose: { type: "boolean" },
  "platform-name": { type: "string" },
  as: { type: "string" },
  tab: { type: "string" },
  role: { type: "string" },
  name: { type: "string" },
  exact: { type: "boolean" },
  nth: { type: "string" },
  "within-role": { type: "string" },
  "within-name": { type: "string" },
  value: { type: "string" },
  key: { type: "string" },
  path: { type: "string" },
  body: { type: "string" },
  pr: { type: "string" },
  all: { type: "boolean" },
});

/**
 * @typedef {ReturnType<typeof import("node:util").parseArgs<{ options: typeof OPTIONS, allowPositionals: true }>>["values"]} Values The options of one command line
 */
