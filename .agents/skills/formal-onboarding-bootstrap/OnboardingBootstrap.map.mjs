/**
 * Reader's view of OnboardingBootstrap.tla for /statechart: one region for
 * the platform (owners, an OAuth account, has_onboarded) and one per request.
 */

/**
 * @typedef {{
 *   onboarded: boolean;
 *   oauth: string;
 *   ownerRows: unknown[];
 *   rpc: Record<string, string>;
 *   ppc: Record<string, string>;
 *   answer: Record<string, number>;
 * }} State
 */

const REQUEST_NAMES = new Map([
  ["r1", "Alice's register"],
  ["r2", "Bob's register"],
  ["r3", "Carol's register"],
  ["p1", "a page load"],
  ["p2", "another page load"],
  ["p3", "a third page load"],
]);

const capitalized = (/** @type {string | undefined} */ name = "") => name.charAt(0).toUpperCase() + name.slice(1);

const REGISTER = new Map([
  ["idle", "Not sent"],
  ["insert", "Found no user"],
  ["tenant", "Created the admin as owner"],
  ["readState", "Made the admin tenant owner"],
  ["writeState", "Found onboarding open"],
]);

const ANSWER = new Map([
  [200, "Answered 200"],
  [400, "Answered 400 admin_already_set"],
  [412, "Answered 412 onboarding_already_completed"],
  [500, "Answered 500"],
]);

const POLL = new Map([
  ["idle", "Not sent"],
  ["readUsers", "Found onboarding open"],
  ["write", "Found a user"],
  ["done", "Answered"],
]);

const OWNERS = ["no owner", "one owner", "two owners", "three owners"];

/** @param {State} v */
function platform(v) {
  const phase = v.onboarded ? "Onboarded" : "Onboarding open";
  const oauth = v.oauth === "done" ? " and an OAuth account" : "";
  return `${phase}, ${OWNERS[v.ownerRows.length]}${oauth}`;
}

/** One region for the platform, one per register and per status poll. */
/** @param {State} v */
export function state(v) {
  const answers = new Map(Object.entries(v.answer));
  /** @type {Record<string, string | undefined>} */
  const regions = { Platform: platform(v) };
  for (const [r, pc] of Object.entries(v.rpc)) {
    regions[REQUEST_NAMES.get(r) ?? "undefined"] = pc === "done" ? ANSWER.get(answers.get(r) ?? Number.NaN) : REGISTER.get(pc);
  }
  for (const [p, pc] of Object.entries(v.ppc)) {
    regions[capitalized(REQUEST_NAMES.get(p))] = POLL.get(pc);
  }
  return regions;
}

/**
 * @param {State} from
 * @param {State} to
 * @param {"rpc" | "ppc"} field
 */
function moved(from, to, field) {
  const before = new Map(Object.entries(from[field]));
  return Object.keys(to[field]).find((key) => before.get(key) !== new Map(Object.entries(to[field])).get(key));
}

/** @type {Record<string, (who?: string, to?: string) => string>} */
const STEPS = {
  RegReadUsers: (who, to) => (to === "insert" ? `${who} finds no user` : `${who} finds a user`),
  RegInsert: (who) => `${who} creates the admin as owner`,
  RegTenant: (who) => `${who} makes the admin tenant owner`,
  RegReadState: (who, to) =>
    to === "writeState" ? `${who} finds onboarding open` : `${who} finds onboarding done`,
  RegWriteState: (who) => `${who} marks onboarding done`,
  RegFails: (who) => `a database call of ${who} fails`,
  PollReadState: (who, to) =>
    to === "readUsers" ? `${who} finds onboarding open` : `${who} finds onboarding done`,
  PollReadUsers: (who, to) => (to === "write" ? `${who} finds a user` : `${who} finds no user`),
  PollWrite: (who) => `${who} marks onboarding done`,
  OAuthCreatesUser: () => "a visitor signs up with OAuth",
};

/** The arrow label, as the person onboarding or the visitor sees it happen. */
/**
 * @param {string} action
 * @param {State} from
 * @param {State} to
 */
export function step(action, from, to) {
  const label = STEPS[action];
  if (!label) return null;
  const field = action.startsWith("Poll") ? "ppc" : "rpc";
  const key = moved(from, to, field);
  return key ? label(REQUEST_NAMES.get(key), new Map(Object.entries(to[field])).get(key)) : label();
}

export const title = "First-admin bootstrap: POST /api/onboarding/register, GET /api/onboarding/informations";
