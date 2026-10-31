import assert from "node:assert/strict";
import { test } from "node:test";
import * as onboarding from "../skills/formal-onboarding-bootstrap/OnboardingBootstrap.map.mjs";
import * as realtime from "../skills/formal-realtime-tabs/RealtimeTabs.map.mjs";
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
  assert.deepEqual(answers, ["none", "200", "400", "412", "500"]);
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
