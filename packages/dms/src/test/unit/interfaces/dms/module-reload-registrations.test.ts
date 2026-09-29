import { Controller } from "@antelopejs/interface-api";
import { ReloadModule } from "@antelopejs/interface-core/modules";
import type { User } from "@antelopejs/interface-dms/auth/db";
import {
  extractFromResult,
  withRealtimeMutation,
} from "@antelopejs/interface-dms/base/table-view/realtime";
import { ExecuteHooks, Hook } from "@antelopejs/interface-dms/hooks";
import { expect } from "chai";
import { captureErrors } from "../../../helpers/logging";
import {
  liveReloadHostGeneration,
  RELOAD_HOST_LOCATION,
  RELOAD_HOST_MODULE,
  RELOAD_HOST_TENANT,
  takeReloadHostCalls,
} from "../../../helpers/reload-host";

const ROW_ID = "reload-host-row";
const SESSION_ID = "reload-host-session";
const USER = {
  _id: "reload-host-user",
  email: "reload-host@example.test",
} as User;

class RowsController extends Controller(RELOAD_HOST_LOCATION) {}

const updateRow = withRealtimeMutation(
  { eventType: "updated", extractIds: extractFromResult },
  { method: "put", args: [], func: async () => ({ _id: ROW_ID }) },
);

async function mutateRow(): Promise<void> {
  await updateRow.func.call(new RowsController(), SESSION_ID, USER);
}

// The reload-host module registers from `construct()` and releases nothing, as
// consumer modules do. What the interface holds for it has to follow it through
// a real reload: its departing generation's registrations go, and only the new
// generation's answer.
describe("[unit] interfaces/dms — registrations of a reloaded module", () => {
  before(async () => {
    await ReloadModule(RELOAD_HOST_MODULE);
    takeReloadHostCalls();
  });

  it("runs its hook handler once, in its live generation", async () => {
    await ExecuteHooks(Hook.MEMBER_BEING_ADDED, {
      tenantId: RELOAD_HOST_TENANT,
      userId: USER._id,
      isTenantOwner: false,
    });

    expect(takeReloadHostCalls()).to.deep.equal([
      { generation: liveReloadHostGeneration(), source: "hook" },
    ]);
  });

  it("calls its realtime mutation listener once, in its live generation", async () => {
    const errors = captureErrors();
    try {
      await mutateRow();
    } finally {
      errors.restore();
    }

    expect(errors.messages).to.deep.equal([]);
    expect(takeReloadHostCalls()).to.deep.equal([
      { generation: liveReloadHostGeneration(), source: "listener" },
    ]);
  });
});
