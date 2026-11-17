import assert from "node:assert/strict";
import { test } from "node:test";
import * as provisioning from "../skills/formal-default-tenant-provisioning/DefaultTenantProvisioning.map.mjs";
import * as onboarding from "../skills/formal-onboarding-bootstrap/OnboardingBootstrap.map.mjs";
import * as realtime from "../skills/formal-realtime-tabs/RealtimeTabs.map.mjs";
import * as lifecycle from "../skills/formal-tenant-lifecycle/TenantLifecycle.map.mjs";
import { readModule, setOf, stringOf } from "./helpers/spec-values.mjs";

const onboardingTla = readModule(
  "formal-onboarding-bootstrap",
  "OnboardingBootstrap.tla",
);
const registerSteps = setOf(onboardingTla, "RegisterSteps");
const pollSteps = setOf(onboardingTla, "PollSteps");
const answers = setOf(onboardingTla, "Answers");

const realtimeTla = readModule("formal-realtime-tabs", "RealtimeTabsState.tla");
const tabs = setOf(realtimeTla, "Tabs");
const noTab = stringOf(realtimeTla, "NoTab");

const platform = {
  onboarded: false,
  oauth: "off",
  ownerRows: [],
  ppc: {},
};

await test("TLC prints the answers as strings, and the view words each one", () => {
  assert.deepEqual(answers, ["none", "200", "400", "403", "412", "500"]);
  const words = answers
    .filter((answer) => answer !== "none")
    .map(
      (answer) =>
        onboarding.state({
          ...platform,
          rpc: { r1: "done" },
          answer: { r1: answer },
        })["Alice's register"],
    );
  assert.deepEqual(words, [
    "Answered 200",
    "Answered 400 admin_already_set",
    "Answered 403 invalid_setup_token",
    "Answered 412 onboarding_already_completed",
    "Answered 500",
  ]);
});

await test("the state chart-race.cfg prints reads Bob's 400 answer", () => {
  const printed = {
    ...platform,
    ownerRows: ["r1"],
    rpc: { r1: "tenant", r2: "done" },
    answer: { r1: "none", r2: "400" },
  };
  assert.deepEqual(onboarding.state(printed), {
    Platform: "Onboarding open, one owner",
    "Alice's register": "Created the admin as owner",
    "Bob's register": "Answered 400 admin_already_set",
  });
});

await test("every step of a register and of a page load has words, with any answer", () => {
  for (const step of registerSteps) {
    for (const answer of answers) {
      if ((step === "done") === (answer === "none")) continue;
      const regions = onboarding.state({
        ...platform,
        rpc: { r1: step },
        answer: { r1: answer },
      });
      assert.notEqual(
        regions["Alice's register"],
        undefined,
        `a register at ${step} with answer ${answer}`,
      );
    }
  }
  for (const step of pollSteps) {
    const regions = onboarding.state({
      ...platform,
      rpc: {},
      ppc: { p1: step },
      answer: {},
    });
    assert.notEqual(regions["A page load"], undefined, `a poll at ${step}`);
  }
});

await test("the leader's tab names the leader, and no tab keeps the three regions", () => {
  /** @type {("t1" | "t2" | "none")[]} */
  const leaders = ["t1", "t2", "none"];
  assert.deepEqual([...tabs, noTab], leaders);
  const tab = {
    st: "open",
    sid: 0,
    conn: 0,
    topics: false,
    loaded: true,
    shown: 0,
  };
  const withLeader = (/** @type {(typeof leaders)[number]} */ leader) => ({
    tab: { t1: tab, t2: tab },
    sess: {},
    lead: { tab: leader, h: 0 },
    conn: {},
    chan: { t1: {}, t2: {} },
    stored: 0,
  });
  for (const leader of leaders) {
    assert.deepEqual(Object.keys(realtime.state(withLeader(leader))), [
      "Tab 1",
      "Tab 2",
      "Record",
    ]);
  }
  assert.deepEqual(
    leaders.slice(0, 2).map((leader) => {
      const state = withLeader(leader);
      return realtime.step("LeaderSeesDrop", state, state);
    }),
    ["Tab 1 sees the stream end", "Tab 2 sees the stream end"],
  );
});

await test("every step of the tenant lifecycle has words, and the tenant names its state", () => {
  const lifecycleTla = readModule("formal-tenant-lifecycle", "TenantLifecycle.tla");
  const base = {
    row: { closed: false, barrier: "o1", active: ["a1"] },
    attempt: { a1: "idle" },
    pausing: { o1: "idle" },
    resuming: { o1: "idle" },
    deleter: "idle",
  };
  assert.equal(lifecycle.state(base).Tenant, "Paused, one admission");
  for (const step of setOf(lifecycleTla, "AttemptSteps")) {
    const regions = lifecycle.state({ ...base, attempt: { a1: step } });
    assert.notEqual(regions["Invocation a1"], undefined, `an attempt at ${step}`);
  }
  for (const step of setOf(lifecycleTla, "PauseSteps")) {
    const regions = lifecycle.state({ ...base, pausing: { o1: step } });
    assert.doesNotMatch(regions["Owner o1"] ?? "", /undefined/, `a pause at ${step}`);
  }
  for (const step of setOf(lifecycleTla, "ResumeSteps")) {
    const regions = lifecycle.state({ ...base, resuming: { o1: step } });
    assert.doesNotMatch(regions["Owner o1"] ?? "", /undefined/, `a resume at ${step}`);
  }
  for (const step of setOf(lifecycleTla, "DeleterSteps")) {
    const regions = lifecycle.state({ ...base, deleter: step });
    assert.notEqual(regions.Deletion, undefined, `the deletion at ${step}`);
  }
  for (const action of lifecycleTla.matchAll(/^([A-Z]\w+)\([ao]\) ==$/gm)) {
    if (action[1]?.match(/^(?:Admitted|AttemptStep|OwnerStep)$/)) continue;
    assert.notEqual(lifecycle.step(action[1] ?? ""), null, `the action ${action[1]}`);
  }
});

await test("every phase and action of the default tenant's provisioning has words", () => {
  const provisioningTla = readModule(
    "formal-default-tenant-provisioning",
    "DefaultTenantProvisioning.tla",
  );
  const base = {
    row: { exists: true, pending: true, holder: "r2" },
    done: { 1: true, 2: false },
    pc: { r1: "get" },
    stalled: { r1: true },
  };
  assert.equal(
    provisioning.state(base).Tenant,
    "pending, lease named r2, one step done",
  );
  for (const phase of setOf(provisioningTla, "Phases")) {
    const regions = provisioning.state({ ...base, pc: { r1: phase } });
    assert.match(regions["Process r1"] ?? "", /, stalled$/, `a process at ${phase}`);
  }
  for (const action of provisioningTla.matchAll(/^([A-Z]\w+)\(r\) ==$/gm)) {
    if (action[1]?.match(/^(?:Inserted|ExitsBesideRow|Progress)$/)) continue;
    assert.notEqual(provisioning.step(action[1] ?? ""), null, `the action ${action[1]}`);
  }
});
