import { strict as assert } from "node:assert";
import { HTTPResult } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { TenantLifecycleModel } from "@antelopejs/interface-dms/db/internal/tenantLifecycle.model";
import {
  closeTenantLifecycleAdmission,
  runTenantLifecycleOperation,
} from "@antelopejs/interface-dms/tenant-lifecycle";
import { resetDatabase } from "../helpers/db";

const TENANT = "tenant-lifecycle-refusal-test";
const HTTP_PAYMENT_REQUIRED = 402;

describe("Tenant lifecycle release of a refused invocation (MongoDB adapter)", () => {
  beforeEach(resetDatabase);

  async function refuseWhileReleaseFails(
    failures: number,
    fail: (model: TenantLifecycleModel, remaining: () => boolean) => void,
  ): Promise<Error | HTTPResult> {
    const model = GetModel(TenantLifecycleModel, TENANT);
    let outcome: Error | HTTPResult | undefined;
    let left = failures;
    await runTenantLifecycleOperation(TENANT, async () => {
      fail(model, () => left-- > 0);
      throw new HTTPResult(HTTP_PAYMENT_REQUIRED, "seat limit reached");
    }).catch((error: unknown) => {
      assert.ok(error instanceof Error || error instanceof HTTPResult);
      outcome = error;
    });
    assert.ok(outcome);
    return outcome;
  }

  it("still releases a refused invocation when one release read fails", async () => {
    const model = GetModel(TenantLifecycleModel, TENANT);
    const read = model.get.bind(model);
    try {
      const outcome = await refuseWhileReleaseFails(1, (target, faulty) => {
        target.get = async (...args) => {
          if (faulty()) throw new Error("connection reset");
          return read(...args);
        };
      });
      assert.ok(outcome instanceof HTTPResult);
      assert.equal(outcome.getStatus(), HTTP_PAYMENT_REQUIRED);
    } finally {
      model.get = read;
    }
    assert.deepEqual((await model.state(TENANT)).activeAttemptIds, []);
    await closeTenantLifecycleAdmission(TENANT);
  });

  it("still releases a refused invocation when one release acknowledgement is unknown", async () => {
    const model = GetModel(TenantLifecycleModel, TENANT);
    const table = model.table;
    const mutate = table.atomicMutation.bind(table);
    try {
      const outcome = await refuseWhileReleaseFails(1, (_target, faulty) => {
        table.atomicMutation = function (...args) {
          const query = mutate(...args);
          const run = query.run.bind(query);
          query.run = async () => (faulty() ? "unknown" : run());
          return query;
        };
      });
      assert.ok(outcome instanceof HTTPResult);
      assert.equal(outcome.getStatus(), HTTP_PAYMENT_REQUIRED);
    } finally {
      table.atomicMutation = mutate;
    }
    assert.deepEqual((await model.state(TENANT)).activeAttemptIds, []);
    await closeTenantLifecycleAdmission(TENANT);
  });

  it("reports a refused invocation whose release keeps failing, with the admission retained", async () => {
    const model = GetModel(TenantLifecycleModel, TENANT);
    const read = model.get.bind(model);
    let outcome: Error | HTTPResult | undefined;
    try {
      outcome = await refuseWhileReleaseFails(Infinity, (target, faulty) => {
        target.get = async (...args) => {
          if (faulty()) throw new Error("connection reset");
          return read(...args);
        };
      });
    } finally {
      model.get = read;
    }
    assert.ok(outcome instanceof AggregateError);
    const refusal: unknown = outcome.errors[0];
    const releaseFailure: unknown = outcome.errors[1];
    assert.ok(refusal instanceof HTTPResult);
    assert.equal(refusal.getStatus(), HTTP_PAYMENT_REQUIRED);
    assert.ok(releaseFailure instanceof Error);
    assert.ok(releaseFailure.cause instanceof Error);
    assert.match(releaseFailure.cause.message, /connection reset/);
    assert.equal((await model.state(TENANT)).activeAttemptIds.length, 1);
    await assert.rejects(closeTenantLifecycleAdmission(TENANT), /blocked/);
  });
});
