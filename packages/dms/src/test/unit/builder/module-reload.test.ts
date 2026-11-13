import { expect } from "chai";
import type { OpWarning } from "@antelopejs/interface-dms-builder";
import { MapResources } from "../../../implementations/dms-builder";
import {
  setCatalogConnectionsForTests,
  type ModuleReload,
  type ReloadRuntime,
  setModuleReloadForTests,
  watchModuleReload,
} from "../../../implementations/dms-builder/engine";
import { createFixture, destroyFixture, expectOk } from "./harness";
import { FAKE_CATALOG, INPUT, MODULE, OP_TIMEOUT } from "./mapped-database";

const SHORT_WAIT_MS = 50;
const OTHER_MODULE = "dms";

type Handler = (module: string) => void;

/** A lifecycle event as interface-core's, reduced to what the watcher calls. */
class StubEvent {
  readonly handlers = new Set<Handler>();
  register(handler: Handler) {
    this.handlers.add(handler);
  }
  unregister(handler: Handler) {
    this.handlers.delete(handler);
  }
  emit(module: string) {
    this.handlers.forEach((handler) => handler(module));
  }
}

/** interface-core's runtime as the watcher reads it, driven by the spec. */
class StubRuntime implements ReloadRuntime {
  readonly destroyed = new StubEvent();
  readonly started = new StubEvent();
  current = "active";
  async status(): Promise<string> {
    return this.current;
  }
}

const PENDING = Symbol("pending");

async function settledOrPending(
  promise: Promise<OpWarning | undefined>,
): Promise<OpWarning | undefined | typeof PENDING> {
  return Promise.race([
    promise,
    new Promise<typeof PENDING>((resolve) =>
      setImmediate(() => resolve(PENDING)),
    ),
  ]);
}

describe("waiting for a written module to reload", () => {
  let runtime: StubRuntime;

  beforeEach(() => {
    runtime = new StubRuntime();
  });

  it("answers no warning only once the module was unloaded and started again", async () => {
    const loaded = watchModuleReload(MODULE, runtime).loaded();
    runtime.destroyed.emit(MODULE);
    expect(await settledOrPending(loaded)).to.equal(PENDING);
    runtime.started.emit(OTHER_MODULE);
    expect(await settledOrPending(loaded)).to.equal(PENDING);
    runtime.started.emit(MODULE);
    expect(await loaded).to.equal(undefined);
  });

  it("warns module_not_loaded, naming the module, when it was unloaded and did not start in time", async () => {
    const loaded = watchModuleReload(MODULE, runtime, SHORT_WAIT_MS).loaded();
    runtime.destroyed.emit(MODULE);
    runtime.current = "loaded";
    const warning = await loaded;
    expect(warning?.code).to.equal("module_not_loaded");
    expect(warning?.message)
      .to.contain(`"${MODULE}"`)
      .and.to.contain("backend log");
  });

  it("warns module_not_loaded when it started but the runtime does not report it active", async () => {
    runtime.current = "constructed";
    const loaded = watchModuleReload(MODULE, runtime).loaded();
    runtime.destroyed.emit(MODULE);
    runtime.started.emit(MODULE);
    expect((await loaded)?.code).to.equal("module_not_loaded");
  });

  it("answers no warning when the module was never unloaded and is still active", async () => {
    expect(
      await watchModuleReload(MODULE, runtime, SHORT_WAIT_MS).loaded(),
    ).to.equal(undefined);
  });

  it("stops listening once cancelled", () => {
    watchModuleReload(MODULE, runtime).cancel();
    expect(
      runtime.destroyed.handlers.size + runtime.started.handlers.size,
    ).to.equal(0);
  });
});

describe("MapResources and the reload of its module", function () {
  this.timeout(OP_TIMEOUT);

  const waits: string[] = [];
  const cancels: string[] = [];

  function recording(module: string): ModuleReload {
    return {
      loaded: async () => {
        waits.push(module);
        return { code: "module_not_loaded", message: `stub: ${module}` };
      },
      cancel: () => {
        cancels.push(module);
      },
    };
  }

  before(() => {
    createFixture({ modules: [MODULE] });
    setCatalogConnectionsForTests({ erp: FAKE_CATALOG });
    setModuleReloadForTests(recording);
  });

  after(() => {
    setCatalogConnectionsForTests();
    setModuleReloadForTests();
    destroyFixture();
  });

  it("waits on the module it wrote into, and passes its warning on", async () => {
    const result = await MapResources(INPUT);
    expectOk(result, "MapResources");
    expect(waits).to.deep.equal([MODULE]);
    const codes = result.ok
      ? (result.warnings ?? []).map((warning) => warning.code)
      : [];
    expect(codes).to.include("module_not_loaded");
  });

  it("does not wait when mapping the same again changed no file in the module", async () => {
    waits.length = 0;
    const result = await MapResources(INPUT);
    expectOk(result, "MapResources again");
    expect(result.ok ? result.changes : []).to.deep.equal([]);
    expect(waits).to.deep.equal([]);
    expect(cancels).to.include(MODULE);
  });
});
