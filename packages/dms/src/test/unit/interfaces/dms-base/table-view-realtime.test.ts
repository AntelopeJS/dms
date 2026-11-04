import { Controller, type RequestContext } from "@antelopejs/interface-api";
import type { User } from "@antelopejs/interface-dms/auth/db";
import {
  type AsyncProxy,
  GetMetadata,
  ImplementInterface,
} from "@antelopejs/interface-core";
import { internal as runtime } from "@antelopejs/interface-core/internal";
import { DataAPIMeta } from "@antelopejs/interface-data-api/metadata";
import { expect } from "chai";
import { bindVerifiedRequestPrincipal } from "@antelopejs/interface-dms/auth/internal/request-authenticators";
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import { internal as dmsTableView } from "../../../../implementations/dms-base/table-view";
import * as tableViewInterface from "@antelopejs/interface-dms/base/table-view";
import {
  type RealtimeMutationContext,
  type RealtimePresenceContext,
  internal as tableView,
} from "@antelopejs/interface-dms/base/table-view";
import {
  extractSingleParamId,
  withPresenceAcquire,
  withRealtimeMutation,
} from "@antelopejs/interface-dms/base/table-view/internal/realtime";
import { userFixture } from "../../../helpers/user-fixture";
import { requestContextFixture } from "../../../helpers/request-context";

const LOCATION = "/api/table-view-realtime";
const SESSION = "table-view-realtime-session";
const PRESENCE_ACQUIRE = "1";
const TENANT = "table-view-realtime-tenant";

const REQUEST_CONTEXT = requestContextFixture(
  undefined,
  "Bearer table-view-realtime",
);
const USER = userFixture({ _id: "table-view-realtime-user", name: "Realtime" });
bindVerifiedRequestPrincipal(REQUEST_CONTEXT, {
  userId: USER._id,
  tenantId: TENANT,
});
const REMOVED_SETTERS = [
  "setRealtimeMutationHook",
  "setRealtimePresenceHook",
  "setRealtimePageTopicHook",
];

interface TableViewRealtime {
  internal: typeof dmsTableView;
}

interface ProxiedFunction {
  proxy: AsyncProxy;
}

class RowsAPI extends Controller(LOCATION) {}

const controller = new RowsAPI();
const deliveries: string[] = [];

const editRoute = withRealtimeMutation(
  { eventType: "updated", extractIds: extractSingleParamId },
  {
    method: "post",
    args: [],
    func: async (
      _ctx: RequestContext,
      _params: { id: string },
      _body: Buffer,
      _user: User,
    ) => ({ ok: true }),
  },
);
const getRoute = withPresenceAcquire({
  method: "get",
  args: [],
  func: async (_ctx: RequestContext, _params: { id: string }, _user: User) => ({
    ok: true,
  }),
});

function edit(id: string): ReturnType<typeof editRoute.func> {
  return editRoute.func.call(
    controller,
    REQUEST_CONTEXT,
    { id },
    Buffer.from("{}"),
    USER,
    REQUEST_CONTEXT,
    SESSION,
    USER,
  );
}

function open(id: string): ReturnType<typeof getRoute.func> {
  return getRoute.func.call(
    controller,
    REQUEST_CONTEXT,
    { id },
    USER,
    REQUEST_CONTEXT,
    SESSION,
    PRESENCE_ACQUIRE,
    USER,
  );
}

function generation(name: string): TableViewRealtime {
  return {
    internal: {
      PublishMutation: async ({ eventType, ids }: RealtimeMutationContext) => {
        deliveries.push(`${name} ${eventType} ${ids.join(",")}`);
      },
      AcquirePresence: async ({ rowId }: RealtimePresenceContext) => {
        deliveries.push(`${name} presence ${rowId}`);
      },
    },
  };
}

/** A generation recording the tenant each call names. */
function tenantRecorder(tenants: Array<string | undefined>): TableViewRealtime {
  return {
    internal: {
      PublishMutation: async ({ tenantId }: RealtimeMutationContext) => {
        tenants.push(tenantId);
      },
      AcquirePresence: async ({ tenantId }: RealtimePresenceContext) => {
        tenants.push(tenantId);
      },
    },
  };
}

function attach(implementation: TableViewRealtime): void {
  ImplementInterface({ internal: tableView }, implementation);
}

function detachGeneration(): void {
  for (const fn of [tableView.PublishMutation, tableView.AcquirePresence]) {
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- InterfaceFunction's public callable type omits the core proxy handle; this test deliberately detaches that private handle to simulate reload.
    (fn as unknown as ProxiedFunction).proxy.detach();
  }
}

function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe("[unit] interfaces/dms-base — table-view realtime across DMS generations", () => {
  beforeEach(() => {
    deliveries.length = 0;
  });

  after(() => {
    attach({ internal: dmsTableView });
  });

  it("delivers to the generation that implements the interface now", async () => {
    attach(generation("first"));
    await edit("row-1");
    await open("row-1");

    attach(generation("second"));
    await edit("row-2");
    await open("row-2");

    expect(deliveries).to.deep.equal([
      "first updated row-1",
      "first presence row-1",
      "second updated row-2",
      "second presence row-2",
    ]);
  });

  it("holds what a route sends between two generations for the next one", async () => {
    attach(generation("first"));
    detachGeneration();
    const stubMode = runtime.testStubMode;

    runtime.testStubMode = false;
    try {
      const routes = Promise.all([edit("row-3"), open("row-3")]);
      await settle();
      expect(deliveries).to.deep.equal([]);

      attach(generation("second"));
      await routes;
    } finally {
      runtime.testStubMode = stubMode;
    }

    expect(deliveries).to.deep.equal([
      "second updated row-3",
      "second presence row-3",
    ]);
  });

  it("names the tenant the write and the open were made in", async () => {
    const tenants: Array<string | undefined> = [];
    attach(tenantRecorder(tenants));
    await edit("row-4");
    await open("row-4");

    expect(tenants).to.deep.equal([TENANT, TENANT]);
  });

  it("names no tenant for a table of the schema every tenant shares", async () => {
    const tenants: Array<string | undefined> = [];
    const meta = GetMetadata(RowsAPI, DataAPIMeta);
    const schemaName = meta.schemaName;
    attach(tenantRecorder(tenants));
    meta.schemaName = CORE_SCHEMA_NAME;
    try {
      await edit("row-5");
      await open("row-5");
    } finally {
      meta.schemaName = schemaName;
    }

    expect(tenants).to.deep.equal([undefined, undefined]);
  });

  it("offers no setter to leave a DMS callback in the interface", () => {
    for (const setter of REMOVED_SETTERS) {
      expect(tableViewInterface).to.not.have.property(setter);
    }
  });
});
