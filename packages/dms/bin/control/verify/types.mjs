/**
 * The shapes the verification harness passes between its modules: the plan a
 * diff maps to, the recorded result of a formal check and the results of a
 * feature's journeys. This module holds types only.
 *
 * @typedef {{ name: string, covers: string[], files?: string[], command: string[], violation: RegExp | null }} FormalCheck
 * @typedef {{ name: string, exitCode: number | null, violated: string[], folder: string }} FormalResult
 * @typedef {{ feature: string, files: string[] }} TouchedFeature
 * @typedef {{ baseRef: string, baseSha: string, headSha: string, changed: string[], touched: TouchedFeature[], shared: string[], unmapped: string[], docs: string[], run: string[] }} Plan
 * @typedef {{ name: string, pass: boolean, detail: string }} JourneyCheck
 * @typedef {{ feature: string, journey: string, title: string, entryPoint: string, status: "PASS" | "FAIL", database: string, steps: { name: string, checks: JourneyCheck[] }[], error: string | null, folder: string, ms?: number }} FeatureResult
 */

export {};
