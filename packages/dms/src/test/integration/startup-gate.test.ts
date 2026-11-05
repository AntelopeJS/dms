import { expect } from "chai";
import {
  Events,
  StartModule,
  StopModule,
} from "@antelopejs/interface-core/modules";
import { createClient } from "../helpers/http";

const HTTP_SERVICE_UNAVAILABLE = 503;
const DMS_MODULE = "local";
const GATED_PATHS = ["/dms/store/listing", "/api/system-state"];

async function expectStarting(): Promise<void> {
  const client = createClient();
  for (const path of GATED_PATHS) {
    const response = await client.get(path);
    expect(
      response.status,
      `${path}: ${JSON.stringify(response.data)}`,
    ).to.equal(HTTP_SERVICE_UNAVAILABLE);
    expect(response.headers["retry-after"]).to.equal("1");
    expect(response.data).to.equal("error.server_starting");
  }
}

async function expectOpen(): Promise<void> {
  const client = createClient();
  for (const path of GATED_PATHS) {
    const response = await client.get(path);
    expect(response.status, path).to.not.equal(HTTP_SERVICE_UNAVAILABLE);
  }
}

describe("[integration] the startup gate", () => {
  it("lets requests through once every module has started", async () => {
    await expectOpen();
  });

  it("answers 503 on every route from the moment the project stops, until its modules started again", async function () {
    this.timeout(30_000);
    Events.ModulesStopping.emit();
    try {
      await expectStarting();
      const live = await createClient().get("/_live");
      expect(live.status).to.equal(200);
    } finally {
      Events.ModulesStarted.emit();
    }

    await expectOpen();
  });

  it("stays open while the DMS module alone stops and starts again", async function () {
    this.timeout(30_000);
    await StopModule(DMS_MODULE);
    try {
      await expectOpen();
    } finally {
      await StartModule(DMS_MODULE);
    }

    await expectOpen();
  });
});
