import { expect } from "chai";
import { z } from "zod";
import { authorizedClient, registerUser } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { createClient } from "../helpers/http";
import { parseBody } from "../helpers/parse-body";

const LISTING = "/dms/store/listing";
const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;
const FIRST_LISTING_TIMEOUT_MS = 45_000;

const ListingBody = z.object({
  modules: z.array(z.object({ id: z.string() })),
});

describe("[integration] module store listing", () => {
  beforeEach(resetDatabase);

  it("store-listing-owners-only (fails when the listing refuses the platform owner too, answers them an empty catalog, or serves a visitor; the first listing waits for `npm view` of each catalog module, which gives up after 30 s)", async function () {
    this.timeout(FIRST_LISTING_TIMEOUT_MS);
    const owner = authorizedClient(
      (await registerUser({ owner: true })).accessToken,
    );

    const listed = await owner.get(LISTING);
    const visitor = await createClient().get(LISTING);

    expect(listed.status, JSON.stringify(listed.data)).to.equal(HTTP_OK);
    expect(parseBody(ListingBody, listed).modules).to.not.deep.equal([]);
    expect(visitor.status).to.equal(HTTP_FORBIDDEN);
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
