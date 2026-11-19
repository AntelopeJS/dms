import { expect } from "chai";
import { z } from "zod";
import { authorizedClient, registerUser } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { createClient } from "../helpers/http";
import { parseBody } from "../helpers/parse-body";

const LISTING = "/dms/store/listing";
const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;

const ListingBody = z.object({
  enabled: z.boolean(),
  modules: z.array(z.object({ id: z.string() })),
});

describe("[integration] module store listing", () => {
  beforeEach(resetDatabase);

  it("answers the platform owner with the catalog, read-only outside development", async () => {
    const owner = authorizedClient(
      (await registerUser({ owner: true })).accessToken,
    );

    const response = await owner.get(LISTING);

    expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
    const listing = parseBody(ListingBody, response);
    expect(listing.modules.length).to.be.greaterThan(0);
    expect(listing.enabled).to.equal(false);
  });

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
