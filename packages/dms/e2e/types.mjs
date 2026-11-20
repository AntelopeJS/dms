/**
 * The shapes the journey runner passes between its modules: the checks and
 * steps a journey records and the judged result of a feature's journey. This
 * module holds types only.
 *
 * @typedef {{ name: string, pass: boolean, detail: string }} JourneyCheck
 * @typedef {{ name: string, folder: string, checks: JourneyCheck[] }} JourneyStep
 * @typedef {"pass" | "fail" | "known" | "fixed"} Verdict `known`: a check the journey lists as a known failure failed; `fixed`: it passed
 * @typedef {JourneyCheck & { verdict: Verdict, finding?: string }} JudgedCheck `finding`: why a listed check fails today
 * @typedef {{ name: string, folder: string, checks: JudgedCheck[] }} JudgedStep
 * @typedef {{ feature: string, journey: string, title: string, entryPoint: string, status: "PASS" | "FAIL", database: string, steps: JudgedStep[], error: string | null, folder: string, ms?: number }} FeatureResult
 */

export {};
