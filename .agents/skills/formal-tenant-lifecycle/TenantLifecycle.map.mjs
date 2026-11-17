/**
 * Reader's view of TenantLifecycle.tla for /statechart: one region for the
 * tenant, one per invocation, one per barrier owner and one for the deletion.
 */

/**
 * @typedef {{
 *   row: { closed: boolean; barrier: string; active: string[] };
 *   attempt: Record<string, string>;
 *   pausing: Record<string, string>;
 *   resuming: Record<string, string>;
 *   deleter: string;
 * }} State
 */

const ATTEMPT = new Map([
  ["idle", "Not called"],
  ["admitRead", "Asking for admission"],
  ["admitCas", "Asking for admission"],
  ["work", "Admitted, effects running"],
  ["finishRead", "Finished, releasing"],
  ["finishCas", "Finished, releasing"],
  ["releaseRead", "Refused, releasing"],
  ["releaseCas", "Refused, releasing"],
  ["done", "Answered, released"],
  ["refused", "Answered its refusal"],
  ["failed", "Failed, admission kept"],
  ["uncertain", "Admission unconfirmed, no effect ran"],
  ["admitFailed", "Not admitted, the database failed"],
  ["refusedPaused", "Refused 409, paused"],
  ["refusedClosed", "Refused, closed"],
]);

const OWNER = new Map([
  ["idle", "Not started"],
  ["observed", "Observed the revision"],
  ["pauseRead", "Observed the revision"],
  ["pauseCas", "Publishing the barrier"],
  ["held", "Holds the barrier"],
  ["lost", "Pause answered false"],
  ["pauseFailed", "Pause threw"],
]);

const RESUME = new Map([
  ["idle", ""],
  ["resumeRead", ", resuming"],
  ["resumeCas", ", resuming"],
  ["resumed", ", resume answered true"],
  ["resumeRefused", ", resume answered false"],
  ["resumeFailed", ", resume threw"],
]);

const DELETER = new Map([
  ["idle", "Not started"],
  ["closeRead", "Closing"],
  ["closeCas", "Closing"],
  ["closeReread", "Testing that nothing is active"],
  ["blocked", "Close rejected, data kept"],
  ["deleting", "Deleting tenant data"],
]);

const COUNT = ["no admission", "one admission", "two admissions", "three admissions"];

/** @param {State["row"]} row */
function tenant(row) {
  const admission = row.closed ? "Closed" : row.barrier === "none" ? "Open" : "Paused";
  return `${admission}, ${COUNT[row.active.length]}`;
}

/** @param {State} v */
export function state(v) {
  /** @type {Record<string, string | undefined>} */
  const regions = { Tenant: tenant(v.row), Deletion: DELETER.get(v.deleter) };
  for (const [a, pc] of Object.entries(v.attempt)) {
    regions[`Invocation ${a}`] = ATTEMPT.get(pc);
  }
  const resuming = new Map(Object.entries(v.resuming));
  for (const [o, pc] of Object.entries(v.pausing)) {
    regions[`Owner ${o}`] = `${OWNER.get(pc)}${RESUME.get(resuming.get(o) ?? "idle")}`;
  }
  return regions;
}

/** @type {Record<string, string>} */
const STEPS = {
  Start: "an invocation asks for admission",
  AdmitRead: "it reads the row",
  AdmitReadFaults: "the read throws",
  AdmitApplied: "its admission is written",
  AdmitStale: "another write moved the revision, it reads again",
  AdmitUnknownLanded: "the write lands, its answer is unknown",
  AdmitUnknownLost: "the write is lost, its answer is unknown",
  WorkSucceeds: "the work resolves",
  WorkRefuses: "the work refuses with a 4xx",
  WorkFails: "the work throws",
  FinishRead: "it reads the row to release",
  FinishApplied: "its admission is removed",
  FinishStale: "another write moved the revision, it reads again",
  FinishReadFaults: "the release read throws, it reads again",
  FinishUnknownLanded: "the release lands, its answer is unknown, it reads again",
  FinishUnknownLost: "the release is lost, it reads again",
  ReleaseRead: "it reads the row to release",
  ReleaseApplied: "its admission is removed",
  ReleaseStale: "another write moved the revision, it reads again",
  ReleaseReadFaults: "the release read throws, it reads again",
  ReleaseUnknownLanded: "the release lands, its answer is lost, it reads again",
  ReleaseUnknownLost: "the release is lost, it reads again",
  Observe: "the owner observes the revision",
  PauseRead: "the pause reads the row",
  PauseReadFaults: "the pause read throws",
  PauseApplied: "the barrier is written",
  PauseStale: "the revision moved, pause answers false",
  PauseUnknownLanded: "the barrier lands, its answer is unknown",
  PauseUnknownLost: "the barrier is lost, its answer is unknown",
  ResumeStart: "the owner resumes",
  ResumeRead: "the resume reads the row",
  ResumeReadFaults: "the resume read throws",
  ResumeApplied: "the barrier is cleared and the revision moves",
  ResumeStale: "another write moved the revision, it reads again",
  ResumeUnknownLanded: "the resume lands, its answer is unknown",
  ResumeUnknownLost: "the resume is lost, its answer is unknown",
  CloseStart: "the deletion closes admission",
  CloseRead: "the close reads the row",
  CloseApplied: "closed is written",
  CloseStale: "another write moved the revision, it reads again",
  CloseReread: "it tests that nothing is active",
  CloseReadFaults: "the close read throws",
  CloseUnknownLanded: "closed lands, its answer is unknown",
  CloseUnknownLost: "closed is lost, its answer is unknown",
};

/**
 * The arrow label, as the tenant's operator sees it happen.
 *
 * @param {string} action
 */
export function step(action) {
  return new Map(Object.entries(STEPS)).get(action) ?? null;
}

export const title = "Tenant lifecycle: admission, barrier and closure on one revision";
