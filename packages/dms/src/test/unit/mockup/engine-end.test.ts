import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getRegisteredRoutes } from "@antelopejs/interface-api";
import { expect } from "chai";
import {
  endMockupEngine,
  mockupEngineRunning,
  startMockupEngine,
  stopMockupEngine,
} from "../../../mockup";
import { MOCKUP_API } from "../../helpers/mockup-routes";

function mockupRoutes(): string[] {
  return getRegisteredRoutes()
    .map((route) => route.location)
    .filter((location) => location.startsWith(MOCKUP_API));
}

describe("[unit] the mockup engine, ended for good", () => {
  let dir: string;

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), "dms-mockup-engine-"));
  });

  after(async () => {
    endMockupEngine();
    await rm(dir, { recursive: true, force: true });
  });

  it("keeps the engine and its routes through a stop, for the module's next start (fails when stop drops them)", () => {
    startMockupEngine(dir);
    stopMockupEngine();

    expect(mockupEngineRunning()).to.equal(true);
    expect(mockupRoutes()).to.not.deep.equal([]);
  });

  it("answers no engine and leaves no /api/mockup route once ended (fails when the end only stops it)", () => {
    endMockupEngine();

    expect(mockupEngineRunning()).to.equal(false);
    expect(mockupRoutes()).to.deep.equal([]);
  });

  it("serves again on the next start after an end (fails when the end leaves the engine set)", () => {
    startMockupEngine(dir);

    expect(mockupEngineRunning()).to.equal(true);
    expect(mockupRoutes()).to.not.deep.equal([]);
  });
});
