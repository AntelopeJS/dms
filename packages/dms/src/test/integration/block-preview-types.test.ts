import { expect } from "chai";
import { z } from "zod";
import { authorizedClient, registerUser } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { createClient } from "../helpers/http";
import { parseBody } from "../helpers/parse-body";

const TYPES = "/api/block-preview/types";
const HTTP_OK = 200;
const HTTP_UNAUTHORIZED = 401;

const TypesBody = z.record(z.string(), z.object({ componentName: z.string() }));

describe("[integration] block preview types", () => {
  beforeEach(resetDatabase);

  it("lists the registered blocks to a member", async () => {
    const member = authorizedClient((await registerUser()).accessToken);

    const response = await member.get(TYPES);

    expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
    expect(parseBody(TypesBody, response)).to.have.property("KpiCard");
  });

  it("refuses a caller with no session, so a visitor learns no module's block names", async () => {
    const response = await createClient().get(TYPES);

    expect(response.status).to.equal(HTTP_UNAUTHORIZED);
    expect(JSON.stringify(response.data)).to.not.contain("KpiCard");
  });
});
