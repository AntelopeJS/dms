import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { UserInviteModel } from "@antelopejs/interface-dms/db/models";
import { createClient } from "../helpers/http";

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

  const client = createClient();
  await Promise.all([
    waitFor("database schemas to be registered", async () => {
      try {
        await GetModel(UserInviteModel, DEFAULT_TENANT_ID).getAll();
        return true;
      } catch {
        return false;
      }
    }),

    waitFor("every module to have started", async () => {
      try {
        return (await client.get("/")).status !== HTTP_SERVICE_UNAVAILABLE;
      } catch {
        return false;
      }
    }),
  ]);
});
