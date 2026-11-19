/**
 * @typedef {import("./types.mjs").JourneyCheck} Check
 * @typedef {import("./types.mjs").JourneyStep} Step
 * @typedef {import("./types.mjs").JudgedCheck} JudgedCheck
 * @typedef {import("./types.mjs").JudgedStep} JudgedStep
 */

/**
 * @param {string} step The critical step that failed
 * @returns {string} The error of a journey that this step ended
 */
export function abortMessage(step) {
  return `critical step ${step} failed`;
}

/**
 * @param {Check} check A recorded check
 * @param {Readonly<Record<string, string>>} knownFailures The journey's known failures
 * @returns {JudgedCheck} The check with its verdict, and its finding when the journey lists it
 */
function judgeCheck(check, knownFailures) {
  if (!Object.hasOwn(knownFailures, check.name)) {
    return { ...check, verdict: check.pass ? "pass" : "fail" };
  }
  const finding = knownFailures[check.name];
  return { ...check, verdict: check.pass ? "fixed" : "known", finding };
}

/**
 * Judges the steps a journey recorded against its known failures, the one
 * place that policy lives. A check fails unlisted (`fail`) or listed
 * (`known`), and passes unlisted (`pass`) or listed (`fixed`). `fail` and
 * `fixed` fail the journey, `known` does not. An abort at a critical step
 * whose failed checks are all `known` is the expected end and leaves no
 * error; any other abort or error fails the journey.
 *
 * @param {Step[]} steps The steps the journey recorded
 * @param {{ error: string | null, abortedAt: string | null }} end How the journey ended: `abortedAt` names the critical step whose failure ended it, `error` any other error
 * @param {Readonly<Record<string, string>>} knownFailures The journey's known failures: check name to finding
 * @returns {{ status: "PASS" | "FAIL", steps: JudgedStep[], error: string | null }} The judged journey
 */
export function judge(steps, end, knownFailures) {
  const judged = steps.map((step) => ({
    ...step,
    checks: step.checks.map((check) => judgeCheck(check, knownFailures)),
  }));
  const expectedAbort = judged.some(
    (step) =>
      step.name === end.abortedAt &&
      step.checks.every((check) => check.verdict !== "fail"),
  );
  const errors = [
    end.abortedAt === null || expectedAbort
      ? null
      : abortMessage(end.abortedAt),
    end.error,
  ].filter((entry) => entry !== null);
  const error = errors.length === 0 ? null : errors.join("\n");
  const failed =
    error !== null ||
    judged.some((step) =>
      step.checks.some(
        (check) => check.verdict === "fail" || check.verdict === "fixed",
      ),
    );
  return { status: failed ? "FAIL" : "PASS", steps: judged, error };
}
