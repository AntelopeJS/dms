import { expect } from "chai";
import {
  evaluateFailedSignIns,
  FAILED_SIGN_IN_THRESHOLD,
  FAILED_SIGN_IN_WINDOW_MS,
  type SignInAttemptRecord,
} from "../../../utils/failed-sign-ins";

const NOW = new Date("2026-10-02T12:00:00.000Z");
const MINUTE_MS = 60 * 1000;
const WINDOW_MINUTES = FAILED_SIGN_IN_WINDOW_MS / MINUTE_MS;
const BURST_START_MINUTES_AGO = 10;

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * MINUTE_MS);
}

function failure(id: string, ago: number): SignInAttemptRecord {
  return { _id: id, kind: "failed", createdAt: minutesAgo(ago) };
}

function alert(ago: number): SignInAttemptRecord {
  return { _id: "alert", kind: "alerted", createdAt: minutesAgo(ago) };
}

/** `count` failures one minute apart, the oldest (`f0`) ten minutes ago. */
function burst(count: number): SignInAttemptRecord[] {
  return Array.from({ length: count }, (_, index) =>
    failure(`f${index}`, BURST_START_MINUTES_AGO - index),
  );
}

describe("[unit] utils/failed-sign-ins (failed-attempt window)", () => {
  it("does not alert below the threshold", () => {
    const decision = evaluateFailedSignIns(
      burst(FAILED_SIGN_IN_THRESHOLD - 1),
      NOW,
    );
    expect(decision).to.deep.equal({ failures: FAILED_SIGN_IN_THRESHOLD - 1 });
  });

  it("alerts at the threshold, keyed on the oldest attempt of the burst", () => {
    const decision = evaluateFailedSignIns(
      burst(FAILED_SIGN_IN_THRESHOLD).reverse(),
      NOW,
    );
    expect(decision).to.deep.equal({
      failures: FAILED_SIGN_IN_THRESHOLD,
      alertKey: "f0",
    });
  });

  it("does not count attempts older than the window", () => {
    const records = [
      failure("old", WINDOW_MINUTES + 1),
      ...burst(FAILED_SIGN_IN_THRESHOLD - 1),
    ];
    expect(evaluateFailedSignIns(records, NOW).alertKey).to.equal(undefined);
  });

  it("alerts once per window, not once per further attempt", () => {
    const records = [...burst(FAILED_SIGN_IN_THRESHOLD + 2), alert(3)];
    expect(evaluateFailedSignIns(records, NOW).alertKey).to.equal(undefined);
  });

  it("alerts again once the previous alert left the window", () => {
    const records = [
      alert(WINDOW_MINUTES + 1),
      ...burst(FAILED_SIGN_IN_THRESHOLD),
    ];
    expect(evaluateFailedSignIns(records, NOW).alertKey).to.equal("f0");
  });

  it("gives two instances evaluating the same burst the same key", () => {
    const records = burst(FAILED_SIGN_IN_THRESHOLD + 1);
    const aSecondLater = new Date(NOW.getTime() + 1000);
    expect(evaluateFailedSignIns(records, NOW).alertKey).to.equal(
      evaluateFailedSignIns(records, aSecondLater).alertKey,
    );
  });
});
