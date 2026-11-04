/**
 * The shapes the verification harness passes between its modules: the plan a
 * diff maps to, the verifier's judgement, the recorded result of a formal
 * check and the verdict computed from them. This module holds types only.
 *
 * @typedef {{ kind: "emit" } | { kind: "probe", command: string[] }} BehaviourProbe
 * @typedef {{ name: string, covers: string[], files?: string[], command: string[], baseCommand?: string[], violation: RegExp | null, passing: RegExp | null, behaviour?: BehaviourProbe }} FormalCheck
 * @typedef {{ baseSha: string, headSha: string }} Commits
 * @typedef {{ method: string, changed: boolean, removed: string[], added: string[] }} BehaviourChange
 * @typedef {{ exitCode: number | null, violated: string[], passing: string[] }} Rules
 * @typedef {{ name: string, exitCode: number | null, violated: string[], passing: string[], folder: string, commits?: Commits, behaviour?: BehaviourChange, checkChanged?: boolean, base?: Rules | null, fixed?: string[], missing?: string[] }} FormalResult
 * @typedef {{ feature: string, files: string[] }} TouchedFeature
 * @typedef {{ baseRef: string, baseSha: string, headSha: string, changed: string[], touched: TouchedFeature[], unmapped: string[], docs: string[], containments: string[], run: string[] }} Plan
 * @typedef {{ kind?: string, location?: string, irreversible?: string, containment?: string, containmentJourney?: string }} RawDoorRow
 * @typedef {{ kind?: string, location?: string, reason?: string }} RawFalsePositive
 * @typedef {{ page: string, matches?: boolean, note?: string }} RawDocsJudgement
 * @typedef {{ verifier?: string, notVerified?: string[], attention?: string[], docs?: RawDocsJudgement[], doors?: { none?: string, rows?: RawDoorRow[], falsePositives?: RawFalsePositive[] } }} RawJudgement
 * @typedef {{ kind: string, location: string, irreversible: string, containment: string, containmentJourney: string }} DoorRow
 * @typedef {{ kind: string, location: string, reason: string }} FalsePositive
 * @typedef {{ page: string, matches: boolean, note: string }} DocsJudgement
 * @typedef {{ notVerified: string[], attention: string[], docs: DocsJudgement[], doorsNone: string | null, doors: DoorRow[], falsePositives: FalsePositive[], verifier: string }} Judgement
 * @typedef {{ name: string, pass: boolean, detail: string }} JourneyCheck
 * @typedef {{ feature: string, journey: string, title: string, entryPoint: string, status: "PASS" | "FAIL", database: string, steps: { name: string, checks: JourneyCheck[] }[], error: string | null, folder: string }} FeatureResult
 * @typedef {{ result: string, headSha: string, skillSha: string, pr: number, reasons: string[] }} VerdictCore
 * @typedef {VerdictCore & { markdown: string }} Verdict
 * @typedef {{ feature: string, caught: boolean, run: string, controlRun: string, caughtBy: string[], failingInControl: string[], harnessErrors: string[], output: string }} SeededOutcome
 */

export {};
