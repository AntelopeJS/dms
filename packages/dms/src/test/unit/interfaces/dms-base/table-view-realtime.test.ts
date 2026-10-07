import { Controller } from "@antelopejs/interface-api";
import {
  type AsyncProxy,
  ImplementInterface,
} from "@antelopejs/interface-core";
import { internal as runtime } from "@antelopejs/interface-core/internal";
import { expect } from "chai";
import { internal as dmsTableView } from "../../../../implementations/dms-base/table-view";
import type { User } from "@antelopejs/interface-dms/auth/db";
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

// A table view reaches the DMS through two interface functions the DMS
// implements, never through a callback the DMS left in the interface: the core
// binds them to the generation that implements them now, and holds what is
// sent while no generation does.

const LOCATION = "/api/table-view-realtime";
const SESSION = "table-view-realtime-session";
const PRESENCE_ACQUIRE = "1";
const USER = { _id: "table-view-realtime-user", name: "Realtime" } as User;
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
  { method: "post", args: [], func: async () => ({ ok: true }) },
);
const getRoute = withPresenceAcquire({
  method: "get",
  args: [],
  func: async () => ({ ok: true }),
});

function edit(id: string): Promise<unknown> {
  return editRoute.func.call(controller, undefined, { id }, SESSION, USER);
}

function open(id: string): Promise<unknown> {
  return getRoute.func.call(
    controller,
    undefined,
    { id },
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

function attach(implementation: TableViewRealtime): void {
  ImplementInterface({ internal: tableView }, implementation);
}

// What the core does to the functions a generation implemented when it
// destroys that generation.
function detachGeneration(): void {
  for (const fn of [tableView.PublishMutation, tableView.AcquirePresence]) {
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
    // The test runner fails a call that finds no provider; a running project
    // queues it, which is the behaviour a DMS reload relies on.
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

  it("offers no setter to leave a DMS callback in the interface", () => {
    for (const setter of REMOVED_SETTERS) {
      expect(tableViewInterface).to.not.have.property(setter);
    }
  });
});
