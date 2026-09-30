import { ReloadModule } from "@antelopejs/interface-core/modules";
import {
  Hook,
  type HookHandler,
  RegisterHook,
  SettleHook,
  UnregisterHook,
  UnsettleHook,
} from "@antelopejs/interface-dms/hooks";
import { expect } from "chai";
import { captureErrors } from "../../../helpers/logging";
import {
  liveReloadHostGeneration,
  RELOAD_HOST_MODULE,
  takeReloadHostCalls,
} from "../../../helpers/reload-host";

type InitializedHandler = HookHandler<Hook.DATABASE_INITIALIZED>;

const HANDLER_FAILURE = "seed collection is unreachable";

const registered: InitializedHandler[] = [];

function register(handler: InitializedHandler): void {
  RegisterHook(Hook.DATABASE_INITIALIZED, handler);
  registered.push(handler);
}

function countingHandler(counter: number[]): InitializedHandler {
  return () => {
    counter.push(1);
    return undefined;
  };
}

function nextTurn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

// The DMS started before the suite runs, so the hook is already settled here:
// a handler registered now is a module loaded after the database came up.
describe("[unit] interfaces/dms/hooks — DATABASE_INITIALIZED", () => {
  afterEach(async () => {
    for (const handler of registered) {
      UnregisterHook(Hook.DATABASE_INITIALIZED, handler);
    }
    registered.length = 0;
    await SettleHook(Hook.DATABASE_INITIALIZED);
  });

  it("runs a handler registered after initialization at once, and once", async () => {
    const calls: number[] = [];
    register(countingHandler(calls));

    // In the background: the registration itself does not wait for it.
    expect(calls).to.have.length(0);
    await nextTurn();
    expect(calls).to.have.length(1);
    await nextTurn();
    expect(calls).to.have.length(1);
  });

  it("holds a registration made while stopped until the next start, then runs it once", async () => {
    UnsettleHook(Hook.DATABASE_INITIALIZED);
    const calls: number[] = [];
    register(countingHandler(calls));

    await nextTurn();
    expect(calls).to.have.length(0);

    await SettleHook(Hook.DATABASE_INITIALIZED);
    await nextTurn();
    expect(calls).to.have.length(1);
  });

  it("runs a handler registered while the start fires the hook exactly once", async () => {
    UnsettleHook(Hook.DATABASE_INITIALIZED);
    const calls: number[] = [];
    const late = countingHandler(calls);
    let hasRegisteredLate = false;
    register(() => {
      if (!hasRegisteredLate) register(late);
      hasRegisteredLate = true;
      return undefined;
    });

    await SettleHook(Hook.DATABASE_INITIALIZED);
    await nextTurn();

    expect(calls).to.have.length(1);
  });

  it("logs a failing late handler instead of throwing into the registration", async () => {
    const errors = captureErrors();
    try {
      expect(() =>
        register(async () => {
          throw new Error(HANDLER_FAILURE);
        }),
      ).to.not.throw();
      await nextTurn();
    } finally {
      errors.restore();
    }

    expect(errors.messages).to.have.length(1);
    expect(errors.messages[0]).to.contain(Hook.DATABASE_INITIALIZED);
    expect(errors.messages[0]).to.match(/module '[^']+'/);
  });

  it("runs again for a module reloaded while the DMS runs, in its live generation", async () => {
    takeReloadHostCalls();

    await ReloadModule(RELOAD_HOST_MODULE);
    await nextTurn();

    expect(takeReloadHostCalls("database-initialized")).to.deep.equal([
      {
        generation: liveReloadHostGeneration(),
        source: "database-initialized",
      },
    ]);
  });
});
