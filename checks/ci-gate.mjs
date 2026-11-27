/** @typedef {{ result?: string }} NeedResult */

/**
 * The jobs a tier must run, held apart from the planner in
 * `checks/affected-packages.mjs` so a planner that drops a job still fails the
 * gate. The fast and none tiers narrow the run and expect none. A pull request
 * narrows the formal checks by its diff, so the formal jobs are expected only
 * outside pull requests.
 *
 * @param {string} tier
 * @param {string} event
 * @returns {string[]}
 */
export const expectedJobs = (tier, event) => {
  if (tier === "fast" || tier === "none") return [];
  return [
    "backend",
    "frontend-test",
    "frontend-verify",
    "e2e",
    ...(event === "pull_request" ? [] : ["formal", "formal-generated"]),
    ...(tier === "queue" || tier === "nightly" ? ["docs-playground"] : []),
    ...(tier === "nightly" ? ["dependents"] : []),
  ];
};

/**
 * The `needs` entries that keep the `ubuntu` gate from passing, as
 * `<job>: <result>`: `select` and `ci` when not successful, any failed or
 * cancelled job, any job the plan requires and any job the tier expects that
 * did not succeed.
 *
 * @param {{
 *   needs: Record<string, NeedResult>,
 *   required: string[],
 *   tier: string,
 *   event: string,
 * }} gate
 * @returns {string[]}
 */
export const gateOffenders = ({ needs, required, tier, event }) => {
  const result = (/** @type {string} */ job) => needs[job]?.result ?? "missing";
  const offenders = new Set([
    ...["select", "ci"].filter((job) => result(job) !== "success"),
    ...Object.keys(needs).filter((job) =>
      ["failure", "cancelled"].includes(result(job)),
    ),
    ...required.filter((job) => result(job) !== "success"),
    ...expectedJobs(tier, event).filter((job) => result(job) !== "success"),
  ]);
  return [...offenders].sort().map((job) => `${job}: ${result(job)}`);
};

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
const isRecord = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * @param {unknown} value
 * @returns {value is string}
 */
const isString = (value) => typeof value === "string";

/**
 * @param {string | undefined} text
 * @returns {unknown}
 */
const parseJson = (text) => {
  if (text === undefined || text === "") return undefined;
  /** @type {unknown} */
  const json = JSON.parse(text);
  return json;
};

/**
 * @param {unknown} value
 * @returns {Record<string, NeedResult>}
 */
const needsFrom = (value) =>
  Object.fromEntries(
    Object.entries(isRecord(value) ? value : {}).map(([job, need]) => [
      job,
      {
        result:
          isRecord(need) && isString(need.result) ? need.result : undefined,
      },
    ]),
  );

if (import.meta.main) {
  const required = parseJson(process.env["REQUIRED"]);
  const offenders = gateOffenders({
    needs: needsFrom(parseJson(process.env["NEEDS"])),
    required: Array.isArray(required) ? required.filter(isString) : [],
    tier: process.env["TIER"] ?? "",
    event: process.env["EVENT"] ?? "",
  });
  if (offenders.length > 0) {
    process.stdout.write(
      `::error::Jobs that did not pass: ${offenders.join(" ")}\n${offenders.join("\n")}\n`,
    );
    process.exit(1);
  }
}
