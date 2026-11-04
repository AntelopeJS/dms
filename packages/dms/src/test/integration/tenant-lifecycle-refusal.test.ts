import { strict as assert } from "node:assert";
import { HTTPResult } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { TenantLifecycleModel } from "@antelopejs/interface-dms/db/internal/tenantLifecycle.model";
import {
  closeTenantLifecycleAdmission,
  runTenantLifecycleOperation,
} from "@antelopejs/interface-dms/tenant-lifecycle";
import { resetDatabase } from "../helpers/db";

const TENANT = "tenant-lifecycle-release-test";
const HTTP_PAYMENT_REQUIRED = 402;
const ENDINGS = ["refusal", "success"] as const;
type Ending = (typeof ENDINGS)[number];

/** Breaks the next `failures` calls of the release, one way or the other. */
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

/** What the call rejected with, or undefined when it resolved. */
async function endWhileReleaseFails(
  ending: Ending,
  failures: number,
  fault: Fault,
): Promise<Error | HTTPResult | undefined> {
  const model = GetModel(TenantLifecycleModel, TENANT);
  let outcome: Error | HTTPResult | undefined;
  let left = failures;
  let restore = () => {};
  try {
    await runTenantLifecycleOperation(TENANT, async () => {
      restore = fault(model, () => left-- > 0);
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

describe("Tenant lifecycle release of a finished or refused invocation (MongoDB adapter)", () => {
  beforeEach(resetDatabase);

  const faults: [string, Fault][] = [
    ["read fails", readThrows],
    ["acknowledgement is unknown and not landed", writeUnknownNotLanded],
  ];

  for (const ending of ENDINGS) {
    for (const [name, fault] of faults) {
      it(`still releases after a ${ending} when one release ${name}`, async () => {
        const outcome = await endWhileReleaseFails(ending, 1, fault);
        if (ending === "refusal") {
          assert.ok(outcome instanceof HTTPResult);
          assert.equal(outcome.getStatus(), HTTP_PAYMENT_REQUIRED);
        } else {
          assert.equal(outcome, undefined);
        }
        const model = GetModel(TenantLifecycleModel, TENANT);
        assert.deepEqual((await model.state(TENANT)).activeAttemptIds, []);
        await closeTenantLifecycleAdmission(TENANT);
      });
    }

    it(`reports a ${ending} whose release keeps failing, with the admission retained`, async () => {
      const outcome = await endWhileReleaseFails(ending, Infinity, readThrows);
      let releaseFailure: unknown;
      if (ending === "refusal") {
        assert.ok(outcome instanceof AggregateError);
        const refusal: unknown = outcome.errors[0];
        assert.ok(refusal instanceof HTTPResult);
        assert.equal(refusal.getStatus(), HTTP_PAYMENT_REQUIRED);
        releaseFailure = outcome.errors[1];
      } else {
        releaseFailure = outcome;
      }
      assert.ok(releaseFailure instanceof Error);
      assert.ok(releaseFailure.cause instanceof Error);
      assert.match(releaseFailure.cause.message, /connection reset/);
      const model = GetModel(TenantLifecycleModel, TENANT);
      assert.equal((await model.state(TENANT)).activeAttemptIds.length, 1);
      await assert.rejects(closeTenantLifecycleAdmission(TENANT), /blocked/);
    });
  }
});
