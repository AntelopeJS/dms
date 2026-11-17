import {
  ExecuteHooks,
  Hook,
  type HookHandler,
  type MemberHookPayload,
  RegisterHook,
  UnregisterHook,
} from "@antelopejs/interface-dms/hooks";
import { expect } from "chai";
import type { IsAssignable } from "../../../helpers/type-checks";

type MemberAddedHandler = HookHandler<Hook.MEMBER_ADDED>;

const PAYLOAD: MemberHookPayload = {
  tenantId: "results-tenant",
  userId: "results-user",
  isTenantOwner: false,
};
const WRITTEN_ROWS = 3;

const registered: MemberAddedHandler[] = [];

function register(handler: MemberAddedHandler): void {
  RegisterHook(Hook.MEMBER_ADDED, handler);
  registered.push(handler);
}

describe("[unit] interfaces/dms/hooks — handler results", () => {
  afterEach(() => {
    for (const handler of registered) {
      UnregisterHook(Hook.MEMBER_ADDED, handler);
    }
    registered.length = 0;
  });

  it("accepts event handlers returning nothing, a value or a promise of one", async () => {
    const reached: string[] = [];
    register(async () => {
      reached.push("async without return");
    });
    register(async () => {
      reached.push("async with a result");
      return WRITTEN_ROWS;
    });
    register(() => {
      reached.push("sync with a result");
      return WRITTEN_ROWS;
    });

    await ExecuteHooks(Hook.MEMBER_ADDED, PAYLOAD);

    expect(reached).to.deep.equal([
      "async without return",
      "async with a result",
      "sync with a result",
    ]);
  });

  it("keeps checking the result of a hook that has one", () => {
    const answers: [
      IsAssignable<() => number, HookHandler<Hook.TENANT_DATA_EXPORT>>,
      IsAssignable<() => void, HookHandler<Hook.TENANT_DATA_EXPORT>>,
    ] = [false, true];
    expect(answers).to.deep.equal([false, true]);
  });
});
