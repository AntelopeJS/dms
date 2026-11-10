/**
 * Reader's view of DefaultTenantProvisioning.tla for /statechart: one region
 * for the tenant and one per process.
 */

/**
 * @typedef {{
 *   row: { exists: boolean; pending: boolean; holder: string };
 *   done: Record<string, boolean>;
 *   pc: Record<string, string>;
 *   stalled: Record<string, boolean>;
 * }} State
 */

const PROCESS = new Map([
  ["get", "Starting, reading the tenant"],
  ["insert", "Starting, inserting the tenant"],
  ["readBack", "Starting, reading the tenant back"],
  ["exited", "Start failed"],
  ["down", "Killed"],
  ["poll", "Started, waiting for the lease"],
  ["claim", "Started, claiming the lease"],
  ["read", "Started, reading the marker"],
  ["run", "Provisioning"],
  ["step", "Provisioning, running a step"],
  ["release", "Provisioned, giving the lease back"],
  ["clear", "Provisioned, clearing the marker"],
  ["rollback", "Provisioning failed, deleting the tenant"],
  ["settled", "Started, nothing left to do"],
]);

const STEPS_DONE = ["no step done", "one step done", "two steps done", "three steps done"];

/** @param {State} v */
function tenant(v) {
  if (!v.row.exists) return "No tenant";
  const marker = v.row.pending ? "pending" : "provisioned";
  const lease = v.row.holder === "none" ? "lease free" : `lease named ${v.row.holder}`;
  return `${marker}, ${lease}, ${STEPS_DONE[Object.values(v.done).filter(Boolean).length]}`;
}

/** @param {State} v */
export function state(v) {
  /** @type {Record<string, string | undefined>} */
  const regions = { Tenant: tenant(v) };
  const stalled = new Map(Object.entries(v.stalled));
  for (const [r, pc] of Object.entries(v.pc)) {
    const words = PROCESS.get(pc);
    regions[`Process ${r}`] = stalled.get(r) && words ? `${words}, stalled` : words;
  }
  return regions;
}

/** @type {Record<string, string>} */
const STEPS = {
  Get: "the process reads the tenant",
  Insert: "it inserts the tenant, or loses the insert",
  InsertFaults: "the insert throws",
  ReadBack: "it reads the tenant back",
  Restart: "the platform restarts the process",
  PollSettled: "it reads a provisioned tenant",
  PollClaimable: "it reads a free or stale lease",
  Claim: "it claims the lease, or another write moved it",
  ReadPending: "it reads the marker",
  StepStart: "a step starts, is skipped, or answers that another run owns it",
  StepSucceeds: "the step's effect is written",
  StepFails: "the step throws",
  RunEnds: "the handlers settle",
  Release: "it clears the marker and frees the lease, or finds the lease lost",
  Clear: "it clears the marker",
  Rollback: "it deletes the tenant",
  Renew: "the holder renews its lease",
  Kill: "the process is killed",
  Stall: "the holder's renewals stop landing",
  Unstall: "its renewals land again",
  Done: "nothing more happens",
};

/**
 * The arrow label, as an operator watching the replicas sees it happen.
 *
 * @param {string} action
 */
export function step(action) {
  return new Map(Object.entries(STEPS)).get(action) ?? null;
}

export const title = "Default tenant provisioning across replicas";
