import type { RequestContext } from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import type { DataControllerCallback } from "@antelopejs/interface-data-api";
import { createGuardedRoute } from "@antelopejs/interface-dms/base/table-view/internal/guards";
import { TableViewMeta } from "@antelopejs/interface-dms/base/table-view/meta";
import type { TableViewGuards } from "@antelopejs/interface-dms/base/types/guards";
import { expect } from "chai";

// A mutating guard may hand back work to run once the write succeeded: after
// the write, never when it failed, and without failing the request itself.

const ctx = {} as RequestContext;
const DELETE_PARAMS = { id: ["row-1"] };

class GuardedController {}

function withGuards(guards: TableViewGuards): void {
  GetMetadata(GuardedController, TableViewMeta).setControllerGuards(guards);
}

function route(write: () => Promise<string>): DataControllerCallback {
  return createGuardedRoute(
    {
      func: write,
      args: [],
      method: "delete",
    } as unknown as DataControllerCallback,
    "delete",
  );
}

async function call(guarded: DataControllerCallback): Promise<unknown> {
  return guarded.func.call(new GuardedController(), ctx, DELETE_PARAMS);
}

describe("[unit] interfaces/dms-base/table-view — after-write guards", () => {
  const events: string[] = [];

  beforeEach(() => {
    events.length = 0;
  });

  it("runs the guard's after-write work once the write is done", async () => {
    withGuards({
      delete: () => {
        events.push("guard");
        return () => {
          events.push("after");
        };
      },
    });
    const result = await call(
      route(async () => {
        events.push("write");
        return "written";
      }),
    );
    expect(events).to.deep.equal(["guard", "write", "after"]);
    expect(result).to.equal("written");
  });

  it("skips it when the write fails", async () => {
    withGuards({ delete: () => () => void events.push("after") });
    const failure = await call(
      route(async () => {
        throw new Error("write failed");
      }),
    ).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).to.be.instanceOf(Error);
    expect(events).to.deep.equal([]);
  });

  it("answers the write even when the after-write work fails", async () => {
    withGuards({
      delete: () => async () => {
        throw new Error("notification failed");
      },
    });
    expect(await call(route(async () => "written"))).to.equal("written");
  });
});
