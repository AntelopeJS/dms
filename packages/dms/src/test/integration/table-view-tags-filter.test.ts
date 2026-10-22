import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { authorizedClient, registerUser } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

// A tags column filters the rows holding a tag (`array_contains_string`), as
// a multiple select does — over the test host's notes and their labels
// (src/test/attachment-host/archive.ts).

const LOCATION = "/api/archive/notes";
const HTTP_OK = 200;

interface Note {
  title: string;
}

describe("[integration] table view tags filter", () => {
  let client: AxiosInstance;

  before(async () => {
    await resetDatabase();
    const owner = await registerUser({ owner: true });
    client = authorizedClient(owner.accessToken);
    const notes = [
      { title: "Install", labels: ["battery specialists", "solar"] },
      { title: "Survey", labels: ["solar"] },
      { title: "Draft" },
    ];
    for (const note of notes) {
      const created = await client.post(`${LOCATION}/new`, note);
      expect(created.status, JSON.stringify(created.data)).to.equal(HTTP_OK);
    }
  });

  async function titles(filter: string): Promise<string[]> {
    const response = await client.get(`${LOCATION}/list`, {
      params: { limit: 50, filter_labels: filter },
    });
    expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
    return (response.data.results as Note[]).map((note) => note.title).sort();
  }

  it("keeps the rows holding a tag", async () => {
    expect(
      await titles("array_contains_string:battery specialists"),
    ).to.deep.equal(["Install"]);
    expect(await titles("array_contains_string:solar")).to.deep.equal([
      "Install",
      "Survey",
    ]);
  });

  it("still keeps the rows with no tag", async () => {
    expect(await titles("is_empty:")).to.deep.equal(["Draft"]);
  });
});
