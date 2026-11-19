import { expect } from "chai";
import { authorizedClient, registerUser } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { createClient } from "../helpers/http";

const LISTING = "/dms/store/listing";
const HTTP_FORBIDDEN = 403;

describe("[integration] module store listing", () => {
  beforeEach(resetDatabase);

  it("refuses a caller with no session", async () => {
    const response = await createClient().get(LISTING);

    expect(response.status).to.equal(HTTP_FORBIDDEN);
  });

  it("refuses a signed-in member who is not an owner", async () => {
    const member = authorizedClient((await registerUser()).accessToken);

    const response = await member.get(LISTING);

    expect(response.status).to.equal(HTTP_FORBIDDEN);
  });
});
