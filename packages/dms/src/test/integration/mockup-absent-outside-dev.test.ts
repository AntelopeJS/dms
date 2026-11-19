import { expect } from "chai";
import { authorizedClient, registerUser } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

const HTTP_NOT_FOUND = 404;
const MOCKUP_ROUTES = [
  "/api/mockup",
  "/api/mockup/schema",
  "/api/mockup/orders/annotations",
];

/** The harness starts the module outside development, as a deployed build starts. */
describe("[integration] mockup routes outside development", () => {
  beforeEach(resetDatabase);

  it("serves none of the mockup routes, not even to the platform owner", async () => {
    const owner = authorizedClient(
      (await registerUser({ owner: true })).accessToken,
    );

    for (const route of MOCKUP_ROUTES) {
      const response = await owner.get(route);
      expect(response.status, route).to.equal(HTTP_NOT_FOUND);
    }
  });
});
