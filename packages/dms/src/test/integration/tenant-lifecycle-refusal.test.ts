import { strict as assert } from "node:assert";
import { HTTPResult } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { TenantLifecycleModel } from "@antelopejs/interface-dms/db/internal/tenantLifecycle.model";
import {
  TenantLifecycleReleaseError,
  closeTenantLifecycleAdmission,
  observeTenantLifecycle,
  releaseTenantLifecycleAttempt,
  runTenantLifecycleOperation,
} from "@antelopejs/interface-dms/tenant-lifecycle";
import { resetDatabase } from "../helpers/db";
import { captureErrors } from "../helpers/logging";

const TENANT = "tenant-lifecycle-release-test";
const HTTP_PAYMENT_REQUIRED = 402;
const OUTAGE_MS = 300;
const ENDINGS = ["refusal", "success"] as const;
type Ending = (typeof ENDINGS)[number];

/** Breaks each release call for which `faulty` answers true, one way or the other. */
type Fault = (model: TenantLifecycleModel, faulty: () => boolean) => () => void;

const readThrows: Fault = (model, faulty) => {
  const read = model.get.bind(model);
  model.get = async (...args) => {
    if (faulty()) throw new Error("connection reset");
    return read(...args);
  };
  return () => {
    model.get = read;
  };
};

const writeUnknownNotLanded: Fault = (model, faulty) => {
  const table = model.table;
  const mutate = table.atomicMutation.bind(table);
  table.atomicMutation = function (...args) {
    const query = mutate(...args);
    const run = query.run.bind(query);
    query.run = async () => (faulty() ? "unknown" : run());
    return query;
  };
  return () => {
    table.atomicMutation = mutate;
  };
};

/** Faulty for the first `count` calls. */
function times(count: number): () => boolean {
  let left = count;
  return () => left-- > 0;
}

/** Faulty until `ms` after the first call. */
function outage(ms: number): () => boolean {
  let end: number | undefined;
  return () => Date.now() < (end ??= Date.now() + ms);
}

/** What the call rejected with, or undefined when it resolved. */
async function endWhileReleaseFails(
  ending: Ending,
  faulty: () => boolean,
  fault: Fault,
): Promise<Error | HTTPResult | undefined> {
  const model = GetModel(TenantLifecycleModel, TENANT);
  let outcome: Error | HTTPResult | undefined;
  let restore = () => {};
  try {
    await runTenantLifecycleOperation(TENANT, async () => {
      restore = fault(model, faulty);
      if (ending === "refusal") {
        throw new HTTPResult(HTTP_PAYMENT_REQUIRED, "seat limit reached");
      }
    }).catch((error: unknown) => {
      assert.ok(error instanceof Error || error instanceof HTTPResult);
      outcome = error;
    });
  } finally {
    restore();
  }
  return outcome;
}

/** Asserts the call answered as its ending asks, then that the tenant can close. */
async function assertReleased(
  ending: Ending,
  outcome: Error | HTTPResult | undefined,
): Promise<void> {
  if (ending === "refusal") {
    assert.ok(outcome instanceof HTTPResult);
    assert.equal(outcome.getStatus(), HTTP_PAYMENT_REQUIRED);
  } else {
    assert.equal(outcome, undefined);
  }
  assert.deepEqual((await observeTenantLifecycle(TENANT)).activeAttemptIds, []);
  await closeTenantLifecycleAdmission(TENANT);
}

/** The release failure inside what a call whose release kept failing rejected with. */
function releaseFailureOf(
  ending: Ending,
  outcome: Error | HTTPResult | undefined,
): TenantLifecycleReleaseError {
  let releaseFailure: unknown = outcome;
  if (ending === "refusal") {
    assert.ok(outcome instanceof AggregateError);
    const refusal: unknown = outcome.errors[0];
    assert.ok(refusal instanceof HTTPResult);
    assert.equal(refusal.getStatus(), HTTP_PAYMENT_REQUIRED);
    releaseFailure = outcome.errors[1];
  }
  assert.ok(releaseFailure instanceof TenantLifecycleReleaseError);
  return releaseFailure;
}

describe("Tenant lifecycle release of a finished or refused invocation (MongoDB adapter)", () => {
  beforeEach(resetDatabase);

  const faults: [string, Fault][] = [
    ["read fails", readThrows],
    ["acknowledgement is unknown and not landed", writeUnknownNotLanded],
  ];

  for (const ending of ENDINGS) {
    for (const [name, fault] of faults) {
      it(`still releases after a ${ending} when one release ${name}`, async () => {
        await assertReleased(
          ending,
          await endWhileReleaseFails(ending, times(1), fault),
        );
      });
    }

    it(`still releases after a ${ending} when the database is out for ${OUTAGE_MS} ms`, async () => {
      await assertReleased(
        ending,
        await endWhileReleaseFails(ending, outage(OUTAGE_MS), readThrows),
      );
    });

    it(`reports a ${ending} whose release keeps failing, naming the tenant and the attempt it retains`, async () => {
      const logged = captureErrors();
      let outcome: Error | HTTPResult | undefined;
      try {
        outcome = await endWhileReleaseFails(ending, () => true, readThrows);
      } finally {
        logged.restore();
      }
      assert.ok(outcome instanceof Error);
      const releaseFailure = releaseFailureOf(ending, outcome);
      assert.ok(releaseFailure.cause instanceof Error);
      assert.match(releaseFailure.cause.message, /connection reset/);
      const { activeAttemptIds } = await observeTenantLifecycle(TENANT);
      assert.deepEqual(activeAttemptIds, [releaseFailure.attemptId]);
      assert.equal(releaseFailure.tenantId, TENANT);
      for (const report of [outcome.message, logged.messages.join("\n")]) {
        assert.ok(report.includes(TENANT), `${report} names the tenant`);
        assert.ok(
          report.includes(releaseFailure.attemptId),
          `${report} names the attempt`,
        );
      }
      await assert.rejects(closeTenantLifecycleAdmission(TENANT), /blocked/);
    });

    it(`lets an operator release the attempt of a ${ending} whose release kept failing`, async () => {
      const logged = captureErrors();
      let outcome: Error | HTTPResult | undefined;
      try {
        outcome = await endWhileReleaseFails(ending, () => true, readThrows);
      } finally {
        logged.restore();
      }
      const releaseFailure = releaseFailureOf(ending, outcome);
      await assert.rejects(closeTenantLifecycleAdmission(TENANT), /blocked/);
      await releaseTenantLifecycleAttempt(TENANT, releaseFailure.attemptId);
      await releaseTenantLifecycleAttempt(TENANT, releaseFailure.attemptId);
      assert.deepEqual(
        (await observeTenantLifecycle(TENANT)).activeAttemptIds,
        [],
      );
      await closeTenantLifecycleAdmission(TENANT);
    });
  }
});
