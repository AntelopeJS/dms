import { expect } from "chai";
import { z } from "zod";
import { createClient } from "../helpers/http";
import { hasOnboarded, seedUnclaimedInstance } from "../helpers/onboarding";
import { parseBody } from "../helpers/parse-body";

const HTTP_BAD_REQUEST = 400;

const IssuesBody = z.array(z.object({ path: z.array(z.string()) }));

describe("[integration] onboarding register validation", () => {
  beforeEach(() => seedUnclaimedInstance());
  after(() => seedUnclaimedInstance());

  it("answers 400 naming each invalid field, and creates nobody", async () => {
    const response = await createClient().post("/api/onboarding/register", {
      email: "not-an-email",
      firstName: "",
      lastName: "E",
      password: "WizardPass1!",
    });

    expect(response.status, JSON.stringify(response.data)).to.equal(
      HTTP_BAD_REQUEST,
    );
    const named = parseBody(IssuesBody, response).map((issue) =>
      issue.path.join("."),
    );
    expect(named).to.include.members(["email", "firstName"]);
    expect(named).to.not.include("lastName");
    expect(await hasOnboarded()).to.equal(false);
  });
});
