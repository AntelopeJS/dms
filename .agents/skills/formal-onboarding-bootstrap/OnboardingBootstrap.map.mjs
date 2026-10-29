/**
 * Reader's view of OnboardingBootstrap.tla for /statechart: one region for
 * the platform (owners, an OAuth account, has_onboarded) and one per request.
 */

const REQUEST_NAMES = {
  r1: "Alice's register",
  r2: "Bob's register",
  r3: "Carol's register",
  p1: "a page load",
  p2: "another page load",
  p3: "a third page load",
};

const capitalized = (name) => name[0].toUpperCase() + name.slice(1);

const REGISTER = {
  idle: "Not sent",
  insert: "Found no user",
  tenant: "Created the admin as owner",
  readState: "Made the admin tenant owner",
  writeState: "Found onboarding open",
};

const ANSWER = {
  200: "Answered 200",
  400: "Answered 400 admin_already_set",
  412: "Answered 412 onboarding_already_completed",
  500: "Answered 500",
};

const POLL = {
  idle: "Not sent",
  readUsers: "Found onboarding open",
  write: "Found a user",
  done: "Answered",
};

const OWNERS = ["no owner", "one owner", "two owners", "three owners"];

function platform(v) {
  const phase = v.onboarded ? "Onboarded" : "Onboarding open";
  const oauth = v.oauth === "done" ? " and an OAuth account" : "";
  return `${phase}, ${OWNERS[v.ownerRows.length]}${oauth}`;
}

/** One region for the platform, one per register and per status poll. */
export function state(v) {
  const regions = { Platform: platform(v) };
  for (const [r, pc] of Object.entries(v.rpc)) {
    regions[REQUEST_NAMES[r]] = pc === "done" ? ANSWER[v.answer[r]] : REGISTER[pc];
  }
  for (const [p, pc] of Object.entries(v.ppc)) {
    regions[capitalized(REQUEST_NAMES[p])] = POLL[pc];
  }
  return regions;
}

function moved(from, to, field) {
  return Object.keys(to[field]).find((key) => from[field][key] !== to[field][key]);
}

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
export function step(action, from, to) {
  const label = STEPS[action];
  if (!label) return null;
  const field = action.startsWith("Poll") ? "ppc" : "rpc";
  const key = moved(from, to, field);
  return key ? label(REQUEST_NAMES[key], to[field][key]) : label();
}

export const title = "First-admin bootstrap: POST /api/onboarding/register, GET /api/onboarding/informations";
