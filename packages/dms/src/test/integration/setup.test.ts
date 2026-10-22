import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { UserInviteModel } from "@antelopejs/interface-dms/db/models";
import { createClient } from "../helpers/http";

// The test runner constructs the modules and then calls `startAll()` WITHOUT
// awaiting it, so module `start()` lifecycles (schema registration, API server
// serving) are still in-flight when Mocha begins. This root hook blocks until
// the runtime is actually ready so individual tests don't race startup.

const READY_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 100;
const HTTP_SERVICE_UNAVAILABLE = 503;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(
  description: string,
  check: () => Promise<boolean>,
): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(POLL_INTERVAL_MS);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

before(async function () {
  this.timeout(READY_TIMEOUT_MS + 5_000);

  // The two readiness conditions are independent, so poll them concurrently —
  // their combined worst case stays within one READY_TIMEOUT_MS (and thus the
  // hook budget), rather than summing two sequential deadlines.
  const client = createClient();
  await Promise.all([
    // Tenant schema (`dms-tenant`) is registered last in the DMS `start()`, so a
    // successful query against it implies all schemas are initialized.
    waitFor("database schemas to be registered", async () => {
      try {
        await GetModel(UserInviteModel, DEFAULT_TENANT_ID).getAll();
        return true;
      } catch {
        return false;
      }
    }),
    // The api answers 503 until the core announces that every module started.
    waitFor("every module to have started", async () => {
      try {
        return (await client.get("/")).status !== HTTP_SERVICE_UNAVAILABLE;
      } catch {
        return false;
      }
    }),
  ]);
});
