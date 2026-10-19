import { expect } from "chai";
import { createClient } from "../helpers/http";
import { setSchemasRegistered } from "../../routes/startup-gate";

// The api module listens before the DMS `start()` has bound its schemas. A
// request in that window used to reach a tenant-scoped model and fail with
// "Role is not bound to a schema" (500); it must get a 503 to retry instead.

const HTTP_SERVICE_UNAVAILABLE = 503;
const STORE_LISTING = "/dms/store/listing";
const SYSTEM_STATE = "/api/system-state";

describe("[integration] the startup gate", () => {
  afterEach(() => setSchemasRegistered(true));

  it("answers 503 with Retry-After on every route until the schemas are bound", async () => {
    const client = createClient();
    setSchemasRegistered(false);

    for (const path of [STORE_LISTING, SYSTEM_STATE]) {
      const response = await client.get(path);
      expect(
        response.status,
        `${path}: ${JSON.stringify(response.data)}`,
      ).to.equal(HTTP_SERVICE_UNAVAILABLE);
      expect(response.headers["retry-after"]).to.equal("1");
      expect(response.data).to.equal("error.server_starting");
    }
  });

  it("lets requests through once the schemas are bound", async () => {
    const response = await createClient().get(SYSTEM_STATE);

    expect(response.status).to.not.equal(HTTP_SERVICE_UNAVAILABLE);
  });
});
