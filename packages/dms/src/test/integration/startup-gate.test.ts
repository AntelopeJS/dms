import { expect } from "chai";
import { StartModule, StopModule } from "@antelopejs/interface-core/modules";
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

describe("[integration] the startup gate", () => {
  it("lets requests through once every module has started", async () => {
    const response = await createClient().get(GATED_PATHS[1]);

    expect(response.status).to.not.equal(HTTP_SERVICE_UNAVAILABLE);
  });

  it("answers 503 on every route from the moment the DMS stops, until it started again", async function () {
    this.timeout(30_000);
    await StopModule(DMS_MODULE);
    try {
      await expectStarting();
      const live = await createClient().get("/_live");
      expect(live.status).to.equal(200);
    } finally {
      await StartModule(DMS_MODULE);
    }

    const response = await createClient().get(GATED_PATHS[1]);
    expect(response.status).to.not.equal(HTTP_SERVICE_UNAVAILABLE);
  });
});
