import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { z } from "zod";
import { mockupNameSchema, parseMockupName, parseSpec } from "../../../mockup";
import { authorizedClient, registerUser } from "../../helpers/auth";
import { createClient } from "../../helpers/http";
import { shippedExampleSpec } from "../../helpers/mockup";
import {
  MOCKUP_API as BASE,
  serveMockupRoutes,
} from "../../helpers/mockup-routes";

const EXAMPLE = `${BASE}/example`;

const SPEC = JSON.stringify({
  version: 1,
  pages: [{ id: "home", title: "Home", tree: [] }],
});

describe("[unit] GET /api/mockup/example", () => {
  const served = serveMockupRoutes(SPEC);
  const anonymous = createClient();
  let owner: AxiosInstance;
  let member: AxiosInstance;

  before(async () => {
    ({ owner } = served());
    member = authorizedClient((await registerUser()).accessToken);
  });

  it("answers the owner the shipped example spec as written", async () => {
    const response = await owner.get(EXAMPLE);

    expect(response.status).to.equal(200);
    expect(response.data).to.deep.equal(shippedExampleSpec());
  });

  it("answers a spec that parses, and that generates its table's rows", async () => {
    const response = await owner.get(EXAMPLE);
    const read = parseSpec(JSON.stringify(response.data));

    expect(read.ok).to.equal(true);
    const fixtures = z
      .object({
        pages: z.array(
          z.object({ fixtures: z.record(z.unknown()).optional() }),
        ),
      })
      .parse(response.data).pages[0].fixtures;
    expect(fixtures).to.have.nested.property("orders.$generate.rows", 8);
  });

  it("answers 401 to a caller with no session and 403 to a member who is not the owner", async () => {
    expect((await anonymous.get(EXAMPLE)).status).to.equal(401);
    expect((await member.get(EXAMPLE)).status).to.equal(403);
  });

  it("leaves no mockup the name example", () => {
    expect(parseMockupName("example")).to.equal(undefined);
    expect(mockupNameSchema.safeParse("example").success).to.equal(false);
  });
});
