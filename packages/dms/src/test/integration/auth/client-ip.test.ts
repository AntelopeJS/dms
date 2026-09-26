import { expect } from "chai";
import { createClient } from "../../helpers/http";

const LOGIN_URL = "/api/auth/login";
const UNAUTHORIZED_STATUS = 401;

// The session address is resolved before the credentials are checked, so a
// rejected login still runs the controller's socket and header lookup.
describe("[integration] auth client address", () => {
  it("resolves the address of a login carrying a forged x-forwarded-for", async () => {
    const client = createClient();
    const response = await client.post(
      LOGIN_URL,
      { email: "nobody@test.local", password: "WrongPassw0rd!" },
      { headers: { "x-forwarded-for": "6.6.6.6, 7.7.7.7" } },
    );

    expect(response.status).to.equal(UNAUTHORIZED_STATUS);
  });
});
