import type {
  RealtimeMutationContext,
  RealtimeMutationEventType,
} from "@antelopejs/interface-dms/base/table-view";
import { realtimeMutationListeners } from "@antelopejs/interface-dms/base/table-view/internal/realtime-listeners";
import { expect } from "chai";
import {
  connectAutomationEventSources,
  disconnectAutomationEventSources,
} from "../../automation";
import { armTrigger } from "../helpers/automation-nodes";

const LEADS = "/api/tables/leads";
const ORDERS = "/api/tables/orders";

async function mutate(
  eventType: RealtimeMutationEventType,
  context: Partial<RealtimeMutationContext> = {},
): Promise<void> {
  const mutation: RealtimeMutationContext = {
    controllerLocation: LEADS,
    rowIdKey: "_id",
    eventType,
    ids: ["row-1"],
    ...context,
  };
  for (const listener of realtimeMutationListeners.values())
    await listener(mutation);
}

describe("[unit] automation record triggers", () => {
  it("outputs the tenant of a tenant table write, and none for a shared-schema table", async () => {
    const armed = await armTrigger("dms.record-created");
    try {
      await mutate("created", { tenantId: "tenant-a" });
      await mutate("created");
    } finally {
      await armed.disarm();
    }
    expect(armed.events.map((event) => event.tenantId)).to.deep.equal([
      "tenant-a",
      undefined,
    ]);
    expect(armed.events[1]).to.not.have.property("tenantId");
  });

  it("fires only for the configured tenant, combined with the location", async () => {
    const armed = await armTrigger("dms.record-updated", {
      location: LEADS,
      tenantId: " tenant-a ",
    });
    try {
      await mutate("updated", { tenantId: "tenant-b" });
      await mutate("updated", {
        tenantId: "tenant-a",
        controllerLocation: ORDERS,
      });
      await mutate("updated", { tenantId: "tenant-a", ids: ["kept"] });
      await mutate("updated");
    } finally {
      await armed.disarm();
    }
    expect(armed.events.map((event) => event.ids)).to.deep.equal([["kept"]]);
  });

  it("gives every write its own delivery id", async () => {
    const armed = await armTrigger("dms.record-deleted");
    try {
      await mutate("deleted", { tenantId: "tenant-a" });
      await mutate("deleted", { tenantId: "tenant-a" });
    } finally {
      await armed.disarm();
    }
    const [first, second] = armed.events.map((event) => event.deliveryId);
    expect(first).to.be.a("string").and.not.equal(second);
    expect(second).to.be.a("string");
  });

  it("stops firing once deactivated or once the sources are disconnected", async () => {
    const deactivated = await armTrigger("dms.record-created");
    await deactivated.disarm();
    await mutate("created", { tenantId: "tenant-a" });
    expect(deactivated.events).to.deep.equal([]);

    const armed = await armTrigger("dms.record-created");
    disconnectAutomationEventSources();
    try {
      await mutate("created", { tenantId: "tenant-a" });
    } finally {
      connectAutomationEventSources();
      await armed.disarm();
    }
    expect(armed.events).to.deep.equal([]);
  });
});
